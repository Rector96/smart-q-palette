import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Lock } from "lucide-react";
import SubscriptionModal from "@/components/SubscriptionModal";

const Reader = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "true";
  const viewMode = searchParams.get("view"); // "summary" or null
  const { user } = useAuth();
  const navigate = useNavigate();
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [showSub, setShowSub] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const { data: book } = await supabase.from("digital_library").select("*").eq("id", id).single();
      if (!book) { navigate("/library"); return; }
      setTitle(book.title);
      setAuthor((book as any).author || null);
      setSummary((book as any).summary || null);

      // Previews are public. Summaries and full books follow the admin's access setting.
      if (isPreview) {
        const previewPath = book.preview_file_url as string | null;
        if (previewPath && /^https?:\/\//i.test(previewPath)) {
          setFileUrl(previewPath);
        } else if (previewPath) {
          const { data } = supabase.storage.from("library-previews").getPublicUrl(previewPath);
          setFileUrl(data.publicUrl);
        }
        setLoading(false);
        return;
      }

      if (!book.is_free) {
        if (!user) {
          setBlocked(true);
          setShowSub(true);
          setLoading(false);
          return;
        }
        const { data: prof } = await supabase.from("profiles").select("is_subscribed").eq("user_id", user.id).single();
        if (!prof?.is_subscribed) {
          setBlocked(true);
          setShowSub(true);
          setLoading(false);
          return;
        }
      }

      if (viewMode === "summary") {
        setLoading(false);
        return;
      }

      if (book.full_file_url) {
        const { data, error } = await supabase.functions.invoke("library-access", {
          body: { bookId: id },
        });
        if (error || !data?.url) {
          setFileError(data?.error || error?.message || "The PDF could not be opened. Please try again.");
        } else {
          setFileUrl(data.url);
        }
      } else {
        setFileError("The full PDF has not been uploaded for this book yet.");
      }
      setLoading(false);
    };
    load();
  }, [id, user, isPreview, viewMode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <Lock className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-bold">Premium Content</h2>
          <p className="text-sm text-muted-foreground">Subscribe to access the full book.</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => navigate("/library")}>Back</Button>
            <Button onClick={() => setShowSub(true)}>Upgrade</Button>
          </div>
        </div>
        <SubscriptionModal open={showSub} onOpenChange={setShowSub} />
      </div>
    );
  }

  // Summary view
  if (viewMode === "summary" && summary) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10 shrink-0">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/library")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">{title}</h1>{author && <p className="truncate text-[10px] text-muted-foreground">By {author}</p>}</div>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Summary</span>
          </div>
        </header>

        <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {summary.split('\n').map((paragraph, idx) => {
              const trimmed = paragraph.trim();
              if (!trimmed) return <br key={idx} />;
              // Check if it looks like a heading (ALL CAPS or starts with number + period)
              if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith('•') && !trimmed.startsWith('-')) {
                return <h3 key={idx} className="text-base font-bold text-foreground mt-6 mb-2">{trimmed}</h3>;
              }
              if (/^\d+\./.test(trimmed) && trimmed.length < 80) {
                return <h4 key={idx} className="text-sm font-semibold text-foreground mt-4 mb-1">{trimmed}</h4>;
              }
              return <p key={idx} className="text-sm text-muted-foreground leading-relaxed mb-3">{trimmed}</p>;
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-background flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10 shrink-0">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/library")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">{title}</h1>{author && <p className="truncate text-[10px] text-muted-foreground">By {author}</p>}</div>
          {isPreview && <span className="text-[10px] bg-warning/20 text-warning px-2 py-0.5 rounded-full font-medium">Preview</span>}
        </div>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full">
        {fileError ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-5 text-center">
            <p className="text-sm font-semibold">Unable to open this PDF</p>
            <p className="max-w-md text-xs text-muted-foreground">{fileError}</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/library")}>Back to library</Button>
          </div>
        ) : fileUrl ? (
          <iframe
            src={fileUrl}
            className="h-[calc(100dvh-64px)] w-full bg-white"
            title={title}
            sandbox="allow-same-origin allow-scripts"
            style={{ border: "none" }}
          />
        ) : (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">No file available</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reader;
