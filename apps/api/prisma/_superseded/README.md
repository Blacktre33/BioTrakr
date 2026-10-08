# Superseded — safe to delete

These files were replaced by `../migrations/20261008000000_baseline` and
`../migrations/20261008000100_timescaledb`. They described three
conflicting versions of the database (the v1 init migration, the v2
`schema.prisma`, and `001_asset_registry_schema.sql`) and could not build the
schema the API uses. Nothing reads this folder.

Delete it once the new migrations have been applied successfully:

```bash
git rm -r apps/api/prisma/_superseded
```
