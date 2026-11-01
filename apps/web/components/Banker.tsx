import { useId } from "react";

export type Pose = "idle" | "wave" | "clasp" | "point";

/**
 * Original character: a composed, round-spectacled private banker with a pocket-watch chain.
 * Drawn from scratch for VETTO (no mask, no gloves) — see brief §4: do not copy reference art.
 * Pose changes are CSS-driven (globals.css) so React state can swap them cheaply.
 */
export function Banker({ pose = "idle", className = "" }: { pose?: Pose; className?: string }) {
  const u = useId().replace(/:/g, "");
  const id = (n: string) => `${n}-${u}`;
  return (
    <svg viewBox="0 0 400 520" className={`banker ${className}`} data-pose={pose} role="img" aria-label="Vetto, your banker">
      <defs>
        <linearGradient id={id("coat")} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#3b3a8c" /><stop offset="1" stopColor="#1c1a54" /></linearGradient>
        <linearGradient id={id("vest")} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#2a8f96" /><stop offset="1" stopColor="#176168" /></linearGradient>
        <radialGradient id={id("glow")} cx="50%" cy="38%" r="55%"><stop stopColor="#9a7bf2" stopOpacity=".38" /><stop offset="1" stopColor="#9a7bf2" stopOpacity="0" /></radialGradient>
        <linearGradient id={id("fade")} x1="0" y1="0" x2="0" y2="1"><stop offset=".72" stopColor="#06041a" stopOpacity="0" /><stop offset="1" stopColor="#06041a" stopOpacity=".92" /></linearGradient>
      </defs>
      <ellipse cx="200" cy="240" rx="190" ry="230" fill={`url(#${id("glow")})`} />
      <g className="body">
        {/* arms sit behind the torso edge */}
        <g className="arm arm-l">
          <path d="M112 360c-34 26-44 82-38 126l34 4c-2-34 6-72 26-98z" fill={`url(#${id("coat")})`} />
          <ellipse cx="90" cy="496" rx="17" ry="19" fill="#f0c19a" />
        </g>
        <g className="arm arm-r">
          <path d="M288 360c34 26 44 82 38 126l-34 4c2-34-6-72-26-98z" fill={`url(#${id("coat")})`} />
          <ellipse cx="310" cy="496" rx="17" ry="19" fill="#f0c19a" />
        </g>
        {/* torso */}
        <path d="M70 520c0-98 40-168 130-182 90 14 130 84 130 182z" fill={`url(#${id("coat")})`} />
        <path d="M200 338 150 520h-26l22-150 54-32zM200 338l50 32 22 150h-26z" fill="#4a49a8" opacity=".55" />
        <path d="M162 344 200 506 238 344z" fill={`url(#${id("vest")})`} />
        {[392, 426, 460].map((y) => <circle key={y} cx="200" cy={y} r="4" fill="#f5cf7a" />)}
        <path d="M172 408q28 22 50 6" stroke="#f5cf7a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <circle cx="224" cy="416" r="7" fill="none" stroke="#f5cf7a" strokeWidth="2.2" />
        {/* shirt + cravat */}
        <path d="m172 330 28 34 28-34-6-14h-44z" fill="#f4f1ff" />
        <path d="m186 350 14-9 14 9-7 24h-14z" fill="#c9b6ff" />
        {/* neck + head */}
        <path d="M178 290h44v40q-22 14-44 0z" fill="#e5b088" />
        <ellipse cx="124" cy="232" rx="13" ry="20" fill="#eeb990" />
        <ellipse cx="276" cy="232" rx="13" ry="20" fill="#eeb990" />
        <ellipse cx="200" cy="224" rx="80" ry="92" fill="#f6cca6" />
        <path d="M121 214c-8-52 22-88 79-88s88 36 79 88c-10-30-34-50-79-50s-69 20-79 50z" fill="#d9d4ee" />
        <path d="M122 214q-6 24 4 44-14-8-10-38zM278 214q6 24-4 44 14-8 10-38z" fill="#d9d4ee" />
        {/* brows, glasses, eyes */}
        <path d="M150 192q18-12 38-4M212 188q20-8 38 4" stroke="#aaa5c4" strokeWidth="5" strokeLinecap="round" fill="none" />
        <circle cx="168" cy="220" r="27" fill="#ffffff22" stroke="#f5cf7a" strokeWidth="4" />
        <circle cx="232" cy="220" r="27" fill="#ffffff22" stroke="#f5cf7a" strokeWidth="4" />
        <path d="M195 218q5-6 10 0" stroke="#f5cf7a" strokeWidth="4" fill="none" />
        <path d="M141 216l-14-4M259 216l14-4" stroke="#f5cf7a" strokeWidth="4" strokeLinecap="round" />
        <g className="eye"><circle cx="170" cy="222" r="6.5" fill="#22204a" /><circle cx="172" cy="220" r="2" fill="#fff" /></g>
        <g className="eye"><circle cx="230" cy="222" r="6.5" fill="#22204a" /><circle cx="232" cy="220" r="2" fill="#fff" /></g>
        <path d="M200 232q-7 20 2 26" stroke="#d99f78" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        {/* moustache + smile */}
        <path d="M200 268c-14-10-38-8-48 4 16 6 34 4 48-4zM200 268c14-10 38-8 48 4-16 6-34 4-48-4z" fill="#cfc9e6" />
        <path d="M178 284q22 14 44 0" stroke="#a5604a" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <rect x="0" y="0" width="400" height="520" fill={`url(#${id("fade")})`} />
      </g>
    </svg>
  );
}

export function SpeechBubble({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass rounded-2xl rounded-bl-md px-4 py-3 text-[13px] leading-snug text-white/90 ${className}`} role="status" aria-live="polite">
      <div className="mb-1 text-[11px] font-medium text-lilac">Vetto</div>
      {children}
    </div>
  );
}
