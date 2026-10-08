-- Wakes the outbox entry processor as soon as an entry's transaction commits: pg_notify inside a
-- transaction is delivered on commit, never before.
CREATE FUNCTION event_outbox_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('event_outbox', NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER event_outbox_entries_v1_notify
  AFTER INSERT ON event_outbox_entries_v1
  FOR EACH ROW EXECUTE FUNCTION event_outbox_notify();
