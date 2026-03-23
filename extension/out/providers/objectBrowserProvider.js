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
exports.ObjectBrowserProvider = void 0;
const vscode = __importStar(require("vscode"));
const connectionManager_1 = require("../services/connectionManager");
const oracleService_1 = require("../services/oracleService");
const treeItems_1 = require("../models/treeItems");
class ObjectBrowserProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    connMgr;
    oracleService;
    constructor() {
        this.connMgr = connectionManager_1.ConnectionManager.getInstance();
        this.oracleService = oracleService_1.OracleService.getInstance();
        this.connMgr.onDidChangeConnection(() => this.refresh());
        this.connMgr.onDidUpdateProfiles(() => this.refresh());
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            return this.getConnectionNodes();
        }
        switch (element.objectType) {
            case 'connection-connected':
                return this.getCategoryNodes(element.connectionName);
            case 'connection-disconnected':
                return [];
            case 'other-users':
                return this.getOtherSchemaNodes(element.connectionName);
            case 'other-schema':
                return this.getSchemaCategoryNodes(element.connectionName, element.objectName);
            case 'category':
                // If schemaName is set and different from default, it's a category under Other Users
                if (element.schemaName && element.parentObjectName === '_other_schema_') {
                    return this.getOtherSchemaObjectNodes(element);
                }
                return this.getObjectNodes(element);
            case 'table':
            case 'view':
            case 'mview':
                return this.getTableSubCategories(element);
            default:
                return this.getSubCategoryChildren(element);
        }
    }
    getConnectionNodes() {
        const profiles = this.connMgr.getProfiles();
        return profiles.map(profile => {
            const connected = this.connMgr.isConnected(profile.name);
            return new treeItems_1.OracleTreeItem(profile.name, connected ? 'connection-connected' : 'connection-disconnected', connected
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None, profile.name, undefined, undefined, undefined, connected
                ? `${profile.username}@${profile.host || profile.tnsAlias || 'custom'}`
                : 'Disconnected');
        });
    }
    getCategoryNodes(connectionName) {
        const categories = treeItems_1.OBJECT_CATEGORIES.map(cat => new treeItems_1.OracleTreeItem(cat.label, 'category', vscode.TreeItemCollapsibleState.Collapsed, connectionName, undefined, cat.type));
        // Add "Other Users" at the bottom
        categories.push(new treeItems_1.OracleTreeItem('Other Users', 'other-users', vscode.TreeItemCollapsibleState.Collapsed, connectionName));
        return categories;
    }
    async getOtherSchemaNodes(connectionName) {
        try {
            const schemas = await this.oracleService.getAccessibleSchemas(connectionName);
            return schemas.map(schema => new treeItems_1.OracleTreeItem(schema, 'other-schema', vscode.TreeItemCollapsibleState.Collapsed, connectionName, schema, schema));
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error loading schemas: ${err.message}`);
            return [];
        }
    }
    getSchemaCategoryNodes(connectionName, schemaName) {
        return treeItems_1.OBJECT_CATEGORIES.map(cat => new treeItems_1.OracleTreeItem(cat.label, 'category', vscode.TreeItemCollapsibleState.Collapsed, connectionName, schemaName, cat.type, '_other_schema_' // marker so getChildren knows this is under Other Users
        ));
    }
    async getOtherSchemaObjectNodes(categoryElement) {
        const connectionName = categoryElement.connectionName;
        const schemaName = categoryElement.schemaName;
        const objectType = categoryElement.objectName;
        try {
            const objects = await this.oracleService.getSchemaObjectsForOwner(objectType, schemaName, connectionName);
            const category = treeItems_1.OBJECT_CATEGORIES.find(c => c.type === objectType);
            const itemType = category?.itemType || 'table';
            return objects.map(obj => {
                const hasChildren = ['table', 'view', 'mview'].includes(itemType);
                return new treeItems_1.OracleTreeItem(obj.name, itemType, hasChildren
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None, connectionName, schemaName, obj.name, undefined, obj.status !== 'VALID' ? obj.status : undefined);
            });
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error loading ${schemaName} objects: ${err.message}`);
            return [];
        }
    }
    async getObjectNodes(categoryElement) {
        const connectionName = categoryElement.connectionName;
        const objectType = categoryElement.objectName; // stored as the Oracle type
        try {
            const objects = await this.oracleService.getSchemaObjects(objectType, connectionName);
            const category = treeItems_1.OBJECT_CATEGORIES.find(c => c.type === objectType);
            const itemType = category?.itemType || 'table';
            return objects.map(obj => {
                const hasChildren = ['table', 'view', 'mview'].includes(itemType);
                return new treeItems_1.OracleTreeItem(obj.name, itemType, hasChildren
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None, connectionName, obj.owner, obj.name, undefined, obj.status !== 'VALID' ? obj.status : undefined);
            });
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error loading objects: ${err.message}`);
            return [];
        }
    }
    getTableSubCategories(tableElement) {
        return treeItems_1.TABLE_SUB_CATEGORIES.map(subCat => new treeItems_1.OracleTreeItem(subCat, 'category', vscode.TreeItemCollapsibleState.Collapsed, tableElement.connectionName, tableElement.schemaName, subCat, // sub-category name
        tableElement.objectName // parent table name
        ));
    }
    async getSubCategoryChildren(element) {
        const tableName = element.parentObjectName;
        const connectionName = element.connectionName;
        const subCategory = element.objectName;
        try {
            switch (subCategory) {
                case 'Columns':
                    return this.getColumnNodes(tableName, connectionName);
                case 'Constraints':
                    return this.getConstraintNodes(tableName, connectionName);
                case 'Indexes':
                    return this.getIndexNodes(tableName, connectionName);
                case 'Triggers':
                    return this.getTriggerNodes(tableName, connectionName);
                case 'Grants':
                    return this.getGrantNodes(tableName, connectionName);
                default:
                    return [];
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error loading ${subCategory}: ${err.message}`);
            return [];
        }
    }
    async getColumnNodes(tableName, connectionName) {
        const columns = await this.oracleService.getTableColumns(tableName, connectionName);
        return columns.map(col => {
            let typeStr = col.dataType;
            if (col.dataPrecision !== null) {
                typeStr += `(${col.dataPrecision}${col.dataScale !== null ? ',' + col.dataScale : ''})`;
            }
            else if (['VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR', 'RAW'].includes(col.dataType)) {
                typeStr += `(${col.dataLength})`;
            }
            if (col.nullable === 'N') {
                typeStr += ' NOT NULL';
            }
            return new treeItems_1.OracleTreeItem(col.name, 'column', vscode.TreeItemCollapsibleState.None, connectionName, undefined, col.name, tableName, typeStr);
        });
    }
    async getConstraintNodes(tableName, connectionName) {
        const constraints = await this.oracleService.getConstraints(tableName, connectionName);
        return constraints.map(c => new treeItems_1.OracleTreeItem(c.name, 'constraint', vscode.TreeItemCollapsibleState.None, connectionName, undefined, c.name, tableName, `${c.type} (${c.columns})${c.refTable ? ` → ${c.refTable}` : ''}`));
    }
    async getIndexNodes(tableName, connectionName) {
        const indexes = await this.oracleService.getIndexes(tableName, connectionName);
        return indexes.map(i => new treeItems_1.OracleTreeItem(i.name, 'table-index', vscode.TreeItemCollapsibleState.None, connectionName, undefined, i.name, tableName, `${i.uniqueness} (${i.columns})`));
    }
    async getTriggerNodes(tableName, connectionName) {
        const triggers = await this.oracleService.getTriggers(tableName, connectionName);
        return triggers.map((t) => new treeItems_1.OracleTreeItem(t.TRIGGER_NAME, 'table-trigger', vscode.TreeItemCollapsibleState.None, connectionName, undefined, t.TRIGGER_NAME, tableName, `${t.TRIGGER_TYPE} ${t.TRIGGERING_EVENT} [${t.STATUS}]`));
    }
    async getGrantNodes(tableName, connectionName) {
        const grants = await this.oracleService.getGrants(tableName, connectionName);
        return grants.map((g) => new treeItems_1.OracleTreeItem(`${g.GRANTEE} → ${g.PRIVILEGE}`, 'grant', vscode.TreeItemCollapsibleState.None, connectionName, undefined, undefined, tableName, g.GRANTABLE === 'YES' ? 'WITH GRANT OPTION' : undefined));
    }
}
exports.ObjectBrowserProvider = ObjectBrowserProvider;
//# sourceMappingURL=objectBrowserProvider.js.map