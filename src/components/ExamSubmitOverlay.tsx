import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import logoImg from "@/assets/logo.png";

const STATUS_MESSAGES = [
  "Submitting your answers…",
  "Checking answers…",
  "Calculating score…",
  "Generating performance insights…",
];

const ExamSubmitOverlay = () => {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => Math.min(prev + 1, STATUS_MESSAGES.length - 1));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm mx-auto px-6 space-y-8">
        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-center"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Submitting...
        </motion.h2>

        {/* Skeleton Cards */}
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded-2xl bg-secondary/60 p-4 space-y-2"
            >
              <div className="h-3 w-3/4 rounded-full bg-muted-foreground/10 animate-pulse" />
              <div className="h-3 w-1/2 rounded-full bg-muted-foreground/10 animate-pulse" />
              {i < 2 && <div className="h-3 w-2/3 rounded-full bg-muted-foreground/10 animate-pulse" />}
            </motion.div>
          ))}
        </div>

        {/* Animated Logo + Spinner */}
        <div className="flex flex-col items-center gap-4">
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="relative"
          >
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
              <img src={logoImg} alt="PassSmartly" className="h-12 w-12 object-contain" />
            </div>
            {/* Orbiting dots */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="absolute inset-[-12px]"
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="absolute h-2.5 w-2.5 rounded-full bg-primary/40"
                  style={{
                    top: `${50 - 50 * Math.cos((2 * Math.PI * i) / 6)}%`,
                    left: `${50 + 50 * Math.sin((2 * Math.PI * i) / 6)}%`,
                    transform: "translate(-50%, -50%)",
                    opacity: 0.3 + (i * 0.12),
                  }}
                />
              ))}
            </motion.div>
          </motion.div>
          <motion.p
            key={msgIndex}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-muted-foreground font-medium"
          >
            {STATUS_MESSAGES[msgIndex]}
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
};

export default ExamSubmitOverlay;
