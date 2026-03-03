import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Eye, Lock, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import SubscriptionModal from "@/components/SubscriptionModal";

interface LibraryItem {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  preview_file_url: string | null;
  full_file_url: string | null;
  is_free: boolean | null;
}

const Library = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [books, setBooks] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [showSub, setShowSub] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("digital_library").select("*").order("created_at", { ascending: false });
      if (data) setBooks(data);
      if (user) {
        const { data: prof } = await supabase.from("profiles").select("is_subscribed").eq("user_id", user.id).single();
        if (prof) setIsPro(prof.is_subscribed);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const handleRead = (book: LibraryItem) => {
    if (book.is_free || isPro) {
      navigate(`/reader/${book.id}`);
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
          <p className="text-sm text-muted-foreground text-center py-12">Loading library...</p>
        ) : books.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Library is empty</p>
            <p className="text-xs text-muted-foreground">Books and study materials will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.map((book) => (
              <motion.div key={book.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow rounded-xl overflow-hidden h-full flex flex-col">
                  {book.cover_image_url ? (
                    <div className="aspect-[3/4] bg-secondary overflow-hidden">
                      <img src={book.cover_image_url} alt={book.title} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  ) : (
                    <div className="aspect-[3/4] bg-primary/5 flex items-center justify-center">
                      <BookOpen className="h-12 w-12 text-primary/30" />
                    </div>
                  )}
                  <CardContent className="p-3 flex-1 flex flex-col">
                    <h3 className="font-bold text-sm mb-1 line-clamp-2">{book.title}</h3>
                    {book.description && <p className="text-[11px] text-muted-foreground mb-3 line-clamp-2 flex-1">{book.description}</p>}
                    <div className="grid grid-cols-2 gap-2 mt-auto">
                      {book.preview_file_url && (
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => handlePreview(book)}>
                          <Eye className="h-3 w-3" /> Preview
                        </Button>
                      )}
                      <Button size="sm" className={`h-8 text-xs gap-1 ${!book.preview_file_url ? "col-span-2" : ""}`} onClick={() => handleRead(book)}>
                        {book.is_free || isPro ? (
                          <><BookOpen className="h-3 w-3" /> Read</>
                        ) : (
                          <><Lock className="h-3 w-3" /> Read Full</>
                        )}
                      </Button>
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
