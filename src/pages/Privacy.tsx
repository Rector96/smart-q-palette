import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

const Privacy = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Logo size="sm" />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10 prose prose-sm max-w-none">
        <h1 className="text-2xl font-bold mb-6">Privacy Policy</h1>
        <p className="text-xs text-muted-foreground mb-4">Last updated: February 2026</p>
        <section className="space-y-4 text-xs text-muted-foreground leading-relaxed">
          <div><h2 className="text-sm font-semibold text-foreground mb-1">1. Information We Collect</h2><p>We collect your name, email address, and exam performance data when you create an account and use PassSmartly. We do not collect unnecessary personal information.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">2. How We Use Your Information</h2><p>Your data is used to personalize your learning experience, track progress, provide AI tutoring, and improve our platform. We never sell your data to third parties.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">3. Data Security</h2><p>We use industry-standard encryption (SSL/TLS), secure authentication with hashed passwords, and follow best practices to protect your data from unauthorized access.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">4. Data Sharing</h2><p>We do not share your personal information with third parties except as required by law. Anonymized usage data may be used for analytics and platform improvement.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">5. Your Rights</h2><p>You can request access to, correction of, or deletion of your personal data at any time by contacting us at support@passsmartly.com.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">6. Cookies</h2><p>We use essential cookies to maintain your session and remember preferences. No third-party tracking cookies are used.</p></div>
          <div><h2 className="text-sm font-semibold text-foreground mb-1">7. Contact Us</h2><p>For privacy-related inquiries, email us at support@passsmartly.com.</p></div>
        </section>
      </main>
    </div>
  );
};

export default Privacy;
