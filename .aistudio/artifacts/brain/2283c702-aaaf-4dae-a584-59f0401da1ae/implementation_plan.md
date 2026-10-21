# Implementation Plan: Landing Page Brand Logo & Wordmark Hover Animation

Ensure that hovering anywhere over the brand unit (either the logo icon or the "FLOAT" wordmark) on the landing page reliably triggers the complete 3D tilt, floating elevation, and monochrome glass sheen animation cycle.

---

## 1. User Alignment & Design Specification
- **Trigger Surface**: Hovering anywhere within the brand link (the logo emblem OR the "FLOAT" wordmark).
- **Animation Execution**: Full 3D perspective tilt, floating elevation, and diagonal monochrome sheen sweep.
- **Delivery Strategy**: Dual-channel triggering using both zero-latency CSS (`group:hover` / `:hover`) and React state (`trigger` prop / pointer events) to guarantee instant responsiveness without event swallowing or cursor dead-zones.

---

## 2. Proposed Architectural & Code Changes

### A. Landing Page Brand Link Integration (`src/features/landing/LandingPage.tsx`)
- Add `group` class to the navbar's brand anchor `<a>` element containing `<FloatLogo>` and `<FloatWordmark>`.
- Add local state tracking `brandHovered` with `onMouseEnter` and `onMouseLeave` on the anchor tag.
- Pass `trigger={brandHovered}` to `<FloatLogo>` so hovering the wordmark or anchor spacing triggers the emblem animation in sync.

### B. Pure CSS & Group-Hover Keyframe Wiring (`src/index.css`)
- Enhance the animation selectors so that `.group:hover .float-logo-emblem`, `:hover > .float-logo-emblem`, and programmatic `.float-logo-tilt-elevate` all activate the full animation smoothly.
- Ensure the sheen sweep (`float-logo-sheen`) and elevation aura (`float-logo-elevation-aura`) also trigger on `.group:hover`.
- Ensure animations gracefully complete their full cycle on hover and softly damp back to rest on leave.

### C. Logo Component Architecture (`src/components/FloatLogo.tsx`)
- Update `FloatLogo` container classes with `group-hover` responsive classes (`float-logo-interactive`).
- Keep the sheen overlay layer rendered in the DOM with CSS opacity transition so `:hover` / `group:hover` activates it immediately without requiring an initial React state tick.
- Maintain full `prefers-reduced-motion` compliance.

---

## 3. Verification Plan
1. **Interactive Hover Testing**:
   - Hover cursor directly over the logo icon on the landing page -> verify 3D tilt, elevation, and sheen sweep.
   - Hover cursor over the "FLOAT" text wordmark -> verify the logo animation triggers cleanly.
   - Hover cursor over the gap between the logo and wordmark -> verify uninterrupted animation.
2. **Reduced Motion Check**:
   - Ensure animation gracefully disables when `prefers-reduced-motion: reduce` is simulated.
3. **Build & Lint Verification**:
   - Run `npm run lint` (`tsc --noEmit`).
   - Run `npm run build` (`compile_applet`).
