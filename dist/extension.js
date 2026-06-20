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
const config_1 = __webpack_require__(4); // <-- 1. IMPORTAMOS TU NUEVO GESTOR
function activate(context) {
    console.log('AutoCommit GitGenius is now active!');
    // 2. INSTANCIAMOS EL GESTOR PASÁNDOLE EL CONTEXTO DE VS CODE
    const configManager = new config_1.ConfigManager(context);
    let disposable = vscode.commands.registerCommand('autocommit.start', () => {
        // 1. Crear el panel del Webview
        const panel = vscode.window.createWebviewPanel('autoCommit', 'AutoCommit', vscode.ViewColumn.One, {
            enableScripts: true, // Permitir JavaScript
            retainContextWhenHidden: true, // Evita que la app se recargue al cambiar de pestaña
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
        // 4. Escuchar los mensajes (tus invoke de api.js)
        panel.webview.onDidReceiveMessage(async (message) => {
            const { command, id, ...args } = message;
            try {
                let payload = null;
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
            }
            catch (error) {
                vscode.window.showErrorMessage(`AutoCommit Error: ${error.message}`);
            }
        }, undefined, context.subscriptions);
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }


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