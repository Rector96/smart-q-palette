-- Add searchable catalog metadata for literature and other learning resources.
ALTER TABLE public.digital_library
  ADD COLUMN IF NOT EXISTS author text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS target_level text;

CREATE INDEX IF NOT EXISTS digital_library_category_created_at_idx
  ON public.digital_library (category, created_at DESC);
