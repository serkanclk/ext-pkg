# ING SQL for VS Code

A full-featured ING SQL clone for Visual Studio Code with **export audit logging**.

## Features

### 🔌 Connection Manager
- Add, edit, delete, and test Oracle database connections
- Support for Basic, TNS, and Connection String connection types
- SYSDBA / SYSOPER role support
- Passwords stored securely in VS Code Secret Storage
- Connection pooling via `node-oracledb` thin mode (no Oracle Client needed)

### 🌲 Object Browser
Browse your Oracle schema objects in a tree view:
- Tables (with Columns, Constraints, Indexes, Triggers, Grants)
- Views & Materialized Views
- Procedures, Functions, Packages
- Sequences, Triggers, Types
- Synonyms, DB Links
- Context menus: Open Data, Describe, Export, Generate SELECT, View Source, Compile, Drop

### 📝 SQL Worksheet
- Oracle SQL & PL/SQL syntax highlighting
- Keyword, function, and schema object autocompletion
- **Cmd+Enter**: Execute statement at cursor
- **F5**: Execute entire script
- **F10**: Explain Plan
- Bind variable `:var` prompt dialogs
- PL/SQL block-aware statement parsing (`BEGIN...END;` / `/`)
- SQL formatting
- SQL History panel (persistent)

### 📊 Results Grid
- Tabular data display with sorting and filtering
- Row numbers and NULL value display
- Click-to-copy cell values
- Status bar with row count and execution time
- Commit / Rollback buttons
- VS Code theme integration (dark/light)

### ⬇️ Export (6 Formats)
| Format | Details |
|--------|---------|
| CSV | BOM-encoded, Excel-compatible |
| Excel (XLSX) | Styled headers, alternating rows, auto-filter |
| JSON | Array of objects, pretty-printed |
| XML | Custom root element |
| SQL INSERT | With COMMIT, proper type formatting |
| HTML | Styled table with hover effects |

Export from:
1. **Results Grid** → Export toolbar button
2. **Object Browser** → Right-click table → "Export Data..."

### 📋 Export Audit Logging ⭐
Every export automatically logs to an Oracle DB table:

| Column | Description |
|--------|-------------|
| `USERNAME` | Oracle connection username |
| `MACHINE_NAME` | OS hostname |
| `CONNECTION_NAME` | Connection profile name |
| `SCHEMA_NAME` | Schema exported from |
| `OBJECT_NAME` | Table/View name (object browser exports) |
| `SQL_TEXT` | Query text (results grid exports) |
| `EXPORT_FORMAT` | CSV, XLSX, JSON, XML, SQL, HTML |
| `ROW_COUNT` | Number of rows exported |
| `FILE_PATH` | Destination file path |
| `FILE_SIZE_BYTES` | File size |
| `EXPORT_SOURCE` | OBJECT_BROWSER or RESULTS_GRID |
| `STATUS` | SUCCESS or FAILED |
| `DURATION_MS` | Export duration |

The `EXPORT_AUDIT_LOG` table is auto-created on first export.

### 🔧 Additional Features
- Describe panel (columns, constraints, indexes, DDL)
- DBMS_OUTPUT capture
- Execution plan viewer

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `oracleSqlDev.auditLog.enabled` | `true` | Enable export audit logging |
| `oracleSqlDev.auditLog.connectionName` | `""` | Audit DB connection (empty = active connection) |
| `oracleSqlDev.auditLog.tableName` | `EXPORT_AUDIT_LOG` | Audit table name |
| `oracleSqlDev.auditLog.schemaName` | `""` | Audit table schema |
| `oracleSqlDev.resultGrid.pageSize` | `200` | Rows per page |
| `oracleSqlDev.resultGrid.maxRows` | `10000` | Max rows to fetch |
| `oracleSqlDev.autoCommit` | `false` | Auto-commit DML |

## Quick Start

1. Open VS Code and find **ING SQL** in the activity bar
2. Click **+** to add a connection (host, port, service name, username, password)
3. Click the connection to connect
4. Right-click a table → **Open Data** or **Export Data**
5. Open a new SQL Worksheet and start querying!

## Requirements

- Oracle Database 12.1 or later
- No Oracle Client installation needed (uses thin mode)
