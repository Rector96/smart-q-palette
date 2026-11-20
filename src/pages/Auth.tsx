import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import Logo from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

type AuthMode = "login" | "signup" | "forgot";

const Auth = () => {
  const [mode, setMode] = useState<AuthMode>("login");
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
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
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
      const { error } = await signIn(email.trim().toLowerCase(), password);
      if (error) {
        toast({ title: "Login failed", description: error.message, variant: "destructive" });
      } else {
        navigate("/dashboard");
      }
    } else {
      const { error } = await signUp(email.trim().toLowerCase(), password, fullName.trim());
      if (error) {
        toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
      } else {
        toast({
          title: "Account created! 🎉",
          description: "You can now sign in and start practicing.",
        });
        setMode("login");
        setPassword("");
      }
    }
    setLoading(false);
  };

  const isForgot = mode === "forgot";
  const isSignup = mode === "signup";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-8 sm:py-10 safe-area-top safe-area-bottom">
      <Logo size="lg" showText className="self-start" />

      <header className="mt-7">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">
          {mode === "login"
            ? "Welcome Back 👋"
            : isSignup
              ? "Create your account"
              : "Reset your password"}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {mode === "login"
            ? "Log in to continue your learning journey with Smart Q Palette."
            : isSignup
              ? "Create your free account and start practising smarter today."
              : "Enter the email linked to your account and we'll send you a secure reset link."}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
        {isSignup && (
          <div className="space-y-2">
            <Label htmlFor="full-name">Full Name</Label>
            <Input
              id="full-name"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              required
              className="h-[52px] rounded-xl bg-card px-4 text-base"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
            className="h-[52px] rounded-xl bg-card px-4 text-base"
          />
        </div>

        {!isForgot && (
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? "Create a password" : "Enter your password"}
                minLength={6}
                required
                className="h-[52px] rounded-xl bg-card px-4 pr-12 text-base"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-3 grid min-h-11 min-w-11 place-items-center text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
        )}

        {mode === "login" && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setMode("forgot")}
              className="min-h-9 text-sm font-semibold text-primary"
            >
              Forgot Password?
            </button>
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="h-[52px] w-full rounded-2xl text-base font-bold"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {mode === "login" ? "Logging in…" : isSignup ? "Creating account…" : "Sending link…"}
            </>
          ) : mode === "login" ? (
            "Login"
          ) : isSignup ? (
            "Create Account"
          ) : (
            "Send reset link"
          )}
        </Button>

        {isSignup && (
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </p>
        )}
      </form>

      <div className="mt-auto pt-10 text-center text-sm text-muted-foreground">
        {isForgot ? (
          <button
            type="button"
            onClick={() => setMode("login")}
            className="inline-flex min-h-10 items-center gap-1 font-semibold text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </button>
        ) : (
          <p>
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? "login" : "signup");
                setShowPassword(false);
              }}
              className="min-h-10 font-bold text-primary"
            >
              {isSignup ? "Login" : "Sign Up"}
            </button>
          </p>
        )}
      </div>
    </main>
  );
};

export default Auth;
