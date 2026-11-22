import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Shield, ArrowLeft, Plus, BookOpen, Pencil, Trash2, Loader2, X, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface LibraryItem {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  preview_file_url: string | null;
  full_file_url: string | null;
  is_free: boolean | null;
  author: string | null;
  category: string;
  target_level: string | null;
  created_at: string | null;
}

const AdminLibrary = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [fullUrl, setFullUrl] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("Literature");
  const [targetLevel, setTargetLevel] = useState("");

  const fetchItems = async () => {
    const { data } = await supabase.from("digital_library").select("*").order("created_at", { ascending: false });
    if (data) setItems(data);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const resetForm = () => {
    setTitle(""); setDescription(""); setCoverUrl(""); setPreviewUrl(""); setFullUrl(""); setIsFree(false); setAuthor(""); setCategory("Literature"); setTargetLevel("");
    setEditing(null); setShowForm(false);
  };

  const startEdit = (item: LibraryItem) => {
    setEditing(item);
    setTitle(item.title);
    setDescription(item.description || "");
    setCoverUrl(item.cover_image_url || "");
    setPreviewUrl(item.preview_file_url || "");
    setFullUrl(item.full_file_url || "");
    setIsFree(item.is_free || false);
    setAuthor(item.author || "");
    setCategory(item.category || "General");
    setTargetLevel(item.target_level || "");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    setSaving(true);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      cover_image_url: coverUrl.trim() || null,
      preview_file_url: previewUrl.trim() || null,
      full_file_url: fullUrl.trim() || null,
      is_free: isFree,
      author: author.trim() || null,
      category,
      target_level: targetLevel.trim() || null,
    };

    if (editing) {
      const { error } = await supabase.from("digital_library").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error updating", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Updated!" }); }
    } else {
      const { error } = await supabase.from("digital_library").insert(payload);
      if (error) { toast({ title: "Error adding", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Book added!" }); }
    }

    setSaving(false);
    resetForm();
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("digital_library").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Deleted" }); fetchItems(); }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin"><ArrowLeft className="h-4 w-4" /></Link>
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm">Library Management</span>
          </div>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add Book
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {/* Add/Edit Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <Card className="border-primary/20">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">{editing ? "Edit Book" : "Add New Book"}</h3>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetForm}><X className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Title *</Label>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-xs" placeholder="e.g. The Lekki Headmaster" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cover Image URL</Label>
                      <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} className="h-9 text-xs" placeholder="https://... (Google Images URL)" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1"><Label className="text-xs">Author</Label><Input value={author} onChange={(e) => setAuthor(e.target.value)} className="h-9 text-xs" placeholder="Author name" /></div>
                    <div className="space-y-1"><Label className="text-xs">Category</Label><select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"><option>Literature</option><option>Textbook</option><option>Study Guide</option><option>Past Questions</option><option>General</option></select></div>
                    <div className="space-y-1"><Label className="text-xs">Class / Exam level</Label><Input value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)} className="h-9 text-xs" placeholder="e.g. SS2, WAEC, JAMB" /></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="text-xs" rows={2} placeholder="Brief description of the book..." />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Preview File URL (1-2 pages)</Label>
                      <Input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} className="h-9 text-xs" placeholder="URL to preview PDF" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Full Book URL (paid users)</Label>
                      <Input value={fullUrl} onChange={(e) => setFullUrl(e.target.value)} className="h-9 text-xs" placeholder="URL to full content" />
                    </div>
                  </div>
                  {coverUrl && (
                    <div className="flex items-center gap-3">
                      <img src={coverUrl} alt="Preview" className="h-16 w-12 object-cover rounded border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span className="text-[10px] text-muted-foreground">Cover preview</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Switch checked={isFree} onCheckedChange={setIsFree} />
                    <div><Label className="text-xs">{isFree ? "Free for every student" : "Included with paid subscription"}</Label><p className="text-[10px] text-muted-foreground">A paid subscriber can read every paid book in the library; students do not pay per book.</p></div>
                  </div>
                  <Button size="sm" className="h-8 text-xs gap-1" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {editing ? "Update Book" : "Add Book"}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Items List */}
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : items.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">No library items yet</p>
            <p className="text-xs text-muted-foreground">Click "Add Book" to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item) => (
              <Card key={item.id} className="border-border/50 overflow-hidden">
                <div className="flex gap-3 p-3">
                  {item.cover_image_url ? (
                    <img src={item.cover_image_url} alt={item.title} className="h-20 w-14 object-cover rounded-lg shrink-0" loading="lazy" />
                  ) : (
                    <div className="h-20 w-14 bg-secondary rounded-lg flex items-center justify-center shrink-0">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{item.title}</p>
                    {item.author && <p className="text-[10px] text-primary mt-0.5">By {item.author}</p>}
                    {item.description && <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{item.description}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={item.is_free ? "default" : "secondary"} className="text-[9px] h-4">
                        {item.is_free ? "Free" : "Paid"}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] h-4">{item.category || "General"}</Badge>
                      {item.preview_file_url && <Badge variant="outline" className="text-[9px] h-4">Preview</Badge>}
                      {item.full_file_url && <Badge variant="outline" className="text-[9px] h-4">Full</Badge>}
                    </div>
                    <div className="flex gap-1 mt-2">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(item)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminLibrary;
