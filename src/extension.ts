import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { ConfigManager, AppConfig } from './config';
import { callLlm } from './llm';
import { validateRepoPath, getCurrentBranch, listRemoteBranches, runCommitInternal } from './git';
import {
	getWorkspaceRepo, runCommitCmd, confirmCommitCmd, getDiffPreviewCmd,
	exportHistoryCsv, initGitRepoCmd
} from './commands';
import { startAutoCommit, stopAutoCommit, setTimerPanel } from './timer';

export function activate(context: vscode.ExtensionContext) {
	console.log('AutoCommit is now active!');
	const configManager = new ConfigManager(context);

	// 1. Iniciamos el temporizador DE FONDO globalmente.
	startAutoCommit(configManager);

	let disposable = vscode.commands.registerCommand('autocommit.start', () => {
		const panel = vscode.window.createWebviewPanel(
			'autoCommit', 'AutoCommit', vscode.ViewColumn.One,
			{ enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview'))] }
		);

		// 2. Vinculamos esta ventana UI al temporizador para que pueda recibir alertas
		setTimerPanel(panel);

		const stylePath = vscode.Uri.file(path.join(context.extensionPath, 'webview', 'style.css'));
		const mainJsPath = vscode.Uri.file(path.join(context.extensionPath, 'webview', 'js', 'main.js'));
		const styleUri = panel.webview.asWebviewUri(stylePath);
		const mainJsUri = panel.webview.asWebviewUri(mainJsPath);

		const htmlPath = path.join(context.extensionPath, 'webview', 'index.html');
		let htmlContent = fs.readFileSync(htmlPath, 'utf8');
		htmlContent = htmlContent.replace('{{styleUri}}', styleUri.toString());
		htmlContent = htmlContent.replace('{{mainJsUri}}', mainJsUri.toString());
		panel.webview.html = htmlContent;

		panel.webview.onDidReceiveMessage(async (message) => {
			const { command, id, ...args } = message;
			let payload: any = null;

			try {
				switch (command) {
					case 'load_config_from_file':
					case 'get_config': payload = await configManager.getConfig(); break;
					case 'save_config': await configManager.saveConfig(args.config); payload = { success: true }; break;
					case 'get_provider_defaults': payload = configManager.getProviderDefaults(args.provider); break;
					case 'get_masked_api_key':
						const cfgMask = await configManager.getConfig();
						payload = cfgMask.llm_api_key && cfgMask.llm_api_key.length > 4 ? `sk-...${cfgMask.llm_api_key.slice(-4)}` : '';
						break;
					case 'test_connection':
						await callLlm(args.provider, args.baseUrl, args.model, args.apiKey, "Reply with exactly the word 'Connected'.");
						payload = "Connection successful!";
						break;
					case 'get_repos': payload = await getWorkspaceRepo(configManager); break;
					case 'update_repo':
					case 'add_repo':
						const cfgUpdate = await configManager.getConfig();
						const index = cfgUpdate.repos.findIndex(r => r.id === args.repo.id || r.path === args.repo.path);
						if (index !== -1) cfgUpdate.repos[index] = args.repo; else cfgUpdate.repos.push(args.repo);
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
						const folderUri = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, title: 'Select Git Repository' });
						payload = (folderUri && folderUri.length > 0) ? folderUri[0].fsPath.replace(/\\/g, '/') : null;
						break;
					case 'validate_repo_path': payload = await validateRepoPath(args.path); break;
					case 'get_current_branch': payload = await getCurrentBranch(args.path); break;
					case 'list_remote_branches': payload = await listRemoteBranches(args.path); break;
					case 'get_diff_preview': payload = await getDiffPreviewCmd(args.path, configManager); break;
					case 'dry_run_commit':
						const cDry = await configManager.getConfig();
						const rDry = cDry.repos.find(x => x.path === args.path);
						payload = await runCommitInternal(args.path, cDry.provider, cDry.llm_base_url, cDry.llm_model_name, cDry.llm_api_key || '', cDry.smart_mode, cDry.smart_threshold_lines, rDry?.push_enabled ?? cDry.push_enabled, rDry?.push_remote ?? cDry.push_remote, rDry?.push_branch ?? cDry.push_branch, rDry?.commit_prefix ?? cDry.commit_prefix, 0, 0, true, false, cDry.git_token || '');
						break;
					case 'run_commit': payload = await runCommitCmd(args.path, configManager); break;
					case 'confirm_commit': payload = await confirmCommitCmd(args, configManager); break;
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
					case 'export_history_csv': payload = await exportHistoryCsv(configManager); break;
					case 'start_auto_commit': startAutoCommit(configManager); payload = true; break;
					case 'stop_auto_commit': stopAutoCommit(); payload = true; break;
					case 'init_git_repo': payload = await initGitRepoCmd(configManager); break;
					default: console.warn(`Command not implemented: ${command}`);
				}
				panel.webview.postMessage({ type: 'response', id, payload });
			} catch (error: any) {
				panel.webview.postMessage({ type: 'event', eventName: 'commit-error', payload: error.message || error.toString() });
				vscode.window.showErrorMessage(`AutoCommit: ${error.message}`);
			}
		}, undefined, context.subscriptions);

		panel.onDidDispose(() => {
			// 3. Cuando se cierra la UI, ¡ya no matamos el temporizador!
			// Solo lo desvinculamos de esta ventana para que siga trabajando en secreto
			setTimerPanel(null);
		}, null, context.subscriptions);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {
	// Aquí sí se apaga por completo, porque el usuario ha deshabilitado o cerrado VS Code
	stopAutoCommit();
}