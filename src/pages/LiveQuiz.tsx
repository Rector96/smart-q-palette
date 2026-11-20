import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Users, Plus, LogIn, Loader2, Copy, Share2, Crown, CheckCircle2, CreditCard, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { SUBJECTS } from "@/lib/subjects";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import DesktopHeader from "@/components/DesktopHeader";

const LiveQuiz = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [view, setView] = useState<"menu" | "create" | "join">("menu");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<{ is_subscribed: boolean; free_live_quiz_used: number; full_name: string | null }>({ is_subscribed: false, free_live_quiz_used: 0, full_name: null });
  const [showPaywall, setShowPaywall] = useState(false);

  // Create form
  const [subject, setSubject] = useState("");
  const [numQuestions, setNumQuestions] = useState(10);
  const [timePerQuestion, setTimePerQuestion] = useState(30);

  // Join form
  const [roomCode, setRoomCode] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase.from("profiles").select("is_subscribed, free_live_quiz_used, full_name").eq("user_id", user.id).single();
      if (data) setProfile(data as any);
    };
    fetch();
  }, [user]);

  const checkAccess = (): boolean => {
    if (profile.is_subscribed) return true;
    if ((profile.free_live_quiz_used || 0) < 2) return true;
    setShowPaywall(true);
    return false;
  };

  const handleCreate = async () => {
    if (!user || !subject) return;
    if (!checkAccess()) return;
    setLoading(true);
    try {
      // Fetch questions for subject
      const { data: questions, error: qErr } = await supabase
        .from("questions")
        .select("id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, exam_hint")
        .eq("subject", subject)
        .limit(200);

      if (qErr || !questions || questions.length === 0) {
        toast({ title: "No questions available", description: "This subject has no questions yet.", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Shuffle and pick
      const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, numQuestions);
      const roomCodeGen = Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = new Date(Date.now() + 2 * 3600000).toISOString();

      const { data: room, error } = await supabase.from("quiz_rooms").insert({
        host_id: user.id,
        subject,
        num_questions: shuffled.length,
        time_per_question: timePerQuestion,
        room_code: roomCodeGen,
        questions: shuffled as any,
        expires_at: expiresAt,
      }).select("id, room_code").single();

      if (error) throw error;

      // Increment free usage if not subscribed
      if (!profile.is_subscribed) {
        await supabase.from("profiles").update({ free_live_quiz_used: (profile.free_live_quiz_used || 0) + 1 } as any).eq("user_id", user.id);
      }

      // Host joins as participant
      await supabase.from("quiz_participants").insert({
        room_id: room.id,
        user_id: user.id,
        display_name: profile.full_name?.split(" ")[0] || "Host",
      });

      navigate(`/quiz-room/${room.room_code}`);
    } catch (err: any) {
      toast({ title: "Error creating room", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!user || !roomCode.trim()) return;
    if (!checkAccess()) return;
    setLoading(true);
    try {
      const { data: room, error } = await supabase
        .from("quiz_rooms")
        .select("*")
        .eq("room_code", roomCode.trim().toUpperCase())
        .single();

      if (error || !room) {
        toast({ title: "Room not found", description: "Check the code and try again.", variant: "destructive" });
        setLoading(false);
        return;
      }

      if (room.status === "ended") {
        toast({ title: "Quiz ended", description: "This quiz session has already ended.", variant: "destructive" });
        setLoading(false);
        return;
      }

      if (room.expires_at && new Date(room.expires_at) < new Date()) {
        toast({ title: "Quiz expired", description: "This quiz session has expired.", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Increment free usage if not subscribed
      if (!profile.is_subscribed) {
        await supabase.from("profiles").update({ free_live_quiz_used: (profile.free_live_quiz_used || 0) + 1 } as any).eq("user_id", user.id);
      }

      // Join as participant
      const { error: joinErr } = await supabase.from("quiz_participants").insert({
        room_id: room.id,
        user_id: user.id,
        display_name: profile.full_name?.split(" ")[0] || "Player",
      });

      if (joinErr && !joinErr.message.includes("duplicate")) throw joinErr;
      navigate(`/quiz-room/${room.room_code}`);
    } catch (err: any) {
      toast({ title: "Error joining room", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const paywallBenefits = [
    "Unlimited live quiz sessions",
    "Unlimited practice exams",
    "AI Tutor & detailed analytics",
  ];

  return (
    <div className="min-h-screen bg-background">
      <DesktopHeader profileName={profile.full_name} isPro={profile.is_subscribed} />
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10 lg:hidden">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => view === "menu" ? navigate("/dashboard") : setView("menu")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-bold text-sm">Live Quiz</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 pb-28 pt-5 sm:px-4 sm:py-8 space-y-5">
        {view === "menu" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="text-center space-y-3 mb-6 px-2">
              <div className="h-16 w-16 bg-gradient-to-br from-primary/15 to-primary/5 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight">Play with friends</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">Challenge your friends, join a room and see who knows the most.</p>
            </div>

            <Card className="cursor-pointer border-border/50 hover:border-primary/30 transition-all shadow-sm hover:shadow-md rounded-2xl active:scale-[0.99]" onClick={() => setView("create")}>
              <CardContent className="p-5 flex items-center gap-4 min-h-[104px]">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Plus className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-base">Create a quiz</p>
                  <p className="text-sm text-muted-foreground">Choose a subject and invite your friends to play.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer border-border/50 hover:border-primary/30 transition-all shadow-sm hover:shadow-md rounded-2xl active:scale-[0.99]" onClick={() => setView("join")}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <LogIn className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-base">Join with a code</p>
                  <p className="text-sm text-muted-foreground">Got an invite? Enter the quiz code to join.</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {view === "create" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <h2 className="text-xl font-extrabold">Set up your quiz</h2>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Subject</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Questions</Label>
                <Input type="number" min={5} max={50} value={numQuestions} onChange={e => setNumQuestions(Number(e.target.value))} className="h-12 rounded-xl text-base" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Time/Question (s)</Label>
                <Input type="number" min={10} max={120} value={timePerQuestion} onChange={e => setTimePerQuestion(Number(e.target.value))} className="h-10" />
              </div>
            </div>
            <Button className="w-full h-12 rounded-xl text-base font-semibold" onClick={handleCreate} disabled={loading || !subject}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating...</> : "Create Room"}
            </Button>
          </motion.div>
        )}

        {view === "join" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <h2 className="text-xl font-extrabold">Join a quiz</h2>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Room Code</Label>
              <Input value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="Enter room code" className="h-14 rounded-xl text-center text-2xl tracking-[0.3em] font-bold" maxLength={6} />
            </div>
            <Button className="w-full h-12 rounded-xl text-base font-semibold" onClick={handleJoin} disabled={loading || !roomCode.trim()}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Joining...</> : "Join Room"}
            </Button>
          </motion.div>
        )}
      </main>

      {/* Paywall Modal */}
      <Dialog open={showPaywall} onOpenChange={setShowPaywall}>
        <DialogContent className="max-w-sm p-0 overflow-hidden rounded-3xl border-0 shadow-2xl">
          <div className="h-20 bg-gradient-to-r from-primary via-[hsl(262,83%,58%)] to-primary relative overflow-hidden flex items-center justify-center">
            <div className="text-center">
              <Crown className="h-7 w-7 text-primary-foreground mx-auto mb-1" />
              <p className="text-primary-foreground font-bold text-sm">Free Sessions Used</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-muted-foreground text-center text-sm">You have used your 2 free live quiz sessions. Subscribe for unlimited access!</p>
            <div className="space-y-2">
              {paywallBenefits.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
                  <span className="text-sm">{b}</span>
                </div>
              ))}
            </div>
            <Button className="w-full h-11" onClick={() => { setShowPaywall(false); navigate("/dashboard?payment=subscribe"); }}>
              <CreditCard className="h-4 w-4 mr-2" /> Subscribe Now — ₦2,000
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setShowPaywall(false)}>Maybe Later</Button>
            <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
              <Shield className="h-3 w-3" /> Secure payment via Paystack
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LiveQuiz;
