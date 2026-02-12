import { BookOpen, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Terms = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm tracking-tight">SurePass</span>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10 prose prose-sm max-w-none">
        <h1 className="text-2xl font-bold mb-6">Terms of Service</h1>
        <p className="text-xs text-muted-foreground mb-4">Last updated: February 2026</p>
        <section className="space-y-4 text-xs text-muted-foreground leading-relaxed">
          <div><h2 className="text-sm font-semibold text-foreground mb-1">1. Acceptance</h2><p>By using SurePass, you agree to these terms. If you don't agree, please don't use the platform.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">2. Service Description</h2><p>SurePass provides AI-powered JAMB CBT practice, tutoring, and performance tracking for Nigerian students.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">3. Accounts</h2><p>You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">4. Free Trial & Subscription</h2><p>Users receive 2 free exam sessions. Continued access requires a subscription of ₦1,500 via bank transfer. Subscriptions are non-refundable once activated.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">5. Acceptable Use</h2><p>You may not share your account, attempt to exploit vulnerabilities, or use automated tools to scrape content from the platform.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">6. Intellectual Property</h2><p>All questions, content, and software on SurePass are our intellectual property. You may not reproduce or distribute them without permission.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">7. Limitation of Liability</h2><p>SurePass is provided "as is." We are not liable for any exam outcomes or damages arising from platform use.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">8. Changes</h2><p>We may update these terms. Continued use constitutes acceptance of any changes.</p></div>
        </section>
      </main>
    </div>
  );
};

export default Terms;
