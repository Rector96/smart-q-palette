import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, Sparkles, Rocket, BookOpen, Brain, Calculator, ListOrdered, Clock, FileEdit, BookOpenCheck, type LucideIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export interface TourStep {
  selector?: string;
  title: string;
  message: string;
  icon: LucideIcon;
  position?: "center" | "auto";
}

const DASHBOARD_STEPS: TourStep[] = [
  { title: "Welcome to ROCKCBT 👋", message: "We're excited to have you! Let's take a quick tour so you can start preparing confidently.", icon: Sparkles, position: "center" },
  { selector: '[data-tour="start-test"]', title: "Start Practice Test", message: "Jump straight into practice with real exam-style questions.", icon: Rocket },
  { selector: '[data-tour="ai-tutor"]', title: "AI Tutor", message: "Stuck on a question? Your AI Tutor is always online to guide you instantly.", icon: Brain },
  { selector: '[data-tour="exam-modes"]', title: "Exam Modes", message: "Choose how you want to practice — CBT, Mock Exam, Revision, or Practice Mode.", icon: Clock },
  { selector: '[data-tour="library"]', title: "Library", message: "Access all your recommended literature texts and reading materials in one place.", icon: BookOpen },
  { selector: '[data-tour="live-quiz"]', title: "Live Quiz", message: "Challenge yourself with live quiz sessions and practise alongside others.", icon: FileEdit },
  { selector: '[data-tour="subjects"]', title: "Subjects", message: "Choose a subject and focus your practice. Your progress is tracked as you improve.", icon: BookOpenCheck },
];

export const CBT_TOUR_STEPS: TourStep[] = [
  { title: "Your mobile CBT", message: "Take a quick guided tour of the tools that make your exam easier. You can skip any step.", icon: Sparkles, position: "center" },
  { selector: '[data-tour="exam-question"]', title: "Read, answer, review", message: "Choose an option to answer. Tap the flag beside the question to mark it for review.", icon: BookOpen },
  { selector: '[data-tour="exam-calculator"]', title: "Calculator, right when you need it", message: "Open the scientific calculator here. It appears over the exam, so you can calculate without losing your place.", icon: Calculator },
  { selector: '[data-tour="exam-question-picker"]', title: "Jump to any question", message: "Tap this question counter to open the question navigator and see your progress at a glance.", icon: ListOrdered },
  { selector: '[data-tour="exam-question-grid"]', title: "Your question navigator", message: "The navigator is open for you. Tap a number to jump directly to that question; answered and flagged questions are easy to spot.", icon: ListOrdered },
  { selector: '[data-tour="exam-bottom-nav"]', title: "Move through your exam", message: "Previous and Next stay within reach at the bottom. Submit appears when you reach the final question.", icon: Rocket },
];

export const DASHBOARD_TOUR_STORAGE_KEY = "weblines_tour_completed";
export const CBT_TOUR_STORAGE_KEY = "rockcbt_cbt_tour_v2_completed";

export const useOnboardingTour = (storageKey = DASHBOARD_TOUR_STORAGE_KEY) => {
  const [active, setActive] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile || localStorage.getItem(storageKey)) {
      setActive(false);
      return;
    }

    const timer = setTimeout(() => setActive(true), 800);
    return () => clearTimeout(timer);
  }, [isMobile, storageKey]);

  const start = useCallback(() => {
    if (isMobile) setActive(true);
  }, [isMobile]);
  const dismiss = useCallback(() => {
    setActive(false);
    if (isMobile) localStorage.setItem(storageKey, "true");
  }, [isMobile, storageKey]);

  return { active, start, dismiss };
};

interface Props {
  active: boolean;
  onDismiss: () => void;
  steps?: TourStep[];
  onStepChange?: (step: number) => void;
}

const OnboardingTour = ({ active, onDismiss, steps = DASHBOARD_STEPS, onStepChange }: Props) => {
  const [step, setStep] = useState(0);
  const [highlight, setHighlight] = useState<DOMRect | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const currentStep = steps[step];
  const isCenter = currentStep.position === "center";
  const isLast = step === steps.length - 1;
  const total = steps.length;

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

  const changeStep = (nextStep: number) => {
    setStep(nextStep);
    onStepChange?.(nextStep);
  };

  const next = () => {
    if (isLast) { finish(); return; }
    changeStep(step + 1);
  };
  const prev = () => changeStep(Math.max(0, step - 1));
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
          <motion.div ref={overlayRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`fixed inset-0 z-[100] ${isCenter ? "flex items-center justify-center p-4" : ""}`} onClick={(e) => { if (e.target === overlayRef.current) skip(); }}>
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
                className={`${isCenter ? "relative max-w-full w-[340px]" : "absolute max-w-[92vw] w-[320px]"} overflow-y-auto rounded-3xl border border-primary/15 bg-card/95 p-5 shadow-[0_24px_90px_-20px_rgba(0,0,0,0.55)] ring-1 ring-white/20 backdrop-blur-xl z-[101]`}
              style={{ ...(!isCenter ? tooltipStyle : {}), maxHeight: "calc(100dvh - 32px)" }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tour-step-title"
            >
              {/* Close btn */}
                <button onClick={skip} aria-label="Skip tour" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-secondary/80 transition-colors hover:bg-secondary">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

                <div className="mb-4 flex items-start justify-between gap-3 pr-9">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary shadow-inner">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-primary">ROCKCBT QUICK TOUR</p>
                      <h3 id="tour-step-title" className="text-sm font-bold leading-tight">{currentStep.title}</h3>
                    </div>
                </div>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-[10px] font-bold tabular-nums text-muted-foreground">{String(step + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
              </div>

                <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{currentStep.message}</p>

                <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Tour progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1}>
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary" animate={{ width: `${((step + 1) / total) * 100}%` }} transition={{ duration: 0.3 }} />
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2">
                {step === 0 ? (
                  <>
                      <Button variant="ghost" size="sm" className="h-11 flex-1 text-sm" onClick={skip}>Skip tour</Button>
                      <Button size="sm" className="h-11 flex-1 gap-1 text-sm shadow-lg shadow-primary/20" onClick={next}>Start tour <ChevronRight className="h-3.5 w-3.5" /></Button>
                  </>
                ) : (
                  <>
                      <Button variant="outline" size="icon" aria-label="Previous tour step" className="h-11 w-11 shrink-0 rounded-xl" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" className="h-11 px-2 text-xs" onClick={skip}>Skip</Button>
                      <Button size="sm" className="h-11 flex-1 gap-1 rounded-xl text-sm shadow-lg shadow-primary/20" onClick={next}>
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
