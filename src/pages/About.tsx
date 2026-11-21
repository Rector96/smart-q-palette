import { ArrowLeft, Target, Users, Brain, Shield, Heart, GraduationCap, Lightbulb } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import Logo from "@/components/Logo";
import SEOHead from "@/components/SEOHead";

const values = [
  { icon: Target, title: "Excellence", desc: "We strive to provide the highest quality exam preparation materials and AI-powered learning tools." },
  { icon: Users, title: "Accessibility", desc: "Quality education should be affordable. That's why we keep our pricing student-friendly at just ₦2,500." },
  { icon: Brain, title: "Innovation", desc: "We leverage cutting-edge AI technology to personalize learning and make exam preparation smarter." },
  { icon: Shield, title: "Trust", desc: "Your data privacy and security are our top priorities. We never compromise on protecting our students." },
];

const team = [
  { name: "Our Mission", icon: GraduationCap, desc: "To democratize quality exam preparation for every student, regardless of their location or economic background." },
  { name: "Our Vision", icon: Lightbulb, desc: "A world where every student has access to world-class exam prep tools, powered by AI and driven by passion." },
  { name: "Our Promise", icon: Heart, desc: "We promise to continuously improve our platform, listen to student feedback, and keep our pricing affordable." },
];

const About = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="About Us – ROCKCBT" description="Learn about ROCKCBT, Nigeria's AI-powered exam preparation platform for JAMB, WAEC, and NECO." path="/about" />
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Logo size="sm" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">About <span className="text-primary">Web</span><span className="text-[hsl(var(--success))]">lines</span> CBT</h1>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            A leading AI-powered CBT preparation platform. We're on a mission to help every student achieve their dream exam score through smart, personalized, and affordable exam preparation.
          </p>
        </motion.div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-16">
          {team.map((t, i) => (
            <motion.div key={t.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <Card className="border-border/50 h-full text-center">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <t.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-sm font-bold mb-2">{t.name}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-16">
          <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-8">
            <h2 className="text-xl font-bold mb-3">Our Story</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Founded by a team of educators and technologists who understand the challenges students face, ROCKCBT was built to bridge the gap between traditional coaching and modern AI technology.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We believe that with the right tools, every student can excel in their exams. Our platform combines 25,000+ carefully curated questions with a powerful AI tutor that adapts to each student's unique learning needs.
            </p>
          </div>
        </motion.section>

        <section className="mb-16">
          <h2 className="text-xl font-bold mb-6 text-center">Our Values</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {values.map((v, i) => (
              <motion.div key={v.title} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <Card className="border-border/50 h-full hover:border-primary/20 transition-colors">
                  <CardContent className="p-5">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                      <v.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold mb-1">{v.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{v.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-xl font-bold mb-4 text-center">What Makes Us Different</h2>
          <div className="bg-secondary/50 rounded-2xl p-6">
            <ul className="space-y-3 text-sm text-muted-foreground">
              {[
                "25,000+ past exam questions across all 14 subjects",
                "AI Tutor available 24/7 for personalized explanations",
                "Smart question engine that adapts to your level",
                "Real CBT exam simulation environment",
                "Affordable one-time payment of just ₦2,500",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                    <span className="text-success text-xs">✓</span>
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.section>
      </main>
    </div>
  );
};

export default About;
