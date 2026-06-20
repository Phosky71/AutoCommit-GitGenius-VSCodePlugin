// Obtenemos la API de VS Code (solo se puede llamar una vez por sesión)
const vscode = acquireVsCodeApi();

// Mapa para guardar las promesas pendientes
const pendingRequests = new Map();
let requestId = 0;

// Lista de callbacks para eventos globales (como 'commit-status')
const eventListeners = {};

// Escuchar mensajes entrantes desde el backend (extension.ts)
window.addEventListener('message', event => {
    const message = event.data;

    // Si es la respuesta a una de nuestras invocaciones
    if (message.type === 'response' && pendingRequests.has(message.id)) {
        const resolve = pendingRequests.get(message.id);
        resolve(message.payload);
        pendingRequests.delete(message.id);
    }
    // Si es un evento global (como el emit de Tauri)
    else if (message.type === 'event' && eventListeners[message.eventName]) {
        eventListeners[message.eventName]({ payload: message.payload });
    }
});

// Reemplazo exacto del invoke de Tauri
export const invoke = (cmd, args = {}) => {
    return new Promise(resolve => {
        const id = ++requestId;
        pendingRequests.set(id, resolve);
        vscode.postMessage({ command: cmd, id, ...args });
    });
};

// Reemplazo exacto del listen de Tauri
export const listen = (ev, cb) => {
    eventListeners[ev] = cb;
};

export const loadConfig = () => invoke('load_config_from_file');
export const saveConfig = (config) => invoke('save_config', { config });
export const getConfig = () => invoke('get_config');
export const getProviderDefaults = (provider) => invoke('get_provider_defaults', { provider });
export const getMaskedApiKey = () => invoke('get_masked_api_key');
export const testConnection = (args) => invoke('test_connection', args);

export const getRepos = () => invoke('get_repos');
export const updateRepo = (repo) => invoke('update_repo', { repo });
export const addRepo = (repo) => invoke('add_repo', { repo });
export const removeRepo = (id) => invoke('remove_repo', { id });
export const selectDirectory = () => invoke('select_directory');
export const validateRepoPath = (path) => invoke('validate_repo_path', { path });
export const listRemoteBranches = (path) => invoke('list_remote_branches', { path });
export const getCurrentBranch = (path) => invoke('get_current_branch', { path });

export const getDiffPreview = (path) => invoke('get_diff_preview', { path });
export const dryRunCommit = (path) => invoke('dry_run_commit', { path });
export const runCommit = (path) => invoke('run_commit', { path });
export const confirmCommit = (args) => invoke('confirm_commit', args);

export const getCommitHistory = () => invoke('get_commit_history');
export const clearCommitHistory = () => invoke('clear_commit_history');
export const exportHistoryCsv = () => invoke('export_history_csv');
export const startAutoCommit = () => invoke('start_auto_commit');