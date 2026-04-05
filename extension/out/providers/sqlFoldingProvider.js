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
exports.SqlFoldingProvider = void 0;
const vscode = __importStar(require("vscode"));
class SqlFoldingProvider {
    provideFoldingRanges(document, context, token) {
        const ranges = [];
        const text = document.getText();
        const lines = text.split(/\r?\n/);
        let inBlockComment = false;
        let blockCommentStart = 0;
        let parenDepth = 0;
        const parenStack = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let j = 0;
            while (j < line.length) {
                const char = line.charAt(j);
                const nextChar = line.charAt(j + 1);
                // Block comments
                if (!inBlockComment && char === '/' && nextChar === '*') {
                    inBlockComment = true;
                    blockCommentStart = i;
                    j += 2;
                    continue;
                }
                if (inBlockComment && char === '*' && nextChar === '/') {
                    inBlockComment = false;
                    if (i > blockCommentStart) {
                        ranges.push(new vscode.FoldingRange(blockCommentStart, i, vscode.FoldingRangeKind.Comment));
                    }
                    j += 2;
                    continue;
                }
                if (inBlockComment) {
                    j++;
                    continue;
                }
                // Line comments - skip the rest of the line
                if (char === '-' && nextChar === '-') {
                    break;
                }
                // Strings - skip until closing quote
                if (char === "'") {
                    j++;
                    while (j < line.length) {
                        if (line.charAt(j) === "'") {
                            // Check for escaped quote ''
                            if (line.charAt(j + 1) === "'") {
                                j += 2;
                                continue;
                            }
                            break;
                        }
                        j++;
                    }
                    j++;
                    continue;
                }
                // Parentheses tracking for folding regions (e.g., subqueries, functions)
                if (char === '(') {
                    parenStack.push(i);
                }
                else if (char === ')') {
                    if (parenStack.length > 0) {
                        const startLine = parenStack.pop();
                        if (startLine < i) {
                            ranges.push(new vscode.FoldingRange(startLine, i, vscode.FoldingRangeKind.Region));
                        }
                    }
                }
                // Statements (Regions separated by AS or BEGIN/END pairs could also be handled similarly)
                j++;
            }
        }
        if (inBlockComment && blockCommentStart < lines.length - 1) {
            ranges.push(new vscode.FoldingRange(blockCommentStart, lines.length - 1, vscode.FoldingRangeKind.Comment));
        }
        // Additional SQL-specific folding: Detect consecutive statements separated by semicolons
        let stmtStartLine = 0;
        let foundQuery = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('--'))
                continue;
            if (!foundQuery && /^(SELECT|WITH|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|BEGIN|DECLARE)\b/i.test(line)) {
                stmtStartLine = i;
                foundQuery = true;
            }
            if (line.endsWith(';') || line.endsWith('/')) {
                if (foundQuery && stmtStartLine < i) {
                    ranges.push(new vscode.FoldingRange(stmtStartLine, i, vscode.FoldingRangeKind.Region));
                }
                foundQuery = false;
            }
        }
        return ranges;
    }
}
exports.SqlFoldingProvider = SqlFoldingProvider;
//# sourceMappingURL=sqlFoldingProvider.js.map