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
exports.SqlStatusBar = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Manages a status bar item that shows SQL execution state:
 *   Running  → $(sync~spin) SQL Running... (2.3s)   [orange]
 *   Success  → $(check) 847 rows · 1.24s             [green]
 *   Error    → $(error) ORA-00942 · 0.5s             [red]
 */
class SqlStatusBar {
    item;
    timer;
    startTime = 0;
    fadeTimeout;
    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100 // high priority so it's visible
        );
        this.item.command = 'ingSql.resultsView.focus';
        this.item.tooltip = 'Click to show results';
    }
    /** Call when a query starts executing */
    showRunning() {
        this.clearTimers();
        this.startTime = Date.now();
        this.item.text = '$(sync~spin) SQL Running... (0.0s) — Click to Cancel';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.item.color = undefined;
        this.item.command = 'ingSql.cancelQuery';
        this.item.tooltip = 'Click to cancel the running query';
        this.item.show();
        // Live timer — update every 100ms
        this.timer = setInterval(() => {
            const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
            this.item.text = `$(sync~spin) SQL Running... (${elapsed}s) — Click to Cancel`;
        }, 100);
    }
    /** Call when a query succeeds */
    showSuccess(rowCount, executionTimeMs) {
        this.clearTimers();
        const timeStr = executionTimeMs < 1000
            ? `${executionTimeMs}ms`
            : `${(executionTimeMs / 1000).toFixed(2)}s`;
        this.item.text = `$(check) ${rowCount} row(s) · ${timeStr}`;
        this.item.backgroundColor = undefined;
        this.item.color = '#3fb950'; // green
        this.item.command = 'ingSql.resultsView.focus';
        this.item.tooltip = `Query completed: ${rowCount} row(s) in ${timeStr}. Click to show results.`;
        this.item.show();
        // Auto-fade after 15 seconds
        this.fadeTimeout = setTimeout(() => {
            this.item.text = `$(database) SQL Ready`;
            this.item.color = undefined;
            this.item.tooltip = 'Last query completed successfully';
        }, 15000);
    }
    /** Call when a query fails */
    showError(errorMessage, executionTimeMs) {
        this.clearTimers();
        const timeStr = executionTimeMs < 1000
            ? `${executionTimeMs}ms`
            : `${(executionTimeMs / 1000).toFixed(2)}s`;
        // Extract ORA-XXXXX code if present, otherwise truncate message
        const oraMatch = errorMessage.match(/ORA-\d+/);
        const shortError = oraMatch ? oraMatch[0] : errorMessage.substring(0, 40);
        this.item.text = `$(error) ${shortError} · ${timeStr}`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.item.color = undefined;
        this.item.command = 'ingSql.resultsView.focus';
        this.item.tooltip = `SQL Error: ${errorMessage}`;
        this.item.show();
        // Keep error visible — no auto-fade (clears on next query)
    }
    /** Call when a query is cancelled */
    showCancelled() {
        this.clearTimers();
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        this.item.text = `$(circle-slash) Query cancelled · ${elapsed}s`;
        this.item.backgroundColor = undefined;
        this.item.color = '#d29922'; // orange/yellow
        this.item.command = 'ingSql.resultsView.focus';
        this.item.tooltip = 'Query was cancelled by user';
        this.item.show();
        this.fadeTimeout = setTimeout(() => {
            this.item.text = `$(database) SQL Ready`;
            this.item.color = undefined;
            this.item.tooltip = 'Ready to execute SQL';
        }, 10000);
    }
    /** Show idle/ready state */
    showReady() {
        this.clearTimers();
        this.item.text = '$(database) SQL Ready';
        this.item.backgroundColor = undefined;
        this.item.color = undefined;
        this.item.tooltip = 'Ready to execute SQL';
        this.item.show();
    }
    clearTimers() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        if (this.fadeTimeout) {
            clearTimeout(this.fadeTimeout);
            this.fadeTimeout = undefined;
        }
    }
    dispose() {
        this.clearTimers();
        this.item.dispose();
    }
}
exports.SqlStatusBar = SqlStatusBar;
//# sourceMappingURL=sqlStatusBar.js.map