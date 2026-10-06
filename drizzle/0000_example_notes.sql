-- A migration: the SQL that brings a database from the previous migration's structure to this one's.
-- `yarn db:generate` wrote it from src/lib/db/schema.ts, and `yarn db:migrate` runs it once against
-- each database, then records it there so it is skipped on every later run.
--
-- Once a migration has run against a database that matters, change the structure by editing
-- schema.ts and generating a new migration. Editing or deleting this file would leave that database
-- out of step with the files.

CREATE TABLE "example_notes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "example_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
