# 0009. Skill taxonomy: aliases, candidates and an append-only decision log

- Status: accepted
- Date: 2026-11-13

## Context

The extractor stores skill names exactly as the model returned them (`extraction_skill.raw_name`,
ADR 0007). The same skill arrives as `JS`, `javascript`, `Java Script` or `джаваскрипт`.
Analytics need one canonical skill per spelling. Look-alikes must stay apart: `Java` is not
`JavaScript`, `C` is not `C#`, and `React` is not `React Native`.

New spellings appear every week, so the taxonomy must grow without re-extraction. It must also
grow without letting an LLM silently rewrite what the dashboard shows.

## Decision

**Storage** (migration 004):

- **`skill`**: the canonical skills, each with a URL-safe `slug`, a `name` and one of 12
  categories.
- **`skill_alias`**: the dictionary, with a unique normalized `alias` → `skill_id` and its
  `source` (`seed`, `llm_triage`, `human`).
- **`skill_candidate`**: normalized names that match no alias, waiting for triage, with vacancy
  counts and a status. `company_count` stays NULL until extraction knows the company.
- **`skill_decision`**: an append-only audit log of every triage decision (`mapped`, `new_skill`,
  `rejected`) with who decided, the confidence and the reason.

**Normalization.** One definition of "the same spelling": NFKC, collapse whitespace, trim, lower
case.

- It lives in the SQL function `normalize_skill_name` and in its TypeScript mirror
  `normalizeSkillName`. An integration test keeps the two in step.
- Every alias column has a check that it is already normalized, so a non-normalized alias can
  never sit there unmatched.
- `lower()` uses the ICU collation `und-x-icu`, so Cyrillic case folding doesn't depend on the
  database locale.

**Resolution is exact-match only.** The view `extraction_skill_resolved` joins each raw name's
normalized form to an alias. Anything else becomes a candidate.

- `resolveSkills` recomputes candidate counts from scratch. A re-run, or a new `extractor_version`
  that re-extracts everything, never inflates them.
- A vacancy counts once across its content versions.

**Human decisions win, without rewriting anything.**

- `skill_decision_effective` picks the decision in force per alias: any human decision beats any
  LLM one, then the newest wins.
- `skill_alias_effective` lets that decision override the dictionary. A rejected alias resolves to
  nothing.
- So a human can correct an LLM-written alias by appending one row. The extractor role never needs
  UPDATE or DELETE on aliases or decisions.

**Guard list.** `canMerge(alias, skillSlug)` is false when the alias is a look-alike sibling of
one of the skill's spellings: java/javascript, c/c++/c#, go/google, react/react native,
sql/nosql, .net/.net framework, angular/angularjs and similar.

- `recordDecision` enforces it for LLM decisions only. A human may still merge siblings.
- A unit test checks that the seed itself never puts two siblings under one skill.

**Seed.** `db/seed/skills.json` holds 371 common skills of the Ukrainian market with their
aliases, Cyrillic spellings included. It holds no vacancy text.

- `npm run seed:skills` upserts skills and adds aliases in one transaction, so it can be re-run
  after the seed grows.
- If a seed alias already points to another skill, the run fails instead of silently moving the
  alias.

**Seam for LLM triage (later work).** Triage reads `skill_candidate` where `status = 'pending'`
and calls `recordDecision`. That function:

- appends the decision;
- adds the alias for `mapped` and `new_skill`, creating the skill for `new_skill`;
- syncs the candidate's status with the decision in force.

**Grants.** The `extractor` role gets INSERT on `skill`, `skill_alias` and `skill_decision`, plus
INSERT and UPDATE of `last_seen`, `vacancy_count` and `status` on `skill_candidate`. It gets no
DELETE, and no UPDATE on decisions or aliases (ADR 0004).

## Consequences

- A taxonomy change never needs a re-extraction. Resolution happens at read time in a view.
- Two raw names of one vacancy can resolve to the same skill (`JS`, `JavaScript`), so analytics
  count distinct skills per vacancy.
- After an override, the alias table may still hold the LLM's alias row. The effective views are
  the truth, and the audit log explains the history.
- Something must call `resolveSkills` and run the seed:
  - the extract job should call `resolveSkills` at the end of each run;
  - the owner runs `npm run seed:skills` with the owner URL after migration 004, and again
    whenever the seed changes.
- Rejected:
  - Fuzzy or embedding matching in the resolver. It merges look-alikes, which is exactly the error
    the guard list exists for. Exact match plus triage keeps every merge explainable.
  - Normalizing in TypeScript only and storing the key on `extraction_skill`. That would change a
    table owned by the extractor, and the view would still need the key for old rows.
  - Updating aliases in place on override. That needs UPDATE for the pipeline role and loses the
    history the audit log keeps.
