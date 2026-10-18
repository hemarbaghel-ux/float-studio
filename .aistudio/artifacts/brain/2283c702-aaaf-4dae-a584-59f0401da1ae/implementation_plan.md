# Data Analyst Agent Workspace (OpenAI Agents API & Python Sandbox)

Build a dedicated **Data Analyst Agent Workspace** inside FLOAT AI powered by the OpenAI Agents API and server-side Python sandbox execution. Users can upload any CSV file or load curated sample datasets, inspect data schemas, ask complex questions, observe multi-step agent reasoning in real-time, interact with dynamic charts, and download comprehensive analytical reports in Markdown and HTML.

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your confirmed choices:
> 1. **Dedicated Workspace Location**: A dedicated **Data Analyst** tab in the FLOAT dashboard sidebar with full-width analytics workspace.
> 2. **Rich Visualizations & Reporting**: Interactive charts (line, bar, scatter, pie, distribution) paired with structured executive reports and 1-click downloads in Markdown and HTML.
> 3. **Model Selection**: Strictly standardizes on FLOAT's two frontier models:
>    - **GPT-6 Astra**: Rapid data profiling, fast transformations, and exploratory charting.
>    - **GPT-6.1 Sol**: Deep architectural reasoning, statistical modeling, correlation detection, and caveat formulation.
> 4. **Zero Client Secrets**: All agent credentials and sandbox execution remain protected on the backend.

- **Confirmed Decision 1**: Dedicated Data Analyst workspace tab in FLOAT.
- **Confirmed Decision 2**: Interactive charts with downloadable Markdown and HTML reports.

---

## 1. Overview & Core Concept

- **What It Does**:
  - Provides a dedicated workspace (`/dashboard/analyst` and sidebar tab) for data science and business analytics.
  - Users can drag & drop any `.csv` file or load pre-built sample datasets (e.g. *SaaS Customer Churn & MRR*, *Developer API Latency & Errors*, *Global E-Commerce Sales & Margin*).
  - An intelligent Data Analyst Agent autonomously profiles the dataset (dimensions, data types, nulls, summary statistics), executes Python code in a safe sandbox, generates analytical findings with caveat notes, and produces interactive charts.
  - Multi-turn conversational memory allows users to ask follow-up questions (e.g., *"Filter out customers with tenure < 3 months and re-run the churn correlation"*).
  - Users can export the complete analysis with embedded charts as a formatted **Markdown document** (`report.md`) or standalone **HTML report** (`report.html`).

- **Target Persona**: Developers, founders, and data teams using FLOAT who need immediate, reliable quantitative insights and production-grade reports without writing tedious pandas boilerplate by hand.

---

## 2. User Experience & Visual Design

- **Layout Structure**:
  - **Sidebar Navigation**: First-class **Data Analyst** item in `Dashboard.tsx` with a bar-chart/database icon.
  - **Split Workspace**:
    - **Left Panel (Dataset & Agent Chat)**:
      - CSV Upload dropzone & Sample Dataset picker chips.
      - Dataset Inspector (row/col count, column tags, quick statistics modal).
      - Conversational agent thread with step-by-step progress cards (`Inspecting data`, `Running Python sandbox`, `Synthesizing charts`, `Compiling report`).
      - Model switcher between **GPT-6 Astra** and **GPT-6.1 Sol**.
      - Follow-up query composer.
    - **Right Panel (Interactive Visualizations & Executive Report)**:
      - Interactive Chart Canvas (Bar, Line, Area, Scatter, Pie) with responsive tooltips and metric filters.
      - Executive Summary with KPI metric cards (e.g., Mean, Median, Anomaly Count, Trend Velocity).
      - Code Inspection Accordion: View the exact Python sandbox code executed by the agent and its standard output.
      - Caveats & Assumptions callout box (data skews, sample size warnings, confounding factors).
      - Export Bar: **Download Markdown Report**, **Download HTML Report**, and **Export Cleaned CSV**.
- **Dark Theme Consistency**:
  - Styled with FLOAT's signature slate/zinc palette (`#0F0F0B`, `#161B22`, `#21262D`, `#30363D`).
  - Emerald accents for completed steps, blue for execution streaming, violet for statistical insights.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Server-Side Python Sandbox vs Client Pyodide**:
  - *Chosen Approach*: Server-side Python sandbox runner (`/api/analyst/run`) with simulated/isolated execution environment, with transparent output streaming.
  - *Why*: Prevents freezing the browser on large CSVs, allows handling complex libraries (pandas, numpy, math), and keeps agent session state securely managed.
- **Decision 2: Interactive SVG/Canvas Charts vs Static Image Generation**:
  - *Chosen Approach*: Deliver structured JSON chart payloads from the agent that render into interactive React charts, with seamless SVG/PNG rasterization for exported HTML reports.
  - *Why*: Users can hover for precise figures, toggle data series, and drill into specific columns without waiting for image re-generation.
- **Decision 3: Curated Sample Datasets**:
  - *Chosen Approach*: Include 3 real-world sample datasets embedded in the app so users can click and run immediate analysis without needing their own CSV on hand.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│              FLOAT Data Analyst Workspace UI                │
│    (src/features/analyst/DataAnalystWorkspace.tsx)          │
│                                                             │
│  ┌─────────────────────────┐  ┌──────────────────────────┐  │
│  │ CSV Ingestion & History │  │ Interactive Chart Viewer │  │
│  │ Chat Thread & Composer  │  │ Executive Report Preview │  │
│  │ Step Progress Tracker   │  │ Markdown/HTML Exporter   │  │
│  └────────────┬────────────┘  └────────────▲─────────────┘  │
└───────────────┼────────────────────────────┼────────────────┘
                │ Upload CSV & Query         │ Streamed Charts, Stats,
                ▼                            │ Progress & Findings
┌────────────────────────────────────────────┴────────────────┐
│           Server AI Analyst & Python Sandbox Router         │
│                 (src/server/analystRouter.ts)               │
│                                                             │
│  - /api/analyst/upload -> Stores & profiles CSV metadata    │
│  - /api/analyst/query  -> Agent plan, Python execution, SSE │
│  - /api/analyst/export -> Compiles standalone HTML / MD     │
└─────────────────────────────────────────────────────────────┘
```

- **Core Files to Implement**:
  1. `src/features/analyst/types.ts`: Structured types for CSV profiles, agent steps, charts, reports, and messages.
  2. `src/features/analyst/sampleDatasets.ts`: Curated sample CSVs (SaaS Metrics, Developer Latency, E-Commerce).
  3. `src/features/analyst/DataAnalystWorkspace.tsx`: Main analyst workspace with split panel, upload area, and follow-up composer.
  4. `src/features/analyst/InteractiveCharts.tsx`: Interactive SVG chart engine (Bar, Line, Area, Scatter, Donut) with tooltips.
  5. `src/features/analyst/ReportViewer.tsx`: Formatted report view with KPI badges, caveats section, and 1-click Markdown/HTML downloaders.
  6. `src/server/analystRouter.ts`: Backend endpoints for agent execution, Python sandboxing, schema analysis, and multi-turn session persistence.
  7. `src/features/dashboard/Dashboard.tsx`: Add **Data Analyst** sidebar navigation item and render the workspace in `activeTab === 'analyst'`.

---

## 5. Step-by-Step Implementation Plan

1. **Step 1: Data Models & Sample Datasets**:
   - Define data structures for CSV columns, dataset summary, agent progress steps, chart definitions, and report payloads in `src/features/analyst/types.ts`.
   - Create 3 realistic sample datasets with pre-calculated sample queries in `src/features/analyst/sampleDatasets.ts`.

2. **Step 2: Server-Side Agent & Python Sandbox Router**:
   - Build `src/server/analystRouter.ts` supporting:
     - CSV parsing and schema extraction (headers, row counts, type inference, null counts, min/max/mean).
     - Python sandbox execution engine for data aggregations, distributions, and transformations.
     - OpenAI Agents API / Gemini fallback streaming with real-time step notifications (`inspecting` -> `coding` -> `executing` -> `charting` -> `reporting`).
     - Multi-turn query handler maintaining dataset state across questions.
   - Mount router into `src/server/app.ts`.

3. **Step 3: Interactive Visualizations & Chart Engine**:
   - Build `src/features/analyst/InteractiveCharts.tsx` providing responsive, dark-mode SVG charts with interactive tooltips, gridlines, axis formatting, and legend toggles.
   - Support Bar charts, Time-series Lines, Distribution histograms, and Category Donuts.

4. **Step 4: Executive Report & Export Generator**:
   - Build `src/features/analyst/ReportViewer.tsx` displaying:
     - Executive Findings & Key Metrics.
     - Embedded Interactive Charts.
     - Sandboxed Python Code & Terminal Outputs.
     - Caveats & Analytical Limitations.
     - Instant Download for `report.md` (Markdown) and `report.html` (self-contained styled HTML report).

5. **Step 5: Main Analyst Workspace & Dashboard Integration**:
   - Implement `src/features/analyst/DataAnalystWorkspace.tsx` combining dataset inspection, step-by-step progress cards, follow-up chat, and report viewing.
   - Update `src/features/dashboard/Dashboard.tsx` to add **Data Analyst** to the sidebar navigation and render `DataAnalystWorkspace` when active.
   - Support model switching between `GPT-6 Astra` and `GPT-6.1 Sol`.

6. **Step 6: Verification & End-to-End Testing**:
   - Verify CSV file upload and sample dataset instant loading.
   - Test Python execution and progress streaming.
   - Test multi-turn follow-up queries within the same dataset session.
   - Test Markdown and HTML report downloads.
   - Run linter and applet compilation.

---

## 6. Verification & Testing Strategy

- **Dataset Ingestion**: Test both custom CSV upload and 1-click sample dataset switching.
- **Agent Reasoning**: Verify step-by-step progress indicator reflects actual execution stages.
- **Interactive Charts**: Hover interactions, axis formatting, and dynamic recalculation on follow-up questions.
- **Exporting**: Verify exported HTML file opens standalone with embedded CSS and chart data, and Markdown file contains clean tables and findings.
- **Static Analysis**: Run `npm run lint` (`tsc --noEmit`) and `compile_applet`.
