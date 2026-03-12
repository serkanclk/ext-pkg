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
exports.DbmsOutputProvider = void 0;
const vscode = __importStar(require("vscode"));
const oracledb_1 = __importDefault(require("oracledb"));
const connectionManager_1 = require("../services/connectionManager");
class DbmsOutputProvider {
    outputChannel;
    polling = false;
    pollInterval;
    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('DBMS Output', 'oraclesql');
    }
    async enableForConnection(connectionName) {
        const config = vscode.workspace.getConfiguration('ingSql');
        if (!config.get('dbmsOutput.enabled', true)) {
            return;
        }
        const connMgr = connectionManager_1.ConnectionManager.getInstance();
        const pool = connMgr.getConnection(connectionName);
        if (!pool) {
            return;
        }
        try {
            const conn = await pool.getConnection();
            const bufferSize = config.get('dbmsOutput.bufferSize', 1000000);
            await conn.execute(`BEGIN DBMS_OUTPUT.ENABLE(${bufferSize}); END;`);
            await conn.close();
        }
        catch { /* ignore */ }
    }
    async fetchOutput(connectionName) {
        const connMgr = connectionManager_1.ConnectionManager.getInstance();
        const pool = connMgr.getConnection(connectionName);
        if (!pool) {
            return;
        }
        try {
            const conn = await pool.getConnection();
            try {
                const result = await conn.execute(`DECLARE
                        v_line VARCHAR2(32767);
                        v_status INTEGER;
                     BEGIN
                        LOOP
                            DBMS_OUTPUT.GET_LINE(v_line, v_status);
                            EXIT WHEN v_status != 0;
                            :output := :output || v_line || CHR(10);
                        END LOOP;
                     END;`, {
                    output: { dir: oracledb_1.default.BIND_INOUT, type: oracledb_1.default.STRING, val: '', maxSize: 1000000 }
                });
                const output = result.outBinds?.output;
                if (output && output.trim()) {
                    this.outputChannel.appendLine(output.trimEnd());
                    this.outputChannel.show(true);
                }
            }
            finally {
                await conn.close();
            }
        }
        catch { /* ignore */ }
    }
    show() {
        this.outputChannel.show(true);
    }
    clear() {
        this.outputChannel.clear();
    }
    dispose() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        this.outputChannel.dispose();
    }
}
exports.DbmsOutputProvider = DbmsOutputProvider;
//# sourceMappingURL=dbmsOutputProvider.js.map