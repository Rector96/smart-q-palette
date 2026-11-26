import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Lock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import SubscriptionModal from "@/components/SubscriptionModal";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.75;
const ZOOM_STEP = 0.15;

const Reader = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "true";
  const viewMode = searchParams.get("view");
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
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const { data: book } = await supabase.from("digital_library").select("*").eq("id", id).single();
      if (!book) { navigate("/library"); return; }
      setTitle(book.title);
      setAuthor(book.author || null);
      setSummary(book.summary || null);

      // Preview PDFs are public; full PDFs are returned only by the access-checking function.
      if (isPreview) {
        const previewPath = book.preview_file_url as string | null;
        if (previewPath && /^https?:\/\//i.test(previewPath)) {
          setFileUrl(previewPath);
        } else if (previewPath) {
          const { data } = supabase.storage.from("library-previews").getPublicUrl(previewPath);
          setFileUrl(data.publicUrl);
        } else {
          setFileError("A preview PDF has not been uploaded for this book yet.");
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
  }, [id, user, isPreview, viewMode, navigate]);

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    const updateWidth = () => setContainerWidth(element.clientWidth);
    updateWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [fileUrl]);

  const pageWidth = useMemo(() => {
    const availableWidth = containerWidth > 0 ? containerWidth - 24 : 320;
    return Math.max(240, Math.min(availableWidth, 900) * zoom);
  }, [containerWidth, zoom]);

  useEffect(() => {
    const root = viewerRef.current;
    if (!root || !numPages || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const page = visible?.target.getAttribute("data-reader-page");
        if (page) setPageNumber(Number(page));
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );

    root.querySelectorAll("[data-reader-page]").forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [fileUrl, numPages]);

  const onDocumentLoadSuccess = useCallback((pdf: PDFDocumentProxy) => {
    setNumPages(pdf.numPages);
    setPageNumber(1);
  }, []);

  const goToPage = (nextPage: number) => {
    const safePage = Math.min(Math.max(nextPage, 1), numPages);
    setPageNumber(safePage);
    document.getElementById(`reader-page-${safePage}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background px-4 py-6">
        <div className="max-w-sm space-y-4 text-center">
          <Lock className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-bold">Premium Content</h2>
          <p className="text-sm text-muted-foreground">Subscribe to access the full book.</p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate("/library")}>Back</Button>
            <Button onClick={() => setShowSub(true)}>Upgrade</Button>
          </div>
        </div>
        <SubscriptionModal open={showSub} onOpenChange={setShowSub} />
      </div>
    );
  }

  if (viewMode === "summary" && summary) {
    return (
      <div className="flex min-h-[100svh] flex-col overflow-x-hidden bg-background">
        <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-4xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/library")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-bold">{title}</h1>
              {author && <p className="truncate text-[10px] text-muted-foreground">By {author}</p>}
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Summary</span>
          </div>
        </header>
        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {summary.split("\n").map((paragraph, idx) => {
              const trimmed = paragraph.trim();
              if (!trimmed) return <br key={idx} />;
              if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith("•") && !trimmed.startsWith("-")) {
                return <h3 key={idx} className="mb-2 mt-6 text-base font-bold text-foreground">{trimmed}</h3>;
              }
              if (/^\d+\./.test(trimmed) && trimmed.length < 80) {
                return <h4 key={idx} className="mb-1 mt-4 text-sm font-semibold text-foreground">{trimmed}</h4>;
              }
              return <p key={idx} className="mb-3 text-sm leading-relaxed text-muted-foreground">{trimmed}</p>;
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100svh] flex-col overflow-hidden bg-slate-100 dark:bg-background">
      <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate("/library")} aria-label="Back to library">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold">{title}</h1>
            {author && <p className="truncate text-[10px] text-muted-foreground">By {author}</p>}
          </div>
          {isPreview && <span className="shrink-0 rounded-full bg-warning/20 px-2 py-1 text-[10px] font-medium text-warning">Preview</span>}
          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Open or download PDF"
              title="Open or download PDF"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
        </div>
        {fileUrl && (
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 border-t border-border/70 px-2 py-2 sm:px-4">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={pageNumber <= 1} onClick={() => goToPage(pageNumber - 1)} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[76px] text-center text-xs tabular-nums text-muted-foreground">
                {numPages ? `Page ${pageNumber} of ${numPages}` : "Loading pages"}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={!numPages || pageNumber >= numPages} onClick={() => goToPage(pageNumber + 1)} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((value) => Math.max(MIN_ZOOM, Number((value - ZOOM_STEP).toFixed(2))))} aria-label="Zoom out">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((value) => Math.min(MAX_ZOOM, Number((value + ZOOM_STEP).toFixed(2))))} aria-label="Zoom in">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setZoom(1)}>Fit</Button>
            </div>
          </div>
        )}
      </header>

      <main ref={viewerRef} className="min-h-0 flex-1 overflow-auto overscroll-contain px-1 py-4 sm:px-4 sm:py-6">
        {fileError ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-5 text-center">
            <p className="text-sm font-semibold">Unable to open this PDF</p>
            <p className="max-w-md text-xs text-muted-foreground">{fileError}</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/library")}>Back to library</Button>
          </div>
        ) : fileUrl ? (
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(error) => setFileError(error.message || "The PDF could not be displayed.")}
            loading={<p className="py-12 text-center text-sm text-muted-foreground">Opening PDF...</p>}
            error={<p className="py-12 text-center text-sm text-destructive">Could not render this PDF. Use the open/download button above to try your device's PDF viewer.</p>}
            className="mx-auto flex w-fit min-w-0 flex-col items-center gap-4"
          >
            {Array.from({ length: numPages }, (_, index) => (
              <div
                id={`reader-page-${index + 1}`}
                data-reader-page={index + 1}
                key={`page-${index + 1}`}
                className="mx-auto w-fit max-w-none bg-white shadow-md"
              >
                <Page
                  pageNumber={index + 1}
                  width={pageWidth}
                  renderTextLayer
                  renderAnnotationLayer
                  loading={<div className="flex h-96 w-64 items-center justify-center text-xs text-muted-foreground">Loading page...</div>}
                />
              </div>
            ))}
          </Document>
        ) : (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">No file available</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Reader;
