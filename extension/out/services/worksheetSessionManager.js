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
exports.WorksheetSessionManager = void 0;
const vscode = __importStar(require("vscode"));
const oracledb = __importStar(require("oracledb"));
const connectionManager_js_1 = require("./connectionManager.js");
const oracleService_js_1 = require("./oracleService.js");
/**
 * Manages dedicated Oracle sessions per SQL worksheet.
 * Each open SQL document gets its own persistent connection,
 * matching Oracle SQL Developer behavior where each worksheet
 * has an isolated session (transactions, session variables, etc).
 */
class WorksheetSessionManager {
    static instance;
    /** docUri → { connection, connectionName, sessionId } */
    sessions = new Map();
    /** Status bar item showing session info */
    sessionStatusBar;
    disposables = [];
    constructor() {
        this.sessionStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
        this.sessionStatusBar.tooltip = 'Oracle Session for this worksheet';
        // Track active editor changes to update status bar
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(editor => {
            this.updateStatusBar(editor);
        }));
        // Release session when document closes
        this.disposables.push(vscode.workspace.onDidCloseTextDocument(doc => {
            this.releaseSession(doc.uri.toString());
        }));
        // Re-apply NLS settings to all active sessions when config changes
        this.disposables.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('ingSql.nls')) {
                this.reapplyNlsToAllSessions();
            }
        }));
        // Update status bar for current editor
        this.updateStatusBar(vscode.window.activeTextEditor);
    }
    static getInstance() {
        if (!WorksheetSessionManager.instance) {
            WorksheetSessionManager.instance = new WorksheetSessionManager();
        }
        return WorksheetSessionManager.instance;
    }
    /**
     * Get or create a dedicated session for the given document.
     * Returns a persistent Oracle connection bound to this worksheet.
     */
    async getSessionConnection(docUri, connectionName) {
        const connName = connectionName || connectionManager_js_1.ConnectionManager.getInstance().getActiveConnectionName();
        if (!connName) {
            throw new Error('No active connection. Please connect first.');
        }
        const existing = this.sessions.get(docUri);
        // If we have an existing session for the same connection, reuse it
        if (existing && existing.connectionName === connName) {
            try {
                // Verify the connection is still alive
                await existing.connection.execute('SELECT 1 FROM DUAL');
                return existing.connection;
            }
            catch {
                // Connection is dead, clean up and create new
                this.releaseSession(docUri);
            }
        }
        // If connection name changed, release old session
        if (existing && existing.connectionName !== connName) {
            this.releaseSession(docUri);
        }
        // Create a new dedicated connection
        const pool = connectionManager_js_1.ConnectionManager.getInstance().getConnection(connName);
        if (!pool) {
            throw new Error(`Connection "${connName}" not available.`);
        }
        const conn = await pool.getConnection();
        // Apply NLS settings once for this session
        await oracleService_js_1.OracleService.getInstance().applyNlsSettingsPublic(conn);
        // Get Oracle session ID for display
        let sessionId = '?';
        try {
            const result = await conn.execute('SELECT SYS_CONTEXT(\'USERENV\', \'SID\') FROM DUAL', {}, { outFormat: oracledb.OUT_FORMAT_ARRAY });
            if (result.rows && result.rows.length > 0) {
                sessionId = String(result.rows[0][0]);
            }
        }
        catch { /* non-critical */ }
        const session = {
            connection: conn,
            connectionName: connName,
            sessionId,
            createdAt: Date.now()
        };
        this.sessions.set(docUri, session);
        this.updateStatusBar(vscode.window.activeTextEditor);
        return conn;
    }
    /**
     * Release the session for a specific document.
     */
    releaseSession(docUri) {
        const session = this.sessions.get(docUri);
        if (session) {
            session.connection.close().catch(() => { });
            this.sessions.delete(docUri);
            this.updateStatusBar(vscode.window.activeTextEditor);
        }
    }
    /**
     * Re-apply NLS settings to all active sessions (called when config changes).
     */
    async reapplyNlsToAllSessions() {
        if (this.sessions.size === 0)
            return;
        const oracleService = oracleService_js_1.OracleService.getInstance();
        let count = 0;
        for (const [, session] of this.sessions) {
            try {
                await oracleService.applyNlsSettingsPublic(session.connection);
                count++;
            }
            catch (err) {
                console.warn(`Failed to reapply NLS to session ${session.sessionId}:`, err.message);
            }
        }
        if (count > 0) {
            vscode.window.showInformationMessage(`NLS settings updated on ${count} active session(s).`);
        }
    }
    /**
     * Release all sessions for a specific connection name (e.g., on disconnect).
     */
    releaseAllForConnection(connectionName) {
        for (const [uri, session] of this.sessions) {
            if (session.connectionName === connectionName) {
                session.connection.close().catch(() => { });
                this.sessions.delete(uri);
            }
        }
        this.updateStatusBar(vscode.window.activeTextEditor);
    }
    /**
     * Release all sessions.
     */
    releaseAll() {
        for (const [, session] of this.sessions) {
            session.connection.close().catch(() => { });
        }
        this.sessions.clear();
        this.sessionStatusBar.hide();
    }
    /**
     * Get session info for a document (for display purposes).
     */
    getSessionInfo(docUri) {
        return this.sessions.get(docUri);
    }
    updateStatusBar(editor) {
        if (!editor || editor.document.languageId !== 'oraclesql') {
            this.sessionStatusBar.hide();
            return;
        }
        const session = this.sessions.get(editor.document.uri.toString());
        if (session) {
            this.sessionStatusBar.text = `$(plug) SID: ${session.sessionId}`;
            this.sessionStatusBar.tooltip =
                `Oracle Session ID: ${session.sessionId}\n` +
                    `Connection: ${session.connectionName}\n` +
                    `Dedicated worksheet session`;
            this.sessionStatusBar.backgroundColor = undefined;
            this.sessionStatusBar.show();
        }
        else {
            this.sessionStatusBar.text = `$(plug) No Session`;
            this.sessionStatusBar.tooltip = 'No active session — execute a query to create one';
            this.sessionStatusBar.show();
        }
    }
    dispose() {
        this.releaseAll();
        this.sessionStatusBar.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
exports.WorksheetSessionManager = WorksheetSessionManager;
//# sourceMappingURL=worksheetSessionManager.js.map