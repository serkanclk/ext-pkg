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
function activate(context) {
    vscode.window.showInformationMessage('ING SQL Developer extension is activating...');
    console.log('ING SQL Developer extension is now active!');
    // ─── Initialize Oracle Thick Mode ───
    oracleService_1.OracleService.initializeThickMode();
    // ─── Core Services Initialization ───
    const connMgr = connectionManager_1.ConnectionManager.initialize(context);
    const oracleService = oracleService_1.OracleService.getInstance();
    const exportService = exportService_1.ExportService.getInstance(context);
    const importService = importService_1.ImportService.getInstance();
    const auditLogService = auditLogService_1.AuditLogService.getInstance();
    // ─── Initialize UI Components ───
    const objectBrowserProvider = new objectBrowserProvider_1.ObjectBrowserProvider();
    const sqlLanguageProvider = new sqlLanguageProvider_1.SqlLanguageProvider();
    const sqlHistoryProvider = new sqlHistoryProvider_1.SqlHistoryProvider(context);
    const dbmsOutputProvider = new dbmsOutputProvider_1.DbmsOutputProvider();
    const sqlSnippetsProvider = new sqlSnippetsProvider_1.SqlSnippetsProvider(context);
    const resultsPanel = new resultsPanel_1.ResultsPanel(context.extensionUri);
    const snippetEditorPanel = new snippetEditorPanel_1.SnippetEditorPanel(context.extensionUri);
    const sqlWorksheetCommands = new sqlWorksheet_1.SqlWorksheetCommands(context, resultsPanel, sqlHistoryProvider);
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
            await importService.promptAndImport(item.connectionName);
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
        vscode.window.showInformationMessage(`ING SQL Developer v0.1.0 - Mode: ${mode}`);
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
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await editor.edit(edit => {
                edit.insert(editor.selection.active, sql);
            });
        }
        else {
            const doc = await vscode.workspace.openTextDocument({
                language: 'oraclesql',
                content: sql + '\n'
            });
            await vscode.window.showTextDocument(doc);
        }
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
function deactivate() {
    // Cleanup handled by disposables
}
//# sourceMappingURL=extension.js.map