import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useOnlinePresence = (currentPage = "browsing", currentSubject?: string) => {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!user) return;

    const upsertPresence = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();

      await supabase.from("online_presence").upsert(
        {
          user_id: user.id,
          display_name: profile?.full_name || user.email?.split("@")[0] || "Anonymous",
          current_page: currentPage,
          current_subject: currentSubject || null,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    };

    upsertPresence();

    // Heartbeat every 30s
    intervalRef.current = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 60000) {
        // Inactive for 60s, remove presence
        supabase.from("online_presence").delete().eq("user_id", user.id).then();
        return;
      }
      upsertPresence();
    }, 30000);

    // Track user activity
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("touchstart", onActivity);

    // Cleanup on unmount / page leave
    const cleanup = () => {
      supabase.from("online_presence").delete().eq("user_id", user.id).then();
    };
    window.addEventListener("beforeunload", cleanup);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("beforeunload", cleanup);
      cleanup();
    };
  }, [user, currentPage, currentSubject]);
};
