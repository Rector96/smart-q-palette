import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
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

const Auth = () => {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const location = useLocation();
  const referralParams = new URLSearchParams(location.search);
  const referralCode = (referralParams.get("ref") || referralParams.get("referral") || referralParams.get("referral_code") || "").trim().toUpperCase();
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
    <main className="grid h-[100dvh] w-full grid-cols-1 overflow-hidden bg-[#fbfaff] md:grid-cols-[47.5%_52.5%]">
      <aside className="relative hidden h-full overflow-hidden bg-gradient-to-br from-[#2b1052] via-[#4b1b8c] to-[#7737dc] px-6 py-8 text-white md:flex md:flex-col md:justify-between">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-28 -top-36 h-[28rem] w-[28rem] rounded-full border border-white/[0.08]" />
          <div className="absolute -bottom-40 -left-28 h-[34rem] w-[34rem] rounded-full border border-white/[0.08]" />
          <div className="absolute inset-0 bg-gradient-to-tr from-[#8b4cf0]/35 via-transparent to-transparent" />
        </div>
        <div className="relative z-10 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#8124f7] text-base font-extrabold">R</span>
          <span className="text-base font-bold tracking-tight">ROCKCBT</span>
        </div>

        <div className="relative z-10 max-w-[440px]">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/65">Prepare · Practice · Achieve</p>
          <h2 className="max-w-[360px] text-[27px] font-bold leading-[1.15] tracking-tight lg:text-[30px]">
            Your next exam success starts here.
          </h2>
          <p className="mt-3 max-w-[370px] text-xs leading-5 text-white/75">
            Practice JAMB, WAEC and NECO questions, track your progress, and study with confidence.
          </p>
        </div>
        <p className="relative z-10 text-[10px] font-medium text-white/65">
          Your exam journey, all in one place.
        </p>
      </aside>

      <section className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[#fbfaff] px-7 py-4 md:px-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_100%_0%,rgba(142,91,255,0.13),transparent_42%),radial-gradient(ellipse_at_0%_100%,rgba(142,91,255,0.08),transparent_42%)]" />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative z-10 w-full max-w-[390px] md:max-w-[312px]"
        >
          <div className={`${mode === "signup" ? "mb-1" : "mb-2"} flex items-center gap-2.5 md:hidden`}>
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#7225e8] text-base font-extrabold text-white">R</span>
            <span className="text-sm font-bold tracking-tight text-[#171b2d]">ROCKCBT</span>
          </div>

          <h1 className="text-[21px] font-bold tracking-tight text-[#171b2d] sm:text-[23px]">
            {mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
          </h1>
          <p className="mt-1 text-[11px] leading-4 text-[#72809a] sm:text-xs">
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
              className={mode === "signup" ? "mt-3" : "mt-5"}
            >
              <form onSubmit={handleSubmit} className={mode === "signup" ? "space-y-1.5" : "space-y-3"}>
                {mode === "signup" && (
                  <div className="space-y-0.5">
                    <Label htmlFor="name" className="text-[10px] font-semibold leading-3 text-[#242b3e]">Full name</Label>
                    <Input id="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" required className="h-9 rounded-[14px] border-[#e4e6ef] bg-white/85 px-3 text-base shadow-[0_1px_2px_rgba(28,36,64,0.03)] placeholder:text-[#94a0b5] sm:text-sm" />
                  </div>
                )}

                <div className={mode === "signup" ? "space-y-0.5" : "space-y-1"}>
                  <Label htmlFor="email" className="text-[10px] font-semibold leading-3 text-[#242b3e]">Email</Label>
                  <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required className={`${mode === "signup" ? "h-9" : "h-[40px]"} rounded-[14px] border-[#e4e6ef] bg-white/85 px-3 text-base shadow-[0_1px_2px_rgba(28,36,64,0.03)] placeholder:text-[#94a0b5] sm:text-sm`} />
                </div>

                {!isForgot && (
                  <div className={mode === "signup" ? "space-y-0.5" : "space-y-1"}>
                    <Label htmlFor="password" className="text-[10px] font-semibold leading-3 text-[#242b3e]">Password</Label>
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
                        className={`${mode === "signup" ? "h-9" : "h-[40px]"} rounded-[14px] border-[#e4e6ef] bg-white/85 pl-9 pr-10 text-base shadow-[0_1px_2px_rgba(28,36,64,0.03)] placeholder:text-[#94a0b5] sm:text-sm`}
                      />
                      <LockKeyhole aria-hidden="true" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b9ab4]" />
                      <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#8b9ab4] transition-colors hover:bg-[#f1edfc] hover:text-[#7225e8]">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {mode === "login" && (
                      <div className="flex justify-end pt-1">
                        <button type="button" onClick={() => setMode("forgot")} className="min-h-7 text-[11px] font-semibold text-[#7225e8] hover:underline">
                          Forgot password?
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <Button type="submit" className={`app-tap mt-1 ${mode === "signup" ? "h-9" : "h-[40px]"} w-full rounded-full bg-[#8124f7] text-xs font-bold text-white shadow-[0_6px_12px_rgba(123,32,248,0.2)] hover:bg-[#6e19e5]`} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link"}
                  {!loading && mode === "login" && <ArrowRight className="ml-1 h-3.5 w-3.5" />}
                </Button>
              </form>

              {!isForgot && (
                <>
                  <div className={`${mode === "signup" ? "mt-2" : "mt-3"} flex items-center gap-3 text-[10px] text-[#8b96a8]`}>
                    <span className="h-px flex-1 bg-[#e6e8ef]" />
                    <span>Or continue with</span>
                    <span className="h-px flex-1 bg-[#e6e8ef]" />
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className={`${mode === "signup" ? "mt-2 h-9" : "mt-3 h-[40px]"} flex w-full items-center justify-center gap-2 rounded-full border border-[#e4e6ef] bg-white text-xs font-semibold text-[#293247] shadow-[0_1px_2px_rgba(28,36,64,0.03)] transition-colors hover:bg-[#f8f7fc] disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
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

              <div className={`${mode === "signup" ? "mt-2" : "mt-4"} text-center`}>
                {isForgot ? (
                  <button type="button" onClick={() => setMode("login")} className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-[#7225e8]">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                  </button>
                ) : (
                  <p className="text-[11px] text-[#72809a]">
                    {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                    <button
                      type="button"
                      onClick={() => setMode(mode === "login" ? "signup" : "login")}
                      className="min-h-8 font-bold text-[#7225e8]"
                    >
                      {mode === "login" ? "Sign up" : "Log in"}
                    </button>
                  </p>
                )}
              </div>

              {mode === "signup" && (
                <p className="mt-0 text-center text-[9px] leading-3 text-[#8794a7]">
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
