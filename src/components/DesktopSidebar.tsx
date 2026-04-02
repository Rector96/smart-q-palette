import { useLocation, useNavigate } from "react-router-dom";
import { Home, BarChart3, Sparkles, User, BookOpen, Shield, FileEdit, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import { useAdmin } from "@/hooks/useAdmin";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Home", icon: Home },
  { path: "/select-subjects", label: "Exams", icon: BarChart3 },
  { path: "/ai-tutor", label: "AI Tutor", icon: Sparkles },
  { path: "/library", label: "Library", icon: BookOpen },
  { path: "/live-quiz", label: "Live Quiz", icon: Users },
  { path: "/live-quiz", label: "Live Quiz", icon: Users },
  { path: "/profile", label: "Profile", icon: User },
];

const DesktopSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="hidden lg:flex flex-col w-56 min-h-screen border-r border-border bg-card shrink-0 sticky top-0 h-screen">
      <div className="p-4 border-b border-border">
        <Logo size="sm" showText className="cursor-pointer" />
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
        {isAdmin && (
          <button
            onClick={() => navigate("/admin")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
              location.pathname.startsWith("/admin")
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Shield className="h-4 w-4" />
            Admin
          </button>
        )}
      </nav>
    </aside>
  );
};

export default DesktopSidebar;
