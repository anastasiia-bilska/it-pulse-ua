# 0001. Raw layer: vacancy identity and deduplication

- Status: accepted
- Date: 2026-11-13

## Context

RSS feeds repeat entries. On DOU, a vacancy that gets "bumped" comes back as a new entry, and its guid changes with each bump: `…/vacancies/379802/?1794495304`, where the `?ts` part is the bump time. In a morning snapshot of the general DOU feed, 34 of 50 entries were bumps of older vacancies. About 8% of DOU vacancies (91 of 1101) appear in two category feeds at once. On Djinni, the guid is a URL whose slug changes when the title is edited.

We want three things at once:

- re-run extraction over the full history whenever the prompt improves (evals depend on this);
- avoid paying for extraction again on a bump that changed nothing;
- keep bump frequency as a signal, since it shows roles that are hard to fill.

## Decision

- **Identity** is `(source, external_id)`, where `external_id` is the numeric vacancy id: `/vacancies/(\d+)/` on DOU and the leading number of the slug on Djinni. The raw guid is not used.
- **`raw_item`** is append-only, with a unique key `(source, external_id, content_hash)` and inserts using `ON CONFLICT DO NOTHING`. `content_hash` is sha256 over the NFC-normalized, whitespace-collapsed title, description, link without query, and sorted categories. It leaves out pubDate, guid and the source feed.
- **`sighting`** stores one row per `(source, external_id, pub_date, feed)`. A new `pub_date` for a known vacancy means one bump. `first_seen`, `last_seen`, `bumps` and `feeds` come from the `vacancy` view.
- Only new `raw_item` rows go to extraction.

## Consequences

- A bump costs one `sighting` row, with no new content row and no extraction.
- An edited vacancy produces a new `raw_item` version. That is intended, because the extracted facts may have changed.
- `last_seen` means "last seen in a feed", not "still open". A vacancy drops out of a feed without being closed.
- Rejected: keying on the raw guid, because every bump would create a duplicate and a paid extraction. Also rejected: putting `feed` in the hash, because one vacancy in two categories would become two versions.
