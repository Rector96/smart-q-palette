import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import ScrollToTop from "@/components/ScrollToTop";
import PageLoader from "@/components/PageLoader";
import AppLayout from "@/components/AppLayout";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SelectSubjects = lazy(() => import("./pages/SelectSubjects"));
const Exam = lazy(() => import("./pages/Exam"));
const Results = lazy(() => import("./pages/Results"));
const AITutor = lazy(() => import("./pages/AITutor"));
const Profile = lazy(() => import("./pages/Profile"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const SharedExamRedirect = lazy(() => import("./pages/SharedExamRedirect"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Library = lazy(() => import("./pages/Library"));
const Reader = lazy(() => import("./pages/Reader"));
const CreateExam = lazy(() => import("./pages/CreateExam"));
const TakeExam = lazy(() => import("./pages/TakeExam"));
const LiveQuiz = lazy(() => import("./pages/LiveQuiz"));
const QuizRoom = lazy(() => import("./pages/QuizRoom"));
const QuizRedirect = lazy(() => import("./pages/QuizRedirect"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminPayments = lazy(() => import("./pages/admin/AdminPayments"));
const AdminContent = lazy(() => import("./pages/admin/AdminContent"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminLibrary = lazy(() => import("./pages/admin/AdminLibrary"));
const AdminEmail = lazy(() => import("./pages/admin/AdminEmail"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ScrollToTop />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public pages - no bottom nav */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/s/:code" element={<SharedExamRedirect />} />
              <Route path="/exam/:code" element={<TakeExam />} />
              <Route path="/q/:roomCode" element={<QuizRedirect />} />

              {/* Private pages with bottom nav */}
              <Route path="/dashboard" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
              <Route path="/ai-tutor" element={<ProtectedRoute><AppLayout><AITutor /></AppLayout></ProtectedRoute>} />
              <Route path="/profile" element={<AppLayout><Profile /></AppLayout>} />
              <Route path="/select-subjects" element={<ProtectedRoute><AppLayout><SelectSubjects /></AppLayout></ProtectedRoute>} />
              <Route path="/results/:sessionId" element={<ProtectedRoute><AppLayout><Results /></AppLayout></ProtectedRoute>} />
              <Route path="/library" element={<ProtectedRoute><AppLayout><Library /></AppLayout></ProtectedRoute>} />
              <Route path="/reader/:id" element={<ProtectedRoute><Reader /></ProtectedRoute>} />
              <Route path="/create-exam" element={<ProtectedRoute><AppLayout><CreateExam /></AppLayout></ProtectedRoute>} />

              {/* Focus mode - no nav at all */}
              <Route path="/exam" element={<ProtectedRoute><Exam /></ProtectedRoute>} />

              {/* Admin routes */}
              <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
              <Route path="/admin/payments" element={<AdminRoute><AdminPayments /></AdminRoute>} />
              <Route path="/admin/content" element={<AdminRoute><AdminContent /></AdminRoute>} />
              <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
              <Route path="/admin/library" element={<AdminRoute><AdminLibrary /></AdminRoute>} />
              <Route path="/admin/email" element={<AdminRoute><AdminEmail /></AdminRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
