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
exports.SqlHistoryProvider = void 0;
const vscode = __importStar(require("vscode"));
class SqlHistoryProvider {
    context;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    history = [];
    maxEntries = 200;
    constructor(context) {
        this.context = context;
        // Restore from workspace state
        this.history = context.workspaceState.get('sqlHistory', []);
    }
    addEntry(sql, executionTime, rowCount, error) {
        this.history.unshift({
            sql: sql.trim(),
            timestamp: new Date(),
            executionTime,
            rowCount,
            error
        });
        if (this.history.length > this.maxEntries) {
            this.history = this.history.slice(0, this.maxEntries);
        }
        this.context.workspaceState.update('sqlHistory', this.history);
        this._onDidChangeTreeData.fire();
    }
    clear() {
        this.history = [];
        this.context.workspaceState.update('sqlHistory', []);
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        return this.history.map((entry, index) => {
            const preview = entry.sql.replace(/\s+/g, ' ').substring(0, 80);
            const time = new Date(entry.timestamp).toLocaleTimeString();
            const item = new SqlHistoryItem(preview, entry.error ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.None);
            item.description = `${time} • ${entry.executionTime}ms • ${entry.rowCount} rows`;
            item.tooltip = new vscode.MarkdownString(`**SQL:**\n\`\`\`sql\n${entry.sql}\n\`\`\`\n\n` +
                `**Time:** ${time}\n**Duration:** ${entry.executionTime}ms\n**Rows:** ${entry.rowCount}` +
                (entry.error ? `\n\n**Error:** ${entry.error}` : ''));
            item.iconPath = entry.error
                ? new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'))
                : new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
            // Click to insert SQL into active editor
            item.command = {
                command: 'ingSql.insertSqlFromHistory',
                title: 'Open in New Worksheet',
                arguments: [entry.sql]
            };
            return item;
        });
    }
}
exports.SqlHistoryProvider = SqlHistoryProvider;
class SqlHistoryItem extends vscode.TreeItem {
    label;
    collapsibleState;
    constructor(label, collapsibleState) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}
//# sourceMappingURL=sqlHistoryProvider.js.map