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

## 📦 Distribution Filenames (V2.2.1)

| Version | Linux (x64) | Mac (ARM64) |
| :--- | :--- | :--- |
| **Full** | `ing-sql-linux-x64-2.2.1.vsix` | `ing-sql-darwin-arm64-2.2.1.vsix` |
| **Full + Intellisense** | `ing-sql-intl-linux-x64-2.2.1.vsix` | `ing-sql-intl-darwin-arm64-2.2.1.vsix` |
| **Restricted** | `ing-sql-restricted-linux-x64-2.2.1.vsix` | `ing-sql-restricted-darwin-arm64-2.2.1.vsix` |
| **Restricted + Intl** | `ing-sql-restricted-intl-linux-x64-2.2.1.vsix` | `ing-sql-restricted-intl-darwin-arm64-2.2.1.vsix` |

## 📋 Changelog

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
