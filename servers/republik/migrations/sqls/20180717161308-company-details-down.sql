ALTER TABLE "companies"
  DROP COLUMN IF EXISTS "invoiceAddress",
  DROP COLUMN IF EXISTS "invoiceVatin",
  DROP COLUMN IF EXISTS "invoiceBankdetails";
