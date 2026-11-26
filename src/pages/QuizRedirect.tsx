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
      try {
        const { data, error } = await supabase.functions.invoke("live-quiz", {
          body: { action: "join", room_code: roomCode },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const joinedCode = data?.room?.room_code || roomCode;
        navigate(`/quiz-room/${joinedCode}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "This quiz room could not be joined.";
        toast({ title: "Unable to join quiz", description: message, variant: "destructive" });
        navigate("/live-quiz");
      }
    };

    validate();
  }, [roomCode, user, loading]);

  return <PageLoader />;
};

export default QuizRedirect;
