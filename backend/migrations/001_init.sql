-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- Enums
create type user_role as enum ('senior_doctor','incoming_doctor','nurse','icu_specialist');
create type department as enum ('icu','emergency','cardiology','neurology','pediatrics','surgery');
create type severity as enum ('low','medium','high','critical');
create type alert_type as enum ('critical','unresolved','contradiction','escalation');

-- Users profile (Supabase Auth already gives us auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null,
  department department not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- Patients
create table patients (
  id uuid primary key default uuid_generate_v4(),
  mrn text unique not null,                  -- medical record number
  name text not null,
  age int,
  sex text,
  department department not null,
  bed text,
  admission_date timestamptz default now(),
  diagnosis text,
  stability_score int default 80,            -- 0-100
  primary_doctor_id uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Handoffs
create table handoffs (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid references patients(id) on delete cascade,
  outgoing_doctor_id uuid references profiles(id),
  incoming_doctor_id uuid references profiles(id),
  raw_transcript text not null,
  voice_url text,
  department department not null,
  shift_type text,                           -- 'day' | 'night'
  created_at timestamptz default now(),

  -- AI extracted fields (jsonb for flexibility)
  structured_summary jsonb,                  -- {vitals, meds, plan}
  risks jsonb,                               -- [{risk, severity}]
  hidden_concerns jsonb,                     -- [{concern, confidence}]
  unresolved_issues jsonb,
  monitoring_priorities jsonb,
  confidence_score float,                    -- doctor's uncertainty 0-1
  escalation_risk severity
);

-- Memories (the Hindsight-backed core)
create table memories (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid references patients(id) on delete cascade,
  handoff_id uuid references handoffs(id) on delete set null,
  author_id uuid references profiles(id),
  department department not null,
  memory_type text not null,                 -- 'concern' | 'observation' | 'plan' | 'tacit'
  content text not null,
  embedding vector(1536),                    -- text-embedding-3-small
  importance float default 0.5,              -- 0-1
  confidence float default 0.5,
  tags text[],
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index memories_embedding_idx on memories using ivfflat (embedding vector_cosine_ops) with (lists=100);
create index memories_patient_idx on memories(patient_id);
create index memories_dept_idx on memories(department);

-- Alerts
create table alerts (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid references patients(id) on delete cascade,
  alert_type alert_type not null,
  severity severity not null,
  title text not null,
  message text not null,
  source_memory_id uuid references memories(id),
  acknowledged boolean default false,
  acknowledged_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Audit logs (cascadeflow telemetry)
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id),
  patient_id uuid references patients(id),
  action text not null,                      -- 'extract' | 'retrieve' | 'ask' | 'escalate'
  model_used text,                           -- e.g. 'groq/llama-3.1-8b'
  provider text,                             -- 'groq' | 'openrouter'
  input_tokens int,
  output_tokens int,
  latency_ms int,
  cost_usd numeric(10,6),
  escalation_reason text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Timeline events (for UI)
create table timeline_events (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid references patients(id) on delete cascade,
  event_type text not null,                  -- 'handoff' | 'alert' | 'memory' | 'note'
  title text not null,
  description text,
  actor_id uuid references profiles(id),
  ref_id uuid,                               -- points to handoff/alert/memory
  created_at timestamptz default now()
);

-- Updated_at trigger
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger patients_updated before update on patients
  for each row execute procedure set_updated_at();