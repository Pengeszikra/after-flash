import { getStroke } from 'perfect-freehand';

export interface Point {
  x: number;
  y: number;
  pressure: number;
}

export interface VectorStroke {
  id: string;
  points: [number, number, number][]; // [x, y, pressure]
  pathData: string;
  baseSize: number;
  color: string;
  layer?: 'draw' | 'color';
}

export type HistoryStep =
  | { type: 'add'; stroke: VectorStroke }
  | { type: 'remove'; strokes: VectorStroke[] };

export interface Frame {
  id: string;
  name: string;
  strokes: VectorStroke[];
  undoStack: VectorStroke[];
  history?: HistoryStep[];
  future?: HistoryStep[];
}

/**
 * Fast conversion of outline points into a smooth SVG Path string (zero latency)
 */
export function getSvgPathFromStroke(stroke: number[][]): string {
  const len = stroke.length;
  if (len === 0) return '';
  if (len === 1) {
    const [x, y] = stroke[0];
    return `M ${x} ${y} A 0.5 0.5 0 1 0 ${x + 0.1} ${y} Z`;
  }

  let d = `M ${stroke[0][0]} ${stroke[0][1]}`;
  for (let i = 0; i < len; i++) {
    const [x0, y0] = stroke[i];
    const [x1, y1] = stroke[(i + 1) % len];
    const midX = (x0 + x1) * 0.5;
    const midY = (y0 + y1) * 0.5;
    d += ` Q ${x0} ${y0} ${midX} ${midY}`;
  }
  return d + ' Z';
}

/**
 * Generates an SVG path from raw input points with pure physical pressure sensitivity.
 * - Width at 50% pressure (p = 0.5) is EXACTLY baseSize.
 * - Thinner when pressure < 0.5, thicker when pressure > 0.5.
 * - simulatePressure is FALSE (no synthetic speed simulation).
 * - streamline is 0 (instantaneous stylus tracking, zero lag).
 */
export function generateStrokePath(
  points: [number, number, number][],
  baseSize: number = 12
): string {
  if (points.length === 0) return '';

  const outline = getStroke(points, {
    size: baseSize * 2, // At 50% pressure (0.5), width = (baseSize * 2) * 0.5 = baseSize
    thinning: 1, // Full proportional pressure scaling
    smoothing: 0.1, // Ultra-low smoothing for instantaneous rendering
    streamline: 0, // Zero dragging latency
    simulatePressure: false, // Strictly NO synthetic velocity pressure simulation
    start: {
      taper: 0,
      cap: true,
    },
    end: {
      taper: 0,
      cap: true,
    },
  });

  return getSvgPathFromStroke(outline);
}

/**
 * Exports a frame to a clean, standard SVG string with 2 layers (Color bottom, Draw top)
 */
export function frameToSvgString(
  frame: Frame,
  width: number = 1920,
  height: number = 1080,
  includeBackground: boolean = true,
  backgroundColor: string = '#ffffff'
): string {
  const bg = includeBackground
    ? `<rect width="${width}" height="${height}" fill="${backgroundColor}" />\n  `
    : '';

  // Bottom layer: color strokes
  const colorStrokes = frame.strokes.filter((s) => s.layer === 'color');
  const colorPaths = colorStrokes
    .map(
      (stroke) =>
        `<path d="${stroke.pathData}" fill="${stroke.color || '#000000'}" stroke="none" fill-rule="nonzero" data-layer="color" />`
    )
    .join('\n  ');

  // Top layer: draw strokes (default)
  const drawStrokes = frame.strokes.filter((s) => s.layer !== 'color');
  const drawPaths = drawStrokes
    .map(
      (stroke) =>
        `<path d="${stroke.pathData}" fill="${stroke.color || '#000000'}" stroke="none" fill-rule="nonzero" data-layer="draw" />`
    )
    .join('\n  ');

  const colorGroup = colorPaths ? `<g id="layer-color">\n  ${colorPaths}\n  </g>\n  ` : '';
  const drawGroup = drawPaths ? `<g id="layer-draw">\n  ${drawPaths}\n  </g>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${bg}${colorGroup}${drawGroup}
</svg>`;
}

/**
 * Triggers an immediate browser download for the SVG file
 */
export function downloadSvg(svgContent: string, fileName: string): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.svg') ? fileName : `${fileName}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Renders SVG content to an offscreen raster canvas and triggers a PNG download
 * Supports transparent background (alpha channel preserved)
 */
export async function downloadPng(
  svgContent: string,
  width: number,
  height: number,
  fileName: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Unable to create 2d canvas context');
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to create PNG blob'));
            return;
          }
          const pngUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(pngUrl);
          resolve();
        }, 'image/png');
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

/**
 * Calculates perceived luminance (sRGB standard) of a 6-digit hex color (0 to 1)
 */
export function getHexLuminance(hex: string): number {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return 0.5;
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Extracts light/near-light colors from a palette (luminance >= 0.70)
 */
export function getLightColorsFromPalette(palette: string[]): string[] {
  const lightColors = palette.filter((c) => getHexLuminance(c) >= 0.70);
  if (lightColors.length > 0) return lightColors;
  // Fallback to top brightest colors
  return [...palette].sort((a, b) => getHexLuminance(b) - getHexLuminance(a)).slice(0, 8);
}

/**
 * Selects a random light color from the given palette for starting canvas background
 */
export function getRandomLightColor(palette: string[]): string {
  const lights = getLightColorsFromPalette(palette);
  if (lights.length === 0) return '#fdfbf7';
  return lights[Math.floor(Math.random() * lights.length)];
}

/**
 * Triggers a browser download for a JSON data object
 */
export function downloadJson(data: any, fileName: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
