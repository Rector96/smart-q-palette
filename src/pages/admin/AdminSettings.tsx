import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ArrowLeft, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AdminSettings = () => {
  const { toast } = useToast();
  const [pricing, setPricing] = useState("1500");
  const [trialLimit, setTrialLimit] = useState("2");

  const handleSave = () => {
    toast({ title: "Settings saved", description: `Price: ₦${pricing}, Trials: ${trialLimit}` });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/admin"><ArrowLeft className="h-4 w-4" /></Link>
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-bold text-sm">System Settings</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Pricing & Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Subscription Price (₦)</Label>
              <Input value={pricing} onChange={(e) => setPricing(e.target.value)} className="h-9 text-sm" type="number" />
            </div>
            <div>
              <Label className="text-xs">Free Trial Limit</Label>
              <Input value={trialLimit} onChange={(e) => setTrialLimit(e.target.value)} className="h-9 text-sm" type="number" />
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={handleSave}>
              <Save className="h-3.5 w-3.5 mr-1" /> Save Settings
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminSettings;
