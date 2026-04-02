import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import dashboardPreview from "@/assets/dashboard-preview.png";
import paystackBanner from "@/assets/paystack-banner.png";
import {
  ArrowRight, Zap, BarChart3, Bot, Target,
  CheckCircle2, Star, Users, BookOpenCheck, Clock, Crown, CreditCard, Bell
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import SubscriptionModal from "@/components/SubscriptionModal";
import MotivationalModal from "@/components/MotivationalModal";
import Logo from "@/components/Logo";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [showSubscription, setShowSubscription] = useState(false);
  const isLoggedIn = !loading && !!user;

  const features = [
    { icon: Bot, title: "AI Tutor", desc: "Get instant explanations and personalized guidance from our intelligent AI tutor, available 24/7." },
    { icon: BookOpenCheck, title: "Real CBT Experience", desc: "Practice with an interface that mirrors the actual exam CBT environment perfectly." },
    { icon: BarChart3, title: "Progress Tracking", desc: "Monitor your performance with detailed analytics and identify areas for improvement." },
    { icon: Target, title: "Adaptive Learning", desc: "Questions adapt to your skill level, focusing on topics where you need more practice." },
    { icon: Zap, title: "Instant Feedback", desc: "Get immediate feedback on your answers with detailed explanations for each question." },
    { icon: BookOpenCheck, title: "25,000+ Questions", desc: "Access our extensive database of past exam questions across all subjects." },
  ];

  const steps = [
    { step: "01", title: "Create Account", desc: "Sign up in seconds with your email" },
    { step: "02", title: "Choose Subjects", desc: "Select your exam subjects and set your target" },
    { step: "03", title: "Practice Daily", desc: "Take practice tests and learn with AI assistance" },
    { step: "04", title: "Ace Your Exam", desc: "Walk into your exam confident and prepared" },
  ];

  const testimonials = [
    { name: "Chinedu O.", year: "2024", score: 342, text: "The AI tutor helped me understand Physics concepts I struggled with for months. Scored way above my target!" },
    { name: "Amina B.", year: "2024", score: 328, text: "The CBT practice environment was exactly like the real exam. I felt so confident on exam day!" },
    { name: "Tunde A.", year: "2024", score: 356, text: "Best investment for my exam prep. The adaptive questions really helped me improve quickly." },
  ];

  const stats = [
    { value: "50K+", label: "Active Students" },
    { value: "25K+", label: "Practice Questions" },
    { value: "95%", label: "Pass Rate" },
    { value: "4.9", label: "User Rating" },
  ];

  const quickFaqs = [
    { q: "How much does Weblines CBT cost?", a: "You get 3 free exam sessions. After that, subscribe for just ₦2,000 for lifetime access to all features including unlimited exams, AI tutor, and progress tracking." },
    { q: "Can I share exams with friends?", a: "Yes! Generate a share link after taking an exam. Your friends can take the same exam and compare scores." },
    { q: "How does the AI Tutor work?", a: "Our AI tutor provides 24/7 personalized explanations for any topic, helping you understand complex concepts easily." },
    { q: "What exams does Weblines CBT cover?", a: "Weblines CBT covers JAMB, WAEC, NECO, POST-UTME, and other Nigerian examinations across all subjects." },
  ];

  const pricingBenefits = [
    "Unlimited exam sessions",
    "All subjects & 25,000+ questions",
    "AI Tutor — 24/7 access",
    "Progress tracking & analytics",
    "Exam sharing with friends",
    "Priority support",
  ];

  return (
    <div className="min-h-screen bg-background">
      <MotivationalModal />

      {/* Nav */}
      <header className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-sm z-20">
        <Link to="/"><Logo size="sm" /></Link>
        <nav className="hidden md:flex items-center gap-6 text-xs text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
          <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
        </nav>
        <div className="flex gap-2">
          {isLoggedIn ? (
            <Button size="sm" className="h-8 text-xs" onClick={() => navigate("/dashboard")}>
              Dashboard <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => navigate("/auth")}>
                Login
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={() => navigate("/auth")}>
                Sign Up <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-12 sm:py-20">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <motion.div {...fadeUp} className="text-center lg:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-medium mb-6">
              <Zap className="h-3 w-3" /> AI-Powered Exam Preparation
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
              Ace Your Exams with{" "}
              <span className="text-primary">Web</span><span className="text-[hsl(var(--success))]">lines</span>
            </h1>
            <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-lg mx-auto lg:mx-0 leading-relaxed">
              Practice with real CBT questions for JAMB, WAEC, NECO & more. Get instant AI explanations and track your progress. Join 50,000+ students preparing smarter.
            </p>
            <div className="mt-6 flex items-center justify-center lg:justify-start gap-3">
              {isLoggedIn ? (
                <>
                  <Button className="h-11 px-6 text-sm rounded-xl" onClick={() => navigate("/dashboard")}>
                    Dashboard <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                  <Button variant="outline" className="h-11 px-6 text-sm rounded-xl" onClick={() => navigate("/select-subjects?mode=practice")}>
                    Continue
                  </Button>
                </>
              ) : (
                <>
                  <Button className="h-11 px-6 text-sm rounded-xl" onClick={() => navigate("/auth")}>
                    Get Started <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                  <motion.div
                    animate={{ rotate: [0, -2, 2, -2, 0] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  >
                    <Button
                      variant="outline"
                      className="h-11 px-5 text-sm gap-2 shadow-md hover:shadow-lg transition-shadow border-border/50 rounded-xl"
                      onClick={() => window.open("https://play.google.com/store", "_blank")}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                        <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" />
                      </svg>
                      Google Play
                    </Button>
                  </motion.div>
                </>
              )}
            </div>
            {!isLoggedIn && (
              <div className="mt-3 text-xs text-muted-foreground">
                ✨ 3 free exam sessions · No credit card required
              </div>
            )}
            <div className="mt-3 flex items-center justify-center lg:justify-start gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-3.5 w-3.5 text-warning fill-warning" />
              ))}
              <span className="text-xs text-muted-foreground ml-1.5">Rated 4.9/5 by 50,000+ students</span>
            </div>
          </motion.div>

          {/* Dashboard Preview */}
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6 }}>
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-border/30">
              <img
                src={dashboardPreview}
                alt="Weblines CBT Dashboard showing exam stats, subjects, and AI tutor"
                className="w-full rounded-2xl"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent pointer-events-none" />
            </div>
          </motion.div>
        </div>
      </section>

      <section className="bg-primary text-primary-foreground py-10">
        <div className="max-w-6xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {stats.map((s) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <p className="text-2xl sm:text-3xl font-bold">{s.value}</p>
              <p className="text-xs opacity-80 mt-0.5">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
        <div className="text-center mb-12">
          <p className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-2">Features</p>
          <h2 className="text-2xl sm:text-3xl font-bold">Everything You Need to Succeed</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Our platform combines cutting-edge AI technology with proven learning methods.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
              <Card className="border-border/50 hover:border-primary/20 transition-all shadow-sm hover:shadow-md h-full">
                <CardContent className="p-6">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Paystack Payment Section */}
      <section className="max-w-5xl mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <Card className="border-border/50 overflow-hidden shadow-lg">
            <CardContent className="p-0">
              <div className="grid md:grid-cols-2 items-center">
                <div className="p-6 md:p-8 space-y-3">
                  <h3 className="text-lg sm:text-xl font-bold">Pay securely with Paystack</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Paystack is a safe and secure way to pay online with multiple payment channels, including card, bank transfer, USSD, and more!
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {["Visa", "Mastercard", "Bank Transfer", "USSD"].map((m) => (
                      <span key={m} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border/50">{m}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-center p-4 md:p-6">
                  <img
                    src={paystackBanner}
                    alt="Pay securely with Paystack - card, bank, USSD"
                    className="w-full max-w-xs md:max-w-sm rounded-xl shadow-md"
                    loading="lazy"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-secondary/50 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-2">Pricing</p>
            <h2 className="text-2xl sm:text-3xl font-bold">Simple, Affordable Pricing</h2>
            <p className="text-sm text-muted-foreground mt-2">Start free, upgrade when you're ready</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
               <Card className="border-border/50 h-full shadow-sm">
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold mb-1">Free Trial</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-2xl font-bold">₦0</span>
                    <span className="text-xs text-muted-foreground">/ 3 sessions</span>
                  </div>
                  <ul className="space-y-2 mb-6">
                    {["3 free exam sessions", "All subjects available", "Basic progress view", "AI Tutor preview"].map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button variant="outline" className="w-full h-9 text-xs" onClick={() => navigate(isLoggedIn ? "/dashboard" : "/auth")}>
                    {isLoggedIn ? "Go to Dashboard" : "Get Started Free"}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}>
              <Card className="border-primary/30 bg-primary/5 h-full relative overflow-hidden shadow-md">
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] px-3 py-0.5 rounded-bl-lg font-medium">Popular</div>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Crown className="h-4 w-4 text-warning" />
                    <h3 className="text-sm font-semibold">Pro — Lifetime</h3>
                  </div>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-2xl font-bold">₦1,500</span>
                    <span className="text-xs text-muted-foreground">/ one-time</span>
                  </div>
                  <ul className="space-y-2 mb-6">
                    {pricingBenefits.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full h-9 text-xs" onClick={() => isLoggedIn ? setShowSubscription(true) : navigate("/auth")}>
                    <CreditCard className="h-3.5 w-3.5 mr-1" /> {isLoggedIn ? "Pay Now" : "Sign Up to Pay"}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* AI Section */}
      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <p className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-2">AI Technology</p>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Meet Your Personal AI Study Companion</h2>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Our AI tutor understands your learning style and provides personalized explanations that make complex concepts simple.
              </p>
              <ul className="space-y-3">
                {["Explains concepts in simple language", "Available 24/7 for instant help", "Remembers your weak areas", "Provides step-by-step solutions"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <Card className="border-border/50 overflow-hidden shadow-md">
                <div className="bg-primary/5 px-4 py-2 border-b border-border/50 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">Weblines AI Tutor</span>
                  <span className="text-[10px] text-success ml-auto">● Online</span>
                </div>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-end">
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3 py-2 text-xs max-w-[75%]">
                      I don't understand how to solve quadratic equations 😕
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-3 w-3 text-primary" />
                    </div>
                    <div className="bg-secondary rounded-2xl rounded-bl-md px-3 py-2 text-xs max-w-[75%] leading-relaxed">
                      No worries! Let me break it down step by step. A quadratic equation has the form ax² + bx + c = 0. The key is to find values of x that make this true...
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-secondary/50 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-2">Simple Process</p>
            <h2 className="text-2xl sm:text-3xl font-bold">How It Works</h2>
            <p className="text-sm text-muted-foreground mt-2">Get started in minutes and begin your journey to exam success</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s, i) => (
              <motion.div key={s.step} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center">
                <div className="text-3xl font-bold text-primary/20 mb-2">{s.step}</div>
                <h3 className="text-sm font-semibold mb-1">{s.title}</h3>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <p className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-2">Testimonials</p>
            <h2 className="text-2xl sm:text-3xl font-bold">What Students Say</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                <Card className="border-border/50 h-full shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex gap-0.5 mb-3">
                      {[...Array(5)].map((_, j) => (
                        <Star key={j} className="h-3 w-3 text-warning fill-warning" />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-4">"{t.text}"</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold">{t.name}</p>
                        <p className="text-[10px] text-muted-foreground">{t.year}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-primary">{t.score}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-secondary/50 py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-2">FAQ</p>
            <h2 className="text-2xl sm:text-3xl font-bold">Frequently Asked Questions</h2>
          </div>
          <Accordion type="single" collapsible className="space-y-2">
            {quickFaqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border border-border/50 rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium hover:no-underline">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground leading-relaxed">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="text-center mt-4">
            <Link to="/faq" className="text-xs text-primary hover:underline">View all FAQs →</Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 py-16 sm:py-20 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to Start Preparing?</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Join thousands of students already using Weblines CBT to prepare smarter and score higher.
          </p>
          {isLoggedIn ? (
            <Button className="h-10 px-6 text-sm max-w-xs" onClick={() => navigate("/dashboard")}>
              Continue Practicing <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button className="h-10 px-6 text-sm max-w-xs" onClick={() => navigate("/auth")}>
              Create Free Account <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {!isLoggedIn && <p className="text-xs text-muted-foreground mt-3">3 free exams · No credit card required</p>}
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
            <div>
              <Link to="/"><Logo size="sm" className="mb-3" /></Link>
              <p className="text-xs text-muted-foreground leading-relaxed">
                AI-powered exam preparation platform helping students achieve their academic dreams.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2">Product</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground">Pricing</a></li>
                <li><Link to="/faq" className="hover:text-foreground">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2">Company</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li><Link to="/about" className="hover:text-foreground">About Us</Link></li>
                <li><Link to="/contact" className="hover:text-foreground">Contact Us</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2">Legal</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li><Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-foreground">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-4 text-center">
            <p className="text-xs text-muted-foreground">© 2026 Weblines CBT. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <SubscriptionModal open={showSubscription} onOpenChange={setShowSubscription} />

      {/* Floating Contact Bell */}
      <motion.button
        onClick={() => navigate("/contact")}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
        animate={{ y: [0, -4, 0] }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        aria-label="Contact us"
      >
        <Bell className="h-6 w-6" />
      </motion.button>
    </div>
  );
};

export default Index;
