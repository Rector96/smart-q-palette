import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { Session, User } from "@supabase/supabase-js";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { captureReferralFromSearch } from "@/lib/referral";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, referralCode?: string, referralSource?: "link" | "typed") => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const welcomeEmailSent = useRef(false);

  useEffect(() => {
    captureReferralFromSearch(location.search);
  }, [location.search]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Send welcome email only on actual signup (not login)
      if (_event === "SIGNED_IN" && session?.user && !welcomeEmailSent.current) {
        const createdAt = new Date(session.user.created_at).getTime();
        const now = Date.now();
        // Only send if account was created in the last 30 seconds (fresh signup)
        if (now - createdAt < 30000) {
          welcomeEmailSent.current = true;
          const meta = session.user.user_metadata;
          try {
            const { error } = await supabase.functions.invoke("send-email", {
              body: { type: "welcome", email: session.user.email, name: meta?.full_name || "Student" },
            });
            if (error) console.error("Could not send welcome email:", error.message);
          } catch (error) {
            console.error("Could not send welcome email:", error);
          }
        }
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    referralCode?: string,
    referralSource?: "link" | "typed",
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          ...(referralCode ? { referral_code: referralCode.toUpperCase() } : {}),
          ...(referralCode && referralSource ? { referral_source: referralSource } : {}),
        },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
