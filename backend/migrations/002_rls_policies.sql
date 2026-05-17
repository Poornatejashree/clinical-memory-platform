alter table profiles enable row level security;
alter table patients enable row level security;
alter table handoffs enable row level security;
alter table memories enable row level security;
alter table alerts enable row level security;
alter table audit_logs enable row level security;
alter table timeline_events enable row level security;

-- Profiles: users read/write their own
create policy "own profile" on profiles
  for all using (auth.uid() = id);

-- Patients: department-scoped read
create policy "dept patients" on patients
  for select using (
    department = (select department from profiles where id = auth.uid())
  );

-- Memories: same dept can read
create policy "dept memories" on memories
  for select using (
    department = (select department from profiles where id = auth.uid())
  );

-- Inserts via service role only (backend bypasses RLS)
-- Added later: SELECT policies for handoffs, alerts, timeline_events
create policy "dept handoffs" on handoffs
  for select using (
    department = (select department from profiles where id = auth.uid())
  );

create policy "dept alerts" on alerts
  for select using (
    patient_id in (
      select id from patients where department = (select department from profiles where id = auth.uid())
    )
  );

create policy "dept timeline" on timeline_events
  for select using (
    patient_id in (
      select id from patients where department = (select department from profiles where id = auth.uid())
    )
  );