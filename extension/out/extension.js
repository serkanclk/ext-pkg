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
const sqlWorksheet_1 = require("./commands/sqlWorksheet");
const resultsPanel_1 = require("./panels/resultsPanel");
const objectViewerPanel_1 = require("./panels/objectViewerPanel");
function activate(context) {
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
    const resultsPanel = new resultsPanel_1.ResultsPanel(context.extensionUri);
    const sqlWorksheetCommands = new sqlWorksheet_1.SqlWorksheetCommands(context, resultsPanel, sqlHistoryProvider);
    // ─── Object Viewer Management ───
    const objectViewers = new Map();
    function getObjectViewer(objectName, connectionName) {
        const key = `${connectionName}:${objectName}`;
        let viewer = objectViewers.get(key);
        if (!viewer) {
            viewer = new objectViewerPanel_1.ObjectViewerPanel(context.extensionUri);
            viewer.setExportHandler(data => {
                exportService.promptAndExport({
                    format: data.format,
                    statement: data.sql,
                    connectionName: data.connectionName
                });
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
    }), vscode.commands.registerCommand('ingSql.importData', async (item) => {
        if (item?.connectionName) {
            await importService.promptAndImport(item.connectionName);
            objectBrowserProvider.refresh();
        }
    }), vscode.commands.registerCommand('ingSql.disconnect', (item) => {
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
        viewer.show(item.objectName, objType, item.connectionName, 'data');
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
        viewer.show(item.objectName, objType, item.connectionName, 'columns');
    }), vscode.commands.registerCommand('ingSql.verifyThickMode', () => {
        const config = vscode.workspace.getConfiguration('ingSql');
        const clientPath = config.get('oracleClientPath');
        if (oracleService_1.OracleService.isThickMode()) {
            vscode.window.showInformationMessage(`Oracle Thick Mode is ACTIVE. Using Instant Client at: ${clientPath}`);
        }
        else if (clientPath && clientPath.trim() !== '') {
            vscode.window.showErrorMessage(`Oracle Thick Mode is NOT active, despite client path being set. Check Developer Tools or path permissions. Path: ${clientPath}`);
        }
        else {
            vscode.window.showInformationMessage('Oracle is running in default Thin Mode (No client path specified).');
        }
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
    }));
    // Export command (from object browser)
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
    statusBarItem.command = 'ingSql.addConnection';
    statusBarItem.text = '$(database) Oracle: Not Connected';
    statusBarItem.tooltip = 'Click to manage Oracle connections';
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
    context.subscriptions.push(objectBrowserView, sqlHistoryView, { dispose: () => connMgr.dispose() }, { dispose: () => resultsPanel.dispose() }, { dispose: () => dbmsOutputProvider.dispose() }, { dispose: () => auditLogService.dispose() });
    console.log('ING SQL extension activated successfully.');
}
function deactivate() {
    // Cleanup handled by disposables
}
//# sourceMappingURL=extension.js.map