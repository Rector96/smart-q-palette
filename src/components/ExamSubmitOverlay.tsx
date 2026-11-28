import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import logoImg from "@/assets/logo.png";

interface ExamSubmitOverlayProps {
  isComplete: boolean;
}

const ExamSubmitOverlay = ({ isComplete }: ExamSubmitOverlayProps) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedMs((elapsed) => Math.min(elapsed + 100, 10_000));
    }, 100);
    return () => window.clearInterval(interval);
  }, []);

  const targetProgress = isComplete ? 100 : Math.min(Math.round((elapsedMs / 10_000) * 80), 80);

  useEffect(() => {
    if (progress === targetProgress) return;
    const interval = window.setInterval(() => {
      setProgress((current) => current < targetProgress
        ? Math.min(current + 1, targetProgress)
        : Math.max(current - 1, targetProgress));
    }, 25);
    return () => window.clearInterval(interval);
  }, [progress, targetProgress]);

  const steps = [
    { label: "Submitting your answers", complete: isComplete },
    { label: "Calculating your score", complete: isComplete },
    { label: "Preparing your results", complete: isComplete },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-white px-4 py-8"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-[0_20px_60px_rgba(15,23,42,0.12)] sm:p-8">
        <div className="relative mx-auto mb-7 flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 animate-spin rounded-full border-[5px] border-blue-100 border-t-blue-500" />
          <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-blue-50">
            <img src={logoImg} alt="ROCKCBT" className="h-12 w-12 object-contain" />
          </div>
        </div>

        <h1 className="mb-6 text-2xl font-bold tracking-tight text-slate-950">
          Calculating Your Results...
        </h1>

        <ol className="mb-6 space-y-4 text-left">
          {steps.map((step, index) => (
            <li key={step.label} className="flex items-start gap-3 text-sm leading-5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                {step.complete ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                )}
              </span>
              <span className="text-slate-800">
                <span className="font-medium">{index + 1}. {step.label}</span>{" "}
                <span className={step.complete ? "font-medium text-emerald-700" : "text-slate-500"}>
                  ({step.complete ? "Completed" : "In Progress"})
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-3">
          <div
            className="h-3 flex-1 overflow-hidden rounded-full bg-blue-100"
            role="progressbar"
            aria-label="Exam submission progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="h-full rounded-full bg-blue-700 transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="w-10 text-right text-sm font-bold tabular-nums text-blue-950">{progress}%</span>
        </div>

        <p className="mt-6 text-sm text-slate-500">Please do not refresh or close this tab.</p>
      </div>
    </motion.div>
  );
};

export default ExamSubmitOverlay;
