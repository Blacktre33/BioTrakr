-- Training: sessions on medical equipment, the devices they covered and who
-- attended, with the attendance sheet or certificates attached. Replaces the
-- unused training_records table.

-- CreateEnum
CREATE TYPE "TrainingKind" AS ENUM ('OPERATOR', 'MAINTENANCE', 'REFRESHER', 'INDUCTION');

-- CreateEnum
CREATE TYPE "TrainingAssessment" AS ENUM ('PASSED', 'NEEDS_RETRAINING', 'NOT_ASSESSED');

-- AlterEnum
ALTER TYPE "DocumentCategory" ADD VALUE 'TRAINING';

-- training_records was in the first schema but no version of BioTrakr ever
-- wrote to it. Stop rather than lose rows someone added by hand.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "training_records") THEN
    RAISE EXCEPTION 'training_records has rows that BioTrakr did not write. Copy them into training_sessions and training_attendees, empty the table, then run the migration again.';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "training_records" DROP CONSTRAINT "training_records_assetId_fkey";

-- DropForeignKey
ALTER TABLE "training_records" DROP CONSTRAINT "training_records_userId_fkey";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "trainingSessionId" TEXT;

-- DropTable
DROP TABLE "training_records";

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "heldOn" TIMESTAMP(3) NOT NULL,
    "kind" "TrainingKind" NOT NULL,
    "topic" VARCHAR(300) NOT NULL,
    "equipment" VARCHAR(200) NOT NULL,
    "trainer" VARCHAR(200) NOT NULL,
    "trainerFrom" VARCHAR(200),
    "durationHours" DECIMAL(4,1),
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_session_devices" (
    "sessionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "training_session_devices_pkey" PRIMARY KEY ("sessionId","assetId")
);

-- CreateTable
CREATE TABLE "training_attendees" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "designation" VARCHAR(120),
    "department" VARCHAR(120),
    "assessment" "TrainingAssessment" NOT NULL DEFAULT 'NOT_ASSESSED',

    CONSTRAINT "training_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_sessions_organizationId_heldOn_idx" ON "training_sessions"("organizationId", "heldOn" DESC);

-- CreateIndex
CREATE INDEX "training_session_devices_assetId_idx" ON "training_session_devices"("assetId");

-- CreateIndex
CREATE INDEX "training_attendees_sessionId_idx" ON "training_attendees"("sessionId");

-- CreateIndex
CREATE INDEX "documents_trainingSessionId_idx" ON "documents"("trainingSessionId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "training_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_session_devices" ADD CONSTRAINT "training_session_devices_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_session_devices" ADD CONSTRAINT "training_session_devices_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendees" ADD CONSTRAINT "training_attendees_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A document belongs to at most one record (now including a training
-- session), and to a device, a contract or a training session.
ALTER TABLE "documents" DROP CONSTRAINT "documents_target_check";
ALTER TABLE "documents" ADD CONSTRAINT "documents_target_check" CHECK (
  num_nonnulls("calibrationRecordId", "safetyTestRecordId", "contractId", "workOrderId", "condemnationId", "trainingSessionId") <= 1
  AND ("assetId" IS NOT NULL OR "contractId" IS NOT NULL OR "trainingSessionId" IS NOT NULL)
);

-- Training records are kept: a session is corrected, never deleted
-- (forbid_record_change() is from 20261011000200).
CREATE TRIGGER "training_sessions_no_delete"
  BEFORE DELETE ON "training_sessions"
  FOR EACH ROW EXECUTE FUNCTION "forbid_record_change"();

CREATE TRIGGER "training_sessions_no_truncate"
  BEFORE TRUNCATE ON "training_sessions"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_record_change"();
