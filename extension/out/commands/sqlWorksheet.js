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
exports.SqlWorksheetCommands = void 0;
const vscode = __importStar(require("vscode"));
const oracleService_1 = require("../services/oracleService");
const connectionManager_1 = require("../services/connectionManager");
class SqlWorksheetCommands {
    context;
    oracleService;
    connMgr;
    resultsPanel;
    historyProvider;
    constructor(context, resultsPanel, historyProvider) {
        this.context = context;
        this.oracleService = oracleService_1.OracleService.getInstance();
        this.connMgr = connectionManager_1.ConnectionManager.getInstance();
        this.resultsPanel = resultsPanel;
        this.historyProvider = historyProvider;
        this.resultsPanel.setLoadMoreHandler(async (cursorId) => {
            try {
                this.resultsPanel.setLoadingMore(true);
                const config = vscode.workspace.getConfiguration('ingSql');
                const batchSize = config.get('resultGrid.maxRows', 10000);
                const { rows, hasMore } = await this.oracleService.fetchMoreRows(cursorId, batchSize);
                this.resultsPanel.appendResults(rows, hasMore);
            }
            catch (err) {
                vscode.window.showErrorMessage(`Failed to load more rows: ${err.message}`);
                this.resultsPanel.setLoadingMore(false);
            }
        });
    }
    async newWorksheet(item) {
        let activeConn = this.connMgr.getActiveConnectionName();
        if (item && item.connectionName) {
            await this.connMgr.connect(item.connectionName);
            activeConn = item.connectionName;
        }
        const connLabel = activeConn ? ` [${activeConn}]` : '';
        const doc = await vscode.workspace.openTextDocument({
            language: 'oraclesql',
            content: `-- Oracle SQL Worksheet${connLabel}\n-- Press Cmd+Enter to execute statement, F5 to execute script\n\n`
        });
        await vscode.window.showTextDocument(doc, { preview: false });
    }
    async executeStatement() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor.');
            return;
        }
        if (!this.connMgr.getActiveConnectionName()) {
            vscode.window.showWarningMessage('No active connection. Please connect first.');
            return;
        }
        const sql = this.getStatementAtCursor(editor);
        if (!sql.trim()) {
            vscode.window.showWarningMessage('No SQL statement at cursor.');
            return;
        }
        await this.executeSql(sql.trim());
    }
    async executeScript() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor.');
            return;
        }
        if (!this.connMgr.getActiveConnectionName()) {
            vscode.window.showWarningMessage('No active connection. Please connect first.');
            return;
        }
        const fullText = editor.document.getText();
        const statements = this.splitStatements(fullText);
        let totalTime = 0;
        let successCount = 0;
        let errorCount = 0;
        for (const stmt of statements) {
            if (!stmt.trim()) {
                continue;
            }
            try {
                await this.executeSql(stmt.trim());
                successCount++;
            }
            catch (err) {
                errorCount++;
                vscode.window.showErrorMessage(`Error: ${err.message}`);
            }
        }
        vscode.window.showInformationMessage(`Script completed: ${successCount} succeeded, ${errorCount} failed.`);
    }
    async executeExplainPlan() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        if (!this.connMgr.getActiveConnectionName()) {
            vscode.window.showWarningMessage('No active connection.');
            return;
        }
        const sql = this.getStatementAtCursor(editor);
        if (!sql.trim()) {
            return;
        }
        try {
            const plan = await this.oracleService.getExplainPlan(sql.trim());
            this.resultsPanel.showExplainPlan(plan);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Explain Plan error: ${err.message}`);
        }
    }
    async executeSql(sql) {
        // Detect bind variables
        const bindVarRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
        const bindNames = [];
        let match;
        while ((match = bindVarRegex.exec(sql)) !== null) {
            if (!bindNames.includes(match[1])) {
                bindNames.push(match[1]);
            }
        }
        let binds = {};
        if (bindNames.length > 0) {
            for (const name of bindNames) {
                const value = await vscode.window.showInputBox({
                    prompt: `Enter value for :${name}`,
                    placeHolder: `Value for :${name}`
                });
                if (value === undefined) {
                    return;
                } // cancelled
                binds[name] = value;
            }
        }
        const isQuery = /^\s*(SELECT|WITH)\s/i.test(sql);
        try {
            if (isQuery) {
                const result = await this.oracleService.executeCursor(sql, binds);
                const config = vscode.workspace.getConfiguration('ingSql');
                const location = config.get('results.location', 'Panel');
                if (location === 'Editor') {
                    // We need access to getObjectViewer from extension.ts, or a way to create a generic data panel
                    // For now, let's assume we can trigger a command or use a shared service.
                    // Actually, let's create a temporary Result Grid Panel for these queries.
                    vscode.commands.executeCommand('ingSql.showResultsInTab', result);
                }
                else {
                    this.resultsPanel.showResults(result);
                }
                this.historyProvider.addEntry(sql, result.executionTime, result.rowCount);
            }
            else {
                const result = await this.oracleService.executeNonQuery(sql, binds);
                vscode.window.showInformationMessage(`${result.rowsAffected} row(s) affected. (${result.executionTime}ms)`);
                this.historyProvider.addEntry(sql, result.executionTime, result.rowsAffected);
            }
        }
        catch (err) {
            this.historyProvider.addEntry(sql, 0, 0, err.message);
            vscode.window.showErrorMessage(`SQL Error: ${err.message}`);
        }
    }
    getStatementAtCursor(editor) {
        // If there's a selection, use it
        if (!editor.selection.isEmpty) {
            return editor.document.getText(editor.selection);
        }
        const text = editor.document.getText();
        const offset = editor.document.offsetAt(editor.selection.active);
        // Find statement boundaries using ; and /
        const statements = this.splitStatements(text);
        let currentOffset = 0;
        for (const stmt of statements) {
            const stmtStart = text.indexOf(stmt, currentOffset);
            const stmtEnd = stmtStart + stmt.length;
            if (offset >= stmtStart && offset <= stmtEnd + 1) {
                return stmt;
            }
            currentOffset = stmtEnd;
        }
        // Fallback: return entire text
        return text;
    }
    splitStatements(text) {
        const statements = [];
        let current = '';
        let inString = false;
        let inBlockComment = false;
        let inLineComment = false;
        let parenDepth = 0;
        let inPlSqlBlock = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];
            // Handle comments
            if (!inString && !inBlockComment && char === '-' && nextChar === '-') {
                inLineComment = true;
            }
            if (inLineComment && char === '\n') {
                inLineComment = false;
            }
            if (!inString && !inLineComment && char === '/' && nextChar === '*') {
                inBlockComment = true;
            }
            if (inBlockComment && char === '*' && nextChar === '/') {
                inBlockComment = false;
                current += '*/';
                i++;
                continue;
            }
            // Handle strings
            if (!inBlockComment && !inLineComment && char === "'") {
                inString = !inString;
            }
            if (inString || inBlockComment || inLineComment) {
                current += char;
                continue;
            }
            // Track parentheses
            if (char === '(') {
                parenDepth++;
            }
            if (char === ')') {
                parenDepth--;
            }
            // Detect PL/SQL blocks
            const upperCurrent = current.toUpperCase().trim();
            if (/\b(BEGIN|DECLARE)\s*$/i.test(upperCurrent)) {
                inPlSqlBlock = true;
            }
            // Statement delimiter
            if (char === ';' && parenDepth === 0) {
                if (inPlSqlBlock) {
                    // Check if this is END;
                    if (/\bEND\s*$/i.test(current.trim())) {
                        inPlSqlBlock = false;
                        current += char;
                        statements.push(current.trim());
                        current = '';
                        continue;
                    }
                    current += char;
                    continue;
                }
                statements.push(current.trim());
                current = '';
                continue;
            }
            // / as delimiter (PL/SQL)
            if (char === '/' && (i === 0 || text[i - 1] === '\n') && (nextChar === '\n' || nextChar === undefined || nextChar === '\r')) {
                if (current.trim()) {
                    statements.push(current.trim());
                    current = '';
                }
                inPlSqlBlock = false;
                continue;
            }
            current += char;
        }
        if (current.trim()) {
            statements.push(current.trim());
        }
        // Filter out comment-only statements
        return statements.filter(s => {
            const cleaned = s.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
            return cleaned.length > 0;
        });
    }
}
exports.SqlWorksheetCommands = SqlWorksheetCommands;
//# sourceMappingURL=sqlWorksheet.js.map