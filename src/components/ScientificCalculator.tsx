import { useState } from "react";
import { Calculator, X, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
  const mapped = value
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
  return current + mapped;
};

const calculate = (expression: string) => {
  if (!expression.trim()) return "";
  if (!/^[0-9+\-*/().%\s*MathPIa-z]*$/.test(expression)) throw new Error("Invalid expression");
  if (!/^(?:[0-9+\-*/().%\s]|Math\.(?:PI|sqrt|sin|cos|tan|log10|log))*$/.test(expression)) throw new Error("Invalid expression");
  const result = Function('"use strict"; return (' + expression + ')')();
  if (typeof result !== "number" || !Number.isFinite(result)) throw new Error("Invalid result");
  return Number(result.toPrecision(12)).toString();
};

export default function ScientificCalculator() {
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
    <>
      <Button
        type="button"
        variant={open ? "default" : "outline"}
        size="sm"
        className="h-9 rounded-xl gap-2"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close calculator" : "Open calculator"}
      >
        <Calculator className="h-4 w-4" />
        <span className="hidden sm:inline">Calculator</span>
      </Button>
      {open && (
        <div className="fixed inset-x-2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto w-auto max-w-[22rem] sm:inset-x-auto sm:right-5 sm:bottom-20 sm:w-[22rem]">
          <Card className="overflow-hidden border-primary/20 shadow-2xl">
            <CardContent className="space-y-3 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">Scientific calculator</p>
                  <p className="text-[10px] text-muted-foreground">For working out calculations</p>
                </div>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close calculator">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="min-h-16 rounded-xl bg-secondary/70 px-3 py-2 text-right">
                <p className="min-h-5 break-all text-xs text-muted-foreground">{expression || "0"}</p>
                <p className="min-h-7 break-all text-xl font-bold tabular-nums">{error || result || " "}</p>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {keys.flat().map((key) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={key === "=" ? "default" : key === "C" ? "destructive" : "secondary"}
                    className="h-10 min-w-0 rounded-lg px-1 text-xs font-semibold sm:h-11"
                    onClick={() => press(key)}
                  >
                    {key === "⌫" ? <Delete className="h-4 w-4" /> : key}
                  </Button>
                ))}
              </div>
              <p className="text-center text-[10px] text-muted-foreground">Close it anytime to return to your question.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
