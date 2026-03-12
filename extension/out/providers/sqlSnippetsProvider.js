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
exports.SqlSnippetItem = exports.SqlSnippetsProvider = void 0;
const vscode = __importStar(require("vscode"));
class SqlSnippetsProvider {
    context;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    static SNIPPETS_KEY = 'ingSql.userSnippets';
    constructor(context) {
        this.context = context;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]);
        }
        else {
            const snippets = this.getSnippets();
            return Promise.resolve(snippets.sort((a, b) => a.name.localeCompare(b.name))
                .map(s => new SqlSnippetItem(s.name, s.content, s.id)));
        }
    }
    getSnippets() {
        return this.context.globalState.get(SqlSnippetsProvider.SNIPPETS_KEY, []);
    }
    async addSnippet(name, content) {
        const snippets = this.getSnippets();
        const id = Date.now().toString();
        snippets.push({ id, name, content });
        await this.context.globalState.update(SqlSnippetsProvider.SNIPPETS_KEY, snippets);
        this.refresh();
    }
    async updateSnippet(id, name, content) {
        let snippets = this.getSnippets();
        const index = snippets.findIndex(s => s.id === id);
        if (index !== -1) {
            snippets[index] = { id, name, content };
            await this.context.globalState.update(SqlSnippetsProvider.SNIPPETS_KEY, snippets);
            this.refresh();
        }
    }
    async deleteSnippet(id) {
        let snippets = this.getSnippets();
        snippets = snippets.filter(s => s.id !== id);
        await this.context.globalState.update(SqlSnippetsProvider.SNIPPETS_KEY, snippets);
        this.refresh();
    }
}
exports.SqlSnippetsProvider = SqlSnippetsProvider;
class SqlSnippetItem extends vscode.TreeItem {
    label;
    content;
    id;
    constructor(label, content, id) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.content = content;
        this.id = id;
        this.tooltip = content;
        this.contextValue = 'sql-snippet';
        this.command = {
            command: 'ingSql.insertSnippet',
            title: 'Insert Snippet',
            arguments: [this]
        };
    }
    iconPath = new vscode.ThemeIcon('symbol-field');
}
exports.SqlSnippetItem = SqlSnippetItem;
//# sourceMappingURL=sqlSnippetsProvider.js.map