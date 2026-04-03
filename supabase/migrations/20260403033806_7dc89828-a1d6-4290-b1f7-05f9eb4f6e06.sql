
CREATE TABLE public.online_presence (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT 'Anonymous',
  current_page text DEFAULT 'browsing',
  current_subject text,
  last_seen timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.online_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view online users" ON public.online_presence FOR SELECT USING (true);
CREATE POLICY "Users can insert own presence" ON public.online_presence FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own presence" ON public.online_presence FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own presence" ON public.online_presence FOR DELETE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.online_presence;
