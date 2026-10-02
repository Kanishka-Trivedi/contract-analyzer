import { ShieldCheck } from "lucide-react";

export function AuroraBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="aurora-bg min-h-full w-full">
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center h-10 w-10 rounded-xl bg-[var(--aurora)] shadow-[var(--shadow-glow)] ${className}`}>
      <ShieldCheck className="text-white" size={22} strokeWidth={2.5} />
    </div>
  );
}

export function EmptyStateIllustration() {
  return (
    <div className="relative mx-auto h-32 w-32 fade-up">
      <svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="28" y="24" width="72" height="88" rx="8" fill="white" stroke="#E6E9F5" strokeWidth="2" />
        <rect x="36" y="44" width="48" height="4" rx="2" fill="#F6F7FC" />
        <rect x="36" y="56" width="56" height="4" rx="2" fill="#F6F7FC" />
        <rect x="36" y="68" width="40" height="4" rx="2" fill="#F6F7FC" />
        <rect x="16" y="40" width="72" height="88" rx="8" fill="white" stroke="#E6E9F5" strokeWidth="2" />
        <rect x="24" y="60" width="48" height="4" rx="2" fill="#F6F7FC" />
        <rect x="24" y="72" width="56" height="4" rx="2" fill="#F6F7FC" />
        <rect x="24" y="84" width="40" height="4" rx="2" fill="#F6F7FC" />
      </svg>
      <div className="absolute -bottom-2 -right-2">
        <LogoMark className="h-14 w-14" />
      </div>
    </div>
  );
}
