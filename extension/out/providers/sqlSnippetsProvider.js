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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class SqlSnippetsProvider {
    context;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    static LEGACY_KEY = 'ingSql.userSnippets';
    snippetsFilePath;
    constructor(context) {
        this.context = context;
        const storagePath = context.globalStorageUri.fsPath;
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        this.snippetsFilePath = path.join(storagePath, 'snippets.json');
        this.migrateFromGlobalState();
    }
    /**
     * One-time migration: if snippets exist in globalState (legacy storage),
     * merge them into the file and clear globalState so users aren't affected.
     */
    migrateFromGlobalState() {
        const legacy = this.context.globalState.get(SqlSnippetsProvider.LEGACY_KEY);
        if (legacy && legacy.length > 0) {
            const existing = this.readSnippetsFromFile();
            const existingIds = new Set(existing.map(s => s.id));
            const toMerge = legacy.filter(s => !existingIds.has(s.id));
            if (toMerge.length > 0) {
                const merged = [...existing, ...toMerge];
                this.writeSnippetsToFile(merged);
            }
            // Clear legacy storage
            this.context.globalState.update(SqlSnippetsProvider.LEGACY_KEY, undefined);
        }
    }
    readSnippetsFromFile() {
        try {
            if (fs.existsSync(this.snippetsFilePath)) {
                const raw = fs.readFileSync(this.snippetsFilePath, 'utf8');
                return JSON.parse(raw);
            }
        }
        catch (err) {
            console.error('Failed to read snippets file:', err);
        }
        return [];
    }
    writeSnippetsToFile(snippets) {
        try {
            fs.writeFileSync(this.snippetsFilePath, JSON.stringify(snippets, null, 2), 'utf8');
        }
        catch (err) {
            console.error('Failed to write snippets file:', err);
            vscode.window.showErrorMessage('Failed to save snippets.');
        }
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
        return this.readSnippetsFromFile();
    }
    async addSnippet(name, content) {
        const snippets = this.getSnippets();
        const id = Date.now().toString();
        snippets.push({ id, name, content });
        this.writeSnippetsToFile(snippets);
        this.refresh();
    }
    async updateSnippet(id, name, content) {
        const snippets = this.getSnippets();
        const index = snippets.findIndex(s => s.id === id);
        if (index !== -1) {
            snippets[index] = { id, name, content };
            this.writeSnippetsToFile(snippets);
            this.refresh();
        }
    }
    async deleteSnippet(id) {
        let snippets = this.getSnippets();
        snippets = snippets.filter(s => s.id !== id);
        this.writeSnippetsToFile(snippets);
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