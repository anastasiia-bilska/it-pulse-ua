-- Least privilege for the scheduled collector (ADR 0004).
-- The role is created outside migrations so its password never touches the repo:
--   neon roles create --name collector --access read_only
-- read_only already grants SELECT on the owner's tables, now and later.
-- No DELETE, no TRUNCATE, no DDL: a leaked collector URL cannot destroy history.
grant insert on raw_item, sighting, fetch_log to collector;
grant update (last_seen) on sighting to collector;
grant insert, update (last_modified) on feed_state to collector;
