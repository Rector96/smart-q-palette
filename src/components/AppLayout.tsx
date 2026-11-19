import BottomNav from "@/components/BottomNav";
import DesktopSidebar from "@/components/DesktopSidebar";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-background">
      <div className="flex min-h-[100dvh]">
        <DesktopSidebar />
        <div className="min-w-0 min-h-[100dvh] flex-1 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
          {children}
        </div>
      </div>
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  );
};

export default AppLayout;
