import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigManager } from './config'; // <-- 1. IMPORTAMOS TU NUEVO GESTOR

export function activate(context: vscode.ExtensionContext) {
	console.log('AutoCommit GitGenius is now active!');

	// 2. INSTANCIAMOS EL GESTOR PASÁNDOLE EL CONTEXTO DE VS CODE
	const configManager = new ConfigManager(context);

	let disposable = vscode.commands.registerCommand('autocommit.start', () => {
		// 1. Crear el panel del Webview
		const panel = vscode.window.createWebviewPanel(
			'autoCommit',
			'AutoCommit',
			vscode.ViewColumn.One,
			{
				enableScripts: true, // Permitir JavaScript
				retainContextWhenHidden: true, // Evita que la app se recargue al cambiar de pestaña
				localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview'))]
			}
		);

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

		// 4. Escuchar los mensajes (tus invoke de api.js)
		panel.webview.onDidReceiveMessage(
			async (message) => {
				const { command, id, ...args } = message;

				try {
					let payload: any = null;

					// 3. REEMPLAZAMOS LOS MOCKS POR LAS LLAMADAS REALES A LA BASE DE DATOS
					switch (command) {
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

						case 'get_repos':
							const cfgRepos = await configManager.getConfig();
							payload = cfgRepos.repos || [];
							break;

						case 'get_commit_history':
							const cfgHistory = await configManager.getConfig();
							payload = cfgHistory.commit_history || [];
							break;

						// Placeholders para evitar warnings en consola mientras hacemos el módulo Git
						case 'validate_repo_path':
						case 'get_current_branch':
						case 'list_remote_branches':
						case 'get_diff_preview':
							payload = null;
							break;

						default:
							console.warn(`Comando no implementado aún: ${command}`);
					}

					// Enviar la respuesta de vuelta al frontend para resolver la Promesa
					panel.webview.postMessage({ type: 'response', id, payload });

				} catch (error: any) {
					vscode.window.showErrorMessage(`AutoCommit Error: ${error.message}`);
				}
			},
			undefined,
			context.subscriptions
		);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}