
-- Add trial_count to profiles for tracking free trials
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_subscribed boolean NOT NULL DEFAULT false;

-- Create shared_exams table for exam sharing
CREATE TABLE public.shared_exams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_code text NOT NULL UNIQUE,
  creator_id uuid NOT NULL,
  session_id uuid REFERENCES public.exam_sessions(id),
  mode text NOT NULL,
  subjects text[] NOT NULL DEFAULT '{}',
  timer_minutes integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shared_exams ENABLE ROW LEVEL SECURITY;

-- Anyone can read shared exams (needed to take shared exams)
CREATE POLICY "Anyone can view shared exams" ON public.shared_exams FOR SELECT USING (true);

-- Users can create their own shared exams
CREATE POLICY "Users can create shared exams" ON public.shared_exams FOR INSERT WITH CHECK (auth.uid() = creator_id);

-- Create index on share_code for fast lookups
CREATE INDEX idx_shared_exams_share_code ON public.shared_exams(share_code);
