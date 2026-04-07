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
exports.ObjectViewerPanel = void 0;
const vscode = __importStar(require("vscode"));
const oracleService_1 = require("../services/oracleService");
const buildConfig_1 = require("../buildConfig");
class ObjectViewerPanel {
    extensionUri;
    panel;
    currentConnectionName;
    currentObjectName;
    currentObjectType;
    currentSchemaName;
    // Data Grid state tracking
    currentCursorId;
    isExporting = false;
    onExportRequest;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    setExportHandler(handler) {
        this.onExportRequest = handler;
    }
    async show(objectName, objectType, connectionName, schemaName, defaultTab = 'columns') {
        this.currentObjectName = objectName;
        this.currentObjectType = objectType;
        this.currentConnectionName = connectionName;
        this.currentSchemaName = schemaName;
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('ingSqlObjectViewer', `${objectName}`, { viewColumn: vscode.ViewColumn.One, preserveFocus: false }, {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri]
            });
            this.initPanel(this.panel);
        }
        this.panel.title = `${objectName}`;
        this.panel.webview.html = this.getHtmlBase(false);
        // Let the webview initialize, then command it to fetch its own data.
        setTimeout(() => {
            this.panel?.webview.postMessage({ type: 'init', defaultTab });
        }, 100);
    }
    async showQueryResults(result) {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('ingSqlObjectViewer', 'Query Result', { viewColumn: vscode.ViewColumn.One, preserveFocus: false }, {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri]
            });
            this.initPanel(this.panel);
        }
        this.currentConnectionName = 'SQL';
        this.panel.title = `Query Result (${new Date().toLocaleTimeString()})`;
        this.panel.reveal();
        this.panel.webview.html = this.getHtmlBase(true);
        const formattedRows = result.rows.map(row => row.map(val => Buffer.isBuffer(val) ? val.toString('hex').toUpperCase() : val));
        this.currentCursorId = result.cursorId;
        setTimeout(() => {
            this.panel?.webview.postMessage({ type: 'init', defaultTab: 'data' });
            this.panel?.webview.postMessage({
                type: 'renderData',
                columns: result.columns,
                rows: formattedRows,
                rowCount: result.rowCount,
                executionTime: result.executionTime,
                hasMore: result.hasMore,
                statement: result.statement
            });
        }, 100);
    }
    static createOrShowQueryResults(panel, result, extensionUri) {
        const instance = new ObjectViewerPanel(extensionUri);
        instance.panel = panel;
        instance.initPanel(panel);
        instance.showQueryResults(result);
        return instance;
    }
    initPanel(panel) {
        panel.onDidDispose(() => {
            this.panel = undefined;
            this.currentCursorId = undefined;
        });
        panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    }
    async handleMessage(message) {
        if (!this.currentObjectName || !this.currentConnectionName || !this.currentObjectType) {
            return;
        }
        const oracleService = oracleService_1.OracleService.getInstance();
        try {
            switch (message.type) {
                case 'fetchTab':
                    await this.fetchTabData(message.tabId);
                    break;
                case 'loadMoreData':
                    if (this.currentCursorId) {
                        const config = vscode.workspace.getConfiguration('ingSql');
                        const batchSize = config.get('resultGrid.maxRows', 100);
                        const { rows, hasMore } = await oracleService.fetchMoreRows(this.currentCursorId, batchSize);
                        const formattedRows = rows.map(row => row.map(val => Buffer.isBuffer(val) ? val.toString('hex').toUpperCase() : val));
                        this.panel?.webview.postMessage({
                            type: 'appendData',
                            rows: formattedRows,
                            hasMore: hasMore
                        });
                    }
                    break;
                case 'exportData':
                    if (buildConfig_1.BUILD_CONFIG.isRestricted)
                        return;
                    if (this.onExportRequest) {
                        const sql = `SELECT * FROM "${this.currentObjectName}"`;
                        this.onExportRequest({
                            format: message.format,
                            sql: sql,
                            connectionName: this.currentConnectionName,
                            objectName: this.currentObjectName
                        });
                    }
                    break;
                case 'copyCell':
                    if (!buildConfig_1.BUILD_CONFIG.isRestricted) {
                        vscode.env.clipboard.writeText(message.value);
                    }
                    break;
                case 'countRows': {
                    try {
                        const oracleService = oracleService_1.OracleService.getInstance();
                        let countSql;
                        if (message.statement) {
                            // Query result mode — use the original query statement
                            countSql = `SELECT COUNT(*) AS CNT FROM (${message.statement.replace(/;\s*$/, '')})`;
                        }
                        else if (this.currentObjectName) {
                            // Object data mode — count from the table
                            const qualifiedName = this.currentSchemaName
                                ? `"${this.currentSchemaName}"."${this.currentObjectName}"`
                                : `"${this.currentObjectName}"`;
                            countSql = `SELECT COUNT(*) AS CNT FROM ${qualifiedName}`;
                        }
                        else {
                            break;
                        }
                        const countResult = await oracleService.executeQuery(countSql, {}, {
                            maxRows: 1,
                            connectionName: this.currentConnectionName
                        });
                        const count = countResult.rows?.[0]?.[0] ?? 0;
                        this.panel?.webview.postMessage({ type: 'countRowsResult', count: Number(count) });
                    }
                    catch (err) {
                        vscode.window.showErrorMessage(`Count Rows Error: ${err.message}`);
                        this.panel?.webview.postMessage({ type: 'countRowsResult', count: -1, error: err.message });
                    }
                    break;
                }
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Object Viewer Error: ${err.message}`);
            this.panel?.webview.postMessage({ type: 'error', error: err.message, tabId: message.tabId });
        }
    }
    async fetchTabData(tabId) {
        if (!this.currentObjectName || !this.currentConnectionName || !this.currentObjectType) {
            return;
        }
        const oracleService = oracleService_1.OracleService.getInstance();
        try {
            if (tabId === 'columns') {
                if (['TABLE', 'VIEW', 'MATERIALIZED VIEW'].includes(this.currentObjectType)) {
                    const columns = await oracleService.getTableColumns(this.currentObjectName, this.currentConnectionName, this.currentSchemaName);
                    this.panel?.webview.postMessage({ type: 'renderColumns', columns });
                }
                else {
                    this.panel?.webview.postMessage({ type: 'renderColumns', columns: [] });
                }
            }
            else if (tabId === 'data') {
                if (['TABLE', 'VIEW', 'MATERIALIZED VIEW'].includes(this.currentObjectType)) {
                    const qualifiedName = this.currentSchemaName
                        ? `"${this.currentSchemaName}"."${this.currentObjectName}"`
                        : `"${this.currentObjectName}"`;
                    const sql = `SELECT * FROM ${qualifiedName}`;
                    // Fetch first chunk
                    const config = vscode.workspace.getConfiguration('ingSql');
                    const batchSize = config.get('resultGrid.maxRows', 100);
                    const result = await oracleService.executeCursor(sql, {}, {
                        connectionName: this.currentConnectionName,
                        batchSize
                    });
                    this.currentCursorId = result.cursorId;
                    const formattedRows = result.rows.map(row => row.map(val => Buffer.isBuffer(val) ? val.toString('hex').toUpperCase() : val));
                    this.panel?.webview.postMessage({
                        type: 'renderData',
                        columns: result.columns,
                        rows: formattedRows,
                        rowCount: result.rowCount,
                        executionTime: result.executionTime,
                        hasMore: result.hasMore,
                        statement: result.statement
                    });
                }
            }
            else if (tabId === 'constraints') {
                const constraints = await oracleService.getConstraints(this.currentObjectName, this.currentConnectionName, this.currentSchemaName);
                this.panel?.webview.postMessage({ type: 'renderConstraints', constraints });
            }
            else if (tabId === 'indexes') {
                const indexes = await oracleService.getIndexes(this.currentObjectName, this.currentConnectionName, this.currentSchemaName);
                this.panel?.webview.postMessage({ type: 'renderIndexes', indexes });
            }
            else if (tabId === 'ddl') {
                const ddl = await oracleService.getObjectDDL(this.currentObjectName, this.currentObjectType, this.currentConnectionName, this.currentSchemaName);
                this.panel?.webview.postMessage({ type: 'renderDdl', ddl: ddl || 'No DDL available.' });
            }
            else if (tabId === 'dependencies') {
                const { dependencies, referencedBy } = await oracleService.getDependencies(this.currentObjectName, this.currentConnectionName, this.currentSchemaName);
                this.panel?.webview.postMessage({ type: 'renderDependencies', dependencies, referencedBy });
            }
            else if (tabId === 'stats') {
                const stats = await oracleService.getStatistics(this.currentObjectName, this.currentConnectionName, this.currentSchemaName);
                this.panel?.webview.postMessage({ type: 'renderStats', stats });
            }
            else if (tabId === 'grants') {
                const grants = await oracleService.getGrants(this.currentObjectName, this.currentConnectionName, this.currentSchemaName);
                this.panel?.webview.postMessage({ type: 'renderGrants', grants });
            }
            else if (tabId === 'triggers') {
                const triggers = await oracleService.getTriggers(this.currentObjectName, this.currentConnectionName, this.currentSchemaName);
                this.panel?.webview.postMessage({ type: 'renderTriggers', triggers });
            }
            else if (tabId === 'details') {
                const details = await oracleService.getDetails(this.currentObjectName, this.currentConnectionName, this.currentSchemaName);
                this.panel?.webview.postMessage({ type: 'renderDetails', details });
            }
            else if (tabId === 'partitions') {
                const partitions = await oracleService.getPartitions(this.currentObjectName, this.currentConnectionName, this.currentSchemaName);
                this.panel?.webview.postMessage({ type: 'renderPartitions', partitions });
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Object Viewer Error: ${err.message}`);
            this.panel?.webview.postMessage({ type: 'error', error: err.message, tabId: tabId });
        }
    }
    getHtmlBase(hideTabs = false) {
        const config = vscode.workspace.getConfiguration('ingSql');
        const nullDisplay = config.get('resultGrid.nullDisplay', '(null)');
        // Build breadcrumb
        const breadcrumb = hideTabs ? '' : `
            <div class="breadcrumb">
                <span class="breadcrumb-item">${this.currentConnectionName || ''}</span>
                <span class="breadcrumb-sep">&gt;</span>
                <span class="breadcrumb-item">object</span>
                <span class="breadcrumb-sep">&gt;</span>
                <span class="breadcrumb-item">${this.currentSchemaName || ''}</span>
                <span class="breadcrumb-sep">&gt;</span>
                <span class="breadcrumb-item">${this.currentObjectType || ''}</span>
                <span class="breadcrumb-sep">&gt;</span>
                <span class="breadcrumb-item-active">${this.currentObjectName || ''}</span>
            </div>
        `;
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Object Viewer</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
            /* ING / Oracle Orange Theme */
            --primary-color: #FF6200;
            --primary-hover: #E55800;
            --bg-color: var(--vscode-editor-background);
            --header-bg: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
            --border-color: var(--vscode-widget-border, var(--vscode-panel-border));
            --fg-color: var(--vscode-editor-foreground);
            --tab-inactive: var(--vscode-tab-inactiveForeground, #969696);
            --tab-active: var(--vscode-tab-activeForeground, #ffffff);
            --tab-hover: var(--vscode-tab-activeForeground, #ffffff);
            --row-hover: var(--vscode-list-hoverBackground);
            --row-alt: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
        }

        body {
            font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
            font-size: var(--vscode-font-size, 12px);
            color: var(--fg-color);
            background: var(--bg-color);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            margin: 0;
            padding: 0;
            ${buildConfig_1.BUILD_CONFIG.isRestricted ? 'user-select: none;' : ''}
        }

        /* Breadcrumb Style */
        .breadcrumb {
            display: flex;
            align-items: center;
            padding: 8px 16px;
            background: var(--header-bg);
            font-size: 11px;
            color: var(--tab-inactive);
            border-bottom: 1px solid var(--border-color);
            gap: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            flex-shrink: 0;
        }
        .breadcrumb-sep {
            color: #555555;
            font-size: 10px;
        }
        .breadcrumb-item-active {
            color: var(--fg-color);
            font-weight: 600;
        }

        /* Top Tab Bar */
        .tab-bar {
            display: flex;
            background: var(--header-bg);
            border-bottom: 1px solid var(--border-color);
            padding: 0 8px;
            flex-shrink: 0;
            overflow-x: auto;
            scrollbar-width: none;
        }
        .tab-bar::-webkit-scrollbar { display: none; }

        .tab {
            padding: 10px 16px;
            cursor: pointer;
            color: var(--tab-inactive);
            white-space: nowrap;
            position: relative;
            transition: color 0.1s;
            font-size: 12px;
        }
        .tab:hover {
            color: var(--tab-hover);
        }
        .tab.active {
            color: var(--tab-active);
            font-weight: 500;
        }
        .tab.active::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 2px;
            background-color: var(--primary-color);
        }

        /* Content Area */
        .tab-content {
            flex: 1;
            display: none;
            flex-direction: column;
            overflow: hidden;
        }
        .tab-content.active {
            display: flex;
        }

        /* Generic Table Styles for Metadata Tabs */
        .generic-table-container {
            flex: 1;
            overflow: auto;
            padding: 16px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        th {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            padding: 6px 10px;
            text-align: left;
            font-weight: 600;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        td {
            border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
            padding: 4px 10px;
        }
        tr:hover td { background: var(--row-hover); }
        .obj-name { color: var(--primary-color); font-weight: 600; }
        
        /* DDL Tab */
        .ddl-container {
            flex: 1;
            padding: 16px;
            overflow: auto;
        }
        pre.ddl {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 12px;
            color: var(--vscode-editorText-foreground);
        }

        /* Loader */
        .loader {
            display: none;
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
        .loader.show { display: block; }
        
        /* Error */
        .error-msg {
            color: var(--vscode-errorForeground);
            padding: 16px;
            display: none;
        }

        /* Toolbar & Data Grid Specifics */
        .toolbar {
            display: flex;
            align-items: center;
            padding: 6px 12px;
            background: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-editorWidget-border);
            flex-shrink: 0;
            gap: 8px;
        }
        .toolbar-right {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-left: auto;
        }
        .toolbar .info { font-size: 11px; color: var(--vscode-descriptionForeground); }
        
        button.load-more-btn {
            background-color: #333333;
            color: #FFFFFF;
            border: none;
            padding: 4px 12px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: background-color 0.2s;
        }
        button.load-more-btn:hover:not(:disabled) {
            background-color: #444444;
        }
        button:disabled { opacity: 0.5; cursor: not-allowed; }

        .icon-btn {
            background: transparent; color: var(--fg-color); border: none; padding: 4px; border-radius: 4px;
            cursor: pointer; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
            transition: background-color 0.2s, color 0.2s;
        }
        .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--primary-color); }
        .icon-btn svg { width: 16px; height: 16px; fill: currentColor; }
        
        .filter-bar {
            display: none; padding: 6px 12px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-editorWidget-border);
        }
        .filter-bar.show { display: flex; }
        .filter-bar input { flex: 1; padding: 4px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px; font-family: inherit; font-size: 12px; }
        
        .data-grid-container { flex: 1; overflow: auto; position: relative; }
        .data-grid-container td { white-space: nowrap; max-width: 400px; overflow: hidden; text-overflow: ellipsis; cursor: default; }
        .data-grid-container tr.selected td { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
        .null-value { color: var(--vscode-descriptionForeground); font-style: italic; }
        .number-value { text-align: right; font-variant-numeric: tabular-nums; }
        .row-number { color: var(--vscode-descriptionForeground); text-align: right; border-right: 2px solid var(--vscode-editorWidget-border); background: var(--vscode-editorWidget-background); position: sticky; left: 0; z-index: 5; min-width: 35px; padding-right: 8px; font-size: 11px; }
        
        th.sort-asc::after { content: ' \u25b2'; opacity: 0.7; }
        th.sort-desc::after { content: ' \u25bc'; opacity: 0.7; }

        th .col-label {
            cursor: pointer; display: inline-block;
            max-width: calc(100% - 8px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        th .col-label.sort-asc::after { content: ' \u25b2'; opacity: 0.7; }
        th .col-label.sort-desc::after { content: ' \u25bc'; opacity: 0.7; }

        /* ── Column Resize ── */
        th { position: relative; }
        th .col-resizer {
            position: absolute; right: -2px; top: 0; bottom: 0; width: 5px;
            cursor: col-resize; z-index: 20; background: transparent;
        }
        th .col-resizer:hover, th .col-resizer.active { background: var(--primary-color); }
        .ctx-menu {
            position: fixed; z-index: 1000; min-width: 180px;
            background: var(--vscode-menu-background, var(--header-bg));
            color: var(--vscode-menu-foreground, var(--fg-color));
            border: 1px solid var(--vscode-menu-border, var(--border-color));
            border-radius: 4px; padding: 4px 0;
            box-shadow: 0 4px 16px rgba(0,0,0,0.3); display: none;
            font-size: 12px;
        }
        .ctx-menu.show { display: block; }
        .ctx-menu-item {
            padding: 5px 20px; cursor: pointer; white-space: nowrap;
            display: flex; align-items: center; gap: 8px;
        }
        .ctx-menu-item:hover {
            background: var(--vscode-menu-selectionBackground, var(--primary-color));
            color: var(--vscode-menu-selectionForeground, #fff);
        }
        .ctx-menu-sep { height: 1px; margin: 4px 8px; background: var(--border-color); }

        /* ── Count Rows Modal ── */
        .modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 2000;
            display: none; align-items: center; justify-content: center;
        }
        .modal-overlay.show { display: flex; }
        .modal-box {
            background: var(--vscode-editorWidget-background, #252526);
            border: 1px solid var(--border-color); border-radius: 6px;
            padding: 20px 30px; min-width: 220px; text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .modal-box h3 { margin-bottom: 14px; font-size: 14px; font-weight: 600; }
        .modal-box .modal-count { font-size: 16px; margin-bottom: 16px; }
        .modal-box .modal-actions { display: flex; gap: 8px; justify-content: center; }
        .modal-box button {
            padding: 5px 16px; border-radius: 3px; border: 1px solid var(--border-color);
            cursor: pointer; font-size: 12px;
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
        }
        .modal-box button:hover { opacity: 0.9; }
        .modal-box button.secondary { background: transparent; color: var(--fg-color); }

        /* Status Bar */
        .status-bar {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 4px 12px;
            background: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            font-size: 11px;
            flex-shrink: 0;
            border-top: 1px solid var(--vscode-statusBar-border);
        }
        
    </style>
</head>
<body>
    
    <!-- Breadcrumb -->
    ${breadcrumb}
    
    <!-- Tab Bar -->
    <div class="tab-bar" style="${hideTabs ? 'display: none;' : ''}">
        <div class="tab" data-target="columns">Columns</div>
        <div class="tab" data-target="data">Data</div>
        <div class="tab" data-target="constraints">Constraints</div>
        <div class="tab" data-target="grants">Grants</div>
        <div class="tab" data-target="stats">Statistics</div>
        <div class="tab" data-target="triggers">Triggers</div>
        <div class="tab" data-target="dependencies">Dependencies</div>
        <div class="tab" data-target="details">Details</div>
        <div class="tab" data-target="partitions">Partitions</div>
        <div class="tab" data-target="indexes">Indexes</div>
        <div class="tab" data-target="ddl">SQL</div>
    </div>

    <!-- Loaders & Errors -->
    <div id="globalLoader" class="loader">Loading data...</div>
    <div id="globalError" class="error-msg"></div>

    <!-- Tab Contents -->
    
    <!-- Columns Tab -->
    <div id="columns" class="tab-content">
        <div class="generic-table-container">
            <table>
                <thead><tr><th class="row-number">#</th><th>Name</th><th>Type</th><th>Nullable</th><th>Default</th><th>Comments</th></tr></thead>
                <tbody id="columnsBody"></tbody>
            </table>
        </div>
    </div>

    <!-- Constraints Tab -->
    <div id="constraints" class="tab-content">
        <div class="generic-table-container">
            <table>
                <thead><tr><th>Name</th><th>Type</th><th>Columns</th><th>References</th><th>Status</th></tr></thead>
                <tbody id="constraintsBody"></tbody>
            </table>
        </div>
    </div>

    <!-- Grants Tab -->
    <div id="grants" class="tab-content">
        <div class="generic-table-container">
            <table>
                <thead><tr><th>Grantee</th><th>Privilege</th><th>Grantable</th><th>Grantor</th></tr></thead>
                <tbody id="grantsBody"></tbody>
            </table>
        </div>
    </div>

    <!-- Statistics Tab -->
    <div id="stats" class="tab-content">
        <div class="generic-table-container">
            <table>
                <thead><tr><th>Name</th><th>Value</th></tr></thead>
                <tbody id="statsBody"></tbody>
            </table>
        </div>
    </div>

    <!-- Triggers Tab -->
    <div id="triggers" class="tab-content">
        <div class="generic-table-container">
            <table>
                <thead><tr><th>Name</th><th>Type</th><th>Event</th><th>Status</th><th>Description</th></tr></thead>
                <tbody id="triggersBody"></tbody>
            </table>
        </div>
    </div>

    <!-- Flashback Tab -->
    <!-- Indexes Tab -->
    <div id="indexes" class="tab-content">
        <div class="generic-table-container">
            <table>
                <thead><tr><th>Name</th><th>Type</th><th>Uniqueness</th><th>Columns</th><th>Status</th></tr></thead>
                <tbody id="indexesBody"></tbody>
            </table>
        </div>
    </div>

    <!-- SQL DDL Tab -->
    <div id="ddl" class="tab-content">
        <div class="ddl-container">
            <pre class="ddl" id="ddlBody"></pre>
        </div>
    </div>

    <!-- Details Tab -->
    <div id="details" class="tab-content">
        <div class="generic-table-container">
            <table>
                <thead><tr><th>Property</th><th>Value</th></tr></thead>
                <tbody id="detailsBody"></tbody>
            </table>
        </div>
    </div>

    <!-- Partitions Tab -->
    <div id="partitions" class="tab-content">
        <div class="generic-table-container">
            <table>
                <thead><tr><th>Name</th><th>High Value</th><th>Tablespace</th><th>Logging</th><th>Rows</th><th>Last Analyzed</th></tr></thead>
                <tbody id="partitionsBody"></tbody>
            </table>
        </div>
    </div>

    <!-- JSON Schema Tab -->
    <!-- Dependencies Tab -->
    <div id="dependencies" class="tab-content">
        <div class="generic-table-container">
            <h3 style="padding: 10px 0; color: var(--primary-color); border-bottom: 1px solid var(--border-color); margin-bottom: 10px;">Depends On</h3>
            <table>
                <thead><tr><th>Owner</th><th>Name</th><th>Type</th><th>Dependency Type</th></tr></thead>
                <tbody id="dependenciesBody"></tbody>
            </table>

            <h3 style="padding: 10px 0; color: var(--primary-color); border-bottom: 1px solid var(--border-color); margin-top: 30px; margin-bottom: 10px;">Referenced By</h3>
            <table>
                <thead><tr><th>Owner</th><th>Name</th><th>Type</th><th>Dependency Type</th></tr></thead>
                <tbody id="referencedByBody"></tbody>
            </table>
        </div>
    </div>

    <!-- Data Tab (Interactive Grid) -->
        <div id="data" class="tab-content">
        <div class="toolbar">
            <span class="info" id="dataInfoText">Initializing grid...</span>
            <button id="loadMoreBtn" class="load-more-btn" onclick="requestLoadMore()" style="display: none;"> ↓ Load More</button>
            <div class="toolbar-right">
                ${buildConfig_1.BUILD_CONFIG.isRestricted ? '' : `
                <button class="icon-btn" onclick="triggerExport()" title="Export">
                    <svg viewBox="0 0 16 16"><path d="M14 6L14 14L2 14L2 6L4 6L4 12L12 12L12 6L14 6ZM8 10L11 7L9 7L9 2L7 2L7 7L5 7L8 10Z"/></svg>
                </button>
                `}
                <button class="icon-btn" onclick="toggleDataFilter()" title="Filter">
                    <svg viewBox="0 0 16 16"><path d="M14.5 3L1.5 3L6.5 8.7L6.5 13L9.5 11.5L9.5 8.7L14.5 3ZM12.3 4L3.7 4L7.5 8.3L7.5 10.6L8.5 10.1L8.5 8.3L12.3 4Z"/></svg>
                </button>
            </div>
        </div>
        <div class="filter-bar" id="dataFilterBar">
            <input type="text" id="dataFilterInput" placeholder="Filter rows locally..." oninput="applyDataFilter()">
        </div>
        <div class="data-grid-container">
            <table>
                <thead id="dataTableHead"></thead>
                <tbody id="dataTableBody"></tbody>
            </table>
        </div>
    </div>
    <!-- Context Menu -->
    <div class="ctx-menu" id="ctxMenu">
        <div class="ctx-menu-item" onclick="ctxCountRows()">Count Rows</div>
        <div class="ctx-menu-sep"></div>
        ${buildConfig_1.BUILD_CONFIG.isRestricted ? '' : '<div class="ctx-menu-item" onclick="ctxCopyHeaders()">Copy Selected Column Headers</div>'}
        ${buildConfig_1.BUILD_CONFIG.isRestricted ? '' : '<div class="ctx-menu-item" onclick="triggerExport()">Export</div>'}
        ${buildConfig_1.BUILD_CONFIG.isRestricted ? '' : '<div class="ctx-menu-item" onclick="ctxCopyCell()">Copy</div>'}
    </div>
    <!-- Count Rows Modal -->
    <div class="modal-overlay" id="countModal">
        <div class="modal-box">
            <h3>Row Count</h3>
            <div class="modal-count" id="countModalValue">0 Rows</div>
            <div class="modal-actions">
                <button class="secondary" onclick="ctxCopyCount()">Copy</button>
                <button onclick="closeCountModal()">Ok</button>
            </div>
        </div>
    </div>

    <!-- Status Bar -->
    <div class="status-bar">
        <span id="statusText">Ready</span>
        <span id="statusRowCount" style="margin-left: auto;"></span>
        <span id="statusExecTime"></span>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const NULL_DISPLAY = '${nullDisplay}';

        if (${buildConfig_1.BUILD_CONFIG.isRestricted}) {
            document.addEventListener('contextmenu', e => e.preventDefault());
            document.addEventListener('copy', e => {
                e.preventDefault();
                return false;
            });
            document.addEventListener('keydown', e => {
                if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
                    e.preventDefault();
                }
            });
        }
        
        let loadedTabs = new Set();
        let currentTabId = '';
        
        // Data Grid State
        let dataColumns = [];
        let dataRows = [];
        let dataFilteredRows = [];
        let sortColIdx = -1;
        let sortDir = 'asc';

        // Numeric string comparison for NUMBER-as-string sort (arbitrary precision)
        function numericStringCmp(a, b) {
            const na = a[0] === '-', nb = b[0] === '-';
            if (na !== nb) return na ? -1 : 1;
            const aa = na ? a.slice(1) : a, bb = nb ? b.slice(1) : b;
            if (aa.indexOf('.') === -1 && bb.indexOf('.') === -1) {
                const ld = aa.length - bb.length;
                if (ld !== 0) return na ? -ld : ld;
                const lx = aa > bb ? 1 : aa < bb ? -1 : 0;
                return na ? -lx : lx;
            }
            const fn = parseFloat(a), fb = parseFloat(b);
            return isNaN(fn) || isNaN(fb) ? a.localeCompare(b) : fn - fb;
        }

        // --- Core UI Logic ---

        function showLoader(show) { 
            document.getElementById('globalLoader').classList.toggle('show', show); 
            if (show) updateStatus('Loading...');
        }
        function showError(msg) { 
            const err = document.getElementById('globalError');
            if (msg) { 
                err.textContent = msg; 
                err.style.display = 'block'; 
                updateStatus('Error occurred');
            }
            else { err.style.display = 'none'; }
        }
        function updateStatus(text) {
            document.getElementById('statusText').textContent = text;
        }

        function switchTab(tabId) {
            if (currentTabId === tabId) return;
            
            // UI Toggle
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            
            document.querySelector('.tab[data-target="' + tabId + '"]').classList.add('active');
            document.getElementById(tabId).classList.add('active');
            
            currentTabId = tabId;
            showError();
            updateStatus('Tab: ' + tabId.toUpperCase());

            // Lazy Load Data
            if (!loadedTabs.has(tabId)) {
                showLoader(true);
                vscode.postMessage({ type: 'fetchTab', tabId: tabId });
            }
        }

        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => switchTab(e.currentTarget.getAttribute('data-target')));
        });

        // --- Ext Message Handler ---
        window.addEventListener('message', event => {
            const msg = event.data;
            showLoader(false);

            if (msg.type === 'init') {
                switchTab(msg.defaultTab);
            }
            else if (msg.type === 'error') {
                showError(msg.error);
            }
            else if (msg.type === 'renderColumns') {
                loadedTabs.add('columns');
                const html = msg.columns.map(c => {
                    let tStr = c.dataType;
                    if (c.dataPrecision !== null) tStr += '(' + c.dataPrecision + (c.dataScale !== null ? ',' + c.dataScale : '') + ')';
                    else if (['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR', 'RAW'].includes(c.dataType)) tStr += '(' + c.dataLength + ')';
                    return '<tr><td class="row-number">' + c.columnId + '</td><td class="obj-name">' + c.name + '</td><td>' + tStr + '</td><td>' + (c.nullable === 'Y' ? '✓' : '✗') + '</td><td>' + (c.defaultValue || '') + '</td><td>' + (c.comments || '') + '</td></tr>';
                }).join('');
                document.getElementById('columnsBody').innerHTML = html || '<tr><td colspan="6">No columns found or not a table/view.</td></tr>';
                updateStatus('Columns loaded');
            }
            else if (msg.type === 'renderConstraints') {
                loadedTabs.add('constraints');
                const html = msg.constraints.map(c => '<tr><td class="obj-name">' + c.name + '</td><td>' + c.type + '</td><td>' + c.columns + '</td><td>' + (c.refTable || '') + '</td><td>' + c.status + '</td></tr>').join('');
                document.getElementById('constraintsBody').innerHTML = html || '<tr><td colspan="5">No constraints.</td></tr>';
                updateStatus('Constraints loaded');
            }
            else if (msg.type === 'renderIndexes') {
                loadedTabs.add('indexes');
                const html = msg.indexes.map(i => '<tr><td class="obj-name">' + i.name + '</td><td>' + i.type + '</td><td>' + i.uniqueness + '</td><td>' + i.columns + '</td><td>' + i.status + '</td></tr>').join('');
                document.getElementById('indexesBody').innerHTML = html || '<tr><td colspan="5">No indexes.</td></tr>';
                updateStatus('Indexes loaded');
            }
            else if (msg.type === 'renderDdl') {
                loadedTabs.add('ddl');
                document.getElementById('ddlBody').textContent = msg.ddl;
                updateStatus('SQL DDL loaded');
            }
            else if (msg.type === 'renderData') {
                loadedTabs.add('data');
                dataColumns = msg.columns;
                dataColumns._statement = msg.statement || null;
                dataRows = msg.rows;
                dataFilteredRows = [...dataRows];
                
                updateDataInfo(msg.rowCount, msg.hasMore, msg.executionTime);
                renderDataTable();
                updateStatus('Data loaded');
            }
            else if (msg.type === 'renderDependencies') {
                loadedTabs.add('dependencies');
                const depsHtml = msg.dependencies.map(d => '<tr><td>' + d.OWNER + '</td><td class="obj-name">' + d.NAME + '</td><td>' + d.TYPE + '</td><td>' + d.DEPENDENCY_TYPE + '</td></tr>').join('');
                document.getElementById('dependenciesBody').innerHTML = depsHtml || '<tr><td colspan="4">No outgoing dependencies.</td></tr>';
                
                const refHtml = msg.referencedBy.map(d => '<tr><td>' + d.OWNER + '</td><td class="obj-name">' + d.NAME + '</td><td>' + d.TYPE + '</td><td>' + d.DEPENDENCY_TYPE + '</td></tr>').join('');
                document.getElementById('referencedByBody').innerHTML = refHtml || '<tr><td colspan="4">No incoming dependencies.</td></tr>';
                
                updateStatus('Dependencies loaded');
            }
            else if (msg.type === 'renderGrants') {
                loadedTabs.add('grants');
                const html = msg.grants.map(i => '<tr><td>'+i.GRANTEE+'</td><td>'+i.PRIVILEGE+'</td><td>'+i.GRANTABLE+'</td><td>'+i.GRANTOR+'</td></tr>').join('');
                document.getElementById('grantsBody').innerHTML = html || '<tr><td colspan="4">No grants found.</td></tr>';
                updateStatus('Grants loaded');
            }
            else if (msg.type === 'renderStats') {
                loadedTabs.add('stats');
                const html = msg.stats.map(i => '<tr><td class="obj-name">'+i.NAME+'</td><td>'+(i.VALUE ?? '')+'</td></tr>').join('');
                document.getElementById('statsBody').innerHTML = html || '<tr><td colspan="2">No statistics found.</td></tr>';
                updateStatus('Statistics loaded');
            }
            else if (msg.type === 'renderTriggers') {
                loadedTabs.add('triggers');
                const html = msg.triggers.map(i => '<tr><td class="obj-name">'+i.TRIGGER_NAME+'</td><td>'+i.TRIGGER_TYPE+'</td><td>'+i.TRIGGERING_EVENT+'</td><td>'+i.STATUS+'</td><td>'+(i.DESCRIPTION || '')+'</td></tr>').join('');
                document.getElementById('triggersBody').innerHTML = html || '<tr><td colspan="5">No triggers found.</td></tr>';
                updateStatus('Triggers loaded');
            }
            else if (msg.type === 'renderDetails') {
                loadedTabs.add('details');
                const html = msg.details.map(i => '<tr><td class="obj-name">'+i.NAME+'</td><td>'+(i.VALUE ?? '')+'</td></tr>').join('');
                document.getElementById('detailsBody').innerHTML = html || '<tr><td colspan="2">No details found.</td></tr>';
                updateStatus('Details loaded');
            }
            else if (msg.type === 'renderPartitions') {
                loadedTabs.add('partitions');
                const html = msg.partitions.map(i => '<tr><td class="obj-name">'+i.PARTITION_NAME+'</td><td>'+(i.HIGH_VALUE || '')+'</td><td>'+i.TABLESPACE_NAME+'</td><td>'+i.LOGGING+'</td><td>'+(i.NUM_ROWS || '')+'</td><td>'+(i.LAST_ANALYZED || '')+'</td></tr>').join('');
                document.getElementById('partitionsBody').innerHTML = html || '<tr><td colspan="6">No partitions found.</td></tr>';
                updateStatus('Partitions loaded');
            }
            else if (msg.type === 'appendData') {
                const MAX_BROWSER_ROWS = 10000;
                dataRows = dataRows.concat(msg.rows);
                dataFilteredRows = [...dataRows];
                applyDataFilter();
                
                const timeStr = document.getElementById('statusExecTime').textContent.replace('Time: ', '').replace('ms', '');
                const atLimit = dataRows.length >= MAX_BROWSER_ROWS;
                updateDataInfo(dataRows.length, atLimit ? false : msg.hasMore, timeStr);
                
                const btn = document.getElementById('loadMoreBtn');
                if (atLimit) {
                    btn.innerHTML = '⚠ Max rows (10,000) reached — use Export for full data';
                    btn.disabled = true;
                    btn.style.display = 'flex';
                } else {
                    btn.innerHTML = '↓ Load More';
                    btn.disabled = false;
                }
                updateStatus('Additional rows loaded');
            }
            else if (msg.type === 'countRowsResult') {
                if (msg.count >= 0) {
                    document.getElementById('countModalValue').textContent = msg.count.toLocaleString() + ' Rows';
                } else {
                    document.getElementById('countModalValue').textContent = 'Error: ' + (msg.error || 'Unknown');
                }
            }
        });

        // --- Data Grid Methods ---

        function updateDataInfo(count, hasMore, time) {
            const infoText = count + ' rows' + (hasMore ? '+' : '') + ' • ' + time + 'ms';
            document.getElementById('dataInfoText').textContent = infoText;
            document.getElementById('statusRowCount').textContent = 'Rows: ' + count + (hasMore ? '+' : '');
            document.getElementById('statusExecTime').textContent = 'Time: ' + time + 'ms';
            document.getElementById('loadMoreBtn').style.display = hasMore ? 'flex' : 'none';
        }

        function triggerExport() {
            vscode.postMessage({ type: 'exportData' });
            updateStatus('Export triggered');
        }

        function requestLoadMore() {
            const btn = document.getElementById('loadMoreBtn');
            btn.innerHTML = 'Loading...';
            btn.disabled = true;
            vscode.postMessage({ type: 'loadMoreData' });
            updateStatus('Fetching more rows...');
        }

        function toggleDataFilter() {
            const fb = document.getElementById('dataFilterBar');
            fb.classList.toggle('show');
            if (fb.classList.contains('show')) {
                document.getElementById('dataFilterInput').focus();
            } else {
                document.getElementById('dataFilterInput').value = '';
                applyDataFilter();
            }
        }

        function applyDataFilter() {
            const term = document.getElementById('dataFilterInput').value.toLowerCase();
            if (!term) { dataFilteredRows = [...dataRows]; }
            else {
                dataFilteredRows = dataRows.filter(r => r.some(c => String(c ?? '').toLowerCase().includes(term)));
            }

            if (sortColIdx >= 0) {
                const DATE_TYPES = ['DATE','TIMESTAMP','TIMESTAMP WITH TIME ZONE','TIMESTAMP WITH LOCAL TIME ZONE'];
                const isDate = DATE_TYPES.includes(dataColumns[sortColIdx]?.dbType);
                dataFilteredRows.sort((a, b) => {
                    const va = a[sortColIdx], vb = b[sortColIdx];
                    if (va === null && vb === null) return 0;
                    if (va === null) return 1; if (vb === null) return -1;
                    if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
                    // NUMBER columns are fetched as strings for full Oracle precision
                    const isNum = ['NUMBER','BINARY_FLOAT','BINARY_DOUBLE','FLOAT','INTEGER','INT'].includes(dataColumns[sortColIdx]?.dbType);
                    if (isNum && typeof va === 'string' && typeof vb === 'string') {
                        const cmp = numericStringCmp(va, vb);
                        return sortDir === 'asc' ? cmp : -cmp;
                    }
                    if (isDate) {
                        const da = new Date(String(va)).getTime(), db = new Date(String(vb)).getTime();
                        if (!isNaN(da) && !isNaN(db)) return sortDir === 'asc' ? da - db : db - da;
                    }
                    return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
                });
            }

            renderDataTable();
        }

        function sortDataBy(idx) {
            if (sortColIdx === idx) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            else { sortColIdx = idx; sortDir = 'asc'; }
            applyDataFilter();
        }

        window.sortDataBy = sortDataBy; // Export to global for inline onclick

        // ── Context Menu ──
        let ctxTargetCell = null;
        function showCtxMenu(e) {
            if (${buildConfig_1.BUILD_CONFIG.isRestricted}) return;
            e.preventDefault();
            const menu = document.getElementById('ctxMenu');
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';
            menu.classList.add('show');
            ctxTargetCell = e.target.closest('td');
        }
        function hideCtxMenu() { document.getElementById('ctxMenu').classList.remove('show'); }
        document.addEventListener('click', hideCtxMenu);
        document.addEventListener('contextmenu', (e) => { if (e.target.closest('.data-grid-container')) showCtxMenu(e); });

        function ctxCountRows() {
            hideCtxMenu();
            document.getElementById('countModalValue').textContent = 'Counting...';
            document.getElementById('countModal').classList.add('show');
            // Send the statement if available (query result mode)
            const stmt = dataColumns._statement || null;
            vscode.postMessage({ type: 'countRows', statement: stmt });
        }
        function closeCountModal() { document.getElementById('countModal').classList.remove('show'); }
        function ctxCopyCount() {
            const text = document.getElementById('countModalValue').textContent;
            vscode.postMessage({ type: 'copyCell', value: text });
            closeCountModal();
        }
        function ctxCopyHeaders() {
            hideCtxMenu();
            const headers = dataColumns.map(c => c.name).join('\t');
            vscode.postMessage({ type: 'copyCell', value: headers });
        }
        function ctxCopyCell() {
            hideCtxMenu();
            if (ctxTargetCell) vscode.postMessage({ type: 'copyCell', value: ctxTargetCell.textContent || '' });
        }
        window.ctxCountRows = ctxCountRows;
        window.closeCountModal = closeCountModal;
        window.ctxCopyCount = ctxCopyCount;
        window.ctxCopyHeaders = ctxCopyHeaders;
        window.ctxCopyCell = ctxCopyCell;

        // ── Column Resize Logic ──
        let resizeCol = null, resizeStartX = 0, resizeStartW = 0, resizeColIdx = -1;
        function initColResize(e, colIdx) {
            e.stopPropagation(); e.preventDefault();
            const th = e.target.parentElement;
            resizeCol = th;
            resizeStartX = e.clientX;
            resizeStartW = th.offsetWidth;
            resizeColIdx = colIdx;
            e.target.classList.add('active');
            document.addEventListener('mousemove', doColResize);
            document.addEventListener('mouseup', stopColResize);
        }
        function doColResize(e) {
            if (!resizeCol || resizeColIdx < 0) return;
            const diff = e.clientX - resizeStartX;
            const newW = Math.max(40, resizeStartW + diff);
            resizeCol.style.width = newW + 'px';
            resizeCol.style.minWidth = newW + 'px';
            resizeCol.style.maxWidth = newW + 'px';
            
            if (dataColumns[resizeColIdx]) dataColumns[resizeColIdx].width = newW;
        }
        function stopColResize() {
            const wasResizing = resizeCol !== null;
            document.querySelectorAll('.col-resizer.active').forEach(r => r.classList.remove('active'));
            resizeCol = null;
            resizeColIdx = -1;
            document.removeEventListener('mousemove', doColResize);
            document.removeEventListener('mouseup', stopColResize);
            if (wasResizing) {
                // Consume the click event that fires after mouseup to prevent unintended sort
                document.addEventListener('click', ev => ev.stopImmediatePropagation(), { capture: true, once: true });
            }
        }
        window.initColResize = initColResize;

        function renderDataTable() {
            const thead = document.getElementById('dataTableHead');
            const tbody = document.getElementById('dataTableBody');
            
            const numericTypes = ['NUMBER', 'BINARY_FLOAT', 'BINARY_DOUBLE', 'FLOAT', 'INTEGER', 'INT'];

            // Header
            thead.innerHTML = '<tr><th class="row-number">#</th>' + dataColumns.map((col, i) => {
                const s = sortColIdx === i ? (sortDir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
                const styleStr = col.width ? (' style="width:'+col.width+'px;min-width:'+col.width+'px;max-width:'+col.width+'px"') : '';
                return '<th title="' + col.name + ' (' + col.dbType + ')"' + styleStr + '><span class="col-label ' + s + '" onclick="sortDataBy(' + i + ')">' + col.name + '</span><div class="col-resizer" onmousedown="initColResize(event,' + i + ')"></div></th>';
            }).join('') + '</tr>';

            // Body
            const frag = document.createDocumentFragment();
            for (let r = 0; r < dataFilteredRows.length; r++) {
                const tr = document.createElement('tr');
                tr.onclick = function() {
                    document.querySelectorAll('#dataTableBody tr.selected').forEach(e => e.classList.remove('selected'));
                    this.classList.add('selected');
                };
                
                const rTd = document.createElement('td'); rTd.className = 'row-number'; rTd.textContent = String(r + 1);
                tr.appendChild(rTd);

                for (let c = 0; c < dataColumns.length; c++) {
                    const td = document.createElement('td');
                    const val = dataFilteredRows[r][c];
                    if (val === null || val === undefined) {
                        td.textContent = NULL_DISPLAY;
                        td.className = 'null-value';
                    } else {
                        td.textContent = String(val);
                        if (numericTypes.includes(dataColumns[c].dbType)) td.className = 'number-value';
                    }
                    td.ondblclick = function() { 
                        if (!${buildConfig_1.BUILD_CONFIG.isRestricted}) {
                            vscode.postMessage({ type: 'copyCell', value: String(val ?? '') }); 
                        }
                    };
                    tr.appendChild(td);
                }
                frag.appendChild(tr);
            }
            tbody.innerHTML = '';
            tbody.appendChild(frag);
        }

    </script>
</body>
</html>`;
    }
}
exports.ObjectViewerPanel = ObjectViewerPanel;
//# sourceMappingURL=objectViewerPanel.js.map