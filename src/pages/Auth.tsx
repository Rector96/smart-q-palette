import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import "./Auth.css";

const Auth = () => {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [referralCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("ref") || params.get("referral") || "").trim().toUpperCase();
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Check your email", description: "We've sent you a password reset link." });
          setMode("login");
        }
        return;
      }

      if (mode === "login") {
        const { error } = await signIn(email, password);
        if (error) {
          toast({ title: "Login failed", description: error.message, variant: "destructive" });
        } else {
          navigate("/dashboard");
        }
      } else {
        const { error } = await signUp(email, password, fullName, referralCode || undefined);
        if (error) {
          toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Account created! 🎉", description: "You can now sign in and start practicing." });
          setMode("login");
        }
      }
    } catch (error) {
      const description = error instanceof Error ? error.message : "Please check your connection and try again.";
      toast({ title: "Unable to complete request", description, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/dashboard` },
      });

      if (error) {
        toast({ title: "Google sign-in failed", description: error.message, variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "Google sign-in failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isForgot = mode === "forgot";

  return (
    <main className="auth-shell grid w-full grid-cols-1 bg-[#fbfaff] md:grid-cols-2">
      <aside className="auth-brand relative flex h-full overflow-hidden bg-gradient-to-br from-[#2b1052] via-[#4b1b8c] to-[#7737dc] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-28 -top-36 h-[34rem] w-[34rem] rounded-full border border-white/[0.08]" />
          <div className="absolute -bottom-40 -left-28 h-[40rem] w-[40rem] rounded-full border border-white/[0.08]" />
          <div className="absolute inset-0 bg-gradient-to-tr from-[#8b4cf0]/35 via-transparent to-transparent" />
        </div>
        <div className="auth-brand-logo relative z-10 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl font-extrabold text-[#7225e8] shadow-lg">R</span>
          <span className="text-lg font-bold tracking-tight">ROCKCBT</span>
        </div>

        <div className="auth-brand-copy relative z-10 max-w-[520px]">
          <p className="auth-brand-kicker mb-3 text-xs font-bold uppercase tracking-[0.2em] text-white/65">Prepare · Practice · Achieve</p>
          <h2 className="max-w-[480px] text-[clamp(28px,3vw,44px)] font-bold leading-[1.12] tracking-tight">
            Your next exam success starts here.
          </h2>
          <p className="auth-brand-description mt-4 max-w-[440px] text-base leading-7 text-white/75">
            Practice JAMB, WAEC and NECO questions, track your progress, and study with confidence.
          </p>
        </div>
        <p className="auth-brand-footer relative z-10 text-sm font-medium text-white/65">
          Your exam journey, all in one place.
        </p>
      </aside>

      <section className="auth-panel relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[#fbfaff]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_100%_0%,rgba(142,91,255,0.13),transparent_42%),radial-gradient(ellipse_at_0%_100%,rgba(142,91,255,0.08),transparent_42%)]" />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="auth-content relative z-10 w-full"
        >
          <h1 className="auth-title font-bold tracking-tight text-[#171b2d]">
            {mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
          </h1>
          <p className="auth-subtitle text-sm leading-5 text-[#72809a]">
            {mode === "login"
              ? "Log in to continue your exam prep, anytime, anywhere."
              : mode === "signup"
              ? "Create your account and start preparing with confidence."
              : "Enter your email and we'll send you a reset link."}
          </p>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className={`auth-form-content ${mode === "signup" ? "auth-signup" : ""}`}
            >
              <form onSubmit={handleSubmit} className={mode === "signup" ? "space-y-2" : "space-y-2.5"}>
                {mode === "signup" && (
                  <div className="space-y-1">
                    <Label htmlFor="name" className="auth-label">Full name</Label>
                    <div className="relative">
                      <UserRound aria-hidden="true" className="auth-field-icon absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2" />
                      <Input id="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Enter your full name" required className="auth-input pl-12 pr-4" />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="email" className="auth-label">Email</Label>
                  <div className="relative">
                    <Mail aria-hidden="true" className="auth-field-icon absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2" />
                    <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" required className="auth-input pl-12 pr-4" />
                  </div>
                </div>

                {!isForgot && (
                  <div className="space-y-1">
                    <Label htmlFor="password" className="auth-label">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                        minLength={6}
                        className="auth-input pl-12 pr-11"
                      />
                      <LockKeyhole aria-hidden="true" className="auth-field-icon absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2" />
                      <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#8b9ab4] transition-colors hover:bg-[#f1edfc] hover:text-[#7225e8]">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {mode === "login" && (
                      <div className="flex justify-end pt-0.5">
                        <button type="button" onClick={() => setMode("forgot")} className="text-xs font-semibold text-[#7225e8] hover:underline">
                          Forgot password?
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <Button type="submit" className="auth-submit app-tap mt-1 h-11 w-full rounded-full bg-gradient-to-r from-[#7521e8] to-[#8a20f5] text-sm font-bold text-white shadow-[0_8px_20px_rgba(123,32,248,0.22)] hover:brightness-105" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link"}
                  {!loading && <ArrowRight className="ml-1 h-4 w-4" />}
                </Button>
              </form>

              {!isForgot && (
                <>
                  <div className="auth-divider mt-3 flex items-center gap-3 text-xs text-[#8b96a8]">
                    <span className="h-px flex-1 bg-[#e6e8ef]" />
                    <span>Or continue with</span>
                    <span className="h-px flex-1 bg-[#e6e8ef]" />
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="auth-google mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#dedee8] bg-white text-sm font-semibold text-[#293247] shadow-[0_1px_2px_rgba(28,36,64,0.03)] transition-colors hover:bg-[#f8f7fc] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
                        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.48c-.28 1.4-1.1 2.59-2.32 3.39v2.77h3.76c2.2-2.03 3.57-5.02 3.57-8.19z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.94l-3.76-2.77c-1.04.7-2.37 1.11-4.17 1.11-3.2 0-5.91-2.16-6.88-5.07H1.24v2.84A12 12 0 0 0 12 24z" />
                        <path fill="#FBBC05" d="M5.12 14.33A7.2 7.2 0 0 1 4.74 12c0-.81.14-1.59.38-2.33V6.83H1.24A12 12 0 0 0 0 12c0 1.93.46 3.76 1.24 5.17l3.88-2.84z" />
                        <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.24 6.83l3.88 2.84C6.09 6.93 8.8 4.77 12 4.77z" />
                      </svg>
                    )}
                    Continue with Google
                  </button>
                </>
              )}

              <div className="auth-account mt-3 text-center">
                {isForgot ? (
                  <button type="button" onClick={() => setMode("login")} className="inline-flex items-center gap-1 text-sm font-semibold text-[#7225e8]">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                  </button>
                ) : (
                  <p className="text-sm text-[#72809a]">
                    {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                    <button
                      type="button"
                      onClick={() => setMode(mode === "login" ? "signup" : "login")}
                      className="font-bold text-[#7225e8] hover:underline"
                    >
                      {mode === "login" ? "Sign up" : "Log in"}
                    </button>
                  </p>
                )}
              </div>

              {mode === "signup" && (
                <p className="auth-terms mt-2 text-center text-xs leading-4 text-[#8794a7]">
                  By signing up, you agree to our{" "}
                  <Link to="/terms" className="font-semibold text-[#7225e8] hover:underline">Terms</Link>
                  {" "}and{" "}
                  <Link to="/privacy" className="font-semibold text-[#7225e8] hover:underline">Privacy Policy</Link>.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </section>
    </main>
  );
};

export default Auth;
