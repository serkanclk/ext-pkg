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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const connectionManager_1 = require("./services/connectionManager");
const oracleService_1 = require("./services/oracleService");
const exportService_1 = require("./services/exportService");
const importService_1 = require("./services/importService");
const auditLogService_1 = require("./services/auditLogService");
const objectBrowserProvider_1 = require("./providers/objectBrowserProvider");
const sqlLanguageProvider_1 = require("./providers/sqlLanguageProvider");
const sqlHistoryProvider_1 = require("./providers/sqlHistoryProvider");
const dbmsOutputProvider_1 = require("./providers/dbmsOutputProvider");
const sqlSnippetsProvider_1 = require("./providers/sqlSnippetsProvider");
const sqlWorksheet_1 = require("./commands/sqlWorksheet");
const resultsPanel_1 = require("./panels/resultsPanel");
const objectViewerPanel_1 = require("./panels/objectViewerPanel");
const snippetEditorPanel_1 = require("./panels/snippetEditorPanel");
const treeItems_1 = require("./models/treeItems");
const buildConfig_1 = require("./buildConfig");
const sqlStatusBar_1 = require("./ui/sqlStatusBar");
const worksheetSessionManager_1 = require("./services/worksheetSessionManager");
function activate(context) {
    try {
        vscode.window.showInformationMessage('ING SQL Developer extension is activating...');
        console.log('ING SQL Developer extension is now active!');
        // ─── Initialize Oracle Thick Mode ───
        oracleService_1.OracleService.initializeThickMode();
        // ─── Core Services Initialization ───
        const connMgr = connectionManager_1.ConnectionManager.initialize(context);
        const oracleService = oracleService_1.OracleService.getInstance();
        const exportService = exportService_1.ExportService.getInstance(context);
        const importService = importService_1.ImportService.getInstance(context);
        const auditLogService = auditLogService_1.AuditLogService.getInstance();
        // ─── Initialize UI Components ───
        const objectBrowserProvider = new objectBrowserProvider_1.ObjectBrowserProvider();
        const sqlLanguageProvider = new sqlLanguageProvider_1.SqlLanguageProvider();
        const sqlHistoryProvider = new sqlHistoryProvider_1.SqlHistoryProvider(context);
        const dbmsOutputProvider = new dbmsOutputProvider_1.DbmsOutputProvider();
        const sqlSnippetsProvider = new sqlSnippetsProvider_1.SqlSnippetsProvider(context);
        const resultsPanel = new resultsPanel_1.ResultsPanel(context.extensionUri);
        const snippetEditorPanel = new snippetEditorPanel_1.SnippetEditorPanel(context.extensionUri);
        const sqlStatusBar = new sqlStatusBar_1.SqlStatusBar();
        context.subscriptions.push({ dispose: () => sqlStatusBar.dispose() });
        sqlStatusBar.showReady();
        const sqlWorksheetCommands = new sqlWorksheet_1.SqlWorksheetCommands(context, resultsPanel, sqlHistoryProvider, sqlStatusBar);
        // ─── Object Viewer Management ───
        const objectViewers = new Map();
        function getObjectViewer(objectName, connectionName) {
            const key = `${connectionName}:${objectName}`;
            let viewer = objectViewers.get(key);
            if (!viewer) {
                viewer = new objectViewerPanel_1.ObjectViewerPanel(context.extensionUri);
                viewer.setExportHandler(async (data) => {
                    const profile = connMgr.getProfiles().find(p => p.name === data.connectionName);
                    if (!profile) {
                        vscode.window.showWarningMessage('No active connection context found for export.');
                        return;
                    }
                    try {
                        const result = await exportService.promptAndExport({
                            format: data.format,
                            statement: data.sql,
                            connectionName: data.connectionName,
                            tableName: data.objectName
                        });
                        if (result) {
                            await auditLogService.logSuccessfulExport(result, 'RESULTS_GRID', data.connectionName, profile.username, data.objectName || null, data.sql);
                        }
                    }
                    catch (err) {
                        await auditLogService.logFailedExport(data.format, 'RESULTS_GRID', data.connectionName, profile.username, data.objectName || null, data.sql, err.message);
                    }
                });
                objectViewers.set(key, viewer);
            }
            return viewer;
        }
        // ─── Register Tree Views ───
        const objectBrowserView = vscode.window.createTreeView('ingSql.objectBrowser', {
            treeDataProvider: objectBrowserProvider,
            showCollapseAll: true
        });
        const sqlHistoryView = vscode.window.createTreeView('ingSql.sqlHistory', {
            treeDataProvider: sqlHistoryProvider
        });
        const sqlSnippetsView = vscode.window.createTreeView('ingSql.snippets', {
            treeDataProvider: sqlSnippetsProvider
        });
        // ─── Register Language Features ───
        const langSelector = { language: 'oraclesql', scheme: '*' };
        context.subscriptions.push(vscode.languages.registerCompletionItemProvider(langSelector, sqlLanguageProvider), vscode.languages.registerHoverProvider(langSelector, sqlLanguageProvider), vscode.languages.registerDocumentFormattingEditProvider(langSelector, sqlLanguageProvider), vscode.window.registerWebviewViewProvider(resultsPanel_1.ResultsPanel.viewType, resultsPanel));
        // ─── Setup Export Handler ───
        resultsPanel.setExportHandler(async (data) => {
            const activeConn = connMgr.getActiveConnectionName();
            const activeProfile = connMgr.getActiveProfile();
            if (!activeConn || !activeProfile) {
                vscode.window.showWarningMessage('No active connection for export.');
                return;
            }
            try {
                const result = await exportService.promptAndExport({
                    format: data.format,
                    columns: data.results.columns,
                    statement: data.results.statement,
                    connectionName: activeConn,
                });
                if (result) {
                    await auditLogService.logSuccessfulExport(result, data.source, activeConn, activeProfile.username, null, data.results.statement);
                }
            }
            catch (err) {
                await auditLogService.logFailedExport(data.format, data.source, activeConn, activeProfile.username, null, data.results.statement, err.message);
            }
        });
        // ─── Register Commands ───
        // Connection commands
        context.subscriptions.push(vscode.commands.registerCommand('ingSql.addConnection', () => {
            connMgr.addConnection();
        }), vscode.commands.registerCommand('ingSql.editConnection', (item) => {
            if (item?.connectionName) {
                connMgr.editConnection(item.connectionName);
            }
        }), vscode.commands.registerCommand('ingSql.removeConnection', (item) => {
            if (item?.connectionName) {
                connMgr.removeConnection(item.connectionName);
            }
        }), vscode.commands.registerCommand('ingSql.connect', async (item) => {
            if (item?.connectionName) {
                const success = await connMgr.connect(item.connectionName);
                if (success) {
                    sqlLanguageProvider.refreshCachedObjects(item.connectionName);
                    dbmsOutputProvider.enableForConnection(item.connectionName);
                }
            }
        }));
        context.subscriptions.push(vscode.commands.registerCommand('ingSql.importData', async (item) => {
            if (item?.connectionName) {
                // If invoked from a table node, pre-select the table name
                const targetTable = (item.objectType === 'table') ? item.objectName : undefined;
                await importService.promptAndImport(item.connectionName, targetTable);
                objectBrowserProvider.refresh();
            }
        }));
        context.subscriptions.push(vscode.commands.registerCommand('ingSql.disconnect', (item) => {
            if (item?.connectionName) {
                connMgr.disconnect(item.connectionName);
            }
        }), vscode.commands.registerCommand('ingSql.testConnection', (item) => {
            if (item?.connectionName) {
                connMgr.testConnection(item.connectionName);
            }
        }));
        // SQL Worksheet commands
        context.subscriptions.push(vscode.commands.registerCommand('ingSql.newSqlWorksheet', (item) => {
            sqlWorksheetCommands.newWorksheet(item);
        }), vscode.commands.registerCommand('ingSql.executeQuery', () => {
            sqlWorksheetCommands.executeStatement();
        }), vscode.commands.registerCommand('ingSql.executeScript', () => {
            sqlWorksheetCommands.executeScript();
        }), vscode.commands.registerCommand('ingSql.executeExplainPlan', () => {
            sqlWorksheetCommands.executeExplainPlan();
        }), vscode.commands.registerCommand('ingSql.toUpperCase', () => {
            sqlWorksheetCommands.toUpperCase();
        }), vscode.commands.registerCommand('ingSql.toLowerCase', () => {
            sqlWorksheetCommands.toLowerCase();
        }), vscode.commands.registerCommand('ingSql.describeObjectAtCursor', () => {
            sqlWorksheetCommands.describeObjectAtCursor();
        }), vscode.commands.registerCommand('ingSql.showSqlHistory', () => {
            vscode.commands.executeCommand('ingSql.sqlHistoryView.focus');
        }));
        // Object Browser commands
        context.subscriptions.push(vscode.commands.registerCommand('ingSql.refreshObjectBrowser', () => {
            objectBrowserProvider.refresh();
        }), vscode.commands.registerCommand('ingSql.openData', async (item) => {
            if (!item?.objectName || !item.connectionName) {
                return;
            }
            const typeMap = {
                'table': 'TABLE', 'view': 'VIEW', 'mview': 'MATERIALIZED VIEW'
            };
            const objType = typeMap[item.objectType] || 'TABLE';
            const viewer = getObjectViewer(item.objectName, item.connectionName);
            viewer.show(item.objectName, objType, item.connectionName, item.schemaName || 'UNKNOWN', 'data');
        }), vscode.commands.registerCommand('ingSql.describeObject', (item) => {
            if (!item?.objectName || !item.connectionName) {
                return;
            }
            const typeMap = {
                'table': 'TABLE', 'view': 'VIEW', 'mview': 'MATERIALIZED VIEW',
                'index': 'INDEX', 'sequence': 'SEQUENCE', 'synonym': 'SYNONYM',
                'dblink': 'DATABASE LINK', 'trigger': 'TRIGGER',
            };
            const objType = typeMap[item.objectType] || 'TABLE';
            const viewer = getObjectViewer(item.objectName, item.connectionName);
            viewer.show(item.objectName, objType, item.connectionName, item.schemaName || 'UNKNOWN', 'columns');
        }), vscode.commands.registerCommand('ingSql.verifyThickMode', () => {
            const clientPath = (process.env.ORACLE_CLIENT_PATH || '/usr/lib/oracle/23/client64/lib').trim();
            if (oracleService_1.OracleService.isThickMode()) {
                vscode.window.showInformationMessage(`Oracle Thick Mode is ACTIVE. Using Instant Client at: ${clientPath}`);
            }
            else if (clientPath && clientPath.trim() !== '') {
                vscode.window.showErrorMessage(`Oracle Thick Mode is NOT active, despite client path being set. Check path permissions or missing libaio. Path: ${clientPath}`);
            }
            else {
                vscode.window.showInformationMessage('Oracle is running in default Thin Mode (No client path specified).');
            }
        }), vscode.commands.registerCommand('ingSql.showResultsInTab', (result) => {
            const panel = vscode.window.createWebviewPanel('ingSqlQueryResult', `Query Result (${new Date().toLocaleTimeString()})`, vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
            objectViewerPanel_1.ObjectViewerPanel.createOrShowQueryResults(panel, result, context.extensionUri);
        }), vscode.commands.registerCommand('ingSql.searchObjects', async (contextItem) => {
            let connectionName = contextItem?.connectionName;
            if (!connectionName) {
                const profiles = connMgr.getProfiles();
                if (profiles.length === 0) {
                    vscode.window.showErrorMessage('No connections configured.');
                    return;
                }
                const selected = await vscode.window.showQuickPick(profiles.map(p => p.name), { placeHolder: 'Select connection for search' });
                if (!selected)
                    return;
                connectionName = selected;
            }
            const quickPick = vscode.window.createQuickPick();
            quickPick.placeholder = 'Search objects (Tables, Views, Procedures, etc.)...';
            quickPick.busy = false;
            let timeout;
            quickPick.onDidChangeValue(value => {
                if (timeout)
                    clearTimeout(timeout);
                if (value.length < 2) {
                    quickPick.items = [];
                    return;
                }
                quickPick.busy = true;
                timeout = setTimeout(async () => {
                    try {
                        const results = await oracleService.searchObjects(value, connectionName);
                        quickPick.items = results.map(obj => ({
                            label: obj.name,
                            description: `${obj.type} • ${obj.owner}`,
                            picked: false,
                            alwaysShow: true,
                            // Store metadata for the selection handler
                            detail: JSON.stringify({ name: obj.name, type: obj.type, owner: rowToSchema(obj.type), schema: obj.owner })
                        }));
                    }
                    catch (err) {
                        console.error('Search error:', err);
                    }
                    finally {
                        quickPick.busy = false;
                    }
                }, 400);
            });
            // Helper to map DB types to extension internal types for describeObject
            const typeToInternal = (dbType) => {
                const map = {
                    'TABLE': 'table', 'VIEW': 'view', 'MATERIALIZED VIEW': 'mview',
                    'INDEX': 'index', 'SEQUENCE': 'sequence', 'SYNONYM': 'synonym',
                    'DATABASE LINK': 'dblink', 'TRIGGER': 'trigger',
                    'PROCEDURE': 'procedure', 'FUNCTION': 'function', 'PACKAGE': 'package', 'TYPE': 'type'
                };
                return map[dbType] || 'table';
            };
            const rowToSchema = (dbType) => {
                // This is just a placeholder to pass something that looks like an OracleTreeItem
                return '';
            };
            quickPick.onDidAccept(() => {
                const selection = quickPick.selectedItems[0];
                if (selection) {
                    const meta = JSON.parse(selection.detail);
                    quickPick.hide();
                    // Create a dummy OracleTreeItem to reuse existing describe logic
                    const dummyItem = new treeItems_1.OracleTreeItem(meta.name, typeToInternal(meta.type), vscode.TreeItemCollapsibleState.None, connectionName, meta.schema, meta.name);
                    if (['table', 'view', 'mview'].includes(dummyItem.objectType)) {
                        vscode.commands.executeCommand('ingSql.describeObject', dummyItem);
                    }
                    else if (['procedure', 'function', 'package', 'trigger', 'type'].includes(dummyItem.objectType)) {
                        vscode.commands.executeCommand('ingSql.viewSource', dummyItem);
                    }
                    else {
                        vscode.commands.executeCommand('ingSql.describeObject', dummyItem);
                    }
                }
            });
            quickPick.onDidHide(() => quickPick.dispose());
            quickPick.show();
        }), vscode.commands.registerCommand('ingSql.about', () => {
            const mode = oracleService_1.OracleService.isThickMode() ? 'Thick' : 'Thin';
            const pkg = require('../package.json');
            const panel = vscode.window.createWebviewPanel('ingSqlAbout', 'About ING SQL', vscode.ViewColumn.One, { enableScripts: false });
            panel.webview.html = /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>About ING SQL</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 32px 48px;
            line-height: 1.6;
        }
        .header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 2px solid #FF6200; }
        .header h1 { font-size: 28px; font-weight: 700; }
        .header .version { font-size: 14px; color: var(--vscode-descriptionForeground); }
        .header .mode { display: inline-block; padding: 2px 10px; border-radius: 12px; background: ${mode === 'Thick' ? '#2ea043' : '#db6d28'}; color: white; font-size: 11px; font-weight: 600; }
        .logo { width: 48px; height: 48px; border-radius: 8px; background: #FF6200; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 20px; }
        h2 { font-size: 18px; margin: 24px 0 12px; color: #FF6200; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th { text-align: left; padding: 8px 12px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border); font-weight: 600; font-size: 12px; }
        td { padding: 6px 12px; border: 1px solid var(--vscode-editorWidget-border); font-size: 13px; }
        kbd { display: inline-block; padding: 2px 8px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 4px; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; box-shadow: 0 1px 0 var(--vscode-editorWidget-border); }
        .section { margin-bottom: 16px; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--vscode-editorWidget-border); font-size: 12px; color: var(--vscode-descriptionForeground); }
        .tip { background: var(--vscode-editorWidget-background); border-left: 3px solid #FF6200; padding: 8px 16px; margin: 12px 0; font-size: 13px; border-radius: 0 4px 4px 0; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">ING</div>
        <div>
            <h1>ING SQL Developer</h1>
            <span class="version">v${pkg.version}</span> &nbsp;
            <span class="mode">${mode} Mode</span>
        </div>
    </div>

    <h2>⌨️ Keyboard Shortcuts</h2>
    <table>
        <tr><th>Shortcut (Mac)</th><th>Shortcut (Win/Linux)</th><th>Action</th></tr>
        <tr><td><kbd>⌘</kbd> + <kbd>Enter</kbd></td><td><kbd>Ctrl</kbd> + <kbd>Enter</kbd></td><td>Execute Statement at Cursor</td></tr>
        <tr><td><kbd>F5</kbd></td><td><kbd>F5</kbd></td><td>Execute Script (all statements)</td></tr>
        <tr><td><kbd>F10</kbd></td><td><kbd>F10</kbd></td><td>Explain Plan</td></tr>
        <tr><td><kbd>⇧</kbd> + <kbd>F4</kbd></td><td><kbd>Shift</kbd> + <kbd>F4</kbd></td><td>Describe Object at Cursor</td></tr>
        <tr><td><kbd>F8</kbd></td><td><kbd>F8</kbd></td><td>Show SQL History</td></tr>
        <tr><td><kbd>⌘</kbd> + <kbd>F7</kbd></td><td><kbd>Ctrl</kbd> + <kbd>F7</kbd></td><td>Format SQL</td></tr>
        <tr><td><kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>U</kbd></td><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>U</kbd></td><td>SQL-Aware Uppercase</td></tr>
        <tr><td><kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>L</kbd></td><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>L</kbd></td><td>SQL-Aware Lowercase</td></tr>
        <tr><td><kbd>⌘</kbd> + <kbd>/</kbd></td><td><kbd>Ctrl</kbd> + <kbd>/</kbd></td><td>Toggle Line Comment (--)</td></tr>
        <tr><td><kbd>⌥</kbd> + <kbd>F10</kbd></td><td><kbd>Alt</kbd> + <kbd>F10</kbd></td><td>New SQL Worksheet</td></tr>
    </table>

    <div class="tip">
        💡 <strong>SQL-Aware Case Change</strong>: Uppercase/Lowercase commands intelligently preserve text inside string literals (<code>'...'</code>), double-quoted identifiers (<code>"..."</code>), line comments (<code>--</code>), and block comments (<code>/* ... */</code>).
    </div>

    <h2>🚀 Features</h2>
    <div class="section">
        <table>
            <tr><th>Feature</th><th>Description</th></tr>
            <tr><td>🌲 Object Browser</td><td>Browse tables, views, procedures, functions, packages, sequences, and more</td></tr>
            <tr><td>📊 Results Grid</td><td>Interactive grid with sorting, filtering, and "Load More" pagination</td></tr>
            <tr><td>📝 SQL Worksheet</td><td>Full SQL & PL/SQL support with syntax highlighting</td></tr>
            <tr><td>📋 SQL History</td><td>Persistent history of all executed queries</td></tr>
            <tr><td>📥 Data Import</td><td>Import CSV/XLSX files directly into Oracle tables</td></tr>
            <tr><td>📤 Data Export</td><td>Export query results to CSV, Excel, or JSON</td></tr>
            <tr><td>🔍 Explain Plan</td><td>View execution plans for SQL statements</td></tr>
            <tr><td>📜 SQL Snippets</td><td>Save and reuse frequently used SQL templates</td></tr>
            <tr><td>🔌 Thick Mode</td><td>Oracle Instant Client for enhanced security (NNE)</td></tr>
            <tr><td>🛡️ Audit Logging</td><td>All exports logged to centralized audit API</td></tr>
        </table>
    </div>

    <h2>📂 Supported File Types</h2>
    <div class="section">
        <code>.sql</code>, <code>.osql</code>, <code>.plsql</code>, <code>.pls</code>, <code>.pck</code>
    </div>

    <div class="footer">
        Developed by the <strong>Athena DWH Team</strong> &nbsp;|&nbsp; Oracle Mode: <strong>${mode}</strong>
    </div>
</body>
</html>`;
        }), vscode.commands.registerCommand('ingSql.generateSelect', async (item) => {
            if (!item?.objectName || !item.connectionName) {
                return;
            }
            try {
                const columns = await oracleService.getTableColumns(item.objectName, item.connectionName);
                const colList = columns.map(c => c.name).join(',\n       ');
                const sql = `SELECT ${colList}\n  FROM ${item.objectName}`;
                const doc = await vscode.workspace.openTextDocument({
                    language: 'oraclesql',
                    content: sql + ';\n'
                });
                await vscode.window.showTextDocument(doc, { preview: false });
            }
            catch (err) {
                vscode.window.showErrorMessage(`Error generating SELECT: ${err.message}`);
            }
        }), vscode.commands.registerCommand('ingSql.viewSource', async (item) => {
            if (!item?.objectName || !item.connectionName) {
                return;
            }
            const typeMap = {
                'procedure': 'PROCEDURE', 'function': 'FUNCTION',
                'package': 'PACKAGE', 'trigger': 'TRIGGER', 'type': 'TYPE',
            };
            const objType = typeMap[item.objectType] || 'PROCEDURE';
            try {
                const source = await oracleService.getObjectSource(item.objectName, objType, item.connectionName);
                if (source) {
                    const doc = await vscode.workspace.openTextDocument({
                        language: 'oraclesql',
                        content: `CREATE OR REPLACE ${source}`
                    });
                    await vscode.window.showTextDocument(doc, { preview: false });
                }
            }
            catch (err) {
                vscode.window.showErrorMessage(`Error viewing source: ${err.message}`);
            }
        }), vscode.commands.registerCommand('ingSql.compileObject', async (item) => {
            if (!item?.objectName || !item.connectionName) {
                return;
            }
            const typeMap = {
                'procedure': 'PROCEDURE', 'function': 'FUNCTION',
                'package': 'PACKAGE', 'trigger': 'TRIGGER', 'type': 'TYPE',
            };
            const objType = typeMap[item.objectType] || 'PROCEDURE';
            try {
                await oracleService.executeNonQuery(`ALTER ${objType} "${item.objectName}" COMPILE`, {}, { connectionName: item.connectionName });
                vscode.window.showInformationMessage(`${item.objectName} compiled successfully.`);
                objectBrowserProvider.refresh();
            }
            catch (err) {
                vscode.window.showErrorMessage(`Compilation error: ${err.message}`);
            }
        }), vscode.commands.registerCommand('ingSql.dropObject', async (item) => {
            if (!item?.objectName || !item.connectionName) {
                return;
            }
            const typeMap = {
                'table': 'TABLE', 'view': 'VIEW', 'mview': 'MATERIALIZED VIEW',
                'index': 'INDEX', 'sequence': 'SEQUENCE', 'procedure': 'PROCEDURE',
                'function': 'FUNCTION', 'package': 'PACKAGE', 'trigger': 'TRIGGER',
                'type': 'TYPE', 'synonym': 'SYNONYM', 'dblink': 'DATABASE LINK',
            };
            const objType = typeMap[item.objectType] || 'TABLE';
            const confirm = await vscode.window.showWarningMessage(`Drop ${objType} "${item.objectName}"? This cannot be undone.`, { modal: true }, 'Drop');
            if (confirm !== 'Drop') {
                return;
            }
            try {
                const cascade = objType === 'TABLE' ? ' CASCADE CONSTRAINTS PURGE' : '';
                await oracleService.executeNonQuery(`DROP ${objType} "${item.objectName}"${cascade}`, {}, { connectionName: item.connectionName, autoCommit: true });
                vscode.window.showInformationMessage(`${objType} "${item.objectName}" dropped.`);
                objectBrowserProvider.refresh();
            }
            catch (err) {
                vscode.window.showErrorMessage(`Drop error: ${err.message}`);
            }
        }), 
        // SQL Snippets commands
        vscode.commands.registerCommand('ingSql.addSnippet', () => {
            snippetEditorPanel.setSaveHandler(async (data) => {
                await sqlSnippetsProvider.addSnippet(data.name, data.content);
                snippetEditorPanel.close();
            });
            snippetEditorPanel.show();
        }), vscode.commands.registerCommand('ingSql.editSnippet', (item) => {
            snippetEditorPanel.setSaveHandler(async (data) => {
                await sqlSnippetsProvider.updateSnippet(item.id, data.name, data.content);
                snippetEditorPanel.close();
            });
            snippetEditorPanel.show({ id: item.id, name: item.label, content: item.content });
        }), vscode.commands.registerCommand('ingSql.deleteSnippet', async (item) => {
            const confirm = await vscode.window.showWarningMessage(`Are you sure you want to delete snippet "${item.label}"?`, 'Yes', 'No');
            if (confirm === 'Yes') {
                await sqlSnippetsProvider.deleteSnippet(item.id);
            }
        }), vscode.commands.registerCommand('ingSql.insertSnippet', async (item) => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                await editor.insertSnippet(new vscode.SnippetString(item.content));
            }
            else {
                vscode.window.showWarningMessage('No active editor to insert snippet.');
            }
        }), vscode.commands.registerCommand('ingSql.refreshSnippets', () => {
            sqlSnippetsProvider.refresh();
        }));
        if (!buildConfig_1.BUILD_CONFIG.isRestricted) {
            context.subscriptions.push(vscode.commands.registerCommand('ingSql.copySnippet', async (item) => {
                await vscode.env.clipboard.writeText(item.content);
                vscode.window.showInformationMessage(`Snippet "${item.label}" copied to clipboard.`);
            }));
        }
        // Export command (from object browser)
        if (!buildConfig_1.BUILD_CONFIG.isRestricted) {
            context.subscriptions.push(vscode.commands.registerCommand('ingSql.exportData', async (item) => {
                if (!item?.objectName || !item.connectionName) {
                    return;
                }
                const profile = connMgr.getProfiles().find(p => p.name === item.connectionName);
                if (!profile) {
                    return;
                }
                try {
                    const sql = `SELECT * FROM "${item.objectName}"`;
                    const exportResult = await exportService.promptAndExport({
                        format: '', // Will prompt user
                        statement: sql,
                        connectionName: item.connectionName,
                        tableName: item.objectName,
                    });
                    if (exportResult) {
                        await auditLogService.logSuccessfulExport(exportResult, 'OBJECT_BROWSER', item.connectionName, profile.username, item.objectName, sql);
                    }
                }
                catch (err) {
                    await auditLogService.logFailedExport('csv', 'OBJECT_BROWSER', item.connectionName, profile.username, item.objectName, null, err.message);
                    vscode.window.showErrorMessage(`Export error: ${err.message}`);
                }
            }));
        }
        // Transaction commands
        context.subscriptions.push(vscode.commands.registerCommand('ingSql.commit', async () => {
            try {
                await oracleService.commit();
                vscode.window.showInformationMessage('Committed.');
            }
            catch (err) {
                vscode.window.showErrorMessage(`Commit error: ${err.message}`);
            }
        }), vscode.commands.registerCommand('ingSql.rollback', async () => {
            try {
                await oracleService.rollback();
                vscode.window.showInformationMessage('Rolled back.');
            }
            catch (err) {
                vscode.window.showErrorMessage(`Rollback error: ${err.message}`);
            }
        }));
        // SQL History commands
        context.subscriptions.push(vscode.commands.registerCommand('ingSql.clearSqlHistory', () => {
            sqlHistoryProvider.clear();
        }), vscode.commands.registerCommand('ingSql.insertSqlFromHistory', async (sql) => {
            const connLabel = connectionManager_1.ConnectionManager.getInstance().getActiveConnectionName();
            const header = connLabel
                ? `-- SQL from History [${connLabel}]\n`
                : `-- SQL from History\n`;
            const doc = await vscode.workspace.openTextDocument({
                language: 'oraclesql',
                content: header + `-- ${new Date().toLocaleString()}\n\n` + sql + '\n'
            });
            await vscode.window.showTextDocument(doc, { preview: false });
        }));
        // ─── Status Bar ───
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.command = 'ingSql.verifyThickMode';
        const modeStr = oracleService_1.OracleService.isThickMode() ? 'Thick' : 'Thin';
        statusBarItem.text = `$(database) Oracle (${modeStr}): Not Connected`;
        statusBarItem.tooltip = `Oracle Connection Status (Running in ${modeStr} Mode). Click to verify.`;
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);
        connMgr.onDidChangeConnection((name) => {
            if (name) {
                const profile = connMgr.getActiveProfile();
                statusBarItem.text = `$(database) Oracle: ${name}`;
                statusBarItem.tooltip = profile
                    ? `${profile.username}@${profile.host || profile.tnsAlias || 'custom'}:${profile.port}`
                    : name;
                statusBarItem.backgroundColor = undefined;
            }
            else {
                statusBarItem.text = '$(database) Oracle: Not Connected';
                statusBarItem.tooltip = 'Click to manage Oracle connections';
            }
        });
        // ─── Disposables ───
        context.subscriptions.push(objectBrowserView, sqlHistoryView, sqlSnippetsView, { dispose: () => connMgr.dispose() }, { dispose: () => resultsPanel.dispose() }, { dispose: () => dbmsOutputProvider.dispose() }, { dispose: () => auditLogService.dispose() });
        console.log('ING SQL extension activated successfully.');
    }
    catch (err) {
        console.error('ING SQL extension activation error:', err);
        vscode.window.showErrorMessage(`ING SQL extension failed to activate fully: ${err.message}. Some features may not work.`);
    }
}
function deactivate() {
    // Release all worksheet sessions to avoid connection leaks
    worksheetSessionManager_1.WorksheetSessionManager.getInstance().dispose();
}
//# sourceMappingURL=extension.js.map