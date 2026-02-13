import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Crown, CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SubscriptionModal = ({ open, onOpenChange }: Props) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handlePaystack = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("paystack-initialize", {
        body: {
          amount: 150000, // ₦1,500 in kobo
          callback_url: `${window.location.origin}/dashboard?payment=verify`,
        },
      });

      if (res.error) throw new Error(res.error.message);
      const result = res.data;
      if (result?.data?.authorization_url) {
        window.location.href = result.data.authorization_url;
      } else {
        throw new Error("Failed to initialize payment");
      }
    } catch (err: any) {
      toast({ title: "Payment error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const benefits = [
    "Unlimited exam sessions",
    "All subjects & 25,000+ questions",
    "AI Tutor with 24/7 access",
    "Detailed analytics & progress tracking",
    "Exam sharing with friends",
    "Priority support",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Crown className="h-5 w-5 text-warning" />
            <DialogTitle className="text-lg">Upgrade to SurePass Pro</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            You've used your 2 free trials. Subscribe now to unlock unlimited access!
          </DialogDescription>
        </DialogHeader>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-2xl font-bold">₦1,500</span>
              <span className="text-xs text-muted-foreground">/ lifetime access</span>
            </div>
            <ul className="space-y-2">
              {benefits.map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button className="w-full h-10 text-sm" onClick={handlePaystack} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
            Pay with Paystack
          </Button>
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            Secure payment via Paystack · Card, Bank Transfer, USSD supported · Instant activation after payment
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SubscriptionModal;
