import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MotivationalModal = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const shown = sessionStorage.getItem("motivational_shown");
    if (!shown) {
      const timer = setTimeout(() => setShow(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const close = () => {
    setShow(false);
    sessionStorage.setItem("motivational_shown", "1");
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={close}
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] rounded-2xl overflow-hidden"
            style={{
              maxHeight: "65vh",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
            }}
          >
            {/* Background with overlay */}
            <div
              className="relative w-full flex flex-col items-center justify-center px-6 py-10"
              style={{
                background: "linear-gradient(135deg, hsl(217, 91%, 20%) 0%, hsl(262, 60%, 25%) 50%, hsl(30, 60%, 25%) 100%)",
              }}
            >
              {/* Warm lighting effect */}
              <div className="absolute inset-0 opacity-30" style={{
                background: "radial-gradient(ellipse at 50% 30%, hsl(38, 80%, 50%) 0%, transparent 70%)",
              }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

              <div className="relative z-10 text-center space-y-4">
                {/* Script headline */}
                <p className="text-white/80 text-sm italic" style={{ fontFamily: "'Georgia', serif" }}>
                  "Success is not cheap,"
                </p>

                {/* Bold main text */}
                <h2 className="text-white text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  YOU HAVE TO<br />PAY FOR IT.
                </h2>

                {/* Subtext */}
                <p className="text-white/60 text-xs leading-relaxed">
                  Practice. Discipline. Consistency.<br />Ready to begin?
                </p>

                {/* Primary CTA */}
                <button
                  onClick={close}
                  className="w-full mt-4 py-3 rounded-xl text-white font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, hsl(150, 60%, 42%) 0%, hsl(150, 70%, 35%) 100%)",
                    boxShadow: "0 4px 15px rgba(34, 197, 94, 0.3)",
                  }}
                >
                  Start Practicing
                </button>

                {/* Secondary link */}
                <button
                  onClick={close}
                  className="text-white/50 text-xs hover:text-white/80 transition-colors"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MotivationalModal;
