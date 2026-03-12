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
exports.ResultsPanel = void 0;
const vscode = __importStar(require("vscode"));
const buildConfig_1 = require("../buildConfig");
class ResultsPanel {
    static viewType = 'ingSql.resultsView';
    view;
    extensionUri;
    currentResults;
    onExportRequest;
    onLoadMoreRequest;
    currentCursorId;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    setExportHandler(handler) {
        this.onExportRequest = handler;
    }
    setLoadMoreHandler(handler) {
        this.onLoadMoreRequest = handler;
    }
    setLoadingMore(loading) {
        if (this.view) {
            this.view.webview.postMessage({ type: 'loadingMore', loading });
        }
    }
    appendResults(rows, hasMore) {
        if (!this.view)
            return;
        const formattedRows = rows.map(row => row.map(val => Buffer.isBuffer(val) ? val.toString('hex').toUpperCase() : val));
        this.view.webview.postMessage({
            type: 'appendData',
            rows: formattedRows,
            hasMore: hasMore
        });
    }
    resolveWebviewView(webviewView, context, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        webviewView.webview.onDidReceiveMessage((message) => this.handleMessage(message));
        webviewView.webview.html = this.getHtmlContent();
        if (this.currentResults) {
            this.pushDataToWebview(this.currentResults);
        }
    }
    showResults(result) {
        this.currentResults = result;
        // Force the bottom panel open so the grid is visible
        vscode.commands.executeCommand('ingSql.resultsView.focus').then(() => {
            if (this.view) {
                this.pushDataToWebview(result);
            }
        });
    }
    pushDataToWebview(result) {
        if (!this.view)
            return;
        const formattedRows = result.rows.map(row => row.map(val => Buffer.isBuffer(val) ? val.toString('hex').toUpperCase() : val));
        this.currentCursorId = result.cursorId;
        this.view.webview.postMessage({
            type: 'setData',
            columns: result.columns,
            rows: formattedRows,
            rowCount: result.rowCount,
            executionTime: result.executionTime,
            hasMore: result.hasMore,
            statement: result.statement,
        });
    }
    // Explain Plan still opens as a standalone tab because it is ephemeral
    showExplainPlan(plan) {
        // ... (We maintain a separate panel just for explain plans to keep Results clear)
        const panel = vscode.window.createWebviewPanel('ingSqlExplain', 'Explain Plan', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true });
        panel.webview.html = this.getExplainPlanHtml(plan);
    }
    handleMessage(message) {
        switch (message.type) {
            case 'export':
                if (buildConfig_1.BUILD_CONFIG.isRestricted)
                    return;
                if (this.currentResults && this.onExportRequest) {
                    this.onExportRequest({
                        format: message.format,
                        results: this.currentResults,
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
            case 'loadMore':
                if (this.currentCursorId && this.onLoadMoreRequest) {
                    this.onLoadMoreRequest(this.currentCursorId);
                }
                break;
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
            /* ING Corporate Colors */
            --primary-color: #FF6200; /* ING Orange */
            --primary-hover: #E55800;
            --header-bg: var(--vscode-editorWidget-background, var(--vscode-editor-background));
            --row-hover: var(--vscode-list-hoverBackground);
            --row-alt: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
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

        /* Toolbar */
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
        
        /* Filter Bar */
        .filter-bar {
            display: none; padding: 6px 12px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-editorWidget-border);
        }
        .filter-bar.show { display: flex; }
        .filter-bar input { flex: 1; padding: 4px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px; font-family: inherit; font-size: 12px; }
        
        /* Grid */
        .grid-container { flex: 1; overflow: auto; position: relative; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
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
            white-space: nowrap;
            max-width: 400px;
            overflow: hidden;
            text-overflow: ellipsis;
            cursor: default;
        }
        tr:hover td { background: var(--vscode-list-hoverBackground); }
        tr.selected td { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
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
    <div class="toolbar">
        <span class="info" id="infoText"></span>
        <button id="loadMoreBtn" class="load-more-btn" onclick="postMsg({type:'loadMore'})" style="display: none;"> ↓ Load More</button>
        <div class="toolbar-right">
            ${buildConfig_1.BUILD_CONFIG.isRestricted ? '' : `
            <button class="icon-btn" onclick="postMsg({ type: 'export' })" title="Export">
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
        <table>
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

        let allColumns = [];
        let allRows = [];
        let filteredRows = [];
        let sortColumn = -1;
        let sortDir = 'asc';

        function postMsg(msg) { vscode.postMessage(msg); }

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
            const term = document.getElementById('filterInput').value.toLowerCase();
            if (!term) {
                filteredRows = allRows;
            } else {
                filteredRows = allRows.filter(row =>
                    row.some(cell => String(cell ?? '').toLowerCase().includes(term))
                );
            }
            renderTable();
        }

        function sortBy(colIdx) {
            if (sortColumn === colIdx) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = colIdx;
                sortDir = 'asc';
            }
            filteredRows.sort((a, b) => {
                const va = a[colIdx];
                const vb = b[colIdx];
                if (va === null && vb === null) return 0;
                if (va === null) return 1;
                if (vb === null) return -1;
                if (typeof va === 'number' && typeof vb === 'number') {
                    return sortDir === 'asc' ? va - vb : vb - va;
                }
                const sa = String(va);
                const sb = String(vb);
                return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
            });
            renderTable();
        }

        function renderTable() {
            const thead = document.getElementById('tableHead');
            const tbody = document.getElementById('tableBody');

            thead.innerHTML = '<tr><th class="row-number">#</th>' +
                allColumns.map((col, i) => {
                    const sortClass = sortColumn === i
                        ? (sortDir === 'asc' ? 'sort-asc' : 'sort-desc')
                        : '';
                    return '<th class="' + sortClass + '" onclick="sortBy(' + i + ')" title="' +
                        col.name + ' (' + col.dbType + ')">' + col.name + '</th>';
                }).join('') + '</tr>';

            const numericTypes = ['NUMBER', 'BINARY_FLOAT', 'BINARY_DOUBLE', 'FLOAT', 'INTEGER', 'INT'];
            const fragment = document.createDocumentFragment();

            for (let r = 0; r < filteredRows.length; r++) {
                const tr = document.createElement('tr');
                tr.onclick = function() {
                    document.querySelectorAll('tr.selected').forEach(el => el.classList.remove('selected'));
                    this.classList.add('selected');
                };

                const rowNumTd = document.createElement('td');
                rowNumTd.className = 'row-number';
                rowNumTd.textContent = String(r + 1);
                tr.appendChild(rowNumTd);

                for (let c = 0; c < allColumns.length; c++) {
                    const td = document.createElement('td');
                    const val = filteredRows[r][c];
                    if (val === null || val === undefined) {
                        td.textContent = NULL_DISPLAY;
                        td.className = 'null-value';
                    } else {
                        td.textContent = String(val);
                        if (numericTypes.includes(allColumns[c].dbType)) {
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

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'setData') {
                allColumns = msg.columns;
                allRows = msg.rows;
                filteredRows = [...allRows];
                sortColumn = -1;
                sortDir = 'asc';

                document.getElementById('infoText').textContent =
                    msg.rowCount + ' rows' + (msg.hasMore ? '+' : '') +
                    ' • ' + msg.executionTime + 'ms';
                document.getElementById('statusRowCount').textContent =
                    'Rows: ' + msg.rowCount + (msg.hasMore ? '+' : '');
                document.getElementById('statusExecTime').textContent =
                    'Time: ' + msg.executionTime + 'ms';
                document.getElementById('statusStatement').textContent =
                    msg.statement.substring(0, 100);

                document.getElementById('loadMoreBtn').style.display = msg.hasMore ? 'inline-flex' : 'none';
                renderTable();
            } else if (msg.type === 'appendData') {
                allRows = allRows.concat(msg.rows);
                filteredRows = [...allRows];
                if (document.getElementById('filterInput').value) {
                    applyFilter();
                } else {
                    renderTable();
                }
                
                const oldText = document.getElementById('infoText').textContent;
                const timeStr = oldText.split(' • ')[1];
                document.getElementById('infoText').textContent =
                    allRows.length + ' rows' + (msg.hasMore ? '+' : '') + ' • ' + timeStr;
                    
                document.getElementById('statusRowCount').textContent =
                    'Rows: ' + allRows.length + (msg.hasMore ? '+' : '');
                
                const loadBtn = document.getElementById('loadMoreBtn');
                loadBtn.style.display = msg.hasMore ? 'inline-flex' : 'none';
                loadBtn.textContent = '↓ Load More';
                loadBtn.disabled = false;
            } else if (msg.type === 'loadingMore') {
                const loadBtn = document.getElementById('loadMoreBtn');
                loadBtn.textContent = msg.loading ? 'Loading...' : '↓ Load More';
                loadBtn.disabled = msg.loading;
            }
        });
    </script>
</body>
</html>`;
    }
    getExplainPlanHtml(plan) {
        const escapedPlan = plan.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
            font-size: var(--vscode-editor-font-size, 13px);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 16px;
            white-space: pre;
            overflow: auto;
        }
        .plan-title {
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 12px;
            color: var(--vscode-textLink-foreground);
        }
    </style>
</head>
<body>
<div class="plan-title">Execution Plan</div>
${escapedPlan}
</body>
</html>`;
    }
    dispose() {
        // Nothing explicit to dispose for a provider view
    }
}
exports.ResultsPanel = ResultsPanel;
//# sourceMappingURL=resultsPanel.js.map