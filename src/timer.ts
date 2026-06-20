import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { runCommitInternal } from './git';
import { getWorkspaceRepo } from './commands';

let timerHandle: NodeJS.Timeout | null = null;

export async function startAutoCommit(configManager: ConfigManager, panel: vscode.WebviewPanel) {
    if (timerHandle) throw new Error("Timer is already running");

    // Evaluamos cada minuto
    // En backend: timer.ts

    timerHandle = setInterval(async () => {
        try {
            const repos = await getWorkspaceRepo(configManager);
            if (repos.length === 0) return; // No hay repo activo

            const repo = repos[0];

            // FIX 1: Eliminar el chequeo de timer_enabled. Nos basamos solo en la UI.
            if (!repo.enabled) return;

            const now = Math.floor(Date.now() / 1000);
            const elapsedMinutes = Math.floor((now - repo.last_commit_time) / 60);

            if (elapsedMinutes < repo.interval_minutes) return;

            const config = await configManager.getConfig();

            const result = await runCommitInternal(
                repo.path,
                config.provider, config.llm_base_url, config.llm_model_name, config.llm_api_key || '',
                config.smart_mode, config.smart_threshold_lines,
                repo.push_enabled, repo.push_remote, repo.push_branch,
                repo.commit_prefix, repo.cooldown_minutes, repo.last_commit_time,
                false, config.human_in_the_loop, config.git_token || ''
            );

            const isEmpty = result.message === "No changes to commit" || result.message.startsWith("Cooldown");

            if (!isEmpty) {
                if (result.pending_approval) {
                    vscode.window.showInformationMessage(
                        'AutoCommit: Tienes un commit generado por IA esperando tu aprobación.',
                        'Revisar ahora'
                    ).then(selection => {
                        if (selection === 'Revisar ahora') {
                            panel.reveal(); // Solo abrimos el panel si el usuario hace clic en el botón
                        }
                    });

                    // Actualizamos el tiempo igualmente para que no entre en bucle
                    repo.last_commit_time = now;
                    await configManager.saveConfig(config);
                } else {
                    // Si es modo silencioso, guardamos el historial como siempre
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

                // Disparamos el evento al frontend para abrir el modal o la notificación
                panel.webview.postMessage({ type: 'event', eventName: 'commit-status', payload: result });
            }

        } catch (e: any) {
            panel.webview.postMessage({ type: 'event', eventName: 'commit-error', payload: e.message });
        }
    }, 60000);
}

export function stopAutoCommit() {
    if (timerHandle) {
        clearInterval(timerHandle);
        timerHandle = null;
    }
}