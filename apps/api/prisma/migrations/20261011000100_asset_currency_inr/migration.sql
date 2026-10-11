-- Asset costs are entered in rupees (the form labels them ₹ and the Excel
-- import reads ₹, lakh and crore), but the column defaulted to USD and no
-- code ever set it, so every stored "USD" is really INR.

-- AlterTable
ALTER TABLE "assets" ALTER COLUMN "currencyCode" SET DEFAULT 'INR';

-- Relabel existing rows: their amounts were always rupees.
UPDATE "assets" SET "currencyCode" = 'INR' WHERE "currencyCode" = 'USD';
