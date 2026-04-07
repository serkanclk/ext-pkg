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
const importWizardPanel_1 = require("../panels/importWizardPanel");
class ImportService {
    static instance;
    context;
    static getInstance(context) {
        if (!ImportService.instance) {
            ImportService.instance = new ImportService();
        }
        if (context && !ImportService.instance.context) {
            ImportService.instance.context = context;
        }
        return ImportService.instance;
    }
    /**
     * Launch the import wizard and execute the import.
     */
    async promptAndImport(connectionName, targetTable) {
        if (!this.context) {
            vscode.window.showErrorMessage('ImportService not initialized with context.');
            return;
        }
        const wizard = new importWizardPanel_1.ImportWizardPanel(this.context.extensionUri);
        const result = await wizard.show();
        if (!result) {
            return;
        } // cancelled
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Importing into ${result.tableName}...`,
                cancellable: false
            }, async (progress) => {
                const oracleService = oracleService_1.OracleService.getInstance();
                const tableName = result.tableName.toUpperCase();
                // 1. Re-parse the full file (not just preview rows)
                progress.report({ message: 'Reading file...' });
                const fullData = await this.parseFullFile(result);
                // 2. Create the table
                progress.report({ message: 'Creating table...' });
                await this.createTableFromDefs(tableName, result.selectedColumns, connectionName, oracleService);
                // 3. Insert data in batches
                progress.report({ message: 'Inserting data...' });
                const insertedCount = await this.insertDataFromDefs(tableName, result.selectedColumns, result.headers, fullData.rows, result.importRowLimit, connectionName, oracleService, progress);
                vscode.window.showInformationMessage(`Successfully imported ${insertedCount.toLocaleString()} rows into ${tableName}.`);
            });
        }
        catch (err) {
            vscode.window.showErrorMessage(`Import failed: ${err.message}`);
        }
    }
    /**
     * Parse the full file (not limited by preview row limit).
     */
    async parseFullFile(result) {
        const filePath = result.filePath;
        const ext = filePath.split('.').pop()?.toLowerCase();
        if (ext === 'xlsx') {
            return this.parseXlsx(filePath, result.skipRows, result.hasHeader);
        }
        else {
            return this.parseCsv(filePath, result.delimiter, result.leftEnclosure, result.skipRows, result.hasHeader);
        }
    }
    async parseCsv(filePath, delimiter = ',', enclosure = '"', skipRows = 0, hasHeader = true) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
        const delim = delimiter === '\\t' ? '\t' : delimiter;
        const encl = enclosure === 'none' ? '' : enclosure;
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
        let headers = [];
        let rows = [];
        if (hasHeader && dataLines.length > 0) {
            headers = parseLine(dataLines[0]).map((h, i) => h.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase() || `COL_${i + 1}`);
            rows = dataLines.slice(1).map(parseLine);
        }
        else {
            rows = dataLines.map(parseLine);
            if (rows.length > 0) {
                headers = rows[0].map((_, i) => `COL_${i + 1}`);
            }
        }
        return { headers, rows };
    }
    async parseXlsx(filePath, skipRows = 0, hasHeader = true) {
        const workbook = new exceljs_1.default.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
            throw new Error("No worksheet found in XLSX file.");
        }
        const headers = [];
        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
            const rowValues = row.values.slice(1);
            if (rowNumber <= skipRows)
                return;
            if (rowNumber === skipRows + 1 && hasHeader) {
                rowValues.forEach((val, i) => {
                    const h = val ? val.toString().replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase() : `COL_${i + 1}`;
                    headers.push(h);
                });
            }
            else {
                const cleanRow = (hasHeader ? headers : rowValues).map((_, i) => {
                    const val = rowValues[i];
                    if (val === null || val === undefined)
                        return null;
                    if (typeof val === 'object' && val instanceof Date)
                        return val;
                    if (typeof val === 'object' && val.text)
                        return val.text;
                    return val.toString();
                });
                rows.push(cleanRow);
            }
        });
        if (!hasHeader && rows.length > 0) {
            for (let i = 0; i < rows[0].length; i++) {
                headers.push(`COL_${i + 1}`);
            }
        }
        return { headers, rows };
    }
    /**
     * Create table using the column definitions from the wizard.
     */
    async createTableFromDefs(tableName, columns, connectionName, oracleService) {
        const colDefs = columns.map(col => {
            let name = col.name;
            if (/^[0-9]/.test(name))
                name = 'C_' + name;
            if (name.length > 128)
                name = name.substring(0, 128);
            let typeDef = col.dataType;
            if (['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR'].includes(col.dataType)) {
                typeDef = `${col.dataType}(${col.size || 4000})`;
            }
            else if (col.dataType === 'NUMBER' && col.size) {
                typeDef = `NUMBER(${col.size})`;
            }
            let def = `"${name}" ${typeDef}`;
            if (col.defaultValue) {
                def += ` DEFAULT '${col.defaultValue.replace(/'/g, "''")}'`;
            }
            if (!col.nullable) {
                def += ' NOT NULL';
            }
            return def;
        });
        const sql = `CREATE TABLE "${tableName}" (\n  ${colDefs.join(',\n  ')}\n)`;
        await oracleService.executeNonQuery(sql, {}, { connectionName, autoCommit: true });
        // Add comments if any
        for (const col of columns) {
            if (col.comment) {
                const commentSql = `COMMENT ON COLUMN "${tableName}"."${col.name}" IS '${col.comment.replace(/'/g, "''")}'`;
                await oracleService.executeNonQuery(commentSql, {}, { connectionName, autoCommit: true });
            }
        }
    }
    /**
     * Insert data using only the selected columns.
     */
    async insertDataFromDefs(tableName, columns, allHeaders, allRows, importRowLimit, connectionName, oracleService, progress) {
        // Map selected columns to their indices in the source data
        const colIndices = columns.map(col => allHeaders.indexOf(col.sourceName));
        const colNames = columns.map(col => {
            let name = col.name;
            if (/^[0-9]/.test(name))
                name = 'C_' + name;
            if (name.length > 128)
                name = name.substring(0, 128);
            return `"${name}"`;
        });
        const bindNames = colNames.map((_, i) => `:${i + 1}`).join(', ');
        const sql = `INSERT INTO "${tableName}" (${colNames.join(', ')}) VALUES (${bindNames})`;
        let rows = allRows;
        if (importRowLimit !== null && importRowLimit > 0) {
            rows = rows.slice(0, importRowLimit);
        }
        const batchSize = 500;
        let inserted = 0;
        // Numeric column types that need JS number binding (not string)
        // to avoid ORA-01722 when NLS decimal separator is ',' but data uses '.'
        const NUMERIC_TYPES = new Set(['NUMBER', 'FLOAT', 'INTEGER', 'INT', 'BINARY_FLOAT', 'BINARY_DOUBLE']);
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize).map(row => colIndices.map((idx, colPos) => {
                const val = idx >= 0 ? row[idx] : null;
                if (val === null || val === undefined || val === '')
                    return null;
                if (NUMERIC_TYPES.has(columns[colPos].dataType)) {
                    const n = parseFloat(String(val));
                    return isNaN(n) ? null : n;
                }
                return val;
            }));
            await oracleService.executeMany(sql, batch, { connectionName, autoCommit: true });
            inserted += batch.length;
            progress.report({ message: `Inserted ${inserted.toLocaleString()} of ${rows.length.toLocaleString()} rows...` });
        }
        return inserted;
    }
}
exports.ImportService = ImportService;
//# sourceMappingURL=importService.js.map