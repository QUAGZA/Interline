"use client";

import { useEffect, useRef } from "react";

interface AnimatedNoiseProps {
  opacity?: number;
  className?: string;
}

export function AnimatedNoise({ opacity = 0.05, className }: AnimatedNoiseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let animationId = 0;
    let frame = 0;
    let buffer: ImageData | null = null;
    let visible = !document.hidden;

    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.offsetWidth / 8));
      const h = Math.max(1, Math.floor(canvas.offsetHeight / 8));
      if (canvas.width === w && canvas.height === h && buffer) return;
      canvas.width = w;
      canvas.height = h;
      buffer = ctx.createImageData(w, h);
    };

    const generateNoise = () => {
      if (!buffer) return;
      const data = buffer.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = Math.random() * 255;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
      }
      ctx.putImageData(buffer, 0, 0);
    };

    const animate = () => {
      frame++;
      if (visible && frame % 6 === 0) {
        generateNoise();
      }
      animationId = requestAnimationFrame(animate);
    };

    const onVisibility = () => {
      visible = !document.hidden;
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity,
        mixBlendMode: "overlay",
      }}
    />
  );
}
