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
exports.ConnectionPanel = void 0;
const vscode = __importStar(require("vscode"));
class ConnectionPanel {
    panel;
    extensionUri;
    onSaveRequest;
    onTestRequest;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    setSaveHandler(handler) {
        this.onSaveRequest = handler;
    }
    setTestHandler(handler) {
        this.onTestRequest = handler;
    }
    show(existingProfile, existingPassword) {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('ingSqlConnection', existingProfile ? 'Edit Connection' : 'Create Connection', vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri]
            });
            this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message));
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }
        this.panel.title = existingProfile ? 'Edit Connection' : 'Create Connection';
        this.panel.webview.html = this.getHtmlContent(existingProfile, existingPassword);
    }
    close() {
        this.panel?.dispose();
    }
    setTestResult(success, message) {
        if (this.panel) {
            this.panel.webview.postMessage({ type: 'testResult', success, message });
        }
    }
    handleMessage(message) {
        switch (message.type) {
            case 'save':
            case 'connect':
                if (this.onSaveRequest) {
                    this.onSaveRequest(message.profile, message.password, message.type === 'connect');
                }
                break;
            case 'test':
                if (this.onTestRequest) {
                    this.onTestRequest(message.profile, message.password);
                }
                break;
            case 'cancel':
                this.close();
                break;
        }
    }
    getHtmlContent(profile, existingPassword) {
        const isEdit = !!profile;
        const defaultProfile = {
            name: '',
            host: 'localhost',
            port: 1521,
            username: '',
            role: 'default',
            connectionType: 'basic',
            serviceName: 'XEPDB1'
        };
        const p = profile || defaultProfile;
        // Escape dynamic data to prevent XSS/quote issues
        const safeString = (str) => (str ? str.replace(/"/g, '&quot;') : '');
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${isEdit ? 'Edit Connection' : 'Create Connection'}</title>
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
        }

        body {
            font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--fg-color);
            background-color: var(--bg-color);
            padding: 24px;
            max-width: 800px;
            margin: 0 auto;
            box-sizing: border-box;
        }

        * {
            box-sizing: border-box;
        }

        h2 {
            font-size: 16px;
            font-weight: 400;
            margin-bottom: 20px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border-color);
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-row {
            display: flex;
            gap: 16px;
            margin-bottom: 16px;
        }
        
        .form-col {
            flex: 1;
        }

        label {
            display: block;
            margin-bottom: 6px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground, #cccccc);
        }

        input[type="text"],
        input[type="password"],
        input[type="number"],
        select {
            width: 100%;
            padding: 6px 8px;
            font-family: inherit;
            font-size: 13px;
            color: var(--input-fg);
            background-color: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 2px;
            outline: none;
        }

        input:focus, select:focus {
            border-color: var(--focus-border);
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
        }

        .checkbox-group input {
            margin: 0;
            width: auto;
        }

        /* TABS Styling */
        .tabs {
            display: flex;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 16px;
            gap: 24px;
        }

        .tab {
            padding: 8px 0;
            cursor: pointer;
            color: var(--vscode-descriptionForeground, #888);
            border-bottom: 2px solid transparent;
            font-size: 13px;
        }

        .tab.active {
            color: var(--fg-color);
            border-bottom-color: var(--fg-color);
        }

        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }

        h3 {
            font-size: 13px;
            font-weight: normal;
            margin: 24px 0 12px 0;
        }

        .actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid var(--border-color);
        }

        .actions-right {
            display: flex;
            gap: 8px;
        }

        button {
            padding: 6px 14px;
            font-family: inherit;
            font-size: 13px;
            cursor: pointer;
            border: none;
            border-radius: 2px;
            outline: none;
        }

        button.primary {
            background-color: var(--primary-bg);
            color: var(--primary-fg);
        }

        button.primary:hover {
            background-color: var(--primary-hover);
        }

        button.secondary {
            background-color: var(--secondary-bg);
            color: var(--secondary-fg);
            border: 1px solid var(--input-border);
        }

        button.secondary:hover {
            background-color: var(--secondary-hover);
        }

        #testMessage {
            margin-top: 8px;
            font-size: 12px;
            display: none;
        }
        .success { color: var(--vscode-testing-iconPassed); }
        .error { color: var(--vscode-testing-iconFailed); }
        
    </style>
</head>
<body>

    <h2>${isEdit ? 'Edit Connection' : 'Create Connection'}</h2>

    <div class="form-group">
        <label>Connection Name</label>
        <input type="text" id="connName" placeholder="e.g. Development Database" value="${safeString(p.name)}" ${isEdit ? 'readonly' : ''}>
    </div>

    <!-- MAIN TABS: User Info / Proxy User -->
    <div class="tabs">
        <div class="tab active" data-target="userInfo">User Info</div>
        <div class="tab" data-target="proxyUser">Proxy User (Unsupported)</div>
    </div>

    <div id="userInfo" class="tab-content active">
        <div class="form-row">
            <div class="form-col">
                <label>Authentication Type</label>
                <select id="authType" disabled>
                    <option>Default</option>
                </select>
            </div>
            <div class="form-col">
                <label>Role</label>
                <select id="connRole">
                    <option value="default" ${p.role === 'default' ? 'selected' : ''}>Default</option>
                    <option value="SYSDBA" ${p.role === 'SYSDBA' ? 'selected' : ''}>SYSDBA</option>
                    <option value="SYSOPER" ${p.role === 'SYSOPER' ? 'selected' : ''}>SYSOPER</option>
                </select>
            </div>
        </div>

        <div class="form-row">
            <div class="form-col">
                <label>Username</label>
                <input type="text" id="username" placeholder="e.g. SYS" value="${safeString(p.username)}">
            </div>
            <div class="form-col">
                <label>Password</label>
                <input type="password" id="password" value="${existingPassword ? '**********' : ''}">
                <div class="checkbox-group">
                    <input type="checkbox" id="savePassword" checked>
                    <label for="savePassword" style="margin-bottom:0">Save Password</label>
                </div>
            </div>
        </div>
    </div>
    
    <div id="proxyUser" class="tab-content">
        <!-- Placeholder for proxy user fields -->
        <p style="color:var(--vscode-descriptionForeground)">Proxy authentication is not managed by this driver configuration presently.</p>
    </div>

    <h3>Connection Type</h3>
    <div class="form-group">
        <select id="connType" onchange="toggleTypeFields()">
            <option value="basic" ${p.connectionType === 'basic' ? 'selected' : ''}>Basic</option>
            <option value="tns" ${p.connectionType === 'tns' ? 'selected' : ''}>TNS</option>
            <option value="connectionString" ${p.connectionType === 'connectionString' ? 'selected' : ''}>Connection String / Custom JDBC</option>
        </select>
    </div>

    <!-- SUB TABS: Details / Advanced -->
    <div class="tabs">
        <div class="tab active" data-target="details">Details</div>
        <div class="tab" data-target="advanced">Advanced</div>
    </div>

    <div id="details" class="tab-content active">
        <!-- BASIC -->
        <div id="typeBasic" class="type-section">
            <div class="form-row">
                <div class="form-col" style="flex:2">
                    <label>Hostname</label>
                    <input type="text" id="host" placeholder="e.g. localhost" value="${safeString(p.host)}">
                </div>
                <div class="form-col">
                    <label>Port</label>
                    <input type="number" id="port" value="${p.port || 1521}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-col">
                    <label>Type</label>
                    <select id="serviceOrSid" onchange="toggleServiceSid()">
                        <option value="Service Name" ${p.serviceName ? 'selected' : ''}>Service Name</option>
                        <option value="SID" ${p.sid ? 'selected' : ''}>SID</option>
                    </select>
                </div>
                <div class="form-col">
                    <label id="serviceValueLabel">${p.sid ? 'SID' : 'Service Name'}</label>
                    <input type="text" id="serviceValue" placeholder="e.g. XEPDB1" value="${safeString(p.sid || p.serviceName)}">
                </div>
            </div>
        </div>

        <!-- TNS -->
        <div id="typeTns" class="type-section" style="display:none;">
            <div class="form-group">
                <label>Network Alias</label>
                <input type="text" id="tnsAlias" placeholder="e.g. ORCL" value="${safeString(p.tnsAlias)}">
            </div>
        </div>

        <!-- Connection String -->
        <div id="typeConnString" class="type-section" style="display:none;">
            <div class="form-group">
                <label>Custom Connection String</label>
                <input type="text" id="connString" placeholder="host:port/service_name" value="${safeString(p.connectionString)}">
            </div>
        </div>
    </div>

    <div id="advanced" class="tab-content">
        <p style="color:var(--vscode-descriptionForeground)">Advanced Oracle configurations (like Wallets) are unsupported in this view.</p>
    </div>

    <div id="testMessage"></div>

    <div class="actions">
        <div>
            <button class="secondary" onclick="postAction('cancel')">Cancel</button>
            <button class="primary" style="margin-left:8px;" onclick="postAction('test')" id="testBtn">Test</button>
        </div>
        <div class="actions-right">
            <button class="secondary" onclick="postAction('connect')">Connect</button>
            <button class="primary" onclick="postAction('save')">Save</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Tab switching logic
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetId = e.target.getAttribute('data-target');
                const parentNav = e.target.parentElement;
                
                // Unmark active tab in this group
                parentNav.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                
                // Hide contents corresponding to this tab group
                const allTargets = Array.from(parentNav.querySelectorAll('.tab')).map(t => t.getAttribute('data-target'));
                allTargets.forEach(id => document.getElementById(id).classList.remove('active'));
                
                // Show selected content
                document.getElementById(targetId).classList.add('active');
            });
        });

        function toggleTypeFields() {
            const type = document.getElementById('connType').value;
            document.getElementById('typeBasic').style.display = type === 'basic' ? 'block' : 'none';
            document.getElementById('typeTns').style.display = type === 'tns' ? 'block' : 'none';
            document.getElementById('typeConnString').style.display = type === 'connectionString' ? 'block' : 'none';
        }

        function toggleServiceSid() {
            const val = document.getElementById('serviceOrSid').value;
            document.getElementById('serviceValueLabel').innerText = val;
        }

        // Initialize display state
        toggleTypeFields();

        function buildProfile() {
            const connType = document.getElementById('connType').value;
            const profile = {
                name: document.getElementById('connName').value.trim(),
                username: document.getElementById('username').value.trim(),
                role: document.getElementById('connRole').value,
                connectionType: connType,
            };

            if (connType === 'basic') {
                profile.host = document.getElementById('host').value.trim();
                profile.port = parseInt(document.getElementById('port').value.trim(), 10);
                const isSid = document.getElementById('serviceOrSid').value === 'SID';
                const serviceVal = document.getElementById('serviceValue').value.trim();
                if (isSid) {
                    profile.sid = serviceVal;
                } else {
                    profile.serviceName = serviceVal;
                }
            } else if (connType === 'tns') {
                profile.tnsAlias = document.getElementById('tnsAlias').value.trim();
            } else if (connType === 'connectionString') {
                profile.connectionString = document.getElementById('connString').value.trim();
            }

            return profile;
        }

        function postAction(actionType) {
            const profile = buildProfile();
            const pwdInput = document.getElementById('password').value;
            
            // if empty and not changing, we don't send anything
            let password = undefined;
            if (pwdInput !== '' && pwdInput !== '**********') {
                password = pwdInput;
            }

            if (actionType !== 'cancel' && !profile.name) {
                const msgEl = document.getElementById('testMessage');
                msgEl.innerText = "Connection Name is required.";
                msgEl.className = "error";
                msgEl.style.display = "block";
                return;
            }

            if (actionType === 'test') {
                const btn = document.getElementById('testBtn');
                btn.innerText = 'Testing...';
                btn.disabled = true;
            }

            vscode.postMessage({
                type: actionType,
                profile: profile,
                password: password,
                savePassword: document.getElementById('savePassword').checked
            });
        }

        // Listen for test results from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'testResult') {
                const btn = document.getElementById('testBtn');
                btn.innerText = 'Test';
                btn.disabled = false;

                const msgEl = document.getElementById('testMessage');
                msgEl.innerText = message.message;
                msgEl.className = message.success ? 'success' : 'error';
                msgEl.style.display = 'block';
            }
        });

    </script>
</body>
</html>`;
    }
}
exports.ConnectionPanel = ConnectionPanel;
//# sourceMappingURL=connectionPanel.js.map