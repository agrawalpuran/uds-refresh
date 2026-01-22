# Difference Between `id` and `_id` in Uniform Table

## Overview

The Uniform table (and all MongoDB collections) has **two different ID fields**:

### 1. `_id` (MongoDB's Primary Key)
- **Type**: `ObjectId` (MongoDB's default type)
- **Format**: `6929b9d9a2fdaf5e8d099e4f` (24-character hex string)
- **Purpose**: MongoDB's **automatic primary key**
- **Created by**: MongoDB automatically when a document is inserted
- **Unique**: Yes, globally unique across the entire database
- **Indexed**: Yes, automatically indexed by MongoDB
- **Usage**: Used internally by MongoDB for:
  - Document identification
  - Relationships (references)
  - Indexing
  - Querying

### 2. `id` (Business/Application ID)
- **Type**: `String` (custom field)
- **Format**: `"1"`, `"2"`, `"PROD-1764337894085-1"` (human-readable)
- **Purpose**: **Business/application-level identifier**
- **Created by**: Application code (you set it manually)
- **Unique**: Yes, enforced by schema (`unique: true`)
- **Indexed**: Yes, explicitly indexed for performance
- **Usage**: Used by your application for:
  - API responses
  - Frontend references
  - Business logic
  - Human-readable identifiers

## Why Both Exist?

### MongoDB's `_id`:
- **Required**: Every MongoDB document MUST have an `_id`
- **Cannot be removed**: It's part of MongoDB's core architecture
- **Database-level**: Used for database operations, relationships, and indexing

### Application's `id`:
- **Business logic**: Represents your business identifier (e.g., product ID "1", "2", etc.)
- **API-friendly**: Easier to work with in REST APIs and frontend
- **Human-readable**: Can be meaningful (e.g., "PROD-1764337894085-1")
- **Migration-friendly**: If you ever change databases, you keep your business IDs

## How They Work Together

Looking at the code in `lib/db/data-access.ts`:

```typescript
function toPlainObject(doc: any): any {
  // ...
  if (obj._id) {
    // Only set id from _id if id doesn't already exist
    if (!obj.id) {
      obj.id = obj._id.toString()  // Fallback: use _id as id
    }
    delete obj._id  // Remove _id from API responses
  }
  // ...
}
```

**The conversion logic:**
1. If a document has a custom `id` field → use it (preserve business ID)
2. If a document doesn't have `id` → convert `_id` to string and use it as `id`
3. Remove `_id` from API responses (cleaner JSON)

## Example from Your Database

```json
{
  "_id": "6929b9d9a2fdaf5e8d099e4f",  // MongoDB's internal ID
  "id": "1",                           // Your business ID
  "name": "Formal Shirt - Male",
  "category": "shirt",
  // ... other fields
}
```

## When to Use Which?

### Use `_id` when:
- ✅ Querying MongoDB directly
- ✅ Creating relationships/references in MongoDB
- ✅ Using Mongoose `.findById()` method
- ✅ Database-level operations

### Use `id` when:
- ✅ API endpoints (`/api/products/1`)
- ✅ Frontend code (`product.id`)
- ✅ Business logic
- ✅ Human-readable references
- ✅ External integrations

## Current State in Your System

Based on the Uniform model:
- **`_id`**: Automatically created by MongoDB (ObjectId)
- **`id`**: Required string field, unique, indexed
- **Both are indexed** for fast lookups
- **API responses** use `id` (after `toPlainObject` conversion)

## Summary

| Feature | `_id` | `id` |
|---------|-------|------|
| **Type** | ObjectId | String |
| **Created by** | MongoDB | Application |
| **Format** | `6929b9d9a2fdaf5e8d099e4f` | `"1"`, `"PROD-..."` |
| **Purpose** | Database primary key | Business identifier |
| **Required** | Yes (MongoDB) | Yes (Schema) |
| **In API** | Removed | Included |
| **Human-readable** | No | Yes |

Both fields serve different purposes and are both necessary for a well-designed MongoDB application!

