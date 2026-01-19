# Data Access Refactoring Patterns

## Common Patterns to Replace

### Pattern 1: findById → findOne({ id })

**Before:**
```typescript
const company = await Company.findById(companyId)
```

**After:**
```typescript
const companyIdStr = String(companyId)
if (!/^\d{6}$/.test(companyIdStr)) {
  return null // or throw error
}
const company = await Company.findOne({ id: companyIdStr })
```

### Pattern 2: populate() → Manual Join

**Before:**
```typescript
const location = await Location.findById(locationId)
  .populate('companyId', 'id name')
  .populate('adminId', 'id employeeId firstName lastName email')
  .lean()
```

**After:**
```typescript
const location = await Location.findOne({ id: locationIdStr }).lean()
if (location && location.companyId) {
  const company = await Company.findOne({ id: location.companyId }).lean()
  if (company) {
    location.companyId = toPlainObject(company)
  }
}
if (location && location.adminId) {
  const admin = await Employee.findOne({ id: location.adminId }).lean()
  if (admin) {
    location.adminId = toPlainObject(admin)
  }
}
```

### Pattern 3: convertCompanyIdToNumericId() → Direct Use

**Before:**
```typescript
const numericCompanyId = await convertCompanyIdToNumericId(employee.companyId)
if (numericCompanyId) {
  employee.companyId = numericCompanyId
}
```

**After:**
```typescript
// No conversion needed - companyId is already a string
const companyId = String(employee.companyId)
if (!/^\d{6}$/.test(companyId)) {
  console.warn('Invalid companyId format')
  return null
}
// Use companyId directly
```

### Pattern 4: ObjectId Construction → String Validation

**Before:**
```typescript
const objectId = new mongoose.Types.ObjectId(id)
const company = await Company.findById(objectId)
```

**After:**
```typescript
const companyIdStr = String(id)
if (!/^\d{6}$/.test(companyIdStr)) {
  return null
}
const company = await Company.findOne({ id: companyIdStr })
```

### Pattern 5: $in with ObjectIds → $in with Strings

**Before:**
```typescript
const objectIds = ids.map(id => new mongoose.Types.ObjectId(id))
const companies = await Company.find({ _id: { $in: objectIds } })
```

**After:**
```typescript
const stringIds = ids.map(id => String(id)).filter(id => /^\d{6}$/.test(id))
const companies = await Company.find({ id: { $in: stringIds } })
```

### Pattern 6: Aggregation Pipelines

**Before:**
```typescript
const pipeline = [
  { $match: { companyId: new mongoose.Types.ObjectId(companyId) } },
  { $lookup: { from: 'companies', localField: 'companyId', foreignField: '_id', as: 'company' } }
]
```

**After:**
```typescript
const pipeline = [
  { $match: { companyId: String(companyId) } },
  { $lookup: { from: 'companies', localField: 'companyId', foreignField: 'id', as: 'company' } }
]
```

## Functions to Update

### High Priority (Most Used)
1. `getEmployeeByEmail()` - Remove convertCompanyIdToNumericId calls
2. `getCompanyById()` - Already uses findOne({ id }), verify
3. `getProductById()` - ✅ Updated
4. `getLocationById()` - ✅ Updated
5. `isCompanyAdmin()` - Remove ObjectId constructions
6. `getCompanyByAdminEmail()` - Remove ObjectId usage

### Medium Priority
- All functions that use `findById()`
- All functions that use `populate()`
- All functions that use `convertCompanyIdToNumericId()`
- All aggregation pipelines

## Search and Replace Commands

Use these patterns to find and replace:

1. Find all `findById(`:
   ```bash
   grep -n "\.findById(" lib/db/data-access.ts
   ```

2. Find all `populate(`:
   ```bash
   grep -n "\.populate(" lib/db/data-access.ts
   ```

3. Find all `convertCompanyIdToNumericId`:
   ```bash
   grep -n "convertCompanyIdToNumericId" lib/db/data-access.ts
   ```

4. Find all `new mongoose.Types.ObjectId`:
   ```bash
   grep -n "new mongoose.Types.ObjectId" lib/db/data-access.ts
   ```

## Validation Helper

Create a helper function for ID validation:

```typescript
function validateStringId(id: any, fieldName: string = 'ID'): string | null {
  if (!id) return null
  const idStr = String(id)
  if (!/^\d{6}$/.test(idStr)) {
    console.warn(`[validateStringId] Invalid ${fieldName} format: ${idStr}`)
    return null
  }
  return idStr
}
```
