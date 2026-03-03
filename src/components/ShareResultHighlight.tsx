import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Share2, X } from "lucide-react";

const STORAGE_KEY = "weblines_share_highlight_shown";

interface Props {
  onShare: () => void;
}

const ShareResultHighlight = ({ onShare }: Props) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, "true");
  };

  const handleShare = () => {
    dismiss();
    onShare();
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-sm"
        >
          <div className="bg-card border border-primary/30 rounded-2xl p-4 shadow-2xl relative overflow-hidden">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 animate-pulse pointer-events-none" />
            
            <button onClick={dismiss} className="absolute top-3 right-3 h-6 w-6 rounded-full bg-secondary flex items-center justify-center z-10">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            <div className="relative z-10 flex items-start gap-3">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"
              >
                <Share2 className="h-5 w-5 text-primary" />
              </motion.div>
              <div className="flex-1">
                <p className="text-sm font-bold mb-1">Proud of your score? 🔥</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">Share it and challenge your friends!</p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={dismiss}>Got it</Button>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleShare}>
                    <Share2 className="h-3 w-3" /> Share Now
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShareResultHighlight;
