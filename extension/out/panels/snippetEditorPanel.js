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
exports.SnippetEditorPanel = void 0;
const vscode = __importStar(require("vscode"));
class SnippetEditorPanel {
    panel;
    extensionUri;
    onSaveRequest;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    setSaveHandler(handler) {
        this.onSaveRequest = handler;
    }
    show(existingSnippet) {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('sqlSnippetEditor', existingSnippet ? 'Edit SQL Snippet' : 'New SQL Snippet', vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri]
            });
            this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message));
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }
        this.panel.reveal(vscode.ViewColumn.One);
        this.panel.title = existingSnippet ? 'Edit SQL Snippet' : 'New SQL Snippet';
        this.panel.webview.html = this.getHtmlContent(existingSnippet);
    }
    close() {
        this.panel?.dispose();
    }
    handleMessage(message) {
        switch (message.type) {
            case 'save':
                if (this.onSaveRequest) {
                    this.onSaveRequest(message.snippet);
                }
                break;
            case 'cancel':
                this.close();
                break;
        }
    }
    getHtmlContent(snippet) {
        const isEdit = !!snippet;
        const s = snippet || { name: '', content: '', id: '' };
        const safeString = (str) => (str ? str.replace(/"/g, '&quot;') : '');
        const safeContent = (str) => (str ? str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '');
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${isEdit ? 'Edit SQL Snippet' : 'New SQL Snippet'}</title>
    <style>
        :root {
            --bg-color: var(--vscode-editor-background);
            --fg-color: var(--vscode-editor-foreground);
            --input-bg: var(--vscode-input-background);
            --input-border: var(--vscode-input-border, #444);
            --input-fg: var(--vscode-input-foreground);
            --border-color: var(--vscode-panel-border, #444);
            --focus-border: var(--vscode-focusBorder, #007fd4);
            --primary-bg: var(--vscode-button-background, #0e639c);
            --primary-fg: var(--vscode-button-foreground, #fff);
            --primary-hover: var(--vscode-button-hoverBackground, #1177bb);
            --secondary-bg: var(--vscode-button-secondaryBackground, #3a3d41);
            --secondary-fg: var(--vscode-button-secondaryForeground, #fff);
            --secondary-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
            --ing-orange: #ff6200;
        }

        body {
            font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--fg-color);
            background-color: var(--bg-color);
            padding: 24px;
            max-width: 900px;
            margin: 0 auto;
            box-sizing: border-box;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        * {
            box-sizing: border-box;
        }

        h2 {
            font-size: 18px;
            font-weight: 400;
            margin-bottom: 20px;
            padding-bottom: 8px;
            border-bottom: 2px solid var(--ing-orange);
            display: inline-block;
        }

        .form-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .form-group {
            margin-bottom: 0px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        label {
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground, #cccccc);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        input[type="text"],
        textarea {
            width: 100%;
            padding: 10px 12px;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            font-size: 13px;
            color: var(--input-fg);
            background-color: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 4px;
            outline: none;
            transition: border-color 0.2s;
        }

        input[type="text"] {
            font-family: var(--vscode-font-family, sans-serif);
        }

        textarea {
            flex: 1;
            min-height: 300px;
            resize: none;
            line-height: 1.5;
        }

        input:focus, textarea:focus {
            border-color: var(--ing-orange);
        }

        .hint {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            margin-top: 4px;
        }

        .actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid var(--border-color);
        }

        button {
            padding: 8px 20px;
            font-family: inherit;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            border-radius: 4px;
            outline: none;
            transition: all 0.2s;
        }

        button.primary {
            background-color: var(--ing-orange);
            color: white;
        }

        button.primary:hover {
            opacity: 0.9;
            transform: translateY(-1px);
        }

        button.secondary {
            background-color: var(--secondary-bg);
            color: var(--secondary-fg);
            border: 1px solid var(--input-border);
        }

        button.secondary:hover {
            background-color: var(--secondary-hover);
        }

        /* Group Styling like Connection Screen */
        .section-box {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
        }

    </style>
</head>
<body>

    <h2>${isEdit ? 'Edit SQL Snippet' : 'Add New Snippet'}</h2>

    <div class="form-container">
        <div class="section-box">
            <div class="form-group">
                <label for="snippetName">Snippet Name</label>
                <input type="text" id="snippetName" placeholder="e.g., Select with Pagination" value="${safeString(s.name)}">
                <div class="hint">Give your snippet a descriptive name.</div>
            </div>
        </div>

        <div class="section-box" style="flex: 1; display: flex; flex-direction: column;">
            <div class="form-group" style="flex: 1; display: flex; flex-direction: column;">
                <label for="snippetContent">SQL Statement</label>
                <textarea id="snippetContent" placeholder="SELECT * FROM \${1:table_name} WHERE \${2:condition};">${safeContent(s.content)}</textarea>
                <div class="hint">Use \${1:label} for tab-navigable placeholders.</div>
            </div>
        </div>
    </div>

    <div class="actions">
        <button class="secondary" onclick="cancel()">Cancel</button>
        <button class="primary" onclick="save()">${isEdit ? 'Update Snippet' : 'Create Snippet'}</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function save() {
            const name = document.getElementById('snippetName').value.trim();
            const content = document.getElementById('snippetContent').value;
            
            if (!name) {
                alert('Please enter a name for the snippet.');
                return;
            }
            if (!content) {
                alert('Please enter the SQL content.');
                return;
            }

            vscode.postMessage({
                type: 'save',
                snippet: {
                    id: '${s.id}',
                    name: name,
                    content: content
                }
            });
        }

        function cancel() {
            vscode.postMessage({ type: 'cancel' });
        }

        // Handle Cmd+S / Ctrl+S
        window.addEventListener('keydown', e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                save();
            }
            if (e.key === 'Escape') {
                cancel();
            }
        });
    </script>
</body>
</html>`;
    }
}
exports.SnippetEditorPanel = SnippetEditorPanel;
//# sourceMappingURL=snippetEditorPanel.js.map