import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigManager, AppConfig, RepoEntry, CommitHistoryEntry } from './config';
import { runGit, runCommitInternal, analyzeDiff, CommitResult } from './git';

const nowUnix = () => Math.floor(Date.now() / 1000);

// --- HELPER: DETECCIÓN AUTOMÁTICA DEL REPOSITORIO DE VS CODE ---
export async function getWorkspaceRepo(configManager: ConfigManager): Promise<RepoEntry[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return [];

    const activeFolder = folders[0].uri.fsPath.replace(/\\/g, '/');
    const gitDir = path.join(activeFolder, '.git');

    // Si no tiene .git, devolvemos array vacío
    if (!fs.existsSync(gitDir)) return [];

    const config = await configManager.getConfig();
    let repo = config.repos.find(r => r.path === activeFolder);

    // Si el repo existe en la carpeta pero no en nuestra config, lo auto-registramos
    if (!repo) {
        repo = {
            id: crypto.randomUUID(),
            path: activeFolder,
            interval_minutes: config.interval_minutes || 30,
            timer_enabled: false,
            enabled: true,
            push_enabled: config.push_enabled,
            push_remote: config.push_remote || 'origin',
            push_branch: config.push_branch || 'main',
            commit_prefix: config.commit_prefix || '',
            last_commit_time: 0,
            cooldown_minutes: config.cooldown_minutes || 5
        };
        config.repos.push(repo);
        await configManager.saveConfig(config);
    }

    return [repo];
}

// --- COMANDOS PRINCIPALES ---

export async function runCommitCmd(repoPath: string, configManager: ConfigManager): Promise<CommitResult> {
    const config = await configManager.getConfig();
    const repo = config.repos.find(r => r.path === repoPath);

    const result = await runCommitInternal(
        repoPath,
        config.provider, config.llm_base_url, config.llm_model_name, config.llm_api_key || '',
        config.smart_mode, config.smart_threshold_lines,
        repo?.push_enabled ?? config.push_enabled,
        repo?.push_remote ?? config.push_remote,
        repo?.push_branch ?? config.push_branch,
        repo?.commit_prefix ?? config.commit_prefix,
        repo?.cooldown_minutes ?? config.cooldown_minutes,
        repo?.last_commit_time ?? config.last_successful_commit,
        false, config.human_in_the_loop, config.git_token || ''
    );

    if (!result.pending_approval && result.message !== "No changes to commit" && !result.message.startsWith("Cooldown")) {
        const entry: CommitHistoryEntry = {
            timestamp: nowUnix(),
            repo_path: repoPath,
            message: result.message,
            used_llm: result.used_llm,
            files_changed: result.diff_stats?.files_changed || 0,
            insertions: result.diff_stats?.insertions || 0,
            deletions: result.diff_stats?.deletions || 0,
            estimated_tokens: result.diff_stats?.estimated_tokens || 0
        };
        await pushHistory(configManager, entry, repoPath);
    }

    return result;
}

export async function confirmCommitCmd(args: any, configManager: ConfigManager): Promise<CommitResult> {
    const { path: repoPath, message, pushEnabled, usedLlm, tag } = args;
    const config = await configManager.getConfig();
    const repo = config.repos.find(r => r.path === repoPath);

    const pushRemote = repo?.push_remote || config.push_remote;
    const pushBranch = repo?.push_branch || config.push_branch;
    const gitToken = config.git_token || '';

    if (pushEnabled && !gitToken.trim()) {
        throw new Error("Git Token is required for pushing. Please add it in Settings.");
    }

    await runGit(repoPath, ['add', '.']);
    try {
        await runGit(repoPath, ['diff', '--cached', '--quiet']);
        throw new Error("No staged changes to commit");
    } catch (e: any) {
        if (e.message === "No staged changes to commit") throw e;
    }

    await runGit(repoPath, ['commit', '-m', message]);

    if (tag) await runGit(repoPath, ['tag', tag]);

    let finalMessage = message;

    if (pushEnabled) {
        try {
            const remoteUrlStr = await runGit(repoPath, ['remote', 'get-url', pushRemote]);
            let targetRemote = pushRemote;
            if (remoteUrlStr.trim().startsWith('https://')) {
                const withoutScheme = remoteUrlStr.trim().substring(8);
                const hostPath = withoutScheme.includes('@') ? withoutScheme.split('@')[1] : withoutScheme;
                targetRemote = `https://${gitToken.trim()}@${hostPath}`;
                await runGit(repoPath, ['-c', 'credential.helper=', 'push', targetRemote, pushBranch]);
            } else {
                await runGit(repoPath, ['push', targetRemote, pushBranch]);
            }

            if (tag) {
                if (targetRemote.startsWith('https://')) {
                    await runGit(repoPath, ['-c', 'credential.helper=', 'push', targetRemote, tag]);
                } else {
                    await runGit(repoPath, ['push', targetRemote, tag]);
                }
            }
        } catch {
            finalMessage += " (⚠️ Push failed: Check Token permissions)";
        }
    }

    const entry: CommitHistoryEntry = {
        timestamp: nowUnix(), repo_path: repoPath, message: finalMessage, used_llm: usedLlm,
        files_changed: 0, insertions: 0, deletions: 0, estimated_tokens: 0
    };
    await pushHistory(configManager, entry, repoPath);

    return { message: finalMessage, used_llm: usedLlm };
}

export async function getDiffPreviewCmd(repoPath: string, configManager: ConfigManager) {
    const config = await configManager.getConfig();
    let hasHead = true;
    try { await runGit(repoPath, ['rev-parse', '--verify', 'HEAD']); } catch { hasHead = false; }

    const diffOut = await runGit(repoPath, hasHead ? ['diff', 'HEAD'] : ['diff']);
    return analyzeDiff(diffOut, config.smart_threshold_lines);
}

// Historial y persistencia
async function pushHistory(configManager: ConfigManager, entry: CommitHistoryEntry, repoPath: string) {
    const config = await configManager.getConfig();
    config.commit_history.push(entry);
    if (config.commit_history.length > 1000) config.commit_history.splice(0, config.commit_history.length - 1000);

    config.last_successful_commit = nowUnix();
    const repo = config.repos.find(r => r.path === repoPath);
    if (repo) repo.last_commit_time = nowUnix();

    await configManager.saveConfig(config);
}

export async function exportHistoryCsv(configManager: ConfigManager): Promise<string> {
    const config = await configManager.getConfig();
    let csv = "timestamp,repo,message,used_llm,files_changed,insertions,deletions,est_tokens\n";
    for (const e of config.commit_history) {
        csv += `${e.timestamp},${e.repo_path.replace(/,/g, ";")},"${e.message.replace(/"/g, '""').replace(/\n/g, " ")}",${e.used_llm},${e.files_changed},${e.insertions},${e.deletions},${e.estimated_tokens}\n`;
    }
    return csv;
}

// Añade esta función al final de commands.ts
export async function initGitRepoCmd(configManager: ConfigManager): Promise<RepoEntry[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        throw new Error("No folder opened in VS Code. Please open a folder first.");
    }

    const activeFolder = folders[0].uri.fsPath.replace(/\\/g, '/');

    // Ejecutamos git init en la carpeta
    await runGit(activeFolder, ['init']);

    // Devolvemos el repositorio auto-detectado (esto lo registrará en nuestro config)
    return await getWorkspaceRepo(configManager);
}