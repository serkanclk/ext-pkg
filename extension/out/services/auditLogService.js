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
exports.AuditLogService = void 0;
const vscode = __importStar(require("vscode"));
const os = __importStar(require("os"));
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const url_1 = require("url");
const connectionManager_1 = require("./connectionManager");
class AuditLogService {
    static instance;
    static getInstance() {
        if (!AuditLogService.instance) {
            AuditLogService.instance = new AuditLogService();
        }
        return AuditLogService.instance;
    }
    getApiEndpoint() {
        const config = vscode.workspace.getConfiguration('ingSql.auditLog');
        return config.get('apiEndpoint', 'http://localhost:5000').trim();
    }
    sendApiRequest(entry) {
        const endpoint = this.getApiEndpoint();
        if (!endpoint) {
            return;
        }
        try {
            // Append the correct path per the contract
            let targetUrlStr = endpoint;
            if (targetUrlStr.endsWith('/')) {
                targetUrlStr = targetUrlStr.slice(0, -1);
            }
            targetUrlStr += '/api/v1/export-audit';
            const targetUrl = new url_1.URL(targetUrlStr);
            const payload = JSON.stringify(entry);
            const options = {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                path: targetUrl.pathname + targetUrl.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };
            const client = targetUrl.protocol === 'https:' ? https : http;
            const req = client.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        console.warn(`[AuditLog] API returned ${res.statusCode}: ${data}`);
                        vscode.window.showWarningMessage(`Audit log API returned non-200 status: ${res.statusCode}`);
                    }
                });
            });
            req.on('error', (err) => {
                console.error('[AuditLog] Network error:', err.message);
                vscode.window.showWarningMessage(`Audit log API network error: ${err.message}`);
            });
            req.setTimeout(5000, () => {
                req.destroy();
                console.warn('[AuditLog] Request timeout');
                vscode.window.showWarningMessage('Audit log API request timed out');
            });
            req.write(payload);
            req.end();
        }
        catch (err) {
            console.error('Failed to prepare audit log request:', err.message);
        }
    }
    async logSuccessfulExport(exportResult, exportSource, connectionName, schemaName, objectName, sqlText) {
        const config = vscode.workspace.getConfiguration('ingSql.auditLog');
        if (!config.get('enabled', true)) {
            return;
        }
        const connMgr = connectionManager_1.ConnectionManager.getInstance();
        const profile = connMgr.getProfiles().find(p => p.name === connectionName);
        const username = profile?.username || 'UNKNOWN';
        const entry = {
            timestamp: new Date().toISOString(),
            username,
            machineName: os.hostname(),
            connectionName,
            schemaName,
            objectName: objectName || '',
            sqlText: sqlText || '',
            exportFormat: exportResult.format.toUpperCase(),
            rowCount: exportResult.rowCount,
            filePath: exportResult.filePath,
            fileSizeBytes: exportResult.fileSize,
            exportSource,
            status: 'SUCCESS',
            errorMessage: '',
            durationMs: exportResult.durationMs,
        };
        this.sendApiRequest(entry);
    }
    async logFailedExport(format, exportSource, connectionName, schemaName, objectName, sqlText, errorMessage) {
        const config = vscode.workspace.getConfiguration('ingSql.auditLog');
        if (!config.get('enabled', true)) {
            return;
        }
        const connMgr = connectionManager_1.ConnectionManager.getInstance();
        const profile = connMgr.getProfiles().find(p => p.name === connectionName);
        const username = profile?.username || 'UNKNOWN';
        const entry = {
            timestamp: new Date().toISOString(),
            username,
            machineName: os.hostname(),
            connectionName,
            schemaName,
            objectName: objectName || '',
            sqlText: sqlText || '',
            exportFormat: format.toUpperCase(),
            rowCount: 0,
            filePath: '',
            fileSizeBytes: 0,
            exportSource,
            status: 'FAILED',
            errorMessage,
            durationMs: 0,
        };
        this.sendApiRequest(entry);
    }
    dispose() {
        // Nothing to dispose
    }
}
exports.AuditLogService = AuditLogService;
//# sourceMappingURL=auditLogService.js.map