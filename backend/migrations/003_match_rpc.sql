-- backend/migrations/003_match_rpc.sql
create or replace function match_memories(
  query_embedding vector(1536),
  match_count int default 6,
  filter_patient uuid default null,
  filter_department department default null
)
returns table (
  id uuid, patient_id uuid, content text, memory_type text,
  importance float, confidence float, created_at timestamptz,
  similarity float
)
language sql stable as $$
  select m.id, m.patient_id, m.content, m.memory_type,
         m.importance, m.confidence, m.created_at,
         1 - (m.embedding <=> query_embedding) as similarity
  from memories m
  where (filter_patient is null or m.patient_id = filter_patient)
    and (filter_department is null or m.department = filter_department)
  order by m.embedding <=> query_embedding
  limit match_count;
$$;