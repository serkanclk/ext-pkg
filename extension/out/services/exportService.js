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
exports.ExportService = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const oracleService_1 = require("./oracleService");
const exportPanel_1 = require("../panels/exportPanel");
const EXPORT_BATCH_SIZE = 10000;
/**
 * Helper: write to stream with backpressure handling.
 * If the internal buffer is full, wait for 'drain' before continuing.
 * This prevents Node.js from queuing hundreds of MBs in memory.
 */
function streamWrite(stream, data) {
    return new Promise((resolve, reject) => {
        const ok = stream.write(data);
        if (ok) {
            resolve();
        }
        else {
            // Buffer is full — wait for drain before writing more
            stream.once('drain', resolve);
            stream.once('error', reject);
        }
    });
}
class ExportService {
    static instance;
    context;
    static getInstance(context) {
        if (!ExportService.instance) {
            ExportService.instance = new ExportService();
        }
        if (context && !ExportService.instance.context) {
            ExportService.instance.context = context;
        }
        return ExportService.instance;
    }
    async promptAndExport(options) {
        let format = options.format;
        let filePath = options.filePath;
        let downloadToDevice = options.downloadToDevice ?? true;
        // Either format or filePath missing -> open panel
        if (!format || !filePath) {
            if (!this.context) {
                vscode.window.showErrorMessage('ExportService not initialized with context, cannot show Export Settings.');
                return undefined;
            }
            const exportPanel = new exportPanel_1.ExportPanel(this.context.extensionUri);
            const userOptions = await exportPanel.show();
            if (!userOptions || !userOptions.format) {
                return undefined;
            }
            format = userOptions.format;
            downloadToDevice = userOptions.downloadToDevice ?? true;
            if (userOptions.filePath) {
                filePath = userOptions.filePath;
            }
            else {
                vscode.window.showErrorMessage('No file path specified for export.');
                return undefined;
            }
        }
        const start = Date.now();
        const exportPath = filePath;
        // Ensure the target directory exists
        const exportDir = path.dirname(exportPath);
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }
        try {
            let totalRows;
            if (options.statement && options.connectionName) {
                totalRows = await this.streamingExport(format, exportPath, options.statement, options.connectionName, options.tableName);
            }
            else if (options.columns && options.rows) {
                await this.writeFormat(format, exportPath, options.columns, options.rows, options.tableName, options.statement);
                totalRows = options.rows.length;
            }
            else {
                vscode.window.showErrorMessage('Export requires either a SQL statement or data.');
                return undefined;
            }
            const stats = fs.statSync(exportPath);
            const result = {
                filePath: exportPath,
                rowCount: totalRows,
                fileSize: stats.size,
                format: format,
                durationMs: Date.now() - start,
            };
            // Auto-download to client
            if (downloadToDevice) {
                await this.triggerClientDownload(exportPath);
            }
            vscode.window.showInformationMessage(`Exported ${result.rowCount.toLocaleString()} rows (${this.formatFileSize(result.fileSize)}) to ${path.basename(exportPath)} in ${(result.durationMs / 1000).toFixed(1)}s`);
            return result;
        }
        catch (err) {
            if (err.message !== 'Export cancelled by user.') {
                vscode.window.showErrorMessage(`Export failed: ${err.message}`);
            }
            throw err;
        }
    }
    // ─────────────────────────────────────────────────────────────────────
    // Streaming export — fetch batches from Oracle, write directly to file
    // ─────────────────────────────────────────────────────────────────────
    async streamingExport(format, filePath, sql, connectionName, tableName) {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Exporting data...',
            cancellable: true
        }, async (progress, token) => {
            const oracleService = oracleService_1.OracleService.getInstance();
            let columns = [];
            const stream = fs.createWriteStream(filePath, { encoding: 'utf-8', highWaterMark: 64 * 1024 });
            let writer = null;
            const exportStart = Date.now();
            progress.report({ message: 'Initializing export cursor...' });
            try {
                const totalRows = await oracleService.executeExportStream(sql, connectionName, EXPORT_BATCH_SIZE, (cols) => {
                    columns = cols;
                    writer = this.createStreamWriter(format, stream, columns, tableName, sql);
                    writer.writeHeader();
                }, async (rows, _batchNum, totalSoFar) => {
                    await writer.writeBatch(rows);
                    const elapsed = ((Date.now() - exportStart) / 1000).toFixed(1);
                    progress.report({
                        message: `Exported ${totalSoFar.toLocaleString()} rows... (${elapsed}s)`
                    });
                }, () => token.isCancellationRequested);
                if (token.isCancellationRequested) {
                    stream.end();
                    try {
                        fs.unlinkSync(filePath);
                    }
                    catch { }
                    throw new Error('Export cancelled by user.');
                }
                // Write footer/closing tags
                if (writer) {
                    await writer.writeFooter(totalRows);
                }
                // Release writer refs so GC can collect column data, ExcelJS objects, etc.
                writer = null;
                columns = [];
                // Wait for stream to finish flushing to disk
                await new Promise((resolve, reject) => {
                    stream.end(() => resolve());
                    stream.on('error', reject);
                });
                return totalRows;
            }
            catch (err) {
                stream.end();
                writer = null;
                columns = [];
                throw err;
            }
        });
    }
    createStreamWriter(format, stream, columns, tableName, sql) {
        const config = vscode.workspace.getConfiguration('ingSql');
        const nullDisplay = config.get('resultGrid.nullDisplay', '(null)');
        switch (format) {
            case 'csv': return new CsvStreamWriter(stream, columns, nullDisplay);
            case 'json': return new JsonStreamWriter(stream, columns);
            case 'xml': return new XmlStreamWriter(stream, columns, tableName);
            case 'sql': return new SqlStreamWriter(stream, columns, tableName || 'TABLE_NAME');
            case 'html': return new HtmlStreamWriter(stream, columns, tableName, nullDisplay);
            case 'xlsx': return new XlsxStreamWriter(stream, columns, tableName, sql);
            default: return new CsvStreamWriter(stream, columns, nullDisplay);
        }
    }
    // ─────────────────────────────────────────────
    // In-memory write (for small result-grid exports)
    // ─────────────────────────────────────────────
    async writeFormat(format, filePath, columns, rows, tableName, statement) {
        const stream = fs.createWriteStream(filePath, { encoding: 'utf-8' });
        const writer = this.createStreamWriter(format, stream, columns, tableName, statement);
        writer.writeHeader();
        await writer.writeBatch(rows);
        await writer.writeFooter(rows.length);
        await new Promise((resolve, reject) => {
            stream.end(() => resolve());
            stream.on('error', reject);
        });
    }
    formatFileSize(bytes) {
        if (bytes < 1024) {
            return bytes + ' B';
        }
        if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(1) + ' KB';
        }
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    /**
     * Triggers a client-side download by spinning up a temporary HTTP server.
     * 1. Starts an HTTP server on a random port serving the file
     * 2. Uses vscode.env.asExternalUri to get a client-accessible URL (handles port forwarding)
     * 3. Uses vscode.env.openExternal to open the URL in the browser
     * 4. Content-Disposition: attachment forces the browser to download
     * 5. Server self-destructs after serving
     */
    async triggerClientDownload(filePath) {
        const fileName = path.basename(filePath);
        const mimeTypes = {
            csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            json: 'application/json', xml: 'application/xml', sql: 'text/plain', html: 'text/html'
        };
        const ext = path.extname(filePath).slice(1).toLowerCase();
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        return new Promise((resolve) => {
            const server = http.createServer((req, res) => {
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Cache-Control', 'no-store');
                const readStream = fs.createReadStream(filePath);
                readStream.pipe(res);
                readStream.on('end', () => {
                    server.close();
                    resolve();
                });
                readStream.on('error', (err) => {
                    console.error('[Export] File streaming error:', err.message);
                    res.statusCode = 500;
                    res.end('File read error');
                    server.close();
                    resolve();
                });
            });
            server.listen(0, '127.0.0.1', async () => {
                try {
                    const address = server.address();
                    const localUri = vscode.Uri.parse(`http://127.0.0.1:${address.port}/`);
                    const externalUri = await vscode.env.asExternalUri(localUri);
                    await vscode.env.openExternal(externalUri);
                }
                catch (err) {
                    console.error('[Export] Download server error:', err.message);
                    server.close();
                    vscode.window.showWarningMessage(`Export saved on server at: ${filePath}`);
                    resolve();
                }
            });
            setTimeout(() => {
                try {
                    server.close();
                }
                catch { }
                resolve();
            }, 30000);
        });
    }
}
exports.ExportService = ExportService;
function formatValue(val, nullDisplay = '') {
    if (val === null || val === undefined) {
        return nullDisplay;
    }
    if (val instanceof Date) {
        return val.toISOString();
    }
    if (Buffer.isBuffer(val)) {
        return val.toString('base64');
    }
    return String(val);
}
function csvEscape(value) {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}
function xmlEscape(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
function htmlEscape(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
// ── CSV ──
class CsvStreamWriter {
    stream;
    columns;
    nullDisplay;
    constructor(stream, columns, nullDisplay) {
        this.stream = stream;
        this.columns = columns;
        this.nullDisplay = nullDisplay;
    }
    writeHeader() {
        this.stream.write('\ufeff');
        this.stream.write(this.columns.map(c => csvEscape(c.name)).join(',') + '\n');
    }
    async writeBatch(rows) {
        // Build chunk of ~1000 rows at a time to balance memory vs syscall overhead
        const CHUNK = 1000;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const end = Math.min(i + CHUNK, rows.length);
            let chunk = '';
            for (let j = i; j < end; j++) {
                chunk += rows[j].map(val => csvEscape(formatValue(val, this.nullDisplay))).join(',') + '\n';
            }
            await streamWrite(this.stream, chunk);
        }
    }
    async writeFooter() { }
}
// ── JSON ──
class JsonStreamWriter {
    stream;
    columns;
    isFirst = true;
    constructor(stream, columns) {
        this.stream = stream;
        this.columns = columns;
    }
    writeHeader() {
        this.stream.write('[\n');
    }
    async writeBatch(rows) {
        let chunk = '';
        for (const row of rows) {
            const obj = {};
            this.columns.forEach((col, idx) => {
                obj[col.name] = row[idx];
            });
            if (!this.isFirst) {
                chunk += ',\n';
            }
            chunk += '  ' + JSON.stringify(obj);
            this.isFirst = false;
        }
        await streamWrite(this.stream, chunk);
    }
    async writeFooter() {
        await streamWrite(this.stream, '\n]\n');
    }
}
// ── XML ──
class XmlStreamWriter {
    stream;
    columns;
    root;
    constructor(stream, columns, tableName) {
        this.stream = stream;
        this.columns = columns;
        this.root = tableName || 'DATA';
    }
    writeHeader() {
        this.stream.write('<?xml version="1.0" encoding="UTF-8"?>\n');
        this.stream.write(`<${this.root}>\n`);
    }
    async writeBatch(rows) {
        const CHUNK = 500; // XML rows are larger, smaller chunks
        for (let i = 0; i < rows.length; i += CHUNK) {
            const end = Math.min(i + CHUNK, rows.length);
            let chunk = '';
            for (let j = i; j < end; j++) {
                chunk += '  <ROW>\n';
                this.columns.forEach((col, idx) => {
                    const escaped = xmlEscape(formatValue(rows[j][idx]));
                    chunk += `    <${col.name}>${escaped}</${col.name}>\n`;
                });
                chunk += '  </ROW>\n';
            }
            await streamWrite(this.stream, chunk);
        }
    }
    async writeFooter() {
        await streamWrite(this.stream, `</${this.root}>\n`);
    }
}
// ── SQL (INSERT statements) ──
class SqlStreamWriter {
    stream;
    columns;
    tableName;
    constructor(stream, columns, tableName) {
        this.stream = stream;
        this.columns = columns;
        this.tableName = tableName;
    }
    writeHeader() { }
    async writeBatch(rows) {
        const colNames = this.columns.map(c => c.name).join(', ');
        const CHUNK = 1000;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const end = Math.min(i + CHUNK, rows.length);
            let chunk = '';
            for (let j = i; j < end; j++) {
                const values = rows[j].map((val, idx) => {
                    if (val === null || val === undefined) {
                        return 'NULL';
                    }
                    const col = this.columns[idx];
                    if (['NUMBER', 'BINARY_FLOAT', 'BINARY_DOUBLE', 'FLOAT', 'INTEGER'].includes(col.dbType)) {
                        return String(val);
                    }
                    if (col.dbType === 'DATE' || col.dbType.startsWith('TIMESTAMP')) {
                        return `TO_DATE('${val}', 'YYYY-MM-DD HH24:MI:SS')`;
                    }
                    return `'${String(val).replace(/'/g, "''")}'`;
                });
                chunk += `INSERT INTO ${this.tableName} (${colNames}) VALUES (${values.join(', ')});\n`;
            }
            await streamWrite(this.stream, chunk);
        }
    }
    async writeFooter() {
        await streamWrite(this.stream, '\nCOMMIT;\n');
    }
}
// ── HTML ──
class HtmlStreamWriter {
    stream;
    columns;
    title;
    nullDisplay;
    constructor(stream, columns, title, nullDisplay = '(null)') {
        this.stream = stream;
        this.columns = columns;
        this.title = title;
        this.nullDisplay = nullDisplay;
    }
    writeHeader() {
        const title = this.title || 'Data Export';
        this.stream.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    h1 { color: #333; font-size: 18px; margin-bottom: 16px; }
    table { border-collapse: collapse; width: 100%; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    th { background: #4472C4; color: white; padding: 10px 12px; text-align: left; font-size: 13px; }
    td { padding: 8px 12px; border-bottom: 1px solid #e0e0e0; font-size: 12px; }
    tr:hover { background: #f0f4ff; }
    tr:nth-child(even) { background: #fafafa; }
    tr:nth-child(even):hover { background: #f0f4ff; }
    .null { color: #999; font-style: italic; }
    .count { color: #666; font-size: 12px; margin-top: 12px; }
</style>
</head>
<body>
<h1>${title}</h1>
<table>
<thead><tr>`);
        for (const col of this.columns) {
            this.stream.write(`<th>${htmlEscape(col.name)}</th>`);
        }
        this.stream.write('</tr></thead>\n<tbody>\n');
    }
    async writeBatch(rows) {
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const end = Math.min(i + CHUNK, rows.length);
            let chunk = '';
            for (let j = i; j < end; j++) {
                chunk += '<tr>';
                for (const val of rows[j]) {
                    if (val === null || val === undefined) {
                        chunk += '<td class="null">' + htmlEscape(this.nullDisplay) + '</td>';
                    }
                    else {
                        chunk += `<td>${htmlEscape(String(val))}</td>`;
                    }
                }
                chunk += '</tr>\n';
            }
            await streamWrite(this.stream, chunk);
        }
    }
    async writeFooter(totalRows) {
        await streamWrite(this.stream, `</tbody>
</table>
<p class="count">${totalRows.toLocaleString()} rows exported on ${new Date().toLocaleString()}</p>
</body>
</html>`);
    }
}
// ── XLSX (plain, matching Oracle SQL Developer behavior) ──
class XlsxStreamWriter {
    stream;
    columns;
    sheetName;
    sql;
    workbook;
    sheet;
    rowIndex = 1;
    sheetIndex = 1;
    MAX_ROWS = 1048575;
    constructor(stream, columns, sheetName, sql) {
        this.stream = stream;
        this.columns = columns;
        this.sheetName = sheetName;
        this.sql = sql;
    }
    writeHeader() {
        const ExcelJS = require('exceljs');
        this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: this.stream });
        this.workbook.creator = 'ING SQL for VS Code';
        this.workbook.created = new Date();
        this.createNewSheet();
    }
    createNewSheet() {
        const name = this.sheetName || 'Data';
        const finalName = this.sheetIndex === 1 ? name : `${name}_${this.sheetIndex}`;
        this.sheet = this.workbook.addWorksheet(finalName);
        this.sheet.columns = this.columns.map(col => ({
            header: col.name,
            key: col.name,
            width: Math.max(col.name.length + 2, 12),
        }));
        // Plain header — bold only, no colors (matching Oracle SQL Developer)
        const headerRow = this.sheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.commit();
        this.rowIndex = 2;
    }
    async writeBatch(rows) {
        for (const row of rows) {
            if (this.rowIndex > this.MAX_ROWS) {
                this.sheet.commit();
                this.sheetIndex++;
                this.createNewSheet();
            }
            // Use array directly — avoids creating 1000-key objects for wide tables
            const excelRow = this.sheet.addRow(row);
            excelRow.commit();
            this.rowIndex++;
        }
    }
    async writeFooter(totalRows) {
        // Auto-filter on data sheet
        if (totalRows > 0) {
            this.sheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: totalRows + 1, column: this.columns.length }
            };
        }
        this.sheet.commit();
        // Add "Query" info sheet with the SQL statement
        if (this.sql) {
            const infoSheet = this.workbook.addWorksheet('Query');
            infoSheet.columns = [
                { header: 'Property', key: 'prop', width: 20 },
                { header: 'Value', key: 'val', width: 80 },
            ];
            const hdr = infoSheet.getRow(1);
            hdr.font = { bold: true };
            hdr.commit();
            infoSheet.addRow({ prop: 'SQL Statement', val: this.sql }).commit();
            infoSheet.addRow({ prop: 'Exported At', val: new Date().toISOString() }).commit();
            infoSheet.addRow({ prop: 'Total Rows', val: totalRows }).commit();
            infoSheet.commit();
        }
        await this.workbook.commit();
        // Release ExcelJS internal refs
        this.sheet = null;
        this.workbook = null;
    }
}
//# sourceMappingURL=exportService.js.map