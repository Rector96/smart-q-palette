import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, Sparkles, Rocket, BookOpen, Brain, Clock, FileEdit, BookOpenCheck } from "lucide-react";

interface TourStep {
  selector?: string;
  title: string;
  message: string;
  icon: any;
  position?: "center" | "auto";
}

const DASHBOARD_STEPS: TourStep[] = [
  { title: "Welcome to Weblines 👋", message: "We're excited to have you! Let's take a quick tour so you can start preparing confidently.", icon: Sparkles, position: "center" },
  { selector: '[data-tour="start-test"]', title: "Start Practice Test", message: "Jump straight into practice with real exam-style questions.", icon: Rocket },
  { selector: '[data-tour="ai-tutor"]', title: "AI Tutor", message: "Stuck on a question? Your AI Tutor is always online to guide you instantly.", icon: Brain },
  { selector: '[data-tour="exam-modes"]', title: "Exam Modes", message: "Choose how you want to practice — CBT, Mock Exam, Revision, or Practice Mode.", icon: Clock },
  { selector: '[data-tour="library"]', title: "Library", message: "Access all your recommended literature texts and reading materials in one place.", icon: BookOpen },
  { selector: '[data-tour="live-quiz"]', title: "Live Quiz", message: "Challenge yourself with live quiz sessions and practise alongside others.", icon: FileEdit },
  { selector: '[data-tour="subjects"]', title: "Subjects", message: "Choose a subject and focus your practice. Your progress is tracked as you improve.", icon: BookOpenCheck },
];

const STORAGE_KEY = "weblines_tour_completed";

export const useOnboardingTour = () => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const start = useCallback(() => setActive(true), []);
  const dismiss = useCallback(() => {
    setActive(false);
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  return { active, start, dismiss };
};

interface Props {
  active: boolean;
  onDismiss: () => void;
}

const OnboardingTour = ({ active, onDismiss }: Props) => {
  const [step, setStep] = useState(0);
  const [highlight, setHighlight] = useState<DOMRect | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const currentStep = DASHBOARD_STEPS[step];
  const isCenter = step === 0 || currentStep.position === "center";
  const isLast = step === DASHBOARD_STEPS.length - 1;
  const total = DASHBOARD_STEPS.length;

  useEffect(() => {
    if (!active || isCenter) { setHighlight(null); return; }
    const el = currentStep.selector ? document.querySelector(currentStep.selector) : null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        setHighlight(rect);
      }, 300);
    } else {
      setHighlight(null);
    }
  }, [step, active, isCenter, currentStep.selector]);

  const finish = () => {
    setShowConfetti(true);
    setTimeout(() => {
      setShowConfetti(false);
      onDismiss();
      setStep(0);
    }, 2000);
  };

  const next = () => {
    if (isLast) { finish(); return; }
    setStep(s => s + 1);
  };
  const prev = () => setStep(s => Math.max(0, s - 1));
  const skip = () => { onDismiss(); setStep(0); };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") skip(); };
    if (active) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active]);

  if (!active && !showConfetti) return null;

  // Calculate tooltip position — always fit within viewport
  let tooltipStyle: React.CSSProperties = {};
  const tooltipWidth = Math.min(340, window.innerWidth - 24);
  if (highlight && !isCenter) {
    const padding = 12;
    const spaceBelow = window.innerHeight - highlight.bottom;
    const safeLeft = Math.max(16, Math.min(highlight.left, window.innerWidth - tooltipWidth - 16));
    if (spaceBelow > 220) {
      tooltipStyle = { top: highlight.bottom + padding, left: safeLeft, maxWidth: tooltipWidth };
    } else {
      tooltipStyle = { bottom: Math.max(16, window.innerHeight - highlight.top + padding), left: safeLeft, maxWidth: tooltipWidth };
    }
  }

  const Icon = currentStep.icon;

  return (
    <>
      {/* Confetti celebration */}
      <AnimatePresence>
        {showConfetti && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-4 p-8">
              <motion.div animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }} transition={{ repeat: 2, duration: 0.5 }} className="text-6xl">🎉</motion.div>
              <h2 className="text-2xl font-bold text-white">You're All Set!</h2>
              <p className="text-sm text-white/80">Everything is ready. Let's start preparing and winning!</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tour overlay */}
      <AnimatePresence>
        {active && (
          <motion.div ref={overlayRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100]" onClick={(e) => { if (e.target === overlayRef.current) skip(); }}>
            {/* Dimming overlay with cutout */}
            <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
              <defs>
                <mask id="tour-mask">
                  <rect width="100%" height="100%" fill="white" />
                  {highlight && (
                    <rect x={highlight.left - 6} y={highlight.top - 6} width={highlight.width + 12} height={highlight.height + 12} rx="12" fill="black" />
                  )}
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#tour-mask)" />
            </svg>

            {/* Glow ring around highlighted element */}
            {highlight && !isCenter && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute rounded-xl pointer-events-none"
                style={{
                  left: highlight.left - 8,
                  top: highlight.top - 8,
                  width: highlight.width + 16,
                  height: highlight.height + 16,
                  boxShadow: "0 0 0 3px hsl(var(--primary)), 0 0 20px 4px hsl(var(--primary) / 0.3)",
                  borderRadius: "14px",
                }}
              />
            )}

            {/* Tooltip / Center modal */}
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className={`absolute bg-card border border-border rounded-3xl shadow-2xl p-5 z-[101] overflow-y-auto ${isCenter ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-[92vw] w-[340px]" : "max-w-[92vw] w-[320px]"}`}
              style={{ ...(!isCenter ? tooltipStyle : {}), maxHeight: "calc(100dvh - 32px)" }}
            >
              {/* Close btn */}
              <button onClick={skip} className="absolute top-3 right-3 h-11 w-11 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">{currentStep.title}</h3>
                  <p className="text-[10px] text-muted-foreground">Step {step + 1} of {total}</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{currentStep.message}</p>

              {/* Progress dots */}
              <div className="flex items-center gap-1 mb-3">
                {DASHBOARD_STEPS.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-4 bg-primary" : i < step ? "w-1.5 bg-primary/40" : "w-1.5 bg-border"}`} />
                ))}
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2">
                {step === 0 ? (
                  <>
                    <Button variant="ghost" size="sm" className="h-12 text-sm flex-1" onClick={skip}>Skip</Button>
                    <Button size="sm" className="h-12 text-sm flex-1 gap-1" onClick={next}>Start Tour <ChevronRight className="h-3.5 w-3.5" /></Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" className="h-11 min-w-11 text-xs" onClick={prev}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-11 text-sm" onClick={skip}>Skip</Button>
                    <Button size="sm" className="h-11 text-sm flex-1 gap-1" onClick={next}>
                      {isLast ? "Finish 🎉" : "Next"} {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default OnboardingTour;
