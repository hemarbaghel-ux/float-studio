/**
 * FLOAT Central Animation & Motion Configuration
 * 
 * Provides unified constants for animation durations and cubic-bezier easing curves
 * across FLOAT's UI components, replacing ad-hoc hardcoded values.
 */

export const ANIMATION_DURATIONS = {
  /** 100ms - Instant feedback for clicks, toggles, micro-indicators */
  instant: 100,
  /** 150ms - Fast feedback for button hovers, badges, tooltips */
  fast: 150,
  /** 200ms - Standard routine feedback (WCAG / Frontend Design Constitution limit) */
  normal: 200,
  /** 300ms - Moderate transitions for dropdown menus, tabs, cards */
  moderate: 300,
  /** 500ms - Slow transitions for modals, sidebars, expanded panels */
  slow: 500,
  /** 600ms - Subtle 360-degree rotation animation for FLOAT emblem on hover and active state */
  logoRotate360: 600,
  /** 600ms - Refined hover animation duration for FLOAT emblem */
  logoHover: 600,
  /** 600ms - Spin duration for FLOAT logo */
  logoSpin: 600,
} as const;

export type AnimationDurationKey = keyof typeof ANIMATION_DURATIONS;

/**
 * Standard cubic-bezier easing curves
 */
export const ANIMATION_EASINGS = {
  /** Fast attack with smooth settling curve (ideal for micro-interactions and 3D tilts) */
  settle: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** 3D elevation and tilt easing curve with soft natural damping */
  tilt: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** Gentle decelerating rotation curve for subtle 360-degree logo spin */
  rotate: 'cubic-bezier(0.22, 1, 0.36, 1)',
  /** Standard smooth ease-in-out curve for natural, balanced motion */
  smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Decelerating exponential exit / smooth drawer arrival */
  outExpo: 'cubic-bezier(0.19, 1, 0.22, 1)',
  /** Standard symmetrical ease-in-out */
  inOut: 'cubic-bezier(0.42, 0, 0.58, 1)',
  /** Linear curve for uniform progress or continuous spinners */
  linear: 'linear',
} as const;

export type AnimationEasingKey = keyof typeof ANIMATION_EASINGS;

/**
 * Curated animation presets combining duration and easing
 */
export const ANIMATION_PRESETS = {
  logoRotate360: {
    duration: 600,
    durationMs: '600ms',
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    css: '600ms cubic-bezier(0.22, 1, 0.36, 1)',
  },
  logoHoverTilt: {
    duration: 380,
    durationMs: '380ms',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    css: '380ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
  logoHoverSpin: {
    duration: 600,
    durationMs: '600ms',
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    css: '600ms cubic-bezier(0.22, 1, 0.36, 1)',
  },
  microInteraction: {
    duration: ANIMATION_DURATIONS.fast,
    durationMs: `${ANIMATION_DURATIONS.fast}ms`,
    easing: ANIMATION_EASINGS.settle,
    css: `${ANIMATION_DURATIONS.fast}ms ${ANIMATION_EASINGS.settle}`,
  },
  modalFade: {
    duration: ANIMATION_DURATIONS.normal,
    durationMs: `${ANIMATION_DURATIONS.normal}ms`,
    easing: ANIMATION_EASINGS.smooth,
    css: `${ANIMATION_DURATIONS.normal}ms ${ANIMATION_EASINGS.smooth}`,
  },
  drawerSlide: {
    duration: ANIMATION_DURATIONS.moderate,
    durationMs: `${ANIMATION_DURATIONS.moderate}ms`,
    easing: ANIMATION_EASINGS.outExpo,
    css: `${ANIMATION_DURATIONS.moderate}ms ${ANIMATION_EASINGS.outExpo}`,
  },
} as const;

/**
 * CSS custom property tokens corresponding to :root motion variables
 */
export const MOTION_CSS_VARS = {
  durationInstant: 'var(--float-duration-instant)',
  durationFast: 'var(--float-duration-fast)',
  durationNormal: 'var(--float-duration-normal)',
  durationModerate: 'var(--float-duration-moderate)',
  durationSlow: 'var(--float-duration-slow)',
  durationLogoSpin: 'var(--float-duration-logo-spin)',
  durationLogoRotate: 'var(--float-duration-logo-rotate)',

  easeSmooth: 'var(--float-ease-smooth)',
  easeSettle: 'var(--float-ease-settle)',
  easeTilt: 'var(--float-ease-tilt)',
  easeRotate: 'var(--float-ease-rotate)',
  easeOutExpo: 'var(--float-ease-out-expo)',
  easeInOut: 'var(--float-ease-in-out)',
} as const;
