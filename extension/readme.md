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

### 📥 Data Import
- Import data from **CSV** and **XLSX** files directly into new or existing tables via the Object Browser context menu.

### 📊 Results Grid
- Interactive grid with sorting, filtering, and "Load More" pagination.
- Status bar tracking row count and transaction execution time.

## 🛠️ Requirements

- **Oracle Database**: 12.1 or later.
- **Oracle Client**: Oracle Instant Client 19c or 23ai is **required** for Thick Mode operation. The extension expects the client library in a secure, predefined path (or via the `ORACLE_CLIENT_PATH` environment variable).

## 🛡️ Audit Log Details
The auditing system is hardcoded for maximum security. It records:
- **Operation Metadata**: Hostname, Username, Connection Name, Export Format.
- **Content Metadata**: Source Schema/Table, SQL Query executed, Row Count.
- **Technical Metadata**: File size, destination path, duration, and SUCCESS/FAILURE status.

Logs are transmitted to a **centralized listener** at `http://dwh-logger-api.athena.svc.cluster.local` for permanent retention.

## 📦 Builds
- **Full**: Complete feature set including all export and clipboard functions.
- **Restricted**: Hardened version with no export, no clipboard access, and disabled context menus on data.

---
*Maintained by the Athena DWH Team.*
