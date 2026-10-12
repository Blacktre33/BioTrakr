-- Checks the edit history's hash chain on a real database (CI runs this
-- after the migrations). Everything happens in a transaction that is
-- rolled back. Run with: psql -v ON_ERROR_STOP=1 -f audit-chain.sql
BEGIN;

INSERT INTO "organizations" ("id", "name", "type", "updatedAt")
VALUES ('audit-test-org', 'Audit test hospital', 'HOSPITAL', now());

INSERT INTO "audit_events" ("id", "organizationId", "actorRole", "action", "entityType", "entityId", "summary", "changes")
VALUES
  ('audit-test-1', 'audit-test-org', 'system', 'asset.created', 'asset', 'dev-1', 'Added TAG-1 · Syringe pump', NULL),
  ('audit-test-2', 'audit-test-org', 'admin', 'asset.updated', 'asset', 'dev-1', 'Edited TAG-1: Room',
   '[{"field": "currentRoomId", "label": "Room", "from": "ICU-1", "to": "OT 2"}]'),
  ('audit-test-3', 'audit-test-org', 'engineer', 'asset.status_changed', 'asset', 'dev-1', 'TAG-1: Active → Quarantined', NULL);

DO $$
DECLARE
  r RECORD;
  first RECORD;
BEGIN
  SELECT * INTO r FROM "audit_chain_check"('audit-test-org');
  IF r."entries" <> 3 OR r."lastSeq" <> 3 OR r."brokenAt" IS NOT NULL THEN
    RAISE EXCEPTION 'A new chain should be intact, got %', r;
  END IF;
  SELECT "seq", "prevHash" INTO first FROM "audit_events" WHERE "id" = 'audit-test-1';
  IF first."seq" <> 1 OR first."prevHash" <> repeat('0', 64) THEN
    RAISE EXCEPTION 'The first entry should start the chain, got %', first;
  END IF;
  IF r."lastHash" <> (SELECT "hash" FROM "audit_events" WHERE "id" = 'audit-test-3') THEN
    RAISE EXCEPTION 'The head should be the last entry';
  END IF;

  -- The same answer in any session time zone.
  SET LOCAL TIME ZONE 'Asia/Kolkata';
  SELECT * INTO r FROM "audit_chain_check"('audit-test-org');
  IF r."brokenAt" IS NOT NULL THEN
    RAISE EXCEPTION 'The chain should not depend on the time zone, got %', r;
  END IF;

  -- Nobody changes or removes an entry through the application's access.
  BEGIN
    UPDATE "audit_events" SET "summary" = 'Edited TAG-1: nothing' WHERE "id" = 'audit-test-2';
    RAISE EXCEPTION 'An entry could be changed';
  EXCEPTION WHEN restrict_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM "audit_events" WHERE "id" = 'audit-test-2';
    RAISE EXCEPTION 'An entry could be deleted';
  EXCEPTION WHEN restrict_violation THEN NULL;
  END;
END $$;

-- Someone with full database access switches the guard off and rewrites
-- an entry: the check names it.
SAVEPOINT tamper;
ALTER TABLE "audit_events" DISABLE TRIGGER "audit_events_no_update_or_delete";
UPDATE "audit_events" SET "summary" = 'Edited TAG-1: nothing' WHERE "id" = 'audit-test-2';
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT * INTO r FROM "audit_chain_check"('audit-test-org');
  IF r."brokenAt" IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'A rewritten entry should break the chain at 2, got %', r;
  END IF;
END $$;
ROLLBACK TO SAVEPOINT tamper;

-- Or deletes one from the middle.
SAVEPOINT tamper;
ALTER TABLE "audit_events" DISABLE TRIGGER "audit_events_no_update_or_delete";
DELETE FROM "audit_events" WHERE "id" = 'audit-test-2';
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT * INTO r FROM "audit_chain_check"('audit-test-org');
  IF r."brokenAt" IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'A removed entry should break the chain at 3, got %', r;
  END IF;
END $$;
ROLLBACK TO SAVEPOINT tamper;

ROLLBACK;
\echo 'Audit chain checks passed'
