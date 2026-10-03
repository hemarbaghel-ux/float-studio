import React, { useState, useEffect } from 'react';

const PRINCIPLES = [
  {
    title: "From first thought to first commit.",
    subtext: "Structure complex requirements into clean, verifiable steps with autonomous assistance."
  },
  {
    title: "Make room for ambitious builds.",
    subtext: "Explore deep repositories and inspect full architecture without cognitive overload."
  },
  {
    title: "Build with clarity. Move with momentum.",
    subtext: "Review every proposed change in clear visual diffs before applying it to your codebase."
  },
  {
    title: "Your workspace. Your rules.",
    subtext: "Custom skills, team guidelines, and explicit model choices tailored to your engineering stack."
  }
];

interface FloatPrinciplesCarouselProps {
  className?: string;
}

export function FloatPrinciplesCarousel({ className = '' }: FloatPrinciplesCarouselProps) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleMotionChange);
    return () => mediaQuery.removeEventListener('change', handleMotionChange);
  }, []);

  useEffect(() => {
    if (reducedMotion || isPaused) return;

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % PRINCIPLES.length);
    }, 6000);

    return () => clearInterval(timer);
  }, [reducedMotion, isPaused]);

  const active = PRINCIPLES[index];

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`text-center max-w-sm px-4 select-none ${className}`}
      aria-live="polite"
    >
      <div className="min-h-[72px] flex flex-col items-center justify-center transition-opacity duration-500">
        <h3 className="text-sm font-medium text-white tracking-tight mb-1.5">
          {active.title}
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
          {active.subtext}
        </p>
      </div>

      {/* Progress Dots */}
      <div className="flex items-center justify-center gap-1.5 mt-3">
        {PRINCIPLES.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`h-1 rounded-full transition-all cursor-pointer ${
              i === index 
                ? 'w-5 bg-blue-500' 
                : 'w-1.5 bg-white/20 hover:bg-white/40'
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
