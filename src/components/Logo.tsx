import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

const Logo = ({ className }: LogoProps) => (
  <svg
    viewBox="0 0 120 140"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="TradeStone logo"
    className={cn("h-10 w-auto", className)}
  >
    <title>TradeStone</title>
    <defs>
      <linearGradient id="logo-flame" x1="50%" x2="50%" y1="0%" y2="100%">
        <stop offset="0%" stopColor="#FDB654" />
        <stop offset="100%" stopColor="#FF6B1A" />
      </linearGradient>
      <linearGradient id="logo-eye" x1="30%" x2="70%" y1="30%" y2="70%">
        <stop offset="0%" stopColor="#FFD27D" />
        <stop offset="100%" stopColor="#FF7A1F" />
      </linearGradient>
      <filter id="logo-shadow" x="-20%" y="-20%" width="140%" height="150%" colorInterpolationFilters="sRGB">
        <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0F172A" floodOpacity="0.25" />
      </filter>
    </defs>

    <g filter="url(#logo-shadow)">
      <rect x="24" y="32" width="72" height="56" rx="10" fill="#1B2538" />
      <rect x="44" y="16" width="32" height="18" rx="6" fill="#1B2538" />
      <rect x="8" y="40" width="20" height="40" rx="8" fill="#1B2538" />
      <rect x="92" y="40" width="20" height="40" rx="8" fill="#1B2538" />

      <circle cx="60" cy="60" r="22" fill="white" opacity="0.9" />
      <circle cx="60" cy="60" r="16" fill="url(#logo-eye)" />
      <circle cx="66" cy="54" r="4" fill="white" opacity="0.85" />

      <rect x="52" y="88" width="16" height="26" rx="6" fill="#1B2538" />
      <path d="M60 114 L46 138 H74 Z" fill="url(#logo-flame)" />
      <path d="M52 99 L60 107 L68 99" stroke="#FF8B37" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

export default Logo;
