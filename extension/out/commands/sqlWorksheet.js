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
const worksheetSessionManager_js_1 = require("../services/worksheetSessionManager.js");
class SqlWorksheetCommands {
    context;
    oracleService;
    connMgr;
    resultsPanel;
    historyProvider;
    statusBar;
    constructor(context, resultsPanel, historyProvider, statusBar) {
        this.context = context;
        this.oracleService = oracleService_1.OracleService.getInstance();
        this.connMgr = connectionManager_1.ConnectionManager.getInstance();
        this.resultsPanel = resultsPanel;
        this.historyProvider = historyProvider;
        this.statusBar = statusBar;
        this.resultsPanel.setLoadMoreHandler(async (cursorId) => {
            try {
                this.resultsPanel.setLoadingMore(true);
                const config = vscode.workspace.getConfiguration('ingSql');
                const batchSize = config.get('resultGrid.maxRows', 100);
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
    async toUpperCase() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const selection = editor.selection;
        const text = editor.document.getText(selection);
        if (!text) {
            return;
        }
        // SQL-Aware Uppercase (single O(n) pass):
        // Preserves original case inside:
        //   - Single-quoted strings:  'hello world'
        //   - Double-quoted identifiers: "myColumn"
        //   - Line comments:  -- this stays as-is
        //   - Block comments: /* this stays as-is */
        let upperText = '';
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inLineComment = false;
        let inBlockComment = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];
            // --- Block comment end ---
            if (inBlockComment) {
                upperText += char;
                if (char === '*' && nextChar === '/') {
                    upperText += '/';
                    i++;
                    inBlockComment = false;
                }
                continue;
            }
            // --- Line comment end ---
            if (inLineComment) {
                upperText += char;
                if (char === '\n') {
                    inLineComment = false;
                }
                continue;
            }
            // --- Single-quoted string ---
            if (inSingleQuote) {
                upperText += char;
                if (char === "'") {
                    // Handle escaped quotes (''): stay in string
                    if (nextChar === "'") {
                        upperText += "'";
                        i++;
                    }
                    else {
                        inSingleQuote = false;
                    }
                }
                continue;
            }
            // --- Double-quoted identifier ---
            if (inDoubleQuote) {
                upperText += char;
                if (char === '"') {
                    inDoubleQuote = false;
                }
                continue;
            }
            // --- Detect start of preserved regions ---
            if (char === "'") {
                inSingleQuote = true;
                upperText += char;
            }
            else if (char === '"') {
                inDoubleQuote = true;
                upperText += char;
            }
            else if (char === '-' && nextChar === '-') {
                inLineComment = true;
                upperText += '--';
                i++;
            }
            else if (char === '/' && nextChar === '*') {
                inBlockComment = true;
                upperText += '/*';
                i++;
            }
            else {
                upperText += char.toUpperCase();
            }
        }
        await editor.edit(editBuilder => {
            editBuilder.replace(selection, upperText);
        });
    }
    async toLowerCase() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const selection = editor.selection;
        const text = editor.document.getText(selection);
        if (!text) {
            return;
        }
        // SQL-Aware Lowercase (single O(n) pass):
        // Same preservation rules as toUpperCase
        let lowerText = '';
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inLineComment = false;
        let inBlockComment = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];
            if (inBlockComment) {
                lowerText += char;
                if (char === '*' && nextChar === '/') {
                    lowerText += '/';
                    i++;
                    inBlockComment = false;
                }
                continue;
            }
            if (inLineComment) {
                lowerText += char;
                if (char === '\n') {
                    inLineComment = false;
                }
                continue;
            }
            if (inSingleQuote) {
                lowerText += char;
                if (char === "'") {
                    if (nextChar === "'") {
                        lowerText += "'";
                        i++;
                    }
                    else {
                        inSingleQuote = false;
                    }
                }
                continue;
            }
            if (inDoubleQuote) {
                lowerText += char;
                if (char === '"') {
                    inDoubleQuote = false;
                }
                continue;
            }
            if (char === "'") {
                inSingleQuote = true;
                lowerText += char;
            }
            else if (char === '"') {
                inDoubleQuote = true;
                lowerText += char;
            }
            else if (char === '-' && nextChar === '-') {
                inLineComment = true;
                lowerText += '--';
                i++;
            }
            else if (char === '/' && nextChar === '*') {
                inBlockComment = true;
                lowerText += '/*';
                i++;
            }
            else {
                lowerText += char.toLowerCase();
            }
        }
        await editor.edit(editBuilder => {
            editBuilder.replace(selection, lowerText);
        });
    }
    async describeObjectAtCursor() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        if (!this.connMgr.getActiveConnectionName()) {
            vscode.window.showWarningMessage('No active connection. Please connect first.');
            return;
        }
        // Get word under cursor (handles schema.object notation)
        const position = editor.selection.active;
        const wordRange = editor.document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_$#]*/);
        if (!wordRange) {
            vscode.window.showWarningMessage('No object name found at cursor.');
            return;
        }
        const objectName = editor.document.getText(wordRange).toUpperCase();
        const connectionName = this.connMgr.getActiveConnectionName();
        // Fire the describe command with a synthetic tree item
        const { OracleTreeItem } = await import('../models/treeItems.js');
        const dummyItem = new OracleTreeItem(objectName, 'table', (await import('vscode')).TreeItemCollapsibleState.None, connectionName, undefined, objectName);
        vscode.commands.executeCommand('ingSql.describeObject', dummyItem);
    }
    async executeSql(sql) {
        // Strip trailing semicolons and PL/SQL '/' terminators
        // Oracle's programmatic API doesn't accept these (SQL*Plus convention only)
        sql = sql.replace(/[;\s/]+$/, '').trim();
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
        this.statusBar.showRunning();
        // Get dedicated session connection for this worksheet
        const editor = vscode.window.activeTextEditor;
        const docUri = editor?.document.uri.toString();
        const sessionMgr = worksheetSessionManager_js_1.WorksheetSessionManager.getInstance();
        let sessionConn;
        try {
            if (docUri) {
                sessionConn = await sessionMgr.getSessionConnection(docUri);
            }
        }
        catch (err) {
            this.statusBar.showError(err.message, 0);
            vscode.window.showErrorMessage(`Session Error: ${err.message}`);
            return;
        }
        try {
            if (isQuery) {
                const result = await this.oracleService.executeCursor(sql, binds, {
                    connection: sessionConn
                });
                const config = vscode.workspace.getConfiguration('ingSql');
                const location = config.get('results.location', 'Panel');
                if (location === 'Editor') {
                    vscode.commands.executeCommand('ingSql.showResultsInTab', result);
                }
                else {
                    this.resultsPanel.showResults(result);
                }
                this.historyProvider.addEntry(sql, result.executionTime, result.rowCount);
                this.statusBar.showSuccess(result.rowCount, result.executionTime);
            }
            else {
                const result = await this.oracleService.executeNonQuery(sql, binds, {
                    connection: sessionConn
                });
                vscode.window.showInformationMessage(`${result.rowsAffected} row(s) affected. (${result.executionTime}ms)`);
                this.historyProvider.addEntry(sql, result.executionTime, result.rowsAffected);
                this.statusBar.showSuccess(result.rowsAffected, result.executionTime);
            }
        }
        catch (err) {
            const elapsed = Date.now() - this.statusBar['startTime'] || 0;
            this.historyProvider.addEntry(sql, 0, 0, err.message);
            this.statusBar.showError(err.message, elapsed);
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