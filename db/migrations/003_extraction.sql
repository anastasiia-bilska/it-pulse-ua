-- Extraction layer (ADR 0007). Append-only like the raw layer: one row per raw content version
-- per extractor version. A prompt or model change bumps extractor_version, and the queue
-- re-extracts everything; old rows stay for comparison.
--
-- NULL means "not stated in the vacancy". The model never guesses.

create table extraction (
  id                   bigint generated always as identity primary key,
  raw_item_id          bigint not null references raw_item (id),
  extractor_version    text not null,
  model                text not null,
  prompt_hash          text not null,
  extracted_at         timestamptz not null default now(),
  latency_ms           int check (latency_ms >= 0),
  tokens_in            int check (tokens_in >= 0),
  tokens_out           int check (tokens_out >= 0),

  role                 text check (role in (
                         'backend', 'frontend', 'fullstack', 'mobile', 'ml_ai', 'data_engineering',
                         'data_analytics', 'devops', 'qa', 'security', 'gamedev', 'embedded',
                         'design', 'product', 'project', 'business_analysis', 'marketing', 'sales',
                         'hr', 'support', 'management', 'other')),
  seniority            text check (seniority in ('intern', 'junior', 'middle', 'senior', 'lead')),
  salary_min           numeric check (salary_min > 0),
  salary_max           numeric check (salary_max > 0),
  salary_currency      text check (salary_currency in ('USD', 'EUR', 'UAH')),
  salary_period        text check (salary_period in ('hour', 'month', 'year')),
  work_format          text check (work_format in ('remote', 'office', 'hybrid')),
  locations            text[] not null default '{}',
  abroad_allowed       boolean,
  english              text check (english in ('none', 'basic', 'intermediate', 'upper', 'fluent')),
  experience_years_min numeric check (experience_years_min between 0 and 30),
  company_type         text check (company_type in ('product', 'outsource', 'outstaff')),
  domain               text check (domain in (
                         'fintech', 'igaming', 'gamedev', 'ecommerce', 'healthtech', 'edtech',
                         'adtech', 'martech', 'defense', 'govtech', 'logistics', 'telecom',
                         'automotive', 'cybersecurity', 'ai', 'other')),
  -- Verbatim quotes backing the risky fields (salary, experience, english, domain). Stays in
  -- the database only: raw vacancy text never goes to the public repo.
  evidence             jsonb not null default '{}',

  unique (raw_item_id, extractor_version),
  constraint salary_range_ordered check (salary_min <= salary_max),
  constraint salary_has_currency check (
    (salary_min is null and salary_max is null) = (salary_currency is null)),
  constraint salary_has_period check ((salary_currency is null) = (salary_period is null))
);

-- Skill names exactly as the model returned them. The taxonomy (alias -> canonical skill) maps
-- them later, so a taxonomy change never needs a re-extraction.
create table extraction_skill (
  extraction_id bigint not null references extraction (id),
  raw_name      text not null check (length(raw_name) between 1 and 100),
  required      boolean not null,
  primary key (extraction_id, raw_name)
);

-- Retry queue. After the extractor's attempt limit a row is a dead letter and is skipped.
create table extraction_error (
  raw_item_id       bigint not null references raw_item (id),
  extractor_version text not null,
  attempts          int not null default 1 check (attempts >= 1),
  last_error        text not null,
  last_attempt_at   timestamptz not null default now(),
  primary key (raw_item_id, extractor_version)
);

-- One row per finished job run. Feeds the freshness banner in the UI (pipeline_status).
create table job_run (
  id          bigint generated always as identity primary key,
  job         text not null check (job in ('extract')),
  started_at  timestamptz not null,
  finished_at timestamptz not null default now(),
  status      text not null check (status in ('ok', 'quota_exhausted', 'error')),
  processed   int not null default 0 check (processed >= 0),
  failed      int not null default 0 check (failed >= 0),
  backlog     int not null check (backlog >= 0),
  check (started_at <= finished_at)
);

-- What the dashboard and the agent read: each vacancy's latest content version with its latest
-- extraction. After a version bump the previous extraction stays visible until the queue
-- catches up, so the dashboard never goes blank.
create view vacancy_current as
with latest_raw as (
  select distinct on (source, external_id) id, source, external_id, payload
  from raw_item
  order by source, external_id, id desc
),
latest_extraction as (
  select distinct on (raw_item_id) *
  from extraction
  order by raw_item_id, id desc
)
select vacancy.source,
       vacancy.external_id,
       vacancy.first_seen,
       vacancy.last_seen,
       vacancy.bumps,
       vacancy.feeds,
       latest_raw.id                  as raw_item_id,
       latest_raw.payload ->> 'title' as title,
       latest_raw.payload ->> 'link'  as link,
       latest_extraction.id           as extraction_id,
       latest_extraction.extractor_version,
       latest_extraction.role,
       latest_extraction.seniority,
       latest_extraction.salary_min,
       latest_extraction.salary_max,
       latest_extraction.salary_currency,
       latest_extraction.salary_period,
       latest_extraction.work_format,
       latest_extraction.locations,
       latest_extraction.abroad_allowed,
       latest_extraction.english,
       latest_extraction.experience_years_min,
       latest_extraction.company_type,
       latest_extraction.domain
from vacancy
join latest_raw using (source, external_id)
left join latest_extraction on latest_extraction.raw_item_id = latest_raw.id;

-- Latest state per job, for the UI freshness indicator.
create view pipeline_status as
select job,
       (array_agg(status order by id desc))[1]   as last_status,
       (array_agg(backlog order by id desc))[1]  as backlog,
       max(finished_at)                          as last_run_at,
       max(finished_at) filter (where status = 'ok') as last_ok_at
from job_run
group by job;

-- Least privilege for the extractor (ADR 0004, 0007). The role is created outside migrations:
--   neon roles create --name extractor --access read_only
-- It reads raw data and only appends extraction results. It can't touch the raw layer, and
-- the collector can't touch extraction results.
grant insert on extraction, extraction_skill, job_run to extractor;
grant insert, update (attempts, last_error, last_attempt_at) on extraction_error to extractor;
