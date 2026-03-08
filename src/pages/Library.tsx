import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Eye, ArrowLeft, FileText, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import SubscriptionModal from "@/components/SubscriptionModal";

interface LibraryItem {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  preview_file_url: string | null;
  full_file_url: string | null;
  is_free: boolean | null;
  summary: string | null;
}

const Library = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [books, setBooks] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [showSub, setShowSub] = useState(false);

  const load = useCallback(async () => {
    // Fetch books and profile in parallel for speed
    const booksPromise = supabase
      .from("digital_library")
      .select("id, title, description, cover_image_url, preview_file_url, full_file_url, is_free, summary")
      .order("created_at", { ascending: false });

    const profilePromise = user
      ? supabase.from("profiles").select("is_subscribed").eq("user_id", user.id).single()
      : Promise.resolve({ data: null });

    const [booksRes, profRes] = await Promise.all([booksPromise, profilePromise]);

    if (booksRes.data) setBooks(booksRes.data as LibraryItem[]);
    if (profRes.data && "is_subscribed" in profRes.data) setIsPro(profRes.data.is_subscribed);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const handleSummary = (book: LibraryItem) => {
    if (book.is_free || isPro) {
      navigate(`/reader/${book.id}?view=summary`);
    } else {
      setShowSub(true);
    }
  };

  const handlePreview = (book: LibraryItem) => {
    if (book.preview_file_url) {
      navigate(`/reader/${book.id}?preview=true`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="font-bold text-sm">Digital Library</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-border/50">
                <Skeleton className="aspect-[4/5] w-full" />
                <div className="p-2.5 space-y-2">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-7 w-full rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Library is empty</p>
            <p className="text-xs text-muted-foreground">Books and study materials will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {books.map((book, idx) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow rounded-xl overflow-hidden h-full flex flex-col">
                  {book.cover_image_url ? (
                    <div className="aspect-[4/5] bg-secondary overflow-hidden">
                      <img src={book.cover_image_url} alt={book.title} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  ) : (
                    <div className="aspect-[4/5] bg-primary/5 flex items-center justify-center">
                      <BookOpen className="h-10 w-10 text-primary/30" />
                    </div>
                  )}
                  <CardContent className="p-2.5 flex-1 flex flex-col">
                    <h3 className="font-bold text-xs mb-0.5 line-clamp-2">{book.title}</h3>
                    {book.description && <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2 flex-1">{book.description}</p>}
                    <div className="flex flex-col gap-1.5 mt-auto">
                      {/* Summary: main action — paid only */}
                      {book.summary && (
                        <Button
                          size="sm"
                          className="h-7 text-[10px] gap-1 px-2 w-full"
                          onClick={() => handleSummary(book)}
                        >
                          {book.is_free || isPro ? (
                            <><FileText className="h-3 w-3" /> Summary</>
                          ) : (
                            <><Lock className="h-3 w-3" /> Summary <span className="text-[8px] ml-1 bg-primary-foreground/20 px-1 rounded">PRO</span></>
                          )}
                        </Button>
                      )}
                      {/* Preview: available to everyone */}
                      {book.preview_file_url && (
                        <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 px-2 w-full" onClick={() => handlePreview(book)}>
                          <Eye className="h-3 w-3" /> Preview
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>
      <SubscriptionModal open={showSub} onOpenChange={setShowSub} />
    </div>
  );
};

export default Library;
