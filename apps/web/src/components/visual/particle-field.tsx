
"use client";

import { useEffect, useRef } from "react";

type ParticleFieldProps = {
  className?: string;
  particleCount?: number;
  speed?: number;
};

type Particle = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  speedX: number;
  speedY: number;
  phase: number;
};

export function ParticleField({
  className = "",
  particleCount = 65,
  speed = 1,
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) return;

    const mediaQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    const particles: Particle[] = [];
    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let elapsed = 0;

    const count = Math.max(0, Math.min(particleCount, 180));

    const random = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    const createParticle = (): Particle => ({
      x: random(0, width),
      y: random(0, height),
      radius: random(0.7, 2),
      opacity: random(0.15, 0.65),
      speedX: random(-0.12, 0.12) * speed,
      speedY: random(-0.2, -0.04) * speed,
      phase: random(0, Math.PI * 2),
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();

      width = rect.width;
      height = rect.height;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);

      context.setTransform(
        pixelRatio,
        0,
        0,
        pixelRatio,
        0,
        0
      );

      particles.length = 0;

      for (let i = 0; i < count; i += 1) {
        particles.push(createParticle());
      }

      drawFrame(false);
    };

    const drawParticle = (particle: Particle, time: number) => {
      const pulse =
        0.75 + Math.sin(time * 0.001 + particle.phase) * 0.25;

      const alpha = particle.opacity * pulse;

      context.beginPath();
      context.arc(
        particle.x,
        particle.y,
        particle.radius,
        0,
        Math.PI * 2
      );

      context.fillStyle = `rgba(196, 181, 253, ${alpha})`;
      context.fill();

      if (particle.radius > 1.5) {
        context.beginPath();
        context.arc(
          particle.x,
          particle.y,
          particle.radius * 3,
          0,
          Math.PI * 2
        );

        context.fillStyle = `rgba(139, 92, 246, ${alpha * 0.12})`;
        context.fill();
      }
    };

    const drawConnections = () => {
      const maxDistance = 110;

      for (let i = 0; i < particles.length; i += 1) {
        const first = particles[i];

        for (let j = i + 1; j < particles.length; j += 1) {
          const second = particles[j];

          const dx = first.x - second.x;
          const dy = first.y - second.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance >= maxDistance) continue;

          const opacity = (1 - distance / maxDistance) * 0.12;

          context.beginPath();
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, second.y);
          context.strokeStyle = `rgba(167, 139, 250, ${opacity})`;
          context.lineWidth = 0.6;
          context.stroke();
        }
      }
    };

    const drawFrame = (animate: boolean) => {
      context.clearRect(0, 0, width, height);

      if (animate) {
        elapsed += 16;

        for (const particle of particles) {
          particle.x += particle.speedX;
          particle.y += particle.speedY;

          if (particle.y < -10) {
            particle.y = height + 10;
            particle.x = random(0, width);
          }

          if (particle.x < -10) particle.x = width + 10;
          if (particle.x > width + 10) particle.x = -10;
        }
      }

      drawConnections();

      for (const particle of particles) {
        drawParticle(particle, elapsed);
      }
    };

    const animate = () => {
      drawFrame(true);
      animationFrame = window.requestAnimationFrame(animate);
    };

    const stopAnimation = () => {
      window.cancelAnimationFrame(animationFrame);
    };

    const startAnimation = () => {
      stopAnimation();

      if (mediaQuery.matches || document.hidden) {
        drawFrame(false);
        return;
      }

      animationFrame = window.requestAnimationFrame(animate);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopAnimation();
      } else {
        startAnimation();
      }
    };

    const handleMotionChange = () => {
      if (mediaQuery.matches) {
        stopAnimation();
        drawFrame(false);
      } else {
        startAnimation();
      }
    };

    const resizeObserver = new ResizeObserver(resize);

    resizeObserver.observe(canvas);
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );
    mediaQuery.addEventListener("change", handleMotionChange);

    resize();

    if (!mediaQuery.matches && !document.hidden) {
      startAnimation();
    }

    return () => {
      stopAnimation();
      resizeObserver.disconnect();

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      mediaQuery.removeEventListener("change", handleMotionChange);
    };
  }, [particleCount, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={`particle-field ${className}`}
      aria-hidden="true"
    />
  );
}
