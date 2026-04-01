import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageLoader from "@/components/PageLoader";
import { useToast } from "@/hooks/use-toast";

const QuizRedirect = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate(`/auth?redirect=/q/${roomCode}`);
      return;
    }

    const validate = async () => {
      const { data, error } = await supabase
        .from("quiz_rooms")
        .select("id, status, expires_at, room_code")
        .eq("room_code", roomCode)
        .single();

      if (error || !data) {
        toast({ title: "Quiz not found", description: "This quiz room doesn't exist.", variant: "destructive" });
        navigate("/live-quiz");
        return;
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        toast({ title: "This quiz session has expired", variant: "destructive" });
        navigate("/live-quiz");
        return;
      }

      if (data.status === "ended") {
        toast({ title: "This quiz has already ended", variant: "destructive" });
        navigate("/live-quiz");
        return;
      }

      // Try to join
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).single();
      await supabase.from("quiz_participants").insert({
        room_id: data.id,
        user_id: user.id,
        display_name: profile?.full_name?.split(" ")[0] || "Player",
      });

      navigate(`/quiz-room/${data.room_code}`);
    };

    validate();
  }, [roomCode, user, loading]);

  return <PageLoader />;
};

export default QuizRedirect;
