import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ArrowLeft, Sparkles, ShieldCheck, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Logo from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

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
      const { error } = await signUp(email, password, fullName, referralCode || undefined);
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
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-4 py-8 safe-area-top safe-area-bottom">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-28 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-[hsl(var(--success))]/10 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/[0.06] to-transparent" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[440px]"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size="lg" />
          <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Your exam-prep journey starts here
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            {mode === "login" ? "Welcome back!" : mode === "signup" ? "Let's get you started" : "Reset your password"}
          </h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {mode === "login"
              ? "Pick up where you left off. Your next great result starts with one practice session."
              : mode === "signup"
              ? "Create your free account and build a smarter, stronger study routine."
              : "Enter the email linked to your account and we'll send you a secure reset link."}
          </p>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <div className="h-1.5 bg-gradient-to-r from-primary via-[hsl(var(--success))] to-primary" />
          <div className="p-5 sm:p-7">
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <div className="mb-6">
                  <p className="text-sm font-bold">{mode === "login" ? "Sign in to your account" : mode === "signup" ? "Create your account" : "Password recovery"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Simple, secure and ready when you are.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === "signup" && (
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-xs font-semibold">Full name</Label>
                      <Input id="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Chinedu Okafor" required className="h-12 rounded-xl bg-background/70 px-4 text-base" />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-semibold">Email address</Label>
                    <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="h-12 rounded-xl bg-background/70 px-4 text-base" />
                  </div>

                  {!isForgot && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-xs font-semibold">Password</Label>
                        {mode === "login" && (
                          <button type="button" onClick={() => setMode("forgot")} className="min-h-8 text-xs font-semibold text-primary hover:underline">
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete={mode === "login" ? "current-password" : "new-password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="At least 6 characters"
                          required
                          minLength={6}
                          className="h-12 rounded-xl bg-background/70 px-4 pr-12 text-base"
                        />
                        <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  <Button type="submit" className="app-tap h-12 w-full rounded-xl text-sm font-bold shadow-lg shadow-primary/20" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "login" ? <Zap className="mr-2 h-4 w-4" /> : null}
                    {mode === "login" ? "Sign in and continue" : mode === "signup" ? "Create free account" : "Send reset link"}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  {isForgot ? (
                    <button type="button" onClick={() => setMode("login")} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary">
                      <ArrowLeft className="h-4 w-4" /> Back to sign in
                    </button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {mode === "login" ? "New here?" : "Already have an account?"}{" "}
                      <button
                        type="button"
                        onClick={() => setMode(mode === "login" ? "signup" : "login")}
                        className="min-h-10 font-bold text-primary"
                      >
                        {mode === "login" ? "Create an account" : "Sign in"}
                      </button>
                    </p>
                  )}
                </div>

                {mode === "signup" && (
                  <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
                    By creating an account, you agree to our Terms of Service and Privacy Policy. Start with 3 free exam sessions!
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-5 text-[10px] font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Secure account</span>
          <span className="inline-flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-primary" /> Fast practice</span>
        </div>
      </motion.div>
    </main>
  );
};

export default Auth;
