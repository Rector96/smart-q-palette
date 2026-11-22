
-- Create quiz_rooms table
CREATE TABLE public.quiz_rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id uuid NOT NULL,
  subject text NOT NULL,
  num_questions integer NOT NULL DEFAULT 10,
  time_per_question integer NOT NULL DEFAULT 30,
  room_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'waiting',
  current_question_index integer NOT NULL DEFAULT 0,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view quiz rooms" ON public.quiz_rooms FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create rooms" ON public.quiz_rooms FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Hosts can update own rooms" ON public.quiz_rooms FOR UPDATE USING (auth.uid() = host_id);
CREATE POLICY "Hosts can delete own rooms" ON public.quiz_rooms FOR DELETE USING (auth.uid() = host_id);

-- Create quiz_participants table
CREATE TABLE public.quiz_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.quiz_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text NOT NULL DEFAULT 'Player',
  score integer NOT NULL DEFAULT 0,
  is_connected boolean NOT NULL DEFAULT true,
  joined_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view participants" ON public.quiz_participants FOR SELECT USING (true);
CREATE POLICY "Authenticated users can join" ON public.quiz_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own participant" ON public.quiz_participants FOR UPDATE USING (auth.uid() = user_id);

-- Create quiz_answers table
CREATE TABLE public.quiz_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.quiz_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  question_index integer NOT NULL,
  selected_option text,
  time_taken integer NOT NULL DEFAULT 0,
  is_correct boolean NOT NULL DEFAULT false,
  answered_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view answers in room" ON public.quiz_answers FOR SELECT USING (true);
CREATE POLICY "Users can insert own answers" ON public.quiz_answers FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add exam_hint to questions table
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS exam_hint text;

-- Add free_live_quiz_used to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS free_live_quiz_used integer NOT NULL DEFAULT 0;

-- Enable realtime for quiz tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_answers;
