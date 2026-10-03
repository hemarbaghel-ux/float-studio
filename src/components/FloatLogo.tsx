import React, { useState, useRef, useEffect } from 'react';
import { ANIMATION_DURATIONS } from '../lib/animations';

export interface FloatLogoProps {
  className?: string;
  size?: number | string;
  id?: string;
  animated?: boolean;
  trigger?: boolean;
  onMouseEnter?: React.MouseEventHandler<HTMLElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLElement>;
}

/**
 * Shared FLOAT Brand Logo Emblem
 * Premium minimalist folded ribbon symbol (symbol only, no text).
 * Attaches 'onMouseEnter' event listener to apply 'float-logo-emblem-spin'
 * to the logo emblem element, ensuring the animation only triggers on hover.
 */
export function FloatLogo({ 
  className = 'w-6 h-6', 
  size, 
  id = 'float-brand-logo',
  animated = true,
  trigger = false,
  onMouseEnter,
  onMouseLeave,
}: FloatLogoProps) {
  const [isSpinning, setIsSpinning] = useState(false);
  const hasLeftRef = useRef(true);

  // Check prefers-reduced-motion
  const isReducedMotion = () => {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  // External trigger (e.g. parent link hover)
  useEffect(() => {
    if (!animated || isReducedMotion()) return;

    if (trigger) {
      if (hasLeftRef.current && !isSpinning) {
        setIsSpinning(true);
        hasLeftRef.current = false;
      }
    } else {
      hasLeftRef.current = true;
    }
  }, [trigger, animated, isSpinning]);

  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (onMouseEnter) {
      onMouseEnter(e);
    }
    if (!animated || isReducedMotion()) return;

    if (hasLeftRef.current && !isSpinning) {
      setIsSpinning(true);
      hasLeftRef.current = false;
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    if (onMouseLeave) {
      onMouseLeave(e);
    }
    if (!trigger) {
      hasLeftRef.current = true;
    }
  };

  const handleAnimationEnd = () => {
    setIsSpinning(false);
  };

  // Safety fallback using central ANIMATION_DURATIONS token
  useEffect(() => {
    if (!isSpinning) return;
    const timer = setTimeout(() => {
      setIsSpinning(false);
    }, ANIMATION_DURATIONS.logoSpin + 50);
    return () => clearTimeout(timer);
  }, [isSpinning]);

  if (!animated) {
    return (
      <img
        id={id}
        src="/assets/float-logo.svg"
        alt="FLOAT"
        className={`inline-block object-contain select-none shrink-0 ${className}`}
        style={size ? { width: size, height: size } : undefined}
        referrerPolicy="no-referrer"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    );
  }

  return (
    <span
      className={`relative inline-flex items-center justify-center select-none shrink-0 ${className}`}
      style={size ? { width: size, height: size } : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Soft celestial blue glow aura behind the emblem */}
      <span
        className={`pointer-events-none absolute inset-0 -m-1.5 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.45)_0%,rgba(37,99,235,0.2)_45%,transparent_70%)] blur-[4px] ${
          isSpinning ? 'float-logo-aura-pulse' : 'opacity-0'
        }`}
        aria-hidden="true"
      />

      {/* Emblem SVG with onMouseEnter event listener and float-logo-emblem-spin class */}
      <img
        id={id}
        src="/assets/float-logo.svg"
        alt="FLOAT"
        className={`w-full h-full object-contain select-none shrink-0 ${
          isSpinning ? 'float-logo-emblem-spin' : ''
        }`}
        referrerPolicy="no-referrer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onAnimationEnd={handleAnimationEnd}
      />
    </span>
  );
}

export { FloatWordmark } from './FloatWordmark';
export type { FloatWordmarkProps } from './FloatWordmark';


