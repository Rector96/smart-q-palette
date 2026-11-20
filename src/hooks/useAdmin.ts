import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export const useAdmin = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSupportAgent, setIsSupportAgent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setIsAdmin(false);
      setIsSupportAgent(false);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const [{ data, error: checkError }, { data: supportData, error: supportError }] = await Promise.all([
      supabase.rpc("is_current_user_admin"),
      supabase.rpc("is_current_user_support_agent"),
    ]);

    if (checkError || supportError) {
      setIsAdmin(false);
      setIsSupportAgent(false);
      setError("We couldn't verify administrator access. Please try again.");
    } else {
      setIsAdmin(data === true);
      setIsSupportAgent(supportData === true);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { isAdmin, isSupportAgent, loading, error, refresh };
};
