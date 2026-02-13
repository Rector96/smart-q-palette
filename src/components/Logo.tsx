import logoImg from "@/assets/logo.png";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const Logo = ({ size = "sm", showText = true, className = "" }: LogoProps) => {
  const imgSizes = { sm: "h-6", md: "h-8", lg: "h-12" };
  const textSizes = { sm: "text-sm", md: "text-lg", lg: "text-2xl" };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src={logoImg} alt="PassSmartly" className={`${imgSizes[size]} w-auto`} />
      {showText && (
        <span className={`font-bold tracking-tight ${textSizes[size]}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          <span className="text-primary">Pass</span>
          <span className="text-[hsl(var(--success))]">Smartly</span>
        </span>
      )}
    </div>
  );
};

export default Logo;
