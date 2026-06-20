import * as vscode from 'vscode';

export interface RepoEntry {
    id: string;
    path: string;
    interval_minutes: number;
    timer_enabled: boolean;
    enabled: boolean;
    push_enabled: boolean;
    push_remote: string;
    push_branch: string;
    commit_prefix: string;
    last_commit_time: number;
    cooldown_minutes: number;
}

export interface CommitHistoryEntry {
    timestamp: number;
    repo_path: string;
    message: string;
    used_llm: boolean;
    files_changed: number;
    insertions: number;
    deletions: number;
    estimated_tokens: number;
}

export interface AppConfig {
    interval_minutes: number;
    auto_commit_enabled: boolean;
    auto_start: boolean;
    theme: string;
    provider: string;
    llm_base_url: string;
    llm_model_name: string;
    smart_mode: string;
    smart_threshold_lines: number;
    push_enabled: boolean;
    push_remote: string;
    push_branch: string;
    commit_prefix: string;
    cooldown_minutes: number;
    human_in_the_loop: boolean;
    last_successful_commit: number;
    repos: RepoEntry[];
    commit_history: CommitHistoryEntry[];
    llm_api_key?: string;
    git_token?: string;
}

const DEFAULT_CONFIG: AppConfig = {
    interval_minutes: 30,
    auto_commit_enabled: false,
    auto_start: false,
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

export class ConfigManager {
    constructor(private context: vscode.ExtensionContext) {}

    // Equivalente a load_config_from_file / get_config
    async getConfig(): Promise<AppConfig> {
        // Leemos la configuración plana
        const config = this.context.globalState.get<AppConfig>('autocommit_config', DEFAULT_CONFIG);

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
    async saveConfig(newConfig: AppConfig): Promise<void> {
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
    getProviderDefaults(provider: string): [string, string] {
        const defaults: Record<string, [string, string]> = {
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