import { useEffect, useRef, useState } from "react";
import { BookOpen, Lightbulb, Pencil, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TutorLesson = {
  type: "lesson";
  title: string;
  summary: string;
  cards: { badge: string; heading: string; explanation: string; formula: string | null; is_final_answer: boolean }[];
  callout: { label: string; text: string };
  practice: { question: string; hint: string };
};
export type TutorChat = { type: "chat"; message: string };
export type TutorStructured = TutorLesson | TutorChat;

type MathJaxRuntime = {
  typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
  typesetClear?: (elements?: HTMLElement[]) => void;
  tex?: { inlineMath: string[][]; displayMath: string[][]; packages: { "[+]": string[] } };
  options?: { skipHtmlTags: string[] };
  startup?: { typeset: boolean };
};
type LoadedMathJax = MathJaxRuntime & { typesetPromise: (elements?: HTMLElement[]) => Promise<void> };

declare global {
  interface Window {
    MathJax?: MathJaxRuntime;
    __rockcbtMathJaxPromise?: Promise<LoadedMathJax>;
  }
}

const isMathJaxLoaded = (value: MathJaxRuntime | undefined): value is LoadedMathJax =>
  typeof value?.typesetPromise === "function";

function loadMathJax(): Promise<LoadedMathJax> {
  if (isMathJaxLoaded(window.MathJax)) return Promise.resolve(window.MathJax);
  if (window.__rockcbtMathJaxPromise) return window.__rockcbtMathJaxPromise;
  window.MathJax = {
    tex: { inlineMath: [["\\(", "\\)"]], displayMath: [["\\[", "\\]"]], packages: { "[+]": ["ams"] } },
    options: { skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"] },
    startup: { typeset: false },
  };
  window.__rockcbtMathJaxPromise = new Promise<LoadedMathJax>((resolve, reject) => {
    const resolveLoadedMathJax = () => {
      if (isMathJaxLoaded(window.MathJax)) resolve(window.MathJax);
      else reject(new Error("MathJax loaded without a formula renderer."));
    };
    const existing = document.getElementById("rockcbt-mathjax") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", resolveLoadedMathJax, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "rockcbt-mathjax";
    script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
    script.async = true;
    script.onload = resolveLoadedMathJax;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return window.__rockcbtMathJaxPromise;
}

function FormulaDisplay({ formula }: { formula: string }) {
  const formulaRef = useRef<HTMLDivElement>(null);
  const [mathReady, setMathReady] = useState(false);
  useEffect(() => {
    const formulaElement = formulaRef.current;
    if (!formulaElement) return;
    let cancelled = false;
    loadMathJax().then(async (mathJax) => {
      if (cancelled) return;
      await mathJax.typesetPromise([formulaElement]);
      if (!cancelled) setMathReady(true);
    }).catch(() => setMathReady(false));
    return () => {
      cancelled = true;
      const mathJax = window.MathJax;
      if (mathJax?.typesetClear) mathJax.typesetClear([formulaElement]);
    };
  }, [formula]);
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-blue-100 bg-white px-3 py-3 text-center dark:border-blue-900 dark:bg-slate-950">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-300">Mathematical formula</div>
      <div ref={formulaRef} className="mt-2 min-h-7 text-lg text-slate-900 dark:text-slate-100" aria-label={`Mathematical formula ${formula}`}>{`\\[${formula}\\]`}</div>
      {!mathReady && <p className="mt-1 text-[10px] text-muted-foreground">Loading formatted equation…</p>}
    </div>
  );
}

export function TutorMessage({ response, onPracticeAnswer }: { response: TutorStructured; onPracticeAnswer: (answer: string) => void }) {
  const [hintOpen, setHintOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  if (response.type === "chat") return <p className="whitespace-pre-wrap leading-7">{response.message}</p>;
  return (
    <div className="w-full space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300"><BookOpen className="h-4 w-4" /> Lesson</div>
        <h2 className="text-lg font-extrabold leading-tight text-foreground sm:text-xl">{response.title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{response.summary}</p>
      </div>
      <div className="space-y-3">
        {response.cards.map((card, index) => (
          <article key={index} className={`rounded-2xl border p-4 shadow-sm ${card.is_final_answer ? "border-emerald-300 bg-emerald-50/90 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-border bg-background"}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">{card.badge || `Step ${index + 1}`}</span>
              {card.is_final_answer && <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Final answer</span>}
            </div>
            <h3 className="text-sm font-bold text-foreground">{card.heading}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{card.explanation}</p>
            {card.formula && <FormulaDisplay formula={card.formula} />}
          </article>
        ))}
      </div>
      <aside className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/30">
        <div className="flex items-center gap-2 text-sm font-bold text-sky-900 dark:text-sky-200"><Lightbulb className="h-4 w-4" /> {response.callout?.label || "Exam tip"}</div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-sky-950 dark:text-sky-100">{response.callout?.text}</p>
      </aside>
      {response.practice && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
        <div className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200"><Pencil className="h-4 w-4" /> Your turn</div>
        <p className="mt-2 text-sm font-semibold leading-6 text-amber-950 dark:text-amber-100">{response.practice.question}</p>
        <button type="button" onClick={() => setHintOpen(v => !v)} className="mt-3 text-xs font-bold text-amber-800 underline underline-offset-4 dark:text-amber-200">{hintOpen ? "Hide hint" : "Show hint"}</button>
        {hintOpen && <p className="mt-2 rounded-lg bg-white/80 p-3 text-sm text-amber-950 dark:bg-black/20 dark:text-amber-100">{response.practice.hint}</p>}
        <form onSubmit={(e) => { e.preventDefault(); if (answer.trim()) { onPracticeAnswer(answer.trim()); setAnswer(""); } }} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your answer here…" aria-label="Your practice answer" className="h-11 min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-800 dark:bg-slate-950 dark:text-white" />
          <Button type="submit" disabled={!answer.trim()} className="h-11 rounded-xl bg-amber-700 text-white hover:bg-amber-800"><Send className="mr-2 h-4 w-4" /> Check my answer</Button>
        </form>
      </section>}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> Keep going — understanding grows with practice.</div>
    </div>
  );
}
