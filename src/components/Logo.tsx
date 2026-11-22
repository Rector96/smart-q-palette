import logoImg from "@/assets/logo.png";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const Logo = ({ size = "sm", showText = false, className = "" }: LogoProps) => {
  const imgSizes = { sm: "h-8 sm:h-9", md: "h-10 sm:h-12", lg: "h-16 sm:h-20" };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={logoImg}
        alt="ROCKCBT"
        width={1024}
        height={1024}
        decoding="async"
        className={`${imgSizes[size]} w-auto shrink-0 object-contain`}
      />
      {showText && (
        <span className={`font-bold tracking-tight ${size === "lg" ? "text-xl sm:text-2xl" : "text-sm sm:text-base"}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          ROCKCBT
        </span>
      )}
    </div>
  );
};

export default Logo;
