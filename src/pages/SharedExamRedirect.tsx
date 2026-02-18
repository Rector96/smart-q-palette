import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PageLoader from "@/components/PageLoader";

const SharedExamRedirect = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!code) { setError(true); return; }
    const resolve = async () => {
      const { data } = await supabase
        .from("shared_exams")
        .select("*")
        .eq("share_code", code)
        .single();
      if (!data) { setError(true); return; }
      const params = new URLSearchParams({
        mode: data.mode,
        subjects: data.subjects.join(","),
        share: data.share_code,
      });
      if (data.timer_minutes) params.set("timer", String(data.timer_minutes));
      navigate(`/exam?${params.toString()}`, { replace: true });
    };
    resolve();
  }, [code, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-lg font-bold">Invalid Share Link</p>
          <p className="text-sm text-muted-foreground">This exam link is invalid or has expired.</p>
          <button onClick={() => navigate("/")} className="text-primary text-sm font-medium hover:underline">
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  return <PageLoader />;
};

export default SharedExamRedirect;
