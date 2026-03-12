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
    'GRANT', 'REVOKE', 'EXPLAIN', 'PLAN', 'ANALYZE',
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
    provideCompletionItems(document, position, token, context) {
        const items = [];
        // Keywords
        for (const kw of ORACLE_KEYWORDS) {
            const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
            item.detail = 'Oracle SQL Keyword';
            item.insertText = kw;
            items.push(item);
        }
        // Functions
        for (const fn of ORACLE_FUNCTIONS) {
            const item = new vscode.CompletionItem(fn, vscode.CompletionItemKind.Function);
            item.detail = 'Oracle Function';
            item.insertText = new vscode.SnippetString(`${fn}($1)`);
            items.push(item);
        }
        // Data types
        for (const t of ORACLE_TYPES) {
            const item = new vscode.CompletionItem(t, vscode.CompletionItemKind.TypeParameter);
            item.detail = 'Oracle Data Type';
            items.push(item);
        }
        // Cached schema objects
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
        return items;
    }
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
        // Basic SQL formatting: uppercase keywords, add newlines
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
        // Clean up leading newline
        formatted = formatted.replace(/^\n/, '');
        // Collapse multiple newlines
        formatted = formatted.replace(/\n{3,}/g, '\n\n');
        return formatted;
    }
}
exports.SqlLanguageProvider = SqlLanguageProvider;
//# sourceMappingURL=sqlLanguageProvider.js.map