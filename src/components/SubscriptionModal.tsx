import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Crown, CheckCircle2, CreditCard, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SubscriptionModal = ({ open, onOpenChange }: Props) => {
  const { toast } = useToast();

  const copyAccount = () => {
    navigator.clipboard.writeText("0123456789 - SurePass Education Ltd - GTBank");
    toast({ title: "Copied!", description: "Bank details copied to clipboard." });
  };

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
              {[
                "Unlimited exam sessions",
                "All 14 subjects & 25,000+ questions",
                "AI Tutor with 24/7 access",
                "Detailed analytics & progress tracking",
                "Exam sharing with friends",
                "Priority support",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold mb-1">Payment Details:</p>
            <Card className="border-border/50">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">GTBank</p>
                    <p className="text-xs text-muted-foreground">0123456789</p>
                    <p className="text-xs text-muted-foreground">SurePass Education Ltd</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyAccount}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            After payment, send proof of payment (screenshot) to <span className="font-medium text-foreground">support@surepass.ng</span> or WhatsApp <span className="font-medium text-foreground">+234 800 SUREPASS</span>. Access will be activated within minutes.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SubscriptionModal;
