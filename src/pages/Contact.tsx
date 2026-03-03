import { ArrowLeft, Mail, Phone, MessageCircle, Instagram } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import Logo from "@/components/Logo";

const Contact = () => {
  const navigate = useNavigate();

  const contacts = [
    {
      icon: MessageCircle,
      title: "WhatsApp",
      value: "09125513765",
      sub: "Chat with us instantly",
      action: () => window.open("https://wa.me/2349125513765", "_blank"),
      color: "bg-[hsl(142,70%,45%)]/10 text-[hsl(142,70%,45%)]",
    },
    {
      icon: Phone,
      title: "Phone",
      value: "09032299387",
      sub: "Call us directly",
      action: () => window.open("tel:09032299387"),
      color: "bg-primary/10 text-primary",
    },
    {
      icon: Mail,
      title: "Email",
      value: "weblinescbt@gmail.com",
      sub: "We reply within 24 hours",
      action: () => window.open("mailto:weblinescbt@gmail.com"),
      color: "bg-destructive/10 text-destructive",
    },
    {
      icon: Instagram,
      title: "Instagram",
      value: "@passsmartly",
      sub: "Follow us for updates",
      action: () => window.open("https://www.instagram.com/passsmartly?igsh=dW9ybzFhazJ5MHcz", "_blank"),
      color: "bg-[hsl(330,70%,50%)]/10 text-[hsl(330,70%,50%)]",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Logo size="sm" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <h1 className="text-xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Get In Touch</h1>
          <p className="text-xs text-muted-foreground mt-1">We're here to help you ace your exams</p>
        </motion.div>

        <div className="space-y-3">
          {contacts.map((c, i) => (
            <motion.div key={c.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <Card
                className="border-border/50 shadow-sm hover:shadow-md transition-all cursor-pointer rounded-2xl"
                onClick={c.action}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${c.color}`}>
                    <c.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.value}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{c.sub}</p>
                  </div>
                  <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180 shrink-0" />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="text-center pt-2">
          <p className="text-xs text-muted-foreground">
            Looking for quick answers?{" "}
            <button onClick={() => navigate("/faq")} className="text-primary hover:underline font-medium">
              Check our FAQ
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Contact;
