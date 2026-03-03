# Why MongoDB backup “worked before” and fails now – analysis

## What’s going on

- **Current script:** `scripts\backup-full-uds.ps1` (the one you ran) only uses **mongodump** for the database. If `mongodump` is not in your PATH, it skips the DB and only backs up the application.
- **Earlier behaviour:** The repo has another script, **`scripts\create-complete-backup.ps1`**, which does a **Node.js fallback**: when `mongodump` is not found, it runs `scripts\backup-database.js` and still backs up the database (via MongoDB driver/mongoose). So if you used **create-complete-backup.ps1** before, the DB backup could “work” even without MongoDB Database Tools installed.

So the difference is not that “backup broke” – it’s that **two different scripts** behave differently when `mongodump` is missing.

---

## Root cause

| Factor | Effect |
|--------|--------|
| **Which script you run** | `backup-full-uds.ps1` = mongodump only → no DB backup if mongodump missing. `create-complete-backup.ps1` = mongodump + Node fallback → DB backup still runs via Node. |
| **mongodump not in PATH** | On this machine, `mongodump` is either not installed or not on the PATH used by PowerShell. So any script that *only* uses mongodump will skip the DB. |
| **PATH / environment** | If you used to run backup from another terminal, or had MongoDB (or Database Tools) installed and later removed/updated, PATH may have changed and mongodump may no longer be found. |

So:

- **“Backup was working earlier”** is consistent with either:  
  - You previously used **create-complete-backup.ps1** (Node fallback), or  
  - You previously had **mongodump** installed and in PATH (and now don’t, or use a different environment).
- **“It’s creating a problem now”** with **backup-full-uds.ps1** is because that script had **no Node fallback** – it only tried mongodump, so when mongodump wasn’t found, the DB was skipped.

---

## What was changed (fix)

- **backup-full-uds.ps1** was updated to add a **Node.js fallback** when `mongodump` is not found: it runs `node scripts/backup-db.js <db_dump_path>` so the database is still backed up (as JSON) into the same backup folder (`db_dump/`).
- **backup-db.js** was updated to take the database name from `MONGODB_URI` (so it works with any database name, not only `uniform-distribution`) and to accept the output directory via `process.argv[2]` or `BACKUP_OUTPUT_DIR`.
- So even without MongoDB Database Tools, **`.\scripts\backup-full-uds.ps1`** will now back up both application and database (DB via Node, one JSON file per collection).

---

## Options going forward

1. **Use the updated script (recommended)**  
   Run:
   ```powershell
   .\scripts\backup-full-uds.ps1
   ```
   You get app + DB (using Node fallback when mongodump is missing).

2. **Use the older script**  
   Run:
   ```powershell
   .\scripts\create-complete-backup.ps1
   ```
   Same idea: app + DB, with Node fallback when mongodump is missing.

3. **Use mongodump so DB is in native format**  
   Install [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools), add `mongodump` to PATH, then run **backup-full-uds.ps1**. The DB will be backed up with mongodump (BSON, easy to restore with `mongorestore`).

---

## Summary

- Backup “worked before” likely because either you used **create-complete-backup.ps1** (which has a Node.js DB backup fallback) or you had **mongodump** in PATH.
- It “creates a problem now” with **backup-full-uds.ps1** because that script originally had **no fallback** when mongodump was missing.
- **Fix:** backup-full-uds.ps1 now has a Node.js fallback, so running it will back up MongoDB even when mongodump is not installed.
