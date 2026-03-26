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
exports.ImportWizardPanel = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const iconv = __importStar(require("iconv-lite"));
class ImportWizardPanel {
    extensionUri;
    panel;
    resolvePromise;
    parsedHeaders = [];
    parsedRows = [];
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    async show() {
        this.panel = vscode.window.createWebviewPanel('ingSqlImportWizard', 'Data Import: New Table', vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [this.extensionUri] });
        this.panel.webview.html = this.getHtml();
        this.panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'browseFile':
                    await this.handleBrowseFile();
                    break;
                case 'parseFile':
                    await this.handleParseFile(msg);
                    break;
                case 'finish':
                    if (this.resolvePromise) {
                        this.resolvePromise(msg.data);
                        this.resolvePromise = undefined;
                    }
                    this.panel?.dispose();
                    break;
                case 'cancel':
                    if (this.resolvePromise) {
                        this.resolvePromise(undefined);
                        this.resolvePromise = undefined;
                    }
                    this.panel?.dispose();
                    break;
            }
        });
        this.panel.onDidDispose(() => {
            if (this.resolvePromise) {
                this.resolvePromise(undefined);
            }
            this.panel = undefined;
        });
        return new Promise((resolve) => { this.resolvePromise = resolve; });
    }
    async handleBrowseFile() {
        const uri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Select File',
            filters: { 'Data Files': ['csv', 'xlsx', 'tsv'] }
        });
        if (uri && uri.length > 0 && this.panel) {
            this.panel.webview.postMessage({ type: 'fileSelected', path: uri[0].fsPath });
        }
    }
    async handleParseFile(msg) {
        try {
            const { filePath, delimiter, leftEnclosure, hasHeader, skipRows, previewRowLimit, encoding } = msg;
            const ext = filePath.split('.').pop()?.toLowerCase();
            const fileEncoding = encoding || 'UTF-8';
            let headers = [];
            let rows = [];
            if (ext === 'xlsx') {
                const ExcelJS = require('exceljs');
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(filePath);
                const ws = workbook.worksheets[0];
                if (!ws)
                    throw new Error('No worksheet found');
                ws.eachRow((row, rowNum) => {
                    const vals = row.values.slice(1);
                    if (rowNum <= skipRows)
                        return;
                    if (rowNum === skipRows + 1 && hasHeader) {
                        headers = vals.map((v, i) => v ? String(v).replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase() : `COL_${i + 1}`);
                    }
                    else {
                        if (rows.length < previewRowLimit) {
                            rows.push(vals.map((v) => v === null || v === undefined ? null : String(v)));
                        }
                    }
                });
                if (!hasHeader && rows.length > 0) {
                    headers = rows[0].map((_, i) => `COL_${i + 1}`);
                }
            }
            else {
                // CSV/TSV parsing
                const rawBuffer = fs.readFileSync(filePath);
                const content = iconv.decode(rawBuffer, fileEncoding);
                const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
                const delim = delimiter === '\\t' ? '\t' : delimiter;
                const encl = leftEnclosure === 'none' ? '' : leftEnclosure;
                const parseLine = (line) => {
                    const result = [];
                    let inQuotes = false;
                    let current = '';
                    for (let i = 0; i < line.length; i++) {
                        const ch = line[i];
                        if (encl && ch === encl) {
                            inQuotes = !inQuotes;
                        }
                        else if (ch === delim && !inQuotes) {
                            result.push(current.trim());
                            current = '';
                        }
                        else {
                            current += ch;
                        }
                    }
                    result.push(current.trim());
                    return result.map(v => {
                        if (encl && v.startsWith(encl) && v.endsWith(encl)) {
                            return v.substring(1, v.length - 1);
                        }
                        return v;
                    });
                };
                const dataLines = lines.slice(skipRows);
                if (hasHeader && dataLines.length > 0) {
                    headers = parseLine(dataLines[0]).map((h, i) => h.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase() || `COL_${i + 1}`);
                    rows = dataLines.slice(1, previewRowLimit + 1).map(parseLine);
                }
                else {
                    rows = dataLines.slice(0, previewRowLimit).map(parseLine);
                    if (rows.length > 0) {
                        headers = rows[0].map((_, i) => `COL_${i + 1}`);
                    }
                }
            }
            this.parsedHeaders = headers;
            this.parsedRows = rows;
            if (this.panel) {
                this.panel.webview.postMessage({
                    type: 'parsedData',
                    headers,
                    rows,
                    totalLines: rows.length
                });
            }
        }
        catch (err) {
            if (this.panel) {
                this.panel.webview.postMessage({ type: 'parseError', message: err.message });
            }
        }
    }
    getHtml() {
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Data Import: New Table</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-editor-foreground);
        background: var(--vscode-editor-background);
        display: flex; flex-direction: column; height: 100vh;
    }

    /* ── Step indicator bar ── */
    .step-bar {
        display: flex; align-items: center; padding: 16px 24px;
        border-bottom: 1px solid var(--vscode-panel-border);
        gap: 0;
    }
    .step-item {
        display: flex; align-items: center; gap: 8px;
        font-size: 13px; color: var(--vscode-descriptionForeground);
        white-space: nowrap;
    }
    .step-item.active { color: var(--vscode-editor-foreground); font-weight: 600; }
    .step-item.completed { color: var(--vscode-terminal-ansiGreen); }
    .step-circle {
        width: 24px; height: 24px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 600;
        border: 2px solid var(--vscode-descriptionForeground);
        color: var(--vscode-descriptionForeground);
    }
    .step-item.active .step-circle {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border-color: var(--vscode-button-background);
    }
    .step-item.completed .step-circle {
        background: var(--vscode-terminal-ansiGreen);
        color: var(--vscode-editor-background);
        border-color: var(--vscode-terminal-ansiGreen);
    }
    .step-line {
        flex: 1; height: 2px; margin: 0 8px;
        background: var(--vscode-panel-border);
    }
    .step-line.completed { background: var(--vscode-terminal-ansiGreen); }

    /* ── Content area ── */
    .content {
        flex: 1; padding: 16px 24px; overflow-y: auto;
    }
    .step-description {
        font-size: 12px; color: var(--vscode-descriptionForeground);
        margin-bottom: 16px;
    }
    .step-panel { display: none; }
    .step-panel.active { display: block; }

    /* ── Form controls ── */
    .form-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px;
        margin-bottom: 16px;
    }
    .form-group { display: flex; flex-direction: column; gap: 4px; }
    .form-group.full { grid-column: 1 / -1; }
    label { font-size: 12px; font-weight: 500; color: var(--vscode-foreground); }
    select, input[type="text"], input[type="number"] {
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, transparent);
        padding: 5px 8px; font-size: 13px; border-radius: 2px;
        outline: none; width: 100%;
    }
    select:focus, input:focus { border-color: var(--vscode-focusBorder); }
    .checkbox-group {
        display: flex; align-items: center; gap: 6px;
        margin-bottom: 8px;
    }
    .checkbox-group label { margin: 0; font-weight: normal; }
    .file-row { display: flex; gap: 8px; }
    .file-row input { flex: 1; }

    /* ── Preview table ── */
    .preview-label { font-size: 12px; font-weight: 600; margin: 12px 0 6px; }
    .preview-table-wrap {
        max-height: 300px; overflow: auto;
        border: 1px solid var(--vscode-panel-border);
        margin-bottom: 16px;
    }
    .preview-table {
        width: 100%; border-collapse: collapse; font-size: 12px;
    }
    .preview-table th {
        background: var(--vscode-editor-selectionBackground);
        color: var(--vscode-editor-foreground);
        padding: 6px 10px; text-align: left; position: sticky; top: 0;
        border-bottom: 1px solid var(--vscode-panel-border);
        font-weight: 600;
    }
    .preview-table td {
        padding: 4px 10px;
        border-bottom: 1px solid var(--vscode-panel-border);
    }
    .preview-table tr:hover { background: var(--vscode-list-hoverBackground); }

    /* ── Column chooser (Step 3) ── */
    .column-chooser {
        display: flex; gap: 12px; align-items: stretch; margin-bottom: 16px;
    }
    .col-list-wrap {
        flex: 1; display: flex; flex-direction: column;
    }
    .col-list-wrap label { margin-bottom: 4px; }
    .col-list {
        flex: 1; min-height: 150px; max-height: 200px;
        overflow-y: auto;
        border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
        background: var(--vscode-input-background);
    }
    .col-list-item {
        padding: 4px 8px; font-size: 13px; cursor: pointer;
    }
    .col-list-item:hover { background: var(--vscode-list-hoverBackground); }
    .col-list-item.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .col-buttons {
        display: flex; flex-direction: column; justify-content: center; gap: 4px;
    }
    .col-buttons button {
        width: 32px; height: 28px; font-size: 14px;
        display: flex; align-items: center; justify-content: center;
    }

    /* ── Column definition (Step 4) ── */
    .col-def-layout {
        display: flex; gap: 16px; margin-bottom: 16px;
    }
    .col-def-left {
        width: 200px; flex-shrink: 0;
    }
    .col-def-right {
        flex: 1;
    }
    .col-def-props { display: flex; flex-direction: column; gap: 10px; }
    .col-def-props .form-group { gap: 3px; }
    .data-preview-list {
        max-height: 200px; overflow-y: auto;
        border: 1px solid var(--vscode-panel-border);
        background: var(--vscode-input-background);
    }
    .data-preview-item {
        padding: 3px 8px; font-size: 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
    }
    .data-preview-item:first-child {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    /* ── Summary (Step 5) ── */
    .summary-section {
        margin-bottom: 12px;
    }
    .summary-section h3 {
        font-size: 13px; margin-bottom: 4px;
        color: var(--vscode-editor-foreground);
    }
    .summary-section ul {
        list-style: disc; padding-left: 20px; font-size: 12px;
        color: var(--vscode-descriptionForeground);
    }
    .summary-section li { margin-bottom: 2px; }

    /* ── Footer ── */
    .footer {
        padding: 10px 24px;
        border-top: 1px solid var(--vscode-panel-border);
        display: flex; justify-content: flex-end; gap: 8px;
    }
    button {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none; padding: 6px 14px; font-size: 13px;
        cursor: pointer; border-radius: 2px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
        background: transparent;
        color: var(--vscode-button-secondaryForeground);
        border: 1px solid var(--vscode-button-border, var(--vscode-focusBorder));
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button:disabled { opacity: 0.5; cursor: default; }
    button.primary-finish {
        background: var(--vscode-button-background);
    }
</style>
</head>
<body>

<!-- Step Bar -->
<div class="step-bar" id="stepBar"></div>

<!-- Content -->
<div class="content">

<!-- ═══ Step 1: Data Preview ═══ -->
<div class="step-panel" id="step1">
    <p class="step-description">Select the source file and configure parsing options. Click Preview to see the data.</p>
    <div class="form-grid">
        <div class="form-group">
            <label>Source</label>
            <select id="source"><option>Local file</option></select>
        </div>
        <div class="form-group">
            <label>File</label>
            <div class="file-row">
                <input type="text" id="filePath" placeholder="No file selected" readonly>
                <button class="secondary" id="browseBtn">Browse...</button>
            </div>
        </div>
        <div class="form-group">
            <label>Format</label>
            <select id="format">
                <option value="csv">csv</option>
                <option value="xlsx">xlsx</option>
            </select>
        </div>
        <div class="form-group">
            <label>Delimiter</label>
            <select id="delimiter">
                <option value=",">,</option>
                <option value=";">;</option>
                <option value="|">|</option>
                <option value="\\t">Tab</option>
            </select>
        </div>
        <div class="form-group">
            <label>Left enclosure</label>
            <select id="leftEnclosure">
                <option value='"'>"</option>
                <option value="'">'</option>
                <option value="none">none</option>
            </select>
        </div>
        <div class="form-group">
            <label>Right enclosure</label>
            <select id="rightEnclosure">
                <option value='"'>"</option>
                <option value="'">'</option>
                <option value="none">none</option>
            </select>
        </div>
        <div class="form-group">
            <label>Encoding</label>
            <select id="encoding">
                <option value="UTF-8">UTF-8</option>
                <option value="windows-1254">Windows-1254 (Turkish)</option>
                <option value="ISO-8859-9">ISO 8859-9 (Latin-5 Turkish)</option>
                <option value="latin1">Latin1 (ISO 8859-1)</option>
                <option value="ascii">ASCII</option>
                <option value="UTF-16LE">UTF-16 LE</option>
            </select>
        </div>
        <div class="form-group">
            <label>Line terminator</label>
            <select id="lineTerminator">
                <option value="standard">standard: CR LF, CR or LF</option>
            </select>
        </div>
        <div class="form-group">
            <label>Row Skipping Order</label>
            <select><option>After skip</option></select>
        </div>
        <div class="form-group">
            <label>Skip Rows</label>
            <input type="number" id="skipRows" value="0" min="0">
        </div>
    </div>
    <div class="checkbox-group">
        <input type="checkbox" id="previewRowLimitCheck" checked>
        <label for="previewRowLimitCheck">Preview Row Limit</label>
    </div>
    <input type="number" id="previewRowLimit" value="100" min="1" style="width:80px;margin-bottom:8px;">
    <div class="checkbox-group">
        <input type="checkbox" id="hasHeader" checked>
        <label for="hasHeader">Header</label>
    </div>
    <button class="secondary" id="previewBtn" style="margin-bottom:12px;">Preview</button>
    <div class="preview-label">File Content</div>
    <div class="preview-table-wrap"><table class="preview-table" id="previewTable"><tbody><tr><td style="color:var(--vscode-descriptionForeground)">Select a file and click Preview</td></tr></tbody></table></div>
</div>

<!-- ═══ Step 2: Import Method ═══ -->
<div class="step-panel" id="step2">
    <p class="step-description">Specify the method for importing data. For other methods, a new table is created and the data is imported.</p>
    <div class="form-grid">
        <div class="form-group">
            <label>Import Method</label>
            <select id="importMethod">
                <option value="INSERT">Insert</option>
            </select>
        </div>
        <div class="form-group">
            <label>Table Name</label>
            <input type="text" id="tableName" value="">
        </div>
    </div>
    <div class="checkbox-group">
        <input type="checkbox" id="importRowLimitCheck">
        <label for="importRowLimitCheck">Import row limit</label>
    </div>
    <input type="number" id="importRowLimit" value="100" min="1" style="width:80px;margin-bottom:12px;">
    <div class="preview-label">File Content</div>
    <div class="preview-table-wrap"><table class="preview-table" id="previewTable2"><tbody></tbody></table></div>
</div>

<!-- ═══ Step 3: Choose Column ═══ -->
<div class="step-panel" id="step3">
    <p class="step-description">Select the columns to import from the data set and arrange them in the order you want.</p>
    <div class="column-chooser">
        <div class="col-list-wrap">
            <label>Available Columns</label>
            <div class="col-list" id="availableCols"></div>
        </div>
        <div class="col-buttons">
            <button class="secondary" id="addAllBtn" title="Add all">»</button>
            <button class="secondary" id="addBtn" title="Add selected">›</button>
            <button class="secondary" id="removeBtn" title="Remove selected">‹</button>
            <button class="secondary" id="removeAllBtn" title="Remove all">«</button>
        </div>
        <div class="col-list-wrap">
            <label>Selected Columns</label>
            <div class="col-list" id="selectedCols"></div>
        </div>
        <div class="col-buttons">
            <button class="secondary" id="moveUpBtn" title="Move up">↑</button>
            <button class="secondary" id="moveDownBtn" title="Move down">↓</button>
        </div>
    </div>
    <div class="preview-label">File Content</div>
    <div class="preview-table-wrap"><table class="preview-table" id="previewTable3"><tbody></tbody></table></div>
</div>

<!-- ═══ Step 4: Column Definition ═══ -->
<div class="step-panel" id="step4">
    <p class="step-description">For each column on the left, define the column details of the database column that will be created to import this data into.</p>
    <div class="col-def-layout">
        <div class="col-def-left">
            <label>Source Data Columns</label>
            <div class="col-list" id="sourceColsList" style="min-height:200px;"></div>
        </div>
        <div class="col-def-right">
            <div class="col-def-props">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="colName">
                </div>
                <div class="form-group">
                    <label>Data Type</label>
                    <select id="colDataType">
                        <option value="VARCHAR2">VARCHAR2</option>
                        <option value="NUMBER">NUMBER</option>
                        <option value="DATE">DATE</option>
                        <option value="TIMESTAMP">TIMESTAMP</option>
                        <option value="CLOB">CLOB</option>
                        <option value="BLOB">BLOB</option>
                        <option value="INTEGER">INTEGER</option>
                        <option value="FLOAT">FLOAT</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Size/Precision</label>
                    <input type="number" id="colSize" value="4000" min="1">
                </div>
                <div class="form-group">
                    <label>Default</label>
                    <input type="text" id="colDefault" value="">
                </div>
                <div class="form-group">
                    <label>Comment</label>
                    <input type="text" id="colComment" value="">
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="colNullable" checked>
                    <label for="colNullable">Nullable</label>
                </div>
            </div>
        </div>
    </div>
    <label>Data</label>
    <div class="data-preview-list" id="colDataPreview"></div>
</div>

<!-- ═══ Step 5: Import Summary ═══ -->
<div class="step-panel" id="step5">
    <div id="summaryContent"></div>
</div>

</div>

<!-- Footer -->
<div class="footer">
    <button class="secondary" id="cancelBtn">Cancel</button>
    <button class="secondary" id="backBtn" disabled>Back</button>
    <button id="nextBtn">Next</button>
    <button id="finishBtn" class="primary-finish" style="display:none">Finish</button>
</div>

<script>
const vscode = acquireVsCodeApi();

// ── State ──
let currentStep = 1;
const totalSteps = 5;
const stepNames = ['Data Preview', 'Import Method', 'Choose Column', 'Column Definition', 'Import Summary'];

let parsedHeaders = [];
let parsedRows = [];
let availableColumns = [];
let selectedColumns = [];  // array of column names
let columnDefs = {};       // { colName: ColumnDef }
let activeAvailCol = null;
let activeSelectedCol = null;
let activeSourceCol = null;

// ── Step bar ──
function renderStepBar() {
    const bar = document.getElementById('stepBar');
    bar.innerHTML = '';
    for (let i = 1; i <= totalSteps; i++) {
        const cls = i < currentStep ? 'completed' : i === currentStep ? 'active' : '';
        const icon = i < currentStep ? '✓' : i;
        bar.innerHTML += '<div class="step-item ' + cls + '"><span class="step-circle">' + icon + '</span> ' + stepNames[i-1] + '</div>';
        if (i < totalSteps) {
            bar.innerHTML += '<div class="step-line ' + (i < currentStep ? 'completed' : '') + '"></div>';
        }
    }
}

function showStep(n) {
    currentStep = n;
    for (let i = 1; i <= totalSteps; i++) {
        document.getElementById('step' + i).classList.toggle('active', i === n);
    }
    renderStepBar();
    document.getElementById('backBtn').disabled = n === 1;
    document.getElementById('nextBtn').style.display = n < totalSteps ? '' : 'none';
    document.getElementById('finishBtn').style.display = n === totalSteps ? '' : 'none';

    if (n === 2) renderStep2Preview();
    if (n === 3) renderStep3();
    if (n === 4) renderStep4();
    if (n === 5) renderSummary();
}

// ── Step 1 handlers ──
document.getElementById('browseBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'browseFile' });
});

document.getElementById('previewBtn').addEventListener('click', () => {
    const filePath = document.getElementById('filePath').value;
    if (!filePath) return;
    vscode.postMessage({
        type: 'parseFile',
        filePath,
        delimiter: document.getElementById('delimiter').value,
        leftEnclosure: document.getElementById('leftEnclosure').value,
        hasHeader: document.getElementById('hasHeader').checked,
        skipRows: parseInt(document.getElementById('skipRows').value) || 0,
        previewRowLimit: parseInt(document.getElementById('previewRowLimit').value) || 100,
        encoding: document.getElementById('encoding').value
    });
});

function renderPreviewTable(tableId, headers, rows, filterCols) {
    const cols = filterCols || headers;
    const colIndices = cols.map(c => headers.indexOf(c)).filter(i => i >= 0);
    let html = '<thead><tr>';
    colIndices.forEach(i => { html += '<th>' + esc(headers[i]) + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(row => {
        html += '<tr>';
        colIndices.forEach(i => { html += '<td>' + esc(row[i] ?? '') + '</td>'; });
        html += '</tr>';
    });
    html += '</tbody>';
    document.getElementById(tableId).innerHTML = html;
}

function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Step 2 ──
function renderStep2Preview() {
    if (!document.getElementById('tableName').value && parsedHeaders.length) {
        const fp = document.getElementById('filePath').value || '';
        const name = fp.split(/[\\/]/).pop()?.split('.')[0]?.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase() || 'NEW_TABLE';
        document.getElementById('tableName').value = name;
    }
    renderPreviewTable('previewTable2', parsedHeaders, parsedRows);
}

// ── Step 3: Column chooser ──
function renderStep3() {
    if (selectedColumns.length === 0 && parsedHeaders.length > 0) {
        selectedColumns = [...parsedHeaders];
        availableColumns = [];
    }
    renderColLists();
    renderPreviewTable('previewTable3', parsedHeaders, parsedRows, selectedColumns);
}

function renderColLists() {
    const avail = document.getElementById('availableCols');
    const sel = document.getElementById('selectedCols');
    avail.innerHTML = availableColumns.map(c =>
        '<div class="col-list-item' + (c === activeAvailCol ? ' selected' : '') + '" data-col="' + esc(c) + '">' + esc(c) + '</div>'
    ).join('');
    sel.innerHTML = selectedColumns.map(c =>
        '<div class="col-list-item' + (c === activeSelectedCol ? ' selected' : '') + '" data-col="' + esc(c) + '">' + esc(c) + '</div>'
    ).join('');

    avail.querySelectorAll('.col-list-item').forEach(el => {
        el.addEventListener('click', () => { activeAvailCol = el.dataset.col; renderColLists(); });
    });
    sel.querySelectorAll('.col-list-item').forEach(el => {
        el.addEventListener('click', () => { activeSelectedCol = el.dataset.col; renderColLists(); });
    });
}

document.getElementById('addAllBtn').addEventListener('click', () => {
    selectedColumns.push(...availableColumns); availableColumns = []; renderColLists();
    renderPreviewTable('previewTable3', parsedHeaders, parsedRows, selectedColumns);
});
document.getElementById('addBtn').addEventListener('click', () => {
    if (activeAvailCol) {
        availableColumns = availableColumns.filter(c => c !== activeAvailCol);
        selectedColumns.push(activeAvailCol); activeAvailCol = null; renderColLists();
        renderPreviewTable('previewTable3', parsedHeaders, parsedRows, selectedColumns);
    }
});
document.getElementById('removeBtn').addEventListener('click', () => {
    if (activeSelectedCol) {
        selectedColumns = selectedColumns.filter(c => c !== activeSelectedCol);
        availableColumns.push(activeSelectedCol); activeSelectedCol = null; renderColLists();
        renderPreviewTable('previewTable3', parsedHeaders, parsedRows, selectedColumns);
    }
});
document.getElementById('removeAllBtn').addEventListener('click', () => {
    availableColumns.push(...selectedColumns); selectedColumns = []; renderColLists();
    renderPreviewTable('previewTable3', parsedHeaders, parsedRows, selectedColumns);
});
document.getElementById('moveUpBtn').addEventListener('click', () => {
    if (!activeSelectedCol) return;
    const i = selectedColumns.indexOf(activeSelectedCol);
    if (i > 0) { [selectedColumns[i-1], selectedColumns[i]] = [selectedColumns[i], selectedColumns[i-1]]; renderColLists(); }
});
document.getElementById('moveDownBtn').addEventListener('click', () => {
    if (!activeSelectedCol) return;
    const i = selectedColumns.indexOf(activeSelectedCol);
    if (i < selectedColumns.length - 1) { [selectedColumns[i], selectedColumns[i+1]] = [selectedColumns[i+1], selectedColumns[i]]; renderColLists(); }
});

// ── Step 4: Column Definition ──
function initColumnDefs() {
    selectedColumns.forEach(col => {
        if (!columnDefs[col]) {
            const colIdx = parsedHeaders.indexOf(col);
            const maxLen = parsedRows.reduce((mx, row) => {
                const val = row[colIdx];
                return Math.max(mx, val ? String(val).length : 0);
            }, 0);
            const isNumeric = parsedRows.length > 0 && parsedRows.every(row => {
                const v = row[colIdx];
                return v === null || v === '' || !isNaN(Number(v));
            });
            columnDefs[col] = {
                sourceName: col,
                name: col,
                dataType: isNumeric ? 'NUMBER' : 'VARCHAR2',
                size: isNumeric ? 38 : Math.max(maxLen * 2, 100),
                defaultValue: '',
                comment: '',
                nullable: true
            };
        }
    });
}

function renderStep4() {
    initColumnDefs();
    activeSourceCol = activeSourceCol || selectedColumns[0] || null;
    const list = document.getElementById('sourceColsList');
    list.innerHTML = selectedColumns.map(c =>
        '<div class="col-list-item' + (c === activeSourceCol ? ' selected' : '') + '" data-col="' + esc(c) + '">' + esc(c) + '</div>'
    ).join('');

    list.querySelectorAll('.col-list-item').forEach(el => {
        el.addEventListener('click', () => {
            saveCurrentColDef();
            activeSourceCol = el.dataset.col;
            renderStep4();
        });
    });

    if (activeSourceCol && columnDefs[activeSourceCol]) {
        const def = columnDefs[activeSourceCol];
        document.getElementById('colName').value = def.name;
        document.getElementById('colDataType').value = def.dataType;
        document.getElementById('colSize').value = def.size;
        document.getElementById('colDefault').value = def.defaultValue;
        document.getElementById('colComment').value = def.comment;
        document.getElementById('colNullable').checked = def.nullable;

        // Data preview
        const colIdx = parsedHeaders.indexOf(activeSourceCol);
        const dp = document.getElementById('colDataPreview');
        dp.innerHTML = parsedRows.slice(0, 20).map(row =>
            '<div class="data-preview-item">' + esc(row[colIdx] ?? '(null)') + '</div>'
        ).join('');
    }
}

function saveCurrentColDef() {
    if (activeSourceCol && columnDefs[activeSourceCol]) {
        const def = columnDefs[activeSourceCol];
        def.name = document.getElementById('colName').value || def.sourceName;
        def.dataType = document.getElementById('colDataType').value;
        def.size = parseInt(document.getElementById('colSize').value) || 4000;
        def.defaultValue = document.getElementById('colDefault').value;
        def.comment = document.getElementById('colComment').value;
        def.nullable = document.getElementById('colNullable').checked;
    }
}

// ── Step 5: Summary ──
function renderSummary() {
    saveCurrentColDef();
    const tableName = document.getElementById('tableName').value || 'NEW_TABLE';
    const format = document.getElementById('format').value;
    const delim = document.getElementById('delimiter').value;
    const leftEnc = document.getElementById('leftEnclosure').value;
    const rightEnc = document.getElementById('rightEnclosure').value;
    const hasHeader = document.getElementById('hasHeader').checked;
    const importMethod = document.getElementById('importMethod').value;
    const rowLimitChecked = document.getElementById('importRowLimitCheck').checked;
    const rowLimit = document.getElementById('importRowLimit').value;

    let html = '<div class="summary-section"><h3>▾ Table: ' + esc(tableName) + '</h3><ul>';
    selectedColumns.forEach(c => {
        const def = columnDefs[c] || {};
        html += '<li>Field: ' + esc(def.name || c) + '</li>';
    });
    html += '</ul></div>';

    html += '<div class="summary-section"><h3>▾ Source File</h3></div>';

    html += '<div class="summary-section"><h3>▾ File Properties: ' + esc(format) + ' format</h3><ul>';
    html += '<li>' + (hasHeader ? '✓' : '✗') + ' Header</li>';
    html += '<li>Delimiter: ' + esc(delim) + '</li>';
    html += '<li>Left Enclosure: ' + esc(leftEnc) + '</li>';
    html += '<li>Right Enclosure: ' + esc(rightEnc) + '</li>';
    html += '<li>Line Terminator: "standard"</li>';
    html += '</ul></div>';

    html += '<div class="summary-section"><h3>▾ Fields: ' + esc(format) + ' format</h3><ul>';
    selectedColumns.forEach(c => {
        const def = columnDefs[c] || {};
        html += '<li>' + esc(def.name || c) + '    Size: ' + (def.size || 4000) + '</li>';
    });
    html += '</ul></div>';

    html += '<div class="summary-section"><h3>▾ Selected Fields</h3><ul>';
    selectedColumns.forEach(c => {
        const def = columnDefs[c] || {};
        html += '<li>Field: ' + esc(c) + ' ===> ' + esc(def.name || c) + '</li>';
    });
    html += '</ul></div>';

    html += '<div class="summary-section"><h3>Fields Not Selected</h3></div>';

    html += '<div class="summary-section"><h3>▾ Import Method: ' + esc(importMethod.toLowerCase()) + '</h3></div>';

    html += '<div class="summary-section"><h3>▾ Method Options</h3><ul>';
    html += '<li>✗ Send Create Script to SQL Worksheet</li>';
    html += '<li>' + (rowLimitChecked ? '✓' : '✗') + ' Limit Rows to Load</li>';
    if (rowLimitChecked) html += '<li>Limit Rows to Load Number: ' + esc(rowLimit) + '</li>';
    html += '</ul></div>';

    document.getElementById('summaryContent').innerHTML = html;
}

// ── Navigation ──
document.getElementById('nextBtn').addEventListener('click', () => {
    if (currentStep === 1 && parsedHeaders.length === 0) {
        // Auto-preview if not done yet
        document.getElementById('previewBtn').click();
        return;
    }
    if (currentStep < totalSteps) showStep(currentStep + 1);
});
document.getElementById('backBtn').addEventListener('click', () => {
    if (currentStep === 4) saveCurrentColDef();
    if (currentStep > 1) showStep(currentStep - 1);
});
document.getElementById('cancelBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
});
document.getElementById('finishBtn').addEventListener('click', () => {
    saveCurrentColDef();
    const rowLimitChecked = document.getElementById('importRowLimitCheck').checked;
    const data = {
        filePath: document.getElementById('filePath').value,
        format: document.getElementById('format').value,
        delimiter: document.getElementById('delimiter').value,
        leftEnclosure: document.getElementById('leftEnclosure').value,
        rightEnclosure: document.getElementById('rightEnclosure').value,
        encoding: document.getElementById('encoding').value,
        lineTerminator: document.getElementById('lineTerminator').value,
        skipRows: parseInt(document.getElementById('skipRows').value) || 0,
        hasHeader: document.getElementById('hasHeader').checked,
        previewRowLimit: parseInt(document.getElementById('previewRowLimit').value) || 100,
        importMethod: document.getElementById('importMethod').value,
        tableName: document.getElementById('tableName').value,
        importRowLimit: rowLimitChecked ? parseInt(document.getElementById('importRowLimit').value) : null,
        selectedColumns: selectedColumns.map(c => columnDefs[c] || { sourceName: c, name: c, dataType: 'VARCHAR2', size: 4000, defaultValue: '', comment: '', nullable: true }),
        headers: parsedHeaders,
        rows: parsedRows
    };
    vscode.postMessage({ type: 'finish', data });
});

// ── Messages from extension ──
window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'fileSelected') {
        document.getElementById('filePath').value = msg.path;
        const ext = msg.path.split('.').pop().toLowerCase();
        document.getElementById('format').value = ext === 'xlsx' ? 'xlsx' : 'csv';
    }
    if (msg.type === 'parsedData') {
        parsedHeaders = msg.headers;
        parsedRows = msg.rows;
        selectedColumns = [...msg.headers];
        availableColumns = [];
        columnDefs = {};
        renderPreviewTable('previewTable', parsedHeaders, parsedRows);
    }
    if (msg.type === 'parseError') {
        const tbl = document.getElementById('previewTable');
        tbl.innerHTML = '<tbody><tr><td style="color:var(--vscode-errorForeground)">Error: ' + esc(msg.message) + '</td></tr></tbody>';
    }
});

// Init
showStep(1);
</script>
</body>
</html>`;
    }
}
exports.ImportWizardPanel = ImportWizardPanel;
//# sourceMappingURL=importWizardPanel.js.map