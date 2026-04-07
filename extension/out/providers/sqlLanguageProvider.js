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
exports.SqlLanguageProvider = void 0;
const vscode = __importStar(require("vscode"));
const oracleService_1 = require("../services/oracleService");
const connectionManager_1 = require("../services/connectionManager");
const columnCacheService_1 = require("../services/columnCacheService");
const sqlContextParser_1 = require("../utils/sqlContextParser");
const buildConfig_1 = require("../buildConfig");
let heavyData = null;
if (buildConfig_1.BUILD_CONFIG.hasIntellisense) {
    try {
        heavyData = require('./intellisenseData').INTELLISENSE_DATA;
    }
    catch (e) {
        console.error('Failed to load heavy intellisense data', e);
    }
}
const ORACLE_KEYWORDS = [
    // SQL
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE',
    'IS', 'NULL', 'AS', 'ON', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER',
    'CROSS', 'NATURAL', 'USING', 'ORDER', 'BY', 'GROUP', 'HAVING', 'UNION', 'ALL',
    'INTERSECT', 'MINUS', 'DISTINCT', 'UNIQUE', 'INTO', 'VALUES', 'SET', 'WITH',
    'FETCH', 'FIRST', 'NEXT', 'ROWS', 'ONLY', 'OFFSET', 'CASE', 'WHEN', 'THEN',
    'ELSE', 'END', 'CONNECT', 'START', 'PRIOR', 'LEVEL', 'ROWNUM', 'ROWID',
    'PIVOT', 'UNPIVOT', 'PARTITION', 'OVER', 'RANGE', 'UNBOUNDED', 'PRECEDING',
    'FOLLOWING', 'CURRENT', 'ROW', 'NULLS', 'LAST', 'ASC', 'DESC', 'FOR', 'UPDATE',
    'NOWAIT', 'WAIT', 'SKIP', 'LOCKED',
    // DDL
    'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME', 'TABLE', 'VIEW', 'INDEX',
    'SEQUENCE', 'TRIGGER', 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'TYPE', 'BODY',
    'SYNONYM', 'DATABASE', 'LINK', 'MATERIALIZED', 'TABLESPACE', 'CONSTRAINT',
    'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CHECK', 'DEFAULT', 'CASCADE',
    'ADD', 'MODIFY', 'ENABLE', 'DISABLE', 'STORAGE', 'COMPRESS', 'PARALLEL', 'CACHE',
    'GLOBAL', 'TEMPORARY', 'PURGE',
    // DML
    'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
    'GRANT', 'REVOKE', 'EXPLAIN', 'PLAN', 'ANALYZE', 'DESCRIBE',
    // PL/SQL
    'DECLARE', 'BEGIN', 'END', 'EXCEPTION', 'RAISE', 'IF', 'THEN', 'ELSIF',
    'LOOP', 'WHILE', 'EXIT', 'CONTINUE', 'RETURN', 'OPEN', 'CLOSE', 'FETCH',
    'CURSOR', 'BULK', 'COLLECT', 'FORALL', 'EXECUTE', 'IMMEDIATE', 'RETURNING',
    'PIPE', 'PIPELINED', 'PRAGMA', 'AUTONOMOUS_TRANSACTION', 'AUTHID',
    'CURRENT_USER', 'DEFINER',
];
const ORACLE_FUNCTIONS = [
    'NVL', 'NVL2', 'DECODE', 'COALESCE', 'NULLIF', 'GREATEST', 'LEAST',
    'ABS', 'CEIL', 'FLOOR', 'MOD', 'POWER', 'ROUND', 'TRUNC', 'SIGN', 'SQRT',
    'TO_CHAR', 'TO_DATE', 'TO_NUMBER', 'TO_TIMESTAMP', 'TO_CLOB',
    'CAST', 'CONVERT', 'UPPER', 'LOWER', 'INITCAP', 'TRIM', 'LTRIM', 'RTRIM',
    'LPAD', 'RPAD', 'SUBSTR', 'INSTR', 'REPLACE', 'TRANSLATE', 'LENGTH', 'CONCAT',
    'ASCII', 'CHR', 'REVERSE', 'REGEXP_LIKE', 'REGEXP_REPLACE', 'REGEXP_SUBSTR',
    'REGEXP_INSTR', 'REGEXP_COUNT',
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'MEDIAN', 'STDDEV', 'VARIANCE', 'LISTAGG',
    'DENSE_RANK', 'RANK', 'ROW_NUMBER', 'NTILE', 'LAG', 'LEAD',
    'FIRST_VALUE', 'LAST_VALUE', 'NTH_VALUE',
    'ADD_MONTHS', 'MONTHS_BETWEEN', 'LAST_DAY', 'NEXT_DAY', 'EXTRACT',
    'SYSDATE', 'SYSTIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIMESTAMP',
    'SYS_CONTEXT', 'USERENV', 'USER',
    'JSON_VALUE', 'JSON_QUERY', 'JSON_TABLE', 'JSON_OBJECT', 'JSON_ARRAY',
];
const ORACLE_TYPES = [
    'VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR', 'NUMBER', 'INTEGER', 'INT',
    'FLOAT', 'BINARY_FLOAT', 'BINARY_DOUBLE', 'DATE', 'TIMESTAMP',
    'INTERVAL', 'CLOB', 'NCLOB', 'BLOB', 'RAW', 'LONG', 'XMLTYPE',
    'BOOLEAN', 'PLS_INTEGER', 'BINARY_INTEGER', 'SYS_REFCURSOR', 'JSON',
];
class SqlLanguageProvider {
    cachedObjects = new Map();
    columnCacheService;
    constructor(columnCacheService) {
        this.columnCacheService = columnCacheService || new columnCacheService_1.ColumnCacheService();
    }
    // ─── Smart Completion Provider ──────────────────────────────────
    async provideCompletionItems(document, position, token, context) {
        const text = document.getText();
        const cursorOffset = document.offsetAt(position);
        const sqlContext = sqlContextParser_1.SqlContextParser.parse(text, cursorOffset);
        switch (sqlContext.contextType) {
            case 'dot_column':
                return this.getColumnCompletions(sqlContext.dotPrefix, sqlContext.tables);
            case 'dot_schema':
                return this.getSchemaObjectCompletions(sqlContext.dotPrefix);
            case 'select_columns':
                return [
                    ...(await this.getAllColumnsInScope(sqlContext.tables)),
                    ...this.getFunctionCompletions(),
                    ...this.getKeywordCompletions(),
                ];
            case 'where_condition':
                return [
                    ...(await this.getAllColumnsInScope(sqlContext.tables)),
                    ...this.getFunctionCompletions(),
                    ...this.getKeywordCompletions(),
                ];
            case 'from_table':
                return [
                    ...this.getTableCompletions(),
                    ...this.getKeywordCompletions(),
                ];
            case 'general':
            default:
                return this.getGeneralCompletions();
        }
    }
    // ─── Completion Builders ────────────────────────────────────────
    /**
     * Column completions for a specific table/alias after a dot.
     */
    async getColumnCompletions(prefix, tables) {
        // Resolve the prefix to a table name
        const tableRef = tables.find(t => t.alias === prefix) || tables.find(t => t.name === prefix);
        if (!tableRef) {
            return [];
        }
        const connectionName = connectionManager_1.ConnectionManager.getInstance().getActiveConnectionName() || undefined;
        const columns = await this.columnCacheService.getColumns(tableRef.name, connectionName, tableRef.schema);
        return columns.map((col, idx) => {
            const item = new vscode.CompletionItem(col.name, vscode.CompletionItemKind.Field);
            item.detail = this.formatColumnType(col);
            item.documentation = col.comments || undefined;
            item.sortText = String(idx).padStart(4, '0'); // preserve column order
            return item;
        });
    }
    /**
     * Table completions for a schema after a dot (e.g., `HR.`).
     */
    async getSchemaObjectCompletions(schema) {
        const connectionName = connectionManager_1.ConnectionManager.getInstance().getActiveConnectionName() || undefined;
        const objects = await this.columnCacheService.getSchemaObjects(schema, connectionName);
        return objects.map(obj => {
            const kind = obj.type === 'VIEW'
                ? vscode.CompletionItemKind.Interface
                : vscode.CompletionItemKind.Class;
            const item = new vscode.CompletionItem(obj.name, kind);
            item.detail = `${schema}.${obj.name} (${obj.type})`;
            return item;
        });
    }
    /**
     * Column completions for all tables currently in scope.
     * Prefixed with table alias/name for clarity when multiple tables present.
     */
    async getAllColumnsInScope(tables) {
        if (tables.length === 0) {
            return [];
        }
        const connectionName = connectionManager_1.ConnectionManager.getInstance().getActiveConnectionName() || undefined;
        const items = [];
        const multiTable = tables.length > 1;
        for (const table of tables) {
            const columns = await this.columnCacheService.getColumns(table.name, connectionName, table.schema);
            const label = table.alias || table.name;
            for (const col of columns) {
                // When there are multiple tables, show TABLE.COLUMN
                if (multiTable) {
                    const item = new vscode.CompletionItem(`${label}.${col.name}`, vscode.CompletionItemKind.Field);
                    item.insertText = `${label}.${col.name}`;
                    item.detail = `${this.formatColumnType(col)} — ${table.name}`;
                    item.documentation = col.comments || undefined;
                    item.filterText = `${col.name} ${label}.${col.name}`;
                    items.push(item);
                }
                // Always add the plain column name
                const plainItem = new vscode.CompletionItem(col.name, vscode.CompletionItemKind.Field);
                plainItem.detail = `${this.formatColumnType(col)}${multiTable ? ` — ${table.name}` : ''}`;
                plainItem.documentation = col.comments || undefined;
                items.push(plainItem);
            }
        }
        return items;
    }
    getKeywordCompletions() {
        return ORACLE_KEYWORDS.map(kw => {
            const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
            item.detail = 'Oracle SQL Keyword';
            item.insertText = kw;
            return item;
        });
    }
    getFunctionCompletions() {
        return ORACLE_FUNCTIONS.map(fn => {
            const item = new vscode.CompletionItem(fn, vscode.CompletionItemKind.Function);
            item.detail = 'Oracle Function';
            item.insertText = new vscode.SnippetString(`${fn}($1)`);
            return item;
        });
    }
    getTableCompletions() {
        const items = [];
        for (const [type, names] of this.cachedObjects) {
            for (const name of names) {
                const kind = type === 'TABLE' ? vscode.CompletionItemKind.Class
                    : type === 'VIEW' ? vscode.CompletionItemKind.Interface
                        : type === 'PROCEDURE' ? vscode.CompletionItemKind.Method
                            : type === 'FUNCTION' ? vscode.CompletionItemKind.Function
                                : vscode.CompletionItemKind.Value;
                const item = new vscode.CompletionItem(name, kind);
                item.detail = `Oracle ${type}`;
                items.push(item);
            }
        }
        // Add heavy data if enabled
        if (heavyData) {
            for (const [type, names] of Object.entries(heavyData)) {
                for (const name of names) {
                    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.File);
                    item.detail = `Intellisense Object (${type})`;
                    items.push(item);
                }
            }
        }
        return items;
    }
    /**
     * General/fallback completions (existing behavior).
     */
    getGeneralCompletions() {
        return [
            ...this.getKeywordCompletions(),
            ...this.getFunctionCompletions(),
            ...ORACLE_TYPES.map(t => {
                const item = new vscode.CompletionItem(t, vscode.CompletionItemKind.TypeParameter);
                item.detail = 'Oracle Data Type';
                return item;
            }),
            ...this.getTableCompletions(),
        ];
    }
    // ─── Util ───────────────────────────────────────────────────────
    formatColumnType(col) {
        let type = col.dataType;
        if (col.dataPrecision !== null) {
            type += `(${col.dataPrecision}${col.dataScale !== null && col.dataScale !== 0 ? ',' + col.dataScale : ''})`;
        }
        else if (['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR', 'RAW'].includes(col.dataType)) {
            type += `(${col.dataLength})`;
        }
        if (col.nullable === 'N') {
            type += ' NOT NULL';
        }
        return type;
    }
    // ─── Hover Provider ─────────────────────────────────────────────
    provideHover(document, position, token) {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }
        const word = document.getText(wordRange).toUpperCase();
        if (ORACLE_KEYWORDS.includes(word)) {
            return new vscode.Hover(new vscode.MarkdownString(`**Oracle SQL Keyword**: \`${word}\``));
        }
        if (ORACLE_FUNCTIONS.includes(word)) {
            return new vscode.Hover(new vscode.MarkdownString(`**Oracle Function**: \`${word}()\``));
        }
        if (ORACLE_TYPES.includes(word)) {
            return new vscode.Hover(new vscode.MarkdownString(`**Oracle Data Type**: \`${word}\``));
        }
        return undefined;
    }
    // ─── Formatting Provider ────────────────────────────────────────
    provideDocumentFormattingEdits(document, options, token) {
        const text = document.getText();
        const formatted = this.formatSql(text);
        if (formatted === text) {
            return [];
        }
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
        return [vscode.TextEdit.replace(fullRange, formatted)];
    }
    async refreshCachedObjects(connectionName) {
        const oracleService = oracleService_1.OracleService.getInstance();
        try {
            const objectTypes = ['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'SEQUENCE'];
            for (const type of objectTypes) {
                const objects = await oracleService.getSchemaObjects(type, connectionName);
                this.cachedObjects.set(type, objects.map(o => o.name));
            }
        }
        catch {
            // Silent fail for autocomplete cache
        }
    }
    formatSql(sql) {
        const keywords = [
            'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'GROUP BY',
            'HAVING', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN',
            'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'CROSS JOIN',
            'ON', 'UNION', 'UNION ALL', 'INTERSECT', 'MINUS', 'INSERT INTO',
            'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE',
            'DROP TABLE', 'BEGIN', 'END', 'DECLARE', 'EXCEPTION', 'WHEN',
        ];
        let formatted = sql;
        for (const kw of keywords) {
            const regex = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'gi');
            formatted = formatted.replace(regex, '\n' + kw.toUpperCase());
        }
        formatted = formatted.replace(/^\n/, '');
        formatted = formatted.replace(/\n{3,}/g, '\n\n');
        return formatted;
    }
}
exports.SqlLanguageProvider = SqlLanguageProvider;
//# sourceMappingURL=sqlLanguageProvider.js.map