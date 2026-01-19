# Database Reindexing Guide

## Overview

The database reindexing script synchronizes MongoDB indexes with the current Mongoose schema definitions. This ensures:

- **Query Correctness**: Indexes match schema definitions
- **Performance**: Optimal index usage for queries
- **Clean State**: Removes obsolete/duplicate indexes
- **No Data Loss**: Only modifies indexes, never data or collections

## What It Does

1. **Analyzes** all registered Mongoose models
2. **Compares** current database indexes with schema definitions
3. **Drops** indexes that don't match schemas (obsolete/duplicate)
4. **Creates** indexes that are missing from the database
5. **Preserves** indexes that match schemas

## Safety Features

✅ **Non-Destructive**: Only modifies indexes, never data  
✅ **Environment Guard**: Blocks production runs without confirmation  
✅ **Detailed Logging**: Shows before/after state for each model  
✅ **Error Handling**: Continues processing even if one model fails  
✅ **Verification**: Displays summary of all changes

## Usage

### Basic Usage (Interactive)

```bash
npm run reindex
```

This will:
- Show current environment
- Ask for confirmation before proceeding
- Display detailed progress for each model
- Show summary of changes

### Force Mode (Skip Confirmation)

```bash
npm run reindex-force
```

**⚠️ Warning**: Only use `--force` in development/testing environments.

### Direct Script Execution

```bash
# Interactive mode
node scripts/sync-mongoose-indexes.js

# Force mode (skip confirmation)
node scripts/sync-mongoose-indexes.js --force
```

## When to Run

Run this script when:

1. **After Schema Changes**: When you've modified index definitions in models
2. **Index Warnings**: When you see duplicate index warnings at startup
3. **Performance Issues**: When queries are slow and indexes might be missing
4. **Database Migration**: After migrating data or restoring from backup
5. **Regular Maintenance**: As part of periodic database maintenance

## Example Output

```
================================================================================
DATABASE REINDEXING SCRIPT
================================================================================
Environment: development
Force mode: NO
MongoDB URI: Set
================================================================================

📡 Connecting to MongoDB...
✅ Connected to MongoDB

📋 Found 12 registered models:
   - Company
   - Employee
   - Uniform
   ...

📊 Company (companies)
   Indexes before: 2
      - _id_: {_id: 1}
      - id_1: {id: 1} [UNIQUE]
   Syncing indexes...
   Indexes after: 2
      - _id_: {_id: 1}
      - id_1: {id: 1} [UNIQUE]
   ✅ No changes needed (indexes are in sync)

📊 Employee (employees)
   Indexes before: 5
      - _id_: {_id: 1}
      - id_1: {id: 1} [UNIQUE]
      - employeeId_1: {employeeId: 1} [UNIQUE]
      - email_1: {email: 1} [UNIQUE]
      - companyId_1_status_1: {companyId: 1, status: 1}
   Syncing indexes...
   Indexes after: 6
      - _id_: {_id: 1}
      - id_1: {id: 1} [UNIQUE]
      - employeeId_1: {employeeId: 1} [UNIQUE]
      - email_1: {email: 1} [UNIQUE]
      - companyId_1_status_1: {companyId: 1, status: 1}
      - locationId_1_status_1: {locationId: 1, status: 1}
   ✅ Changes: +1 added, 0 removed

================================================================================
REINDEXING SUMMARY
================================================================================
✅ Successfully processed: 12 models
❌ Failed: 0 models

Successfully processed models:
  - Company (companies): 2 → 2 indexes
  - Employee (employees): 5 → 6 indexes
    Changes: +1 added, 0 removed
  ...

================================================================================
✅ Reindexing completed successfully!
================================================================================
ℹ️  The application should now start without duplicate index warnings.
ℹ️  Restart your application to verify the warnings are gone.
```

## Models Processed

The script processes all registered Mongoose models:

- `Company` - Company master data
- `Employee` - Employee master data
- `Uniform` - Product/Uniform catalog
- `Order` - Order records
- `Vendor` - Vendor master data
- `Location` - Location master data
- `LocationAdmin` - Location-Employee admin relationships
- `CompanyAdmin` - Company-Employee admin relationships
- `Branch` - Branch master data (legacy)
- `DesignationProductEligibility` - Eligibility rules
- `VendorInventory` - Vendor inventory
- `ProductCompany`, `ProductVendor`, `VendorCompany` - Relationship models

## Troubleshooting

### Error: "MONGODB_URI not found"

**Solution**: Ensure `.env.local` exists and contains `MONGODB_URI`

```bash
# Check if .env.local exists
ls .env.local

# Verify MONGODB_URI is set
cat .env.local | grep MONGODB_URI
```

### Error: "Connection timeout"

**Solution**: Check MongoDB connection settings and network access

### Some Models Fail to Sync

**Solution**: Check the error message. Common issues:
- Collection doesn't exist (this is OK, model will be skipped)
- Permission issues (check MongoDB user permissions)
- Schema definition errors (check model file for syntax errors)

### Production Environment Blocked

**Solution**: This is intentional for safety. To run in production:

1. Set `NODE_ENV=production`
2. Use `--force` flag: `node scripts/sync-mongoose-indexes.js --force`
3. **⚠️ Only do this if you understand the risks**

## Best Practices

1. **Test First**: Always run in development/staging before production
2. **Backup**: Take a database backup before reindexing (especially in production)
3. **Monitor**: Watch for any performance issues after reindexing
4. **Verify**: Restart the application and check for index warnings
5. **Document**: Note any significant index changes for future reference

## Technical Details

### How `syncIndexes()` Works

Mongoose's `syncIndexes()` method:

1. Reads all index definitions from the schema
2. Compares with existing database indexes
3. Drops indexes that don't match any schema definition
4. Creates indexes that are in the schema but missing in the database
5. Returns an object with dropped index names

### Index Types Handled

- **Unique Indexes**: Enforced by `unique: true` in schema
- **Compound Indexes**: Multi-field indexes (e.g., `{companyId: 1, status: 1}`)
- **Sparse Indexes**: Only index documents with the field
- **Text Indexes**: Full-text search indexes
- **Geospatial Indexes**: For location-based queries

### Performance Impact

- **Reindexing Time**: Depends on collection size (usually seconds to minutes)
- **Query Impact**: Minimal - indexes are built in background by default
- **Lock Impact**: Uses `background: false` to ensure immediate consistency

## Related Scripts

- `sync-mongoose-indexes.js` - Main reindexing script (this one)
- `check-all-admins.js` - Verify admin relationships
- `verify-database-status.js` - General database health check

## Support

If you encounter issues:

1. Check the error message in the script output
2. Verify MongoDB connection and permissions
3. Review model schema definitions for syntax errors
4. Check application logs for related errors

