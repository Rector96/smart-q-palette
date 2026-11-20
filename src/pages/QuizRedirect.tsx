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

      // Enforce the two-player limit for friend battles, including shared-link joins.
      if (data.room_code.startsWith("D")) {
        const { data: players, error: playersError } = await supabase
          .from("quiz_participants").select("user_id").eq("room_id", data.id);
        if (playersError) throw playersError;
        const alreadyJoined = players?.some((player) => player.user_id === user.id);
        if (!alreadyJoined && (players?.length || 0) >= 2) {
          toast({ title: "Battle is full", description: "This friend challenge already has two players.", variant: "destructive" });
          navigate("/live-quiz");
          return;
        }
      }

      const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).single();
      const { error: joinError } = await supabase.from("quiz_participants").insert({
        room_id: data.id,
        user_id: user.id,
        display_name: profile?.full_name?.split(" ")[0] || "Player",
      });
      if (joinError && !joinError.message.toLowerCase().includes("duplicate")) throw joinError;

      navigate(`/quiz-room/${data.room_code}`);
    };

    validate();
  }, [roomCode, user, loading]);

  return <PageLoader />;
};

export default QuizRedirect;
