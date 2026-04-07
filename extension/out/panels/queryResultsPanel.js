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
        // Live-update settings when user changes them
        const configListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('ingSql.resultGrid') || e.affectsConfiguration('editor.fontFamily') || e.affectsConfiguration('editor.fontSize')) {
                webviewView.webview.html = this.getHtmlContent();
                setTimeout(() => this.pushCurrentResults(), 300);
            }
        });
        webviewView.onDidDispose(() => {
            this.view = undefined;
            configListener.dispose();
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
        const MAX_CLOB_LEN = 1 * 1024 * 1024; // 1 MB
        const MAX_BLOB_LEN = 512 * 1024; // 512 KB
        if (activeWs) {
            activeWs.results.forEach((result, tabIndex) => {
                const stmtPreview = result.statement.replace(/\s+/g, ' ').substring(0, 50);
                const formattedRows = result.rows.map(row => row.map((val, ci) => {
                    if (val === null || val === undefined) {
                        return val;
                    }
                    const dbType = result.columns[ci]?.dbType;
                    // Treat CLOB, NCLOB, and XMLTYPE (e.g. XMLSERIALIZE AS CLOB) identically
                    if (dbType === 'CLOB' || dbType === 'NCLOB' || dbType === 'XMLTYPE') {
                        const s = typeof val === 'string' ? val : String(val);
                        const sizeKb = Math.round(s.length / 1024);
                        if (s.length > MAX_CLOB_LEN) {
                            return { __lob: 'CLOB', truncated: true, size: s.length, sizeKb };
                        }
                        return { __lob: 'CLOB', truncated: false, value: s, sizeKb };
                    }
                    if (Buffer.isBuffer(val)) {
                        const sizeKb = Math.round(val.length / 1024);
                        if (val.length > MAX_BLOB_LEN) {
                            return { __lob: 'BLOB', truncated: true, size: val.length, sizeKb };
                        }
                        return { __lob: 'BLOB', truncated: false, hex: val.toString('hex').toUpperCase(), sizeKb };
                    }
                    // Safety net: any remaining non-primitive object that would break
                    // JSON serialization in postMessage (e.g. unreolved Lob/XMLType)
                    if (val !== null && typeof val === 'object') {
                        return String(val);
                    }
                    return val;
                }));
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
            case 'countRows': {
                if (!ws)
                    break;
                const ti = message.tabIndex ?? 0;
                const res = ws.results[ti];
                if (!res?.statement)
                    break;
                try {
                    const oracleService = oracleService_1.OracleService.getInstance();
                    const countSql = `SELECT COUNT(*) AS CNT FROM (${res.statement.replace(/;\s*$/, '')})`;
                    const countResult = await oracleService.executeQuery(countSql, {}, { maxRows: 1 });
                    const count = countResult.rows?.[0]?.[0] ?? 0;
                    this.view?.webview.postMessage({ type: 'countRowsResult', count: Number(count), tabIndex: ti });
                }
                catch (err) {
                    vscode.window.showErrorMessage(`Count Rows Error: ${err.message}`);
                    this.view?.webview.postMessage({ type: 'countRowsResult', count: -1, error: err.message, tabIndex: ti });
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
        const useEditorFont = config.get('resultGrid.useEditorFont', true);
        const gridFontCss = useEditorFont
            ? `font-family: var(--vscode-editor-font-family, 'Courier New', monospace); font-size: var(--vscode-editor-font-size, 13px);`
            : '';
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
        table { width: 100%; border-collapse: collapse; font-size: 12px; ${gridFontCss} }
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
        .lob-value { color: var(--vscode-textLink-foreground, #4dabf7); cursor: pointer; font-style: italic; }
        .lob-value:hover { text-decoration: underline; }
        .lob-truncated { color: var(--vscode-editorWarning-foreground, #cca700); font-style: italic; cursor: help; }
        .row-number {
            color: var(--vscode-descriptionForeground); text-align: right;
            border-right: 2px solid var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
            background: var(--vscode-editorWidget-background);
            position: sticky; left: 0; z-index: 5;
            min-width: 30px; padding-right: 6px; font-size: 11px;
        }

        th .col-label {
            cursor: pointer; display: inline-block;
            max-width: calc(100% - 8px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        th .col-label.sort-asc::after { content: ' \u25b2'; opacity: 0.7; }
        th .col-label.sort-desc::after { content: ' \u25bc'; opacity: 0.7; }
        th.col-header-selected { background: var(--vscode-list-activeSelectionBackground, #0e639c) !important; }
        th.col-header-selected .col-label { color: var(--vscode-list-activeSelectionForeground, #fff); }

        /* ── Column Resize ── */
        th { position: relative; }
        th .col-resizer {
            position: absolute; right: -2px; top: 0; bottom: 0; width: 5px;
            cursor: col-resize; z-index: 20; background: transparent;
        }
        th .col-resizer:hover, th .col-resizer.active { background: var(--accent); }

        /* ── Context Menu ── */
        .ctx-menu {
            position: fixed; z-index: 1000; min-width: 180px;
            background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
            color: var(--vscode-menu-foreground, var(--fg));
            border: 1px solid var(--vscode-menu-border, var(--border));
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
            background: var(--vscode-menu-selectionBackground, var(--accent));
            color: var(--vscode-menu-selectionForeground, #fff);
        }
        .ctx-menu-sep { height: 1px; margin: 4px 8px; background: var(--border); }

        /* ── Count Rows Modal ── */
        .modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 2000;
            display: none; align-items: center; justify-content: center;
        }
        .modal-overlay.show { display: flex; }
        .modal-box {
            background: var(--vscode-editorWidget-background, #252526);
            border: 1px solid var(--border); border-radius: 6px;
            padding: 20px 30px; min-width: 220px; text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .modal-box h3 { margin-bottom: 14px; font-size: 14px; font-weight: 600; }
        .modal-box .modal-count { font-size: 16px; margin-bottom: 16px; }
        .modal-box .modal-actions { display: flex; gap: 8px; justify-content: center; }
        .modal-box button {
            padding: 5px 16px; border-radius: 3px; border: 1px solid var(--border);
            cursor: pointer; font-size: 12px;
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
        }
        .modal-box button:hover { opacity: 0.9; }
        .modal-box button.secondary { background: transparent; color: var(--fg); }

        /* ── LOB Viewer Modal ── */
        .lob-modal-box { max-width: 80vw; width: 700px; max-height: 80vh; display: flex; flex-direction: column; text-align: left; }
        .lob-modal-box .lob-content {
            flex: 1; overflow: auto; white-space: pre-wrap; word-break: break-all;
            font-family: var(--vscode-editor-font-family, monospace); font-size: 12px;
            border: 1px solid var(--border); padding: 8px; margin-bottom: 14px;
            max-height: 55vh; background: var(--vscode-editor-background);
        }

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
    <!-- Context Menu -->
    <div class="ctx-menu" id="ctxMenu">
        <div class="ctx-menu-item" onclick="ctxCountRows()">Count Rows</div>
        <div class="ctx-menu-sep"></div>
        ${buildConfig_1.BUILD_CONFIG.isRestricted ? '' : '<div class="ctx-menu-item" onclick="ctxCopyHeaders()">Copy Selected Column Headers</div>'}
        ${buildConfig_1.BUILD_CONFIG.isRestricted ? '' : '<div class="ctx-menu-item" onclick="ctxCopyAllHeaders()">Copy All Column Headers</div>'}
        ${buildConfig_1.BUILD_CONFIG.isRestricted ? '' : '<div class="ctx-menu-item" onclick="exportCurrent()">Export</div>'}
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
    <!-- LOB Viewer Modal -->
    <div class="modal-overlay" id="lobModal" onclick="closeLobModal(event)">
        <div class="modal-box lob-modal-box" onclick="event.stopPropagation()">
            <h3 id="lobModalTitle">CLOB Content</h3>
            <pre class="lob-content" id="lobContent"></pre>
            <div class="modal-actions">
                ${buildConfig_1.BUILD_CONFIG.isRestricted ? '' : '<button class="secondary" onclick="copyLobContent()">Copy</button>'}
                <button onclick="document.getElementById(\'lobModal\').classList.remove(\'show\')">Close</button>
            </div>
        </div>
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
        let selectedColHeaders = new Set(); // Column indices selected via Ctrl+click for header copy

        if (${buildConfig_1.BUILD_CONFIG.isRestricted}) {
            document.addEventListener('contextmenu', e => e.preventDefault());
            document.addEventListener('copy', e => { e.preventDefault(); return false; });
            document.addEventListener('keydown', e => { if ((e.ctrlKey||e.metaKey)&&(e.key==='c'||e.key==='C')) e.preventDefault(); });
        }

        function postMsg(m) { vscode.postMessage(m); }
        function exportCurrent() { postMsg({type:'export',tabIndex:selectedTabIndex}); }
        function loadMore() { if (selectedTabIndex>=0) postMsg({type:'loadMore',tabIndex:selectedTabIndex}); }

        function showLobModal(content) {
            document.getElementById('lobContent').textContent = content;
            document.getElementById('lobModal').classList.add('show');
        }
        function closeLobModal(e) {
            if (!e || e.target === document.getElementById('lobModal')) {
                document.getElementById('lobModal').classList.remove('show');
            }
        }
        function copyLobContent() {
            const content = document.getElementById('lobContent').textContent || '';
            postMsg({type:'copyCell', value: content});
        }

        // Interactions
        function switchWorksheet(uri) { postMsg({type:'switchWorksheet', docUri: uri}); }
        function closeWorksheet(uri) { postMsg({type:'closeWorksheet', docUri: uri}); }
        function switchTab(idx) { 
            if (idx < 0 || idx >= activeTabs.length) return;
            selectedTabIndex = idx;
            selectedColHeaders.clear();
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

        // ── Context Menu State ──
        let ctxTargetCell = null;
        let ctxRightClickColIdx = -1;

        function showContextMenu(e) {
            if (${buildConfig_1.BUILD_CONFIG.isRestricted}) return;
            e.preventDefault();
            const menu = document.getElementById('ctxMenu');
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';
            menu.classList.add('show');
            ctxTargetCell = e.target.closest('td');
            const th = e.target.closest('th');
            ctxRightClickColIdx = th ? th.cellIndex - 1 : -1; // -1 for row-number col
        }
        function hideContextMenu() {
            document.getElementById('ctxMenu').classList.remove('show');
        }
        document.addEventListener('click', hideContextMenu);
        document.addEventListener('contextmenu', (e) => { if (e.target.closest('.grid-container')) showContextMenu(e); });

        function ctxCountRows() {
            hideContextMenu();
            if (selectedTabIndex < 0 || !activeTabs[selectedTabIndex]) return;
            document.getElementById('countModalValue').textContent = 'Counting...';
            document.getElementById('countModal').classList.add('show');
            postMsg({type:'countRows', tabIndex: selectedTabIndex});
        }
        function closeCountModal() { document.getElementById('countModal').classList.remove('show'); }
        function ctxCopyCount() {
            const text = document.getElementById('countModalValue').textContent;
            postMsg({type:'copyCell',value:text});
            closeCountModal();
        }
        function toggleColHeaderSelection(colIdx, ctrlKey) {
            if (!ctrlKey) {
                // Single click without Ctrl: clear all and select only this one
                selectedColHeaders.clear();
                selectedColHeaders.add(colIdx);
            } else {
                // Ctrl+click: toggle
                if (selectedColHeaders.has(colIdx)) selectedColHeaders.delete(colIdx);
                else selectedColHeaders.add(colIdx);
            }
            // Update visual state
            document.querySelectorAll('th.col-header-selected').forEach(el => el.classList.remove('col-header-selected'));
            const ths = document.querySelectorAll('#tableHead th');
            selectedColHeaders.forEach(idx => { if (ths[idx + 1]) ths[idx + 1].classList.add('col-header-selected'); });
        }
        function ctxCopyHeaders() {
            hideContextMenu();
            if (selectedTabIndex < 0 || !activeTabs[selectedTabIndex]) return;
            const t = activeTabs[selectedTabIndex];
            // Priority: multi-select set > right-clicked column > all columns
            if (selectedColHeaders.size > 0) {
                const ordered = t.columns
                    .map((c, i) => selectedColHeaders.has(i) ? c.name : null)
                    .filter(n => n !== null);
                postMsg({type:'copyCell', value: ordered.join(',')});
            } else if (ctxRightClickColIdx >= 0 && ctxRightClickColIdx < t.columns.length) {
                postMsg({type:'copyCell', value: t.columns[ctxRightClickColIdx].name});
            } else {
                postMsg({type:'copyCell', value: t.columns.map(c => c.name).join(',')});
            }
        }
        function ctxCopyAllHeaders() {
            hideContextMenu();
            if (selectedTabIndex < 0 || !activeTabs[selectedTabIndex]) return;
            postMsg({type:'copyCell', value: activeTabs[selectedTabIndex].columns.map(c => c.name).join(',')});
        }
        function ctxCopyCell() {
            hideContextMenu();
            if (ctxTargetCell) {
                postMsg({type:'copyCell',value:ctxTargetCell.textContent || ''});
            }
        }

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
            if (!resizeCol || selectedTabIndex < 0 || resizeColIdx < 0) return;
            // When moving mouse slightly right, prevent weird collapse by always overriding style
            const diff = e.clientX - resizeStartX;
            const newW = Math.max(40, resizeStartW + diff);
            resizeCol.style.width = newW + 'px';
            resizeCol.style.minWidth = newW + 'px';
            resizeCol.style.maxWidth = newW + 'px';
            
            // Persist width into the query context so it survives sorts but resets on new query
            activeTabs[selectedTabIndex].columns[resizeColIdx].width = newW;
        }
        function stopColResize(e) {
            const wasResizing = resizeCol !== null;
            document.querySelectorAll('.col-resizer.active').forEach(r => r.classList.remove('active'));
            resizeCol = null;
            resizeColIdx = -1;
            document.removeEventListener('mousemove', doColResize);
            document.removeEventListener('mouseup', stopColResize);
        }

        // ── Date sort helper ──
        const DATE_TYPES = ['DATE','TIMESTAMP','TIMESTAMP WITH TIME ZONE','TIMESTAMP WITH LOCAL TIME ZONE'];
        function parseDateVal(v) {
            if (v === null || v === undefined) return null;
            const s = String(v);
            // Detect DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY — JS new Date() would misparse as MM/DD
            const m = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/);
            if (m) {
                const d = new Date(+m[3], +m[2] - 1, +m[1]);
                return isNaN(d.getTime()) ? null : d.getTime();
            }
            const d = new Date(s);
            return isNaN(d.getTime()) ? null : d.getTime();
        }

        // ── Numeric string comparison (arbitrary precision, for NUMBER-as-string sort) ──
        function numericStringCmp(a, b) {
            const na = a[0] === '-', nb = b[0] === '-';
            if (na !== nb) return na ? -1 : 1;
            const aa = na ? a.slice(1) : a, bb = nb ? b.slice(1) : b;
            // Integer path: compare by length then lexicographically for correct numeric order
            if (aa.indexOf('.') === -1 && bb.indexOf('.') === -1) {
                const ld = aa.length - bb.length;
                if (ld !== 0) return na ? -ld : ld;
                const lx = aa > bb ? 1 : aa < bb ? -1 : 0;
                return na ? -lx : lx;
            }
            // Decimal path: parseFloat is sufficient for sort ordering
            const fn = parseFloat(a), fb = parseFloat(b);
            return isNaN(fn) || isNaN(fb) ? a.localeCompare(b) : fn - fb;
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
            
            // Apply sorting logic on the filtered dataset
            if (t.sortColumn >= 0) {
                const ci = t.sortColumn;
                const isDate = DATE_TYPES.includes(t.columns[ci]?.dbType);
                t.filteredRows.sort((a,b) => {
                    const va=a[ci],vb=b[ci];
                    if (va===null&&vb===null) return 0;
                    if (va===null) return 1; if (vb===null) return -1;
                    if (typeof va==='number'&&typeof vb==='number') return t.sortDir==='asc'?va-vb:vb-va;
                    // NUMBER columns are fetched as strings for full Oracle precision
                    const isNum = ['NUMBER','BINARY_FLOAT','BINARY_DOUBLE','FLOAT','INTEGER','INT'].includes(t.columns[ci]?.dbType);
                    if (isNum && typeof va==='string' && typeof vb==='string') {
                        const cmp = numericStringCmp(va, vb);
                        return t.sortDir==='asc' ? cmp : -cmp;
                    }
                    if (isDate) {
                        const da=parseDateVal(va), db=parseDateVal(vb);
                        if (da!==null&&db!==null) return t.sortDir==='asc'?da-db:db-da;
                    }
                    return t.sortDir==='asc'?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
                });
            }

        const thead = document.getElementById('tableHead');
        const tbody = document.getElementById('tableBody');
        thead.innerHTML = '<tr><th class="row-number">#</th>' +
            t.columns.map((col, i) => {
                const sc = t.sortColumn===i ? (t.sortDir==='asc'?'sort-asc':'sort-desc') : '';
                const styleStr = col.width ? (' style="width:'+col.width+'px;min-width:'+col.width+'px;max-width:'+col.width+'px"') : '';
                const selClass = selectedColHeaders.has(i) ? ' col-header-selected' : '';
                return '<th title="'+col.name+' ('+col.dbType+')" class="'+selClass.trim()+'"'+styleStr+' onclick="toggleColHeaderSelection('+i+',event.ctrlKey||event.metaKey)" ondblclick="sortBy('+i+')"><span class="col-label '+sc+'">'+col.name+'</span><div class="col-resizer" onmousedown="initColResize(event,'+i+')" onclick="event.stopPropagation()" ondblclick="event.stopPropagation()"></div></th>';
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
                    if (val===null||val===undefined) {
                        td.textContent=NULL_DISPLAY; td.className='null-value';
                        td.ondblclick = function() { if (!${buildConfig_1.BUILD_CONFIG.isRestricted}) postMsg({type:'copyCell',value:''}); };
                    } else if (val && typeof val==='object' && val.__lob) {
                        const lobType = val.__lob;
                        const sizeKb = val.sizeKb || 0;
                        if (val.truncated) {
                            td.innerHTML = '<span class="lob-truncated" title="'+lobType+' değeri '+sizeKb+' KB boyutunda (limit aşıldı). Tüm veriyi görmek için Export kullanın.">['+lobType+' \u2014 '+sizeKb+' KB, görüntülemek için export ediniz]</span>';
                            td.ondblclick = function() { if (!${buildConfig_1.BUILD_CONFIG.isRestricted}) postMsg({type:'copyCell',value:'['+lobType+' \u2014 '+sizeKb+' KB, truncated]'}); };
                        } else if (lobType==='CLOB') {
                            td.innerHTML = '<span class="lob-value" title="Çift tıkla: içeriği görüntüle/kopyala">[CLOB \u2014 '+sizeKb+' KB]</span>';
                            td.ondblclick = function() { showLobModal(val.value||''); if (!${buildConfig_1.BUILD_CONFIG.isRestricted}) postMsg({type:'copyCell',value:val.value||''}); };
                        } else {
                            td.innerHTML = '<span class="lob-value">[BLOB \u2014 '+sizeKb+' KB]</span>';
                            td.ondblclick = function() { if (!${buildConfig_1.BUILD_CONFIG.isRestricted}) postMsg({type:'copyCell',value:val.hex||''}); };
                        }
                    } else {
                        td.textContent=String(val);
                        if (numTypes.includes(t.columns[c].dbType)) td.className='number-value';
                        td.ondblclick = function() { if (!${buildConfig_1.BUILD_CONFIG.isRestricted}) postMsg({type:'copyCell',value:String(val??'')}); };
                    }
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
            if (selectedTabIndex < 0) return;
            const t = activeTabs[selectedTabIndex];
            if (t.sortColumn === ci) t.sortDir = t.sortDir === 'asc' ? 'desc' : 'asc';
            else { t.sortColumn = ci; t.sortDir = 'asc'; }
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
            else if (msg.type==='countRowsResult') {
                if (msg.count >= 0) {
                    document.getElementById('countModalValue').textContent = msg.count.toLocaleString() + ' Rows';
                } else {
                    document.getElementById('countModalValue').textContent = 'Error: ' + (msg.error || 'Unknown');
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