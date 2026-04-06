import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle, Facebook, Copy, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileName: string;
  score: number;
  grade: string;
  correct: number;
  total: number;
  onWhatsApp: () => void;
  onFacebook: () => void;
  onCopyLink: () => void;
}

const ResultShareModal = ({ open, onOpenChange, profileName, score, grade, correct, total, onWhatsApp, onFacebook, onCopyLink }: Props) => {
  const scoreColor = score >= 70 ? "text-green-500" : score >= 40 ? "text-orange-500" : "text-red-500";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden">
        {/* Preview Card */}
        <div className="p-5">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-base font-bold text-center">Share Your Result</DialogTitle>
          </DialogHeader>

          {/* Mini result card preview */}
          <div className="rounded-xl border border-border p-4 mb-5 bg-gradient-to-br from-primary/5 to-primary/10">
            <div className="text-center">
              <p className="text-[10px] font-bold text-primary tracking-wider uppercase mb-2">Weblines CBT</p>
              <p className="text-sm font-semibold">{profileName || "Student"}</p>
              <p className={`text-4xl font-extrabold mt-1 ${scoreColor}`}>{score}%</p>
              <p className="text-xs text-muted-foreground mt-1">Grade: <strong>{grade}</strong> · {correct}/{total} correct</p>
            </div>
          </div>

          {/* Share Buttons */}
          <div className="space-y-2.5">
            <Button className="w-full rounded-xl h-11 text-sm font-semibold gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={() => { onWhatsApp(); onOpenChange(false); }}>
              <MessageCircle className="h-4 w-4" /> Share on WhatsApp
            </Button>
            <Button className="w-full rounded-xl h-11 text-sm font-semibold gap-2 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { onFacebook(); onOpenChange(false); }}>
              <Facebook className="h-4 w-4" /> Share on Facebook
            </Button>
            <Button variant="outline" className="w-full rounded-xl h-11 text-sm font-semibold gap-2" onClick={() => { onCopyLink(); onOpenChange(false); }}>
              <Copy className="h-4 w-4" /> Copy Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ResultShareModal;
