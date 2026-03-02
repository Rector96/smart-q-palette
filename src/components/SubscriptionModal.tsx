import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, CheckCircle2, CreditCard, Loader2, Shield } from "lucide-react";
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
    "Unlimited practice exams",
    "Detailed performance analytics",
    "Expert explanations for every answer",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-3xl border-0 shadow-2xl">
        {/* Header Gradient */}
        <div className="h-24 bg-gradient-to-r from-primary via-[hsl(262,83%,58%)] to-primary relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-2 right-2 w-20 h-20 rounded-full bg-white/30" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-white/20" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-block p-3 bg-white/20 rounded-2xl mb-2"
              >
                <Crown className="h-8 w-8 text-primary-foreground" />
              </motion.div>
              <p className="text-primary-foreground font-bold text-sm">You've Used Your Free Trials</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <p className="text-muted-foreground text-center text-sm leading-relaxed mb-6">
            You've reached your free limit. Unlock unlimited exams, AI Tutor, and advanced features for just <span className="font-bold text-foreground">₦1,500</span> — lifetime access!
          </p>

          {/* Benefits */}
          <div className="space-y-3 mb-8">
            {benefits.map((b, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-3"
              >
                <div className="w-5 h-5 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3 h-3 text-[hsl(var(--success))]" />
                </div>
                <span className="text-sm font-medium">{b}</span>
              </motion.div>
            ))}
          </div>

          {/* Pricing */}
          <div className="bg-gradient-to-br from-primary/5 to-[hsl(262,83%,58%)]/5 rounded-2xl p-4 mb-8 border border-primary/10">
            <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase mb-2">LIMITED TIME OFFER</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">₦1,500</span>
              <span className="text-muted-foreground text-sm font-medium">/lifetime</span>
            </div>
            <p className="text-muted-foreground text-xs mt-2">Cancel anytime. No hidden charges.</p>
          </div>

          {/* CTA */}
          <Button
            className="w-full h-12 text-sm font-bold rounded-xl shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all"
            onClick={handlePaystack}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
            Subscribe Now
          </Button>
          <Button
            variant="ghost"
            className="w-full h-10 mt-3 text-sm font-semibold text-muted-foreground rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Maybe Later
          </Button>
          <div className="flex items-center justify-center gap-2 mt-3 text-[10px] text-muted-foreground">
            <Shield className="h-3 w-3" /> Secure payment via Paystack
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SubscriptionModal;
