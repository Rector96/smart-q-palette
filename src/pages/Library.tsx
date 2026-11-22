import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Eye, ArrowLeft, FileText, Lock, Search, BookMarked } from "lucide-react";
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
  author: string | null;
  category: string;
  target_level: string | null;
}

const Library = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [books, setBooks] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const load = useCallback(async () => {
    // Fetch books and profile in parallel for speed
    const booksPromise = supabase
      .from("digital_library")
      .select("id, title, description, cover_image_url, preview_file_url, full_file_url, is_free, summary, author, category, target_level")
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

  const categories = ["All", ...Array.from(new Set(books.map((book) => book.category || "General"))).sort()];
  const filteredBooks = books.filter((book) => {
    const matchesCategory = activeCategory === "All" || (book.category || "General") === activeCategory;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [book.title, book.author, book.description, book.target_level, book.category].some((value) => value?.toLowerCase().includes(term));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-3 py-3 sm:px-4">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="font-bold text-sm">Digital Library</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search novels, authors or study materials..." className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" aria-label="Search library" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map((category) => <Button key={category} type="button" size="sm" variant={activeCategory === category ? "default" : "outline"} className="h-8 shrink-0 rounded-full px-3 text-xs" onClick={() => setActiveCategory(category)}>{category}</Button>)}
          </div>
          <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{filteredBooks.length} {filteredBooks.length === 1 ? "book" : "books"} available</p>{isPro && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">Full library access</span>}</div>
        </div>
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
          filteredBooks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center"><BookMarked className="mx-auto mb-2 h-8 w-8 text-muted-foreground" /><p className="text-sm font-semibold">No matching books</p><p className="mt-1 text-xs text-muted-foreground">Try another title, author or category.</p></div>
          ) : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filteredBooks.map((book, idx) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow rounded-xl overflow-hidden h-full flex flex-col">
                  <button
                    type="button"
                    onClick={() => book.full_file_url ? handleRead(book) : handlePreview(book)}
                    className="group relative block aspect-[4/5] w-full overflow-hidden bg-secondary text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    aria-label={`Open ${book.title}`}
                  >
                    {book.cover_image_url ? (
                      <img src={book.cover_image_url} alt={`Cover of ${book.title}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-primary/5"><BookOpen className="h-10 w-10 text-primary/30" /></div>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-9 text-left text-[10px] font-semibold text-white opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                      {book.full_file_url ? "Open book" : book.preview_file_url ? "View preview" : "Book details"}
                    </span>
                  </button>
                  <CardContent className="flex flex-1 flex-col p-2.5 sm:p-3">
                    <h3 className="font-bold text-xs mb-0.5 line-clamp-2">{book.title}</h3>
                    {book.author && <p className="text-[10px] text-primary mb-1 line-clamp-1">By {book.author}</p>}
                    <div className="mb-1 flex flex-wrap gap-1"><span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium">{book.category || "General"}</span>{book.target_level && <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px]">{book.target_level}</span>}</div>
                    {book.description && <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2 flex-1">{book.description}</p>}
                    <div className="flex flex-col gap-1.5 mt-auto">
                      {book.full_file_url && (
                        <Button size="sm" className="min-h-9 h-auto w-full gap-1 whitespace-normal px-2 py-2 text-[10px] leading-tight" onClick={() => handleRead(book)}>
                          <BookOpen className="h-3 w-3" /> Read full book {(!book.is_free && !isPro) && <Lock className="ml-1 h-3 w-3" />}
                        </Button>
                      )}
                      {/* Summary: main action — access follows the book setting and subscription */}
                      {book.summary && (
                        <Button
                          size="sm"
                          className="min-h-9 h-auto w-full gap-1 whitespace-normal px-2 py-2 text-[10px] leading-tight"
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
                        <Button variant="outline" size="sm" className="min-h-9 h-auto w-full gap-1 whitespace-normal px-2 py-2 text-[10px] leading-tight" onClick={() => handlePreview(book)}>
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
