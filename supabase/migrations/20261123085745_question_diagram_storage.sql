insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-diagrams', 'question-diagrams', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Question diagrams are publicly readable"
on storage.objects for select to public
using (bucket_id = 'question-diagrams');

create policy "Only admins upload question diagrams"
on storage.objects for insert to authenticated
with check (bucket_id = 'question-diagrams' and private.has_role((select auth.uid()), 'admin'::app_role));

create policy "Only admins update question diagrams"
on storage.objects for update to authenticated
using (bucket_id = 'question-diagrams' and private.has_role((select auth.uid()), 'admin'::app_role))
with check (bucket_id = 'question-diagrams' and private.has_role((select auth.uid()), 'admin'::app_role));

create policy "Only admins delete question diagrams"
on storage.objects for delete to authenticated
using (bucket_id = 'question-diagrams' and private.has_role((select auth.uid()), 'admin'::app_role));
