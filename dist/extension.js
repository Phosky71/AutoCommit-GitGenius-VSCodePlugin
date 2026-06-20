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
function activate(context) {
    console.log('AutoCommit GitGenius is now active!');
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