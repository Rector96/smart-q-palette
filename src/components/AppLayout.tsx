import BottomNav from "@/components/BottomNav";
import DesktopSidebar from "@/components/DesktopSidebar";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-background flex overflow-x-hidden">
      <DesktopSidebar />
      <div className="flex-1 min-w-0 min-h-screen pb-20 lg:pb-0">
        {children}
      </div>
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  );
};

export default AppLayout;
