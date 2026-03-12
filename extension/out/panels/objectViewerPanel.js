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
class ObjectViewerPanel {
    extensionUri;
    panel;
    currentConnectionName;
    currentObjectName;
    currentObjectType;
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
    async show(objectName, objectType, connectionName, defaultTab = 'columns') {
        this.currentObjectName = objectName;
        this.currentObjectType = objectType;
        this.currentConnectionName = connectionName;
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('ingSqlObjectViewer', `${objectName}`, { viewColumn: vscode.ViewColumn.One, preserveFocus: false }, {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri]
            });
            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.currentCursorId = undefined;
            });
            this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
        }
        this.panel.title = `${objectName}`;
        this.panel.webview.html = this.getHtmlBase();
        // Let the webview initialize, then command it to fetch its own data.
        setTimeout(() => {
            this.panel?.webview.postMessage({ type: 'init', defaultTab });
        }, 100);
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
                        const batchSize = config.get('resultGrid.maxRows', 200);
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
                    if (this.onExportRequest) {
                        const sql = `SELECT * FROM "${this.currentObjectName}"`;
                        this.onExportRequest({
                            format: message.format,
                            sql: sql,
                            connectionName: this.currentConnectionName
                        });
                    }
                    break;
                case 'copyCell':
                    vscode.env.clipboard.writeText(message.value);
                    break;
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
                    const columns = await oracleService.getTableColumns(this.currentObjectName, this.currentConnectionName);
                    this.panel?.webview.postMessage({ type: 'renderColumns', columns });
                }
                else {
                    this.panel?.webview.postMessage({ type: 'renderColumns', columns: [] });
                }
            }
            else if (tabId === 'data') {
                if (['TABLE', 'VIEW', 'MATERIALIZED VIEW'].includes(this.currentObjectType)) {
                    const sql = `SELECT * FROM "${this.currentObjectName}"`;
                    // Fetch first chunk
                    const config = vscode.workspace.getConfiguration('ingSql');
                    const batchSize = config.get('resultGrid.maxRows', 200);
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
                const constraints = await oracleService.getConstraints(this.currentObjectName, this.currentConnectionName);
                this.panel?.webview.postMessage({ type: 'renderConstraints', constraints });
            }
            else if (tabId === 'indexes') {
                const indexes = await oracleService.getIndexes(this.currentObjectName, this.currentConnectionName);
                this.panel?.webview.postMessage({ type: 'renderIndexes', indexes });
            }
            else if (tabId === 'ddl') {
                const ddl = await oracleService.getObjectDDL(this.currentObjectName, this.currentObjectType, this.currentConnectionName);
                this.panel?.webview.postMessage({ type: 'renderDdl', ddl: ddl || 'No DDL available.' });
            }
        }
        catch (err) {
            throw err;
        }
    }
    getHtmlBase() {
        const config = vscode.workspace.getConfiguration('ingSql');
        const nullDisplay = config.get('resultGrid.nullDisplay', '(null)');
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Object Viewer</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
            --bg-color: var(--vscode-editor-background);
            --fg-color: var(--vscode-editor-foreground);
            --border-color: var(--vscode-panel-border);
            /* ING Corporate Colors */
            --primary-color: #FF6200; /* ING Orange */
            --primary-hover: #E55800;
            --header-bg: var(--vscode-editor-background);
            --row-hover: var(--vscode-list-hoverBackground);
            --row-alt: var(--vscode-editor-inactiveSelectionBackground);
        }

        body {
            font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--fg-color);
            background: var(--bg-color);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Top Tab Bar */
        .tab-bar {
            display: flex;
            background: var(--bg-color);
            border-bottom: 1px solid var(--border-color);
            padding: 0 16px;
            flex-shrink: 0;
            overflow-x: auto;
        }
        .tab {
            padding: 10px 16px;
            cursor: pointer;
            color: var(--vscode-tab-inactiveForeground);
            border-bottom: 2px solid transparent;
            font-size: 13px;
            white-space: nowrap;
            transition: color 0.2s, border-bottom-color 0.2s;
        }
        .tab:hover {
            color: var(--vscode-tab-activeForeground);
        }
        .tab.active {
            color: var(--vscode-tab-activeForeground);
            border-bottom-color: var(--primary-color);
            font-weight: 600;
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
        
        th.sort-asc::after { content: ' ▲'; opacity: 0.7; }
        th.sort-desc::after { content: ' ▼'; opacity: 0.7; }

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
    
    <!-- Tab Bar -->
    <div class="tab-bar">
        <div class="tab" data-target="columns">Columns</div>
        <div class="tab" data-target="data">Data</div>
        <div class="tab" data-target="constraints">Constraints</div>
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

    <!-- Data Tab (Interactive Grid) -->
    <div id="data" class="tab-content">
        <div class="toolbar">
            <span class="info" id="dataInfoText">Initializing grid...</span>
            <button id="loadMoreBtn" class="load-more-btn" onclick="requestLoadMore()" style="display: none;"> ↓ Load More</button>
            <div class="toolbar-right">
                <button class="icon-btn" onclick="triggerExport()" title="Export">
                    <svg viewBox="0 0 16 16"><path d="M14 6L14 14L2 14L2 6L4 6L4 12L12 12L12 6L14 6ZM8 10L11 7L9 7L9 2L7 2L7 7L5 7L8 10Z"/></svg>
                </button>
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

    <!-- Status Bar -->
    <div class="status-bar">
        <span id="statusText">Ready</span>
        <span id="statusRowCount" style="margin-left: auto;"></span>
        <span id="statusExecTime"></span>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const NULL_DISPLAY = '${nullDisplay}';
        
        let loadedTabs = new Set();
        let currentTabId = '';
        
        // Data Grid State
        let dataColumns = [];
        let dataRows = [];
        let dataFilteredRows = [];
        let sortColIdx = -1;
        let sortDir = 'asc';

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
                dataRows = msg.rows;
                dataFilteredRows = [...dataRows];
                
                updateDataInfo(msg.rowCount, msg.hasMore, msg.executionTime);
                renderDataTable();
                updateStatus('Data loaded');
            }
            else if (msg.type === 'appendData') {
                dataRows = dataRows.concat(msg.rows);
                dataFilteredRows = [...dataRows];
                applyDataFilter();
                
                const timeStr = document.getElementById('statusExecTime').textContent.replace('Time: ', '').replace('ms', '');
                updateDataInfo(dataRows.length, msg.hasMore, timeStr);
                
                const btn = document.getElementById('loadMoreBtn');
                btn.innerHTML = '↓ Load More';
                btn.disabled = false;
                updateStatus('Additional rows loaded');
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
            if (!term) { dataFilteredRows = dataRows; }
            else {
                dataFilteredRows = dataRows.filter(r => r.some(c => String(c ?? '').toLowerCase().includes(term)));
            }
            renderDataTable();
        }

        function sortDataBy(idx) {
            if (sortColIdx === idx) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            else { sortColIdx = idx; sortDir = 'asc'; }
            
            dataFilteredRows.sort((a, b) => {
                const va = a[idx], vb = b[idx];
                if (va === null && vb === null) return 0;
                if (va === null) return 1; if (vb === null) return -1;
                if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
                return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
            });
            renderDataTable();
        }

        window.sortDataBy = sortDataBy; // Export to global for inline onclick

        function renderDataTable() {
            const thead = document.getElementById('dataTableHead');
            const tbody = document.getElementById('dataTableBody');
            
            const numericTypes = ['NUMBER', 'BINARY_FLOAT', 'BINARY_DOUBLE', 'FLOAT', 'INTEGER', 'INT'];

            // Header
            thead.innerHTML = '<tr><th class="row-number">#</th>' + dataColumns.map((col, i) => {
                const s = sortColIdx === i ? (sortDir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
                return '<th class="' + s + '" onclick="sortDataBy(' + i + ')" title="' + col.name + ' (' + col.dbType + ')">' + col.name + '</th>';
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
                    td.ondblclick = function() { vscode.postMessage({ type: 'copyCell', value: String(val ?? '') }); };
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