-- Storage access for the digital library.
-- Create library-previews (public) and library (private) buckets in the
-- Supabase Dashboard before enabling PDF uploads. Bucket creation is not done in SQL.

drop policy if exists "Library previews are publicly readable" on storage.objects;
create policy "Library previews are publicly readable"
on storage.objects for select to public
using (bucket_id = 'library-previews');

drop policy if exists "Admins upload library previews" on storage.objects;
create policy "Admins upload library previews"
on storage.objects for insert to authenticated
with check (bucket_id = 'library-previews' and private.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins update library previews" on storage.objects;
create policy "Admins update library previews"
on storage.objects for update to authenticated
using (bucket_id = 'library-previews' and private.has_role(auth.uid(), 'admin'::app_role))
with check (bucket_id = 'library-previews' and private.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins delete library previews" on storage.objects;
create policy "Admins delete library previews"
on storage.objects for delete to authenticated
using (bucket_id = 'library-previews' and private.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins upload full library books" on storage.objects;
create policy "Admins upload full library books"
on storage.objects for insert to authenticated
with check (bucket_id = 'library' and private.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins update full library books" on storage.objects;
create policy "Admins update full library books"
on storage.objects for update to authenticated
using (bucket_id = 'library' and private.has_role(auth.uid(), 'admin'::app_role))
with check (bucket_id = 'library' and private.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins delete full library books" on storage.objects;
create policy "Admins delete full library books"
on storage.objects for delete to authenticated
using (bucket_id = 'library' and private.has_role(auth.uid(), 'admin'::app_role));
