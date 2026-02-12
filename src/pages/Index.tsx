import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowRight, Zap, Shield, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect } from "react";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading]);

  return (
    <div className="min-h-screen bg-background">
      <header className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-bold text-sm tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            SmartCBT
          </span>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => navigate("/auth")}>
          Get Started <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-16 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto"
        >
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Ace Your JAMB Exam with{" "}
            <span className="text-primary">Smart Practice</span>
          </h1>
          <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
            14 subjects, smart question randomization, real CBT simulation, and detailed analytics — all in one platform.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button className="h-10 px-6 text-sm" onClick={() => navigate("/auth")}>
              Start Practicing <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Button variant="outline" className="h-10 px-6 text-sm" onClick={() => navigate("/auth")}>
              Create Account
            </Button>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6"
        >
          {[
            { icon: Zap, title: "Smart Engine", desc: "Algorithm-based question selection with difficulty balancing and no repetition." },
            { icon: Shield, title: "Real CBT Simulation", desc: "Timed exams, auto-submit, question navigation — just like the real JAMB." },
            { icon: BarChart3, title: "Performance Analytics", desc: "Track progress, identify weak topics, and improve with every session." },
          ].map((f) => (
            <div key={f.title} className="text-center p-6">
              <f.icon className="h-8 w-8 mx-auto mb-3 text-primary" />
              <h3 className="text-sm font-semibold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {f.title}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>

      <footer className="border-t border-border py-6 text-center">
        <p className="text-[10px] text-muted-foreground">© 2026 SmartCBT. Built for Nigerian students.</p>
      </footer>
    </div>
  );
};

export default Index;
