-- Digital Library table
CREATE TABLE public.digital_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  cover_image_url text,
  preview_file_url text,
  full_file_url text,
  is_free boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.digital_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view library items" ON public.digital_library FOR SELECT USING (true);
CREATE POLICY "Admins can insert library items" ON public.digital_library FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update library items" ON public.digital_library FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete library items" ON public.digital_library FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Custom Exams table
CREATE TABLE public.custom_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  title text NOT NULL,
  instructions text,
  duration_minutes integer DEFAULT 60,
  questions jsonb NOT NULL DEFAULT '[]',
  share_code text UNIQUE NOT NULL,
  expires_at timestamptz,
  is_permanent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.custom_exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view custom exams" ON public.custom_exams FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create custom exams" ON public.custom_exams FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators can update own exams" ON public.custom_exams FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "Creators can delete own exams" ON public.custom_exams FOR DELETE USING (auth.uid() = creator_id);

-- Custom exam results
CREATE TABLE public.custom_exam_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid REFERENCES public.custom_exams(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  score integer DEFAULT 0,
  total_questions integer DEFAULT 0,
  answers jsonb DEFAULT '{}',
  completed_at timestamptz DEFAULT now()
);

ALTER TABLE public.custom_exam_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert results" ON public.custom_exam_results FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view results" ON public.custom_exam_results FOR SELECT USING (true);

-- Add AI usage tracking columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_tutor_usage integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_builder_usage integer DEFAULT 0;

-- Fix admin question insert: allow admins to insert questions
CREATE POLICY "Admins can insert questions" ON public.questions FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update questions" ON public.questions FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete questions" ON public.questions FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Storage bucket for library files
INSERT INTO storage.buckets (id, name, public) VALUES ('library', 'library', false) ON CONFLICT DO NOTHING;