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
exports.SqlDiagnosticsProvider = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Provides two layers of SQL diagnostics:
 * 1. Real-time basic syntax checks (unmatched parens, unclosed strings/comments)
 * 2. Execution error positioning (Oracle error offset → editor squiggly)
 */
class SqlDiagnosticsProvider {
    executionDiagnostics;
    syntaxDiagnostics;
    debounceTimers = new Map();
    constructor() {
        this.executionDiagnostics = vscode.languages.createDiagnosticCollection('oracle-execution');
        this.syntaxDiagnostics = vscode.languages.createDiagnosticCollection('oracle-syntax');
    }
    /**
     * Start watching document changes for real-time syntax checking.
     * Returns disposables to register with the extension context.
     */
    startWatching() {
        return [
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document.languageId === 'oraclesql') {
                    this.debouncedCheck(e.document);
                    // Clear stale execution errors when the user edits
                    this.executionDiagnostics.delete(e.document.uri);
                }
            }),
            vscode.workspace.onDidCloseTextDocument(doc => {
                this.executionDiagnostics.delete(doc.uri);
                this.syntaxDiagnostics.delete(doc.uri);
            }),
            this.executionDiagnostics,
            this.syntaxDiagnostics,
        ];
    }
    /**
     * Report an Oracle execution error as a diagnostic in the editor.
     * Uses Oracle's error offset (character position in the SQL) to pinpoint the location.
     */
    reportExecutionError(document, sqlStartOffset, error) {
        const errorOffset = typeof error.offset === 'number' ? error.offset : -1;
        const errorNum = error.errorNum || 0;
        const message = error.message || 'Unknown error';
        let range;
        if (errorOffset >= 0) {
            // Oracle gives the character offset within the SQL string
            const docOffset = sqlStartOffset + errorOffset;
            const maxOffset = document.getText().length;
            const clampedOffset = Math.max(0, Math.min(docOffset, maxOffset - 1));
            const pos = document.positionAt(clampedOffset);
            const wordRange = document.getWordRangeAtPosition(pos, /[A-Za-z_][A-Za-z0-9_$#.]*/);
            range = wordRange || new vscode.Range(pos, pos.translate(0, 1));
        }
        else {
            // No offset info — highlight the first line of the statement
            const startPos = document.positionAt(sqlStartOffset);
            const lineEnd = document.lineAt(startPos.line).range.end;
            range = new vscode.Range(startPos, lineEnd);
        }
        const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'Oracle';
        if (errorNum) {
            diagnostic.code = `ORA-${String(errorNum).padStart(5, '0')}`;
        }
        // Accumulate with existing diagnostics (for script execution with multiple errors)
        const existing = [...(this.executionDiagnostics.get(document.uri) || [])];
        existing.push(diagnostic);
        this.executionDiagnostics.set(document.uri, existing);
    }
    /**
     * Clear execution error diagnostics for a document.
     */
    clearExecutionErrors(uri) {
        this.executionDiagnostics.delete(uri);
    }
    // ─── Real-time syntax checking ──────────────────────────────────
    debouncedCheck(document) {
        const key = document.uri.toString();
        const existing = this.debounceTimers.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        this.debounceTimers.set(key, setTimeout(() => {
            this.checkBasicSyntax(document);
            this.debounceTimers.delete(key);
        }, 500));
    }
    /**
     * Basic client-side syntax checks:
     * - Unmatched parentheses
     * - Unclosed string literals
     * - Unclosed block comments
     */
    checkBasicSyntax(document) {
        const text = document.getText();
        const diagnostics = [];
        const parenStack = [];
        let inString = false;
        let inLineComment = false;
        let inBlockComment = false;
        let stringStartPos = -1;
        let blockCommentStartPos = -1;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];
            // ── Inside block comment ──
            if (inBlockComment) {
                if (char === '*' && nextChar === '/') {
                    inBlockComment = false;
                    i++;
                }
                continue;
            }
            // ── Inside line comment ──
            if (inLineComment) {
                if (char === '\n') {
                    inLineComment = false;
                }
                continue;
            }
            // ── Inside string literal ──
            if (inString) {
                if (char === "'") {
                    if (nextChar === "'") {
                        i++; // escaped quote ''
                    }
                    else {
                        inString = false;
                    }
                }
                continue;
            }
            // ── Detect region starts ──
            if (char === '-' && nextChar === '-') {
                inLineComment = true;
                i++;
                continue;
            }
            if (char === '/' && nextChar === '*') {
                inBlockComment = true;
                blockCommentStartPos = i;
                i++;
                continue;
            }
            if (char === "'") {
                inString = true;
                stringStartPos = i;
                continue;
            }
            // ── Track parentheses ──
            if (char === '(') {
                parenStack.push(i);
            }
            else if (char === ')') {
                if (parenStack.length === 0) {
                    const pos = document.positionAt(i);
                    diagnostics.push(this.makeDiag(new vscode.Range(pos, pos.translate(0, 1)), 'Unmatched closing parenthesis'));
                }
                else {
                    parenStack.pop();
                }
            }
        }
        // Unclosed string at end of file
        if (inString && stringStartPos >= 0) {
            const pos = document.positionAt(stringStartPos);
            diagnostics.push(this.makeDiag(new vscode.Range(pos, pos.translate(0, 1)), 'Unclosed string literal'));
        }
        // Unclosed block comment
        if (inBlockComment && blockCommentStartPos >= 0) {
            const pos = document.positionAt(blockCommentStartPos);
            diagnostics.push(this.makeDiag(new vscode.Range(pos, pos.translate(0, 2)), 'Unclosed block comment'));
        }
        // Unmatched opening parentheses
        for (const parenPos of parenStack) {
            const pos = document.positionAt(parenPos);
            diagnostics.push(this.makeDiag(new vscode.Range(pos, pos.translate(0, 1)), 'Unmatched opening parenthesis'));
        }
        this.syntaxDiagnostics.set(document.uri, diagnostics);
    }
    makeDiag(range, message) {
        const d = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
        d.source = 'Oracle SQL';
        return d;
    }
    dispose() {
        this.executionDiagnostics.dispose();
        this.syntaxDiagnostics.dispose();
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
    }
}
exports.SqlDiagnosticsProvider = SqlDiagnosticsProvider;
//# sourceMappingURL=sqlDiagnosticsProvider.js.map