import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Crown, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Logo from "@/components/Logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface DesktopHeaderProps {
  profileName: string | null;
  isPro: boolean;
}

const DesktopHeader = ({ profileName, isPro }: DesktopHeaderProps) => {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  return (
    <header className="hidden lg:flex items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-6 py-3 sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Dashboard</span>
      </div>
      <div className="flex items-center gap-3">
        {isPro && (
          <Badge variant="default" className="text-xs h-6 gap-1 bg-primary/10 text-primary border-primary/20">
            <Crown className="h-3 w-3" /> Pro
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 text-sm">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {profileName ? profileName.charAt(0).toUpperCase() : "U"}
              </div>
              {profileName?.split(" ")[0] || "User"}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate("/profile")}>Profile</DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>Sign Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default DesktopHeader;
