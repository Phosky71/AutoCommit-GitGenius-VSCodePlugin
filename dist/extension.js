/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(__webpack_require__(1));
const path = __importStar(__webpack_require__(2));
const fs = __importStar(__webpack_require__(3));
// Importamos todos los módulos que hemos creado
const config_1 = __webpack_require__(4);
const llm_1 = __webpack_require__(5);
const git_1 = __webpack_require__(6);
const commands_1 = __webpack_require__(9);
const timer_1 = __webpack_require__(10);
function activate(context) {
    console.log('AutoCommit is now active!');
    const configManager = new config_1.ConfigManager(context);
    let disposable = vscode.commands.registerCommand('autocommit.start', () => {
        // 1. Crear el panel del Webview
        const panel = vscode.window.createWebviewPanel('autoCommit', 'AutoCommit', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview'))]
        });
        // 2. Obtener rutas seguras para los archivos estáticos
        const stylePath = vscode.Uri.file(path.join(context.extensionPath, 'webview', 'style.css'));
        const mainJsPath = vscode.Uri.file(path.join(context.extensionPath, 'webview', 'js', 'main.js'));
        const styleUri = panel.webview.asWebviewUri(stylePath);
        const mainJsUri = panel.webview.asWebviewUri(mainJsPath);
        // 3. Leer e inyectar el HTML
        const htmlPath = path.join(context.extensionPath, 'webview', 'index.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        htmlContent = htmlContent.replace('{{styleUri}}', styleUri.toString());
        htmlContent = htmlContent.replace('{{mainJsUri}}', mainJsUri.toString());
        panel.webview.html = htmlContent;
        // 4. Escuchar los mensajes desde api.js
        panel.webview.onDidReceiveMessage(async (message) => {
            const { command, id, ...args } = message;
            let payload = null;
            try {
                switch (command) {
                    // --- CONFIGURACIÓN ---
                    case 'load_config_from_file':
                    case 'get_config':
                        payload = await configManager.getConfig();
                        break;
                    case 'save_config':
                        await configManager.saveConfig(args.config);
                        payload = { success: true };
                        break;
                    case 'get_provider_defaults':
                        payload = configManager.getProviderDefaults(args.provider);
                        break;
                    case 'get_masked_api_key':
                        const cfgMask = await configManager.getConfig();
                        const key = cfgMask.llm_api_key || '';
                        payload = key.length > 4 ? `sk-...${key.slice(-4)}` : '';
                        break;
                    case 'test_connection':
                        await (0, llm_1.callLlm)(args.provider, args.baseUrl, args.model, args.apiKey, "Reply with exactly the word 'Connected'.");
                        payload = "Connection successful!";
                        break;
                    // --- REPOSITORIOS (Workspace-centric) ---
                    case 'get_repos':
                        // Devuelve el repositorio de la carpeta abierta en VS Code
                        payload = await (0, commands_1.getWorkspaceRepo)(configManager);
                        break;
                    case 'update_repo':
                    case 'add_repo':
                        const cfgUpdate = await configManager.getConfig();
                        const index = cfgUpdate.repos.findIndex(r => r.id === args.repo.id || r.path === args.repo.path);
                        if (index !== -1) {
                            cfgUpdate.repos[index] = args.repo;
                        }
                        else {
                            cfgUpdate.repos.push(args.repo);
                        }
                        await configManager.saveConfig(cfgUpdate);
                        payload = { success: true };
                        break;
                    case 'remove_repo':
                        const cfgRemove = await configManager.getConfig();
                        cfgRemove.repos = cfgRemove.repos.filter(r => r.id !== args.id);
                        await configManager.saveConfig(cfgRemove);
                        payload = { success: true };
                        break;
                    case 'select_directory':
                        const folderUri = await vscode.window.showOpenDialog({
                            canSelectFiles: false, canSelectFolders: true, canSelectMany: false, title: 'Select Git Repository'
                        });
                        payload = (folderUri && folderUri.length > 0) ? folderUri[0].fsPath.replace(/\\/g, '/') : null;
                        break;
                    case 'validate_repo_path':
                        payload = await (0, git_1.validateRepoPath)(args.path);
                        break;
                    case 'get_current_branch':
                        payload = await (0, git_1.getCurrentBranch)(args.path);
                        break;
                    case 'list_remote_branches':
                        payload = await (0, git_1.listRemoteBranches)(args.path);
                        break;
                    // --- COMMITS Y DIFFS ---
                    case 'get_diff_preview':
                        payload = await (0, commands_1.getDiffPreviewCmd)(args.path, configManager);
                        break;
                    case 'dry_run_commit':
                        const cDry = await configManager.getConfig();
                        const rDry = cDry.repos.find(x => x.path === args.path);
                        payload = await (0, git_1.runCommitInternal)(args.path, cDry.provider, cDry.llm_base_url, cDry.llm_model_name, cDry.llm_api_key || '', cDry.smart_mode, cDry.smart_threshold_lines, rDry?.push_enabled ?? cDry.push_enabled, rDry?.push_remote ?? cDry.push_remote, rDry?.push_branch ?? cDry.push_branch, rDry?.commit_prefix ?? cDry.commit_prefix, 0, 0, true, false, cDry.git_token || '' // dryRun = true
                        );
                        break;
                    case 'run_commit':
                        payload = await (0, commands_1.runCommitCmd)(args.path, configManager);
                        break;
                    case 'confirm_commit':
                        payload = await (0, commands_1.confirmCommitCmd)(args, configManager);
                        break;
                    // --- HISTORIAL ---
                    case 'get_commit_history':
                        const cfgHistory = await configManager.getConfig();
                        payload = cfgHistory.commit_history ? [...cfgHistory.commit_history].reverse() : [];
                        break;
                    case 'clear_commit_history':
                        const cfgClear = await configManager.getConfig();
                        cfgClear.commit_history = [];
                        await configManager.saveConfig(cfgClear);
                        payload = true;
                        break;
                    case 'export_history_csv':
                        payload = await (0, commands_1.exportHistoryCsv)(configManager);
                        break;
                    // --- TIMER (BACKGROUND PROCESS) ---
                    case 'start_auto_commit':
                        await (0, timer_1.startAutoCommit)(configManager, panel);
                        payload = true;
                        break;
                    case 'stop_auto_commit':
                        (0, timer_1.stopAutoCommit)();
                        payload = true;
                        break;
                    case 'init_git_repo':
                        payload = await (0, commands_1.initGitRepoCmd)(configManager);
                        break;
                    default:
                        console.warn(`Command not implemented: ${command}`);
                }
                // Devolver éxito al frontend
                panel.webview.postMessage({ type: 'response', id, payload });
            }
            catch (error) {
                console.error(`Error in ${command}:`, error);
                // Emitir rechazo para que el frontend no se quede colgado esperando
                panel.webview.postMessage({ type: 'event', eventName: 'commit-error', payload: error.message || error.toString() });
                // Aseguramos que la promesa en UI no quede en el limbo devolviendo un error controlado
                // Si falla un comando crucial que el UI espera (como dry_run), forzamos un rechazo estructurado si es necesario.
                vscode.window.showErrorMessage(`AutoCommit: ${error.message}`);
            }
        }, undefined, context.subscriptions);
        // Cuando se cierre el panel, matamos el timer para no dejar procesos huérfanos
        panel.onDidDispose(() => {
            (0, timer_1.stopAutoCommit)();
        }, null, context.subscriptions);
    });
    context.subscriptions.push(disposable);
}
function deactivate() {
    (0, timer_1.stopAutoCommit)();
}


/***/ }),
/* 1 */
/***/ ((module) => {

module.exports = require("vscode");

/***/ }),
/* 2 */
/***/ ((module) => {

module.exports = require("path");

/***/ }),
/* 3 */
/***/ ((module) => {

module.exports = require("fs");

/***/ }),
/* 4 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConfigManager = void 0;
// Valores por defecto idénticos a los de tu config.rs
const DEFAULT_CONFIG = {
    theme: 'dark',
    provider: 'lmstudio',
    llm_base_url: 'http://localhost:1234/v1',
    llm_model_name: 'local-model',
    smart_mode: 'smart',
    smart_threshold_lines: 10,
    push_enabled: true,
    push_remote: 'origin',
    push_branch: 'main',
    commit_prefix: '',
    cooldown_minutes: 5,
    human_in_the_loop: true,
    last_successful_commit: 0,
    repos: [],
    commit_history: []
};
class ConfigManager {
    context;
    constructor(context) {
        this.context = context;
    }
    // Equivalente a load_config_from_file / get_config
    async getConfig() {
        // Leemos la configuración plana
        const config = this.context.globalState.get('autocommit_config', DEFAULT_CONFIG);
        // Recuperamos los secretos desencriptados
        const apiKey = await this.context.secrets.get('llm_api_key');
        const gitToken = await this.context.secrets.get('git_token');
        return {
            ...config,
            llm_api_key: apiKey || '',
            git_token: gitToken || ''
        };
    }
    // Equivalente a save_config
    async saveConfig(newConfig) {
        // Destructuramos para separar las contraseñas del resto de la configuración
        const { llm_api_key, git_token, ...safeConfig } = newConfig;
        // Guardamos la configuración normal en texto plano
        await this.context.globalState.update('autocommit_config', safeConfig);
        // Guardamos las contraseñas en el almacén seguro del sistema
        if (llm_api_key !== undefined) {
            await this.context.secrets.store('llm_api_key', llm_api_key);
        }
        if (git_token !== undefined) {
            await this.context.secrets.store('git_token', git_token);
        }
    }
    // Equivalente a tu LlmProvider.default_base_url() y default_model()
    getProviderDefaults(provider) {
        const defaults = {
            'lmstudio': ['http://localhost:1234/v1', 'local-model'],
            'ollama': ['http://localhost:11434/v1', 'llama3.2'],
            'openai': ['https://api.openai.com/v1', 'gpt-4o-mini'],
            'anthropic': ['https://api.anthropic.com/v1', 'claude-3-5-haiku-20241022'],
            'gemini': ['https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-2.0-flash'],
            'openrouter': ['https://openrouter.ai/api/v1', 'openai/gpt-4o-mini'],
            'groq': ['https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'],
            'mistral': ['https://api.mistral.ai/v1', 'mistral-small-latest'],
            'custom': ['http://localhost:8000/v1', 'local-model']
        };
        return defaults[provider.toLowerCase()] || defaults['lmstudio'];
    }
}
exports.ConfigManager = ConfigManager;


/***/ }),
/* 5 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.callLlm = callLlm;
const SYSTEM_PROMPT = `
You are an expert developer and a strict Git commit message generator.
Analyze the diff and generate a comprehensive commit message using the Conventional Commits standard.

RULES:
1. The FIRST LINE must be the title: <type>(<scope>): <description> (under 72 characters).
2. Valid types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
3. The title description MUST focus on the WHY and the IMPACT of the change.
4. If multiple files/modules are changed, you MUST add a blank line after the title, followed by a bulleted list explaining what was changed in each file/module.
5. NEVER wrap the output in quotes, backticks, code blocks, or markdown (\`\`\`).
6. NEVER output conversational text like "Here is your message".
`;
async function callLlm(provider, baseUrl, model, apiKey, userContent) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // 45s timeout
    try {
        const isAnthropic = provider.toLowerCase() === 'anthropic';
        const endpoint = isAnthropic
            ? `${baseUrl.replace(/\/$/, '')}/messages`
            : `${baseUrl.replace(/\/$/, '')}/chat/completions`;
        const headers = {
            'Content-Type': 'application/json'
        };
        let body;
        if (isAnthropic) {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
            body = {
                model,
                system: SYSTEM_PROMPT,
                max_tokens: 256,
                messages: [{ role: 'user', content: userContent }]
            };
        }
        else {
            if (apiKey)
                headers['Authorization'] = `Bearer ${apiKey}`;
            if (provider.toLowerCase() === 'openrouter') {
                headers['HTTP-Referer'] = 'vscode-autocommit';
                headers['X-Title'] = 'Auto Commit';
            }
            body = {
                model,
                temperature: 0.3,
                max_tokens: 256,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userContent }
                ]
            };
        }
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`LLM API error (HTTP ${response.status}): ${errText}`);
        }
        const data = await response.json();
        if (isAnthropic) {
            if (!data.content || !data.content.length)
                throw new Error('Anthropic returned empty content');
            return data.content[0].text;
        }
        else {
            if (!data.choices || !data.choices.length)
                throw new Error('LLM returned no choices');
            return data.choices[0].message.content;
        }
    }
    finally {
        clearTimeout(timeout);
    }
}


/***/ }),
/* 6 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.runGit = runGit;
exports.analyzeDiff = analyzeDiff;
exports.generateFallbackMessage = generateFallbackMessage;
exports.llmCommitMessage = llmCommitMessage;
exports.runCommitInternal = runCommitInternal;
const child_process_1 = __webpack_require__(7);
const util_1 = __webpack_require__(8);
const llm_1 = __webpack_require__(5);
const execAsync = (0, util_1.promisify)(child_process_1.execFile);
// Ejecutor seguro de Git
async function runGit(cwd, args) {
    try {
        const { stdout } = await execAsync('git', args, { cwd });
        return stdout;
    }
    catch (error) {
        // execFile lanza error si el exit code no es 0
        throw new Error(error.stderr?.trim() || error.message);
    }
}
function analyzeDiff(diff, thresholdLines) {
    let insertions = 0;
    let deletions = 0;
    let files_changed = 0;
    const lines = diff.split('\n');
    for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++'))
            insertions++;
        else if (line.startsWith('-') && !line.startsWith('---'))
            deletions++;
        else if (line.startsWith('diff --git'))
            files_changed++;
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
function generateFallbackMessage(stats) {
    if (stats.files_changed === 0)
        return "chore: minor update";
    if (stats.deletions > stats.insertions * 2)
        return `refactor: remove code across ${stats.files_changed} file(s)`;
    if (stats.insertions > 0 && stats.deletions === 0)
        return `feat: add new code in ${stats.files_changed} file(s)`;
    return `chore: update ${stats.files_changed} file(s) (+${stats.insertions} -${stats.deletions} lines)`;
}
async function llmCommitMessage(provider, baseUrl, model, apiKey, diffContent, stats) {
    const requiresApiKey = ['openai', 'groq', 'gemini', 'anthropic', 'mistral', 'together', 'openrouter'].includes(provider.toLowerCase());
    const maxDiff = requiresApiKey ? 16000 : 8000;
    const diffText = diffContent.length > maxDiff
        ? `(Diff truncated)...\n${diffContent.substring(0, maxDiff)}`
        : diffContent;
    const prompt = `Generate a commit message for these changes:\n\n${diffText}`;
    try {
        const msg = await (0, llm_1.callLlm)(provider, baseUrl, model, apiKey, prompt);
        return [msg, true];
    }
    catch (e) {
        console.error("LLM Error:", e);
        return [generateFallbackMessage(stats), false];
    }
}
async function runCommitInternal(path, provider, baseUrl, model, apiKey, smartMode, smartThresholdLines, pushEnabled, pushRemote, pushBranch, commitPrefix, cooldownMinutes, lastCommitTime, dryRun, humanInTheLoop, gitToken) {
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
    try {
        await runGit(path, ['rev-parse', '--verify', 'HEAD']);
    }
    catch {
        hasHead = false;
    }
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
    }
    else {
        const sm = smartMode.toLowerCase();
        if (sm === 'never') {
            commitMessage = generateFallbackMessage(stats);
        }
        else if (sm === 'smart' && !stats.is_significant) {
            commitMessage = generateFallbackMessage(stats);
        }
        else {
            [commitMessage, usedLlm] = await llmCommitMessage(provider, baseUrl, model, apiKey, diffContent, stats);
        }
    }
    // 6. Sanitization
    let cleanLines = [];
    let isFirstTextLine = true;
    for (const line of commitMessage.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('```'))
            continue;
        if (isFirstTextLine && trimmed.length > 0) {
            let firstLine = trimmed;
            const lower = firstLine.toLowerCase();
            if (lower.startsWith('here is') || lower.startsWith('commit message')) {
                const idx = firstLine.indexOf(':');
                if (idx !== -1)
                    firstLine = firstLine.substring(idx + 1).trim();
            }
            firstLine = firstLine.replace(/^["'`]+|["'`]+$/g, '');
            cleanLines.push(commitPrefix ? `${commitPrefix.trim()} ${firstLine}` : firstLine);
            isFirstTextLine = false;
        }
        else if (!isFirstTextLine) {
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
        }
        else {
            try {
                const remoteUrlStr = await runGit(path, ['remote', 'get-url', pushRemote]);
                const url = remoteUrlStr.trim();
                let targetRemote = pushRemote;
                if (url.startsWith('https://')) {
                    const withoutScheme = url.substring(8);
                    const hostAndPath = withoutScheme.includes('@') ? withoutScheme.split('@')[1] : withoutScheme;
                    targetRemote = `https://${gitToken.trim()}@${hostAndPath}`;
                    await runGit(path, ['-c', 'credential.helper=', 'push', targetRemote, pushBranch]);
                }
                else {
                    await runGit(path, ['push', targetRemote, pushBranch]);
                }
            }
            catch {
                cleanMessage += " (⚠️ Push failed: Invalid Token or Branch)";
            }
        }
    }
    return { message: cleanMessage, used_llm: usedLlm, diff_stats: stats };
}


/***/ }),
/* 7 */
/***/ ((module) => {

module.exports = require("child_process");

/***/ }),
/* 8 */
/***/ ((module) => {

module.exports = require("util");

/***/ }),
/* 9 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getWorkspaceRepo = getWorkspaceRepo;
exports.runCommitCmd = runCommitCmd;
exports.confirmCommitCmd = confirmCommitCmd;
exports.getDiffPreviewCmd = getDiffPreviewCmd;
exports.exportHistoryCsv = exportHistoryCsv;
exports.initGitRepoCmd = initGitRepoCmd;
const vscode = __importStar(__webpack_require__(1));
const path = __importStar(__webpack_require__(2));
const fs = __importStar(__webpack_require__(3));
const git_1 = __webpack_require__(6);
const nowUnix = () => Math.floor(Date.now() / 1000);
// --- HELPER: DETECCIÓN AUTOMÁTICA DEL REPOSITORIO DE VS CODE ---
async function getWorkspaceRepo(configManager) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0)
        return [];
    const activeFolder = folders[0].uri.fsPath.replace(/\\/g, '/');
    const gitDir = path.join(activeFolder, '.git');
    // Si no tiene .git, devolvemos array vacío
    if (!fs.existsSync(gitDir))
        return [];
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
async function runCommitCmd(repoPath, configManager) {
    const config = await configManager.getConfig();
    const repo = config.repos.find(r => r.path === repoPath);
    const result = await (0, git_1.runCommitInternal)(repoPath, config.provider, config.llm_base_url, config.llm_model_name, config.llm_api_key || '', config.smart_mode, config.smart_threshold_lines, repo?.push_enabled ?? config.push_enabled, repo?.push_remote ?? config.push_remote, repo?.push_branch ?? config.push_branch, repo?.commit_prefix ?? config.commit_prefix, repo?.cooldown_minutes ?? config.cooldown_minutes, repo?.last_commit_time ?? config.last_successful_commit, false, config.human_in_the_loop, config.git_token || '');
    if (!result.pending_approval && result.message !== "No changes to commit" && !result.message.startsWith("Cooldown")) {
        const entry = {
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
async function confirmCommitCmd(args, configManager) {
    const { path: repoPath, message, pushEnabled, usedLlm, tag } = args;
    const config = await configManager.getConfig();
    const repo = config.repos.find(r => r.path === repoPath);
    const pushRemote = repo?.push_remote || config.push_remote;
    const pushBranch = repo?.push_branch || config.push_branch;
    const gitToken = config.git_token || '';
    if (pushEnabled && !gitToken.trim()) {
        throw new Error("Git Token is required for pushing. Please add it in Settings.");
    }
    await (0, git_1.runGit)(repoPath, ['add', '.']);
    try {
        await (0, git_1.runGit)(repoPath, ['diff', '--cached', '--quiet']);
        throw new Error("No staged changes to commit");
    }
    catch (e) {
        if (e.message === "No staged changes to commit")
            throw e;
    }
    await (0, git_1.runGit)(repoPath, ['commit', '-m', message]);
    if (tag)
        await (0, git_1.runGit)(repoPath, ['tag', tag]);
    let finalMessage = message;
    if (pushEnabled) {
        try {
            const remoteUrlStr = await (0, git_1.runGit)(repoPath, ['remote', 'get-url', pushRemote]);
            let targetRemote = pushRemote;
            if (remoteUrlStr.trim().startsWith('https://')) {
                const withoutScheme = remoteUrlStr.trim().substring(8);
                const hostPath = withoutScheme.includes('@') ? withoutScheme.split('@')[1] : withoutScheme;
                targetRemote = `https://${gitToken.trim()}@${hostPath}`;
                await (0, git_1.runGit)(repoPath, ['-c', 'credential.helper=', 'push', targetRemote, pushBranch]);
            }
            else {
                await (0, git_1.runGit)(repoPath, ['push', targetRemote, pushBranch]);
            }
            if (tag) {
                if (targetRemote.startsWith('https://')) {
                    await (0, git_1.runGit)(repoPath, ['-c', 'credential.helper=', 'push', targetRemote, tag]);
                }
                else {
                    await (0, git_1.runGit)(repoPath, ['push', targetRemote, tag]);
                }
            }
        }
        catch {
            finalMessage += " (⚠️ Push failed: Check Token permissions)";
        }
    }
    const entry = {
        timestamp: nowUnix(), repo_path: repoPath, message: finalMessage, used_llm: usedLlm,
        files_changed: 0, insertions: 0, deletions: 0, estimated_tokens: 0
    };
    await pushHistory(configManager, entry, repoPath);
    return { message: finalMessage, used_llm: usedLlm };
}
async function getDiffPreviewCmd(repoPath, configManager) {
    const config = await configManager.getConfig();
    let hasHead = true;
    try {
        await (0, git_1.runGit)(repoPath, ['rev-parse', '--verify', 'HEAD']);
    }
    catch {
        hasHead = false;
    }
    const diffOut = await (0, git_1.runGit)(repoPath, hasHead ? ['diff', 'HEAD'] : ['diff']);
    return (0, git_1.analyzeDiff)(diffOut, config.smart_threshold_lines);
}
// Historial y persistencia
async function pushHistory(configManager, entry, repoPath) {
    const config = await configManager.getConfig();
    config.commit_history.push(entry);
    if (config.commit_history.length > 1000)
        config.commit_history.splice(0, config.commit_history.length - 1000);
    config.last_successful_commit = nowUnix();
    const repo = config.repos.find(r => r.path === repoPath);
    if (repo)
        repo.last_commit_time = nowUnix();
    await configManager.saveConfig(config);
}
async function exportHistoryCsv(configManager) {
    const config = await configManager.getConfig();
    let csv = "timestamp,repo,message,used_llm,files_changed,insertions,deletions,est_tokens\n";
    for (const e of config.commit_history) {
        csv += `${e.timestamp},${e.repo_path.replace(/,/g, ";")},"${e.message.replace(/"/g, '""').replace(/\n/g, " ")}",${e.used_llm},${e.files_changed},${e.insertions},${e.deletions},${e.estimated_tokens}\n`;
    }
    return csv;
}
// Añade esta función al final de commands.ts
async function initGitRepoCmd(configManager) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        throw new Error("No folder opened in VS Code. Please open a folder first.");
    }
    const activeFolder = folders[0].uri.fsPath.replace(/\\/g, '/');
    // Ejecutamos git init en la carpeta
    await (0, git_1.runGit)(activeFolder, ['init']);
    // Devolvemos el repositorio auto-detectado (esto lo registrará en nuestro config)
    return await getWorkspaceRepo(configManager);
}


/***/ }),
/* 10 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.startAutoCommit = startAutoCommit;
exports.stopAutoCommit = stopAutoCommit;
const git_1 = __webpack_require__(6);
const commands_1 = __webpack_require__(9);
let timerHandle = null;
async function startAutoCommit(configManager, panel) {
    if (timerHandle)
        throw new Error("Timer is already running");
    // Evaluamos cada minuto
    timerHandle = setInterval(async () => {
        try {
            const repos = await (0, commands_1.getWorkspaceRepo)(configManager);
            if (repos.length === 0)
                return; // No hay repo activo
            const repo = repos[0];
            if (!repo.enabled || !repo.timer_enabled)
                return;
            const now = Math.floor(Date.now() / 1000);
            const elapsedMinutes = Math.floor((now - repo.last_commit_time) / 60);
            if (elapsedMinutes < repo.interval_minutes)
                return;
            const config = await configManager.getConfig();
            const result = await (0, git_1.runCommitInternal)(repo.path, config.provider, config.llm_base_url, config.llm_model_name, config.llm_api_key || '', config.smart_mode, config.smart_threshold_lines, repo.push_enabled, repo.push_remote, repo.push_branch, repo.commit_prefix, repo.cooldown_minutes, repo.last_commit_time, false, config.human_in_the_loop, config.git_token || '');
            const isEmpty = result.message === "No changes to commit" || result.message.startsWith("Cooldown");
            if (!isEmpty) {
                // Si requiere aprobación manual, mostramos/enfocamos el panel
                if (result.pending_approval) {
                    panel.reveal();
                }
                else {
                    // Si fue silencioso, actualizamos historial
                    config.commit_history.push({
                        timestamp: now,
                        repo_path: repo.path,
                        message: result.message,
                        used_llm: result.used_llm,
                        files_changed: result.diff_stats?.files_changed || 0,
                        insertions: result.diff_stats?.insertions || 0,
                        deletions: result.diff_stats?.deletions || 0,
                        estimated_tokens: result.diff_stats?.estimated_tokens || 0
                    });
                    repo.last_commit_time = now;
                    await configManager.saveConfig(config);
                }
                // Disparamos el evento al frontend
                panel.webview.postMessage({ type: 'event', eventName: 'commit-status', payload: result });
            }
        }
        catch (e) {
            panel.webview.postMessage({ type: 'event', eventName: 'commit-error', payload: e.message });
        }
    }, 60000); // 60 segundos
}
function stopAutoCommit() {
    if (timerHandle) {
        clearInterval(timerHandle);
        timerHandle = null;
    }
}


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(0);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=extension.js.map