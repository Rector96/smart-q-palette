import { BookOpen, ArrowLeft, Target, Users, Brain, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";

const values = [
  { icon: Target, title: "Excellence", desc: "We strive to provide the highest quality JAMB preparation materials and AI-powered learning tools." },
  { icon: Users, title: "Accessibility", desc: "Quality education should be affordable. That's why we keep our pricing student-friendly at just ₦1,500." },
  { icon: Brain, title: "Innovation", desc: "We leverage cutting-edge AI technology to personalize learning and make exam preparation smarter." },
  { icon: Shield, title: "Trust", desc: "Your data privacy and security are our top priorities. We never compromise on protecting our students." },
];

const About = () => {
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
      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-2">About SurePass</h1>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          SurePass is Nigeria's leading AI-powered JAMB CBT preparation platform. We're on a mission to help every Nigerian student achieve their dream university score through smart, personalized, and affordable exam preparation.
        </p>
        
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-2">Our Story</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Founded by a team of educators and technologists who understand the challenges Nigerian students face, SurePass was built to bridge the gap between traditional coaching and modern AI technology. We believe that with the right tools, every student can excel in JAMB and secure admission into their dream university.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-bold mb-4">Our Values</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {values.map((v, i) => (
              <motion.div key={v.title} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <Card className="border-border/50 h-full">
                  <CardContent className="p-4">
                    <v.icon className="h-5 w-5 text-primary mb-2" />
                    <h3 className="text-sm font-semibold mb-1">{v.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{v.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-2">What Makes Us Different</h2>
          <ul className="space-y-2 text-xs text-muted-foreground leading-relaxed">
            <li>✅ 25,000+ past JAMB questions across all 14 subjects</li>
            <li>✅ AI Tutor available 24/7 for personalized explanations</li>
            <li>✅ Smart question engine that adapts to your level</li>
            <li>✅ Real CBT exam simulation environment</li>
            <li>✅ Affordable subscription at just ₦1,500</li>
          </ul>
        </section>
      </main>
    </div>
  );
};

export default About;
