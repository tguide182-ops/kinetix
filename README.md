# Kinetix | Production AI Image & Video Creative Studio

![Kinetix AI Studio](https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80)

Kinetix is a creative production platform designed for orchestrating generative image and video workflows. Built with an architecture inspired by modern high-end creative suites (Google Flow, Ideogram, Seedance), Kinetix offers multi-shot sequence direction, visual reference anchoring, node-based flow graphs, combinatorial prompt matrices, and asynchronous queue management.

---

## Key Features

### 1. Image & Video Generation Suite
- **Image Generation:** Single prompt synthesis and parallel multi-output batches.
- **Text-to-Video & Image-to-Video:** Powered by Google Veo generative video models and Gemini models.
- **Video Extensions:** Extend existing video assets by 7 seconds with temporal continuity.
- **Variations & Inpainting:** Generate stylistic variations and targeted modifications from any asset.

### 2. Multi-Shot Sequence Builder (~30s Continuous Video)
- **Continuity Engine:** Automatically passes the final keyframe of Shot $N$ as the initial conditioning frame of Shot $N+1$.
- **Timeline Strip:** Visual director timeline tracking total calculated runtime and segment status.
- **Granular Regeneration:** Re-render individual shots without re-running or invalidating the rest of the sequence.

### 3. Flow Creative Graph
- **Node-Based Canvas:** Visual workspace with typed nodes:
  - `Prompt Node`: Directive composition and styling anchors
  - `Image Node`: Keyframe synthesis with aspect ratio controls
  - `Video Node`: Motion clip synthesis and camera vector controls
  - `Reference Node`: Character, style, and object consistency anchors
  - `Extension Node`: Temporal timeline extensions
- **Interactive Connections:** Smooth SVG Bézier curves with interactive drag-and-drop ports.
- **Persistence & Export:** Save and export flow graphs as JSON specifications.

### 4. Combinatorial Prompt Matrix
- **Parametric Variations:** Define replacement variables (e.g. `{character}`, `{location}`, `{lighting}`).
- **Cartesian Product Generator:** Instantly resolve all combination permutations.
- **Selective Dispatch:** Inspect, toggle, and batch-dispatch selected variations directly to the generation queue.

### 5. Asynchronous Queue & Observability
- **Non-Blocking Background Tasks:** Continue working, modifying prompts, and managing assets while jobs render.
- **Real-Time Stage Telemetry:** Live progress indicators, status stages, and estimated credit costs.
- **Granular Control:** Cancel queued tasks to refund credits, or retry failed jobs individually.

### 6. Studio Asset Library & Lightbox Theater
- **Asset Isolation:** Workspaces and projects maintain isolated asset libraries and histories.
- **Inspection Theater:** High-resolution zoom, video scrubbers, prompt copying, and one-click downstream generation (*Animate to Video*, *Extend*, *Variations*, *Anchor as Reference*).
- **Multi-Select Bulk Operations:** Bulk download and delete.

### 7. Studio Credits & Multi-User Support
- **Credit Allocation:** Granular transaction ledger tracking deductions, refunds, and top-ups.
- **Role & Tier Management:** Built-in multi-user switching to verify multi-tenant data isolation.

---

## Tech Stack & Architecture

- **Client:** React 19, TypeScript, Tailwind CSS v4, Lucide React, Motion
- **Server:** Node.js, Express, `tsx`
- **Development Tooling:** Vite with middleware mounting
- **Generative AI:** `@google/genai` TypeScript SDK (abstracted via `server/modelProvider.ts`)
- **Typography:** Plus Jakarta Sans & JetBrains Mono

---

## Quick Start Guide

### Prerequisites
- Node.js 20.x or higher
- npm or bun
- A Google Gemini API Key ([Google AI Studio](https://aistudio.google.com/))

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/kinetix-studio.git
cd kinetix-studio
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and add your API key:
```env
GEMINI_API_KEY="your-gemini-api-key-here"
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Build for Production
```bash
npm run build
npm start
```

---

## Project Structure

```
├── server/                    # Backend services & database
│   ├── db.ts                  # In-memory & persistent data store
│   ├── modelProvider.ts       # Model abstraction layer (@google/genai SDK)
│   └── queue.ts               # Async generation job queue manager
├── src/
│   ├── components/
│   │   ├── assets/            # Media library & lightbox modal
│   │   ├── batch/             # Prompt matrix laboratory
│   │   ├── create/            # Main studio directive canvas & controls
│   │   ├── flow/              # Visual node-based creative graph
│   │   ├── home/              # Dashboard hub & presets
│   │   ├── layout/            # Sidebar, Header, Queue Drawer
│   │   ├── projects/          # Project workspaces
│   │   ├── sequence/          # 30-second multi-shot director builder
│   │   └── settings/          # Telemetry, credit ledger & user switcher
│   ├── context/               # Global state & AppContext
│   ├── services/              # API client
│   ├── types/                 # Domain TypeScript interfaces
│   ├── App.tsx                # Main application container
│   ├── index.css              # Design tokens & styles
│   └── main.tsx               # Client entry point
├── server.ts                  # Express + Vite server entry point
├── metadata.json              # AI Studio applet metadata
├── package.json
└── vite.config.ts
```

---

## License
Apache-2.0
