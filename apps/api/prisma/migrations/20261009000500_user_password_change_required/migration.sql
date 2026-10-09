-- Accounts created or reset by an administrator must choose their own password.


-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordChangeRequired" BOOLEAN NOT NULL DEFAULT false;

