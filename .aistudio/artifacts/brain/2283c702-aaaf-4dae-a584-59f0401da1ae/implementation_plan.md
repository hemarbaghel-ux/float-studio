# Exclusive GPT-6 Frontier Catalog: GPT-6 Astra & GPT-6.1 Sol

Prune FLOAT AI's model catalog, selector dropdowns, agent configurations, and provider routing to exclusively support OpenAI's next-generation frontier models: **GPT-6 Astra (Preview)** and **GPT-6.1 Sol (Preview)**. All legacy models (GPT-4o, GPT-4o-mini, o1, o3-mini, GPT-4.5) and the free tier (FLOAT Basic) are removed, establishing GPT-6.1 Sol as the workspace default.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions have been confirmed through your clarifying answers:
> - **Workspace Default Model**: Set to `GPT-6.1 Sol (Preview)` across the workspace, dashboard, inline editor, evals, and agent defaults.
> - **Free Tier Model Removal**: `FLOAT Basic` is completely removed. Only `GPT-6 Astra` and `GPT-6.1 Sol` are retained in the application.
> - **Catalog & Benchmark Filtering**: All comparison tables, benchmark intelligence views, pricing calculators, and model catalogs are filtered exclusively to `GPT-6 Astra` and `GPT-6.1 Sol`.

---

### 1. Overview & Core Concept

- **What It Does**: Streamlines the entire FLOAT AI developer platform to focus strictly on two frontier models:
  1. **GPT-6.1 Sol (Preview)**: Flagship frontier reasoning model featuring 1,000,000-token context, deep multi-step architectural reasoning, and autonomous code synthesis.
  2. **GPT-6 Astra (Preview)**: Autonomous cloud execution agent model featuring 1,000,000-token context, Codex execution server integration, and fast multi-file refactoring.
- **Target Audience**: Software engineers and technical leaders working on complex codebases who want frontier intelligence without distraction from legacy model options.
- **Key Value**: Clean, predictable developer UX with zero model confusion. Every model selector, agent prompt, and benchmark visualization consistently reflects only the two active models.

---

### 2. User Experience & Visual Design

#### A. Model Selector & Workspace Posture
- **Restrained Monochromatic Design**: In accordance with the FLOAT design system, the model selectors in the Dashboard composer, Chat workspace, Editor assistant, and Activity bar retain the clean developer aesthetic.
- **Model Options in Selectors**:
  - **GPT-6.1 Sol (Preview)** [Default]: Tagged as Frontier Reasoning, 1M Context, `preview-sol`.
  - **GPT-6 Astra (Preview)**: Tagged as Cloud Agent, 1M Context, `preview-rt_7k2m`.
- **Zero-Pill Metadata**: Model badges in dropdowns and tables display unboxed metadata with typographic separators (`1M context · Reasoning · Fast`).
- **Seamless Switcher**: Quick toggle between GPT-6.1 Sol and GPT-6 Astra with instant state synchronization in Zustand (`useAIStore`).

#### B. Benchmark & Intelligence Views
- **Clean Comparison Matrix**: The Model Intelligence Hub (`/models`), SWE-bench Verified comparisons, HumanEval evaluations, GPQA Diamond scores, and MATH-500 charts display side-by-side performance for GPT-6 Astra and GPT-6.1 Sol only.
- **Cost Calculator**: Pre-configured to calculate projected token usage for GPT-6.1 Sol ($3.50 input / $14.00 output per 1M) and GPT-6 Astra ($3.00 input / $12.00 output per 1M).

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Upstream Execution Fallback Strategy**
  - *Chosen Approach*: Maintain server-side OpenAI provider fallback mapping in `OpenAIAdapter` (`gpt-6-astra` and `gpt-6.1-sol` route safely to the verified OpenAI client upstream if remote preview endpoints return 404/429/50x).
  - *Why*: Ensures the application never crashes during live code editing or chat sessions while presenting the authentic GPT-6 preview interfaces to the user.
- **Decision 2: Global State Persistence Migration**
  - *Chosen Approach*: Sanitize `localStorage` on initial store boot. If a user previously had `'gpt-4o'` or `'float-basic'` cached in `float_selected_model`, automatically migrate them to `'gpt-6.1-sol'`.
  - *Why*: Prevents runtime errors or blank selector states for returning sessions with stale cached model IDs.
- **Decision 3: Complete Agent Uniformity**
  - *Chosen Approach*: Update all 8 system agents (Main Agent, Coder, Reviewer, Planner, Explorer, Debugger, UI Agent, Astra Cloud Agent) to use `GPT-6.1 Sol` as their default model and restrict their allowed model lists to `['gpt-6.1-sol', 'gpt-6-astra']`.
  - *Why*: Guarantees that agent switches never attempt to load an evicted legacy model.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FLOAT AI Model Architecture                     │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Frontend UI Surfaces                                                 │
│   ┌────────────────────┐   ┌───────────────────┐   ┌────────────────┐  │
│   │ Dashboard Composer │   │ Chat / AI Panel   │   │ Models Hub     │  │
│   │ (GPT-6.1 Sol def)  │   │ (Selector: 2 opts)│   │ (Side-by-side) │  │
│   └─────────┬──────────┘   └─────────┬─────────┘   └───────┬────────┘  │
│             │                        │                     │           │
│             ▼                        ▼                     ▼           │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │              Client State: useAIStore (Zustand)                │   │
│   │   • models: [GPT-6.1 Sol, GPT-6 Astra]                         │   │
│   │   • selectedModel: 'gpt-6.1-sol'                               │   │
│   │   • validModels: ['gpt-6.1-sol', 'gpt-6-astra']                │   │
│   └──────────────────────────────┬─────────────────────────────────┘   │
│                                  │ HTTP /api/ai/chat                   │
│                                  ▼                                     │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │           Server Model Router (src/server/providers/)          │   │
│   │   • Route definitions: 'gpt-6.1-sol', 'gpt-6-astra', 'auto'    │   │
│   │   • Default resolution: 'auto' -> 'gpt-6.1-sol'                │   │
│   │   • Strict rejection of any non-whitelisted model IDs          │   │
│   └──────────────────────────────┬─────────────────────────────────┘   │
│                                  │                                     │
│                                  ▼                                     │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │             OpenAI Provider Adapter (Server-Side)              │   │
│   │   • Execution with authenticated OPENAI_API_KEY                │   │
│   │   • Upstream mapping for preview execution reliability         │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

#### Step-by-Step Implementation Sequence

1. **Prune Verified Models (`src/data/verifiedModels.ts`)**:
   - Remove `float-basic`.
   - Preserve strictly `gpt-6-astra` and `gpt-6.1-sol` with complete metadata, pricing, capabilities, and preview cloud agent configs.

2. **Streamline Dashboard Models (`src/features/dashboard/dashboardModels.ts`)**:
   - Evict legacy models (`gpt-4o`, `gpt-4o-mini`, `o1`, `o1-mini`, `o3-mini`, `gpt-4.5-preview`, `gpt-4-turbo`, `chatgpt-4o-latest`, `auto`, `float-basic`).
   - Populate with `gpt-6.1-sol` (default) and `gpt-6-astra`.

3. **Update Agent Registry (`src/features/ai/registry.ts`)**:
   - Set all 8 agents' `defaultModel` to `'gpt-6.1-sol'`.
   - Set `allowedModels` strictly to `['gpt-6.1-sol', 'gpt-6-astra']`.
   - Set `fallbackModel` to `'gpt-6-astra'`.

4. **Synchronize Store Defaults (`src/store/aiStore.ts`)**:
   - Update `VALID_FLOAT_MODELS` to `['gpt-6.1-sol', 'gpt-6-astra']`.
   - Set initial selected model to `'gpt-6.1-sol'` with automatic localStorage fallback migration.
   - Update `favoriteModels`, `recentModels`, and `preferences` to reflect the two models.

5. **Server Provider Routing (`src/server/providers/router.ts` & `src/server/agent.ts`)**:
   - Restrict `modelRoutes` allowlist strictly to `auto`, `gpt-6.1-sol`, `gpt-6-astra` (and valid aliases `gpt-6.1`, `gpt-6-sol`).
   - Update `resolveModelId` default resolution from `gpt-4o` to `gpt-6.1-sol`.
   - Update `src/server/agent.ts` to register only the two models.

6. **UI Default Consistency**:
   - Update initial state in `Dashboard.tsx`, `ModelCostCalculator.tsx`, `CreateEvalDialog.tsx`, `AgentRegistryContext.tsx`, and `AIPanel.tsx` to use `'gpt-6.1-sol'`.

7. **Verification & Testing**:
   - Run `lint_applet` and `compile_applet` to confirm clean compilation.
   - Verify model selector options, default selection, chat requests, and benchmark catalog rendering.
