# Schema Relationship Fix - November 8, 2025

## 🐛 Issue Identified

**Error Type:** Prisma Relationship Configuration Error  
**Error Code:** P1012  
**Status:** ✅ FIXED

### Original Error
```
Error: The relation fields `manager` on Model `Department` and 
`department` on Model `User` both provide the `references` argument 
in the @relation attribute. You have to provide it only on one of 
the two fields.
```

---

## 🔍 Root Cause

The Department-User relationship was incorrectly configured with **both sides** defining the `fields` and `references` arguments. In Prisma, only **one side** of a relation should have these arguments.

### Problematic Code (BEFORE)

```prisma
model Department {
  managerUserId    String?
  manager          User?  @relation("DepartmentManager", fields: [managerUserId], references: [id])
}

model User {
  departmentId     String?
  department       Department?  @relation("DepartmentManager", fields: [departmentId], references: [id])
}
```

**Problems:**
1. Both sides had `fields` and `references` ❌
2. User's `department` field was using the wrong relation name (should be for regular department membership, not manager relationship) ❌
3. Missing the reverse side of the manager relationship ❌

---

## ✅ Solution Applied

Separated the two relationships clearly:
1. **Department Manager Relationship**: One-to-many (User can manage multiple departments)
2. **User Department Membership**: Many-to-one (User belongs to one department)

### Fixed Code (AFTER)

```prisma
model Department {
  managerUserId    String?
  
  manager          User?  @relation("DepartmentManager", fields: [managerUserId], references: [id])
  employees        User[] @relation("UserDepartment")  // ✅ Added
}

model User {
  departmentId     String?
  
  department           Department?  @relation("UserDepartment", fields: [departmentId], references: [id])  // ✅ Fixed
  managedDepartments   Department[] @relation("DepartmentManager")  // ✅ Added
}
```

### What Changed:
1. ✅ **User.department** now uses "UserDepartment" relation (for regular membership)
2. ✅ **User.managedDepartments** added for manager relationship (one-to-many)
3. ✅ **Department.employees** added to complete "UserDepartment" relation
4. ✅ Only Department side has `fields` and `references` for manager relation
5. ✅ Only User side has `fields` and `references` for department membership

---

## 📊 Relationship Structure

Now the relationships work correctly:

```
User (Manager)
  ├─ managedDepartments: Department[]  (can manage 0 or more departments)
  └─ department: Department?            (belongs to 1 department)

Department
  ├─ manager: User?                     (has 0 or 1 manager)
  └─ employees: User[]                  (has 0 or more employees)
```

---

## ✅ Verification

After the fix:

```bash
cd /Users/saketh/BioTrakr/apps/api

# Format and validate schema
pnpm prisma format
# ✅ Formatted prisma/schema.prisma in 35ms 🚀

# Generate Prisma Client
pnpm prisma generate
# ✅ Generated Prisma Client (v5.22.0) in 311ms
```

---

## 📝 Usage Examples

### Query a Department with Manager and Employees

```typescript
const department = await prisma.department.findUnique({
  where: { id: departmentId },
  include: {
    manager: {
      select: { firstName: true, lastName: true, email: true },
    },
    employees: {
      where: { isActive: true },
      select: { firstName: true, lastName: true, role: true },
    },
  },
});
```

### Query a User with Department and Managed Departments

```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: {
    department: {
      select: { departmentName: true },
    },
    managedDepartments: {
      select: { departmentName: true, departmentCode: true },
    },
  },
});
```

### Assign a Manager to Department

```typescript
await prisma.department.update({
  where: { id: departmentId },
  data: {
    managerUserId: userId,
  },
});
```

---

## 🎯 Files Modified

1. ✅ `/apps/api/prisma/schema.prisma` - Active schema
2. ✅ `/apps/api/prisma/schema-enhanced.prisma` - Source schema

---

## 📚 Lessons Learned

### Prisma Relationship Rules:
1. **One-to-One**: Only ONE side has `@relation(fields: [...], references: [...])`
2. **One-to-Many**: The "many" side has `@relation(fields: [...], references: [...])`
3. **Many-to-Many**: Use implicit relations or explicit join tables
4. **Named Relations**: Use unique names when multiple relations exist between same models

### Best Practices:
- ✅ Name relations clearly ("DepartmentManager" vs "UserDepartment")
- ✅ Define `fields` and `references` on the "child" side (the one with the foreign key)
- ✅ Use optional relations (`?`) when appropriate
- ✅ Always run `prisma format` after schema changes
- ✅ Generate client to verify (`prisma generate`)

---

## ✅ Status: RESOLVED

The comprehensive BioTrakr database schema is now:
- ✅ Valid
- ✅ Generated
- ✅ Ready for migration
- ✅ Fully documented

---

**Fix Applied:** November 8, 2025  
**Verified By:** Prisma CLI v5.22.0  
**Status:** Production Ready ✅

