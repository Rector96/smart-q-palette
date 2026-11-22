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
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [fullFile, setFullFile] = useState<File | null>(null);

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
    setTitle(""); setDescription(""); setCoverUrl(""); setCoverFile(null); setPreviewFile(null); setFullFile(null); setPreviewUrl(""); setFullUrl(""); setIsFree(false); setAuthor(""); setCategory("Literature"); setTargetLevel("");
    setEditing(null); setShowForm(false);
  };

  const startEdit = (item: LibraryItem) => {
    setEditing(item);
    setTitle(item.title);
    setDescription(item.description || "");
    setCoverUrl(item.cover_image_url || "");
    setCoverFile(null);
    setPreviewFile(null);
    setFullFile(null);
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

    let savedCoverUrl = coverUrl.trim();
    if (coverFile) {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
      if (!allowedTypes.includes(coverFile.type)) {
        toast({ title: "Unsupported image", description: "Choose a JPG, PNG, WEBP or AVIF image.", variant: "destructive" });
        setSaving(false);
        return;
      }
      if (coverFile.size > 5 * 1024 * 1024) {
        toast({ title: "Image is too large", description: "Book covers must be 5 MB or smaller.", variant: "destructive" });
        setSaving(false);
        return;
      }
      const extension = coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const filePath = `book-covers/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("library-covers").upload(filePath, coverFile, { contentType: coverFile.type, upsert: false });
      if (uploadError) {
        toast({ title: "Cover upload failed", description: uploadError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      savedCoverUrl = supabase.storage.from("library-covers").getPublicUrl(filePath).data.publicUrl;
    }

    const validatePdf = (file: File | null, label: string) => {
      if (!file) return true;
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        toast({ title: "Invalid PDF", description: `${label} must be a PDF file.`, variant: "destructive" });
        return false;
      }
      if (file.size > 25 * 1024 * 1024) {
        toast({ title: "PDF is too large", description: `${label} must be 25 MB or smaller.`, variant: "destructive" });
        return false;
      }
      return true;
    };
    if (!validatePdf(previewFile, "Preview") || !validatePdf(fullFile, "Full book")) {
      setSaving(false);
      return;
    }

    let savedPreviewPath = previewUrl.trim() || null;
    let savedFullPath = fullUrl.trim() || null;

    if (previewFile) {
      const path = `previews/${crypto.randomUUID()}.pdf`;
      const { error } = await supabase.storage.from("library-previews").upload(path, previewFile, { contentType: "application/pdf", upsert: false });
      if (error) {
        toast({ title: "Preview upload failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      savedPreviewPath = path;
    }

    if (fullFile) {
      const path = `books/${crypto.randomUUID()}.pdf`;
      const { error } = await supabase.storage.from("library").upload(path, fullFile, { contentType: "application/pdf", upsert: false });
      if (error) {
        toast({ title: "Full book upload failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      savedFullPath = path;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      cover_image_url: savedCoverUrl || null,
      preview_file_url: savedPreviewPath,
      full_file_url: savedFullPath,
      is_free: isFree,
      author: author.trim() || null,
      category,
      target_level: targetLevel.trim() || null,
    };

    let saveSucceeded = false;
    if (editing) {
      const { error } = await supabase.from("digital_library").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error updating", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Updated!" }); saveSucceeded = true; }
    } else {
      const { error } = await supabase.from("digital_library").insert(payload);
      if (error) { toast({ title: "Error adding", description: error.message, variant: "destructive" }); }
      else { toast({ title: "Book added!" }); saveSucceeded = true; }
    }

    setSaving(false);
    if (saveSucceeded) {
      resetForm();
      fetchItems();
    }
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
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
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

      <main className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        {/* Add/Edit Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <Card className="border-primary/20">
                <CardContent className="space-y-3 p-3 sm:p-4">
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
                      <Label className="text-xs">Book Cover Image</Label>
                      <Input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} className="h-9 text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs" />
                      <p className="text-[10px] text-muted-foreground">Choose JPG, PNG, WEBP or AVIF from your device (maximum 5 MB).</p>
                      {coverFile && <p className="text-[10px] text-primary">Selected: {coverFile.name}</p>}
                      {!coverFile && editing?.cover_image_url && <p className="text-[10px] text-muted-foreground">Current cover will be kept unless you choose another image.</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1"><Label className="text-xs">Author</Label><Input value={author} onChange={(e) => setAuthor(e.target.value)} className="h-9 text-xs" placeholder="Author name" /></div>
                    <div className="space-y-1"><Label className="text-xs">Category</Label><select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"><option>Literature</option><option>Textbook</option><option>Study Guide</option><option>Past Questions</option><option>General</option></select></div>
                    <div className="space-y-1"><Label className="text-xs">Class / Exam level</Label><Input value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)} className="h-9 text-xs" placeholder="e.g. SS2, Senior Secondary" /></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="text-xs" rows={2} placeholder="Brief description of the book..." />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Preview PDF (public sample)</Label>
                      <Input type="file" accept="application/pdf,.pdf" onChange={(e) => setPreviewFile(e.target.files?.[0] || null)} className="h-9 text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs" />
                      {previewFile ? <p className="text-[10px] text-primary">Selected: {previewFile.name}</p> : <p className="text-[10px] text-muted-foreground">{editing?.preview_file_url ? "Existing preview will be kept." : "Select a short sample PDF. Maximum 25 MB."}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Full Literature PDF (protected)</Label>
                      <Input type="file" accept="application/pdf,.pdf" onChange={(e) => setFullFile(e.target.files?.[0] || null)} className="h-9 text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs" />
                      {fullFile ? <p className="text-[10px] text-primary">Selected: {fullFile.name}</p> : <p className="text-[10px] text-muted-foreground">{editing?.full_file_url ? "Existing full PDF will be kept." : "Select the complete book PDF. Maximum 25 MB."}</p>}
                    </div>
                  </div>
                  {(coverUrl || editing?.cover_image_url) && !coverFile && (
                    <div className="flex items-center gap-3">
                      <img src={coverUrl || editing?.cover_image_url || ""} alt="Preview" className="h-16 w-12 object-cover rounded border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span className="text-[10px] text-muted-foreground">Cover preview</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Switch checked={isFree} onCheckedChange={setIsFree} />
                    <div><Label className="text-xs">{isFree ? "Free for every student" : "Included with paid subscription"}</Label><p className="text-[10px] text-muted-foreground">A paid subscriber can read every paid book in the library; students do not pay per book.</p></div>
                  </div>
                  <Button size="sm" className="h-10 w-full gap-1 text-xs sm:h-8 sm:w-auto" onClick={handleSave} disabled={saving}>
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
