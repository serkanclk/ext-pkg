"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportPanel = void 0;
const vscode = __importStar(require("vscode"));
class ExportPanel {
    extensionUri;
    panel;
    resolvePromise;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    async show() {
        this.panel = vscode.window.createWebviewPanel('ingSqlExport', 'Export Settings', vscode.ViewColumn.Active, {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        });
        this.panel.webview.html = this.getHtmlContent();
        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'browseFolder':
                    await this.handleBrowseFolder();
                    break;
                case 'export':
                    if (this.resolvePromise) {
                        this.resolvePromise(message.data);
                        this.resolvePromise = undefined;
                    }
                    this.panel?.dispose();
                    break;
                case 'cancel':
                    if (this.resolvePromise) {
                        this.resolvePromise(undefined);
                        this.resolvePromise = undefined;
                    }
                    this.panel?.dispose();
                    break;
            }
        }, undefined);
        this.panel.onDidDispose(() => {
            if (this.resolvePromise) {
                this.resolvePromise(undefined);
            }
            this.panel = undefined;
        });
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
        });
    }
    async handleBrowseFolder() {
        const uri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Export Folder'
        });
        if (uri && uri.length > 0 && this.panel) {
            this.panel.webview.postMessage({ type: 'folderSelected', path: uri[0].fsPath });
        }
    }
    getHtmlContent() {
        // Generate default filename with timestamp
        const now = new Date();
        const ts = now.getFullYear().toString() +
            (now.getMonth() + 1).toString().padStart(2, '0') +
            now.getDate().toString().padStart(2, '0') + '_' +
            now.getHours().toString().padStart(2, '0') +
            now.getMinutes().toString().padStart(2, '0') +
            now.getSeconds().toString().padStart(2, '0');
        const defaultFileName = `export_${ts}`;
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Export</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            box-sizing: border-box;
        }
        
        /* Layout */
        .header {
            padding: 16px 20px;
            font-size: 16px;
            font-weight: 600;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .content {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        }
        
        .footer {
            padding: 12px 20px;
            border-top: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            background-color: var(--vscode-editor-background);
        }

        /* Form Controls */
        .form-group {
            margin-bottom: 16px;
            display: flex;
            flex-direction: column;
        }

        .form-row {
            display: flex;
            gap: 20px;
            margin-bottom: 16px;
        }
        .form-row .form-group {
            flex: 1;
            margin-bottom: 0;
        }

        label {
            margin-bottom: 6px;
            font-size: 13px;
            color: var(--vscode-foreground);
            font-weight: 500;
        }

        select, input[type="text"] {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent);
            padding: 6px 8px;
            font-size: 13px;
            border-radius: 2px;
            width: 100%;
            box-sizing: border-box;
            outline: none;
        }
        
        select:focus, input[type="text"]:focus {
            border-color: var(--vscode-focusBorder);
        }
        
        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 16px;
        }
        
        .checkbox-group input[type="checkbox"] {
            margin: 0;
        }
        
        .checkbox-group label {
            margin: 0;
            font-weight: normal;
        }

        /* Filename + extension display */
        .filename-group {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .filename-group input[type="text"] {
            flex: 1;
        }
        .filename-ext {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            padding: 6px 0;
        }

        /* Path input group */
        .path-input-group {
            display: flex;
            gap: 8px;
        }
        .path-input-group input[type="text"] {
            flex: 1;
        }

        /* Acknowledgment notice */
        .notice {
            margin-top: 8px;
            border-top: 1px solid var(--vscode-panel-border);
            padding-top: 14px;
            display: flex;
            align-items: flex-start;
            gap: 8px;
        }
        .notice-icon {
            font-size: 14px;
            flex-shrink: 0;
            margin-top: 1px;
        }
        .notice-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
        }

        /* Buttons */
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 14px;
            font-size: 13px;
            cursor: pointer;
            border-radius: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: transparent;
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid transparent;
        }
        
        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <div class="header">
        Export & Download
    </div>
    
    <div class="content">
        <div class="form-group">
            <label for="format">Format:</label>
            <select id="format">
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (XLSX)</option>
                <option value="json">JSON</option>
                <option value="xml">XML</option>
                <option value="sql">SQL INSERT</option>
                <option value="html">HTML</option>
            </select>
        </div>

        <div id="csv-options">
            <div class="form-group">
                <label for="lineTerminator">Line Terminator:</label>
                <select id="lineTerminator">
                    <option value="unix">Unix/Mac LF</option>
                    <option value="win">Windows CRLF</option>
                </select>
            </div>

            <div class="checkbox-group">
                <input type="checkbox" id="header" checked>
                <label for="header">Header</label>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="leftEnclosure">Left Enclosure:</label>
                    <select id="leftEnclosure">
                        <option value="&quot;">"</option>
                        <option value="'">'</option>
                        <option value="none">None</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="rightEnclosure">Right Enclosure:</label>
                    <select id="rightEnclosure">
                        <option value="&quot;">"</option>
                        <option value="'">'</option>
                        <option value="none">None</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="form-group">
            <label for="fileName">File Name:</label>
            <div class="filename-group">
                <input type="text" id="fileName" value="${defaultFileName}" placeholder="Enter file name">
                <span class="filename-ext" id="fileExt">.csv</span>
            </div>
        </div>

        <div class="form-group">
            <label for="serverPath">Save to Server Path:</label>
            <div class="path-input-group">
                <input type="text" id="serverPath" value="/home/athena/" placeholder="/home/athena/">
                <button type="button" class="secondary" id="browseBtn" style="border: 1px solid var(--vscode-button-border, var(--vscode-focusBorder)); white-space: nowrap;">Browse...</button>
            </div>
        </div>

        <div class="notice">
            <span class="notice-icon">ℹ️</span>
            <span class="notice-text">File will be saved on the server at the specified path and also downloaded to your local machine. By proceeding, you acknowledge responsibility for its secure handling per company data governance policies.</span>
        </div>
    </div>
    
    <div class="footer">
        <button class="secondary" id="cancelBtn">Cancel</button>
        <button id="exportBtn">Export & Download</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        const formatSelect = document.getElementById('format');
        const csvOptions = document.getElementById('csv-options');
        const fileNameInput = document.getElementById('fileName');
        const fileExtSpan = document.getElementById('fileExt');
        const serverPathInput = document.getElementById('serverPath');
        const browseBtn = document.getElementById('browseBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const exportBtn = document.getElementById('exportBtn');

        const extMap = { csv: '.csv', xlsx: '.xlsx', json: '.json', xml: '.xml', sql: '.sql', html: '.html' };

        function updateExtension() {
            fileExtSpan.textContent = extMap[formatSelect.value] || '.dat';
            if (formatSelect.value === 'csv') {
                csvOptions.style.display = 'block';
            } else {
                csvOptions.style.display = 'none';
            }
        }

        formatSelect.addEventListener('change', updateExtension);
        updateExtension();

        browseBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'browseFolder' });
        });

        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'cancel' });
        });

        exportBtn.addEventListener('click', () => {
            const name = fileNameInput.value.trim();
            if (!name) {
                fileNameInput.style.borderColor = 'var(--vscode-inputValidation-errorBorder, red)';
                fileNameInput.focus();
                return;
            }

            let serverDir = serverPathInput.value.trim();
            if (!serverDir) {
                serverPathInput.style.borderColor = 'var(--vscode-inputValidation-errorBorder, red)';
                serverPathInput.focus();
                return;
            }
            // Ensure trailing slash
            if (!serverDir.endsWith('/')) { serverDir += '/'; }

            const ext = extMap[formatSelect.value] || '.dat';
            const fullFileName = name + ext;

            const data = {
                format: formatSelect.value,
                fileName: fullFileName,
                filePath: serverDir + fullFileName,
                downloadToDevice: true
            };
            
            vscode.postMessage({ type: 'export', data });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'folderSelected') {
                serverPathInput.value = message.path;
            }
        });
    </script>
</body>
</html>`;
    }
}
exports.ExportPanel = ExportPanel;
//# sourceMappingURL=exportPanel.js.map