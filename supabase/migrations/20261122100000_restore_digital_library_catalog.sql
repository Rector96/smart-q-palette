-- Restore the Digital Library catalog in projects where its original migration
-- was not applied. Keep this migration idempotent for safe environment recovery.
create table if not exists public.digital_library (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cover_image_url text,
  preview_file_url text,
  full_file_url text,
  is_free boolean default false,
  summary text,
  author text,
  category text not null default 'General',
  target_level text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.digital_library add column if not exists summary text;
alter table public.digital_library add column if not exists author text;
alter table public.digital_library add column if not exists category text not null default 'General';
alter table public.digital_library add column if not exists target_level text;
alter table public.digital_library enable row level security;

drop policy if exists "Anyone can view library items" on public.digital_library;
drop policy if exists "Admins can insert library items" on public.digital_library;
drop policy if exists "Admins can update library items" on public.digital_library;
drop policy if exists "Admins can delete library items" on public.digital_library;

create policy "Anyone can view library items"
  on public.digital_library for select to public using (true);
create policy "Admins can insert library items"
  on public.digital_library for insert to authenticated
  with check ((select private.has_role((select auth.uid()), 'admin'::app_role)));
create policy "Admins can update library items"
  on public.digital_library for update to authenticated
  using ((select private.has_role((select auth.uid()), 'admin'::app_role)))
  with check ((select private.has_role((select auth.uid()), 'admin'::app_role)));
create policy "Admins can delete library items"
  on public.digital_library for delete to authenticated
  using ((select private.has_role((select auth.uid()), 'admin'::app_role)));

create index if not exists digital_library_category_created_at_idx
  on public.digital_library (category, created_at desc);
