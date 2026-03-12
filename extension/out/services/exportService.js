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
const oracleService_1 = require("./oracleService");
const exportPanel_1 = require("../panels/exportPanel");
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
        // Either format or filePath missing -> open panel
        if (!format || !filePath) {
            if (!this.context) {
                vscode.window.showErrorMessage('ExportService not initialized with context, cannot show Export Settings.');
                return undefined;
            }
            const exportPanel = new exportPanel_1.ExportPanel(this.context.extensionUri);
            const userOptions = await exportPanel.show();
            if (!userOptions || !userOptions.format || !userOptions.filePath) {
                // User cancelled or didn't supply required configs
                return undefined;
            }
            format = userOptions.format;
            filePath = userOptions.filePath;
        }
        const start = Date.now();
        let finalColumns = options.columns || [];
        let finalRows = options.rows || [];
        try {
            if (options.statement && options.connectionName) {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Exporting data...`,
                    cancellable: true
                }, async (progress, token) => {
                    progress.report({ message: 'Initializing export cursor...', increment: 0 });
                    const oracleService = oracleService_1.OracleService.getInstance();
                    const cursorResult = await oracleService.executeCursor(options.statement, {}, {
                        connectionName: options.connectionName,
                        batchSize: 5000 // Fetch larger chunks for export speed
                    });
                    finalColumns = cursorResult.columns;
                    let hasMore = cursorResult.hasMore;
                    let cursorId = cursorResult.cursorId;
                    finalRows = [...cursorResult.rows];
                    let fetchedCount = finalRows.length;
                    progress.report({ message: `Fetched ${fetchedCount} rows...` });
                    while (hasMore && cursorId) {
                        if (token.isCancellationRequested) {
                            if (cursorId) {
                                await oracleService.closeCursor(cursorId);
                            }
                            throw new Error("Export cancelled by user.");
                        }
                        const moreData = await oracleService.fetchMoreRows(cursorId, 5000);
                        finalRows.push(...moreData.rows);
                        fetchedCount += moreData.rows.length;
                        hasMore = moreData.hasMore;
                        progress.report({ message: `Fetched ${fetchedCount} rows...` });
                    }
                });
            }
            switch (format) {
                case 'csv':
                    await this.exportCsv(filePath, finalColumns, finalRows);
                    break;
                case 'xlsx':
                    await this.exportXlsx(filePath, finalColumns, finalRows, options.tableName);
                    break;
                case 'json':
                    await this.exportJson(filePath, finalColumns, finalRows);
                    break;
                case 'xml':
                    await this.exportXml(filePath, finalColumns, finalRows, options.tableName);
                    break;
                case 'sql':
                    await this.exportSql(filePath, finalColumns, finalRows, options.tableName || 'TABLE_NAME');
                    break;
                case 'html':
                    await this.exportHtml(filePath, finalColumns, finalRows, options.tableName);
                    break;
            }
            const stats = fs.statSync(filePath);
            const result = {
                filePath,
                rowCount: finalRows.length,
                fileSize: stats.size,
                format,
                durationMs: Date.now() - start,
            };
            vscode.window.showInformationMessage(`Exported ${result.rowCount} rows to ${path.basename(filePath)} (${this.formatFileSize(result.fileSize)})`, 'Open File').then(choice => {
                if (choice === 'Open File') {
                    vscode.env.openExternal(vscode.Uri.file(filePath));
                }
            });
            return result;
        }
        catch (err) {
            vscode.window.showErrorMessage(`Export failed: ${err.message}`);
            throw err;
        }
    }
    async exportCsv(filePath, columns, rows) {
        const lines = [];
        // Header
        lines.push(columns.map(c => this.csvEscape(c.name)).join(','));
        // Data rows
        for (const row of rows) {
            lines.push(row.map(val => this.csvEscape(this.formatValue(val))).join(','));
        }
        fs.writeFileSync(filePath, '\ufeff' + lines.join('\n'), 'utf-8'); // BOM for Excel
    }
    async exportXlsx(filePath, columns, rows, sheetName) {
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'ING SQL for VS Code';
        workbook.created = new Date();
        const sheet = workbook.addWorksheet(sheetName || 'Data');
        // Header row
        sheet.columns = columns.map(col => ({
            header: col.name,
            key: col.name,
            width: Math.max(col.name.length + 2, 12),
        }));
        // Style header
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' }
        };
        headerRow.border = {
            bottom: { style: 'medium', color: { argb: 'FF2F528F' } }
        };
        // Data rows
        for (const row of rows) {
            const rowData = {};
            columns.forEach((col, idx) => {
                rowData[col.name] = row[idx];
            });
            sheet.addRow(rowData);
        }
        // Alternate row colors
        for (let i = 2; i <= rows.length + 1; i++) {
            if (i % 2 === 0) {
                const r = sheet.getRow(i);
                r.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF2F2F2' }
                };
            }
        }
        // Auto-filter
        if (rows.length > 0) {
            sheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: rows.length + 1, column: columns.length }
            };
        }
        await workbook.xlsx.writeFile(filePath);
    }
    async exportJson(filePath, columns, rows) {
        const data = rows.map(row => {
            const obj = {};
            columns.forEach((col, idx) => {
                obj[col.name] = row[idx];
            });
            return obj;
        });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
    async exportXml(filePath, columns, rows, rootName) {
        const root = rootName || 'DATA';
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += `<${root}>\n`;
        for (const row of rows) {
            xml += '  <ROW>\n';
            columns.forEach((col, idx) => {
                const val = row[idx];
                const escaped = this.xmlEscape(this.formatValue(val));
                xml += `    <${col.name}>${escaped}</${col.name}>\n`;
            });
            xml += '  </ROW>\n';
        }
        xml += `</${root}>\n`;
        fs.writeFileSync(filePath, xml, 'utf-8');
    }
    async exportSql(filePath, columns, rows, tableName) {
        const lines = [];
        const colNames = columns.map(c => c.name).join(', ');
        for (const row of rows) {
            const values = row.map((val, idx) => {
                if (val === null || val === undefined) {
                    return 'NULL';
                }
                const col = columns[idx];
                if (['NUMBER', 'BINARY_FLOAT', 'BINARY_DOUBLE', 'FLOAT', 'INTEGER'].includes(col.dbType)) {
                    return String(val);
                }
                if (col.dbType === 'DATE' || col.dbType.startsWith('TIMESTAMP')) {
                    return `TO_DATE('${val}', 'YYYY-MM-DD HH24:MI:SS')`;
                }
                return `'${String(val).replace(/'/g, "''")}'`;
            });
            lines.push(`INSERT INTO ${tableName} (${colNames}) VALUES (${values.join(', ')});`);
        }
        // Add COMMIT at the end
        lines.push('');
        lines.push('COMMIT;');
        fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    }
    async exportHtml(filePath, columns, rows, title) {
        let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title || 'Export'}</title>
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
<h1>${title || 'Data Export'}</h1>
<table>
<thead><tr>`;
        for (const col of columns) {
            html += `<th>${this.htmlEscape(col.name)}</th>`;
        }
        html += '</tr></thead>\n<tbody>\n';
        for (const row of rows) {
            html += '<tr>';
            for (const val of row) {
                if (val === null || val === undefined) {
                    html += '<td class="null">(null)</td>';
                }
                else {
                    html += `<td>${this.htmlEscape(String(val))}</td>`;
                }
            }
            html += '</tr>\n';
        }
        html += `</tbody>
</table>
<p class="count">${rows.length} rows exported on ${new Date().toLocaleString()}</p>
</body>
</html>`;
        fs.writeFileSync(filePath, html, 'utf-8');
    }
    csvEscape(value) {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
    }
    xmlEscape(value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    htmlEscape(value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
    formatValue(val) {
        if (val === null || val === undefined) {
            return '';
        }
        if (val instanceof Date) {
            return val.toISOString();
        }
        if (Buffer.isBuffer(val)) {
            return val.toString('base64');
        }
        return String(val);
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
}
exports.ExportService = ExportService;
//# sourceMappingURL=exportService.js.map