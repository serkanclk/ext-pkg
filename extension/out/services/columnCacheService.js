"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColumnCacheService = void 0;
const oracleService_1 = require("./oracleService");
const connectionManager_1 = require("./connectionManager");
/**
 * Lazy, TTL-based cache for table/view column metadata.
 * Fetches from Oracle on first reference, caches for `ttlMs` milliseconds.
 */
class ColumnCacheService {
    ttlMinutes;
    cache = new Map();
    pendingRequests = new Map();
    ttlMs;
    constructor(ttlMinutes = 5) {
        this.ttlMinutes = ttlMinutes;
        this.ttlMs = ttlMinutes * 60 * 1000;
    }
    /**
     * Get columns for a table/view. Returns cached data if available and fresh,
     * otherwise fetches from Oracle asynchronously.
     *
     * Returns an empty array if the fetch fails (e.g., no connection, table doesn't exist).
     */
    async getColumns(tableName, connectionName, schema) {
        const key = this.makeKey(tableName, connectionName, schema);
        // Check cache
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.ttlMs) {
            return cached.columns;
        }
        // Deduplicate concurrent requests for the same table
        const pending = this.pendingRequests.get(key);
        if (pending) {
            return pending;
        }
        const promise = this.fetchColumns(tableName, connectionName, schema, key);
        this.pendingRequests.set(key, promise);
        try {
            return await promise;
        }
        finally {
            this.pendingRequests.delete(key);
        }
    }
    /**
     * Get columns for a table owned by a specific schema.
     * Used for schema-dot-completion (e.g., `HR.EMPLOYEES` → columns of HR.EMPLOYEES).
     */
    async getSchemaTableColumns(tableName, schema, connectionName) {
        return this.getColumns(tableName, connectionName, schema);
    }
    /**
     * Get table/view names in a specific schema. Fetches from Oracle.
     * Used for schema-dot-completion (e.g., `HR.` → tables in HR).
     */
    async getSchemaObjects(schema, connectionName) {
        const connName = connectionName || connectionManager_1.ConnectionManager.getInstance().getActiveConnectionName();
        if (!connName) {
            return [];
        }
        const cacheKey = `__schema_objects__:${connName}:${schema}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.ttlMs) {
            // Re-use cache structure: store names in a ColumnDetail-like shape
            return cached.columns.map(c => ({ name: c.name, type: c.dataType }));
        }
        try {
            const oracleService = oracleService_1.OracleService.getInstance();
            const objects = await oracleService.getSchemaObjectsForOwner('TABLE', schema, connName);
            const views = await oracleService.getSchemaObjectsForOwner('VIEW', schema, connName);
            const all = [...objects, ...views];
            // Store in cache using our CacheEntry structure
            this.cache.set(cacheKey, {
                columns: all.map(o => ({
                    name: o.name,
                    dataType: o.type,
                    dataLength: 0,
                    dataPrecision: null,
                    dataScale: null,
                    nullable: 'Y',
                    defaultValue: null,
                    columnId: 0,
                    comments: null,
                })),
                timestamp: Date.now(),
            });
            return all.map(o => ({ name: o.name, type: o.type }));
        }
        catch {
            return [];
        }
    }
    /** Invalidate a specific table's cache */
    invalidate(tableName, connectionName, schema) {
        const key = this.makeKey(tableName, connectionName, schema);
        this.cache.delete(key);
    }
    /** Clear entire cache (e.g., on disconnect or refresh) */
    clear() {
        this.cache.clear();
        this.pendingRequests.clear();
    }
    async fetchColumns(tableName, connectionName, schema, cacheKey) {
        const connName = connectionName || connectionManager_1.ConnectionManager.getInstance().getActiveConnectionName();
        if (!connName) {
            return [];
        }
        try {
            const oracleService = oracleService_1.OracleService.getInstance();
            const columns = await oracleService.getTableColumns(tableName, connName, schema);
            this.cache.set(cacheKey, {
                columns,
                timestamp: Date.now(),
            });
            return columns;
        }
        catch {
            // Table might not exist or connection lost — return empty
            return [];
        }
    }
    makeKey(tableName, connectionName, schema) {
        const conn = connectionName || connectionManager_1.ConnectionManager.getInstance().getActiveConnectionName() || '_';
        const own = schema || '_USER_';
        return `${conn}:${own}:${tableName.toUpperCase()}`;
    }
}
exports.ColumnCacheService = ColumnCacheService;
//# sourceMappingURL=columnCacheService.js.map