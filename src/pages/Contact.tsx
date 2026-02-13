import { useState } from "react";
import { ArrowLeft, Mail, Phone, MapPin, Send, Loader2, MessageSquare, Clock, Headphones } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import Logo from "@/components/Logo";

const Contact = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast({ title: "Message sent! ✉️", description: "We'll get back to you within 24 hours." });
    }, 1000);
  };

  const contactCards = [
    { icon: Mail, title: "Email Us", desc: "support@passsmartly.com", sub: "We reply within 24 hours" },
    { icon: Phone, title: "Call Us", desc: "+234 800 PASSSMARTLY", sub: "Mon-Fri, 9am-5pm WAT" },
    { icon: MapPin, title: "Visit Us", desc: "Lagos, Nigeria", sub: "By appointment only" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Logo size="sm" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Headphones className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Get In Touch</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Have a question, feedback, or need help? We'd love to hear from you. Our team is here to support your exam prep journey.
          </p>
        </motion.div>

        {/* Contact Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {contactCards.map((c, i) => (
            <motion.div key={c.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card className="border-border/50 text-center h-full hover:border-primary/20 transition-colors">
                <CardContent className="p-5">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <c.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1">{c.title}</h3>
                  <p className="text-xs font-medium">{c.desc}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{c.sub}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Contact Form */}
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <Card className="border-border/50 max-w-xl mx-auto">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Send us a Message</h2>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Name</Label>
                    <Input required placeholder="Your name" className="h-10 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email</Label>
                    <Input required type="email" placeholder="you@example.com" className="h-10 text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Subject</Label>
                  <Input required placeholder="How can we help?" className="h-10 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Message</Label>
                  <Textarea required placeholder="Tell us more about your question..." className="text-sm min-h-[120px]" />
                </div>
                <Button type="submit" className="h-10 text-sm w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                  Send Message
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        {/* FAQ Link */}
        <div className="text-center mt-8">
          <p className="text-xs text-muted-foreground">
            Looking for quick answers? Check our{" "}
            <button onClick={() => navigate("/faq")} className="text-primary hover:underline font-medium">
              Frequently Asked Questions
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Contact;
