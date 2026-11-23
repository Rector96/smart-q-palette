import { useState } from "react";
import { Calculator, X, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const keys = [
  ["sin(", "cos(", "tan(", "√(", "π"],
  ["(", ")", "log(", "ln(", "÷"],
  ["7", "8", "9", "×", "−"],
  ["4", "5", "6", "+", "⌫"],
  ["1", "2", "3", ".", "C"],
  ["0", "00", "%", "^", "="],
];

const insertValue = (value: string, current: string) => {
  if (value === "C") return "";
  if (value === "⌫") return current.slice(0, -1);
  if (value === "=") return current;
  return current + value
    .replaceAll("÷", "/")
    .replaceAll("×", "*")
    .replaceAll("−", "-")
    .replaceAll("π", "Math.PI")
    .replaceAll("√(", "Math.sqrt(")
    .replaceAll("sin(", "Math.sin(")
    .replaceAll("cos(", "Math.cos(")
    .replaceAll("tan(", "Math.tan(")
    .replaceAll("log(", "Math.log10(")
    .replaceAll("ln(", "Math.log(")
    .replaceAll("^", "**");
};

const calculate = (expression: string) => {
  if (!expression.trim()) return "";
  if (!/^(?:[0-9+\-*/().%\s]|Math\.(?:PI|sqrt|sin|cos|tan|log10|log))*$/.test(expression)) throw new Error("Invalid expression");
  const result = Function('"use strict"; return (' + expression + ')')();
  if (typeof result !== "number" || !Number.isFinite(result)) throw new Error("Invalid result");
  return Number(result.toPrecision(12)).toString();
};

export default function ScientificCalculator({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const press = (key: string) => {
    setError("");
    if (key === "=") {
      try {
        const answer = calculate(expression);
        setResult(answer);
        setExpression(answer);
      } catch {
        setError("Check the expression");
      }
      return;
    }
    setExpression((current) => insertValue(key, current));
    setResult("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={open ? "default" : "outline"}
          size={compact ? "icon" : "sm"}
          className={compact ? "h-9 w-9 shrink-0 rounded-xl p-0" : "h-9 shrink-0 gap-2 rounded-xl px-3"}
          aria-expanded={open}
          aria-label={open ? "Close calculator" : "Open scientific calculator"}
          title="Open scientific calculator"
        >
          <Calculator className="h-4 w-4" />
          {!compact && <span className="text-xs font-semibold">Calculator</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="z-[60] w-[min(20rem,calc(100vw-1rem))] rounded-2xl border-0 bg-transparent p-0 shadow-none"
      >
        <Card className="overflow-hidden border-primary/25 bg-card/95 shadow-2xl backdrop-blur-md">
          <CardContent className="max-h-[min(80dvh,36rem)] space-y-2.5 overflow-y-auto p-2.5 sm:p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Calculator className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-xs font-bold sm:text-sm">Scientific calculator</p>
                  <p className="text-[9px] text-muted-foreground sm:text-[10px]">Use it without leaving your exam</p>
                </div>
              </div>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close calculator" title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-14 rounded-xl bg-secondary/80 px-3 py-2 text-right">
              <p className="min-h-4 break-all text-[10px] text-muted-foreground sm:text-xs">{expression || "0"}</p>
              <p className="min-h-6 break-all text-lg font-bold tabular-nums sm:text-xl">{error || result || " "}</p>
            </div>
            <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
              {keys.flat().map((key) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={key === "=" ? "default" : key === "C" ? "destructive" : "secondary"}
                  className="h-9 min-w-0 rounded-lg px-0.5 text-[11px] font-semibold sm:h-10 sm:text-xs"
                  onClick={() => press(key)}
                >
                  {key === "⌫" ? <Delete className="h-4 w-4" /> : key}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}
