-- Raw layer: append-only vacancy content + feed sightings + collector telemetry.

-- One row per distinct content version of a vacancy. Never updated.
-- Re-running extraction over this table is how evals stay reproducible.
create table raw_item (
  id           bigint generated always as identity primary key,
  source       text not null check (source in ('dou', 'djinni')),
  external_id  text not null,          -- numeric vacancy id, stable across bumps and slug edits
  content_hash text not null,          -- sha256(title, description, clean link, categories)
  payload      jsonb not null,         -- {title, description, link, categories}
  first_seen   timestamptz not null default now(),
  unique (source, external_id, content_hash)
);

-- One row per (vacancy, pubDate, feed). A new pub_date for a known vacancy = a bump.
-- feed is in the key because ~8% of DOU vacancies sit in two categories.
create table sighting (
  source      text not null,
  external_id text not null,
  pub_date    timestamptz not null,
  feed        text not null,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (source, external_id, pub_date, feed)
);

create table feed_state (
  feed          text primary key,
  last_modified text                  -- echoed back as If-Modified-Since
);

-- Coverage telemetry: gap = the oldest item of this fetch was never seen before,
-- i.e. the feed rolled past us between runs. Tune the poll interval from this.
create table fetch_log (
  id         bigint generated always as identity primary key,
  feed       text not null,
  fetched_at timestamptz not null default now(),
  status     int not null,
  items      int not null default 0,
  new_items  int not null default 0,
  gap        boolean not null default false
);

create view vacancy as
select source, external_id,
       min(first_seen)                  as first_seen,
       max(last_seen)                   as last_seen,
       count(distinct pub_date) - 1     as bumps,
       array_agg(distinct feed)         as feeds
from sighting
group by source, external_id;
