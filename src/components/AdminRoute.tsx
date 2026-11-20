import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const { isAdmin, isSupportAgent, loading: adminLoading, error: adminError, refresh } = useAdmin();

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (adminError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center space-y-3">
          <ShieldAlert className="h-9 w-9 text-destructive mx-auto" />
          <h1 className="text-base font-semibold">Administrator access could not be verified</h1>
          <p className="text-sm text-muted-foreground">{adminError}</p>
          <Button onClick={() => void refresh()} className="w-full">Try again</Button>
        </div>
      </div>
    );
  }

  const supportAllowed = ["/admin", "/admin/users", "/admin/payments"].includes(location.pathname);
  if (!isAdmin && !(isSupportAgent && supportAllowed)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

export default AdminRoute;
