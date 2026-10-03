import React, { useState, useEffect, useRef } from 'react';

interface FloatAuthHeroEmblemProps {
  size?: number;
  className?: string;
  isSuccess?: boolean;
}

/**
 * High-fidelity interactive FLOAT Emblem for Authentication Experience.
 * Preserves the authentic folded ribbon geometry of the FLOAT brand.
 * Includes subtle 3D pointer parallax, ambient illumination, entrance arrival,
 * and reduced-motion fallbacks.
 */
export function FloatAuthHeroEmblem({ 
  size = 180, 
  className = '', 
  isSuccess = false 
}: FloatAuthHeroEmblemProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleMotionChange);
    return () => mediaQuery.removeEventListener('change', handleMotionChange);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Subdued max 5 degree tilt for a restrained, professional feel
    const rotateY = ((e.clientX - centerX) / (rect.width / 2)) * 6;
    const rotateX = -((e.clientY - centerY) / (rect.height / 2)) * 6;

    setTilt({ x: rotateX, y: rotateY });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
  };

  const transformStyle = reducedMotion
    ? undefined
    : {
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale3d(${isHovered ? 1.03 : 1}, ${isHovered ? 1.03 : 1}, 1)`,
        transition: isHovered ? 'transform 0.15s ease-out' : 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative inline-flex items-center justify-center select-none cursor-pointer group ${className}`}
      style={{ width: size, height: size }}
      aria-label="FLOAT Emblem"
    >
      {/* Background radial aura glow */}
      <div 
        className={`pointer-events-none absolute inset-0 -m-8 rounded-full transition-opacity duration-700 ${
          isSuccess 
            ? 'opacity-100 bg-[radial-gradient(circle,rgba(56,189,248,0.5)_0%,rgba(37,99,235,0.3)_45%,transparent_70%)] blur-2xl scale-125'
            : isHovered
            ? 'opacity-85 bg-[radial-gradient(circle,rgba(56,189,248,0.35)_0%,rgba(37,99,235,0.18)_45%,transparent_70%)] blur-xl'
            : 'opacity-40 bg-[radial-gradient(circle,rgba(56,189,248,0.2)_0%,rgba(37,99,235,0.08)_50%,transparent_70%)] blur-lg'
        }`}
        aria-hidden="true"
      />

      {/* SVG Container with 3D Parallax */}
      <div
        className={`w-full h-full transition-opacity duration-700 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
        style={transformStyle}
      >
        <svg
          viewBox="0 0 512 512"
          width="100%"
          height="100%"
          className="w-full h-full overflow-visible drop-shadow-2xl"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Ambient outer bloom */}
            <filter id="authEmblemGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="16" result="blur1" />
              <feGaussianBlur stdDeviation="6" result="blur2" />
              <feColorMatrix 
                type="matrix" 
                values="
                  0.2 0 0 0 0.1
                  0 0.4 0 0 0.2
                  0 0 1.0 0 0.5
                  0 0 0 0.6 0" 
                result="glow" 
              />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Top Bar: brilliant glossy white / icy blue surface */}
            <linearGradient id="authTopBarGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#D1E5FF" />
              <stop offset="15%" stopColor="#E2EFFF" />
              <stop offset="40%" stopColor="#F4F8FF" />
              <stop offset="80%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#FFFFFF" />
            </linearGradient>

            {/* Middle Bar: bright icy blue to white surface */}
            <linearGradient id="authMidBarGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8CB6FF" />
              <stop offset="20%" stopColor="#B5D4FF" />
              <stop offset="55%" stopColor="#E8F2FF" />
              <stop offset="100%" stopColor="#FFFFFF" />
            </linearGradient>

            {/* Bottom Tail Ribbon: electric royal blue to violet */}
            <linearGradient id="authBottomTailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1E40AF" />
              <stop offset="25%" stopColor="#2563EB" />
              <stop offset="55%" stopColor="#3B82F6" />
              <stop offset="80%" stopColor="#6366F1" />
              <stop offset="100%" stopColor={isSuccess ? '#10B981' : isHovered ? '#93C5FD' : '#818CF8'} />
            </linearGradient>

            {/* Inner fold deep dark shadow */}
            <linearGradient id="authInnerShadowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#080E24" />
              <stop offset="40%" stopColor="#0F1E4A" />
              <stop offset="75%" stopColor="#1D3BB5" />
              <stop offset="100%" stopColor="#3B6CF6" />
            </linearGradient>

            {/* Specular highlight along top bar upper ridge */}
            <linearGradient id="authTopRidgeHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.95} />
              <stop offset="70%" stopColor="#FFFFFF" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.3} />
            </linearGradient>

            {/* Specular highlight along middle bar upper ridge */}
            <linearGradient id="authMidRidgeHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.9} />
              <stop offset="70%" stopColor="#FFFFFF" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.2} />
            </linearGradient>

            {/* Neon rim light on bottom tail */}
            <linearGradient id="authBottomNeonRim" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#93C5FD" stopOpacity={1} />
              <stop offset="60%" stopColor="#60A5FA" stopOpacity={isHovered ? 0.95 : 0.8} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.1} />
            </linearGradient>

            {/* Soft diffuse halo behind the emblem */}
            <radialGradient id="authHaloGrad" cx="45%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={isSuccess ? 0.35 : isHovered ? 0.28 : 0.2} />
              <stop offset="50%" stopColor="#4F46E5" stopOpacity={isSuccess ? 0.15 : isHovered ? 0.12 : 0.08} />
              <stop offset="100%" stopColor="#000000" stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* Ambient blue halo */}
          <circle cx="256" cy="256" r="210" fill="url(#authHaloGrad)" />

          {/* Main Symbol (Ribbon F) with subtle outer neon bloom */}
          <g filter="url(#authEmblemGlow)">
            {/* 1. Inner dark recess fold (behind middle bar and bottom tail) */}
            <path
              d="M 166 268
                 C 162 290, 164 316, 174 340
                 C 188 322, 218 296, 268 266
                 L 242 278
                 C 198 298, 178 318, 166 340 Z"
              fill="url(#authInnerShadowGrad)"
            />

            {/* 2. Bottom Folded Tail (Electric blue/violet facet pointing down-right) */}
            <path
              d="M 167 339
                 C 170 354, 182 368, 200 378
                 L 258 408
                 C 270 414, 276 409, 276 397
                 L 276 328
                 L 236 307
                 C 202 322, 178 333, 167 339 Z"
              fill="url(#authBottomTailGrad)"
              className="transition-all duration-300"
            />

            {/* Bottom Tail Neon Glow Rim */}
            <path
              d="M 168 344
                 C 178 358, 192 370, 206 378
                 L 258 405
                 C 268 410, 274 406, 274 397
                 L 274 338"
              stroke="url(#authBottomNeonRim)"
              strokeWidth={isHovered ? 4.5 : 3.5}
              strokeLinecap="round"
              fill="none"
              className="transition-all duration-300"
            />

            {/* 3. Middle Bar (Icy blue to white rounded ribbon arm) */}
            <path
              d="M 166 268
                 C 168 252, 184 242, 210 230
                 L 330 178
                 C 346 171, 355 178, 356 193
                 C 357 208, 348 222, 332 229
                 L 216 280
                 C 188 292, 172 312, 167 339
                 C 162 316, 160 290, 166 268 Z"
              fill="url(#authMidBarGrad)"
            />

            {/* Middle Bar Ridge Specular Highlight */}
            <path
              d="M 206 232
                 L 330 177
                 C 344 171, 352 176, 354 189"
              stroke="url(#authMidRidgeHighlight)"
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
            />

            {/* 4. Top Bar & Left Loop (White/icy-blue ribbon arm) */}
            <path
              d="M 166 268
                 C 160 240, 158 210, 160 185
                 C 163 155, 178 138, 202 126
                 L 326 78
                 C 342 71, 351 78, 352 93
                 C 353 108, 344 122, 328 129
                 L 204 180
                 C 182 189, 170 205, 166 230
                 L 166 268 Z"
              fill="url(#authTopBarGrad)"
            />

            {/* Top Bar Ridge Specular Highlight */}
            <path
              d="M 198 128
                 L 326 77
                 C 340 71, 348 76, 350 89"
              stroke="url(#authTopRidgeHighlight)"
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />

            {/* Left Outer Curve Continuous Highlight */}
            <path
              d="M 166 268
                 C 160 240, 158 210, 160 185
                 C 163 155, 178 138, 202 126"
              stroke="#FFFFFF"
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
              opacity={0.9}
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
