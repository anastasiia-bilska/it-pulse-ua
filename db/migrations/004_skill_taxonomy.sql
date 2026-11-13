-- Skill taxonomy (ADR 0009): maps the raw skill names in extraction_skill to canonical skills.
-- Everything here is append-only for the pipeline. A human override is a new decision row, never
-- an edit, and the views below decide which row wins.

-- The one definition of "the same spelling", used by every alias column and by the resolver
-- view. src/taxonomy/normalize.ts mirrors it, and an integration test keeps the two in step.
-- lower() uses an explicit ICU collation, so case folding doesn't depend on the database locale.
create function normalize_skill_name(name text) returns text
language sql immutable parallel safe
return lower(btrim(regexp_replace(normalize(name, nfkc), '\s+', ' ', 'g')) collate "und-x-icu");

create table skill (
  id         bigint generated always as identity primary key,
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name       text not null,
  category   text not null check (category in (
               'language', 'framework', 'database', 'cloud', 'devops', 'data_ml', 'testing',
               'mobile', 'frontend', 'tool', 'methodology', 'other')),
  created_at timestamptz not null default now()
);

-- The dictionary: every known spelling of a skill. Written by the seed and by triage.
create table skill_alias (
  alias      text primary key check (alias = normalize_skill_name(alias)),
  skill_id   bigint not null references skill (id),
  source     text not null check (source in ('seed', 'llm_triage', 'human')),
  created_at timestamptz not null default now()
);

-- Spellings that match no alias, waiting for triage. Counts are recomputed, never incremented,
-- so re-running the resolver or re-extracting vacancies doesn't inflate them.
create table skill_candidate (
  alias         text primary key check (alias = normalize_skill_name(alias)),
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  vacancy_count int not null check (vacancy_count >= 0),
  company_count int check (company_count >= 0),  -- NULL until extraction knows the company
  status        text not null default 'pending'
                  check (status in ('pending', 'mapped', 'new_skill', 'rejected'))
);

-- Audit log of every triage decision, by the LLM or by a human. Never updated.
create table skill_decision (
  id         bigint generated always as identity primary key,
  alias      text not null check (alias = normalize_skill_name(alias)),
  decision   text not null check (decision in ('mapped', 'new_skill', 'rejected')),
  skill_id   bigint references skill (id),
  decided_by text not null check (decided_by in ('llm', 'human')),
  confidence numeric check (confidence between 0 and 1),
  reason     text not null,
  decided_at timestamptz not null default now(),
  constraint rejected_has_no_skill check ((decision = 'rejected') = (skill_id is null))
);

-- The decision in force per alias: any human decision beats any LLM one, then the newest wins.
-- Ordered by id, not decided_at: now() is the same for every row of one transaction.
create view skill_decision_effective as
select distinct on (alias) alias, decision, skill_id, decided_by, confidence, reason, decided_at
from skill_decision
order by alias, decided_by = 'human' desc, id desc;

-- alias -> skill as the pipeline sees it. A decision overrides the dictionary, so a human can
-- correct an LLM-written alias without rewriting it; a rejected alias resolves to nothing.
create view skill_alias_effective as
select alias, skill_id
from skill_decision_effective
where skill_id is not null
union all
select alias, skill_id
from skill_alias
where not exists (
  select 1 from skill_decision_effective decided where decided.alias = skill_alias.alias);

-- Raw skill names with their canonical skill, or NULL while the name is unknown. Two raw names
-- of one extraction can resolve to the same skill ("JS", "JavaScript"): count distinct skills.
create view extraction_skill_resolved as
select extraction_skill.extraction_id,
       extraction_skill.raw_name,
       extraction_skill.required,
       normalize_skill_name(extraction_skill.raw_name) as alias,
       skill.id                                        as skill_id,
       skill.slug                                      as skill_slug,
       skill.name                                      as skill_name,
       skill.category                                  as skill_category
from extraction_skill
left join skill_alias_effective effective
       on effective.alias = normalize_skill_name(extraction_skill.raw_name)
left join skill on skill.id = effective.skill_id;

-- Least privilege for the extractor (ADR 0004, 0009): it resolves skills and records LLM triage,
-- appending only. It can't delete anything or rewrite a decision or an alias.
grant insert on skill, skill_alias, skill_decision to extractor;
grant insert, update (last_seen, vacancy_count, status) on skill_candidate to extractor;
