import { useId } from "react";

export function Mark({ size = 22, className }: { size?: number; className?: string }) {
  const g = `mk-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#c9b6ff" /><stop offset="1" stopColor="#ffb59a" />
        </linearGradient>
      </defs>
      <path d="M16 2.5 28 8v8.2c0 6.2-4.9 11.2-12 13.3C8.9 27.4 4 22.4 4 16.2V8z" stroke={`url(#${g})`} strokeWidth="2" strokeLinejoin="round" />
      <path d="m10.5 11.5 5.5 9.5 5.5-9.5" stroke={`url(#${g})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <Mark />
      <span>Vetto</span>
    </span>
  );
}
