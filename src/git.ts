import { execFile } from 'child_process';
import { promisify } from 'util';
import { callLlm } from './llm';
import * as path from "node:path";
import * as fs from "node:fs";

const execAsync = promisify(execFile);

export interface DiffStats {
    files_changed: number;
    insertions: number;
    deletions: number;
    is_significant: boolean;
    is_too_large: boolean;
    estimated_tokens: number;
}

export interface CommitResult {
    message: string;
    used_llm: boolean;
    diff_stats?: DiffStats;
    pending_approval?: any;
}

// Ejecutor seguro de Git
export async function runGit(cwd: string, args: string[]): Promise<string> {
    try {
        const { stdout } = await execAsync('git', args, { cwd });
        return stdout;
    } catch (error: any) {
        // execFile lanza error si el exit code no es 0
        throw new Error(error.stderr?.trim() || error.message);
    }
}

export function analyzeDiff(diff: string, thresholdLines: number): DiffStats {
    let insertions = 0;
    let deletions = 0;
    let files_changed = 0;

    const lines = diff.split('\n');
    for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) insertions++;
        else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
        else if (line.startsWith('diff --git')) files_changed++;
    }

    const total = insertions + deletions;
    const promptOverheadTokens = 95;

    return {
        files_changed,
        insertions,
        deletions,
        is_significant: total >= thresholdLines || files_changed >= 3,
        is_too_large: files_changed > 40 || total > 3000,
        estimated_tokens: Math.floor(diff.length / 4) + promptOverheadTokens
    };
}

export async function validateRepoPath(repoPath: string): Promise<boolean> {
    try {
        const gitDir = path.join(repoPath, '.git');
        const stat = await fs.promises.stat(gitDir);
        return stat.isDirectory() || stat.isFile(); // Puede ser un archivo si es un submódulo
    } catch {
        return false;
    }
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
    try {
        const output = await runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
        return output.trim();
    } catch {
        return '—';
    }
}

export async function listRemoteBranches(repoPath: string): Promise<string[]> {
    try {
        const output = await runGit(repoPath, ['branch', '-r']);
        return output
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.includes('HEAD'));
    } catch {
        return [];
    }
}

export function generateFallbackMessage(stats: DiffStats): string {
    if (stats.files_changed === 0) return "chore: minor update";
    if (stats.deletions > stats.insertions * 2) return `refactor: remove code across ${stats.files_changed} file(s)`;
    if (stats.insertions > 0 && stats.deletions === 0) return `feat: add new code in ${stats.files_changed} file(s)`;
    return `chore: update ${stats.files_changed} file(s) (+${stats.insertions} -${stats.deletions} lines)`;
}

export async function llmCommitMessage(
    provider: string, baseUrl: string, model: string, apiKey: string, diffContent: string, stats: DiffStats
): Promise<[string, boolean]> {
    const requiresApiKey = ['openai', 'groq', 'gemini', 'anthropic', 'mistral', 'together', 'openrouter'].includes(provider.toLowerCase());
    const maxDiff = requiresApiKey ? 16000 : 8000;

    const diffText = diffContent.length > maxDiff
        ? `(Diff truncated)...\n${diffContent.substring(0, maxDiff)}`
        : diffContent;

    const prompt = `Generate a commit message for these changes:\n\n${diffText}`;

    try {
        const msg = await callLlm(provider, baseUrl, model, apiKey, prompt);
        return [msg, true];
    } catch (e) {
        console.error("LLM Error:", e);
        return [generateFallbackMessage(stats), false];
    }
}

export async function runCommitInternal(
    path: string,
    provider: string, baseUrl: string, model: string, apiKey: string,
    smartMode: string, smartThresholdLines: number,
    pushEnabled: boolean, pushRemote: string, pushBranch: string,
    commitPrefix: string, cooldownMinutes: number, lastCommitTime: number,
    dryRun: boolean, humanInTheLoop: boolean, gitToken: string
): Promise<CommitResult> {

    const nowUnix = Math.floor(Date.now() / 1000);

    // 1. Cooldown
    if (!dryRun && cooldownMinutes > 0) {
        const elapsed = nowUnix - lastCommitTime;
        if (elapsed < cooldownMinutes * 60) {
            return { message: `Cooldown active: ${cooldownMinutes * 60 - elapsed}s remaining`, used_llm: false };
        }
    }

    // 2. Stage
    if (!dryRun) {
        await runGit(path, ['add', '.']);
    }

    // 3. Diff
    let hasHead = true;
    try { await runGit(path, ['rev-parse', '--verify', 'HEAD']); } catch { hasHead = false; }

    const diffArgs = dryRun
        ? (hasHead ? ['diff', 'HEAD'] : ['diff'])
        : ['diff', '--cached'];

    const diffContent = await runGit(path, diffArgs);

    if (!diffContent.trim()) {
        return { message: "No changes to commit", used_llm: false };
    }

    // 4. Analyze
    const stats = analyzeDiff(diffContent, smartThresholdLines);

    // 5. LLM Decision
    let commitMessage = "";
    let usedLlm = false;

    if (stats.is_too_large) {
        commitMessage = generateFallbackMessage(stats);
    } else {
        const sm = smartMode.toLowerCase();
        if (sm === 'never') {
            commitMessage = generateFallbackMessage(stats);
        } else if (sm === 'smart' && !stats.is_significant) {
            commitMessage = generateFallbackMessage(stats);
        } else {
            [commitMessage, usedLlm] = await llmCommitMessage(provider, baseUrl, model, apiKey, diffContent, stats);
        }
    }

    // 6. Sanitization
    let cleanLines: string[] = [];
    let isFirstTextLine = true;

    for (const line of commitMessage.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('```')) continue;

        if (isFirstTextLine && trimmed.length > 0) {
            let firstLine = trimmed;
            const lower = firstLine.toLowerCase();
            if (lower.startsWith('here is') || lower.startsWith('commit message')) {
                const idx = firstLine.indexOf(':');
                if (idx !== -1) firstLine = firstLine.substring(idx + 1).trim();
            }
            firstLine = firstLine.replace(/^["'`]+|["'`]+$/g, '');
            cleanLines.push(commitPrefix ? `${commitPrefix.trim()} ${firstLine}` : firstLine);
            isFirstTextLine = false;
        } else if (!isFirstTextLine) {
            cleanLines.push(line);
        }
    }

    let cleanMessage = cleanLines.join('\n').trim();

    // 7. Dry Run & HITL Exit
    if (dryRun) {
        return { message: `[DRY RUN]\n${cleanMessage}`, used_llm: usedLlm, diff_stats: stats };
    }

    const filesChangedList = (await runGit(path, ['diff', '--cached', '--name-only']))
        .split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const diffPreview = diffContent.split('\n').slice(0, 60).join('\n');

    if (humanInTheLoop) {
        return {
            message: cleanMessage, used_llm: usedLlm, diff_stats: stats,
            pending_approval: { message: cleanMessage, used_llm: usedLlm, diff_stats: stats, diff_preview: diffPreview, files_changed_list: filesChangedList }
        };
    }

    // 8. Commit
    await runGit(path, ['commit', '-m', cleanMessage]);

    // 9. Push
    if (pushEnabled) {
        if (!gitToken.trim()) {
            cleanMessage += " (⚠️ Push skipped: Git Token required)";
        } else {
            try {
                const remoteUrlStr = await runGit(path, ['remote', 'get-url', pushRemote]);
                const url = remoteUrlStr.trim();
                let targetRemote = pushRemote;

                if (url.startsWith('https://')) {
                    const withoutScheme = url.substring(8);
                    const hostAndPath = withoutScheme.includes('@') ? withoutScheme.split('@')[1] : withoutScheme;
                    targetRemote = `https://${gitToken.trim()}@${hostAndPath}`;

                    await runGit(path, ['-c', 'credential.helper=', 'push', targetRemote, pushBranch]);
                } else {
                    await runGit(path, ['push', targetRemote, pushBranch]);
                }
            } catch {
                cleanMessage += " (⚠️ Push failed: Invalid Token or Branch)";
            }
        }
    }

    return { message: cleanMessage, used_llm: usedLlm, diff_stats: stats };
}