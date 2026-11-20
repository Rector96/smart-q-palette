import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

const Auth = () => {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

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
      setLoading(false);
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
      const { error } = await signUp(email, password, fullName);
      if (error) {
        toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Account created! 🎉", description: "You can now sign in and start practicing." });
        setMode("login");
      }
    }
    setLoading(false);
  };

  const isForgot = mode === "forgot";

  return (
    <main className="grid h-[100dvh] w-full grid-cols-1 overflow-hidden bg-[#fbfaff] md:grid-cols-[48%_52%]">
      <aside className="relative hidden h-full overflow-hidden bg-gradient-to-br from-[#28104c] via-[#4b1b8c] to-[#7737dc] px-6 text-white md:flex md:flex-col md:justify-between md:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-20 -top-32 h-[28rem] w-[28rem] rounded-full border border-white/10" />
          <div className="absolute -bottom-40 -left-24 h-[32rem] w-[32rem] rounded-full border border-white/10" />
          <div className="absolute inset-0 bg-gradient-to-tr from-[#7d3fe8]/35 via-transparent to-transparent" />
        </div>
        <div className="relative z-10 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white text-lg font-extrabold text-[#6524bd]">W</span>
          <span className="text-base font-bold tracking-tight">WeblineCBT</span>
        </div>
        <div className="relative z-10 mx-auto w-full max-w-[440px]">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/65">Prepare · Practice · Achieve</p>
          <h2 className="text-3xl font-bold leading-[1.15] tracking-tight lg:text-[34px]">
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

      <section className="relative flex h-full min-h-0 items-start justify-center overflow-hidden px-7 py-3 md:items-start md:px-8 md:py-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_100%_0%,rgba(142,91,255,0.13),transparent_38%),radial-gradient(ellipse_at_0%_100%,rgba(142,91,255,0.08),transparent_38%)]" />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative z-10 w-full max-w-[390px] md:mt-3 md:max-w-[312px]"
        >
          <div className="mb-4 flex items-center gap-2.5 md:hidden">
            <span className="flex h-6 w-6 items-center justify-center rounded-[8px] bg-[#7225e8] text-sm font-extrabold text-white">W</span>
            <span className="text-sm font-bold tracking-tight text-[#171b2d]">WeblineCBT</span>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-[#171b2d] md:text-[23px]">
            {mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
          </h1>
          <p className="mt-1 text-xs leading-5 text-[#72809a]">
            {mode === "login"
              ? "Log in to continue your exam prep, anytime, anywhere."
              : mode === "signup"
              ? "Create your account and start preparing with confidence."
              : "Enter your email and we'll send you a password reset link."}
          </p>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="mt-2 md:mt-5"
            >
              <form onSubmit={handleSubmit} className={mode === "signup" ? "space-y-1.5 md:space-y-3" : "space-y-2 md:space-y-3"}>
                {mode === "signup" && (
                  <div className="space-y-0.5">
                    <Label htmlFor="name" className="text-[10px] font-semibold leading-3 text-[#242b3e]">Full name</Label>
                    <Input id="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" required className="h-[38px] rounded-[14px] border-[#e4e6ef] bg-white/85 px-3 text-base shadow-[0_1px_2px_rgba(28,36,64,0.03)] placeholder:text-[#94a0b5] md:text-sm" />
                  </div>
                )}

                <div className="space-y-0.5">
                  <Label htmlFor="email" className="text-[10px] font-semibold leading-3 text-[#242b3e]">Email</Label>
                  <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required className="h-[38px] rounded-[14px] border-[#e4e6ef] bg-white/85 px-3 text-base shadow-[0_1px_2px_rgba(28,36,64,0.03)] placeholder:text-[#94a0b5] md:text-sm" />
                </div>

                {!isForgot && (
                  <div className="space-y-0.5">
                    <Label htmlFor="password" className="text-[10px] font-semibold leading-3 text-[#242b3e]">Password</Label>
                    <div className="relative">
                      <LockKeyhole aria-hidden="true" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b9ab4]" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                        minLength={6}
                        className="h-[38px] rounded-[14px] border-[#e4e6ef] bg-white/85 pl-9 pr-10 text-base shadow-[0_1px_2px_rgba(28,36,64,0.03)] placeholder:text-[#94a0b5] md:text-sm"
                      />
                      <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#8b9ab4] transition-colors hover:bg-[#f1edfc] hover:text-[#7225e8]">
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    {mode === "login" && (
                      <div className="flex justify-end pt-1">
                        <button type="button" onClick={() => setMode("forgot")} className="min-h-8 text-[11px] font-semibold text-[#7225e8] hover:underline">
                          Forgot password?
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <Button type="submit" className="app-tap mt-1 h-[39px] w-full rounded-full bg-[#7b20f8] text-xs font-bold text-white shadow-[0_6px_12px_rgba(123,32,248,0.2)] hover:bg-[#6e19e5]" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link"}
                  {!loading && mode === "login" && <ArrowRight className="ml-1 h-3.5 w-3.5" />}
                </Button>
              </form>

              <div className={mode === "signup" ? "mt-3 text-center" : "mt-4 text-center"}>
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
                <p className="mt-2 text-center text-[10px] leading-relaxed text-[#72809a]">
                  By creating an account, you agree to our Terms of Service and Privacy Policy.
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
