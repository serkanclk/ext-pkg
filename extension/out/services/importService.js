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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportService = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const exceljs_1 = __importDefault(require("exceljs"));
const oracleService_1 = require("./oracleService");
class ImportService {
    static instance;
    static getInstance() {
        if (!ImportService.instance) {
            ImportService.instance = new ImportService();
        }
        return ImportService.instance;
    }
    async promptAndImport(connectionName, targetTable) {
        // 1. Select File
        const fileUris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Import',
            filters: {
                'Data Files': ['csv', 'xlsx']
            }
        });
        if (!fileUris || fileUris.length === 0) {
            return;
        }
        const filePath = fileUris[0].fsPath;
        const ext = filePath.split('.').pop()?.toLowerCase();
        try {
            vscode.window.showInformationMessage(`Parsing ${ext} file...`);
            const data = ext === 'csv' ? await this.parseCsv(filePath) : await this.parseXlsx(filePath);
            if (data.headers.length === 0 || data.rows.length === 0) {
                vscode.window.showWarningMessage('File is empty or contains no readable data.');
                return;
            }
            // 2. Select Target (skip if table was pre-selected via right-click)
            let tableName = targetTable;
            let isNewTable = false;
            if (!tableName) {
                const targetType = await vscode.window.showQuickPick(['Create New Table', 'Import into Existing Table'], { placeHolder: 'Select import destination' });
                if (!targetType) {
                    return;
                }
                isNewTable = targetType === 'Create New Table';
                if (isNewTable) {
                    const defaultName = filePath.split(/[\\/]/).pop()?.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase() || 'NEW_TABLE';
                    tableName = await vscode.window.showInputBox({
                        prompt: 'Enter name for the new table',
                        value: defaultName
                    });
                }
                else {
                    const tables = await oracleService_1.OracleService.getInstance().getSchemaObjects('TABLE', connectionName);
                    const tableNames = tables.map(t => t.name);
                    tableName = await vscode.window.showQuickPick(tableNames, { placeHolder: 'Select existing table' });
                }
            }
            if (!tableName) {
                return;
            }
            tableName = tableName.toUpperCase();
            // 3. Execute Import
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Importing into ${tableName}...`,
                cancellable: false
            }, async (progress) => {
                const oracleService = oracleService_1.OracleService.getInstance();
                if (isNewTable) {
                    progress.report({ message: 'Creating table...' });
                    await this.createTable(tableName, data.headers, connectionName, oracleService);
                }
                progress.report({ message: 'Inserting data...' });
                const insertedCount = await this.insertData(tableName, data, connectionName, oracleService);
                vscode.window.showInformationMessage(`Successfully imported ${insertedCount} rows into ${tableName}.`);
            });
        }
        catch (err) {
            vscode.window.showErrorMessage(`Import failed: ${err.message}`);
        }
    }
    async parseCsv(filePath) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length === 0)
            return { headers: [], rows: [] };
        // Basic CSV parsing (doesn't handle commas inside quotes perfectly, but good enough for basic use cases)
        const parseLine = (line) => {
            const result = [];
            let inQuotes = false;
            let current = '';
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"')
                    inQuotes = !inQuotes;
                else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                }
                else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result.map(val => {
                if (val.startsWith('"') && val.endsWith('"')) {
                    return val.substring(1, val.length - 1);
                }
                return val;
            });
        };
        const headers = parseLine(lines[0]).map(h => h.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase() || 'COL');
        const rows = lines.slice(1).map(parseLine);
        return { headers, rows };
    }
    async parseXlsx(filePath) {
        const workbook = new exceljs_1.default.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
            throw new Error("No worksheet found in XLSX file.");
        }
        const headers = [];
        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
            const rowValues = row.values.slice(1); // exceljs is 1-indexed
            if (rowNumber === 1) {
                rowValues.forEach((val, i) => {
                    const h = val ? val.toString().replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase() : `COL_${i}`;
                    headers.push(h);
                });
            }
            else {
                // Map to headers length to ensure row matches header count
                const cleanRow = headers.map((_, i) => {
                    const val = rowValues[i];
                    if (val === null || val === undefined)
                        return null;
                    if (typeof val === 'object' && val instanceof Date)
                        return val;
                    if (typeof val === 'object' && val.text)
                        return val.text; // Hyperlinks
                    return val.toString();
                });
                rows.push(cleanRow);
            }
        });
        return { headers, rows };
    }
    async createTable(tableName, headers, connectionName, oracleService) {
        // Ensure unique column names and valid Oracle identifiers
        const cleanHeaders = headers.map((h, i) => {
            let ch = h;
            if (/^[0-9]/.test(ch))
                ch = 'C_' + ch;
            if (ch.length > 30)
                ch = ch.substring(0, 30); // 12c limit is 128, older is 30. Better safe.
            return `"${ch}" VARCHAR2(4000)`; // Default to 4000 for safety
        });
        const sql = `CREATE TABLE "${tableName}" (\n  ${cleanHeaders.join(',\n  ')}\n)`;
        await oracleService.executeNonQuery(sql, {}, { connectionName, autoCommit: true });
    }
    async insertData(tableName, data, connectionName, oracleService) {
        const batchSize = 500;
        let inserted = 0;
        const cleanHeaders = data.headers.map(h => {
            let ch = h;
            if (/^[0-9]/.test(ch))
                ch = 'C_' + ch;
            if (ch.length > 30)
                ch = ch.substring(0, 30);
            return `"${ch}"`;
        });
        const bindNames = cleanHeaders.map((_, i) => `:${i + 1}`).join(', ');
        const sql = `INSERT INTO "${tableName}" (${cleanHeaders.join(', ')}) VALUES (${bindNames})`;
        // Insert in batches
        for (let i = 0; i < data.rows.length; i += batchSize) {
            const batch = data.rows.slice(i, i + batchSize);
            await oracleService.executeMany(sql, batch, { connectionName, autoCommit: true });
            inserted += batch.length;
        }
        return inserted;
    }
}
exports.ImportService = ImportService;
//# sourceMappingURL=importService.js.map