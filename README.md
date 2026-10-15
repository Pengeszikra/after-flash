# after-flash — Pressure-Sensitive Vector Drawing & 2D Animation Studio

> A professional, tablet- and Android-optimized 2D vector drawing and frame-by-frame animation application powered by Google's open-weights Gemma AI palette generator, featuring an edge-to-edge canvas with Zen Mode UI toggle and transparent SVG/PNG export.

---

## 🌟 Key Features

### 1. 🤖 Google Gemma Open-Weights AI Palette Generator
* **Open-Weights Model Integration:** Native support for Google's open-weights Gemma model family (`gemma-4-26b-a4b-it` and `gemma-4-31b-it`), compliant with hackathon and competition requirements mandating open-weights AI models ([ai.google.dev/gemma](https://ai.google.dev/gemma/docs)).
* **Intelligent Color Harmonies:** Generates cohesive, professional 8- and 64-color studio palettes from any thematic prompt, art style, or mood (e.g., *"Cyberpunk Neon"*, *"Autumn Forest Twilight"*, *"Tokyo Rain"*, *"Pastel Dream"*).
* **Instant Application:** Generated colors can be applied straight to the 64-swatch studio grid, selected as the active drawing hue, or set as the canvas background with a single click.

### 2. 🖥️ Full-Screen Canvas & Toggleable UI (Zen Mode)
* **Edge-to-Edge Canvas:** The drawing surface spans the entire viewport (`100vw × 100vh`) and remains fully interactive and drawable beneath the floating header and timeline bars.
* **One-Click UI Toggle:** Seamlessly hide or reveal the toolbars using the header button or keyboard shortcuts (`Tab` or `H`).
* **Zen Mode:** Provides a clean, distraction-free environment maximizing your drawing canvas.
* **Floating Quick-Restore:** When the UI is hidden, a sleek, floating "Show UI" indicator and the `Esc` key allow instant restoration of the toolbars.

### 3. 💾 Transparent Background Export (SVG & PNG)
* **Transparent Background Option:** Dedicated toggle with a live checkerboard visual indicator to export drawings with transparent alpha or with the solid canvas background.
* **Vector SVG (.svg):** Clean, layered vector markup compatible with Adobe Illustrator, Figma, Inkscape, or web integration.
* **Raster PNG (.png):** High-resolution raster export preserving alpha transparency for game assets, stickers, sprites, or social media sharing.
* **Streamlined Export Dialog:** Removed unnecessary playback speed controls to focus entirely on clean, accurate frame export with one-click SVG clipboard copying.

### 4. 🎨 2-Layer Vector Drawing Engine
* **DRAW Layer (Top / Linework):** Dedicated layer for crisp linework, contours, and ink strokes.
* **COLOR Layer (Bottom / Fills):** Dedicated layer for fills, shading, and flat colors. Coloring automatically stays *beneath* your linework, preserving crisp outlines.
* **Layer-Aware Vector Eraser:** Only removes strokes on the currently active layer, protecting linework while erasing colors (and vice versa).
* **Physical Pressure Sensitivity:** Real-time pressure curve mapping using `perfect-freehand` with zero artificial smoothing lag for digital pens and styluses (Apple Pencil, Samsung S-Pen, Wacom).

### 5. 🎞️ Frame-by-Frame Animation & Timeline
* **Frame Operations:** Add new frames (`+`), duplicate/clone the active frame (`D`) with all strokes intact, and delete frames with full undo support.
* **One-Button Playback:** Compact play/pause toggle (`Space` bar) with configurable frame rate (1–30 FPS).
* **Onion Skinning:** Ghosted translucent preview of the previous keyframe for precise animation in-betweening.
* **Multilevel Undo/Redo:** Non-destructive history supporting full stroke-by-stroke undo and redo (`Ctrl + Z` / `Ctrl + Y`).

### 6. 📱 PWA & Android / Tablet Ready
* **Progressive Web App (PWA):** Fully offline capable with service worker caching. Installable directly to home screens and desktops via Chrome, Edge, and Android.
* **Instant Tablet Pairing:** Built-in QR code modal in the header allows instantaneous pairing with any mobile device or graphics tablet on the local network.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Tab` or `H` | **Toggle UI (Zen Mode / Full-screen Canvas)** |
| `Esc` | Restore UI when hidden |
| `Space` | Play / Pause Animation |
| `←` / `→` | Previous / Next Frame |
| `B` or `P` | Pen Tool |
| `E` | Eraser Tool |
| `L` | Switch Layer (DRAW ⇄ COLOR) |
| `D` | Clone Current Frame |
| `G` | Open Google Gemma AI Palette Generator |
| `Ctrl + Z` | Undo Stroke / Eraser action |
| `Ctrl + Y` | Redo Stroke / Eraser action |
| `?` | Toggle Help & Shortcuts Modal |

---

## 🛠️ Tech Stack & Architecture

* **Frontend:** React 19, TypeScript, Tailwind CSS, Lucide React icons
* **Vector Engine:** `perfect-freehand` real-time pressure curve sampling with SVG path rendering
* **Backend:** Express.js server integrated with Vite middleware (`server.ts`)
* **AI Integration:** `@google/genai` TypeScript SDK
  * **Primary Open-Weights Models:** Google Gemma (`gemma-4-26b-a4b-it`, `gemma-4-31b-it`)
  * **Fallback Engine:** `gemini-3.1-flash-lite` / algorithmic color harmony synthesizer for 100% uptime
* **PWA:** Web App Manifest (`manifest.webmanifest`), Service Worker offline caching

---

## 🚀 Getting Started

### Prerequisites
* Node.js 18+ installed on your system.

### Installation & Run

```bash
# 1. Install dependencies
npm install

# 2. Start the development server (runs on port 3000)
npm run dev

# 3. Build for production
npm run build

# 4. Type check & lint
npm run lint
```
