CREATE TABLE "event_outbox_entries_v1" (
	"name" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "event_outbox_entries_v1_unsent" ON "event_outbox_entries_v1" USING btree ("sent","created_at");