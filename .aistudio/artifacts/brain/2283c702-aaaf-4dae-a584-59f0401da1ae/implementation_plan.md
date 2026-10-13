# Cursor-Grade Professional Landing Page for FLOAT AI

Transform FLOAT's landing page into a world-class, developer-first product experience modeled on Cursor AI. The design combines an ultra-refined dark aesthetic, ambient radial spotlight illumination, interactive Composer and Tab autocomplete showcases, and crisp anti-slop typographic hierarchy.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following directions have been confirmed based on your preferences:
> - **Visual Theme**: Cursor-style deep dark canvas (`#090A0F` / `#0D0E12`) with subtle radial spotlight glow and monochromatic slate/zinc structural borders.
> - **Hero Capabilities Highlighted**: Interactive Composer multi-file agent editing paired with intelligent Tab ghost-text code completion.
> - **Primary Actions**: Primary "Download for macOS / Windows / Linux" with quick OS selector, flanked by secondary "Launch Web Workspace" direct browser entrance.
> - **Anti-Slop Discipline**: Elimination of generic purple pill capsules, mechanical comment headers (`// 01`), and decorative pulsing status dots, replaced with unboxed metadata and clean typographic separators.

---

### 1. Overview & Core Concept

- **What It Does**: Presents FLOAT AI as the premier AI-first code editor and workspace. Gives prospective developers an authentic, hands-on visual preview of autonomous multi-file editing (Composer), tab completion, semantic codebase context (`@files`, `@docs`), and built-in terminal agent execution.
- **Target Audience**: Professional software engineers, technical leads, and founders seeking an editor that accelerates development through deep codebase understanding and human-in-the-loop diff validation.
- **Key Value**: Immediate product credibility and visceral excitement through live, interactive code demos that look, feel, and behave like a high-performance native IDE.

---

### 2. User Experience & Visual Design

#### A. Visual Identity & Theme
- **Dominant Neutral Canvas (60%)**: Deep obsidian black (`#090A0F`) with subtle ambient spotlight cone (`radial-gradient(1000px circle at 50% 0%, rgba(120, 119, 198, 0.08), transparent 70%)`).
- **Structural Surfaces (30%)**: Sleek translucent dark cards (`bg-[#12131A]/70`) with subtle 1px hairline zinc borders (`border-white/[0.08]`), backdrop blur, and single-elevation depth.
- **High-Intent Accent Budget (10%)**: Crisp pure white primary CTAs (`bg-white text-black hover:bg-neutral-200`) and electric violet-indigo highlights on active diff lines and cursor prediction indicators.
- **Typography**: Clean display hierarchy (`Plus Jakarta Sans` or tight sans, `tracking-tight`), balanced headlines with `text-wrap: balance`, and monospace tabular numerals (`font-mono tabular-nums`) for editor line numbers, metrics, and shortcuts.

#### B. Page Section Architecture (Cursor Flow)
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Top Bar: Brand Wordmark  ───  Models | Products | Pricing | Docs  ───  Download │
├─────────────────────────────────────────────────────────────────────────┤
│ Hero: Spotlight Glow, Balanced Headline, "Download App" + "Web Workspace"│
│       Marquee Live Demo: Composer Multi-File Agent & Diff Reviewer      │
├─────────────────────────────────────────────────────────────────────────┤
│ Social Proof & Adoption: Trusted by engineers at modern engineering teams│
├─────────────────────────────────────────────────────────────────────────┤
│ Feature 01: Tab Autocomplete — Multi-line ghost prediction in real-time │
├─────────────────────────────────────────────────────────────────────────┤
│ Feature 02: Composer — Autonomous multi-file edits across the repo      │
├─────────────────────────────────────────────────────────────────────────┤
│ Feature 03: Codebase Indexing — Instant answers with @Files, @Docs, @Web│
├─────────────────────────────────────────────────────────────────────────┤
│ Feature 04: Terminal & CLI Agent — Auto-healing builds and test runs     │
├─────────────────────────────────────────────────────────────────────────┤
│ Feature 05: Privacy & Model Choice — Claude 3.7, GPT-4o, Gemini 2.5 Flash│
├─────────────────────────────────────────────────────────────────────────┤
│ Testimonials: Quantified developer impact (2.8x speedup, 0 context drop)│
├─────────────────────────────────────────────────────────────────────────┤
│ Final Call to Action: Minimalist download launcher with OS detection     │
├─────────────────────────────────────────────────────────────────────────┤
│ Quiet Footer: Brand, product links, status, and legal notices           │
└─────────────────────────────────────────────────────────────────────────┘
```

#### C. Interactive Components
1. **Interactive Hero Composer**: 
   - A realistic Cursor-like editor window displaying multi-file generation (e.g. `authMiddleware.ts`, `routeHandler.ts`), with real-time green insertion and red deletion diffs, file tabs, and an interactive "Accept all (Cmd+Enter)" or "Reject" bar.
2. **Tab Autocomplete Playground**: 
   - Interactive typing simulator where users can press `Tab` or click "Accept Suggestion" to watch ghosted predictions fill in complex algorithms instantly.
3. **Download Launcher**:
   - Platform auto-detection for macOS (Apple Silicon / Intel), Windows (x64), and Linux (.deb / .AppImage), with a one-click direct fallback to the web workspace.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Zero External Dependencies for Animations**
  - *Chosen Approach*: Pure Tailwind CSS animations (`transition-all`, keyframes) and React state transitions without adding bloated 3rd-party animation libraries.
  - *Why*: Ensures lightning-fast bundle performance, zero latency on user interactions, and robust reliability in AI Studio build environments.
- **Decision 2: Retain Complete Navigation and Store Integrations**
  - *Chosen Approach*: Preserve existing dropdowns (`ModelsDropdown`, `ProductsDropdown`, `PricingDropdown`, `ResourcesDropdown`, `LanguageDropdown`) and theme toggling while refining their shell to match the Cursor aesthetic.
  - *Why*: Honors the absolute rule to preserve working functionality while upgrading the aesthetic polish.
- **Decision 3: Isolated Container Scrolling for Terminal & Demos**
  - *Chosen Approach*: Maintain strict container-level auto-scrolling (`scrollTop = scrollHeight`) to prevent any page scroll hijacking.
  - *Why*: Completely eliminates the jumpy scroll bug resolved in the previous checkpoint.

---

### 4. Technical Architecture & Component Mapping

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             LandingPage.tsx                              │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Navigation Bar (Fixed, backdrop-blur, 3-zone contract, dropdowns)  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ HeroSection: Radial Spotlight + Balanced Headline + Dual CTAs     │  │
│  │   └─ InteractiveCodeHeroDemo: Multi-file Composer + Diff view      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ TabAutocompleteSection: Ghost text prediction interactive widget   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ CodebaseContextSection: Semantic search with @-tagging simulation   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ TerminalAgentSection: InteractiveTerminalShowcase (safe scroll)   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ ModelsAndPrivacySection: Multi-model switcher & zero-data training │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ TestimonialsSection & BottomCTA: Minimalist download launcher      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Footer: Single-elevation minimalist footer                         │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

### 5. Verification & Quality Standards

- **TypeScript Compilation**: `npm run lint` and `tsc --noEmit` pass with zero errors.
- **Production Build**: `npm run build` succeeds cleanly.
- **Viewport & Responsiveness**: Tested across mobile (375px), tablet (768px), and desktop (1440px).
- **Smooth Scrolling**: Zero jitter or window scroll hijacking when interacting with code demos or terminal runs.
