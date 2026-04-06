
CREATE TABLE public.user_seen_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);

CREATE INDEX idx_user_seen_questions_user ON public.user_seen_questions(user_id);

ALTER TABLE public.user_seen_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own seen questions"
ON public.user_seen_questions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own seen questions"
ON public.user_seen_questions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own seen questions"
ON public.user_seen_questions FOR DELETE
USING (auth.uid() = user_id);
