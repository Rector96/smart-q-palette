import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Logo from "@/components/Logo";
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center justify-center mb-8">
          <Logo size="lg" />
        </div>

        <Card className="shadow-xl border-border/50 backdrop-blur-sm">
          <CardHeader className="pb-4 text-center">
            <AnimatePresence mode="wait">
              <motion.div key={mode} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                <CardTitle className="text-xl">
                  {mode === "login" ? "Welcome back! 👋" : mode === "signup" ? "Join PassSmartly 🎓" : "Reset Password"}
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  {mode === "login"
                    ? "Sign in to continue your exam prep journey"
                    : mode === "signup"
                    ? "Create your free account and start practicing today"
                    : "Enter your email and we'll send you a reset link"}
                </CardDescription>
              </motion.div>
            </AnimatePresence>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <AnimatePresence mode="wait">
                {mode === "signup" && (
                  <motion.div key="name" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs">Full Name</Label>
                    <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Chinedu Okafor" required className="h-10 text-sm" />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">Email Address</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="h-10 text-sm" />
              </div>

              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs">Password</Label>
                    {mode === "login" && (
                      <button type="button" onClick={() => setMode("forgot")} className="text-[10px] text-primary hover:underline">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="h-10 text-sm pr-10"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full h-10 text-sm font-semibold" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {mode === "login" ? "Sign In" : mode === "signup" ? "Create Free Account" : "Send Reset Link"}
              </Button>
            </form>

            <div className="mt-4 text-center space-y-2">
              {mode === "forgot" ? (
                <button onClick={() => setMode("login")} className="text-xs text-primary hover:underline font-medium">
                  ← Back to sign in
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {mode === "login" ? "New to PassSmartly?" : "Already have an account?"}{" "}
                  <button
                    onClick={() => setMode(mode === "login" ? "signup" : "login")}
                    className="text-primary hover:underline font-semibold"
                  >
                    {mode === "login" ? "Create free account" : "Sign in"}
                  </button>
                </p>
              )}
            </div>

            {mode === "signup" && (
              <p className="mt-3 text-[10px] text-muted-foreground text-center leading-relaxed">
                By creating an account, you agree to our Terms of Service and Privacy Policy. Start with 2 free exam sessions!
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Auth;
