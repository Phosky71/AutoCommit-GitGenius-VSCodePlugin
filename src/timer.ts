import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { runCommitInternal } from './git';
import { getWorkspaceRepo } from './commands';

let timerHandle: NodeJS.Timeout | null = null;
let currentPanel: vscode.WebviewPanel | null = null;

// Permite vincular la UI si está abierta, pero no bloquea el proceso si está cerrada
export function setTimerPanel(panel: vscode.WebviewPanel | null) {
    currentPanel = panel;
}

export async function startAutoCommit(configManager: ConfigManager) {
    if (timerHandle) return; // Si ya está corriendo, no creamos otro

    timerHandle = setInterval(async () => {
        try {
            const repos = await getWorkspaceRepo(configManager);
            if (repos.length === 0) return;

            const repo = repos[0];
            if (!repo.enabled) return;

            const now = Math.floor(Date.now() / 1000);
            const elapsedMinutes = Math.floor((now - repo.last_commit_time) / 60);

            // Respetamos el intervalo
            if (elapsedMinutes < repo.interval_minutes) return;

            let config = await configManager.getConfig();

            const result = await runCommitInternal(
                repo.path,
                config.provider, config.llm_base_url, config.llm_model_name, config.llm_api_key || '',
                config.smart_mode, config.smart_threshold_lines,
                repo.push_enabled, repo.push_remote, repo.push_branch,
                repo.commit_prefix, repo.cooldown_minutes, repo.last_commit_time,
                false, config.human_in_the_loop, config.git_token || ''
            );

            const isEmpty = result.message === "No changes to commit" || result.message.startsWith("Cooldown");

            // CRÍTICO: Volvemos a pedir la configuración para evitar sobrescribir datos
            // si el usuario los cambió durante el tiempo que tardó el LLM en responder.
            config = await configManager.getConfig();
            const configRepo = config.repos.find(r => r.path === repo.path);

            if (!isEmpty) {
                if (result.pending_approval) {
                    vscode.window.showInformationMessage(
                        'AutoCommit: Tienes un commit generado por IA esperando tu aprobación.',
                        'Revisar ahora'
                    ).then(selection => {
                        if (selection === 'Revisar ahora') {
                            if (currentPanel) currentPanel.reveal();
                            // Si la UI está cerrada, forzamos abrirla con el comando
                            else vscode.commands.executeCommand('autocommit.start');
                        }
                    });
                } else {
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
                }

                // Avisamos a la UI solo si existe y está abierta
                if (currentPanel) {
                    currentPanel.webview.postMessage({ type: 'event', eventName: 'commit-status', payload: result });
                }
            }

            // CRÍTICO: Se actualiza SIEMPRE la marca de tiempo (haya cambios o no)
            // Esto evita que entre en un bucle infinito cada 60 segundos buscando commits fantasmas.
            if (configRepo) {
                configRepo.last_commit_time = now;
            }
            await configManager.saveConfig(config);

        } catch (e: any) {
            if (currentPanel) {
                currentPanel.webview.postMessage({ type: 'event', eventName: 'commit-error', payload: e.message });
            }
        }
    }, 60000); // Se evalúa cada 60s
}

export function stopAutoCommit() {
    if (timerHandle) {
        clearInterval(timerHandle);
        timerHandle = null;
    }
}