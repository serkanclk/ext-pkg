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
const stream_1 = require("stream");
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
        // XMLType: do NOT specify { type } — both oracledb.STRING (VARCHAR) and oracledb.CLOB
        // trigger NJS-119: "conversion from DB_TYPE_XMLTYPE to ... not supported".
        // Instead, use a converter-only return: no type conversion is requested, OCI fetches
        // the column in its native form. The driver passes the XMLType as a Promise of the
        // XML string to the converter — we return it as-is so resolveLobs() can await it.
        //
        // Limitation: XMLATTRIBUTES(... AS "xmlns:xsi") / XMLNAMESPACES → OCI XmlSave()
        // resolves the Promise to empty string. No driver-level fix exists; use
        // XMLSERIALIZE(... AS CLOB) or .getClobVal() in SQL — those return DB_TYPE_CLOB,
        // skip fetchTypeHandler, and are read fully via getData() in resolveLobs().
        const xmlTypeId = oracledb_1.default.DB_TYPE_XMLTYPE;
        if (xmlTypeId !== undefined && metaData.dbType === xmlTypeId) {
            return {
                converter: (val) => {
                    if (val === null || val === undefined) {
                        return null;
                    }
                    if (typeof val === 'string') {
                        return val;
                    }
                    // Return as-is: the driver provides a Promise for the XML string.
                    // resolveLobs() will await it.
                    return val;
                }
            };
        }
    };
    console.log(`[ING SQL] fetchTypeHandler configured for ${dateTypes.size} date/timestamp type(s)`);
}
catch (err) {
    console.warn('[ING SQL] Could not set fetchTypeHandler:', err.message);
}
// Fetch BLOBs as Buffers. CLOBs and XMLType are intentionally NOT in fetchAsString —
// the legacy OCI prefetch mechanism returns empty string for XMLType-derived CLOBs with
// namespace prefix attributes (xmlns:xsi). CLOBs and XMLType Lobs are instead read via
// Lob.getData() in resolveLobs(), using the OCI CLOB-backed path which handles all variants.
try {
    oracledb_1.default.fetchAsBuffer = [oracledb_1.default.BLOB];
}
catch { /* skip */ }
class OracleService {
    static instance;
    static activeCursors = new Map();
    /** Connection currently executing a query — used for cancellation via break() */
    static activeRunningConn = null;
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
    /**
     * Cancel the currently running query by calling connection.break().
     * This causes the pending execute() to throw ORA-01013.
     */
    static async cancelRunningQuery() {
        if (OracleService.activeRunningConn) {
            try {
                await OracleService.activeRunningConn.break();
                return true;
            }
            catch (err) {
                console.warn('[ING SQL] Failed to cancel query:', err.message);
            }
        }
        return false;
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
            OracleService.activeRunningConn = conn;
            const result = await conn.execute(sql, binds, {
                outFormat: oracledb_1.default.OUT_FORMAT_ARRAY,
                resultSet: true,
                autoCommit: false,
            });
            OracleService.activeRunningConn = null;
            if (!result.resultSet) {
                throw new Error("Query did not return a ResultSet.");
            }
            const rs = result.resultSet;
            const rows = (await rs.getRows(batchSize));
            await this.resolveLobs(rows);
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
            OracleService.activeRunningConn = null;
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
        await this.resolveLobs(rows);
        const hasMore = rows.length === batchSize;
        if (!hasMore) {
            await this.closeCursor(cursorId);
        }
        return { rows, hasMore };
    }
    /**
     * Read any oracledb Lob objects remaining in rows after fetch.
     * XMLType columns arrive here as Lob objects (CLOB-backed) — they are NOT
     * pre-converted to string because the OCI VARCHAR2 path silently returns empty
     * for XMLType values with namespace prefix attributes (xmlns:xsi, xsi:*).
     * getData() reads via the OCILobRead2 CLOB path which handles all XML variants.
     */
    async resolveLobs(rows) {
        const promises = [];
        for (const row of rows) {
            for (let i = 0; i < row.length; i++) {
                const val = row[i];
                if (val !== null && val !== undefined && typeof val === 'object') {
                    if (typeof val.then === 'function') {
                        // Promise: XMLType converter passes the driver's async Promise through.
                        // Await it to get the XML string (OCI XmlSave result).
                        const cellIndex = i;
                        promises.push(Promise.resolve(val)
                            .then((data) => {
                            row[cellIndex] = (data === null || data === undefined) ? null
                                : typeof data === 'string' ? data : String(data);
                        })
                            .catch((e) => {
                            console.error(`[ING SQL] resolveLobs: XMLType Promise failed at col ${cellIndex}:`, e?.message);
                            row[cellIndex] = '[XMLType error: ' + (e?.message || 'unknown') + ']';
                        }));
                    }
                    else if (typeof val.getData === 'function') {
                        // Lob object (CLOB, NCLOB): read via getData() (OCILobRead2)
                        const cellIndex = i;
                        promises.push(val.getData()
                            .then((data) => { row[cellIndex] = data; })
                            .catch((e) => {
                            console.error(`[ING SQL] resolveLobs: getData() failed at col ${cellIndex}:`, e?.message);
                            row[cellIndex] = '[LOB read error: ' + (e?.message || 'unknown') + ']';
                        }));
                    }
                    else if (typeof val.pipe === 'function') {
                        // Readable stream: consume into a string buffer (fallback for stream-mode Lobs)
                        const cellIndex = i;
                        promises.push(new Promise((resolve) => {
                            const chunks = [];
                            const stream = val;
                            stream.setEncoding('utf8');
                            stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                            stream.on('end', () => {
                                row[cellIndex] = Buffer.concat(chunks).toString('utf8');
                                resolve();
                            });
                            stream.on('error', (e) => {
                                console.error(`[ING SQL] resolveLobs: stream error at col ${cellIndex}:`, e?.message);
                                row[cellIndex] = '[LOB stream error: ' + (e?.message || 'unknown') + ']';
                                resolve();
                            });
                        }));
                    }
                    else {
                        // Non-Lob, non-stream object that cannot be JSON serialized.
                        // Last resort: stringify to prevent postMessage structured-clone failure.
                        row[i] = String(val);
                    }
                }
            }
        }
        if (promises.length > 0) {
            await Promise.all(promises);
        }
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
     * Stream query results using oracledb's queryStream for maximum performance.
     * This follows Node.js Readable stream patterns, allowing the caller to pipe data.
     * Returns a Node.js Readable stream that emits rows as arrays.
     */
    async executeExportQueryStream(sql, connectionName, onColumns) {
        const conn = await this.getConnection(connectionName);
        // Use queryStream for true event-based streaming
        // queryStream exists at runtime but may not be in older type defs
        const stream = conn.queryStream(sql, {}, {
            outFormat: oracledb_1.default.OUT_FORMAT_ARRAY,
        });
        stream.on('metadata', (meta) => {
            const columns = meta.map((m) => ({
                name: m.name,
                dbType: this.getDbTypeName(m.dbType),
                nullable: m.nullable !== false,
                byteSize: m.byteSize,
                precision: m.precision,
                scale: m.scale,
            }));
            onColumns(columns);
        });
        // Ensure connection is closed when the stream is finished or fails
        let cleaned = false;
        const cleanup = async () => {
            if (cleaned) {
                return;
            }
            cleaned = true;
            try {
                await conn.close();
            }
            catch (_err) { }
        };
        stream.on('end', cleanup);
        stream.on('error', cleanup);
        stream.on('close', cleanup);
        // Wrap queryStream in a Transform that resolves any Lob objects via getData().
        // This is needed because CLOBs are not in fetchAsString — they come as Lob objects
        // so that OCILobRead2 is used instead of the broken OCI prefetch path.
        const lobResolver = new stream_1.Transform({
            objectMode: true,
            transform(row, _enc, cb) {
                const lobIdxs = row.reduce((acc, val, i) => (val && typeof val.getData === 'function') ? [...acc, i] : acc, []);
                if (lobIdxs.length === 0) {
                    cb(null, row);
                    return;
                }
                Promise.all(lobIdxs.map(i => row[i].getData()
                    .then((d) => { row[i] = d; })
                    .catch((e) => { row[i] = '[LOB read error: ' + (e?.message || 'unknown') + ']'; })))
                    .then(() => cb(null, row))
                    .catch((err) => cb(err));
            }
        });
        // Pipe oracle stream → lob resolver; forward errors; propagate destroy
        stream.pipe(lobResolver);
        stream.on('error', (err) => { try {
            lobResolver.destroy(err);
        }
        catch { } });
        const origDestroy = lobResolver.destroy.bind(lobResolver);
        lobResolver.destroy = function (err) {
            try {
                stream.destroy();
            }
            catch { }
            return origDestroy(err);
        };
        return lobResolver;
    }
    /**
     * Stream query results in batches for export.
     * @deprecated Use executeExportQueryStream for better performance.
     */
    async executeExportStream(sql, connectionName, batchSize, onColumns, onBatch, isCancelled) {
        const conn = await this.getConnection(connectionName);
        try {
            // Cap prefetchRows to prevent OOM on wide tables (e.g. 1000 cols × 10k rows = 10M cells)
            const PREFETCH_CAP = 1000;
            const prefetchRows = Math.min(batchSize, PREFETCH_CAP);
            const result = await conn.execute(sql, {}, {
                outFormat: oracledb_1.default.OUT_FORMAT_ARRAY,
                resultSet: true,
                prefetchRows,
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
            // Adaptive fetch size: keep total cells per batch under ~500k to avoid memory spikes
            const MAX_CELLS_PER_BATCH = 500_000;
            const fetchSize = Math.max(100, Math.min(batchSize, Math.floor(MAX_CELLS_PER_BATCH / Math.max(columns.length, 1))));
            let totalRows = 0;
            let batchNum = 0;
            while (true) {
                if (isCancelled?.()) {
                    break;
                }
                const rows = (await rs.getRows(fetchSize));
                if (rows.length === 0) {
                    break;
                }
                batchNum++;
                totalRows += rows.length;
                await onBatch(rows, batchNum, totalRows);
                if (rows.length < fetchSize) {
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
            OracleService.activeRunningConn = conn;
            const result = await conn.execute(sql, binds, { autoCommit });
            OracleService.activeRunningConn = null;
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
     * Try a query with DBA_ view first; if it fails for literally any reason
     * (missing view, insufficient permissions, broken columns), retry with ALL_ view.
     * We purposefully do NOT cache this globally, because users often have selective SELECT grants
     * on specific DBA_ views (e.g. DBA_OBJECTS) but lack access to others (e.g. DBA_INDEXES).
     */
    async queryWithDbaFallback(conn, dbaSql, allSql, binds, options) {
        try {
            return await conn.execute(dbaSql, binds, options);
        }
        catch (err) {
            console.warn(`[ING SQL] DBA fallback triggered. SQL failed: ${err.message}`);
            return await conn.execute(allSql, binds, options);
        }
    }
    /**
     * List objects of a given type owned by a specific schema.
     * Tries DBA_OBJECTS first (shows ALL objects), falls back to ALL_OBJECTS.
     * This matches Oracle SQL Developer behaviour.
     */
    async getSchemaObjectsForOwner(objectType, owner, connectionName) {
        const conn = await this.getConnection(connectionName);
        try {
            const typeClause = objectType === 'PACKAGE'
                ? `AND OBJECT_TYPE = 'PACKAGE'`
                : `AND OBJECT_TYPE = :type`;
            const binds = { owner };
            if (objectType !== 'PACKAGE') {
                binds.type = objectType;
            }
            const dbaSql = `
                SELECT OWNER, OBJECT_NAME, OBJECT_TYPE, STATUS, CREATED, LAST_DDL_TIME
                FROM DBA_OBJECTS
                WHERE OWNER = :owner ${typeClause}
                ORDER BY OBJECT_NAME
            `;
            const allSql = `
                SELECT OWNER, OBJECT_NAME, OBJECT_TYPE, STATUS, CREATED, LAST_DDL_TIME
                FROM ALL_OBJECTS
                WHERE OWNER = :owner ${typeClause}
                ORDER BY OBJECT_NAME
            `;
            const result = await this.queryWithDbaFallback(conn, dbaSql, allSql, binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
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
    async getTableColumns(tableName, connectionName, owner) {
        const conn = await this.getConnection(connectionName);
        try {
            const ownerClause = owner ? `c.OWNER = :owner` : `c.OWNER = USER`;
            const binds = { tableName };
            if (owner) {
                binds.owner = owner;
            }
            const makeSql = (prefix) => `
                SELECT c.COLUMN_NAME, c.DATA_TYPE, c.DATA_LENGTH, c.DATA_PRECISION,
                       c.DATA_SCALE, c.NULLABLE, c.DATA_DEFAULT, c.COLUMN_ID,
                       cc.COMMENTS
                FROM ${prefix}_TAB_COLUMNS c
                LEFT JOIN ${prefix}_COL_COMMENTS cc
                    ON cc.OWNER = c.OWNER AND cc.TABLE_NAME = c.TABLE_NAME
                    AND cc.COLUMN_NAME = c.COLUMN_NAME
                WHERE ${ownerClause} AND c.TABLE_NAME = :tableName
                ORDER BY c.COLUMN_ID
            `;
            const result = owner
                ? await this.queryWithDbaFallback(conn, makeSql('DBA'), makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT })
                : await conn.execute(makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
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
    async getConstraints(tableName, connectionName, owner) {
        const conn = await this.getConnection(connectionName);
        try {
            const ownerClause = owner ? `c.OWNER = :owner` : `c.OWNER = USER`;
            const binds = { tableName };
            if (owner) {
                binds.owner = owner;
            }
            const makeSql = (prefix) => `
                SELECT c.CONSTRAINT_NAME, c.CONSTRAINT_TYPE, c.STATUS, c.DELETE_RULE,
                       c.R_CONSTRAINT_NAME,
                       LISTAGG(cc.COLUMN_NAME, ', ') WITHIN GROUP (ORDER BY cc.POSITION) AS COLUMNS,
                       r.TABLE_NAME AS REF_TABLE
                FROM ${prefix}_CONSTRAINTS c
                JOIN ${prefix}_CONS_COLUMNS cc ON cc.CONSTRAINT_NAME = c.CONSTRAINT_NAME AND cc.OWNER = c.OWNER
                LEFT JOIN ${prefix}_CONSTRAINTS r ON r.CONSTRAINT_NAME = c.R_CONSTRAINT_NAME AND r.OWNER = c.OWNER
                WHERE ${ownerClause} AND c.TABLE_NAME = :tableName
                GROUP BY c.CONSTRAINT_NAME, c.CONSTRAINT_TYPE, c.STATUS, c.DELETE_RULE,
                         c.R_CONSTRAINT_NAME, r.TABLE_NAME
                ORDER BY c.CONSTRAINT_TYPE, c.CONSTRAINT_NAME
            `;
            const result = owner
                ? await this.queryWithDbaFallback(conn, makeSql('DBA'), makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT })
                : await conn.execute(makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
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
    async getIndexes(tableName, connectionName, owner) {
        const conn = await this.getConnection(connectionName);
        try {
            const ownerClause = owner ? `i.TABLE_OWNER = :owner` : `i.TABLE_OWNER = USER`;
            const binds = { tableName };
            if (owner) {
                binds.owner = owner;
            }
            const makeSql = (prefix) => `
                SELECT i.INDEX_NAME, i.INDEX_TYPE, i.UNIQUENESS, i.STATUS, i.TABLESPACE_NAME,
                       LISTAGG(ic.COLUMN_NAME, ', ') WITHIN GROUP (ORDER BY ic.COLUMN_POSITION) AS COLUMNS
                FROM ${prefix}_INDEXES i
                JOIN ${prefix}_IND_COLUMNS ic ON ic.INDEX_NAME = i.INDEX_NAME AND ic.INDEX_OWNER = i.OWNER
                WHERE ${ownerClause} AND i.TABLE_NAME = :tableName
                GROUP BY i.INDEX_NAME, i.INDEX_TYPE, i.UNIQUENESS, i.STATUS, i.TABLESPACE_NAME
                ORDER BY i.INDEX_NAME
            `;
            const result = owner
                ? await this.queryWithDbaFallback(conn, makeSql('DBA'), makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT })
                : await conn.execute(makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
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
    async getGrants(tableName, connectionName, owner) {
        const conn = await this.getConnection(connectionName);
        try {
            const binds = { tableName };
            const makeSql = (prefix) => `
                SELECT * FROM ${prefix}_TAB_PRIVS
                WHERE TABLE_NAME = :tableName
            `;
            const result = owner
                ? await this.queryWithDbaFallback(conn, makeSql('DBA'), makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT })
                : await conn.execute(makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
            let rows = (result.rows || []);
            if (owner) {
                rows = rows.filter(r => r.OWNER === owner || r.TABLE_SCHEMA === owner);
            }
            return rows.map(r => ({
                GRANTEE: r.GRANTEE,
                PRIVILEGE: r.PRIVILEGE,
                GRANTABLE: r.GRANTABLE,
                GRANTOR: r.GRANTOR
            }));
        }
        finally {
            await conn.close();
        }
    }
    async getTriggers(tableName, connectionName, owner) {
        const conn = await this.getConnection(connectionName);
        try {
            const binds = { tableName };
            const makeSql = (prefix) => `
                SELECT * FROM ${prefix}_TRIGGERS
                WHERE TABLE_NAME = :tableName
            `;
            const result = owner
                ? await this.queryWithDbaFallback(conn, makeSql('DBA'), makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT })
                : await conn.execute(makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
            let rows = (result.rows || []);
            if (owner) {
                rows = rows.filter(r => r.OWNER === owner || r.TABLE_OWNER === owner);
            }
            return rows.map(r => ({
                TRIGGER_NAME: r.TRIGGER_NAME,
                TRIGGER_TYPE: r.TRIGGER_TYPE,
                TRIGGERING_EVENT: r.TRIGGERING_EVENT,
                STATUS: r.STATUS,
                DESCRIPTION: r.DESCRIPTION || ''
            }));
        }
        finally {
            await conn.close();
        }
    }
    async getObjectSource(objectName, objectType, connectionName, owner) {
        const conn = await this.getConnection(connectionName);
        try {
            const ownerClause = owner ? `OWNER = :owner` : `OWNER = USER`;
            const binds = { name: objectName, type: objectType };
            if (owner) {
                binds.owner = owner;
            }
            const makeSql = (prefix) => `
                SELECT TEXT FROM ${prefix}_SOURCE
                WHERE ${ownerClause} AND NAME = :name AND TYPE = :type
                ORDER BY LINE
            `;
            const result = owner
                ? await this.queryWithDbaFallback(conn, makeSql('DBA'), makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT })
                : await conn.execute(makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
            return (result.rows || []).map(r => r.TEXT).join('');
        }
        finally {
            await conn.close();
        }
    }
    async getObjectDDL(objectName, objectType, connectionName, owner) {
        const conn = await this.getConnection(connectionName);
        try {
            const ownerExpr = owner ? `:owner` : `USER`;
            const sql = `SELECT DBMS_METADATA.GET_DDL(:type, :name, ${ownerExpr}) AS DDL FROM DUAL`;
            const binds = { type: objectType, name: objectName };
            if (owner) {
                binds.owner = owner;
            }
            const result = await conn.execute(sql, binds, {
                outFormat: oracledb_1.default.OUT_FORMAT_OBJECT,
                fetchInfo: { DDL: { type: oracledb_1.default.STRING } }
            });
            const rows = (result.rows || []);
            let ddl = rows.length > 0 ? rows[0].DDL : '';
            // Attempt to append Grants DDL for relevant object types
            if (ddl && owner && ['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'PACKAGE'].includes(objectType)) {
                try {
                    const grantResult = await conn.execute(`SELECT DBMS_METADATA.GET_DEPENDENT_DDL('OBJECT_GRANT', :name, :owner) AS GRANT_DDL FROM DUAL`, { name: objectName, owner: owner }, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT, fetchInfo: { GRANT_DDL: { type: oracledb_1.default.STRING } } });
                    const grantRows = (grantResult.rows || []);
                    if (grantRows.length > 0 && grantRows[0].GRANT_DDL) {
                        ddl += '\n\n/* Grants */\n' + grantRows[0].GRANT_DDL;
                    }
                }
                catch (e) {
                    // Ignore if no grants exist or unsupported
                }
            }
            return ddl;
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
            const ownerBind = schemaName ? { name: objectName, owner: schemaName } : { name: objectName };
            const ownerWhere = schemaName ? 'OWNER = :owner' : 'OWNER = USER';
            const makeDepsSql = (prefix) => `
                SELECT REFERENCED_OWNER AS OWNER, 
                       REFERENCED_NAME AS NAME, 
                       REFERENCED_TYPE AS TYPE, 
                       DEPENDENCY_TYPE
                FROM ${prefix}_DEPENDENCIES
                WHERE ${ownerWhere} AND NAME = :name
                ORDER BY TYPE, NAME
            `;
            const depsResult = schemaName
                ? await this.queryWithDbaFallback(conn, makeDepsSql('DBA'), makeDepsSql('ALL'), ownerBind, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT })
                : await conn.execute(makeDepsSql('ALL'), ownerBind, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
            const refWhere = schemaName ? 'REFERENCED_OWNER = :owner' : 'REFERENCED_OWNER = USER';
            const makeRefSql = (prefix) => `
                SELECT OWNER, 
                       NAME, 
                       TYPE, 
                       DEPENDENCY_TYPE
                FROM ${prefix}_DEPENDENCIES
                WHERE ${refWhere} AND REFERENCED_NAME = :name
                ORDER BY TYPE, NAME
            `;
            const refResult = schemaName
                ? await this.queryWithDbaFallback(conn, makeRefSql('DBA'), makeRefSql('ALL'), ownerBind, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT })
                : await conn.execute(makeRefSql('ALL'), ownerBind, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
            return {
                dependencies: (depsResult.rows || []),
                referencedBy: (refResult.rows || [])
            };
        }
        finally {
            await conn.close();
        }
    }
    async getStatistics(tableName, connectionName, owner) {
        const conn = await this.getConnection(connectionName);
        try {
            const binds = { tableName };
            const makeSql = (prefix) => `
                SELECT * FROM ${prefix}_TAB_STATISTICS
                WHERE TABLE_NAME = :tableName
            `;
            const result = owner
                ? await this.queryWithDbaFallback(conn, makeSql('DBA'), makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT })
                : await conn.execute(makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
            let rows = (result.rows || []);
            if (owner) {
                rows = rows.filter(r => r.OWNER === owner || r.TABLE_OWNER === owner || r.SCHEMA_NAME === owner);
            }
            if (rows.length === 0)
                return [];
            const r = rows[0];
            const excluded = ['TABLE_NAME', 'OWNER', 'TABLE_OWNER'];
            return Object.keys(r)
                .filter(k => !excluded.includes(k) && r[k] !== null)
                .map(k => ({ NAME: k, VALUE: String(r[k]) }));
        }
        finally {
            await conn.close();
        }
    }
    async getDetails(objectName, connectionName, owner) {
        const conn = await this.getConnection(connectionName);
        try {
            const binds = { objectName };
            const makeSql = (prefix) => `
                SELECT * FROM ${prefix}_OBJECTS
                WHERE OBJECT_NAME = :objectName
            `;
            const result = owner
                ? await this.queryWithDbaFallback(conn, makeSql('DBA'), makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT })
                : await conn.execute(makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
            let rows = (result.rows || []);
            if (owner) {
                rows = rows.filter(r => r.OWNER === owner);
            }
            if (rows.length === 0)
                return [];
            const r = rows[0];
            const excluded = ['OBJECT_NAME', 'OWNER'];
            return Object.keys(r)
                .filter(k => !excluded.includes(k) && r[k] !== null)
                .map(k => ({ NAME: k, VALUE: String(r[k]) }));
        }
        finally {
            await conn.close();
        }
    }
    async getPartitions(tableName, connectionName, owner) {
        const conn = await this.getConnection(connectionName);
        try {
            const binds = { tableName };
            const makeSql = (prefix) => `
                SELECT * FROM ${prefix}_TAB_PARTITIONS
                WHERE TABLE_NAME = :tableName
            `;
            const result = owner
                ? await this.queryWithDbaFallback(conn, makeSql('DBA'), makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT })
                : await conn.execute(makeSql('ALL'), binds, { outFormat: oracledb_1.default.OUT_FORMAT_OBJECT });
            let rows = (result.rows || []);
            if (owner) {
                rows = rows.filter(r => r.TABLE_OWNER === owner || r.OWNER === owner);
            }
            return rows.map(r => ({
                PARTITION_NAME: r.PARTITION_NAME,
                HIGH_VALUE: r.HIGH_VALUE,
                TABLESPACE_NAME: r.TABLESPACE_NAME,
                LOGGING: r.LOGGING,
                NUM_ROWS: r.NUM_ROWS,
                LAST_ANALYZED: r.LAST_ANALYZED
            }));
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
        // XMLType: constant may not be in all oracledb type definitions
        const xmlTypeId = oracledb_1.default.DB_TYPE_XMLTYPE;
        if (xmlTypeId !== undefined) {
            typeMap[xmlTypeId] = 'XMLTYPE';
        }
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