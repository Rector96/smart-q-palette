-- Publicly readable book-cover images; book documents remain in their existing storage location.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-covers',
  'library-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Keep upload and management restricted to platform administrators.
create or replace function public.is_library_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role::text = 'admin'
  );
$$;

revoke all on function public.is_library_admin() from public;
grant execute on function public.is_library_admin() to authenticated;

drop policy if exists "Platform admins upload library covers" on storage.objects;
create policy "Platform admins upload library covers"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'library-covers'
  and public.is_library_admin()
);

drop policy if exists "Platform admins update library covers" on storage.objects;
create policy "Platform admins update library covers"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'library-covers'
  and public.is_library_admin()
)
with check (
  bucket_id = 'library-covers'
  and public.is_library_admin()
);

drop policy if exists "Platform admins delete library covers" on storage.objects;
create policy "Platform admins delete library covers"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'library-covers'
  and public.is_library_admin()
);
