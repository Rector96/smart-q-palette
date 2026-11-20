import { useLocation, useNavigate } from "react-router-dom";
import { Home, BookOpenCheck, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Home", icon: Home },
  { path: "/select-subjects", label: "Practice", icon: BookOpenCheck },
  { path: "/ai-tutor", label: "AI Tutor", icon: Sparkles },
  { path: "/profile", label: "Profile", icon: User },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  return (
    <motion.nav
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-card/95 shadow-[0_-8px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/85"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pt-2 pb-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => navigate(item.path)}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 transition-colors duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="mobile-nav-active"
                  className="absolute inset-x-3 inset-y-0 rounded-2xl bg-primary/10"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                />
              )}
              <item.icon className={cn("relative z-10 h-5 w-5", active && "stroke-[2.5]")} />
              <span className={cn("relative z-10 text-[10px] leading-none", active ? "font-bold" : "font-medium")}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom,0px)]" />
    </motion.nav>
  );
};

export default BottomNav;
