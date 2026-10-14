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
}

export interface Frame {
  id: string;
  name: string;
  strokes: VectorStroke[];
  undoStack: VectorStroke[];
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
 * Exports a frame to a clean, standard SVG string
 */
export function frameToSvgString(
  frame: Frame,
  width: number = 1920,
  height: number = 1080,
  includeBackground: boolean = true
): string {
  const bg = includeBackground
    ? `<rect width="${width}" height="${height}" fill="#ffffff" />\n  `
    : '';

  const paths = frame.strokes
    .map(
      (stroke) =>
        `<path d="${stroke.pathData}" fill="#000000" stroke="none" fill-rule="nonzero" />`
    )
    .join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${bg}${paths}
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
