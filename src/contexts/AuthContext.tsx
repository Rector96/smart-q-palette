import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const welcomeEmailSent = useRef(false);

  useEffect(() => {
    // Preserve a referral code while a visitor moves from the referral landing
    // page to signup. The database trigger validates the code against its owner.
    const referralFromUrl = new URLSearchParams(window.location.search).get("ref");
    if (referralFromUrl && /^[A-Z0-9]{10,16}$/i.test(referralFromUrl)) {
      window.sessionStorage.setItem("sqp_referral_code", referralFromUrl.toUpperCase());
    }

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
            await supabase.functions.invoke("send-email", {
              body: { type: "welcome", email: session.user.email, name: meta?.full_name || "Student" },
            });
          } catch {}
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

  const signUp = async (email: string, password: string, fullName: string) => {
    const referralCode = window.sessionStorage.getItem("sqp_referral_code");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          ...(referralCode ? { referral_code: referralCode } : {}),
        },
        emailRedirectTo: window.location.origin,
      },
    });
    if (!error) window.sessionStorage.removeItem("sqp_referral_code");
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
