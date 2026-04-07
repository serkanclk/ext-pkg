"use strict";
/**
 * Lightweight SQL context parser for IntelliSense.
 * Analyzes cursor position to determine what kind of completions to suggest.
 *
 * NOT a full parser — handles ~90% of real-world patterns via regex.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlContextParser = void 0;
class SqlContextParser {
    /**
     * Parse the SQL document at the given cursor offset and return the context.
     */
    static parse(text, cursorOffset) {
        // 1. Extract the current statement containing the cursor
        const stmt = this.extractStatement(text, cursorOffset);
        const stmtText = stmt.text;
        const cursorInStmt = cursorOffset - stmt.startOffset;
        // 2. Parse tables from FROM/JOIN clauses
        const tables = this.extractTables(stmtText);
        // 3. Check for dot-completion (highest priority)
        const dotCtx = this.detectDotContext(stmtText, cursorInStmt, tables);
        if (dotCtx) {
            return { ...dotCtx, tables };
        }
        // 4. Determine keyword context
        const contextType = this.detectKeywordContext(stmtText, cursorInStmt);
        return { contextType, tables };
    }
    // ─── Statement Extraction ───────────────────────────────────────
    static extractStatement(text, cursorOffset) {
        // Simple approach: split on semicolons (respecting strings/comments),
        // find which segment contains the cursor
        let inString = false;
        let inLineComment = false;
        let inBlockComment = false;
        let segmentStart = 0;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            const next = text[i + 1];
            if (inBlockComment) {
                if (ch === '*' && next === '/') {
                    inBlockComment = false;
                    i++;
                }
                continue;
            }
            if (inLineComment) {
                if (ch === '\n') {
                    inLineComment = false;
                }
                continue;
            }
            if (inString) {
                if (ch === "'") {
                    if (next === "'") {
                        i++;
                    }
                    else {
                        inString = false;
                    }
                }
                continue;
            }
            if (ch === '-' && next === '-') {
                inLineComment = true;
                i++;
                continue;
            }
            if (ch === '/' && next === '*') {
                inBlockComment = true;
                i++;
                continue;
            }
            if (ch === "'") {
                inString = true;
                continue;
            }
            if (ch === ';') {
                if (cursorOffset <= i) {
                    return { text: text.substring(segmentStart, i), startOffset: segmentStart };
                }
                segmentStart = i + 1;
            }
        }
        // Cursor is in the last (or only) segment
        return { text: text.substring(segmentStart), startOffset: segmentStart };
    }
    // ─── Table Extraction ───────────────────────────────────────────
    /**
     * Extract table references from FROM and JOIN clauses.
     * Handles: FROM tbl, FROM schema.tbl alias, FROM tbl a JOIN tbl2 b ON ...
     */
    static extractTables(sql) {
        const tables = [];
        // Strip string literals and comments for safe regex matching
        const clean = this.stripNonCode(sql);
        // Match FROM clause and JOIN clauses
        // Pattern captures everything after FROM/JOIN until a keyword boundary
        const fromJoinRegex = /\b(?:FROM|JOIN)\s+([\s\S]*?)(?=\bWHERE\b|\bGROUP\b|\bORDER\b|\bHAVING\b|\bLIMIT\b|\bUNION\b|\bMINUS\b|\bINTERSECT\b|\bFETCH\b|\bFOR\b|\bCONNECT\b|\bSTART\b|\bPIVOT\b|\bUNPIVOT\b|\bRETURNING\b|\bINTO\b|\b(?:LEFT|RIGHT|FULL|CROSS|INNER|NATURAL)\s+(?:OUTER\s+)?JOIN\b|\bJOIN\b|\bON\b|\bUSING\b|$)/gi;
        let match;
        while ((match = fromJoinRegex.exec(clean)) !== null) {
            const clause = match[1].trim();
            this.parseTableList(clause, tables);
        }
        return tables;
    }
    /**
     * Parse a comma-separated list of table references.
     * Handles: tbl, tbl alias, tbl AS alias, schema.tbl alias
     */
    static parseTableList(clause, tables) {
        // Split by comma (but not inside parentheses — subqueries)
        const parts = this.splitByComma(clause);
        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed || /^\(/.test(trimmed)) {
                continue;
            } // skip subqueries
            // Pattern: [schema.]tablename [AS] [alias]
            const tableMatch = trimmed.match(/^(?:(\w+)\.)?(\w+)(?:\s+(?:AS\s+)?(\w+))?/i);
            if (tableMatch) {
                const [, schema, name, alias] = tableMatch;
                // Skip if name is a keyword (e.g., SELECT in subquery leak)
                if (this.isKeyword(name)) {
                    continue;
                }
                tables.push({
                    name: name.toUpperCase(),
                    alias: alias?.toUpperCase(),
                    schema: schema?.toUpperCase(),
                });
            }
        }
    }
    /**
     * Split text by commas, respecting parentheses depth.
     */
    static splitByComma(text) {
        const parts = [];
        let current = '';
        let depth = 0;
        for (const ch of text) {
            if (ch === '(') {
                depth++;
            }
            if (ch === ')') {
                depth--;
            }
            if (ch === ',' && depth === 0) {
                parts.push(current);
                current = '';
            }
            else {
                current += ch;
            }
        }
        if (current.trim()) {
            parts.push(current);
        }
        return parts;
    }
    // ─── Dot Context Detection ──────────────────────────────────────
    /**
     * Check if the cursor is right after a dot: `identifier.|`
     * Returns the context type and the prefix before the dot.
     */
    static detectDotContext(stmtText, cursorInStmt, tables) {
        // Look backwards from cursor for `identifier.`
        const before = stmtText.substring(0, cursorInStmt);
        const dotMatch = before.match(/(\w+)\.\s*(\w*)$/i);
        if (!dotMatch) {
            return null;
        }
        const prefix = dotMatch[1].toUpperCase();
        // Check if the prefix matches a table alias or table name → column completion
        const isAlias = tables.some(t => t.alias === prefix);
        const isTable = tables.some(t => t.name === prefix);
        if (isAlias || isTable) {
            return { contextType: 'dot_column', dotPrefix: prefix };
        }
        // Otherwise assume it's a schema name → table completion
        return { contextType: 'dot_schema', dotPrefix: prefix };
    }
    // ─── Keyword Context Detection ──────────────────────────────────
    /**
     * Determine the SQL keyword context at the cursor position.
     * Looks backwards from the cursor for the last significant keyword.
     */
    static detectKeywordContext(stmtText, cursorInStmt) {
        const before = this.stripNonCode(stmtText.substring(0, cursorInStmt)).trim();
        // Walk backwards to find the last keyword
        const upper = before.toUpperCase();
        // Check the last keyword before cursor (scan right-to-left)
        // FROM / JOIN context
        if (/\b(?:FROM|JOIN)\s*$/i.test(upper) ||
            /\b(?:FROM|JOIN)\s+[\w.,\s]*$/i.test(upper) && !/\b(?:SELECT|WHERE|ON|SET|ORDER|GROUP|HAVING)\b/i.test(upper.split(/\b(?:FROM|JOIN)\b/i).pop() || '')) {
            return 'from_table';
        }
        // INSERT INTO context
        if (/\bINTO\s*$/i.test(upper)) {
            return 'from_table';
        }
        // UPDATE context (table name expected)
        if (/\bUPDATE\s*$/i.test(upper)) {
            return 'from_table';
        }
        // DESCRIBE context (object name expected)
        if (/\bDESCRIBE\s*$/i.test(upper)) {
            return 'from_table';
        }
        // SELECT context (columns expected)
        if (/\bSELECT\s+(DISTINCT\s+)?$/i.test(upper) ||
            this.isInSelectClause(upper)) {
            return 'select_columns';
        }
        // WHERE / HAVING / ON / AND / OR / SET context (columns + functions)
        if (/\b(?:WHERE|HAVING|ON|AND|OR|SET|WHEN|THEN|ELSE|CASE)\s*$/i.test(upper) ||
            this.isInWhereClause(upper)) {
            return 'where_condition';
        }
        // ORDER BY / GROUP BY context (columns)
        if (/\b(?:ORDER\s+BY|GROUP\s+BY)\s*$/i.test(upper) ||
            this.isInOrderByClause(upper)) {
            return 'where_condition';
        }
        return 'general';
    }
    /**
     * Check if cursor position is within a SELECT clause (between SELECT and FROM).
     */
    static isInSelectClause(upper) {
        const lastSelect = upper.lastIndexOf('SELECT');
        if (lastSelect < 0) {
            return false;
        }
        const afterSelect = upper.substring(lastSelect);
        // If there's a FROM after this SELECT, cursor is past the SELECT clause
        return !/\bFROM\b/.test(afterSelect);
    }
    /**
     * Check if cursor is within a WHERE clause.
     */
    static isInWhereClause(upper) {
        const lastWhere = Math.max(upper.lastIndexOf('WHERE'), upper.lastIndexOf('HAVING'), upper.lastIndexOf(' ON '), upper.lastIndexOf(' SET '));
        if (lastWhere < 0) {
            return false;
        }
        const afterWhere = upper.substring(lastWhere);
        // Still in WHERE if no subsequent major clause
        return !/\b(?:ORDER\s+BY|GROUP\s+BY|UNION|MINUS|INTERSECT|FETCH)\b/.test(afterWhere);
    }
    /**
     * Check if cursor is within an ORDER BY / GROUP BY clause.
     */
    static isInOrderByClause(upper) {
        const lastOrderBy = Math.max(upper.lastIndexOf('ORDER BY'), upper.lastIndexOf('GROUP BY'));
        if (lastOrderBy < 0) {
            return false;
        }
        const after = upper.substring(lastOrderBy);
        return !/\b(?:HAVING|UNION|MINUS|INTERSECT|FETCH|FOR)\b/.test(after);
    }
    // ─── Utilities ──────────────────────────────────────────────────
    /**
     * Strip string literals, line comments, and block comments from SQL.
     * Replaces them with spaces to preserve positional offsets.
     */
    static stripNonCode(sql) {
        return sql
            .replace(/'(?:[^']|'')*'/g, match => ' '.repeat(match.length))
            .replace(/--[^\n]*/g, match => ' '.repeat(match.length))
            .replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length));
    }
    static KEYWORDS = new Set([
        'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
        'BETWEEN', 'LIKE', 'IS', 'NULL', 'AS', 'ON', 'JOIN', 'INNER',
        'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'NATURAL', 'USING',
        'ORDER', 'BY', 'GROUP', 'HAVING', 'UNION', 'ALL', 'INTERSECT',
        'MINUS', 'DISTINCT', 'INTO', 'VALUES', 'SET', 'WITH', 'CASE',
        'WHEN', 'THEN', 'ELSE', 'END', 'INSERT', 'UPDATE', 'DELETE',
        'CREATE', 'ALTER', 'DROP', 'TABLE', 'VIEW', 'INDEX', 'BEGIN',
        'DECLARE', 'EXCEPTION', 'RETURN', 'IF', 'LOOP', 'FOR', 'DESCRIBE',
    ]);
    static isKeyword(word) {
        return this.KEYWORDS.has(word.toUpperCase());
    }
}
exports.SqlContextParser = SqlContextParser;
//# sourceMappingURL=sqlContextParser.js.map