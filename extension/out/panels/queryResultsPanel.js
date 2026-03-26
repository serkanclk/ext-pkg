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
exports.QueryResultsPanel = void 0;
const vscode = __importStar(require("vscode"));
const oracleService_1 = require("../services/oracleService");
const buildConfig_1 = require("../buildConfig");
/**
 * QueryResultsPanel — bottom-panel WebviewViewProvider with "Two-Tier Tab" architecture.
 *
 * Top level: Worksheets (A.sql, B.sql)
 * Sub level: Queries (Query 1, Query 2)
 *
 * The Extension holds the data source of truth (`worksheets`).
 * The Webview is stateless: the Extension sends `syncState` containing the list of all worksheets
 * (for the top tabs) and the detailed results ONLY for the currently active worksheet.
 */
class QueryResultsPanel {
    static viewType = 'ingSql.resultsView';
    static instance;
    static exportHandler;
    view;
    extensionUri;
    /** Per-worksheet result storage */
    worksheets = new Map();
    /** Currently displayed worksheet URI */
    activeDocUri;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        QueryResultsPanel.instance = this;
    }
    static getInstance() {
        return QueryResultsPanel.instance;
    }
    static setExportHandler(handler) {
        QueryResultsPanel.exportHandler = handler;
    }
    /**
     * Dispose results for a specific document (when worksheet is closed).
     */
    static disposeForDoc(docUri) {
        const instance = QueryResultsPanel.instance;
        if (instance) {
            instance.worksheets.delete(docUri);
            if (instance.activeDocUri === docUri) {
                // Pick the next available worksheet as active, or undefined if empty
                instance.activeDocUri = instance.worksheets.keys().next().value;
            }
            if (instance.view) {
                instance.pushCurrentResults();
            }
        }
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        webviewView.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
        webviewView.webview.html = this.getHtmlContent();
        webviewView.onDidDispose(() => {
            this.view = undefined;
        });
        // Delay to let webview script initialize
        setTimeout(() => this.pushCurrentResults(), 300);
    }
    /**
     * Set active worksheet and clear unpinned results.
     */
    clearResults(docUri, docName) {
        this.activeDocUri = docUri;
        let ws = this.worksheets.get(docUri);
        if (!ws) {
            ws = { docName, results: [], tabLabels: [], pinnedIndices: new Set(), nextQueryNum: 1 };
            this.worksheets.set(docUri, ws);
        }
        ws.docName = docName;
        // Preserve pinned tabs
        const pinnedResults = [];
        const pinnedLabels = [];
        for (const idx of ws.pinnedIndices) {
            if (idx < ws.results.length) {
                pinnedResults.push(ws.results[idx]);
                pinnedLabels.push(ws.tabLabels[idx]);
            }
        }
        ws.results = pinnedResults;
        ws.tabLabels = pinnedLabels;
        ws.pinnedIndices = new Set(pinnedResults.map((_, i) => i));
        ws.nextQueryNum = 1;
        this.pushCurrentResults();
    }
    /**
     * Add a result tab for the active worksheet.
     */
    addResult(docUri, docName, result) {
        this.activeDocUri = docUri;
        let ws = this.worksheets.get(docUri);
        if (!ws) {
            ws = { docName, results: [], tabLabels: [], pinnedIndices: new Set(), nextQueryNum: 1 };
            this.worksheets.set(docUri, ws);
        }
        ws.docName = docName;
        ws.results.push(result);
        const label = `Query ${ws.nextQueryNum++}`;
        ws.tabLabels.push(label);
        if (!this.view) {
            vscode.commands.executeCommand('ingSql.resultsView.focus').then(() => {
                setTimeout(() => this.pushCurrentResults(), 400);
            });
            return;
        }
        this.pushCurrentResults();
    }
    /**
     * Focus the bottom panel.
     */
    focus() {
        vscode.commands.executeCommand('ingSql.resultsView.focus');
    }
    pushCurrentResults() {
        if (!this.view)
            return;
        // Compile list of worksheets for top tabs
        const worksheetList = [];
        for (const [uri, ws] of this.worksheets.entries()) {
            worksheetList.push({ uri, name: ws.docName });
        }
        // Gather active worksheet's queries
        const activeTabs = [];
        const activeWs = this.activeDocUri ? this.worksheets.get(this.activeDocUri) : undefined;
        if (activeWs) {
            activeWs.results.forEach((result, tabIndex) => {
                const stmtPreview = result.statement.replace(/\s+/g, ' ').substring(0, 50);
                const formattedRows = result.rows.map(row => row.map(val => Buffer.isBuffer(val) ? val.toString('hex').toUpperCase() : val));
                activeTabs.push({
                    tabIndex,
                    label: activeWs.tabLabels[tabIndex],
                    tooltip: stmtPreview,
                    columns: result.columns,
                    rows: formattedRows,
                    rowCount: result.rowCount,
                    executionTime: result.executionTime,
                    hasMore: result.hasMore,
                    statement: result.statement,
                    cursorId: result.cursorId,
                    pinned: activeWs.pinnedIndices.has(tabIndex)
                });
            });
        }
        this.view.webview.postMessage({
            type: 'syncState',
            worksheets: worksheetList,
            activeDocUri: this.activeDocUri,
            activeTabs: activeTabs
        });
    }
    async handleMessage(message) {
        const ws = this.activeDocUri ? this.worksheets.get(this.activeDocUri) : undefined;
        switch (message.type) {
            case 'switchWorksheet':
                const newUri = message.docUri;
                if (this.worksheets.has(newUri)) {
                    this.activeDocUri = newUri;
                    this.pushCurrentResults();
                }
                break;
            case 'closeWorksheet':
                const removeUri = message.docUri;
                if (this.worksheets.has(removeUri)) {
                    this.worksheets.delete(removeUri);
                    if (this.activeDocUri === removeUri) {
                        this.activeDocUri = this.worksheets.keys().next().value;
                    }
                    this.pushCurrentResults();
                }
                break;
            case 'export':
                if (buildConfig_1.BUILD_CONFIG.isRestricted || !ws)
                    return;
                const tabIdx = message.tabIndex ?? 0;
                const exportResult = ws.results[tabIdx];
                if (exportResult && QueryResultsPanel.exportHandler) {
                    QueryResultsPanel.exportHandler({
                        format: message.format,
                        results: exportResult,
                        source: 'RESULTS_GRID'
                    });
                }
                break;
            case 'togglePin': {
                if (!ws)
                    break;
                const ti = message.tabIndex ?? 0;
                if (ws.pinnedIndices.has(ti)) {
                    ws.pinnedIndices.delete(ti);
                }
                else {
                    ws.pinnedIndices.add(ti);
                }
                this.pushCurrentResults();
                break;
            }
            case 'closeTab': {
                if (!ws)
                    break;
                const ti = message.tabIndex ?? 0;
                if (ti >= 0 && ti < ws.results.length) {
                    ws.results.splice(ti, 1);
                    ws.tabLabels.splice(ti, 1);
                    const newPinned = new Set();
                    for (const pi of ws.pinnedIndices) {
                        if (pi < ti)
                            newPinned.add(pi);
                        else if (pi > ti)
                            newPinned.add(pi - 1);
                    }
                    ws.pinnedIndices = newPinned;
                    this.pushCurrentResults();
                }
                break;
            }
            case 'loadMore': {
                if (!ws)
                    break;
                const ti = message.tabIndex ?? 0;
                const res = ws.results[ti];
                if (!res?.cursorId)
                    break;
                try {
                    this.view?.webview.postMessage({ type: 'loadingMore', tabIndex: ti, loading: true });
                    const config = vscode.workspace.getConfiguration('ingSql');
                    const batchSize = config.get('resultGrid.maxRows', 100);
                    const oracleService = oracleService_1.OracleService.getInstance();
                    const { rows, hasMore } = await oracleService.fetchMoreRows(res.cursorId, batchSize);
                    const formattedRows = rows.map(row => row.map(val => Buffer.isBuffer(val) ? val.toString('hex').toUpperCase() : val));
                    res.rows = res.rows.concat(rows);
                    res.hasMore = hasMore;
                    res.rowCount = res.rows.length;
                    this.pushCurrentResults(); // resync
                }
                catch (err) {
                    vscode.window.showErrorMessage(`Failed to load more rows: ${err.message}`);
                    this.view?.webview.postMessage({ type: 'loadingMore', tabIndex: ti, loading: false });
                }
                break;
            }
            case 'copyCell':
                if (!buildConfig_1.BUILD_CONFIG.isRestricted) {
                    vscode.env.clipboard.writeText(message.value);
                }
                break;
            case 'commit':
                vscode.commands.executeCommand('ingSql.commit');
                break;
            case 'rollback':
                vscode.commands.executeCommand('ingSql.rollback');
                break;
        }
    }
    getHtmlContent() {
        const config = vscode.workspace.getConfiguration('ingSql');
        const nullDisplay = config.get('resultGrid.nullDisplay', '(null)');
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Query Results</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --border: var(--vscode-panel-border, var(--vscode-editorWidget-border));
            --accent: var(--vscode-focusBorder, #FF6200);
            --header-bg: var(--vscode-editorWidget-background, var(--vscode-editor-background));
            --hover: var(--vscode-list-hoverBackground);
        }
        body {
            font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--fg); background: var(--bg);
            height: 100vh; display: flex; flex-direction: column; overflow: hidden;
            ${buildConfig_1.BUILD_CONFIG.isRestricted ? 'user-select: none;' : ''}
        }

        /* ── Top Level (Worksheets) Tab Bar ── */
        .ws-tab-bar {
            display: flex; align-items: center;
            background: var(--vscode-editorGroupHeader-tabsBackground, var(--header-bg));
            border-bottom: 2px solid var(--vscode-sideBar-border, var(--border));
            flex-shrink: 0; overflow-x: auto; min-height: 28px;
            padding: 0 4px;
        }
        .ws-tab-bar::-webkit-scrollbar { height: 3px; }
        .ws-tab-item {
            display: flex; align-items: center; gap: 6px;
            padding: 3px 6px 3px 12px; font-size: 11px; cursor: pointer;
            margin-right: 2px; border-radius: 4px 4px 0 0;
            color: var(--vscode-tab-inactiveForeground, var(--fg));
            background: var(--vscode-tab-inactiveBackground, transparent);
            transition: background 0.15s; user-select: none;
        }
        .ws-tab-item:hover { background: var(--vscode-tab-hoverBackground, rgba(128,128,128,0.1)); }
        .ws-tab-item.active {
            color: var(--vscode-tab-activeForeground, var(--fg));
            background: var(--vscode-tab-activeBackground, var(--bg));
            border: 1px solid var(--border); border-bottom: none;
            font-weight: 600; padding: 4px 6px 4px 12px;
        }
        
        /* ── Sub Level (Queries) Tab Bar ── */
        .tab-bar {
            display: flex; align-items: center;
            background: var(--bg);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0; overflow-x: auto; min-height: 26px;
            padding: 4px 8px 0 8px; gap: 4px;
        }
        .tab-item {
            display: flex; align-items: center; gap: 4px; border-radius: 3px;
            padding: 3px 6px 3px 10px; font-size: 11px; cursor: pointer;
            white-space: nowrap; border: 1px solid transparent;
            color: var(--vscode-descriptionForeground);
            background: transparent;
            transition: all 0.1s;
        }
        .tab-item:hover { border-color: var(--border); color: var(--fg); }
        .tab-item.active {
            color: var(--vscode-button-foreground, #fff);
            background: var(--vscode-button-background, #0e639c);
            border-color: transparent;
        }
        .tab-item .tab-meta { font-size: 10px; opacity: 0.8; font-weight: normal; margin-left: 4px; }

        /* Generic Buttons */
        .tab-btn {
            background: transparent; border: none; color: inherit;
            cursor: pointer; padding: 1px 3px; border-radius: 3px; font-size: 11px; line-height: 1;
            opacity: 0.5; transition: opacity 0.15s, background 0.15s;
        }
        .tab-btn:hover { opacity: 1; background: rgba(128,128,128,0.2); }
        .tab-btn.ws-close-btn:hover { color: #e74c3c; opacity: 1; }
        
        .tab-btn.pin-btn { font-size: 12px; }
        .tab-btn.pin-btn.pinned { opacity: 1; }
        .tab-btn.close-btn:hover { background: rgba(0,0,0,0.2); }

        /* ── Toolbar ── */
        .toolbar {
            display: flex; align-items: center; padding: 4px 8px;
            background: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-editorWidget-border);
            flex-shrink: 0; gap: 6px;
        }
        .toolbar-right { display: flex; gap: 6px; align-items: center; margin-left: auto; }
        .toolbar .info { font-size: 11px; color: var(--vscode-descriptionForeground); }

        button.load-more-btn {
            background-color: #333; color: #FFF; border: none;
            padding: 3px 10px; cursor: pointer; font-size: 11px;
            font-weight: 600; border-radius: 3px;
            display: flex; align-items: center; gap: 4px;
        }
        button.load-more-btn:hover:not(:disabled) { background-color: #444; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }

        .icon-btn {
            background: transparent; color: var(--fg); border: none;
            padding: 3px; border-radius: 3px; cursor: pointer;
            width: 22px; height: 22px;
            display: flex; align-items: center; justify-content: center;
        }
        .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--accent); }
        .icon-btn svg { width: 14px; height: 14px; fill: currentColor; }

        /* ── Filter ── */
        .filter-bar { display: none; padding: 4px 8px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-editorWidget-border); }
        .filter-bar.show { display: flex; }
        .filter-bar input { flex: 1; padding: 3px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 2px; font-size: 11px; }

        /* ── Grid ── */
        .grid-container { flex: 1; overflow: auto; position: relative; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
            padding: 4px 8px; text-align: left; font-weight: 600;
            position: sticky; top: 0; z-index: 10;
        }
        td {
            border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
            padding: 3px 8px; white-space: nowrap;
            max-width: 400px; overflow: hidden; text-overflow: ellipsis; cursor: default;
        }
        tr:hover td { background: var(--hover); }
        tr.selected td { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
        .null-value { color: var(--vscode-descriptionForeground); font-style: italic; }
        .number-value { text-align: right; font-variant-numeric: tabular-nums; }
        .row-number {
            color: var(--vscode-descriptionForeground); text-align: right;
            border-right: 2px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
            background: var(--vscode-editorWidget-background);
            position: sticky; left: 0; z-index: 5;
            min-width: 30px; padding-right: 6px; font-size: 11px;
        }
        th.sort-asc::after { content: ' ▲'; opacity: 0.7; }
        th.sort-desc::after { content: ' ▼'; opacity: 0.7; }

        /* ── Status ── */
        .status-bar {
            display: flex; align-items: center; gap: 12px; padding: 3px 8px;
            background: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            font-size: 11px; flex-shrink: 0;
            border-top: 1px solid var(--vscode-statusBar-border);
        }
        .empty-state {
            display: flex; align-items: center; justify-content: center;
            flex: 1; color: var(--vscode-descriptionForeground); font-size: 13px; text-align: center; padding: 20px;
        }
    </style>
</head>
<body>
    <div class="ws-tab-bar" id="wsTabBar"></div>
    <div class="tab-bar" id="tabBar"></div>
    <div class="toolbar">
        <span class="info" id="infoText"></span>
        <button id="loadMoreBtn" class="load-more-btn" onclick="loadMore()" style="display:none">↓ Load More</button>
        <div class="toolbar-right">
            ${buildConfig_1.BUILD_CONFIG.isRestricted ? '' : `
            <button class="icon-btn" onclick="exportCurrent()" title="Export">
                <svg viewBox="0 0 16 16"><path d="M14 6L14 14L2 14L2 6L4 6L4 12L12 12L12 6L14 6ZM8 10L11 7L9 7L9 2L7 2L7 7L5 7L8 10Z"/></svg>
            </button>`}
            <button class="icon-btn" onclick="toggleFilter()" title="Filter">
                <svg viewBox="0 0 16 16"><path d="M14.5 3L1.5 3L6.5 8.7L6.5 13L9.5 11.5L9.5 8.7L14.5 3ZM12.3 4L3.7 4L7.5 8.3L7.5 10.6L8.5 10.1L8.5 8.3L12.3 4Z"/></svg>
            </button>
        </div>
    </div>
    <div class="filter-bar" id="filterBar">
        <input type="text" id="filterInput" placeholder="Filter rows..." oninput="applyFilter()">
    </div>
    <div class="grid-container" id="gridContainer">
        <div class="empty-state" id="emptyState">No queries executed yet.<br/>Select a worksheet and execute a query.</div>
        <table style="display:none"><thead id="tableHead"></thead><tbody id="tableBody"></tbody></table>
    </div>
    <div class="status-bar">
        <span id="statusRowCount"></span>
        <span id="statusExecTime"></span>
        <span id="statusStatement" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px"></span>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const NULL_DISPLAY = '${nullDisplay}';
        const MAX_ROWS = 10000;
        
        // App State
        let stateWorksheets = []; // [{uri, name}]
        let stateActiveDocUri = null;
        let activeTabs = []; // Query Results for active worksheet
        let selectedTabIndex = -1; // Which query tab is selected

        if (${buildConfig_1.BUILD_CONFIG.isRestricted}) {
            document.addEventListener('contextmenu', e => e.preventDefault());
            document.addEventListener('copy', e => { e.preventDefault(); return false; });
            document.addEventListener('keydown', e => { if ((e.ctrlKey||e.metaKey)&&(e.key==='c'||e.key==='C')) e.preventDefault(); });
        }

        function postMsg(m) { vscode.postMessage(m); }
        function exportCurrent() { postMsg({type:'export',tabIndex:selectedTabIndex}); }
        function loadMore() { if (selectedTabIndex>=0) postMsg({type:'loadMore',tabIndex:selectedTabIndex}); }

        // Interactions
        function switchWorksheet(uri) { postMsg({type:'switchWorksheet', docUri: uri}); }
        function closeWorksheet(uri) { postMsg({type:'closeWorksheet', docUri: uri}); }
        function switchTab(idx) { 
            if (idx < 0 || idx >= activeTabs.length) return;
            selectedTabIndex = idx;
            renderTabs(); renderGrid(); updateInfo();
        }
        function togglePin(idx) { postMsg({type:'togglePin',tabIndex:idx}); }
        function closeTab(idx) { postMsg({type:'closeTab',tabIndex:idx}); }

        // Rendering Worksheets (Top Bar)
        function renderWorksheets() {
            const bar = document.getElementById('wsTabBar');
            if (stateWorksheets.length === 0) {
                bar.innerHTML = '';
                bar.style.display = 'none';
                return;
            }
            bar.style.display = 'flex';
            bar.innerHTML = stateWorksheets.map((ws) => {
                const cls = (ws.uri === stateActiveDocUri) ? 'ws-tab-item active' : 'ws-tab-item';
                return '<div class="' + cls + '" onclick="switchWorksheet(\\'' + ws.uri + '\\')">'
                    + '<span class="ws-label">' + esc(ws.name) + '</span>'
                    + '<button class="tab-btn ws-close-btn" onclick="event.stopPropagation();closeWorksheet(\\'' + ws.uri + '\\')" title="Close Worksheet">✕</button>'
                    + '</div>';
            }).join('');
        }

        // Rendering Queries (Sub Bar)
        function renderTabs() {
            const bar = document.getElementById('tabBar');
            if (activeTabs.length === 0) {
                bar.innerHTML = '';
                return;
            }
            bar.innerHTML = activeTabs.map((t, i) => {
                const cls = i === selectedTabIndex ? 'tab-item active' : 'tab-item';
                const meta = t.rowCount + ' rows • ' + t.executionTime + 'ms';
                const pinCls = t.pinned ? 'tab-btn pin-btn pinned' : 'tab-btn pin-btn';
                return '<div class="' + cls + '" onclick="switchTab(' + i + ')" title="' + esc(t.tooltip) + '">'
                    + '<span class="tab-label">' + (t.pinned ? '📌 ' : '') + esc(t.label) + '</span>'
                    + '<span class="tab-meta">' + meta + '</span>'
                    + '<button class="' + pinCls + '" onclick="event.stopPropagation();togglePin(' + i + ')" title="' + (t.pinned ? 'Unpin' : 'Pin') + '">📌</button>'
                    + '<button class="tab-btn close-btn" onclick="event.stopPropagation();closeTab(' + i + ')" title="Close">✕</button>'
                    + '</div>';
            }).join('');
        }

        function renderGrid() {
            if (selectedTabIndex < 0 || !activeTabs[selectedTabIndex]) {
                document.getElementById('emptyState').style.display = 'flex';
                document.querySelector('table').style.display = 'none';
                return;
            }
            document.getElementById('emptyState').style.display = 'none';
            document.querySelector('table').style.display = '';
            
            const t = activeTabs[selectedTabIndex];
            
            // Re-apply filter if needed
            const term = document.getElementById('filterInput').value.toLowerCase();
            t.filteredRows = !term ? [...t.rows] : t.rows.filter(row=>row.some(cell=>String(cell??'').toLowerCase().includes(term)));
            
            // Sorting state defaults
            if (t.sortColumn === undefined) { t.sortColumn = -1; t.sortDir = 'asc'; }

            const thead = document.getElementById('tableHead');
            const tbody = document.getElementById('tableBody');
            thead.innerHTML = '<tr><th class="row-number">#</th>' +
                t.columns.map((col, i) => {
                    const sc = t.sortColumn===i ? (t.sortDir==='asc'?'sort-asc':'sort-desc') : '';
                    return '<th class="'+sc+'" onclick="sortBy('+i+')" title="'+col.name+' ('+col.dbType+')">'+col.name+'</th>';
                }).join('') + '</tr>';
                
            const numTypes = ['NUMBER','BINARY_FLOAT','BINARY_DOUBLE','FLOAT','INTEGER','INT'];
            const frag = document.createDocumentFragment();
            const rows = t.filteredRows;
            for (let r = 0; r < rows.length; r++) {
                const tr = document.createElement('tr');
                tr.onclick = function() { document.querySelectorAll('tr.selected').forEach(el=>el.classList.remove('selected')); this.classList.add('selected'); };
                const rn = document.createElement('td'); rn.className='row-number'; rn.textContent=String(r+1); tr.appendChild(rn);
                for (let c = 0; c < t.columns.length; c++) {
                    const td = document.createElement('td');
                    const val = rows[r][c];
                    if (val===null||val===undefined) { td.textContent=NULL_DISPLAY; td.className='null-value'; }
                    else { td.textContent=String(val); if (numTypes.includes(t.columns[c].dbType)) td.className='number-value'; }
                    td.ondblclick = function() { if (!${buildConfig_1.BUILD_CONFIG.isRestricted}) postMsg({type:'copyCell',value:String(val??'')}); };
                    tr.appendChild(td);
                }
                frag.appendChild(tr);
            }
            tbody.innerHTML = ''; tbody.appendChild(frag);
        }

        function updateInfo() {
            if (selectedTabIndex<0||!activeTabs[selectedTabIndex]) {
                 document.getElementById('infoText').textContent = '';
                 document.getElementById('statusRowCount').textContent = '';
                 document.getElementById('statusExecTime').textContent = '';
                 document.getElementById('statusStatement').textContent = '';
                 document.getElementById('loadMoreBtn').style.display = 'none';
                 return;
            }
            const t = activeTabs[selectedTabIndex];
            document.getElementById('infoText').textContent = t.rowCount+' rows'+(t.hasMore?'+':'')+' • '+t.executionTime+'ms';
            document.getElementById('statusRowCount').textContent = 'Rows: '+t.rowCount+(t.hasMore?'+':'');
            document.getElementById('statusExecTime').textContent = 'Time: '+t.executionTime+'ms';
            document.getElementById('statusStatement').textContent = t.statement.substring(0,100);
            
            const lb = document.getElementById('loadMoreBtn');
            lb.style.display = t.hasMore ? 'inline-flex' : 'none';
            lb.textContent = '↓ Load More';
            lb.disabled = false;
        }

        function sortBy(ci) {
            if (selectedTabIndex<0) return;
            const t = activeTabs[selectedTabIndex];
            if (t.sortColumn===ci) t.sortDir = t.sortDir==='asc'?'desc':'asc';
            else { t.sortColumn=ci; t.sortDir='asc'; }
            t.filteredRows.sort((a,b) => {
                const va=a[ci],vb=b[ci];
                if (va===null&&vb===null) return 0;
                if (va===null) return 1; if (vb===null) return -1;
                if (typeof va==='number'&&typeof vb==='number') return t.sortDir==='asc'?va-vb:vb-va;
                return t.sortDir==='asc'?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
            });
            renderGrid();
        }

        function toggleFilter() {
            const fb = document.getElementById('filterBar');
            fb.classList.toggle('show');
            if (fb.classList.contains('show')) document.getElementById('filterInput').focus();
            else { document.getElementById('filterInput').value=''; applyFilter(); }
        }
        function applyFilter() {
            if (selectedTabIndex<0) return;
            renderGrid();
        }
        function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'syncState') {
                stateWorksheets = msg.worksheets || [];
                stateActiveDocUri = msg.activeDocUri;
                
                // Keep the selection if we are on the same worksheet and have tabs
                let wantsToKeepSelection = false;
                if (activeTabs.length === (msg.activeTabs || []).length && selectedTabIndex >= 0) {
                    wantsToKeepSelection = true;
                }

                activeTabs = msg.activeTabs || [];
                
                if (activeTabs.length === 0) {
                    selectedTabIndex = -1;
                } else if (!wantsToKeepSelection || selectedTabIndex >= activeTabs.length || selectedTabIndex < 0) {
                    selectedTabIndex = activeTabs.length - 1; // Auto select the newest query
                }
                
                renderWorksheets();
                renderTabs();
                renderGrid();
                updateInfo();
            }
            else if (msg.type==='loadingMore') {
                if (msg.tabIndex===selectedTabIndex) {
                    const lb=document.getElementById('loadMoreBtn');
                    lb.textContent=msg.loading?'Loading...':'↓ Load More'; lb.disabled=msg.loading;
                }
            }
        });
    </script>
</body>
</html>`;
    }
    dispose() { }
}
exports.QueryResultsPanel = QueryResultsPanel;
//# sourceMappingURL=queryResultsPanel.js.map