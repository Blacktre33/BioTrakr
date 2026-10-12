-- The edit history (audit trail): one row per change to a record, never
-- edited or deleted. Each hospital's rows form a hash chain: the database
-- numbers each new row and stores SHA-256 over its content and the
-- previous row's hash, so a row altered or removed afterwards (even by
-- someone with direct database access) no longer matches.
-- audit_chain_check() recomputes the chain and names the first bad row.

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seq" BIGINT NOT NULL DEFAULT 0,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorRole" VARCHAR(40) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" TEXT NOT NULL,
    "assetId" TEXT,
    "summary" VARCHAR(1000) NOT NULL,
    "changes" JSONB,
    "reason" TEXT,
    "prevHash" CHAR(64) NOT NULL DEFAULT '',
    "hash" CHAR(64) NOT NULL DEFAULT '',

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_organizationId_occurredAt_idx" ON "audit_events"("organizationId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "audit_events_organizationId_entityType_entityId_idx" ON "audit_events"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_events_assetId_occurredAt_idx" ON "audit_events"("assetId", "occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_organizationId_seq_key" ON "audit_events"("organizationId", "seq");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The hash of a row: its content, its place in the chain and the hash
-- before it. Times are UTC to the millisecond, so the text is the same
-- whatever the session's time zone.
CREATE FUNCTION "audit_event_hash"(e "audit_events") RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws(E'\x1f',
    e."organizationId",
    e."seq"::text,
    to_char(e."occurredAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS'),
    coalesce(e."actorId", ''),
    e."actorRole",
    e."action",
    e."entityType",
    e."entityId",
    coalesce(e."assetId", ''),
    e."summary",
    coalesce(e."changes"::text, ''),
    coalesce(e."reason", ''),
    e."prevHash"
  ), 'UTF8')), 'hex');
$$;

-- Seals each new row: the next number in its hospital's chain, the time,
-- and the hashes. A per-hospital lock makes concurrent writers take turns,
-- so the chain never forks; the application writes its rows last in each
-- transaction, so the lock is held only until commit.
CREATE FUNCTION "audit_event_seal"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  last RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('audit_events:' || NEW."organizationId", 0));
  SELECT "seq", "hash" INTO last
    FROM "audit_events"
   WHERE "organizationId" = NEW."organizationId"
   ORDER BY "seq" DESC
   LIMIT 1;
  NEW."seq" := coalesce(last."seq", 0) + 1;
  NEW."prevHash" := coalesce(last."hash", repeat('0', 64));
  NEW."occurredAt" := date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC');
  NEW."hash" := "audit_event_hash"(NEW);
  RETURN NEW;
END;
$$;

CREATE TRIGGER "audit_events_seal"
  BEFORE INSERT ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_event_seal"();

CREATE TRIGGER "audit_events_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "forbid_record_change"();

CREATE TRIGGER "audit_events_no_truncate"
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_record_change"();

-- Recomputes a hospital's chain. brokenAt is the first row whose hash, link
-- to the row before, or number does not match (null when intact); lastSeq
-- and lastHash are the head, worth writing down: rows removed from the end
-- leave no gap, but no longer reach a head recorded earlier.
CREATE FUNCTION "audit_chain_check"(org TEXT)
RETURNS TABLE ("entries" BIGINT, "lastSeq" BIGINT, "lastHash" TEXT, "brokenAt" BIGINT)
LANGUAGE sql STABLE AS $$
  WITH c AS (
    SELECT e."seq",
           e."hash"::text AS "hash",
           e."prevHash"::text AS "prevHash",
           "audit_event_hash"(e) AS expected,
           lag(e."hash"::text) OVER w AS before,
           lag(e."seq") OVER w AS before_seq
      FROM "audit_events" e
     WHERE e."organizationId" = org
    WINDOW w AS (ORDER BY e."seq")
  )
  SELECT count(*),
         max(c."seq"),
         (SELECT h."hash" FROM c h ORDER BY h."seq" DESC LIMIT 1),
         min(c."seq") FILTER (
           WHERE c."hash" <> c.expected
              OR c."prevHash" <> coalesce(c.before, repeat('0', 64))
              OR c."seq" <> coalesce(c.before_seq, 0) + 1
         )
    FROM c;
$$;
