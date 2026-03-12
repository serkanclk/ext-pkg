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
exports.DescribePanel = void 0;
const vscode = __importStar(require("vscode"));
const oracleService_1 = require("../services/oracleService");
class DescribePanel {
    panel;
    showDescribe(objectName, objectType, connectionName) {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('ingSqlDescribe', `Describe: ${objectName}`, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true });
            this.panel.onDidDispose(() => { this.panel = undefined; });
        }
        this.panel.title = `Describe: ${objectName}`;
        this.loadDescribeData(objectName, objectType, connectionName);
    }
    async loadDescribeData(objectName, objectType, connectionName) {
        if (!this.panel) {
            return;
        }
        const oracleService = oracleService_1.OracleService.getInstance();
        try {
            let html = this.getBaseHtml(objectName, objectType);
            let content = '';
            // Columns
            if (['TABLE', 'VIEW', 'MATERIALIZED VIEW'].includes(objectType)) {
                const columns = await oracleService.getTableColumns(objectName, connectionName);
                content += '<h2>📋 Columns</h2>';
                content += '<table><thead><tr><th>#</th><th>Name</th><th>Type</th><th>Nullable</th><th>Default</th><th>Comments</th></tr></thead><tbody>';
                for (const col of columns) {
                    let typeStr = col.dataType;
                    if (col.dataPrecision !== null) {
                        typeStr += `(${col.dataPrecision}${col.dataScale !== null ? ',' + col.dataScale : ''})`;
                    }
                    else if (['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR', 'RAW'].includes(col.dataType)) {
                        typeStr += `(${col.dataLength})`;
                    }
                    content += `<tr><td>${col.columnId}</td><td class="obj-name">${col.name}</td><td>${typeStr}</td><td>${col.nullable === 'Y' ? '✓' : '✗'}</td><td>${col.defaultValue || ''}</td><td>${col.comments || ''}</td></tr>`;
                }
                content += '</tbody></table>';
                // Constraints
                const constraints = await oracleService.getConstraints(objectName, connectionName);
                if (constraints.length > 0) {
                    content += '<h2>🔒 Constraints</h2>';
                    content += '<table><thead><tr><th>Name</th><th>Type</th><th>Columns</th><th>References</th><th>Status</th></tr></thead><tbody>';
                    for (const c of constraints) {
                        const ref = c.refTable ? `${c.refTable}` : '';
                        content += `<tr><td class="obj-name">${c.name}</td><td>${c.type}</td><td>${c.columns}</td><td>${ref}</td><td>${c.status}</td></tr>`;
                    }
                    content += '</tbody></table>';
                }
                // Indexes
                const indexes = await oracleService.getIndexes(objectName, connectionName);
                if (indexes.length > 0) {
                    content += '<h2>📑 Indexes</h2>';
                    content += '<table><thead><tr><th>Name</th><th>Type</th><th>Uniqueness</th><th>Columns</th><th>Status</th></tr></thead><tbody>';
                    for (const i of indexes) {
                        content += `<tr><td class="obj-name">${i.name}</td><td>${i.type}</td><td>${i.uniqueness}</td><td>${i.columns}</td><td>${i.status}</td></tr>`;
                    }
                    content += '</tbody></table>';
                }
            }
            // DDL
            try {
                const ddl = await oracleService.getObjectDDL(objectName, objectType, connectionName);
                if (ddl) {
                    content += '<h2>📝 DDL</h2>';
                    content += `<pre class="ddl">${this.escapeHtml(ddl)}</pre>`;
                }
            }
            catch {
                // DDL might not be available for all objects
            }
            html = html.replace('{{CONTENT}}', content);
            this.panel.webview.html = html;
        }
        catch (err) {
            if (this.panel) {
                this.panel.webview.html = this.getBaseHtml(objectName, objectType)
                    .replace('{{CONTENT}}', `<p class="error">Error: ${this.escapeHtml(err.message)}</p>`);
            }
        }
    }
    getBaseHtml(objectName, objectType) {
        return /*html*/ `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size, 13px);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 16px;
    }
    h1 { font-size: 16px; margin-bottom: 4px; color: #FF6200; }
    .subtext { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 20px; }
    h2 { font-size: 14px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #FF6200; color: #FF6200; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th {
        background: var(--vscode-editorWidget-background);
        padding: 6px 10px;
        text-align: left;
        font-weight: 600;
        font-size: 12px;
        border: 1px solid var(--vscode-editorWidget-border);
    }
    td {
        padding: 5px 10px;
        border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
        font-size: 12px;
    }
    tr:hover td { background: var(--vscode-list-hoverBackground); }
    .obj-name { font-weight: 600; color: var(--vscode-symbolIcon-fieldForeground, var(--vscode-foreground)); }
    .ddl {
        background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1));
        padding: 12px;
        border-radius: 4px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 12px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
    }
    .error { color: var(--vscode-errorForeground); }
</style>
</head>
<body>
<h1>${objectName}</h1>
<div class="subtext">${objectType}</div>
{{CONTENT}}
</body>
</html>`;
    }
    escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    dispose() {
        this.panel?.dispose();
    }
}
exports.DescribePanel = DescribePanel;
//# sourceMappingURL=describePanel.js.map