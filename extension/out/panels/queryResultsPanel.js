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
 * QueryResultsPanel — per-worksheet, multi-result-tab panel.
 *
 * Architecture:
 *  - One WebviewPanel per document URI (worksheet)
 *  - Within each panel, multiple tabs (one per SELECT result)
 *  - Manages its own cursor / load-more state per tab
 */
class QueryResultsPanel {
    static panels = new Map();
    panel;
    docUri;
    results = [];
    extensionUri;
    disposed = false;
    // Called from extension.ts so we can fire audit logs on export
    static exportHandler;
    static setExportHandler(handler) {
        QueryResultsPanel.exportHandler = handler;
    }
    constructor(docUri, title, extensionUri) {
        this.docUri = docUri;
        this.extensionUri = extensionUri;
        this.panel = vscode.window.createWebviewPanel('ingSqlQueryResults', title, { viewColumn: vscode.ViewColumn.Two, preserveFocus: true }, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [extensionUri]
        });
        this.panel.webview.html = this.getHtmlContent();
        this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
        this.panel.onDidDispose(() => {
            this.disposed = true;
            QueryResultsPanel.panels.delete(this.docUri);
        });
    }
    /**
     * Get or create a results panel for a specific worksheet document URI.
     */
    static getOrCreate(docUri, title, extensionUri) {
        let existing = QueryResultsPanel.panels.get(docUri);
        if (existing && !existing.disposed) {
            existing.panel.reveal(vscode.ViewColumn.Two, true);
            return existing;
        }
        const panel = new QueryResultsPanel(docUri, title, extensionUri);
        QueryResultsPanel.panels.set(docUri, panel);
        return panel;
    }
    /**
     * Clear all results — called before a new execution.
     */
    clearResults() {
        this.results = [];
        if (!this.disposed) {
            this.panel.webview.postMessage({ type: 'clearAll' });
        }
    }
    /**
     * Add a new result tab (for each SELECT in a script).
     */
    addResult(result) {
        this.results.push(result);
        if (this.disposed)
            return;
        const tabIndex = this.results.length - 1;
        const stmtPreview = result.statement.replace(/\s+/g, ' ').substring(0, 50);
        const formattedRows = result.rows.map(row => row.map(val => Buffer.isBuffer(val) ? val.toString('hex').toUpperCase() : val));
        this.panel.webview.postMessage({
            type: 'addTab',
            tabIndex,
            label: `Query ${tabIndex + 1}`,
            tooltip: stmtPreview,
            columns: result.columns,
            rows: formattedRows,
            rowCount: result.rowCount,
            executionTime: result.executionTime,
            hasMore: result.hasMore,
            statement: result.statement,
            cursorId: result.cursorId,
        });
    }
    async handleMessage(message) {
        switch (message.type) {
            case 'export':
                if (buildConfig_1.BUILD_CONFIG.isRestricted)
                    return;
                const tabIdx = message.tabIndex ?? 0;
                const exportResult = this.results[tabIdx];
                if (exportResult && QueryResultsPanel.exportHandler) {
                    QueryResultsPanel.exportHandler({
                        format: message.format,
                        results: exportResult,
                        source: 'RESULTS_GRID'
                    });
                }
                break;
            case 'commit':
                vscode.commands.executeCommand('ingSql.commit');
                break;
            case 'rollback':
                vscode.commands.executeCommand('ingSql.rollback');
                break;
            case 'loadMore': {
                const ti = message.tabIndex ?? 0;
                const res = this.results[ti];
                if (!res?.cursorId)
                    break;
                try {
                    this.panel.webview.postMessage({ type: 'loadingMore', tabIndex: ti, loading: true });
                    const config = vscode.workspace.getConfiguration('ingSql');
                    const batchSize = config.get('resultGrid.maxRows', 100);
                    const oracleService = oracleService_1.OracleService.getInstance();
                    const { rows, hasMore } = await oracleService.fetchMoreRows(res.cursorId, batchSize);
                    const formattedRows = rows.map(row => row.map(val => Buffer.isBuffer(val) ? val.toString('hex').toUpperCase() : val));
                    // Update stored result
                    res.rows = res.rows.concat(rows);
                    res.hasMore = hasMore;
                    res.rowCount = res.rows.length;
                    this.panel.webview.postMessage({
                        type: 'appendData',
                        tabIndex: ti,
                        rows: formattedRows,
                        hasMore: hasMore
                    });
                }
                catch (err) {
                    vscode.window.showErrorMessage(`Failed to load more rows: ${err.message}`);
                    this.panel.webview.postMessage({ type: 'loadingMore', tabIndex: ti, loading: false });
                }
                break;
            }
            case 'copyCell':
                if (!buildConfig_1.BUILD_CONFIG.isRestricted) {
                    vscode.env.clipboard.writeText(message.value);
                }
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
            --bg-color: var(--vscode-editor-background);
            --fg-color: var(--vscode-editor-foreground);
            --border-color: var(--vscode-panel-border, var(--vscode-editorWidget-border));
            --primary-color: #FF6200;
            --primary-hover: #E55800;
            --header-bg: var(--vscode-editorWidget-background, var(--vscode-editor-background));
            --row-hover: var(--vscode-list-hoverBackground);
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
            ${buildConfig_1.BUILD_CONFIG.isRestricted ? 'user-select: none;' : ''}
        }

        /* ── Tab Bar ── */
        .tab-bar {
            display: flex;
            align-items: center;
            background: var(--vscode-editorGroupHeader-tabsBackground, var(--header-bg));
            border-bottom: 1px solid var(--border-color);
            flex-shrink: 0;
            overflow-x: auto;
            min-height: 35px;
        }
        .tab-bar::-webkit-scrollbar { height: 3px; }
        .tab-bar::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); }

        .tab-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            font-size: 12px;
            cursor: pointer;
            white-space: nowrap;
            border-right: 1px solid var(--border-color);
            color: var(--vscode-tab-inactiveForeground, var(--fg-color));
            background: var(--vscode-tab-inactiveBackground, transparent);
            transition: background 0.15s;
        }
        .tab-item:hover {
            background: var(--vscode-tab-hoverBackground, var(--row-hover));
        }
        .tab-item.active {
            color: var(--vscode-tab-activeForeground, var(--fg-color));
            background: var(--vscode-tab-activeBackground, var(--bg-color));
            border-bottom: 2px solid var(--primary-color);
            font-weight: 600;
        }
        .tab-item .tab-meta {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            font-weight: normal;
        }

        /* ── Toolbar ── */
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
            display: flex; gap: 10px; align-items: center; margin-left: auto;
        }
        .toolbar .info { font-size: 11px; color: var(--vscode-descriptionForeground); }

        button.load-more-btn {
            background-color: #333333; color: #FFFFFF; border: none;
            padding: 4px 12px; cursor: pointer; font-size: 11px;
            font-weight: 600; border-radius: 4px;
            display: flex; align-items: center; gap: 6px;
            transition: background-color 0.2s;
        }
        button.load-more-btn:hover:not(:disabled) { background-color: #444444; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }

        .icon-btn {
            background: transparent; color: var(--fg-color); border: none;
            padding: 4px; border-radius: 4px; cursor: pointer;
            width: 24px; height: 24px;
            display: flex; align-items: center; justify-content: center;
            transition: background-color 0.2s, color 0.2s;
        }
        .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--primary-color); }
        .icon-btn svg { width: 16px; height: 16px; fill: currentColor; }

        /* ── Filter Bar ── */
        .filter-bar {
            display: none; padding: 6px 12px;
            background: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-editorWidget-border);
        }
        .filter-bar.show { display: flex; }
        .filter-bar input {
            flex: 1; padding: 4px 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px; font-family: inherit; font-size: 12px;
        }

        /* ── Grid ── */
        .grid-container { flex: 1; overflow: auto; position: relative; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            padding: 6px 10px; text-align: left; font-weight: 600;
            position: sticky; top: 0; z-index: 10;
        }
        td {
            border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
            padding: 4px 10px; white-space: nowrap;
            max-width: 400px; overflow: hidden; text-overflow: ellipsis; cursor: default;
        }
        tr:hover td { background: var(--vscode-list-hoverBackground); }
        tr.selected td { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
        .null-value { color: var(--vscode-descriptionForeground); font-style: italic; }
        .number-value { text-align: right; font-variant-numeric: tabular-nums; }
        .row-number {
            color: var(--vscode-descriptionForeground); text-align: right;
            border-right: 2px solid var(--vscode-editorWidget-border);
            background: var(--vscode-editorWidget-background);
            position: sticky; left: 0; z-index: 5;
            min-width: 35px; padding-right: 8px; font-size: 11px;
        }
        th.sort-asc::after { content: ' ▲'; opacity: 0.7; }
        th.sort-desc::after { content: ' ▼'; opacity: 0.7; }

        /* ── Status Bar ── */
        .status-bar {
            display: flex; align-items: center; gap: 16px;
            padding: 4px 12px;
            background: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            font-size: 11px; flex-shrink: 0;
            border-top: 1px solid var(--vscode-statusBar-border);
        }

        /* ── Empty state ── */
        .empty-state {
            display: flex; align-items: center; justify-content: center;
            flex: 1; color: var(--vscode-descriptionForeground); font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="tab-bar" id="tabBar"></div>

    <div class="toolbar">
        <span class="info" id="infoText"></span>
        <button id="loadMoreBtn" class="load-more-btn" onclick="loadMore()" style="display: none;">↓ Load More</button>
        <div class="toolbar-right">
            ${buildConfig_1.BUILD_CONFIG.isRestricted ? '' : `
            <button class="icon-btn" onclick="exportCurrent()" title="Export">
                <svg viewBox="0 0 16 16"><path d="M14 6L14 14L2 14L2 6L4 6L4 12L12 12L12 6L14 6ZM8 10L11 7L9 7L9 2L7 2L7 7L5 7L8 10Z"/></svg>
            </button>
            `}
            <button class="icon-btn" onclick="toggleFilter()" title="Filter">
                <svg viewBox="0 0 16 16"><path d="M14.5 3L1.5 3L6.5 8.7L6.5 13L9.5 11.5L9.5 8.7L14.5 3ZM12.3 4L3.7 4L7.5 8.3L7.5 10.6L8.5 10.1L8.5 8.3L12.3 4Z"/></svg>
            </button>
        </div>
    </div>

    <div class="filter-bar" id="filterBar">
        <input type="text" id="filterInput" placeholder="Type to filter rows locally..." oninput="applyFilter()">
    </div>

    <div class="grid-container" id="gridContainer">
        <div class="empty-state" id="emptyState">Execute a query to see results here</div>
        <table style="display:none">
            <thead id="tableHead"></thead>
            <tbody id="tableBody"></tbody>
        </table>
    </div>

    <div class="status-bar">
        <span id="statusRowCount"></span>
        <span id="statusExecTime"></span>
        <span id="statusStatement" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px;"></span>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const NULL_DISPLAY = '${nullDisplay}';
        const MAX_BROWSER_ROWS = 10000;

        // ── Multi-tab state ──
        const tabs = [];   // Array of { label, tooltip, columns, rows, filteredRows, sortColumn, sortDir, hasMore, cursorId, rowCount, execTime, statement }
        let activeTab = -1;

        if (${buildConfig_1.BUILD_CONFIG.isRestricted}) {
            document.addEventListener('contextmenu', e => e.preventDefault());
            document.addEventListener('copy', e => { e.preventDefault(); return false; });
            document.addEventListener('keydown', e => {
                if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) e.preventDefault();
            });
        }

        function postMsg(msg) { vscode.postMessage(msg); }

        function exportCurrent() {
            postMsg({ type: 'export', tabIndex: activeTab });
        }

        function loadMore() {
            if (activeTab >= 0) {
                postMsg({ type: 'loadMore', tabIndex: activeTab });
            }
        }

        // ── Tab bar rendering ──
        function renderTabs() {
            const bar = document.getElementById('tabBar');
            bar.innerHTML = tabs.map((t, i) => {
                const cls = i === activeTab ? 'tab-item active' : 'tab-item';
                const meta = t.rowCount + ' rows • ' + t.execTime + 'ms';
                return '<div class="' + cls + '" onclick="switchTab(' + i + ')" title="' + esc(t.tooltip) + '">'
                    + esc(t.label)
                    + '<span class="tab-meta">' + meta + '</span>'
                    + '</div>';
            }).join('');
        }

        function switchTab(idx) {
            if (idx < 0 || idx >= tabs.length) return;
            activeTab = idx;
            renderTabs();
            renderGrid();
            updateInfo();
        }

        // ── Grid rendering ──
        function renderGrid() {
            if (activeTab < 0 || !tabs[activeTab]) {
                document.getElementById('emptyState').style.display = 'flex';
                document.querySelector('table').style.display = 'none';
                return;
            }
            document.getElementById('emptyState').style.display = 'none';
            document.querySelector('table').style.display = '';

            const t = tabs[activeTab];
            const thead = document.getElementById('tableHead');
            const tbody = document.getElementById('tableBody');

            thead.innerHTML = '<tr><th class="row-number">#</th>' +
                t.columns.map((col, i) => {
                    const sortClass = t.sortColumn === i
                        ? (t.sortDir === 'asc' ? 'sort-asc' : 'sort-desc') : '';
                    return '<th class="' + sortClass + '" onclick="sortBy(' + i + ')" title="' +
                        col.name + ' (' + col.dbType + ')">' + col.name + '</th>';
                }).join('') + '</tr>';

            const numericTypes = ['NUMBER', 'BINARY_FLOAT', 'BINARY_DOUBLE', 'FLOAT', 'INTEGER', 'INT'];
            const fragment = document.createDocumentFragment();
            const rows = t.filteredRows;

            for (let r = 0; r < rows.length; r++) {
                const tr = document.createElement('tr');
                tr.onclick = function() {
                    document.querySelectorAll('tr.selected').forEach(el => el.classList.remove('selected'));
                    this.classList.add('selected');
                };

                const rowNumTd = document.createElement('td');
                rowNumTd.className = 'row-number';
                rowNumTd.textContent = String(r + 1);
                tr.appendChild(rowNumTd);

                for (let c = 0; c < t.columns.length; c++) {
                    const td = document.createElement('td');
                    const val = rows[r][c];
                    if (val === null || val === undefined) {
                        td.textContent = NULL_DISPLAY;
                        td.className = 'null-value';
                    } else {
                        td.textContent = String(val);
                        if (numericTypes.includes(t.columns[c].dbType)) {
                            td.className = 'number-value';
                        }
                    }
                    td.ondblclick = function() {
                        if (!${buildConfig_1.BUILD_CONFIG.isRestricted}) {
                            vscode.postMessage({ type: 'copyCell', value: String(val ?? '') });
                        }
                    };
                    tr.appendChild(td);
                }
                fragment.appendChild(tr);
            }
            tbody.innerHTML = '';
            tbody.appendChild(fragment);
        }

        function updateInfo() {
            if (activeTab < 0 || !tabs[activeTab]) return;
            const t = tabs[activeTab];
            document.getElementById('infoText').textContent =
                t.rowCount + ' rows' + (t.hasMore ? '+' : '') + ' • ' + t.execTime + 'ms';
            document.getElementById('statusRowCount').textContent =
                'Rows: ' + t.rowCount + (t.hasMore ? '+' : '');
            document.getElementById('statusExecTime').textContent =
                'Time: ' + t.execTime + 'ms';
            document.getElementById('statusStatement').textContent =
                t.statement.substring(0, 100);
            document.getElementById('loadMoreBtn').style.display = t.hasMore ? 'inline-flex' : 'none';
        }

        // ── Sorting ──
        function sortBy(colIdx) {
            if (activeTab < 0) return;
            const t = tabs[activeTab];
            if (t.sortColumn === colIdx) {
                t.sortDir = t.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                t.sortColumn = colIdx;
                t.sortDir = 'asc';
            }
            t.filteredRows.sort((a, b) => {
                const va = a[colIdx], vb = b[colIdx];
                if (va === null && vb === null) return 0;
                if (va === null) return 1;
                if (vb === null) return -1;
                if (typeof va === 'number' && typeof vb === 'number') {
                    return t.sortDir === 'asc' ? va - vb : vb - va;
                }
                const sa = String(va), sb = String(vb);
                return t.sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
            });
            renderGrid();
        }

        // ── Filtering ──
        function toggleFilter() {
            const fb = document.getElementById('filterBar');
            fb.classList.toggle('show');
            if (fb.classList.contains('show')) {
                document.getElementById('filterInput').focus();
            } else {
                document.getElementById('filterInput').value = '';
                applyFilter();
            }
        }

        function applyFilter() {
            if (activeTab < 0) return;
            const t = tabs[activeTab];
            const term = document.getElementById('filterInput').value.toLowerCase();
            if (!term) {
                t.filteredRows = [...t.rows];
            } else {
                t.filteredRows = t.rows.filter(row =>
                    row.some(cell => String(cell ?? '').toLowerCase().includes(term))
                );
            }
            renderGrid();
        }

        function esc(s) {
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }

        // ── Message handler ──
        window.addEventListener('message', event => {
            const msg = event.data;

            if (msg.type === 'clearAll') {
                tabs.length = 0;
                activeTab = -1;
                renderTabs();
                document.getElementById('emptyState').style.display = 'flex';
                document.querySelector('table').style.display = 'none';
                document.getElementById('infoText').textContent = '';
                document.getElementById('statusRowCount').textContent = '';
                document.getElementById('statusExecTime').textContent = '';
                document.getElementById('statusStatement').textContent = '';
                document.getElementById('loadMoreBtn').style.display = 'none';
            }

            else if (msg.type === 'addTab') {
                tabs.push({
                    label: msg.label,
                    tooltip: msg.tooltip,
                    columns: msg.columns,
                    rows: msg.rows,
                    filteredRows: [...msg.rows],
                    sortColumn: -1,
                    sortDir: 'asc',
                    hasMore: msg.hasMore,
                    cursorId: msg.cursorId,
                    rowCount: msg.rowCount,
                    execTime: msg.executionTime,
                    statement: msg.statement
                });
                activeTab = tabs.length - 1;
                renderTabs();
                renderGrid();
                updateInfo();
            }

            else if (msg.type === 'appendData') {
                const ti = msg.tabIndex;
                if (ti < 0 || ti >= tabs.length) return;
                const t = tabs[ti];
                t.rows = t.rows.concat(msg.rows);
                t.rowCount = t.rows.length;
                const atLimit = t.rows.length >= MAX_BROWSER_ROWS;
                if (atLimit) t.hasMore = false;
                else t.hasMore = msg.hasMore;

                if (document.getElementById('filterInput').value) {
                    t.filteredRows = t.rows.filter(row =>
                        row.some(cell => String(cell ?? '').toLowerCase().includes(
                            document.getElementById('filterInput').value.toLowerCase()
                        ))
                    );
                } else {
                    t.filteredRows = [...t.rows];
                }

                if (ti === activeTab) {
                    renderTabs();
                    renderGrid();
                    updateInfo();
                    const loadBtn = document.getElementById('loadMoreBtn');
                    if (atLimit) {
                        loadBtn.style.display = 'inline-flex';
                        loadBtn.textContent = '⚠ Max rows (10,000) reached — use Export for full data';
                        loadBtn.disabled = true;
                    } else {
                        loadBtn.style.display = msg.hasMore ? 'inline-flex' : 'none';
                        loadBtn.textContent = '↓ Load More';
                        loadBtn.disabled = false;
                    }
                }
            }

            else if (msg.type === 'loadingMore') {
                if (msg.tabIndex === activeTab) {
                    const loadBtn = document.getElementById('loadMoreBtn');
                    loadBtn.textContent = msg.loading ? 'Loading...' : '↓ Load More';
                    loadBtn.disabled = msg.loading;
                }
            }
        });
    </script>
</body>
</html>`;
    }
    dispose() {
        if (!this.disposed) {
            this.panel.dispose();
        }
    }
}
exports.QueryResultsPanel = QueryResultsPanel;
//# sourceMappingURL=queryResultsPanel.js.map