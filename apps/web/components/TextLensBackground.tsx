"use client";

import { useEffect, useRef } from "react";

type Props = {
  word?: string;
  anchorSelector?: string;
  className?: string;
};

const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uDpr;
uniform float uR;
uniform float uS;
uniform float uA;
uniform float uW1;
uniform float uMu;
uniform float uW2;
uniform float uP;

const float SQ = 0.88622692545;

float erfa(float x) {
  float s = sign(x);
  x = abs(x);
  float t = 1.0 + x * (0.278393 + x * (0.230389 + x * (0.000972 + x * 0.078108)));
  t *= t;
  t *= t;
  return s * (1.0 - 1.0 / t);
}

float sRad(float r) {
  return r
    - uA * uW1 * SQ * erfa(r / uW1)
    + uP * uW2 * SQ * (erfa((r - uMu) / uW2) + erfa(uMu / uW2));
}

float rhoOf(vec2 p) {
  vec2 d = p - uCenter;
  return length(vec2(d.x / uS, d.y)) / uR;
}

float sampleAlpha(vec2 p) {
  vec2 d = p - uCenter;
  float rho = rhoOf(p);
  float k = rho < 0.0001 ? (1.0 - uA) : sRad(rho) / rho;
  vec2 src = uCenter + d * k;
  return texture2D(uTex, src / uRes).a;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;

  float a = 0.0;
  a += sampleAlpha(p + vec2(-0.25, -0.125));
  a += sampleAlpha(p + vec2( 0.125, -0.25));
  a += sampleAlpha(p + vec2( 0.25,  0.125));
  a += sampleAlpha(p + vec2(-0.125, 0.25));
  a *= 0.25;

  float rho = rhoOf(p);
  float warm = clamp((0.75 - rho) / 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.69, 0.63, 0.92), vec3(0.93, 0.69, 0.63), warm);
  float alpha = (0.34 + 0.2 * warm) * a;

  gl_FragColor = vec4(col * alpha, alpha);
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    console.error("TextLensBackground: unable to create WebGL shader.");
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("TextLensBackground shader compilation failed:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function TextLensBackground({ word = "vetto", anchorSelector, className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      premultipliedAlpha: true,
      antialias: false,
      alpha: true,
    });
    if (!gl) {
      console.error("TextLensBackground: WebGL is not available in this browser.");
      return;
    }

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) {
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      console.error("TextLensBackground: unable to create WebGL program.");
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("TextLensBackground program linking failed:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!buffer || !texture) {
      console.error("TextLensBackground: unable to allocate WebGL resources.");
      if (buffer) gl.deleteBuffer(buffer);
      if (texture) gl.deleteTexture(texture);
      gl.deleteProgram(program);
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const uniforms = {
      res: uniform("uRes"),
      center: uniform("uCenter"),
      dpr: uniform("uDpr"),
      radius: uniform("uR"),
      stretch: uniform("uS"),
      amount: uniform("uA"),
      width1: uniform("uW1"),
      mu: uniform("uMu"),
      width2: uniform("uW2"),
      p: uniform("uP"),
    };

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const A = 0.66;
    const W1 = 0.85;
    const MU = 1;
    const W2 = 0.12;
    const STRETCH = 1.17;
    const INTRO_DURATION = 1400;
    const MIN_SCROLL_SCALE = 0.58;
    const ANCHOR_Y_OFFSET = -16;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const anchor = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    const section = canvas.closest("section");
    let amount = reducedMotion ? A : 0.02;
    let introProgress = reducedMotion ? 1 : 0;
    let introStartedAt = performance.now();
    let scrollScale = 1;
    let targetScrollScale = 1;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let active = true;

    const measureAnchor = () => {
      const bounds = canvas.getBoundingClientRect();
      const host = canvas.closest("section");
      const element = anchorSelector && host
        ? host.querySelector<HTMLElement>(anchorSelector)
        : null;

      if (element) {
        const elementBounds = element.getBoundingClientRect();
        anchor.x = elementBounds.left - bounds.left + elementBounds.width / 2;
        anchor.y = elementBounds.top - bounds.top + elementBounds.height / 2 + ANCHOR_Y_OFFSET;
      } else {
        anchor.x = width / 2;
        anchor.y = height / 2;
      }
    };

    const buildTexture = () => {
      let scale = Math.min(2.5, Math.max(1.5, dpr * 1.25));
      while (width * scale > 4096 || height * scale > 4096) scale *= 0.9;

      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = Math.round(width * scale);
      textureCanvas.height = Math.round(height * scale);
      const context = textureCanvas.getContext("2d");
      if (!context) {
        console.error("TextLensBackground: unable to create the text texture.");
        return;
      }
      context.scale(scale, scale);
      context.fillStyle = "#fff";
      context.textBaseline = "alphabetic";
      context.font = `600 ${width < 768 ? 14 : 18}px ${getComputedStyle(document.body).fontFamily}`;

      const small = width < 768;
      const pitchY = small ? 20 : 23;
      const gap = small ? 7 : 8;
      const wordWidth = context.measureText(word).width;
      const pitchX = wordWidth + gap;
      const startX = ((((anchor.x - wordWidth / 2) % pitchX) + pitchX) % pitchX) - pitchX;

      for (let y = pitchY; y < height + pitchY; y += pitchY) {
        for (let x = startX; x < width + pitchX; x += pitchX) {
          context.fillText(word, x, y);
        }
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureCanvas);
    };

    const draw = () => {
      const rx = Math.max(0.21 * width, Math.min(0.46 * width, 0.39 * height * STRETCH));
      const radius = Math.min(rx / STRETCH, 0.39 * height) * scrollScale;
      const p = (amount * W1) / (W2 * (1 + erf(MU / W2)));

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.res, width, height);
      gl.uniform2f(uniforms.center, anchor.x + current.x, anchor.y + current.y);
      gl.uniform1f(uniforms.dpr, dpr);
      gl.uniform1f(uniforms.radius, radius);
      gl.uniform1f(uniforms.stretch, STRETCH);
      gl.uniform1f(uniforms.amount, amount);
      gl.uniform1f(uniforms.width1, W1);
      gl.uniform1f(uniforms.mu, MU);
      gl.uniform1f(uniforms.width2, W2);
      gl.uniform1f(uniforms.p, p);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const tick = (now: number) => {
      const progress = Math.min(1, (now - introStartedAt) / INTRO_DURATION);
      introProgress = progress;
      const easedProgress = 1 - (1 - progress) ** 3;
      amount = reducedMotion ? A : 0.02 + (A - 0.02) * easedProgress;
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;
      scrollScale += (targetScrollScale - scrollScale) * 0.12;
      draw();

      const moving =
        introProgress < 1 ||
        Math.abs(target.x - current.x) > 0.05 ||
        Math.abs(target.y - current.y) > 0.05 ||
        Math.abs(targetScrollScale - scrollScale) > 0.001;
      raf = moving ? requestAnimationFrame(tick) : 0;
    };

    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const relayout = () => {
      if (!active) return;
      measureAnchor();
      buildTexture();
      draw();
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (!width || !height) return;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      relayout();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion || event.pointerType === "touch") return;
      target.x = (event.clientX / window.innerWidth - 0.5) * -22;
      target.y = (event.clientY / window.innerHeight - 0.5) * -18;
      kick();
    };

    const onPointerLeave = () => {
      target.x = 0;
      target.y = 0;
      kick();
    };

    const onScroll = () => {
      const bounds = section?.getBoundingClientRect();
      const progress = bounds
        ? Math.min(1, Math.max(0, -bounds.top / (bounds.height * 0.72)))
        : 0;
      targetScrollScale = 1 - progress * (1 - MIN_SCROLL_SCALE);
      if (reducedMotion) {
        scrollScale = targetScrollScale;
        draw();
      } else {
        kick();
      }
    };

    resize();
    onScroll();
    if (!reducedMotion) kick();
    document.fonts?.ready.then(relayout);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("scroll", onScroll, { passive: true });
    if (!reducedMotion) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
    }

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [word, anchorSelector]);

  return <canvas ref={canvasRef} data-hero-lens className={`absolute inset-0 z-0 h-full w-full ${className}`} aria-hidden="true" />;
}

function erf(x: number) {
  const sign = Math.sign(x);
  const absolute = Math.abs(x);
  let t = 1 + absolute * (0.278393 + absolute * (0.230389 + absolute * (0.000972 + absolute * 0.078108)));
  t *= t;
  t *= t;
  return sign * (1 - 1 / t);
}
