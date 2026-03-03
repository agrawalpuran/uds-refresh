# UDS – Full backup and restore (application + DB)

## Quick start: take a full backup

From the project root (where `package.json` is), run:

```powershell
.\scripts\backup-full-uds.ps1
```

This creates a timestamped folder under `backups/` containing:

- **db_dump/** – MongoDB dump (all collections)
- **application/** – Application source (excluding `node_modules`, `.next`, `.git`, `backups`)
- **BACKUP_MANIFEST.txt** – What was backed up and how to restore  
- **uds-full-backup-YYYY-MM-DD_HH-mm-ss.zip** – Same contents as a single ZIP file

Your **MONGODB_URI** is read from `.env.local` (or from the environment).  
`.env.local` is **not** included in the backup by default (secrets). Use `-IncludeEnvLocal` if you need it in the backup and keep the backup secure.

---

## Prerequisites

1. **MongoDB Database Tools** (for `mongodump` and `mongorestore`):
   - Download: [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools)
   - Install and add the `bin` folder to your system PATH so `mongodump` works in a terminal.

2. **MONGODB_URI** in `.env.local` (or set the environment variable) so the script can connect to your database.

---

## Script options

| Option | Description |
|--------|-------------|
| (none) | Full backup (app + DB) to `backups/` in the project |
| `-OutputDir "D:\MyBackups"` | Save backup to a specific folder |
| `-SkipDb` | Only backup application (no MongoDB dump) |
| `-IncludeEnvLocal` | Include `.env.local` in the application copy (use with care; keep backup secure) |

Examples:

```powershell
.\scripts\backup-full-uds.ps1 -OutputDir "D:\UDS-Backups"
.\scripts\backup-full-uds.ps1 -SkipDb
.\scripts\backup-full-uds.ps1 -IncludeEnvLocal
```

---

## Restore

### Restore MongoDB

1. Stop the app (and any process using the DB).
2. Restore the dump (replace `<your-uri>` and `<database_name>` with your URI and DB name, e.g. from the dump folder name under `db_dump/`):

   ```bash
   mongorestore --uri="<your-uri>" --drop "path/to/backup/db_dump/<database_name>"
   ```

   Example if the dump is in `backups/uds-full-backup-2025-02-13_10-00-00/db_dump/uniform-distribution`:

   ```bash
   mongorestore --uri="mongodb://localhost:27017" --drop "backups/uds-full-backup-2025-02-13_10-00-00/db_dump/uniform-distribution"
   ```

### Restore application

1. Copy the contents of the backup’s **application/** folder to your project directory (or a new clone).
2. Restore `.env.local` manually if you did not include it in the backup.
3. Run:

   ```bash
   npm install
   ```

4. Start the app as usual.

---

## What is excluded from the application backup

- `node_modules/`
- `.next/`, `out/`, `build/`
- `.git/`
- `backups/`
- `coverage/`, `.vercel/`
- `.env.local`, `.env` (unless `-IncludeEnvLocal`)

You can change this list in `scripts/backup-full-uds.ps1` if needed.
