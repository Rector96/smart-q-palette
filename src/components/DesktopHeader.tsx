import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Crown, ChevronDown, Shield } from "lucide-react";
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
  const { signOut } = useAuth();
  const { isAdmin } = useAdmin();

  return (
    <header className="safe-area-top sticky top-0 z-50 flex w-full items-center justify-between border-b border-border bg-background/95 px-3 pt-3 pb-2.5 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/85 sm:px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <Logo size="sm" showText />
        <span className="hidden text-xs font-medium text-muted-foreground sm:inline">Learn · Practise · Earn</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <NotificationBell />
        {isPro && <Badge variant="default" className="hidden h-6 gap-1 border-primary/20 bg-primary/10 text-xs text-primary sm:inline-flex"><Crown className="h-3 w-3" /> Pro</Badge>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 max-w-[190px] gap-2 px-2 text-sm">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{getSurname(profileName).charAt(0).toUpperCase()}</div>
              <span className="hidden truncate sm:inline">{getSurname(profileName)}</span>
              <ChevronDown className="hidden h-3 w-3 shrink-0 sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isAdmin && (
              <DropdownMenuItem onClick={() => navigate("/admin")}>
                <Shield className="mr-2 h-4 w-4" />Admin Dashboard
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate("/profile")}>Profile</DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>Sign Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default DesktopHeader;
