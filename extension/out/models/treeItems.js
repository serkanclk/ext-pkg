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
exports.TABLE_SUB_CATEGORIES = exports.OBJECT_CATEGORIES = exports.OracleTreeItem = void 0;
const vscode = __importStar(require("vscode"));
class OracleTreeItem extends vscode.TreeItem {
    label;
    objectType;
    collapsibleState;
    connectionName;
    schemaName;
    objectName;
    parentObjectName;
    detail;
    constructor(label, objectType, collapsibleState, connectionName, schemaName, objectName, parentObjectName, detail) {
        super(label, collapsibleState);
        this.label = label;
        this.objectType = objectType;
        this.collapsibleState = collapsibleState;
        this.connectionName = connectionName;
        this.schemaName = schemaName;
        this.objectName = objectName;
        this.parentObjectName = parentObjectName;
        this.detail = detail;
        this.contextValue = objectType;
        this.tooltip = this.buildTooltip();
        this.iconPath = this.getIcon();
        // Make leaf items show detail as description
        if (detail) {
            this.description = detail;
        }
    }
    buildTooltip() {
        const parts = [this.label];
        if (this.detail) {
            parts.push(this.detail);
        }
        if (this.schemaName && this.objectName) {
            parts.push(`${this.schemaName}.${this.objectName}`);
        }
        return parts.join('\n');
    }
    getIcon() {
        const iconMap = {
            'connection-connected': 'database',
            'connection-disconnected': 'debug-disconnect',
            'category': 'folder',
            'table': 'symbol-class',
            'view': 'symbol-interface',
            'mview': 'symbol-interface',
            'index': 'list-tree',
            'sequence': 'symbol-number',
            'synonym': 'symbol-reference',
            'dblink': 'remote',
            'trigger': 'zap',
            'procedure': 'symbol-method',
            'function': 'symbol-function',
            'package': 'package',
            'package-spec': 'symbol-interface',
            'package-body': 'symbol-method',
            'type': 'symbol-struct',
            'column': 'symbol-field',
            'constraint': 'lock',
            'grant': 'shield',
            'table-trigger': 'zap',
            'table-index': 'list-tree',
            'other-users': 'organization',
            'other-schema': 'person',
        };
        const iconName = iconMap[this.objectType] || 'circle-outline';
        return new vscode.ThemeIcon(iconName);
    }
}
exports.OracleTreeItem = OracleTreeItem;
exports.OBJECT_CATEGORIES = [
    { label: 'Tables', type: 'TABLE', itemType: 'table' },
    { label: 'Views', type: 'VIEW', itemType: 'view' },
    { label: 'Materialized Views', type: 'MATERIALIZED VIEW', itemType: 'mview' },
    { label: 'Indexes', type: 'INDEX', itemType: 'index' },
    { label: 'Sequences', type: 'SEQUENCE', itemType: 'sequence' },
    { label: 'Procedures', type: 'PROCEDURE', itemType: 'procedure' },
    { label: 'Functions', type: 'FUNCTION', itemType: 'function' },
    { label: 'Packages', type: 'PACKAGE', itemType: 'package' },
    { label: 'Triggers', type: 'TRIGGER', itemType: 'trigger' },
    { label: 'Types', type: 'TYPE', itemType: 'type' },
    { label: 'Synonyms', type: 'SYNONYM', itemType: 'synonym' },
    { label: 'DB Links', type: 'DATABASE LINK', itemType: 'dblink' },
];
exports.TABLE_SUB_CATEGORIES = [
    'Columns',
    'Constraints',
    'Indexes',
    'Triggers',
    'Grants',
];
//# sourceMappingURL=treeItems.js.map