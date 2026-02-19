import logoImg from "@/assets/logo.png";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const Logo = ({ size = "sm", showText = false, className = "" }: LogoProps) => {
  const imgSizes = { sm: "h-7 sm:h-8", md: "h-9 sm:h-10", lg: "h-14 sm:h-16" };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src={logoImg} alt="Weblines CBT" className={`${imgSizes[size]} w-auto object-contain`} />
      {showText && (
        <span className={`font-bold tracking-tight ${size === "lg" ? "text-xl sm:text-2xl" : "text-sm sm:text-base"}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          <span className="text-primary">Web</span>
          <span className="text-[hsl(var(--success))]">lines</span>
        </span>
      )}
    </div>
  );
};

export default Logo;
