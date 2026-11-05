"use client";
import { useEffect, useId, useRef } from "react";

export type Pose = "idle" | "wave" | "clasp" | "point" | "think" | "live";

/* ---- shared pointer so every Banker on the page follows the same cursor ---- */
const pointer = { x: 0, y: 0, active: false };
let listeners = 0;
const onMove = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; };
const onLeave = () => { pointer.active = false; };
function attachPointer() {
  if (listeners++ > 0) return;
  window.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
}
function detachPointer() {
  if (--listeners > 0) return;
  window.removeEventListener("pointermove", onMove);
  document.documentElement.removeEventListener("pointerleave", onLeave);
}

type Pt = readonly [number, number];

/** Angle of the a→b segment in SVG degrees (0 = pointing right). */
function angleOf(a: Pt, b: Pt): number {
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
}

/**
 * One arm as two jointed capsule segments (shoulder→elbow→wrist) plus a cuff and a
 * gloved hand. Drawn as strokes so the elbow join is continuous — the previous hand
 * written outlines left the raised arm looking detached from the shoulder.
 */
function JointedArm({
  shoulder,
  elbow,
  wrist,
  sleeve,
  width = 46,
  gloveScale = 0.62,
  gloveTilt = 0,
  className,
  animate,
}: {
  shoulder: Pt;
  elbow: Pt;
  wrist: Pt;
  sleeve: string;
  width?: number;
  gloveScale?: number;
  gloveTilt?: number;
  className?: string;
  animate?: boolean;
}) {
  const path = `M${shoulder[0]} ${shoulder[1]} L${elbow[0]} ${elbow[1]} L${wrist[0]} ${wrist[1]}`;
  const forearmAngle = angleOf(elbow, wrist);
  const cuffAngle = forearmAngle + 90;
  // The glove path is authored palm-down at (543, 402) with the fingers pointing up.
  const gloveAngle = forearmAngle + 90 + gloveTilt;

  const upper = (
    <>
      <path d={path} fill="none" stroke="#1f1659" strokeWidth={width + 3} strokeLinecap="round" strokeLinejoin="round" />
      <path d={path} fill="none" stroke={sleeve} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
  const hand = (
    <>
      <g transform={`translate(${wrist[0]} ${wrist[1]}) rotate(${cuffAngle})`}>
        <rect x={-(width + 8) / 2} y={-7} width={width + 8} height={15} rx={5} fill="#fff" stroke="#cfc8ee" strokeWidth={1.6} />
      </g>
      <g transform={`translate(${wrist[0]} ${wrist[1]}) rotate(${gloveAngle}) scale(${gloveScale}) translate(-543 -402)`}>
        <path
          d="M502 398 498 332Q496 316 510 316L516 348 518 298Q520 282 534 284L538 342 544 292Q548 276 561 280L560 342 570 310Q578 298 588 306Q590 332 578 374L568 402Z"
          fill="#f4f1ff"
          stroke="#cfc8ee"
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
      </g>
    </>
  );

  return (
    <g className={className}>
      {animate ? (
        <>
          {upper}
          <g
            className="forearm"
            style={{ transformBox: "view-box", transformOrigin: `${elbow[0]}px ${elbow[1]}px` }}
          >
            <path
              d={`M${elbow[0]} ${elbow[1]} L${wrist[0]} ${wrist[1]}`}
              fill="none"
              stroke="#1f1659"
              strokeWidth={width - 2}
              strokeLinecap="round"
            />
            <path
              d={`M${elbow[0]} ${elbow[1]} L${wrist[0]} ${wrist[1]}`}
              fill="none"
              stroke={sleeve}
              strokeWidth={width - 5}
              strokeLinecap="round"
            />
            {hand}
          </g>
        </>
      ) : (
        <>
          {upper}
          {hand}
        </>
      )}
    </g>
  );
}

const MAX_X = 6; // how far a pupil may travel inside the eye (svg units)
const MAX_Y = 4.5;

/**
 * Vetto: a young private banker in a lilac masquerade mask, plum suit, peach bow tie.
 * Drawn as an original SVG. Eyes follow the cursor; pose changes are CSS-driven (globals.css).
 */
export function Banker({ pose = "idle", className = "", fade = true, viewBox = "-96 0 736 760", eyes = true }: { pose?: Pose; className?: string; fade?: boolean; viewBox?: string; eyes?: boolean }) {
  const u = useId().replace(/:/g, "");
  const id = (n: string) => `${n}-${u}`;
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const scleras = Array.from(svg.querySelectorAll<SVGElement>("[data-sclera]"));
    const pupils = Array.from(svg.querySelectorAll<SVGGElement>("[data-pupil]"));
    if (!scleras.length || scleras.length !== pupils.length) return;

    if (!eyes) return;
    attachPointer();
    const cur = pupils.map(() => ({ x: 0, y: 0 }));
    let raf = 0;
    let visible = true;

    const frame = () => {
      if (visible) {
        scleras.forEach((eye, i) => {
          let tx = 0;
          let ty = 0;
          if (pointer.active) {
            const r = eye.getBoundingClientRect();
            const dx = pointer.x - (r.left + r.width / 2);
            const dy = pointer.y - (r.top + r.height / 2);
            const dist = Math.hypot(dx, dy) || 1;
            const k = Math.min(1, dist / 220);
            tx = (dx / dist) * MAX_X * k;
            ty = (dy / dist) * MAX_Y * k;
          }
          const c = cur[i]!;
          c.x += (tx - c.x) * 0.2;
          c.y += (ty - c.y) * 0.2;
          pupils[i]!.setAttribute("transform", `translate(${c.x.toFixed(2)} ${c.y.toFixed(2)})`);
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; });
    io.observe(svg);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      detachPointer();
    };
  }, [eyes]);

  const maskPath =
    "M153 134C190 124 232 122 268 140C305 122 350 122 388 127C380 170 360 215 322 233C300 238 282 225 268 214C254 225 236 238 214 233C176 215 160 170 153 134ZM192 168C215 158 240 160 262 172C255 192 232 200 212 194C200 188 195 178 192 168ZM274 172C296 160 322 158 345 168C342 180 335 190 322 195C302 200 280 192 274 172Z";

  return (
    <svg ref={svgRef} viewBox={viewBox} className={`banker ${className}`} data-pose={pose} role="img" aria-label="Vetto, your banker">
      <defs>
        <linearGradient id={id("coat")} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4d3ea8" /><stop offset="1" stopColor="#3a2c88" /></linearGradient>
        <linearGradient id={id("sleeve")} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#4a3b9f" /><stop offset="1" stopColor="#4f40aa" /></linearGradient>
        <linearGradient id={id("vest")} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#a587f2" /><stop offset="1" stopColor="#8461de" /></linearGradient>
        <linearGradient id={id("skin")} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ebb890" /><stop offset="1" stopColor="#e2a87e" /></linearGradient>
        <linearGradient id={id("mask")} x1="0" y1="0" x2="1" y2="0.25"><stop stopColor="#c6a4f3" /><stop offset=".55" stopColor="#d9a9e0" /><stop offset="1" stopColor="#f3a9bb" /></linearGradient>
        <linearGradient id={id("fade")} x1="0" y1="0" x2="0" y2="1"><stop offset=".8" stopColor="#06041a" stopOpacity="0" /><stop offset="1" stopColor="#06041a" stopOpacity=".92" /></linearGradient>
        <clipPath id={id("eyeL")}><ellipse cx="234" cy="187" rx="15" ry="12.5" /></clipPath>
        <clipPath id={id("eyeR")}><ellipse cx="302" cy="187" rx="15" ry="12.5" /></clipPath>
      </defs>

      <g className="body">
        {/* jacket back */}
        <path d="M150 400Q272 340 394 400L420 760H124Z" fill={`url(#${id("coat")})`} />

        {/* neck */}
        <path d="M232 280 236 376Q272 396 312 376L316 280Z" fill="#dca47c" />
        <path d="M232 284Q272 322 316 284V312Q272 340 232 312Z" fill="#c68b64" opacity=".5" />

        {/* shirt + cord */}
        <path d="M205 362 236 350H308L340 362 272 488Z" fill="#f3f0fd" />
        <path d="M206 366 272 403 338 366" stroke="#2a2260" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" fill="none" />

        {/* vest */}
        <path d="M228 436 272 488 316 436 326 478 296 548 284 612V760H260V612L248 548 218 478Z" fill={`url(#${id("vest")})`} />
        {/* lapels */}
        <path d="M206 364 228 436 218 478 248 548 260 612V760H226L224 600 190 480 168 404Z" fill="#2c2272" stroke="#1f1659" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M338 364 316 436 326 478 296 548 284 612V760H318L320 600 354 480 376 404Z" fill="#2c2272" stroke="#1f1659" strokeWidth="1.4" strokeLinejoin="round" />
        {/* bow tie */}
        <path d="M233 388 266 399V410L235 417Z" fill="#f2a78f" />
        <path d="M311 388 278 399V410L309 417Z" fill="#f2a78f" />
        <rect x="265" y="394" width="14" height="18" rx="4" fill="#e78e7d" />
        {/* buttons + chain */}
        {[516, 550, 584].map((y) => <circle key={y} cx="272" cy={y} r="5" fill="#f5c542" />)}
        <path d="M277 548Q300 558 318 554" stroke="#f5c542" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="1 5" fill="none" />

        {/* sleeves (hanging) */}
        <g className="arm arm-l">
          <path d="M168 412C122 402 84 430 74 482L50 760H130L134 540C140 490 172 470 168 412Z" fill={`url(#${id("sleeve")})`} stroke="#1f1659" strokeWidth="1.6" strokeLinejoin="round" />
          <rect x="50" y="690" width="82" height="14" rx="5" fill="#fff" stroke="#cfc8ee" strokeWidth="1.4" />
          <path d="M54 704H128L122 758H60Z" fill="#f4f1ff" stroke="#cfc8ee" strokeWidth="1.6" strokeLinejoin="round" />
        </g>
        <g className="arm arm-r">
          <path d="M376 412C422 402 460 430 470 482L494 760H414L410 540C404 490 372 470 376 412Z" fill={`url(#${id("sleeve")})`} stroke="#1f1659" strokeWidth="1.6" strokeLinejoin="round" />
          <rect x="412" y="690" width="82" height="14" rx="5" fill="#fff" stroke="#cfc8ee" strokeWidth="1.4" />
          <path d="M416 704H490L484 758H422Z" fill="#f4f1ff" stroke="#cfc8ee" strokeWidth="1.6" strokeLinejoin="round" />
        </g>

        {/* clasp: both forearms folded in front, gloves together */}
        <g className="pose-clasp">
          <path d="M168 412C122 402 84 430 74 482L66 600L100 640L236 624L248 586L170 576L134 540C140 490 172 470 168 412Z" fill={`url(#${id("sleeve")})`} stroke="#1f1659" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M376 412C422 402 460 430 470 482L478 600L444 640L308 624L296 586L374 576L410 540C404 490 372 470 376 412Z" fill={`url(#${id("sleeve")})`} stroke="#1f1659" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M230 580L276 596L270 648L226 646Q206 640 210 612Z" fill="#f4f1ff" stroke="#cfc8ee" strokeWidth="1.6" strokeLinejoin="round" transform="rotate(-8 244 612)" />
          <path d="M314 580L268 596L274 648L318 646Q338 640 334 612Z" fill="#f4f1ff" stroke="#cfc8ee" strokeWidth="1.6" strokeLinejoin="round" transform="rotate(8 300 612)" />
        </g>

        {/* think: right hand up beside the chin, elbow tucked in */}
        <g className="pose-think">
          <JointedArm
            shoulder={[378, 414]}
            elbow={[452, 486]}
            wrist={[390, 336]}
            sleeve={`url(#${id("sleeve")})`}
            width={44}
            gloveScale={0.66}
            gloveTilt={-14}
          />
        </g>

        {/* point: right arm out toward the route cards */}
        <g className="pose-point">
          <JointedArm
            shoulder={[378, 414]}
            elbow={[486, 452]}
            wrist={[590, 492]}
            sleeve={`url(#${id("sleeve")})`}
            width={44}
            gloveScale={0.66}
            gloveTilt={10}
          />
        </g>

        {/* wave: right arm raised in greeting, forearm rocks around the elbow */}
        <g className="arm-r-up">
          <JointedArm
            shoulder={[378, 414]}
            elbow={[492, 468]}
            wrist={[540, 322]}
            sleeve={`url(#${id("sleeve")})`}
            width={44}
            gloveScale={0.68}
            animate
          />
        </g>

        {/* head (tilts a little per pose) */}
        <g className="head">
        {/* ears */}
        <ellipse cx="133" cy="188" rx="15" ry="22" fill="#e6ad84" />
        <ellipse cx="137" cy="192" rx="7" ry="12" fill="#d98f8a" opacity=".7" />
        <ellipse cx="403" cy="188" rx="15" ry="22" fill="#e6ad84" />
        <ellipse cx="399" cy="192" rx="7" ry="12" fill="#d98f8a" opacity=".7" />
        {/* hair */}
        <ellipse cx="268" cy="102" rx="132" ry="98" fill="#2b2366" />
        <path d="M168 84Q230 16 332 30" stroke="#4a3f9e" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".55" />
        {/* face */}
        <ellipse cx="268" cy="186" rx="128" ry="108" fill={`url(#${id("skin")})`} />
        {/* brows */}
        <path d="M202 102Q222 88 247 104M284 100Q307 86 332 101" stroke="#2a2160" strokeWidth="6.5" strokeLinecap="round" fill="none" />

        {/* eyes (follow the cursor) */}
        <g className="eye">
          <ellipse data-sclera cx="234" cy="187" rx="15" ry="12.5" fill="#fff" />
          <g clipPath={`url(#${id("eyeL")})`}>
            <g data-pupil><circle cx="234" cy="188" r="8.4" fill="#231c55" /><circle cx="237" cy="184.5" r="2.7" fill="#fff" /></g>
          </g>
        </g>
        <g className="eye">
          <ellipse data-sclera cx="302" cy="187" rx="15" ry="12.5" fill="#fff" />
          <g clipPath={`url(#${id("eyeR")})`}>
            <g data-pupil><circle cx="302" cy="188" r="8.4" fill="#231c55" /><circle cx="305" cy="184.5" r="2.7" fill="#fff" /></g>
          </g>
        </g>

        {/* mask: soft shadow on the skin, then the mask with eye-holes */}
        <path transform="translate(0 6)" d={maskPath} fill="#a8684f" opacity=".28" fillRule="evenodd" />
        <path d={maskPath} fill={`url(#${id("mask")})`} fillRule="evenodd" />
        <circle cx="266" cy="134" r="10" fill="#d9a8ea" />
        <path d="M262 224Q268 234 276 224" stroke="#c98b69" strokeWidth="3" strokeLinecap="round" fill="none" />

        {/* cheeks + mouth */}
        <circle cx="200" cy="244" r="21" fill="#f0a39a" opacity=".5" />
        <circle cx="336" cy="241" r="21" fill="#f0a39a" opacity=".5" />
        <path className="mouth-smile" d="M246 264Q270 280 294 264" stroke="#9b3d55" strokeWidth="3.6" strokeLinecap="round" fill="none" />
        <g className="mouth-open">
          <path d="M243 260Q270 256 297 260Q290 286 270 286Q250 286 243 260Z" fill="#7a2148" />
          <path d="M246 261Q270 258 294 261L293 268Q270 265 247 268Z" fill="#fff" />
        </g>

        {/* headset (live pose) */}
        <g className="headset">
          <path d="M138 170C130 40 408 40 398 170" stroke="#1a1240" strokeWidth="9" strokeLinecap="round" fill="none" />
          <ellipse cx="128" cy="190" rx="13" ry="26" fill="#1a1240" /><ellipse cx="408" cy="190" rx="13" ry="26" fill="#1a1240" />
          <path d="M408 214Q400 268 330 284" stroke="#1a1240" strokeWidth="5" strokeLinecap="round" fill="none" /><circle cx="326" cy="285" r="8" fill="#1a1240" />
        </g>
        </g>

        {fade && <rect x="-96" y="0" width="736" height="760" fill={`url(#${id("fade")})`} />}
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
