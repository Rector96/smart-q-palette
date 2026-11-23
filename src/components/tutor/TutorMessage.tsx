import { useState } from "react";
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

const superscripts: Record<string, string> = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","n":"ⁿ","i":"ⁱ" };
const subscripts: Record<string, string> = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋","n":"ₙ","i":"ᵢ" };

function groupValue(source: string, start: number): [string, number] {
  if (source[start] !== "{") return [source[start] || "", start + 1];
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return [source.slice(start + 1, i), i + 1];
  }
  return [source.slice(start + 1), source.length];
}
function readableMath(input: string) {
  let s = input.replace(/\\left|\\right/g, "").replace(/\\,/g, " ").replace(/\\;/g, " ");
  s = s.replace(/\\frac\s*/g, "FRAC ").replace(/\\sqrt\s*/g, "ROOT ");
  s = s.replace(/\\times/g, "×").replace(/\\cdot/g, "·").replace(/\\div/g, "÷")
    .replace(/\\pi/g, "π").replace(/\\theta/g, "θ").replace(/\\Delta/g, "Δ")
    .replace(/\\alpha/g, "α").replace(/\\beta/g, "β").replace(/\\mu/g, "μ")
    .replace(/\\omega/g, "ω").replace(/\\lambda/g, "λ").replace(/\\rightarrow|\\to/g, "→")
    .replace(/\\leq|\\le/g, "≤").replace(/\\geq|\\ge/g, "≥").replace(/\\neq/g, "≠")
    .replace(/\\approx/g, "≈").replace(/\\pm/g, "±").replace(/\\infty/g, "∞")
    .replace(/\\degree/g, "°").replace(/\\perp/g, "⊥").replace(/\\parallel/g, "∥");
  let out = "";
  for (let i = 0; i < s.length;) {
    if (s.startsWith("FRAC ", i)) {
      const [a, afterA] = groupValue(s, i + 5);
      const [b, afterB] = groupValue(s, afterA);
      out += "(" + readableMath(a) + ") / (" + readableMath(b) + ")";
      i = afterB;
    } else if (s.startsWith("ROOT ", i)) {
      const [a, after] = groupValue(s, i + 5);
      out += "√(" + readableMath(a) + ")";
      i = after;
    } else if (s[i] === "^" || s[i] === "_") {
      const upper = s[i] === "^";
      const [v, after] = groupValue(s, i + 1);
      const map = upper ? superscripts : subscripts;
      out += [...v].map(c => map[c] || c).join("");
      i = after;
    } else if (s[i] === "\\") {
      const match = s.slice(i).match(/^\\([A-Za-z]+)/);
      if (match) { out += match[1]; i += match[0].length; }
      else { i++; }
    } else if (s[i] !== "{" && s[i] !== "}") {
      out += s[i++]; 
    } else i++;
  }
  return out.replace(/\s+/g, " ").trim();
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
            {card.formula && <div className="mt-3 overflow-x-auto rounded-xl border border-blue-100 bg-white px-3 py-3 text-center dark:border-blue-900 dark:bg-slate-950">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-300">Formula / working</div>
              <div className="mt-1 whitespace-nowrap font-serif text-lg font-semibold tracking-wide text-slate-900 dark:text-slate-100" aria-label={`Formula: ${readableMath(card.formula)}`}>{readableMath(card.formula)}</div>
            </div>}
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
