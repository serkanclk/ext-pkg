# ING SQL for VS Code

A professional Oracle SQL Developer clone for Visual Studio Code, optimized for **security, audit compliance, and thick-mode performance**.

## 🚀 Key Features

### 🏢 Corporate-Grade Security
- **Mandatory Audit Logging**: Every data export is automatically recorded in a **centralized database** via a background listener service. Logging is mandatory and cannot be diverted or disabled by users.
- **Restricted Build Support**: A dedicated "Restricted" version is available that disables data exports, blocks clipboard copying (Ctrl+C / Cmd+C), and prevents right-click context menus on queried data.

### 🔌 Advanced Connectivity (Thick Mode)
- **Oracle Thick Mode**: Automatically uses Oracle Instant Client for enhanced security (NNE - Native Network Encryption) and high-performance driver features.
- **Secure Password Storage**: Passwords are saved in the native VS Code Secret Storage.
- **Thick Mode Diagnostics**: Built-in "Verify Oracle Client" command to validate your local environment.

### 🌲 Professional Object Browser
- Comprehensive tree view for Tables, Views, Procedures, Functions, Packages, Sequences, and more.
- **Metadata Tabs**: Rich, tabbed interface for viewing Columns, Data, Constraints, Grants, Statistics, Triggers, DDL, and Dependencies.
- **Theme Adaptability**: UI automatically adapts to any VS Code theme (Light, Dark, High Contrast) while maintaining ING corporate branding.

### 📝 SQL Worksheet & History
- Robust SQL & PL/SQL syntax highlighting and autocompletion.
- Persistent SQL History and SQL Snippets management.
- Explain Plan (F10) and DBMS_OUTPUT support.

### ⌨️ Classic SQL Developer Shortcuts
- **New SQL Worksheet**: `Alt+F10`.
- **SQL-Aware Uppercase**: `Ctrl+Shift+U` (Win/Linux) / `Cmd+Shift+U` (Mac). Intelligently skips literals in single quotes.

### 🧠 Intellisense (Optional Feature)
- **Rich Offline Autocompletion**: Includes 3,500+ schema objects for instant feedback in high-latency or offline environments (available in `+ Intellisense` builds).

### 📥 Data Import
- Import data from **CSV** and **XLSX** files directly into new or existing tables via the Object Browser context menu.

### 📊 Results Grid
- Interactive grid with sorting, filtering, and "Load More" pagination.
- Status bar tracking row count and transaction execution time.

## 🛠️ Requirements

- **Oracle Database**: 12.1 or later.
- **Oracle Client**: Oracle Instant Client 19c or 23ai is **required** for Thick Mode operation. The extension expects the client library in a secure, predefined path (or via the `ORACLE_CLIENT_PATH` environment variable).

## 🛡️ Audit Log Details
The auditing system is hardcoded for maximum security. It records hostname, user, connection, format, and content metadata for every export. Logs are transmitted to `http://dwh-logger-api.athena.svc.cluster.local`.

## 📦 Distribution Filenames (V2.5.0)

| Version | Linux (x64) | Mac (ARM64) |
| :--- | :--- | :--- |
| **Full** | `ing-sql-linux-x64-2.5.0.vsix` | `ing-sql-darwin-arm64-2.5.0.vsix` |
| **Full + Intellisense** | `ing-sql-intl-linux-x64-2.5.0.vsix` | `ing-sql-intl-darwin-arm64-2.5.0.vsix` |
| **Restricted** | `ing-sql-restricted-linux-x64-2.5.0.vsix` | `ing-sql-restricted-darwin-arm64-2.5.0.vsix` |
| **Restricted + Intl** | `ing-sql-restricted-intl-linux-x64-2.5.0.vsix` | `ing-sql-restricted-intl-darwin-arm64-2.5.0.vsix` |

## 📋 Changelog

### v2.5.0 — Multi-Query Results + Import Encoding
- **Multi-query execution**: Write multiple SELECTs separated by `;`, execute with F5, each gets its own result tab (Query 1, Query 2, etc.)
- **Per-worksheet results**: Each SQL worksheet gets its own results panel — switch worksheets, switch results
- **Windows-1254 encoding**: Import wizard now supports Windows-1254 (Turkish), ISO 8859-9, UTF-16 LE, in addition to UTF-8/Latin1/ASCII
- **Architecture**: Replaced sidebar `WebviewViewProvider` with `WebviewPanel` editor tabs for results

### v2.4.6 — DBA_ Views for Other Users (Root Cause Fix)
- **Root cause**: `ALL_OBJECTS` only shows 76/110 tables, 0/1816 procedures — it's privilege-limited
- **Fix**: Try `DBA_OBJECTS`/`DBA_TAB_COLUMNS`/`DBA_SOURCE` etc. first, fall back to `ALL_*` on ORA-00942
- **Optimization**: Session-level `dbaAccessCache` — test once, skip DBA_ attempts if no access

### v2.4.5 — Other Users: Match Oracle SQL Developer
- **Fixed**: Object listing uses `ALL_OBJECTS` for all types (procedures, packages, functions now listed correctly)
- **Fixed**: Tree sub-categories (Columns, Constraints, Indexes, Triggers, Grants) pass schema owner throughout
- **Fixed**: Schema owner propagated through entire tree chain for consistent cross-schema browsing

### v2.4.4 — Other Users Full Object Support
- **Fixed**: Open Data, Columns, Constraints, Indexes, DDL, Source — all now work for Other Users' schemas
- **Fixed**: Procedures, functions, packages listed correctly via `ALL_SOURCE` with schema owner
- **Fixed**: Data queries use schema-qualified names (`"SCHEMA"."TABLE"`)

### v2.4.3 — Fix Pinned Schema Persistence
- **Fixed**: Declared `ingSql.pinnedSchemas` in `contributes.configuration` so VS Code properly persists pinned schemas

### v2.4.2 — Persistent Schema Storage
- **Improved**: Pinned schemas now stored in VS Code user settings (like connections) — survives extension uninstall/reinstall

### v2.4.1 — Bottom Panel Results + Persistent Schemas
- **Fixed**: Query results now appear in the **bottom panel** (matching Oracle SQL Developer layout), not as editor tabs
- **New**: Pinned schemas under "Other Users" are persisted via `globalState` — remembered across restarts

### v2.4.0 — Query Cancellation + Schema Filter
- **New**: Running queries can now be cancelled by clicking the status bar (shows "Click to Cancel" during execution)
- **New**: "Other Users" now uses QuickPick search — select schemas to browse instead of loading all
- **New**: Right-click "Remove Schema" to unpin schemas from the tree
- **Improved**: ORA-01013 (user cancel) shown as info rather than error

### v2.3.9 — DEFINE Substitution Variables + Bind Fix
- **New**: Support for `DEFINE var = value` / `UNDEFINE var` and `&var` / `&&var` substitution (SQL*Plus-style)
- **Fixed**: Bind variable detection no longer triggers on `:names` inside string literals (e.g. `'HH24:MI:SS'`)

### v2.3.8 — Plain Excel Export + Query Sheet
- **Changed**: Excel export now plain (no colors/formatting) — matches Oracle SQL Developer behavior
- **New**: Excel exports include a "Query" sheet with the SQL statement, export timestamp, and row count

### v2.3.7 — Unified Results Grid
- **Improved**: SELECT query results now open in the same comprehensive grid as "Open Data" (editor tab with sort, filter, export, load more)
- **Removed**: Bottom panel results view replaced with full editor tab experience

### v2.3.6 — NLS Live Reload
- **New**: Changing NLS settings in VS Code preferences now immediately applies to all open worksheet sessions — no need to open a new worksheet

### v2.3.5 — Critical: Extension Activation Fix
- **Fixed**: Extension failed to activate on oracledb 6.x — `fetchAsString` threw `NJS-021` when passed `DB_TYPE_*` constants
- **Fixed**: Replaced `fetchAsString` with `fetchTypeHandler` (modern oracledb 6.x API) for date/timestamp string conversion
- **Fixed**: NLS_DATE_FORMAT now works correctly via `fetchTypeHandler` intercepting date types at fetch time

### v2.3.4 — NLS Date Format Fix
- **Fixed**: `ALTER SESSION SET NLS_DATE_FORMAT` now takes effect — root cause was `fetchAsString` silently reverting to CLOB-only when any `DB_TYPE_*` constant was undefined
- **Fixed**: Date/timestamp types now individually registered with `fetchAsString` (each in its own try-catch) so one missing constant doesn't break all of them
- **Added**: Diagnostic log at startup showing which fetch types are registered

### v2.3.3 — Procedures & Dependencies Fix
- **Fixed**: Other Users stored procedures/functions/packages now use `ALL_SOURCE` (broadest visibility) instead of `ALL_PROCEDURES` which had null `OBJECT_TYPE` issues
- **Fixed**: Dependencies tab now works for Other Users' objects — was hardcoded to `OWNER = USER`, now uses the actual schema

### v2.3.2 — Import Menu + Other Users Procedures Fix
- **New**: "Import Data" now appears on right-click of the **Tables** folder (not just individual table nodes)
- **Fixed**: Stored procedures, functions, and packages now visible under Other Users — uses `ALL_PROCEDURES` which has broader visibility than `ALL_OBJECTS`

### v2.3.1 — Export Memory Optimization
- **Optimized**: Backpressure-aware streaming — waits for OS write buffer drain before sending more data, preventing 500MB+ memory spikes
- **Optimized**: Chunked writes (500-1000 rows per I/O call) to balance memory usage vs syscall overhead
- **Optimized**: Writer and ExcelJS object refs nullified immediately after export completes for faster GC
- **Improved**: XLSX row striping disabled for exports >50K rows to save memory on large datasets
- **Improved**: WriteStream buffer increased to 64KB for better I/O throughput

### v2.3.0 — Data Import Wizard
- **New**: Full 5-step import wizard matching Oracle SQL Developer's Data Import interface:
  - Step 1: Data Preview — file selection, format/delimiter/enclosure/encoding configuration with live preview
  - Step 2: Import Method — table name, import method, row limits
  - Step 3: Choose Columns — ↔ column selector with reordering
  - Step 4: Column Definition — per-column type, size, default, nullable, comment configuration
  - Step 5: Import Summary — full review before executing
- **Improved**: Table creation now uses proper Oracle data types (VARCHAR2, NUMBER, DATE, etc.) with sizes from wizard

### v2.2.1 — Export Timer
- **New**: Live elapsed timer in the export progress notification (e.g., "Exported 150,000 rows... (12.3s)")

### v2.2.0 — Streaming Export (Performance)
- **Optimized**: Exports now stream rows directly from Oracle to file in 10K batches, instead of loading all rows into memory first
- 250K+ row exports that previously timed out now complete in seconds
- All 6 formats (CSV, XLSX, JSON, XML, SQL, HTML) rewritten with streaming writers
- XLSX uses ExcelJS `stream.xlsx.WorkbookWriter` for constant-memory Excel generation
- Progress notification shows real-time row count during export
- Export cancellation now cleans up partial files

### v2.1.2 — Other Users Performance Fix
- **Fixed**: Extreme lag, scanning, and DB lock-ups when expanding the "Other Users" node. The query was optimized to use `ALL_USERS` instead of evaluating permissions recursively via `ALL_OBJECTS`. Loading schemas is now instantaneous.
- **Improved**: System Schema filtering. Added more core Oracle internal schemas to the exclusion list to keep the browser clean.

### v2.1.1 — Extension Load Crash Fix
- **Fixed**: Module load crash (`NJS-021`) when running in Oracle Thin Mode that prevented the entire extension from loading and registering commands.

### v2.1.0 — Activation Resilience Fix
- **Fixed**: "command 'ingSql.addConnection' not found" error
- Extension activation is now wrapped in try-catch so commands always register
- If initialization fails, a clear error message is shown instead of silently losing all commands

### v2.0.0 — Other Users in Object Browser
- **New**: "Other Users" folder under each connection, matching Oracle SQL Developer
- Browse any accessible schema's Tables, Views, Procedures, Functions, etc.
- System schemas (SYS, SYSTEM, XDB, etc.) are filtered out for cleanliness
- Full drill-down: Connection → Other Users → Schema → Category → Objects

### v1.9.0 — Semicolon Handling Fix
- **Fixed**: SQL statements ending with `;` or `/` no longer cause "SQL not properly ended" errors
- Trailing terminators are automatically stripped before execution, matching Oracle SQL Developer behavior

### v1.8.0 — SQL History Opens New Worksheet
- **Improved**: Clicking a SQL History item now opens a **new SQL worksheet** tab (previously it inserted into the active editor)
- New tab includes a comment header with connection name and timestamp
- Your current worksheet stays untouched

### v1.7.0 — Dedicated Session per Worksheet
- **New**: Each SQL worksheet now gets its own Oracle session, matching Oracle SQL Developer behavior
- **Benefit**: Transactions, session variables, and PL/SQL state are fully isolated per worksheet
- **UI Hint**: Status bar shows `$(plug) SID: 145` for the active worksheet's Oracle Session ID
- **Auto-release**: Sessions are released when the worksheet tab closes
- **Pool size**: Increased from 4 to 10 to support multiple simultaneous worksheets
- **NLS Settings**: Applied once per session instead of every query (performance improvement)

### v1.6.0 — SQL Execution Status Bar
- **New**: Status bar indicator shows real-time SQL execution state:
  - 🔄 **Running**: `$(sync~spin) SQL Running... (2.3s)` with live timer and orange background
  - ✅ **Success**: Green `$(check) 847 rows · 1.24s` — auto-fades after 15s
  - ❌ **Error**: Red `$(error) ORA-00942 · 0.5s` — stays visible until next query
- **Clickable**: Click the status bar item to focus the Results Panel
- **Idle**: Shows `$(database) SQL Ready` when no query is active

### v1.5.0 — Row Pagination & Browser Memory Safety
- **Fixed**: Default page size unified to **100 rows** (was 10,000 for SQL Worksheet, 200 for Object Viewer)
- **New**: Load More always fetches next 100 rows as pagination
- **New**: Browser memory safety cap at **10,000 rows** — after reaching the limit, Load More shows "⚠ Max rows reached — use Export for full data"

### v1.4.0 — Data Import via Table Right-Click
- **Improved**: Import Data now available from right-clicking a table in the Object Browser — auto-selects the table, just pick a file (CSV/XLSX)
- **Fixed**: Import still available from connection-level for creating new tables or choosing any table

### v1.3.0 — Oracle SQL Developer Shortcuts & About Page
- **New Shortcuts**: Describe Object at Cursor (`Shift+F4`), Show SQL History (`F8`), Format SQL (`Cmd+F7`/`Ctrl+F7`), SQL-Aware Lowercase (`Cmd+Shift+L`/`Ctrl+Shift+L`), Toggle Line Comment (`Cmd+/`/`Ctrl+/`)
- **New About Page**: Comprehensive help page (`ING SQL: About`) listing all shortcuts, features, and supported file types
- **Improved**: Uppercase command title updated to "Uppercase Selection (SQL-Aware)"

### v1.2.0 — SQL-Aware Uppercase & .sql Support
- **New**: `.sql` files are now recognized as Oracle SQL, enabling syntax highlighting, execution, and all extension features.
- **Improved**: SQL-Aware Uppercase (`Cmd+Shift+U` / `Ctrl+Shift+U`) now preserves case inside double-quoted identifiers (`"myColumn"`), line comments (`-- comment`), and block comments (`/* ... */`), in addition to single-quoted strings. Handles escaped quotes (`''`) correctly. Runs in a single O(n) pass for optimal performance.

### v1.1.0 — NLS Date/Timestamp Fix
- **Fixed**: NLS settings (`NLS_DATE_FORMAT`, `NLS_TIMESTAMP_FORMAT`, etc.) now take effect. Date and timestamp values are displayed exactly as configured in VS Code Settings (`ingSql.nls.*`).
- **Root cause**: The Oracle driver was returning native JavaScript `Date` objects instead of Oracle-formatted strings. Dates are now fetched as pre-formatted strings using the session's NLS settings.

### v1.0.0 — Initial Release
- Oracle SQL Developer clone with Object Browser, SQL Worksheet, Results Grid
- Multi-build matrix: Full, Restricted, ± Intellisense
- Mandatory audit logging for all data exports
- Oracle Thick Mode with automatic Instant Client initialization
- CSV/XLSX data import and export
- SQL History, SQL Snippets, Explain Plan, DBMS_OUTPUT

---
*Developed by the Athena DWH Team.*
