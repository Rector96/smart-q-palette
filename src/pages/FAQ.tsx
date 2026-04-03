import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Logo from "@/components/Logo";
import SEOHead from "@/components/SEOHead";

const faqs = [
  { q: "What is Weblines CBT?", a: "Weblines CBT is an AI-powered CBT preparation platform that helps students practice with real exam-style questions for JAMB, WAEC, NECO and more, get instant AI explanations, and track their progress." },
  { q: "How does the free trial work?", a: "You get 3 free exam sessions to explore the platform. After that, subscribe for just ₦2,000 to unlock unlimited access to all features." },
  { q: "What subjects are available?", a: "We cover all 14 JAMB subjects: English, Mathematics, Physics, Chemistry, Biology, Economics, Government, Literature, CRS, IRS, Geography, Commerce, Accounting, and Agricultural Science." },
  { q: "How does the AI Tutor work?", a: "Our AI Tutor is available 24/7 to explain concepts, solve problems step-by-step, and provide personalized study guidance based on the Nigerian curriculum." },
  { q: "Can I share exams with friends?", a: "Yes! After completing an exam, you can generate a share link. Your friends can take the same exam and compare results." },
  { q: "Is my data safe?", a: "Absolutely. We use industry-standard encryption, secure authentication, and never share your personal information with third parties." },
  { q: "What exam modes are available?", a: "We offer Practice (untimed with instant feedback), CBT Exam (timed like real JAMB), Mock Exam (full 4-subject simulation), and Revision (focuses on your weak areas)." },
  { q: "How do I subscribe?", a: "After your 3 free trials, you'll be prompted to subscribe. Pay ₦2,000 via Paystack (card, bank transfer, or USSD). Access is activated instantly!" },
];

const FAQ = () => {
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
      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-2">Frequently Asked Questions</h1>
        <p className="text-sm text-muted-foreground mb-8">Find answers to common questions about Weblines CBT.</p>
        <Accordion type="single" collapsible className="space-y-2">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border border-border/50 rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium hover:no-underline">{faq.q}</AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground leading-relaxed">{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </main>
    </div>
  );
};

export default FAQ;
