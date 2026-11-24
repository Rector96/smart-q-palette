-- Store a public diagram URL on each question and allow administrators to upload
-- optimized question diagrams to a dedicated public-read bucket.
alter table public.questions
  add column if not exists diagram_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-diagrams',
  'question-diagrams',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read question diagrams" on storage.objects;
create policy "Public can read question diagrams"
on storage.objects for select
to public
using (bucket_id = 'question-diagrams');

drop policy if exists "Admins can upload question diagrams" on storage.objects;
create policy "Admins can upload question diagrams"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'question-diagrams'
  and public.is_current_user_admin()
);

drop policy if exists "Admins can update question diagrams" on storage.objects;
create policy "Admins can update question diagrams"
on storage.objects for update
to authenticated
using (
  bucket_id = 'question-diagrams'
  and public.is_current_user_admin()
)
with check (
  bucket_id = 'question-diagrams'
  and public.is_current_user_admin()
);

drop policy if exists "Admins can delete question diagrams" on storage.objects;
create policy "Admins can delete question diagrams"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'question-diagrams'
  and public.is_current_user_admin()
);
