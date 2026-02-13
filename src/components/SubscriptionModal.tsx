import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Crown, CheckCircle2, CreditCard, Loader2, Sparkles, Shield, Zap, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";

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
      const res = await supabase.functions.invoke("paystack-initialize", {
        body: {
          amount: 150000,
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
    { icon: BookOpen, text: "Unlimited exam sessions — practice as much as you want" },
    { icon: Sparkles, text: "AI Tutor with 24/7 access — your personal study companion" },
    { icon: Zap, text: "25,000+ questions across all 14 JAMB subjects" },
    { icon: Shield, text: "Detailed analytics & progress tracking" },
    { icon: Crown, text: "Exam sharing with friends & priority support" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        {/* Header gradient */}
        <div className="bg-gradient-to-br from-primary via-primary to-primary/80 p-6 text-primary-foreground text-center">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
            <div className="h-14 w-14 rounded-full bg-primary-foreground/20 flex items-center justify-center mx-auto mb-3">
              <Crown className="h-7 w-7" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl text-primary-foreground">Unlock Your Full Potential 🚀</DialogTitle>
              <DialogDescription className="text-primary-foreground/80 text-xs mt-1">
                You've completed your 2 free sessions. Thousands of students have upgraded and improved their scores by 40%+
              </DialogDescription>
            </DialogHeader>
          </motion.div>
        </div>

        <div className="p-6 space-y-5">
          {/* Price */}
          <div className="text-center">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-3xl font-bold">₦1,500</span>
              <span className="text-xs text-muted-foreground">one-time payment</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">That's less than ₦5/day for a lifetime of exam prep!</p>
          </div>

          {/* Benefits */}
          <div className="space-y-2.5">
            {benefits.map((b, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <b.icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="text-xs leading-relaxed">{b.text}</p>
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <div className="space-y-3">
            <Button className="w-full h-11 text-sm font-semibold" onClick={handlePaystack} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Upgrade Now — ₦1,500
            </Button>
            <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Secure payment</span>
              <span>Card · Bank Transfer · USSD</span>
            </div>
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              ✅ Instant activation after payment · 💯 Money-back guarantee if unsatisfied
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SubscriptionModal;
