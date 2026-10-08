-- A migration: the SQL that brings a database from the previous migration's structure to this one's.
-- `yarn db:generate` wrote it from src/lib/db/schema.ts, and `yarn db:migrate` runs it once against
-- each database, then records it there so it is skipped on every later run.
--
-- Once a migration has run against a database that matters, change the structure by editing
-- schema.ts and generating a new migration. Editing or deleting this file would leave that database
-- out of step with the files.

CREATE TABLE "midnight_erc20_vault_deposits_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"erc20_address" text NOT NULL,
	"amount" bigint NOT NULL
);
