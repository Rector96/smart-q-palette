import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Crown, ChevronDown, Shield, UserRound, LogOut } from "lucide-react";
import { useAdmin } from "@/hooks/useAdmin";
import NotificationBell from "@/components/NotificationBell";
import { Badge } from "@/components/ui/badge";
import Logo from "@/components/Logo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface DesktopHeaderProps { profileName: string | null; isPro: boolean; }

const getSurname = (fullName: string | null) => {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "Student";
};

const DesktopHeader = ({ profileName, isPro }: DesktopHeaderProps) => {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const { isAdmin } = useAdmin();

  return (
    <header className="safe-area-top sticky top-0 z-50 flex h-14 w-full items-center justify-between border-b border-border bg-background/95 px-3 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/85 sm:px-5 lg:px-6 xl:h-[60px]">
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <Logo size="sm" showText />
        <span className="hidden text-xs font-medium text-muted-foreground sm:inline">Learn · Practise · Earn</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <NotificationBell />
        {isPro && <Badge variant="default" className="hidden h-6 gap-1 border-primary/20 bg-primary/10 text-xs text-primary sm:inline-flex"><Crown className="h-3 w-3" /> Pro</Badge>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open profile menu" aria-haspopup="menu" className="relative h-10 w-10 shrink-0 rounded-full border border-border bg-background p-0 shadow-sm transition hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" /> : <span className="flex h-full w-full items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"><UserRound className="h-[18px] w-[18px]" /></span>}
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"><ChevronDown className="h-2.5 w-2.5" /></span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="z-[70] w-[min(16rem,calc(100vw-1.5rem))] rounded-xl p-2">
            {isAdmin && (
              <DropdownMenuItem onClick={() => navigate("/admin")}>
                <Shield className="mr-2 h-4 w-4" />Admin Dashboard
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="min-h-10 rounded-lg" onClick={() => navigate("/profile")}><UserRound className="mr-2 h-4 w-4" />Profile & account</DropdownMenuItem>
            <DropdownMenuItem className="min-h-10 rounded-lg" onClick={() => signOut()}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default DesktopHeader;
