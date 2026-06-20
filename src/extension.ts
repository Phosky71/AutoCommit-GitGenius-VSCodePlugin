import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
	console.log('AutoCommit GitGenius is now active!');

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

					// Aquí mapearemos la lógica de Rust a TypeScript
					switch (command) {
						case 'load_config_from_file':
						case 'get_config':
							// Datos mockeados para que la UI cargue sin crashear
							payload = {
								theme: 'dark',
								provider: 'lmstudio',
								repos: [],
								commit_history: []
							};
							break;
						case 'get_repos':
							payload = [];
							break;
						case 'get_commit_history':
							payload = [];
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