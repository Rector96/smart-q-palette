import { useLocation, useNavigate } from "react-router-dom";
import { Home, BarChart3, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const NAV_ITEMS = [
  { path: "/", label: "Home", icon: Home },
  { path: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { path: "/ai-tutor", label: "AI Tutor", icon: Sparkles },
  { path: "/profile", label: "Profile", icon: User },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const isAITutor = location.pathname === "/ai-tutor";

  useEffect(() => {
    if (isAITutor) {
      // On AI tutor page, hide on any touch/focus on input
      const hideNav = () => setVisible(false);
      const showNav = () => setVisible(true);

      const handleFocusIn = (e: FocusEvent) => {
        if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") {
          hideNav();
        }
      };
      const handleFocusOut = () => {
        setTimeout(showNav, 200);
      };
      const handleTouchStart = () => hideNav();

      document.addEventListener("focusin", handleFocusIn);
      document.addEventListener("focusout", handleFocusOut);
      // Hide on scroll too
      const handleScroll = () => {
        const currentY = window.scrollY;
        if (currentY > lastScrollY.current && currentY > 60) setVisible(false);
        else setVisible(true);
        lastScrollY.current = currentY;
      };
      window.addEventListener("scroll", handleScroll, { passive: true });

      return () => {
        document.removeEventListener("focusin", handleFocusIn);
        document.removeEventListener("focusout", handleFocusOut);
        window.removeEventListener("scroll", handleScroll);
      };
    } else {
      const handleScroll = () => {
        const currentY = window.scrollY;
        if (currentY > lastScrollY.current && currentY > 60) setVisible(false);
        else setVisible(true);
        lastScrollY.current = currentY;
      };
      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, [isAITutor]);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.06)] rounded-t-2xl"
        >
          <div className="max-w-lg mx-auto flex items-center justify-around px-2 py-2">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors min-w-[60px]",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <item.icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                  <span className={cn("text-[10px] font-medium", active && "font-bold")}>{item.label}</span>
                  {active && (
                    <motion.div layoutId="bottomNavIndicator" className="h-0.5 w-4 rounded-full bg-primary mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </motion.nav>
      )}
    </AnimatePresence>
  );
};

export default BottomNav;
