"use client";
import { useEffect, useRef, type MutableRefObject } from "react";

export interface VortexControl { strength: number }

/**
 * A field of the word "vetto" bent around a lens that follows the pointer.
 * Canvas (not DOM) so ~2k warped words stay cheap; paused off-screen; static under reduced motion.
 * `control.strength` is tweened by GSAP from the landing page (calms the field after the intro).
 */
export function VortexField({ word = "vetto", control, className = "" }: { word?: string; control: MutableRefObject<VortexControl>; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const FONT = 15, ROW = 20;
    let w = 0, h = 0, dpr = 1, raf = 0, last = 0, visible = true;
    const lens = { x: 0.5, y: 0.45, tx: 0.5, ty: 0.45 };
    let wordW = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.font = `600 ${FONT}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      wordW = ctx.measureText(`${word}  `).width;
      draw(performance.now());
    };

    function draw(now: number) {
      const t = now / 1000;
      const s = control.current.strength;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);
      const cx = lens.x * w, cy = lens.y * h;
      const R = Math.min(w, h) * 0.52;
      const rows = Math.ceil(h / ROW) + 1;

      for (let r = 0; r < rows; r++) {
        const dir = r % 2 ? 1 : -1;
        const drift = reduce ? 0 : ((t * 7 * dir) % wordW);
        for (let x = -wordW * 2; x < w + wordW; x += wordW) {
          const bx = x + drift + (r % 2) * (wordW / 2);
          const by = r * ROW;
          const dx = bx - cx, dy = by - cy;
          const d = Math.hypot(dx, dy);
          const k = Math.exp(-(d * d) / (2 * R * R * 0.32));              // 1 at the lens, 0 far away
          const wave = Math.sin(t * 0.7 - d * 0.014);
          const ang = Math.atan2(dy, dx) + k * s * 0.9 * wave;           // swirl
          const rad = d * (1 + 0.32 * k * s * Math.sin(t * 0.55 - d * 0.017)); // breathing bulge
          const px = cx + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad;
          if (px < -wordW || px > w + wordW || py < -ROW || py > h + ROW) continue;
          const scale = 1 + 0.55 * k * s;
          const tilt = (ang - Math.atan2(dy, dx)) * 0.6;
          ctx!.setTransform(dpr * scale * Math.cos(tilt), dpr * scale * Math.sin(tilt), -dpr * scale * Math.sin(tilt), dpr * scale * Math.cos(tilt), px * dpr, py * dpr);
          ctx!.fillStyle = `rgba(214,200,255,${0.06 + 0.62 * k * Math.min(1, s)})`;
          ctx!.fillText(word, 0, 0);
        }
      }
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || now - last < 33) return; // ~30fps is plenty for a texture
      last = now;
      lens.x += (lens.tx - lens.x) * 0.06; lens.y += (lens.ty - lens.y) * 0.06;
      draw(now);
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      lens.tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      lens.ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    };

    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; }, { threshold: 0 });
    io.observe(canvas);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    if (!reduce) {
      window.addEventListener("pointermove", onMove, { passive: true });
      raf = requestAnimationFrame(loop);
    }
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); window.removeEventListener("pointermove", onMove); };
  }, [word, control]);

  return <canvas ref={ref} className={`absolute inset-0 h-full w-full ${className}`} aria-hidden />;
}
