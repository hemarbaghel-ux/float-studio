import React, { useState, useRef, useEffect } from 'react';
import { ANIMATION_DURATIONS } from '../lib/animations';

export interface FloatLogoProps {
  className?: string;
  size?: number | string;
  id?: string;
  animated?: boolean;
  trigger?: boolean;
  /** Active state for FLOAT logo triggering subtle 360-degree rotation */
  active?: boolean;
  onMouseEnter?: React.MouseEventHandler<HTMLElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLElement>;
  onFocus?: React.FocusEventHandler<HTMLElement>;
  onBlur?: React.FocusEventHandler<HTMLElement>;
}

/**
 * Shared FLOAT Brand Logo Emblem
 * Premium minimalist folded ribbon symbol (symbol only, no text).
 * Interactive subtle 360-degree rotation animation, micro-elevation, and monochromatic glass sheen on active and hover state.
 */
export function FloatLogo({ 
  className = 'w-6 h-6', 
  size, 
  id = 'float-brand-logo',
  animated = true,
  trigger = false,
  active = false,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: FloatLogoProps) {
  const [isActive, setIsActive] = useState(false);
  const [spinKey, setSpinKey] = useState(0);
  const hasLeftRef = useRef(true);

  // Check prefers-reduced-motion
  const isReducedMotion = () => {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  // External trigger or active prop (e.g. parent link hover or focus)
  useEffect(() => {
    if (!animated || isReducedMotion()) return;

    if (trigger || active) {
      if (hasLeftRef.current && !isActive) {
        setIsActive(true);
        setSpinKey((prev) => prev + 1);
        hasLeftRef.current = false;
      }
    } else {
      setIsActive(false);
      hasLeftRef.current = true;
    }
  }, [trigger, active, animated, isActive]);

  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (onMouseEnter) onMouseEnter(e);
    if (!animated || isReducedMotion()) return;

    if (hasLeftRef.current && !isActive) {
      setIsActive(true);
      setSpinKey((prev) => prev + 1);
      hasLeftRef.current = false;
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    if (onMouseLeave) onMouseLeave(e);
    if (!trigger && !active) {
      setIsActive(false);
      hasLeftRef.current = true;
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLElement>) => {
    if (onFocus) onFocus(e);
    if (!animated || isReducedMotion()) return;
    setIsActive(true);
    setSpinKey((prev) => prev + 1);
  };

  const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
    if (onBlur) onBlur(e);
    if (!trigger && !active) {
      setIsActive(false);
      hasLeftRef.current = true;
    }
  };

  const handleAnimationEnd = () => {
    // Settles cleanly at 360 degrees
  };

  // Automatic cycle settling duration fallback
  useEffect(() => {
    if (!isActive || trigger || active) return;
    const timer = setTimeout(() => {
      // Natural cycle duration
    }, ANIMATION_DURATIONS.logoRotate360 + 50);
    return () => clearTimeout(timer);
  }, [isActive, trigger, active]);

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
      data-active={isActive || active ? 'true' : 'false'}
      className={`float-logo-container float-logo-interactive relative inline-flex items-center justify-center select-none shrink-0 [perspective:400px] [transform-style:preserve-3d] cursor-pointer ${
        isActive || active ? 'is-active float-logo-active' : ''
      } ${className}`}
      style={size ? { width: size, height: size } : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      tabIndex={-1}
    >
      {/* Refined monochrome depth elevation aura */}
      <span
        className={`float-logo-aura-sweep pointer-events-none absolute inset-0 -m-1 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.18)_0%,rgba(0,0,0,0.15)_60%,transparent_75%)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.12)_0%,rgba(0,0,0,0.35)_60%,transparent_75%)] blur-[3px] transition-opacity duration-300 ${
          isActive || active ? 'float-logo-elevation-aura opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />

      {/* Emblem Container with Subtle 360-degree Rotation */}
      <span
        key={spinKey}
        data-active={isActive || active ? 'true' : 'false'}
        className={`float-logo-emblem relative w-full h-full inline-flex items-center justify-center overflow-hidden rounded-md transition-all duration-300 ease-out ${
          isActive || active ? 'float-logo-rotate-360 float-logo-tilt-elevate is-active' : 'scale-100 rotate-0 translate-y-0'
        }`}
      >
        {/* Emblem SVG Vector */}
        <img
          id={id}
          src="/assets/float-logo.svg"
          alt="FLOAT"
          className="w-full h-full object-contain select-none shrink-0"
          referrerPolicy="no-referrer"
          onAnimationEnd={handleAnimationEnd}
        />

        {/* Diagonal Monochrome Glass Sheen Sweep */}
        <span
          className={`float-logo-sheen-sweep pointer-events-none absolute inset-0 -inset-x-2 bg-gradient-to-r from-transparent via-white/35 dark:via-white/45 to-transparent mix-blend-overlay ${
            isActive || active ? 'float-logo-sheen opacity-100' : 'opacity-0'
          }`}
          aria-hidden="true"
        />
      </span>
    </span>
  );
}

export { FloatWordmark } from './FloatWordmark';
export type { FloatWordmarkProps } from './FloatWordmark';
