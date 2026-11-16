-- «Запитай ринок» quota (ADR 0021): one row per accepted question, so the public endpoint can cap
-- questions per day and per client before it spends the Gemini quota extraction also needs.
-- client_hash is sha256(ip, day, secret salt): it can't be turned back into an IP, and it changes
-- every day, so it can't follow a visitor either.
create table agent_question (
  asked_on    date not null default current_date,
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  asked_at    timestamptz not null default now()
);

create index agent_question_day on agent_question (asked_on, client_hash);

-- Least privilege for the agent (ADR 0004, 0021). The role is created outside migrations:
--   neon roles create --name agent --access read_only
-- It reads the views and appends quota rows. Nothing else.
grant insert on agent_question to agent;
