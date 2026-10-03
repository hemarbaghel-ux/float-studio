import React, { useEffect, useRef, useState } from 'react';

interface AstraCoreCanvasProps {
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  baseAlpha: number;
  alpha: number;
  color: string;
  orbitRadius: number;
  angle: number;
  speed: number;
  tilt: number;
  pulsePhase: number;
}

/**
 * AstraCoreCanvas
 * 
 * Luminous, celestial AI Core inspired by Google DeepMind's Astra & Gemini Live visual identity.
 * Features:
 * - Multi-layered harmonic orbital energy rings with perspective projection
 * - Volumetric celestial plasma core with pulsating radial glow
 * - Dynamic 3D stellar dust particle cloud with orbital mechanics and mouse parallax
 * - Smooth frame-rate animation with reduced-motion support and retina DPI scaling
 */
export function AstraCoreCanvas({ className = '' }: AstraCoreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Setup High-DPI canvas
    const handleResize = () => {
      if (!canvas || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2 for performance
      width = rect.width || 480;
      height = rect.height || 480;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
    };

    handleResize();
    const resizeObserver = new ResizeObserver(() => handleResize());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Stellar particle system
    const PARTICLE_COUNT = 90;
    const particles: Particle[] = [];
    const colors = [
      '#60A5FA', // Sky blue
      '#38BDF8', // Cyan
      '#818CF8', // Indigo
      '#A78BFA', // Purple
      '#93C5FD', // Light blue
      '#FFFFFF', // White star
    ];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const orbitRadius = 40 + Math.random() * 150;
      const angle = Math.random() * Math.PI * 2;
      const tilt = (Math.random() - 0.5) * Math.PI * 0.7;
      const speed = (0.003 + Math.random() * 0.007) * (Math.random() > 0.5 ? 1 : -1);

      particles.push({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 0.8 + Math.random() * 2.2,
        baseAlpha: 0.25 + Math.random() * 0.7,
        alpha: 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        orbitRadius,
        angle,
        speed,
        tilt,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    let time = 0;
    let currentTiltX = 0;
    let currentTiltY = 0;

    const render = () => {
      time += prefersReducedMotion ? 0.003 : 0.016;

      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) * 0.22;

      // Mouse Parallax easing
      currentTiltX += (mousePos.targetX - currentTiltX) * 0.06;
      currentTiltY += (mousePos.targetY - currentTiltY) * 0.06;

      const parallaxCenterX = centerX + currentTiltX * 22;
      const parallaxCenterY = centerY + currentTiltY * 22;

      // 1. Ambient outer cosmic glow
      const outerGlowRadius = baseRadius * 2.4;
      const outerGlow = ctx.createRadialGradient(
        parallaxCenterX,
        parallaxCenterY,
        baseRadius * 0.2,
        parallaxCenterX,
        parallaxCenterY,
        outerGlowRadius
      );
      outerGlow.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
      outerGlow.addColorStop(0.35, 'rgba(0, 112, 243, 0.14)');
      outerGlow.addColorStop(0.7, 'rgba(79, 70, 229, 0.06)');
      outerGlow.addColorStop(1, 'rgba(2, 4, 10, 0)');

      ctx.save();
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(parallaxCenterX, parallaxCenterY, outerGlowRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Orbital Harmonic Rings (3D Ellipses with rotation & depth)
      const RINGS_CONFIG = [
        { radiusX: baseRadius * 1.55, radiusY: baseRadius * 0.55, angle: time * 0.45 + 0.3, tilt: 0.65, stroke: 'rgba(56, 189, 248, 0.45)', width: 1.5 },
        { radiusX: baseRadius * 1.85, radiusY: baseRadius * 0.45, angle: -time * 0.3 + 1.2, tilt: -0.45, stroke: 'rgba(129, 140, 248, 0.35)', width: 1.2 },
        { radiusX: baseRadius * 1.25, radiusY: baseRadius * 0.65, angle: time * 0.25 - 0.8, tilt: 0.35, stroke: 'rgba(0, 112, 243, 0.5)', width: 1.8 },
      ];

      RINGS_CONFIG.forEach((ring) => {
        ctx.save();
        ctx.translate(parallaxCenterX, parallaxCenterY);
        ctx.rotate(ring.tilt + currentTiltX * 0.15);

        ctx.beginPath();
        // Draw an ellipse with harmonic wave modulation
        const segments = 64;
        for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * Math.PI * 2;
          const wave = Math.sin(theta * 3 + time * 2) * 3;
          const px = (ring.radiusX + wave) * Math.cos(theta);
          const py = (ring.radiusY + wave) * Math.sin(theta);
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();

        ctx.strokeStyle = ring.stroke;
        ctx.lineWidth = ring.width;
        ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.restore();
      });

      // 3. Volumetric Core (Celestial breathing sphere)
      const breathScale = 1 + Math.sin(time * 2.2) * 0.05 + (isHovered ? 0.08 : 0);
      const coreRadius = baseRadius * breathScale;

      // Core radial gradient
      const coreGrad = ctx.createRadialGradient(
        parallaxCenterX - coreRadius * 0.25,
        parallaxCenterY - coreRadius * 0.25,
        coreRadius * 0.05,
        parallaxCenterX,
        parallaxCenterY,
        coreRadius
      );
      coreGrad.addColorStop(0, '#FFFFFF');
      coreGrad.addColorStop(0.2, '#E0F2FE');
      coreGrad.addColorStop(0.45, '#38BDF8');
      coreGrad.addColorStop(0.75, '#0070F3');
      coreGrad.addColorStop(0.95, '#1E40AF');
      coreGrad.addColorStop(1, 'rgba(15, 23, 42, 0.85)');

      ctx.save();
      ctx.shadowColor = 'rgba(56, 189, 248, 0.85)';
      ctx.shadowBlur = 32;
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(parallaxCenterX, parallaxCenterY, coreRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Core energetic rim highlight (Fresnel effect)
      ctx.save();
      ctx.beginPath();
      ctx.arc(parallaxCenterX, parallaxCenterY, coreRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();

      // 4. Stellar Particles with orbital movement and depth
      particles.forEach((p) => {
        p.angle += p.speed;
        const currentRadius = p.orbitRadius * (1 + Math.sin(time + p.pulsePhase) * 0.08);

        // 3D position
        const cosAngle = Math.cos(p.angle);
        const sinAngle = Math.sin(p.angle);
        
        // Tilt projection
        const px = cosAngle * currentRadius;
        const py = sinAngle * currentRadius * Math.sin(p.tilt);
        const pz = sinAngle * currentRadius * Math.cos(p.tilt);

        // Depth perspective (z: -150 to +150)
        const perspective = (pz + 250) / 250;
        const screenX = parallaxCenterX + px * perspective;
        const screenY = parallaxCenterY + py * perspective;

        const alpha = Math.max(0.1, Math.min(1, p.baseAlpha * perspective * (0.8 + Math.sin(time * 3 + p.pulsePhase) * 0.2)));
        const renderSize = Math.max(0.6, p.size * perspective);

        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = pz > 0 ? 6 : 2;
        ctx.beginPath();
        ctx.arc(screenX, screenY, renderSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // 5. Central Starlight Flare (Twinkling cross-flare)
      const flareAlpha = 0.4 + Math.sin(time * 4) * 0.2;
      const flareLen = coreRadius * 1.35;

      ctx.save();
      ctx.translate(parallaxCenterX, parallaxCenterY);
      ctx.rotate(time * 0.1);
      ctx.strokeStyle = `rgba(255, 255, 255, ${flareAlpha})`;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = '#38BDF8';
      ctx.shadowBlur = 14;

      // Horizontal ray
      ctx.beginPath();
      ctx.moveTo(-flareLen, 0);
      ctx.lineTo(flareLen, 0);
      ctx.stroke();

      // Vertical ray
      ctx.beginPath();
      ctx.moveTo(0, -flareLen);
      ctx.lineTo(0, flareLen);
      ctx.stroke();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [mousePos.targetX, mousePos.targetY, isHovered]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    setMousePos((prev) => ({ ...prev, targetX: x, targetY: y }));
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setMousePos((prev) => ({ ...prev, targetX: 0, targetY: 0 }));
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative w-full h-full flex items-center justify-center select-none overflow-visible pointer-events-auto cursor-pointer ${className}`}
      aria-label="FLOAT AI Celestial Core"
      role="img"
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full max-w-full max-h-full object-contain drop-shadow-[0_0_40px_rgba(56,189,248,0.35)]"
      />
    </div>
  );
}
export default AstraCoreCanvas;
