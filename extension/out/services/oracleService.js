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
exports.OracleService = void 0;
const vscode = __importStar(require("vscode"));
const oracledb_1 = __importDefault(require("oracledb"));
const connectionManager_1 = require("./connectionManager");
// Force date/timestamp types to be fetched as strings so Oracle applies
// NLS session formatting (e.g. NLS_DATE_FORMAT set via ALTER SESSION).
// Without this, oracledb returns native JS Date objects that bypass NLS entirely.
//
// We use fetchTypeHandler (oracledb 6.x) because fetchAsString only accepts
// legacy constants (oracledb.DATE, oracledb.NUMBER) and throws NJS-021 if you
// pass DB_TYPE_* constants like DB_TYPE_DATE.
try {
    const dateTypes = new Set([
        oracledb_1.default.DB_TYPE_DATE,
        oracledb_1.default.DB_TYPE_TIMESTAMP,
        oracledb_1.default.DB_TYPE_TIMESTAMP_TZ,
        oracledb_1.default.DB_TYPE_TIMESTAMP_LTZ,
    ].filter(t => t !== undefined));
    oracledb_1.default.fetchTypeHandler = function (metaData) {
        if (dateTypes.has(metaData.dbType)) {
            return { type: oracledb_1.default.STRING };
        }
    };
    console.log(`[ING SQL] fetchTypeHandler configured for ${dateTypes.size} date/timestamp type(s)`);
}
catch (err) {
    console.warn('[ING SQL] Could not set fetchTypeHandler:', err.message);
}
// Fetch CLOBs as strings and BLOBs as buffers using legacy API (safe on all versions)
try {
    oracledb_1.default.fetchAsString = [oracledb_1.default.CLOB];
}
catch { /* skip */ }
try {
    oracledb_1.default.fetchAsBuffer = [oracledb_1.default.BLOB];
}
catch { /* skip */ }
class OracleService {
    static instance;
    static activeCursors = new Map();
    static thickModeInitialized = false;
    constructor() { }
    static getInstance() {
        if (!OracleService.instance) {
            OracleService.instance = new OracleService();
        }
        return OracleService.instance;
    }
    static isThickMode() {
        return OracleService.thickModeInitialized;
    }
    static initializeThickMode() {
        const clientPath = (process.env.ORACLE_CLIENT_PATH || '/usr/lib/oracle/23/client64/lib').trim();
        if (clientPath && clientPath.trim() !== '') {
            try {
                oracledb_1.default.initOracleClient({ libDir: clientPath.trim() });
                OracleService.thickModeInitialized = true;
                console.log(`Oracle Thick mode initialized successfully with libDir: ${clientPath}`);
            }
            catch (err) {
                OracleService.thickModeInitialized = false;
                console.error('Failed to initialize Oracle Thick mode:', err);
                vscode.window.showErrorMessage(`Failed to initialize Oracle Thick mode (Check your Oracle Client Path). Falling back to Thin mode. Error: ${err.message}`, { modal: false } // Change to true if it needs to be blocking, but usually an explicit action like "OK" keeps it visible long enough
                );
            }
        }
        else {
            console.log('Oracle Client Path not set. Falling back to Thin mode.');
        }
    }
    async getConnection(connectionName) {
        const connMgr = connectionManager_1.ConnectionManager.getInstance();
        const pool = connMgr.getConnection(connectionName);
        if (!pool) {
            throw new Error('No active connection. Please connect first.');
        }
        const conn = await pool.getConnection();
        await this.applyNlsSettings(conn);
        return conn;
    }
    /** Public wrapper so WorksheetSessionManager can apply NLS once per session */
    async applyNlsSettingsPublic(conn) {
        await this.applyNlsSettings(conn);
    }
    async applyNlsSettings(conn) {
        const config = vscode.workspace.getConfiguration('ingSql.nls');
        const language = config.get('language');
        const territory = config.get('territory');
        const dateFormat = config.get('dateFormat');
        const timestampFormat = config.get('timestampFormat');
        const timestampTzFormat = config.get('timestampTzFormat');
        const sql = [];
        if (language)
            sql.push(`NLS_LANGUAGE = '${language}'`);
        if (territory)
            sql.push(`NLS_TERRITORY = '${territory}'`);
        if (dateFormat)
            sql.push(`NLS_DATE_FORMAT = '${dateFormat}'`);
        if (timestampFormat)
            sql.push(`NLS_TIMESTAMP_FORMAT = '${timestampFormat}'`);
        if (timestampTzFormat)
            sql.push(`NLS_TIMESTAMP_TZ_FORMAT = '${timestampTzFormat}'`);
        if (sql.length > 0) {
            try {
                await conn.execute(`ALTER SESSION SET ${sql.join(' ')}`);
            }
            catch (err) {
                console.error('Failed to apply NLS settings:', err.message);
                // Don't fail the connection, just log it.
            }
        }
    }
    async executeQuery(sql, binds = {}, options = {}) {
        const conn = await this.getConnection(options.connectionName);
        const start = Date.now();
        try {
            const config = vscode.workspace.getConfiguration('ingSql');
            const maxRows = options.maxRows || config.get('resultGrid.maxRows', 100);
            const result = await conn.execute(sql, binds, {
                outFormat: oracledb_1.default.OUT_FORMAT_ARRAY,
                maxRows: maxRows + 1, // fetch one extra to detect "has more"
                autoCommit: false,
            });
            const columns = (result.metaData || []).map(m => ({
                name: m.name,
                dbType: this.getDbTypeName(m.dbType),
                nullable: m.nullable !== false,
                byteSize: m.byteSize,
                precision: m.precision,
                scale: m.scale,
            }));
            const rows = result.rows || [];
            const hasMore = rows.length > maxRows;
            if (hasMore) {
                rows.pop();
            }
            return {
                columns,
                rows: rows,
                rowCount: rows.length,
                statement: sql,
                executionTime: Date.now() - start,
                hasMore,
            };
        }
        finally {
            await conn.close();
        }
    }
    async executeCursor(sql, binds = {}, options = {}) {
        const isSessionConn = !!options.connection;
        const conn = options.connection || await this.getConnection(options.connectionName);
        const start = Date.now();
        try {
            const config = vscode.workspace.getConfiguration('ingSql');
            const batchSize = options.batchSize || config.get('resultGrid.maxRows', 100);
            const result = await conn.execute(sql, binds, {
                outFormat: oracledb_1.default.OUT_FORMAT_ARRAY,
                resultSet: true,
                autoCommit: false,
            });
            if (!result.resultSet) {
                throw new Error("Query did not return a ResultSet.");
            }
            const rs = result.resultSet;
            const rows = (await rs.getRows(batchSize));
            const columns = (result.metaData || []).map(m => ({
                name: m.name,
                dbType: this.getDbTypeName(m.dbType),
                nullable: m.nullable !== false,
                byteSize: m.byteSize,
                precision: m.precision,
                scale: m.scale,
            }));
            // If rows.length === batchSize, there might be more rows.
            const hasMore = rows.length === batchSize;
            const executionTime = Date.now() - start;
            if (hasMore) {
                const cursorId = 'cursor_' + Math.random().toString(36).substring(2, 11);
                // For session connections, store rs but don't track conn (session manager owns it)
                OracleService.activeCursors.set(cursorId, { rs, conn, sql, isSessionConn });
                return {
                    columns, rows, rowCount: rows.length, statement: sql, executionTime, hasMore, cursorId
                };
            }
            else {
                await rs.close();
                if (!isSessionConn) {
                    await conn.close();
                }
                return {
                    columns, rows, rowCount: rows.length, statement: sql, executionTime, hasMore: false
                };
            }
        }
        catch (err) {
            if (!isSessionConn) {
                await conn.close();
            }
            throw err;
        }
    }
    async fetchMoreRows(cursorId, batchSize) {
        const cursor = OracleService.activeCursors.get(cursorId);
        if (!cursor) {
            throw new Error('ResultSet cursor not found or expired.');
        }
        const rows = (await cursor.rs.getRows(batchSize));
        const hasMore = rows.length === batchSize;
        if (!hasMore) {
            await this.closeCursor(cursorId);
        }
        return { rows, hasMore };
    }
    async closeCursor(cursorId) {
        const cursor = OracleService.activeCursors.get(cursorId);
        if (cursor) {
            try {
                await cursor.rs.close();
            }
            catch (e) { }
            // Only close the connection if it's NOT a session-managed connection
            if (!cursor.isSessionConn) {
                try {
                    await cursor.conn.close();
                }
                catch (e) { }
            }
            OracleService.activeCursors.delete(cursorId);
        }
    }
    /**
     * Stream query results in batches for export.
     * Instead of accumulating all rows in memory, this calls onBatch() for each chunk,
     * allowing the caller to write directly to file and discard the batch.
     * Returns the total number of rows streamed.
     */
    async executeExportStream(sql, connectionName, batchSize, onColumns, onBatch, isCancelled) {
        const conn = await this.getConnection(connectionName);
        try {
            const result = await conn.execute(sql, {}, {
                outFormat: oracledb_1.default.OUT_FORMAT_ARRAY,
                resultSet: true,
                prefetchRows: batchSize,
            });
            if (!result.resultSet) {
                throw new Error('Query did not return a ResultSet.');
            }
            const rs = result.resultSet;
            const columns = (result.metaData || []).map(m => ({
                name: m.name,
                dbType: this.getDbTypeName(m.dbType),
                nullable: m.nullable !== false,
                byteSize: m.byteSize,
                precision: m.precision,
                scale: m.scale,
            }));
            onColumns(columns);
            let totalRows = 0;
            let batchNum = 0;
            while (true) {
                if (isCancelled?.()) {
                    break;
                }
                const rows = (await rs.getRows(batchSize));
                if (rows.length === 0) {
                    break;
                }
                batchNum++;
                totalRows += rows.length;
                await onBatch(rows, batchNum, totalRows);
                if (rows.length < batchSize) {
                    break; // Last batch
                }
            }
            await rs.close();
            return totalRows;
        }
        finally {
            await conn.close();
        }
    }
    async executeNonQuery(sql, binds = {}, options = {}) {
        const isSessionConn = !!options.connection;
        const conn = options.connection || await this.getConnection(options.connectionName);
        const start = Date.now();
        try {
            const config = vscode.workspace.getConfiguration('ingSql');
            const autoCommit = options.autoCommit !== undefined
                ? options.autoCommit
                : config.get('autoCommit', false);
            const result = await conn.execute(sql, binds, { autoCommit });
            return {
                rowsAffected: result.rowsAffected || 0,
                statement: sql,
                executionTime: Date.now() - start,
            };
        }
        finally {
            if (!isSessionConn) {
                await conn.close();
            }
        }
    }
    async commit(connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            await conn.execute('COMMIT');
        }
        finally {
            await conn.close();
        }
    }
    async executeMany(sql, binds, options = {}) {
        const conn = await this.getConnection(options.connectionName);
        try {
            const config = vscode.workspace.getConfiguration('ingSql');
            const autoCommit = options.autoCommit !== undefined
                ? options.autoCommit
                : config.get('autoCommit', false);
            await conn.executeMany(sql, binds, { autoCommit });
        }
        finally {
            await conn.close();
        }
    }
    async rollback(connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            await conn.execute('ROLLBACK');
        }
        finally {
            await conn.close();
        }
    }
    async searchObjects(query, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const types = ['TABLE', 'VIEW', 'MATERIALIZED VIEW', 'FUNCTION', 'PROCEDURE', 'TRIGGER', 'PACKAGE', 'SEQUENCE', 'SYNONYM'];
            const sql = `
                SELECT OWNER, OBJECT_NAME, OBJECT_TYPE, STATUS
                FROM ALL_OBJECTS
                WHERE (UPPER(OBJECT_NAME) LIKE UPPER(:query) OR UPPER(OWNER) LIKE UPPER(:query))
                AND OBJECT_TYPE IN (${types.map(t => `'${t}'`).join(',')})
                AND ROWNUM <= 100
                ORDER BY OBJECT_NAME
            `;
            const result = await conn.execute(sql, { query: `%${query}%` }, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []).map(row => ({
                owner: row.OWNER,
                name: row.OBJECT_NAME,
                type: row.OBJECT_TYPE,
                status: row.STATUS
            }));
        }
        finally {
            await conn.close();
        }
    }
    async getSchemaObjects(objectType, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const sql = `
                SELECT OWNER, OBJECT_NAME, OBJECT_TYPE, STATUS, CREATED, LAST_DDL_TIME
                FROM ALL_OBJECTS
                WHERE OWNER = USER
                AND OBJECT_TYPE = :type
                ORDER BY OBJECT_NAME
            `;
            const result = await conn.execute(sql, { type: objectType }, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []).map(row => ({
                owner: row.OWNER,
                name: row.OBJECT_NAME,
                type: row.OBJECT_TYPE,
                status: row.STATUS,
                created: row.CREATED,
                lastDdlTime: row.LAST_DDL_TIME,
            }));
        }
        finally {
            await conn.close();
        }
    }
    /**
     * List all schemas the user has access to (excluding their own).
     */
    async getAccessibleSchemas(connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            // Using ALL_USERS instead of ALL_OBJECTS for massive performance gain.
            // ALL_OBJECTS forces permission evaluation on millions of DB rows.
            const sql = `
                SELECT USERNAME
                FROM ALL_USERS
                WHERE USERNAME != USER
                AND USERNAME NOT IN (
                    'SYS', 'SYSTEM', 'DBSNMP', 'OUTLN', 'XDB', 'WMSYS', 'CTXSYS', 'MDSYS', 
                    'ORDDATA', 'ORDSYS', 'OLAPSYS', 'EXFSYS', 'APPQOSSYS', 'DBSFWUSER', 
                    'GSMADMIN_INTERNAL', 'LBACSYS', 'OJVMSYS', 'DVF', 'DVSYS', 'AUDSYS', 
                    'REMOTE_SCHEDULER_AGENT', 'ORACLE_OCM', 'DIP', 'ANONYMOUS', 'XS$NULL', 
                    'OICSA', 'GGSYS', 'GSMCATUSER', 'MDDATA', 'SYSBACKUP', 'SYSDG', 
                    'SYSKM', 'SYSMAC', 'SYS$UMF', 'C##CJD', 'GSMUSER'
                )
                ORDER BY USERNAME
            `;
            const result = await conn.execute(sql, {}, {
                outFormat: oracledb_1.default.OUT_FORMAT_ARRAY
            });
            return (result.rows || []).map(row => row[0]);
        }
        finally {
            await conn.close();
        }
    }
    /**
     * List objects of a given type owned by a specific schema.
     * For PROCEDURE/FUNCTION/PACKAGE: uses ALL_SOURCE for broadest visibility,
     * since ALL_OBJECTS may not show objects the user lacks direct grants on.
     */
    async getSchemaObjectsForOwner(objectType, owner, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            let sql;
            let binds;
            if (['PROCEDURE', 'FUNCTION', 'PACKAGE'].includes(objectType)) {
                // ALL_SOURCE has the broadest visibility for PL/SQL objects.
                // It shows source for any object the user can see, regardless of grants.
                // We use DISTINCT NAME since ALL_SOURCE has one row per source line.
                sql = `
                    SELECT DISTINCT s.OWNER, s.NAME AS OBJECT_NAME, s.TYPE AS OBJECT_TYPE,
                           NVL(
                               (SELECT ao.STATUS FROM ALL_OBJECTS ao
                                WHERE ao.OWNER = s.OWNER AND ao.OBJECT_NAME = s.NAME
                                AND ao.OBJECT_TYPE = s.TYPE AND ROWNUM = 1),
                               'VALID'
                           ) AS STATUS
                    FROM ALL_SOURCE s
                    WHERE s.OWNER = :owner
                    AND s.TYPE = :type
                    ORDER BY s.NAME
                `;
                binds = { owner, type: objectType };
            }
            else {
                sql = `
                    SELECT OWNER, OBJECT_NAME, OBJECT_TYPE, STATUS, CREATED, LAST_DDL_TIME
                    FROM ALL_OBJECTS
                    WHERE OWNER = :owner
                    AND OBJECT_TYPE = :type
                    ORDER BY OBJECT_NAME
                `;
                binds = { owner, type: objectType };
            }
            const result = await conn.execute(sql, binds, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []).map(row => ({
                owner: row.OWNER,
                name: row.OBJECT_NAME,
                type: row.OBJECT_TYPE,
                status: row.STATUS || 'VALID',
                created: row.CREATED,
                lastDdlTime: row.LAST_DDL_TIME,
            }));
        }
        finally {
            await conn.close();
        }
    }
    async getTableColumns(tableName, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const sql = `
                SELECT c.COLUMN_NAME, c.DATA_TYPE, c.DATA_LENGTH, c.DATA_PRECISION,
                       c.DATA_SCALE, c.NULLABLE, c.DATA_DEFAULT, c.COLUMN_ID,
                       cc.COMMENTS
                FROM ALL_TAB_COLUMNS c
                LEFT JOIN ALL_COL_COMMENTS cc
                    ON cc.OWNER = c.OWNER AND cc.TABLE_NAME = c.TABLE_NAME
                    AND cc.COLUMN_NAME = c.COLUMN_NAME
                WHERE c.OWNER = USER AND c.TABLE_NAME = :tableName
                ORDER BY c.COLUMN_ID
            `;
            const result = await conn.execute(sql, { tableName }, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []).map(row => ({
                name: row.COLUMN_NAME,
                dataType: row.DATA_TYPE,
                dataLength: row.DATA_LENGTH,
                dataPrecision: row.DATA_PRECISION,
                dataScale: row.DATA_SCALE,
                nullable: row.NULLABLE,
                defaultValue: row.DATA_DEFAULT,
                columnId: row.COLUMN_ID,
                comments: row.COMMENTS,
            }));
        }
        finally {
            await conn.close();
        }
    }
    async getConstraints(tableName, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const sql = `
                SELECT c.CONSTRAINT_NAME, c.CONSTRAINT_TYPE, c.STATUS, c.DELETE_RULE,
                       c.R_CONSTRAINT_NAME,
                       LISTAGG(cc.COLUMN_NAME, ', ') WITHIN GROUP (ORDER BY cc.POSITION) AS COLUMNS,
                       r.TABLE_NAME AS REF_TABLE
                FROM ALL_CONSTRAINTS c
                JOIN ALL_CONS_COLUMNS cc ON cc.CONSTRAINT_NAME = c.CONSTRAINT_NAME AND cc.OWNER = c.OWNER
                LEFT JOIN ALL_CONSTRAINTS r ON r.CONSTRAINT_NAME = c.R_CONSTRAINT_NAME AND r.OWNER = c.OWNER
                WHERE c.OWNER = USER AND c.TABLE_NAME = :tableName
                GROUP BY c.CONSTRAINT_NAME, c.CONSTRAINT_TYPE, c.STATUS, c.DELETE_RULE,
                         c.R_CONSTRAINT_NAME, r.TABLE_NAME
                ORDER BY c.CONSTRAINT_TYPE, c.CONSTRAINT_NAME
            `;
            const result = await conn.execute(sql, { tableName }, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []).map(row => ({
                name: row.CONSTRAINT_NAME,
                type: this.constraintTypeName(row.CONSTRAINT_TYPE),
                columns: row.COLUMNS,
                refTable: row.REF_TABLE,
                deleteRule: row.DELETE_RULE,
                status: row.STATUS,
            }));
        }
        finally {
            await conn.close();
        }
    }
    async getIndexes(tableName, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const sql = `
                SELECT i.INDEX_NAME, i.INDEX_TYPE, i.UNIQUENESS, i.STATUS, i.TABLESPACE_NAME,
                       LISTAGG(ic.COLUMN_NAME, ', ') WITHIN GROUP (ORDER BY ic.COLUMN_POSITION) AS COLUMNS
                FROM ALL_INDEXES i
                JOIN ALL_IND_COLUMNS ic ON ic.INDEX_NAME = i.INDEX_NAME AND ic.INDEX_OWNER = i.OWNER
                WHERE i.OWNER = USER AND i.TABLE_NAME = :tableName
                GROUP BY i.INDEX_NAME, i.INDEX_TYPE, i.UNIQUENESS, i.STATUS, i.TABLESPACE_NAME
                ORDER BY i.INDEX_NAME
            `;
            const result = await conn.execute(sql, { tableName }, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []).map(row => ({
                name: row.INDEX_NAME,
                type: row.INDEX_TYPE,
                uniqueness: row.UNIQUENESS,
                columns: row.COLUMNS,
                status: row.STATUS,
                tablespace: row.TABLESPACE_NAME,
            }));
        }
        finally {
            await conn.close();
        }
    }
    async getGrants(tableName, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const sql = `
                SELECT GRANTEE, PRIVILEGE, GRANTABLE, GRANTOR
                FROM ALL_TAB_PRIVS
                WHERE TABLE_NAME = :tableName AND TABLE_SCHEMA = USER
                ORDER BY GRANTEE, PRIVILEGE
            `;
            const result = await conn.execute(sql, { tableName }, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []);
        }
        finally {
            await conn.close();
        }
    }
    async getTriggers(tableName, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const sql = `
                SELECT TRIGGER_NAME, TRIGGER_TYPE, TRIGGERING_EVENT, STATUS, DESCRIPTION
                FROM ALL_TRIGGERS
                WHERE OWNER = USER AND TABLE_NAME = :tableName
                ORDER BY TRIGGER_NAME
            `;
            const result = await conn.execute(sql, { tableName }, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []);
        }
        finally {
            await conn.close();
        }
    }
    async getObjectSource(objectName, objectType, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const sql = `
                SELECT TEXT FROM ALL_SOURCE
                WHERE OWNER = USER AND NAME = :name AND TYPE = :type
                ORDER BY LINE
            `;
            const result = await conn.execute(sql, { name: objectName, type: objectType }, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []).map(r => r.TEXT).join('');
        }
        finally {
            await conn.close();
        }
    }
    async getObjectDDL(objectName, objectType, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const sql = `SELECT DBMS_METADATA.GET_DDL(:type, :name, USER) AS DDL FROM DUAL`;
            const result = await conn.execute(sql, { type: objectType, name: objectName }, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT,
                fetchInfo: { DDL: { type: oracledb_1.default.STRING } }
            });
            const rows = (result.rows || []);
            return rows.length > 0 ? rows[0].DDL : '';
        }
        finally {
            await conn.close();
        }
    }
    async getExplainPlan(sql, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const planId = `plan_${Date.now()}`;
            await conn.execute(`EXPLAIN PLAN SET STATEMENT_ID = '${planId}' FOR ${sql}`);
            const result = await conn.execute(`SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', '${planId}', 'ALL'))`, {}, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
            return (result.rows || []).map(r => r.PLAN_TABLE_OUTPUT).join('\n');
        }
        finally {
            await conn.close();
        }
    }
    async getSequences(connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const sql = `
                SELECT SEQUENCE_NAME, MIN_VALUE, MAX_VALUE, INCREMENT_BY,
                       LAST_NUMBER, CACHE_SIZE, CYCLE_FLAG, ORDER_FLAG
                FROM ALL_SEQUENCES WHERE SEQUENCE_OWNER = USER
                ORDER BY SEQUENCE_NAME
            `;
            const result = await conn.execute(sql, {}, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []);
        }
        finally {
            await conn.close();
        }
    }
    async getDbLinks(connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const sql = `
                SELECT DB_LINK, USERNAME, HOST, CREATED
                FROM ALL_DB_LINKS WHERE OWNER = USER
                ORDER BY DB_LINK
            `;
            const result = await conn.execute(sql, {}, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []);
        }
        finally {
            await conn.close();
        }
    }
    async getSessions(connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const sql = `
                SELECT SID, SERIAL#, USERNAME, STATUS, OSUSER, MACHINE,
                       PROGRAM, SQL_ID, LOGON_TIME, BLOCKING_SESSION,
                       EVENT, WAIT_CLASS, SECONDS_IN_WAIT
                FROM V$SESSION
                WHERE TYPE = 'USER'
                ORDER BY USERNAME, SID
            `;
            const result = await conn.execute(sql, {}, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []);
        }
        catch {
            return [];
        }
        finally {
            await conn.close();
        }
    }
    async killSession(sid, serial, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            await conn.execute(`ALTER SYSTEM KILL SESSION '${sid},${serial}' IMMEDIATE`);
        }
        finally {
            await conn.close();
        }
    }
    async getDependencies(objectName, connectionName, schemaName) {
        const conn = await this.getConnection(connectionName);
        try {
            // Use provided schema or default to current user
            const ownerFilter = schemaName || 'USER';
            const ownerBind = schemaName ? { name: objectName, owner: schemaName } : { name: objectName };
            const ownerWhere = schemaName ? 'OWNER = :owner' : 'OWNER = USER';
            // Objects this object depends on
            const depsSql = `
                SELECT REFERENCED_OWNER AS OWNER, 
                       REFERENCED_NAME AS NAME, 
                       REFERENCED_TYPE AS TYPE, 
                       DEPENDENCY_TYPE
                FROM ALL_DEPENDENCIES
                WHERE ${ownerWhere} AND NAME = :name
                ORDER BY TYPE, NAME
            `;
            const depsResult = await conn.execute(depsSql, ownerBind, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            // Objects that reference this object
            const refSql = `
                SELECT OWNER, 
                       NAME, 
                       TYPE, 
                       DEPENDENCY_TYPE
                FROM ALL_DEPENDENCIES
                WHERE ${schemaName ? 'REFERENCED_OWNER = :owner' : 'REFERENCED_OWNER = USER'} AND REFERENCED_NAME = :name
                ORDER BY TYPE, NAME
            `;
            const refResult = await conn.execute(refSql, ownerBind, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return {
                dependencies: (depsResult.rows || []),
                referencedBy: (refResult.rows || [])
            };
        }
        finally {
            await conn.close();
        }
    }
    async getPrimaryKeyColumns(tableName, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const sql = `
                SELECT cc.COLUMN_NAME
                FROM ALL_CONSTRAINTS c
                JOIN ALL_CONS_COLUMNS cc ON cc.CONSTRAINT_NAME = c.CONSTRAINT_NAME AND cc.OWNER = c.OWNER
                WHERE c.OWNER = USER AND c.TABLE_NAME = :tableName AND c.CONSTRAINT_TYPE = 'P'
                ORDER BY cc.POSITION
            `;
            const result = await conn.execute(sql, { tableName }, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT
            });
            return (result.rows || []).map(r => r.COLUMN_NAME);
        }
        finally {
            await conn.close();
        }
    }
    getDbTypeName(dbType) {
        if (dbType === undefined) {
            return 'UNKNOWN';
        }
        const typeMap = {
            [oracledb_1.default.DB_TYPE_VARCHAR]: 'VARCHAR2',
            [oracledb_1.default.DB_TYPE_NVARCHAR]: 'NVARCHAR2',
            [oracledb_1.default.DB_TYPE_CHAR]: 'CHAR',
            [oracledb_1.default.DB_TYPE_NCHAR]: 'NCHAR',
            [oracledb_1.default.DB_TYPE_NUMBER]: 'NUMBER',
            [oracledb_1.default.DB_TYPE_DATE]: 'DATE',
            [oracledb_1.default.DB_TYPE_TIMESTAMP]: 'TIMESTAMP',
            [oracledb_1.default.DB_TYPE_TIMESTAMP_TZ]: 'TIMESTAMP WITH TIME ZONE',
            [oracledb_1.default.DB_TYPE_TIMESTAMP_LTZ]: 'TIMESTAMP WITH LOCAL TIME ZONE',
            [oracledb_1.default.DB_TYPE_CLOB]: 'CLOB',
            [oracledb_1.default.DB_TYPE_NCLOB]: 'NCLOB',
            [oracledb_1.default.DB_TYPE_BLOB]: 'BLOB',
            [oracledb_1.default.DB_TYPE_RAW]: 'RAW',
            [oracledb_1.default.DB_TYPE_LONG]: 'LONG',
            [oracledb_1.default.DB_TYPE_LONG_RAW]: 'LONG RAW',
            [oracledb_1.default.DB_TYPE_BINARY_FLOAT]: 'BINARY_FLOAT',
            [oracledb_1.default.DB_TYPE_BINARY_DOUBLE]: 'BINARY_DOUBLE',
            [oracledb_1.default.DB_TYPE_BINARY_INTEGER]: 'BINARY_INTEGER',
            [oracledb_1.default.DB_TYPE_ROWID]: 'ROWID',
            [oracledb_1.default.DB_TYPE_BOOLEAN]: 'BOOLEAN',
            [oracledb_1.default.DB_TYPE_INTERVAL_DS]: 'INTERVAL DAY TO SECOND',
            [oracledb_1.default.DB_TYPE_INTERVAL_YM]: 'INTERVAL YEAR TO MONTH',
            [oracledb_1.default.DB_TYPE_JSON]: 'JSON',
        };
        return typeMap[dbType] || `TYPE_${dbType}`;
    }
    constraintTypeName(type) {
        const map = {
            'P': 'PRIMARY KEY',
            'U': 'UNIQUE',
            'R': 'FOREIGN KEY',
            'C': 'CHECK',
            'V': 'WITH CHECK OPTION',
            'O': 'WITH READ ONLY',
        };
        return map[type] || type;
    }
}
exports.OracleService = OracleService;
//# sourceMappingURL=oracleService.js.map