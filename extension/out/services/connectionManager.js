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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionManager = void 0;
const vscode = __importStar(require("vscode"));
const oracledb_1 = __importDefault(require("oracledb"));
const connectionPanel_1 = require("../panels/connectionPanel");
class ConnectionManager {
    context;
    static instance;
    pools = new Map();
    activeConnectionName;
    secretStorage;
    _onDidChangeConnection = new vscode.EventEmitter();
    onDidChangeConnection = this._onDidChangeConnection.event;
    _onDidUpdateProfiles = new vscode.EventEmitter();
    onDidUpdateProfiles = this._onDidUpdateProfiles.event;
    constructor(context) {
        this.context = context;
        this.secretStorage = context.secrets;
    }
    static initialize(context) {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager(context);
        }
        return ConnectionManager.instance;
    }
    static getInstance() {
        if (!ConnectionManager.instance) {
            throw new Error('ConnectionManager not initialized');
        }
        return ConnectionManager.instance;
    }
    getProfiles() {
        const config = vscode.workspace.getConfiguration('ingSql');
        return config.get('connections', []);
    }
    async saveProfiles(profiles) {
        const config = vscode.workspace.getConfiguration('ingSql');
        await config.update('connections', profiles, vscode.ConfigurationTarget.Global);
        this._onDidUpdateProfiles.fire();
    }
    async openConnectionPanel(profileName) {
        let profile;
        let password;
        if (profileName) {
            profile = this.getProfiles().find(p => p.name === profileName);
            password = await this.getProfilePassword(profileName);
        }
        const panel = new connectionPanel_1.ConnectionPanel(this.context.extensionUri);
        panel.setTestHandler(async (p, pwd) => {
            try {
                const success = await this.testConfig(p, pwd);
                if (success) {
                    panel.setTestResult(true, 'Connection successful!');
                }
                else {
                    panel.setTestResult(false, 'Test failed.'); // This shouldn't be hit usually, error thrown
                }
            }
            catch (err) {
                panel.setTestResult(false, `Error: ${err.message}`);
            }
        });
        panel.setSaveHandler(async (p, pwd, connectAfterSave) => {
            try {
                const profiles = this.getProfiles();
                const existingIdx = profiles.findIndex(existing => existing.name === p.name);
                if (existingIdx >= 0) {
                    if (!profileName || profileName !== p.name) {
                        // It's a "create" but name already exists, or rename to existing
                        vscode.window.showErrorMessage(`Connection named "${p.name}" already exists.`);
                        return;
                    }
                    profiles[existingIdx] = p;
                }
                else {
                    profiles.push(p);
                }
                await this.saveProfiles(profiles);
                if (pwd) {
                    await this.secretStorage.store(`ingSql.password.${p.name}`, pwd);
                }
                vscode.window.showInformationMessage(`Connection "${p.name}" saved.`);
                panel.close();
                if (connectAfterSave) {
                    // Use the password directly for the initial connection to avoid SecretStorage latency/lookup issues
                    await this.connect(p.name, pwd);
                }
            }
            catch (err) {
                vscode.window.showErrorMessage(`Failed to save connection: ${err.message}`);
            }
        });
        panel.show(profile, password);
    }
    async addConnection() {
        return this.openConnectionPanel();
    }
    async editConnection(profileName) {
        return this.openConnectionPanel(profileName);
    }
    async removeConnection(profileName) {
        const confirm = await vscode.window.showWarningMessage(`Remove connection "${profileName}"?`, { modal: true }, 'Remove');
        if (confirm !== 'Remove') {
            return;
        }
        if (this.pools.has(profileName)) {
            await this.disconnect(profileName);
        }
        await this.secretStorage.delete(`ingSql.password.${profileName}`);
        const profiles = this.getProfiles().filter(p => p.name !== profileName);
        await this.saveProfiles(profiles);
        if (this.activeConnectionName === profileName) {
            this.activeConnectionName = undefined;
            this._onDidChangeConnection.fire(undefined);
        }
        vscode.window.showInformationMessage(`Connection "${profileName}" removed.`);
    }
    async connect(profileName, directPassword) {
        const profile = this.getProfiles().find(p => p.name === profileName);
        if (!profile) {
            vscode.window.showErrorMessage(`Connection "${profileName}" not found.`);
            return false;
        }
        if (this.pools.has(profileName)) {
            this.activeConnectionName = profileName;
            this._onDidChangeConnection.fire(profileName);
            return true;
        }
        const password = directPassword || await this.secretStorage.get(`ingSql.password.${profileName}`);
        if (password === undefined) {
            vscode.window.showErrorMessage('Password not found. Please edit the connection.');
            return false;
        }
        try {
            const connectString = this.buildConnectString(profile);
            const poolAttrs = {
                user: profile.username,
                password: password,
                connectString: connectString,
                poolMin: 1,
                poolMax: 4,
                poolIncrement: 1,
                poolAlias: profileName,
            };
            if (profile.role === 'SYSDBA') {
                poolAttrs.privilege = oracledb_1.default.SYSDBA;
            }
            else if (profile.role === 'SYSOPER') {
                poolAttrs.privilege = oracledb_1.default.SYSOPER;
            }
            const pool = await oracledb_1.default.createPool(poolAttrs);
            this.pools.set(profileName, { pool, profile });
            this.activeConnectionName = profileName;
            this._onDidChangeConnection.fire(profileName);
            vscode.window.showInformationMessage(`Connected to "${profileName}".`);
            return true;
        }
        catch (err) {
            vscode.window.showErrorMessage(`Connection failed: ${err.message}`);
            return false;
        }
    }
    async disconnect(profileName) {
        const entry = this.pools.get(profileName);
        if (entry) {
            try {
                await entry.pool.close(0);
            }
            catch { /* ignore */ }
            this.pools.delete(profileName);
        }
        if (this.activeConnectionName === profileName) {
            this.activeConnectionName = undefined;
            this._onDidChangeConnection.fire(undefined);
        }
        vscode.window.showInformationMessage(`Disconnected from "${profileName}".`);
    }
    async testConnection(profileName) {
        const profile = this.getProfiles().find(p => p.name === profileName);
        if (!profile) {
            return false;
        }
        const password = await this.secretStorage.get(`ingSql.password.${profileName}`);
        if (password === undefined) {
            vscode.window.showErrorMessage('Password not found.');
            return false;
        }
        try {
            const connectString = this.buildConnectString(profile);
            const conn = await oracledb_1.default.getConnection({
                user: profile.username,
                password: password,
                connectString: connectString,
            });
            await conn.execute('SELECT 1 FROM DUAL');
            await conn.close();
            vscode.window.showInformationMessage(`Connection "${profileName}" is working! ✓`);
            return true;
        }
        catch (err) {
            vscode.window.showErrorMessage(`Test failed: ${err.message}`);
            return false;
        }
    }
    async testConfig(profile, password) {
        if (!password) {
            throw new Error("Password is required for testing.");
        }
        const connectString = this.buildConnectString(profile);
        const attrs = {
            user: profile.username,
            password: password,
            connectString: connectString,
        };
        if (profile.role === 'SYSDBA') {
            attrs.privilege = oracledb_1.default.SYSDBA;
        }
        else if (profile.role === 'SYSOPER') {
            attrs.privilege = oracledb_1.default.SYSOPER;
        }
        const conn = await oracledb_1.default.getConnection(attrs);
        await conn.execute('SELECT 1 FROM DUAL');
        await conn.close();
        return true;
    }
    getConnection(profileName) {
        const name = profileName || this.activeConnectionName;
        if (!name) {
            return undefined;
        }
        return this.pools.get(name)?.pool;
    }
    getActiveProfile() {
        if (!this.activeConnectionName) {
            return undefined;
        }
        return this.getProfiles().find(p => p.name === this.activeConnectionName);
    }
    getActiveConnectionName() {
        return this.activeConnectionName;
    }
    isConnected(profileName) {
        return this.pools.has(profileName);
    }
    getProfilePassword(profileName) {
        return this.secretStorage.get(`ingSql.password.${profileName}`);
    }
    buildConnectString(profile) {
        if (profile.connectionType === 'connectionString' && profile.connectionString) {
            return profile.connectionString;
        }
        if (profile.connectionType === 'tns' && profile.tnsAlias) {
            return profile.tnsAlias;
        }
        if (profile.sid) {
            return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${profile.host})(PORT=${profile.port}))(CONNECT_DATA=(SID=${profile.sid})))`;
        }
        return `${profile.host}:${profile.port}/${profile.serviceName || 'ORCL'}`;
    }
    async closeAll() {
        for (const [name, entry] of this.pools) {
            try {
                await entry.pool.close(0);
            }
            catch { /* ignore */ }
        }
        this.pools.clear();
        this.activeConnectionName = undefined;
    }
    dispose() {
        this.closeAll();
        this._onDidChangeConnection.dispose();
        this._onDidUpdateProfiles.dispose();
    }
}
exports.ConnectionManager = ConnectionManager;
//# sourceMappingURL=connectionManager.js.map