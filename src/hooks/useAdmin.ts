import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export const useAdmin = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setIsAdmin(false);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: checkError } = await supabase.rpc("is_current_user_admin");

    if (checkError) {
      setIsAdmin(false);
      setError("We couldn't verify administrator access. Please try again.");
    } else {
      setIsAdmin(data === true);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { isAdmin, loading, error, refresh };
};
