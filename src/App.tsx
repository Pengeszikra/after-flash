/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Undo2,
  Redo2,
  Layers,
  Copy,
  Check,
  X,
  FileCode,
  PenTool,
  RotateCcw,
  QrCode,
  Tablet,
  ExternalLink,
  HelpCircle,
  FileDown,
  Palette,
  PaintBucket,
  Eraser,
  CopyPlus,
  Eye,
  EyeOff,
  Sparkles,
  Wand2,
  RefreshCw,
  Image as ImageIcon,
  Download,
} from 'lucide-react';
import {
  Frame,
  VectorStroke,
  HistoryStep,
  generateStrokePath,
  frameToSvgString,
  downloadSvg,
  downloadPng,
  downloadJson,
  getRandomLightColor,
  getLightColorsFromPalette,
} from './utils/stroke.ts';

// 64 Curated Artist Colors (8 rows x 8 columns) with balanced natural progression from deep ink shadows to luminous pastels and delicate light tints
const PALETTE_64: string[] = [
  // 1. Natural Canvas, Linen & Monochrome (8)
  '#000000', '#3f3f46', '#71717a', '#a1a1aa', '#e7e2d7', '#f5f0e6', '#fef6ea', '#ffffff',
  // 2. Warm Rose & Coral Reds (8)
  '#4c0519', '#881337', '#be123c', '#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fff1f2',
  // 3. Terracotta, Warm Amber & Peaches (8)
  '#451a03', '#7c2d12', '#9a3412', '#c2410c', '#ea580c', '#fb923c', '#fdba74', '#fff7ed',
  // 4. Golden Honey, Maize & Buttercream (8)
  '#422006', '#713f12', '#854d0e', '#ca8a04', '#eab308', '#fde047', '#fef08a', '#fef9c3',
  // 5. Sage, Emerald & Pistachio Mist (8)
  '#052e16', '#14532d', '#15803d', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#f0fdf4',
  // 6. Ocean Teal, Aqua & Seafoam Breeze (8)
  '#042f2e', '#0f766e', '#0d9488', '#06b6d4', '#38bdf8', '#7dd3fc', '#bae6fd', '#f0f9ff',
  // 7. Deep Navy, Royal Indigo & Periwinkle Sky (8)
  '#0f172a', '#1e3a8a', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#eff6ff',
  // 8. Velvet Plum, Wisteria & Lavender Fog (8)
  '#2e1065', '#581c87', '#7c3aed', '#9333ea', '#c084fc', '#d8b4fe', '#e9d5ff', '#faf5ff',
];

export default function App() {
  // Canvas full-screen dynamic dimensions
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 1920,
    height: 1080,
  });

  // Frames state
  const [frames, setFrames] = useState<Frame[]>([
    {
      id: 'frame-1',
      name: 'Frame 1',
      strokes: [],
      undoStack: [],
    },
  ]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);

  // Stroke size presets: Fine (6px), Medium (12px), Bold (22px)
  const [strokeSize, setStrokeSize] = useState<number>(12);

  // Tool Mode: 'pen' | 'eraser'
  const [toolMode, setToolMode] = useState<'pen' | 'eraser'>('pen');

  // 2 Layers: 'draw' (top / linework) | 'color' (bottom / fills)
  const [activeLayer, setActiveLayer] = useState<'draw' | 'color'>('draw');

  // Live eraser position for visual indicator circle on canvas
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);
  const erasedInCurrentGestureRef = useRef<VectorStroke[]>([]);

  // Stroke color state & 64-color picker popover
  const [strokeColor, setStrokeColor] = useState<string>('#000000');
  // Initial canvas background: random light/near-light color from the palette
  const [canvasBgColor, setCanvasBgColor] = useState<string>(() => getRandomLightColor(PALETTE_64));
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const colorPickerRef = useRef<HTMLDivElement | null>(null);
  const [bgToastMessage, setBgToastMessage] = useState<string | null>(null);

  // Active 64-Color Palette (defaults to PALETTE_64, dynamically updateable via Google Gemma AI)
  const [activePalette, setActivePalette] = useState<string[]>(PALETTE_64);
  const [activePaletteName, setActivePaletteName] = useState<string>('Classic Studio 64');

  // AI Palette Generator states (powered by Google Gemma Open Weights)
  const [showAiPaletteModal, setShowAiPaletteModal] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [aiPaletteMode, setAiPaletteMode] = useState<'8' | '64'>('8');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [generatedAiPalette, setGeneratedAiPalette] = useState<{
    paletteName: string;
    themeDescription: string;
    recommendedBackground: string;
    colors: { hex: string; name: string; role: string }[];
    modelUsed?: string;
    isOpenModel?: boolean;
    modelDocs?: string;
  } | null>(null);

  // Onion skinning toggle
  const [onionSkin, setOnionSkin] = useState<boolean>(true);

  // Animation playback
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(8);

  // Ultra-fast zero-latency direct DOM drawing refs
  const isDrawingRef = useRef<boolean>(false);
  const currentPointsRef = useRef<[number, number, number][]>([]);
  const livePathRef = useRef<SVGPathElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Modal dialog states
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showTabletModal, setShowTabletModal] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [svgCopied, setSvgCopied] = useState<boolean>(false);
  const [transparentBg, setTransparentBg] = useState<boolean>(false);
  const [isPngExporting, setIsPngExporting] = useState<boolean>(false);
  const [isUiVisible, setIsUiVisible] = useState<boolean>(true);
  const [urlCopied, setUrlCopied] = useState<boolean>(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);

  // Frame deletion undo snackbar
  const [deletedFrameState, setDeletedFrameState] = useState<{
    frame: Frame;
    index: number;
  } | null>(null);

  // Current frame reference
  const currentFrame = frames[currentFrameIndex] || frames[0];
  const previousFrame = currentFrameIndex > 0 ? frames[currentFrameIndex - 1] : null;

  // Track dynamic full-screen canvas dimensions
  useLayoutEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions({ width: clientWidth, height: clientHeight });
        }
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(updateSize);
      ro.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateSize);
      if (ro) ro.disconnect();
    };
  }, []);

  // Close color popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };
    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker]);

  // Eraser brush radius based on stroke preset
  const eraserRadius = strokeSize === 6 ? 16 : strokeSize === 12 ? 28 : 44;

  // Zero-latency Pointer Down
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (isPlaying) {
        setIsPlaying(false);
      }
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignored
      }

      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      isDrawingRef.current = true;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (toolMode === 'eraser') {
        setEraserPos({ x: px, y: py });
        erasedInCurrentGestureRef.current = [];

        // Check hits on activeLayer
        const radiusSq = (eraserRadius + strokeSize * 0.5) ** 2;
        const currentStrokes = frames[currentFrameIndex]?.strokes || [];
        const hitStrokes: VectorStroke[] = [];
        const remainingStrokes: VectorStroke[] = [];

        for (const s of currentStrokes) {
          if ((s.layer || 'draw') !== activeLayer) {
            remainingStrokes.push(s);
            continue;
          }
          let hit = false;
          for (let i = 0; i < s.points.length; i++) {
            const pt = s.points[i];
            const dx = pt[0] - px;
            const dy = pt[1] - py;
            if (dx * dx + dy * dy <= radiusSq) {
              hit = true;
              break;
            }
          }
          if (hit) {
            hitStrokes.push(s);
          } else {
            remainingStrokes.push(s);
          }
        }

        if (hitStrokes.length > 0) {
          erasedInCurrentGestureRef.current = hitStrokes;
          setFrames((prev) =>
            prev.map((frame, idx) => {
              if (idx !== currentFrameIndex) return frame;
              return {
                ...frame,
                strokes: remainingStrokes,
              };
            })
          );
        }
        return;
      }

      // Pen Drawing
      // Exact physical pressure: at 0.5 width is exactly baseSize.
      const p = e.pressure > 0 ? Math.max(0.04, Math.min(1.0, e.pressure)) : 0.5;
      const initialPoint: [number, number, number] = [px, py, p];
      currentPointsRef.current = [initialPoint];

      const initialPath = generateStrokePath(currentPointsRef.current, strokeSize);
      if (livePathRef.current) {
        livePathRef.current.setAttribute('fill', strokeColor);
        livePathRef.current.setAttribute('d', initialPath);
      }
    },
    [isPlaying, toolMode, eraserRadius, strokeSize, strokeColor, frames, currentFrameIndex, activeLayer]
  );

  // Zero-latency Pointer Move
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (toolMode === 'eraser') {
        setEraserPos({ x: px, y: py });
        if (!isDrawingRef.current) return;

        // Active erasing while dragging
        const radiusSq = (eraserRadius + strokeSize * 0.5) ** 2;
        const currentStrokes = frames[currentFrameIndex]?.strokes || [];
        const hitStrokes: VectorStroke[] = [];
        const remainingStrokes: VectorStroke[] = [];

        for (const s of currentStrokes) {
          if ((s.layer || 'draw') !== activeLayer) {
            remainingStrokes.push(s);
            continue;
          }
          let hit = false;
          for (let i = 0; i < s.points.length; i++) {
            const pt = s.points[i];
            const dx = pt[0] - px;
            const dy = pt[1] - py;
            if (dx * dx + dy * dy <= radiusSq) {
              hit = true;
              break;
            }
          }
          if (hit) {
            hitStrokes.push(s);
          } else {
            remainingStrokes.push(s);
          }
        }

        if (hitStrokes.length > 0) {
          erasedInCurrentGestureRef.current.push(...hitStrokes);
          setFrames((prev) =>
            prev.map((frame, idx) => {
              if (idx !== currentFrameIndex) return frame;
              return {
                ...frame,
                strokes: remainingStrokes,
              };
            })
          );
        }
        return;
      }

      if (!isDrawingRef.current) return;

      // Extract high-frequency coalesced events from stylus hardware if available
      const native = e.nativeEvent;
      const events =
        native && typeof (native as any).getCoalescedEvents === 'function'
          ? (native as any).getCoalescedEvents()
          : [e];

      for (let i = 0; i < events.length; i++) {
        const evt = events[i];
        const ex = evt.clientX - rect.left;
        const ey = evt.clientY - rect.top;
        const p = evt.pressure > 0 ? Math.max(0.04, Math.min(1.0, evt.pressure)) : 0.5;
        currentPointsRef.current.push([ex, ey, p]);
      }

      const path = generateStrokePath(currentPointsRef.current, strokeSize);
      livePathRef.current?.setAttribute('d', path);
    },
    [toolMode, eraserRadius, strokeSize, activeLayer, frames, currentFrameIndex]
  );

  // Pointer Up: Commit stroke once to React state or record erase history
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }

      if (toolMode === 'eraser') {
        const erased = erasedInCurrentGestureRef.current;
        if (erased.length > 0) {
          const step: HistoryStep = { type: 'remove', strokes: [...erased] };
          setFrames((prev) =>
            prev.map((frame, idx) => {
              if (idx !== currentFrameIndex) return frame;
              return {
                ...frame,
                history: [...(frame.history || []), step],
                future: [],
              };
            })
          );
        }
        erasedInCurrentGestureRef.current = [];
        return;
      }

      const finalPath = livePathRef.current?.getAttribute('d') || '';
      livePathRef.current?.setAttribute('d', '');

      if (currentPointsRef.current.length > 0 && finalPath) {
        const newStroke: VectorStroke = {
          id: `stroke-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          points: [...currentPointsRef.current],
          pathData: finalPath,
          baseSize: strokeSize,
          color: strokeColor,
          layer: activeLayer,
        };

        const step: HistoryStep = { type: 'add', stroke: newStroke };

        setFrames((prev) =>
          prev.map((frame, idx) => {
            if (idx !== currentFrameIndex) return frame;
            return {
              ...frame,
              strokes: [...frame.strokes, newStroke],
              history: [...(frame.history || []), step],
              future: [],
              undoStack: [],
            };
          })
        );
      }

      currentPointsRef.current = [];
    },
    [toolMode, currentFrameIndex, strokeSize, strokeColor, activeLayer]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      handlePointerUp(e);
    },
    [handlePointerUp]
  );

  // Frame Navigation
  const goToNextFrame = () => {
    if (currentFrameIndex < frames.length - 1) {
      setCurrentFrameIndex((prev) => prev + 1);
    }
  };

  const goToPrevFrame = () => {
    if (currentFrameIndex > 0) {
      setCurrentFrameIndex((prev) => prev - 1);
    }
  };

  // New Frame
  const handleAddNewFrame = () => {
    const newFrameId = `frame-${Date.now()}`;
    const newFrameNumber = frames.length + 1;
    const newFrame: Frame = {
      id: newFrameId,
      name: `Frame ${newFrameNumber}`,
      strokes: [],
      undoStack: [],
    };

    setFrames((prev) => {
      const next = [...prev];
      next.splice(currentFrameIndex + 1, 0, newFrame);
      return next;
    });

    setCurrentFrameIndex((prev) => prev + 1);
    if (isPlaying) setIsPlaying(false);
  };

  // Delete Frame
  const handleDeleteCurrentFrame = () => {
    if (isPlaying) setIsPlaying(false);

    const frameToDelete = currentFrame;
    const indexToDelete = currentFrameIndex;

    setDeletedFrameState({
      frame: frameToDelete,
      index: indexToDelete,
    });

    if (frames.length === 1) {
      setFrames([
        {
          id: `frame-${Date.now()}`,
          name: 'Frame 1',
          strokes: [],
          undoStack: [],
        },
      ]);
      setCurrentFrameIndex(0);
    } else {
      setFrames((prev) => prev.filter((_, idx) => idx !== indexToDelete));
      setCurrentFrameIndex((prev) => Math.max(0, Math.min(prev, frames.length - 2)));
    }
  };

  // Undo Delete Frame
  const handleUndoDeleteFrame = () => {
    if (!deletedFrameState) return;
    const { frame, index } = deletedFrameState;

    setFrames((prev) => {
      const next = [...prev];
      next.splice(index, 0, frame);
      return next;
    });
    setCurrentFrameIndex(index);
    setDeletedFrameState(null);
  };

  // Undo action (both stroke drawing and eraser removals)
  const handleUndo = () => {
    setFrames((prev) =>
      prev.map((frame, idx) => {
        if (idx !== currentFrameIndex) return frame;
        const hist = frame.history || [];
        if (hist.length > 0) {
          const lastStep = hist[hist.length - 1];
          const newHist = hist.slice(0, -1);
          let newStrokes = [...frame.strokes];
          if (lastStep.type === 'add') {
            newStrokes = newStrokes.filter((s) => s.id !== lastStep.stroke.id);
          } else if (lastStep.type === 'remove') {
            newStrokes = [...newStrokes, ...lastStep.strokes];
          }
          return {
            ...frame,
            strokes: newStrokes,
            history: newHist,
            future: [lastStep, ...(frame.future || [])],
          };
        }
        // Fallback for simple strokes
        if (frame.strokes.length === 0) return frame;
        const lastStroke = frame.strokes[frame.strokes.length - 1];
        return {
          ...frame,
          strokes: frame.strokes.slice(0, -1),
          undoStack: [...frame.undoStack, lastStroke],
        };
      })
    );
  };

  // Redo action (both stroke drawing and eraser removals)
  const handleRedo = () => {
    setFrames((prev) =>
      prev.map((frame, idx) => {
        if (idx !== currentFrameIndex) return frame;
        const fut = frame.future || [];
        if (fut.length > 0) {
          const nextStep = fut[0];
          const newFut = fut.slice(1);
          let newStrokes = [...frame.strokes];
          if (nextStep.type === 'add') {
            newStrokes = [...newStrokes, nextStep.stroke];
          } else if (nextStep.type === 'remove') {
            const removeIds = new Set(nextStep.strokes.map((s) => s.id));
            newStrokes = newStrokes.filter((s) => !removeIds.has(s.id));
          }
          return {
            ...frame,
            strokes: newStrokes,
            history: [...(frame.history || []), nextStep],
            future: newFut,
          };
        }
        // Fallback for undoStack
        if (frame.undoStack.length === 0) return frame;
        const strokeToRestore = frame.undoStack[frame.undoStack.length - 1];
        return {
          ...frame,
          strokes: [...frame.strokes, strokeToRestore],
          undoStack: frame.undoStack.slice(0, -1),
        };
      })
    );
  };

  // Clone current frame with all strokes from both layers
  const handleCloneCurrentFrame = () => {
    if (isPlaying) setIsPlaying(false);

    const clonedStrokes: VectorStroke[] = currentFrame.strokes.map((s) => ({
      ...s,
      id: `stroke-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      points: s.points.map((p) => [p[0], p[1], p[2]] as [number, number, number]),
    }));

    const newFrameId = `frame-${Date.now()}`;
    const newFrameNumber = frames.length + 1;
    const newClonedFrame: Frame = {
      id: newFrameId,
      name: `Frame ${newFrameNumber}`,
      strokes: clonedStrokes,
      undoStack: [],
      history: [],
      future: [],
    };

    setFrames((prev) => {
      const next = [...prev];
      next.splice(currentFrameIndex + 1, 0, newClonedFrame);
      return next;
    });

    setCurrentFrameIndex((prev) => prev + 1);
    setBgToastMessage(`Frame ${currentFrameIndex + 1} Cloned → Frame ${currentFrameIndex + 2}`);
    setTimeout(() => setBgToastMessage(null), 1800);
  };

  // Fill canvas background with specified color (defaulting to current active stroke color)
  const handleFillCanvasBackground = (colorToFill: string = strokeColor) => {
    setCanvasBgColor(colorToFill);
    setBgToastMessage(`Canvas filled with ${colorToFill.toUpperCase()}`);
    setTimeout(() => {
      setBgToastMessage(null);
    }, 1800);
  };

  // Generate Color Palette via Google Gemma (Open Weights)
  const handleGenerateAiPalette = async (overridePrompt?: string, overrideMode?: '8' | '64') => {
    const promptToUse = (overridePrompt || aiPrompt).trim();
    const modeToUse = overrideMode || aiPaletteMode;
    if (!promptToUse) {
      setAiError('Please enter a word or mood description (e.g., "cyberpunk neon", "őszi erdő").');
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const res = await fetch('/api/generate-palette', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: promptToUse,
          count: modeToUse === '64' ? 64 : 8,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      setGeneratedAiPalette(data);

      // If mode is 64, automatically update the 64-color palette
      if (modeToUse === '64' && Array.isArray(data.colors) && data.colors.length >= 8) {
        const new64Colors: string[] = data.colors.map((c: any) => c.hex);
        while (new64Colors.length < 64) {
          new64Colors.push(PALETTE_64[new64Colors.length % 64]);
        }
        setActivePalette(new64Colors.slice(0, 64));
        setActivePaletteName(data.paletteName || promptToUse);
      }

      // Pick the primary accent color as the current active stroke color
      if (data.colors && data.colors.length > 0) {
        setStrokeColor(data.colors[0].hex);
      }

      setBgToastMessage(`✨ Palette: ${data.paletteName || promptToUse}`);
      setTimeout(() => setBgToastMessage(null), 2500);
    } catch (err: any) {
      console.error('Failed to generate AI palette:', err);
      setAiError(err.message || 'Failed to generate palette. Please check connection and try again.');
    } finally {
      setAiLoading(false);
    }
  };

  // Apply current generated AI palette to the 64-color studio grid
  const handleApplyAiPaletteAsActive = () => {
    if (!generatedAiPalette || !generatedAiPalette.colors.length) return;
    const aiHexes = generatedAiPalette.colors.map((c) => c.hex);
    let newGrid: string[] = [];
    if (aiHexes.length >= 64) {
      newGrid = aiHexes.slice(0, 64);
    } else {
      // Put AI colors at the beginning and pad with existing palette
      newGrid = [...aiHexes];
      for (const col of PALETTE_64) {
        if (newGrid.length >= 64) break;
        if (!newGrid.includes(col)) {
          newGrid.push(col);
        }
      }
      while (newGrid.length < 64) {
        newGrid.push(PALETTE_64[newGrid.length % 64]);
      }
    }
    setActivePalette(newGrid.slice(0, 64));
    setActivePaletteName(generatedAiPalette.paletteName);
    setBgToastMessage(`Applied "${generatedAiPalette.paletteName}" to 64-Color Palette`);
    setTimeout(() => setBgToastMessage(null), 2000);
  };

  // Restore Default 64 Artist Palette
  const handleRestoreDefaultPalette = () => {
    setActivePalette(PALETTE_64);
    setActivePaletteName('Classic Studio 64');
    setBgToastMessage('Restored Classic 64-Color Palette');
    setTimeout(() => setBgToastMessage(null), 1800);
  };

  // Export palette (AI generated or active) to a .json file
  const handleSavePaletteAsJson = () => {
    const paletteToExport = generatedAiPalette || {
      paletteName: activePaletteName,
      themeDescription: 'Custom Studio Palette in after-flash',
      recommendedBackground: canvasBgColor,
      colors: activePalette.map((hex, idx) => ({
        hex,
        name: `Color ${idx + 1}`,
        role: idx === 0 ? 'primary' : 'shade',
      })),
      modelUsed: 'Google Gemma (Open Weights)',
      isOpenModel: true,
      modelDocs: 'https://ai.google.dev/gemma/docs',
    };

    const exportData = {
      name: paletteToExport.paletteName,
      theme: paletteToExport.themeDescription,
      recommendedBackground: paletteToExport.recommendedBackground,
      exportedAt: new Date().toISOString(),
      generator: {
        model: paletteToExport.modelUsed || 'Google Gemma (Open Weights)',
        isOpenModel: true,
        documentation: 'https://ai.google.dev/gemma/docs',
        app: 'after-flash vector studio',
      },
      colorCount: paletteToExport.colors.length,
      colors: paletteToExport.colors,
      hexList: paletteToExport.colors.map((c: any) => c.hex),
    };

    const slug = (paletteToExport.paletteName || 'palette')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const filename = `palette-${slug || 'colors'}-${generateRandomString(4)}.json`;

    downloadJson(exportData, filename);
    setBgToastMessage(`💾 Paletta letöltve: ${filename}`);
    setTimeout(() => setBgToastMessage(null), 2500);
  };

  // Helper to generate random string for conflict-free filenames
  const generateRandomString = (length: number = 8): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Export current frame to SVG (after-flas-{randomString}.svg)
  const handleSaveCurrentFrameSvg = () => {
    const svgCode = frameToSvgString(
      currentFrame,
      dimensions.width,
      dimensions.height,
      !transparentBg,
      canvasBgColor
    );
    const randomSuffix = generateRandomString(8);
    const fileName = `after-flas-${randomSuffix}.svg`;
    downloadSvg(svgCode, fileName);
    setBgToastMessage(`Saved as ${fileName}${transparentBg ? ' (Transparent SVG)' : ''}`);
    setTimeout(() => {
      setBgToastMessage(null);
    }, 2400);
  };

  // Export current frame to PNG raster with transparency support (after-flas-{randomString}.png)
  const handleSaveCurrentFramePng = async () => {
    setIsPngExporting(true);
    try {
      const svgCode = frameToSvgString(
        currentFrame,
        dimensions.width,
        dimensions.height,
        !transparentBg,
        canvasBgColor
      );
      const randomSuffix = generateRandomString(8);
      const fileName = `after-flas-${randomSuffix}.png`;
      await downloadPng(svgCode, dimensions.width, dimensions.height, fileName);
      setBgToastMessage(`Saved as ${fileName}${transparentBg ? ' (Transparent PNG)' : ''}`);
    } catch (err) {
      console.error('PNG export failed:', err);
      setBgToastMessage('PNG export failed, please download SVG');
    } finally {
      setIsPngExporting(false);
      setTimeout(() => {
        setBgToastMessage(null);
      }, 2400);
    }
  };

  // Copy SVG Code
  const handleCopySvgCode = async () => {
    const svgCode = frameToSvgString(
      currentFrame,
      dimensions.width,
      dimensions.height,
      !transparentBg,
      canvasBgColor
    );
    try {
      await navigator.clipboard.writeText(svgCode);
      setSvgCopied(true);
      setTimeout(() => setSvgCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Animation Playback Loop
  useEffect(() => {
    if (!isPlaying) return;

    const intervalTime = 1000 / fps;
    const timer = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, frames.length, fps]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNextFrame();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevFrame();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setToolMode((m) => {
          const next = m === 'eraser' ? 'pen' : 'eraser';
          setBgToastMessage(next === 'eraser' ? `Eraser Mode (${activeLayer.toUpperCase()} Layer)` : 'Pen Mode');
          setTimeout(() => setBgToastMessage(null), 1400);
          return next;
        });
      } else if (e.key === 'b' || e.key === 'B' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setToolMode('pen');
        setBgToastMessage('Pen Mode');
        setTimeout(() => setBgToastMessage(null), 1200);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setActiveLayer((layer) => {
          const next = layer === 'draw' ? 'color' : 'draw';
          setBgToastMessage(next === 'draw' ? 'Active Layer: DRAW (Top Line Art)' : 'Active Layer: COLOR (Bottom Fills)');
          setTimeout(() => setBgToastMessage(null), 1800);
          return next;
        });
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleCloneCurrentFrame();
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setShowAiPaletteModal((prev) => !prev);
      } else if (e.key === 'Tab' || e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setIsUiVisible((prev) => {
          const next = !prev;
          setBgToastMessage(next ? 'UI Visible' : 'UI Hidden (Zen Mode — Fullscreen Canvas)');
          setTimeout(() => setBgToastMessage(null), 1800);
          return next;
        });
      } else if (e.key === 'Escape') {
        setIsUiVisible(true);
      } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShowHelpModal((h) => !h);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFrameIndex, frames.length, activeLayer]);

  // Android PWA Install Prompt
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice?.outcome === 'accepted') {
      setDeferredInstallPrompt(null);
    }
  };

  const appShareUrl =
    typeof window !== 'undefined' && window.location.href.startsWith('http')
      ? window.location.href
      : 'https://ais-pre-ahinart5znjnsguuy4p775-660316139818.europe-west2.run.app';

  const handleCopyAppUrl = async () => {
    try {
      await navigator.clipboard.writeText(appShareUrl);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="relative w-screen h-screen bg-slate-950 text-slate-100 select-none overflow-hidden font-sans">
      {/* Top Application Bar - Floating Glassmorphic Header, Slide-Toggleable */}
      <header
        className={`fixed top-0 left-0 right-0 h-14 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-3 md:px-5 flex items-center justify-between gap-2 sm:gap-3 z-30 transition-all duration-300 ease-in-out ${
          isUiVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        {/* Left: Lead Pen Icon (Zen Mode Toggle) & Frame Counter */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              setIsUiVisible((prev) => !prev);
              setBgToastMessage(isUiVisible ? 'Zen mód: UI elrejtve (Tab / H / Esc vagy a toll ikon visszahozza)' : 'Zen mód kikapcsolva: UI látható');
              setTimeout(() => setBgToastMessage(null), 1600);
            }}
            title="Zen mód / UI ki-bekapcsolása (vagy nyomj Tab-ot / H-t)"
            aria-label="Zen mód ki-bekapcsolása"
            className="w-8 h-8 rounded-lg bg-black border border-slate-700 hover:border-emerald-400 hover:bg-slate-900 flex items-center justify-center text-white shrink-0 shadow-inner transition-all hover:scale-105 active:scale-95 cursor-pointer group"
          >
            <PenTool className="w-4 h-4 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
          </button>

          {/* Frame count badge */}
          <div className="flex items-center text-xs text-slate-400 border-l border-slate-800 pl-2 sm:pl-3 font-mono">
            <span className="font-semibold text-slate-200 tabular-nums">
              {currentFrameIndex + 1}
            </span>
            <span className="mx-1 text-slate-500">/</span>
            <span className="text-slate-400 tabular-nums">{frames.length}</span>
          </div>
        </div>

        {/* Center: Stroke Width, Pen/Eraser, 2-Layer Switcher, 64-Color Swatch, Canvas Fill, Onion Skin & Undo/Redo - Icon Only */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Stroke Width Buttons - Visual Dot Icons */}
          <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60">
            {[
              { size: 6, label: 'Fine (6px)', dot: 'w-1.5 h-1.5' },
              { size: 12, label: 'Medium (12px)', dot: 'w-2.5 h-2.5' },
              { size: 22, label: 'Bold (22px)', dot: 'w-3.5 h-3.5' },
            ].map((item) => (
              <button
                key={item.size}
                onClick={() => setStrokeSize(item.size)}
                title={item.label}
                aria-label={item.label}
                className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md transition-colors ${
                  strokeSize === item.size
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className={`rounded-full bg-current ${item.dot}`} />
              </button>
            ))}
          </div>

          {/* Tool Mode: Pen vs Eraser - Icon Only */}
          <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60">
            {/* Pen Tool */}
            <button
              onClick={() => {
                setToolMode('pen');
                setBgToastMessage('Pen Mode');
                setTimeout(() => setBgToastMessage(null), 1200);
              }}
              title="Pen Tool (B)"
              aria-label="Pen"
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md transition-colors ${
                toolMode === 'pen'
                  ? 'bg-slate-700 text-cyan-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <PenTool className="w-4 h-4" />
            </button>

            {/* Eraser Tool */}
            <button
              onClick={() => {
                setToolMode('eraser');
                setBgToastMessage(`Eraser Mode (${activeLayer.toUpperCase()} Layer)`);
                setTimeout(() => setBgToastMessage(null), 1500);
              }}
              title="Eraser Tool (E)"
              aria-label="Eraser"
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md transition-colors ${
                toolMode === 'eraser'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eraser className="w-4 h-4" />
            </button>
          </div>

          {/* 2-Layer Switcher: Draw (Top) vs Color (Bottom) - Icon Only */}
          <button
            onClick={() => {
              const nextLayer = activeLayer === 'draw' ? 'color' : 'draw';
              setActiveLayer(nextLayer);
              setBgToastMessage(
                nextLayer === 'draw'
                  ? 'Active Layer: DRAW (Top Line Art)'
                  : 'Active Layer: COLOR (Bottom Fills)'
              );
              setTimeout(() => setBgToastMessage(null), 1800);
            }}
            title={
              activeLayer === 'draw'
                ? 'Active Layer: DRAW (Top / Linework). Click to switch to COLOR (L)'
                : 'Active Layer: COLOR (Bottom / Fills). Click to switch to DRAW (L)'
            }
            aria-label="Switch Layer"
            className={`relative min-h-[38px] min-w-[38px] rounded-lg border flex items-center justify-center transition-all active:scale-95 shadow-sm ${
              activeLayer === 'draw'
                ? 'bg-indigo-950/70 border-indigo-500/60 text-indigo-300'
                : 'bg-amber-950/70 border-amber-500/60 text-amber-300'
            }`}
          >
            <Layers className="w-4 h-4" />
            {/* Visual indicator dot: top dot for draw, bottom dot for color */}
            <span
              className={`absolute w-2 h-2 rounded-full border border-slate-900 transition-all ${
                activeLayer === 'draw'
                  ? 'top-1 right-1 bg-cyan-400'
                  : 'bottom-1 right-1 bg-amber-400'
              }`}
            />
          </button>

          {/* 64-Color Picker Swatch Button & Popover */}
          <div className="relative" ref={colorPickerRef}>
            <button
              onClick={() => setShowColorPicker((prev) => !prev)}
              title="64-Color Palette"
              aria-label="64-Color Palette"
              className="min-h-[38px] min-w-[38px] rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 flex items-center justify-center transition-colors active:scale-95 shadow-sm"
            >
              <span
                className="w-4 h-4 rounded-full border border-white/50 shadow-inner"
                style={{ backgroundColor: strokeColor }}
              />
            </button>

            {/* Floating 64-Color Palette Dropdown (8x8 Grid) */}
            {showColorPicker && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-700 p-3 rounded-2xl shadow-2xl w-[304px] animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/40 shadow-inner shrink-0"
                      style={{ backgroundColor: strokeColor }}
                    />
                    <span className="text-[11px] font-semibold text-slate-300 truncate max-w-[170px]">
                      {activePaletteName} ({strokeColor})
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {activePaletteName !== 'Classic Studio 64' && (
                      <button
                        onClick={handleRestoreDefaultPalette}
                        title="Restore classic 64 studio palette"
                        className="text-slate-400 hover:text-cyan-300 p-1 rounded hover:bg-slate-800"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={() => setShowColorPicker(false)}
                      className="text-slate-500 hover:text-white p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 64 Colors Swatch Grid (8 cols x 8 rows) */}
                <div className="grid grid-cols-8 gap-1.5 mb-3">
                  {activePalette.map((color, idx) => (
                    <button
                      key={`${color}-${idx}`}
                      onClick={() => {
                        setStrokeColor(color);
                        setShowColorPicker(false);
                      }}
                      title={color}
                      aria-label={`Select color ${color}`}
                      className={`w-7 h-7 rounded-md transition-transform active:scale-90 border ${
                        strokeColor === color
                          ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900 scale-105 border-white'
                          : 'border-white/15 hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>

                {/* Quick Actions & Canvas Background Fill */}
                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-800 text-xs">
                  {/* Fill Canvas Shortcut Inside Palette */}
                  <button
                    onClick={() => {
                      handleFillCanvasBackground(strokeColor);
                      setShowColorPicker(false);
                    }}
                    title={`Fill canvas background with ${strokeColor}`}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 border border-slate-700 flex items-center justify-center gap-1.5 font-medium text-[11px] transition-colors"
                  >
                    <PaintBucket className="w-3.5 h-3.5" />
                    <span>Fill</span>
                  </button>

                  {/* AI Palette Shortcut */}
                  <button
                    onClick={() => {
                      setShowColorPicker(false);
                      setShowAiPaletteModal(true);
                    }}
                    title="Generate new palette with Google Gemma Open Model"
                    className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 hover:text-emerald-200 border border-emerald-700/60 flex items-center justify-center gap-1.5 font-medium text-[11px] transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>AI Pal</span>
                  </button>

                  {/* Custom Color Input */}
                  <label className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700">
                    <input
                      type="color"
                      value={strokeColor}
                      onChange={(e) => setStrokeColor(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* AI Color Palette Generator - Icon Only */}
          <button
            onClick={() => setShowAiPaletteModal(true)}
            title="AI Color Palette Generator (✨ Google Gemma Open Weights)"
            aria-label="AI Color Palette Generator (Google Gemma)"
            className="relative min-h-[38px] min-w-[38px] rounded-lg bg-gradient-to-br from-emerald-950 to-teal-950 hover:from-emerald-900 hover:to-teal-900 border border-emerald-500/50 flex items-center justify-center transition-all active:scale-95 shadow-sm group"
          >
            <Sparkles className="w-4 h-4 text-amber-300 group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </button>

          {/* Canvas Background Color Fill Button - Icon Only */}
          <button
            onClick={() => handleFillCanvasBackground(strokeColor)}
            title={`Fill canvas background with current color (${strokeColor})`}
            aria-label="Fill canvas background with current color"
            className="relative min-h-[38px] min-w-[38px] rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 flex items-center justify-center transition-all active:scale-95 shadow-sm group"
          >
            <PaintBucket className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span
              className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border border-slate-900 shadow-sm"
              style={{ backgroundColor: strokeColor }}
            />
          </button>

          {/* Onion Skinning Toggle - Icon Only */}
          <button
            onClick={() => setOnionSkin((prev) => !prev)}
            title="Onion skin (Display previous frame faintly)"
            aria-label="Onion skin"
            className={`min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center transition-colors border ${
              onionSkin
                ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-300'
                : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-4 h-4" />
          </button>

          {/* Undo Button - Icon Only */}
          <button
            onClick={handleUndo}
            disabled={
              (currentFrame.history?.length || 0) === 0 && currentFrame.strokes.length === 0
            }
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-colors border border-slate-700/50 active:scale-95"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Redo Button - Icon Only */}
          <button
            onClick={handleRedo}
            disabled={
              (currentFrame.future?.length || 0) === 0 && (currentFrame.undoStack?.length || 0) === 0
            }
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-colors border border-slate-700/50 active:scale-95"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Help, Tablet, Install, Delete & Export - Icon Only */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Help Screen Button - Icon Only */}
          <button
            onClick={() => setShowHelpModal(true)}
            title="Help & Shortcuts (?)"
            aria-label="Help"
            className="min-h-[38px] min-w-[38px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center transition-colors active:scale-95"
          >
            <HelpCircle className="w-4 h-4 text-cyan-400" />
          </button>

          {/* Tablet Connection & QR - Icon Only */}
          <button
            onClick={() => setShowTabletModal(true)}
            title="Open on Android Tablet (QR & direct link)"
            aria-label="Tablet Link"
            className="min-h-[38px] min-w-[38px] rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 flex items-center justify-center transition-colors active:scale-95"
          >
            <Tablet className="w-4 h-4 text-cyan-400" />
          </button>

          {/* Android PWA Install - Icon Only */}
          {deferredInstallPrompt && (
            <button
              onClick={handleInstallApp}
              title="Install after-flash app to tablet home screen"
              aria-label="Install app"
              className="min-h-[38px] min-w-[38px] rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center transition-colors shadow-sm active:scale-95"
            >
              <FileDown className="w-4 h-4" />
            </button>
          )}

          {/* Delete Frame - Icon Only */}
          <button
            onClick={handleDeleteCurrentFrame}
            title="Delete current frame"
            aria-label="Delete frame"
            className="min-h-[38px] min-w-[38px] rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 flex items-center justify-center transition-colors active:scale-95"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>

          {/* Toggle UI / Zen Mode Button - Icon Only */}
          <button
            onClick={() => {
              setIsUiVisible(false);
              setBgToastMessage('UI Hidden (Press Tab or tap Eye to restore)');
              setTimeout(() => setBgToastMessage(null), 2000);
            }}
            title="Toggle UI / Zen Mode (Tab or H)"
            aria-label="Toggle UI"
            className="min-h-[38px] min-w-[38px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center transition-colors active:scale-95"
          >
            <EyeOff className="w-4 h-4 text-slate-300" />
          </button>

          {/* Export Frame to SVG / PNG - Icon Only */}
          <button
            onClick={() => setShowExportModal(true)}
            title="Save / Export frame (SVG & PNG)"
            aria-label="Save Frame"
            className="min-h-[38px] min-w-[38px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-950/40 transition-all active:scale-95"
          >
            <FileDown className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Full-Screen Canvas Drawing Workspace (Spanning entire screen under floating UI) */}
      <main
        ref={containerRef}
        className="fixed inset-0 w-screen h-screen overflow-hidden select-none z-0"
        style={{ backgroundColor: canvasBgColor }}
      >
        {/* SVG Vector Drawing Surface Spanning Full Width and Height */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          className="w-full h-full cursor-crosshair drawing-surface touch-none select-none block"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={() => setEraserPos(null)}
        >
          {/* Canvas Background Rect */}
          <rect width={dimensions.width} height={dimensions.height} fill={canvasBgColor} />

          {/* Onion Skinning: Previous frame strokes in faint tint */}
          {onionSkin && previousFrame && !isPlaying && (
            <g id="onion-skin-layer" opacity={0.25} className="pointer-events-none">
              {previousFrame.strokes.map((stroke) => (
                <path
                  key={`onion-${stroke.id}`}
                  d={stroke.pathData}
                  fill={stroke.color || '#64748b'}
                  stroke="none"
                />
              ))}
            </g>
          )}

          {/* BOTTOM LAYER: COLOR Layer Saved Strokes */}
          <g id="layer-color">
            {currentFrame.strokes
              .filter((s) => s.layer === 'color')
              .map((stroke) => (
                <path
                  key={stroke.id}
                  d={stroke.pathData}
                  fill={stroke.color || '#000000'}
                  stroke="none"
                  fillRule="nonzero"
                />
              ))}
          </g>

          {/* Live Drawing Path on COLOR Layer (renders UNDERNEATH the DRAW layer) */}
          {activeLayer === 'color' && (
            <path
              ref={livePathRef}
              d=""
              fill={strokeColor}
              stroke="none"
              fillRule="nonzero"
              className="pointer-events-none"
            />
          )}

          {/* TOP LAYER: DRAW Layer Saved Strokes (Linework on top) */}
          <g id="layer-draw">
            {currentFrame.strokes
              .filter((s) => s.layer !== 'color')
              .map((stroke) => (
                <path
                  key={stroke.id}
                  d={stroke.pathData}
                  fill={stroke.color || '#000000'}
                  stroke="none"
                  fillRule="nonzero"
                />
              ))}
          </g>

          {/* Live Drawing Path on DRAW Layer (renders ON TOP of everything) */}
          {activeLayer === 'draw' && (
            <path
              ref={livePathRef}
              d=""
              fill={strokeColor}
              stroke="none"
              fillRule="nonzero"
              className="pointer-events-none"
            />
          )}

          {/* Live Visual Eraser Ring Cursor Indicator */}
          {toolMode === 'eraser' && eraserPos && (
            <circle
              cx={eraserPos.x}
              cy={eraserPos.y}
              r={eraserRadius}
              fill="rgba(244, 63, 94, 0.18)"
              stroke="rgba(244, 63, 94, 0.9)"
              strokeWidth={2}
              strokeDasharray="4 3"
              className="pointer-events-none"
            />
          )}
        </svg>

        {/* Canvas Background Fill Toast Notification */}
        {bgToastMessage && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-slate-700/80 text-slate-100 px-3.5 py-1.5 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in duration-150 backdrop-blur-md pointer-events-none transition-all ${
              isUiVisible ? 'top-18' : 'top-4'
            }`}
          >
            <span
              className="w-3.5 h-3.5 rounded-full border border-white/50 shadow-inner shrink-0"
              style={{ backgroundColor: canvasBgColor }}
            />
            <span className="text-xs font-semibold text-slate-200 tracking-wide">
              {bgToastMessage}
            </span>
          </div>
        )}

        {/* Deleted Frame Toast Notification */}
        {deletedFrameState && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-700 text-slate-100 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-3 animate-in fade-in duration-150 transition-all ${
              isUiVisible ? 'bottom-24' : 'bottom-4'
            }`}
          >
            <span className="text-xs text-slate-300">Frame deleted.</span>
            <button
              onClick={handleUndoDeleteFrame}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Undo
            </button>
            <button
              onClick={() => setDeletedFrameState(null)}
              className="text-slate-500 hover:text-slate-300 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </main>

      {/* Bottom Frame Navigation & Timeline Toolbar - Floating Glassmorphic Footer, Slide-Toggleable */}
      <footer
        className={`fixed bottom-0 left-0 right-0 h-18 sm:h-20 bg-slate-900/90 backdrop-blur-md border-t border-slate-800/80 px-3 md:px-6 flex flex-col justify-center gap-1.5 z-30 transition-all duration-300 ease-in-out ${
          isUiVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between gap-2 max-w-5xl mx-auto w-full">
          {/* Frame Navigation: Prev / Counter / Next - Icon Only */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Prev Frame - Icon Only */}
            <button
              onClick={goToPrevFrame}
              disabled={currentFrameIndex === 0}
              title="Previous frame (Left arrow)"
              aria-label="Previous frame"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-all border border-slate-700/60"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Current Frame Counter */}
            <div className="min-h-[44px] px-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-center text-xs font-mono font-medium text-slate-300 min-w-[70px]">
              <span className="font-bold text-slate-100 text-sm mr-1 tabular-nums">
                {currentFrameIndex + 1}
              </span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-400 ml-1 tabular-nums">{frames.length}</span>
            </div>

            {/* Next Frame - Icon Only */}
            <button
              onClick={goToNextFrame}
              disabled={currentFrameIndex === frames.length - 1}
              title="Next frame (Right arrow)"
              aria-label="Next frame"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-all border border-slate-700/60"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Central Frame Timeline Scroller */}
          <div className="flex-1 overflow-x-auto no-scrollbar mx-2 flex items-center gap-1.5 py-1 max-w-md">
            {frames.map((frame, index) => {
              const isActive = index === currentFrameIndex;
              return (
                <button
                  key={frame.id}
                  onClick={() => {
                    setCurrentFrameIndex(index);
                    if (isPlaying) setIsPlaying(false);
                  }}
                  title={`Jump to frame ${index + 1}`}
                  aria-label={`Frame ${index + 1}`}
                  className={`min-h-[40px] min-w-[36px] px-2.5 rounded-lg text-xs font-mono font-medium shrink-0 transition-all flex items-center justify-center gap-1 border ${
                    isActive
                      ? 'bg-slate-100 text-slate-950 font-bold border-white shadow-md scale-105'
                      : 'bg-slate-800/80 text-slate-400 border-slate-700/50 hover:bg-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span>{index + 1}</span>
                  {frame.strokes.length > 0 && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: isActive
                          ? '#000000'
                          : frame.strokes[0]?.color || '#94a3b8',
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Action Group: The Single Play/Pause Button & New Frame Button */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* The Single Primary Play/Pause Button - Icon Only */}
            <button
              onClick={() => setIsPlaying((p) => !p)}
              title={isPlaying ? 'Pause animation (Space)' : 'Play animation (Space)'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className={`min-h-[44px] min-w-[44px] sm:min-w-[48px] rounded-xl flex items-center justify-center transition-all shadow-md active:scale-95 border ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 shadow-amber-500/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-emerald-600/20'
              }`}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
            </button>

            {/* Clone Frame Button - Icon Only */}
            <button
              onClick={handleCloneCurrentFrame}
              title="Clone current frame with all strokes (D)"
              aria-label="Clone Frame"
              className="min-h-[44px] min-w-[44px] sm:min-w-[48px] rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-cyan-300 border border-slate-700/80 flex items-center justify-center shadow-md transition-all shrink-0"
            >
              <CopyPlus className="w-5 h-5 stroke-[2.2]" />
            </button>

            {/* New Frame Button - Icon Only */}
            <button
              onClick={handleAddNewFrame}
              title="Add new frame (+)"
              aria-label="New Frame"
              className="min-h-[44px] min-w-[44px] sm:min-w-[48px] rounded-xl bg-white hover:bg-slate-100 active:scale-95 text-slate-950 flex items-center justify-center shadow-md transition-all shrink-0"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </footer>

      {/* Floating Restore UI Button (Shown when UI is hidden in Zen mode) */}
      {!isUiVisible && (
        <button
          onClick={() => {
            setIsUiVisible(true);
            setBgToastMessage('UI Visible');
            setTimeout(() => setBgToastMessage(null), 1500);
          }}
          title="Zen mód kikapcsolása (Kattints ide, a tollra, vagy nyomj Tab, H, Esc)"
          aria-label="Zen mód kikapcsolása"
          className="fixed top-3 right-3 z-40 px-3.5 py-2 rounded-full bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-semibold transition-all hover:scale-105 active:scale-95 group animate-in fade-in duration-200 cursor-pointer"
        >
          <PenTool className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          <span className="hidden sm:inline">Zen mód ki (UI)</span>
          <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">Tab</span>
        </button>
      )}

      {/* Help Screen Modal Dialog - Featuring after-flash Name & PWA Status */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            {/* Header with after-flash Branding */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-black border border-slate-700 flex items-center justify-center text-emerald-400 font-bold text-lg shadow-inner">
                  ⚡
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xl text-white tracking-tight">after-flash</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-600/40 text-emerald-400 font-semibold uppercase">
                      PWA
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    High-performance vector animation, 64-color palette & pressure drawing
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                title="Close"
                aria-label="Close"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Help Content */}
            <div className="py-4 space-y-4 text-xs text-slate-300">
              {/* Pressure & Stylus Details */}
              <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Physical Pressure Calibration</span>
                </div>
                <p className="leading-relaxed text-slate-400">
                  • <strong>50% Pressure Baseline:</strong> At 50% physical pen pressure, stroke width matches your selected preset (6px, 12px, or 22px) exactly.
                </p>
                <p className="leading-relaxed text-slate-400">
                  • <strong>True Pressure:</strong> Lighter pressure naturally draws hair-thin strokes, and heavier pressure expands the line up to 2× thickness with zero artificial simulation.
                </p>
                <p className="leading-relaxed text-slate-400">
                  • <strong>Zero Latency:</strong> Real-time direct DOM streaming sticks to the stylus tip at full 60–120Hz display refresh rates.
                </p>
              </div>

              {/* 2-Layer System (Draw & Color) */}
              <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>2-Layer Architecture (Draw & Color)</span>
                </div>
                <p className="leading-relaxed text-slate-400">
                  • <strong>Draw (Top Layer):</strong> Default layer for linework, ink outlines, and sketches.
                </p>
                <p className="leading-relaxed text-slate-400">
                  • <strong>Color (Bottom Layer):</strong> Renders underneath the Draw layer so you can paint, shade, and fill without obscuring your black outlines.
                </p>
                <p className="leading-relaxed text-slate-400">
                  • <strong>Layer Switcher (<Layers className="w-3 h-3 inline text-cyan-400" />):</strong> Tap to toggle between Draw and Color layers.
                </p>
              </div>

              {/* Eraser Tool */}
              <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Eraser className="w-3.5 h-3.5 text-amber-400" />
                  <span>Vector Eraser</span>
                </div>
                <p className="leading-relaxed text-slate-400">
                  • <strong>Active Layer Only:</strong> Erasing on the Color layer leaves line art on the Draw layer completely untouched (and vice versa).
                </p>
                <p className="leading-relaxed text-slate-400">
                  • <strong>Adjustable Radius:</strong> The eraser size follows the 3 size presets (Fine, Medium, Bold) with a live visual ring. Full Undo / Redo supported.
                </p>
              </div>

              {/* 64 Colors & Canvas Fill Info */}
              <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-emerald-400" />
                  <span>64-Color Palette & Canvas Background</span>
                </div>
                <p className="leading-relaxed text-slate-400">
                  • <strong>64 Colors:</strong> Choose from an 8×8 grid of 64 curated artist shades (monochrome, warm tones, reds, pinks, oranges, golds, greens, blues, and violets).
                </p>
                <p className="leading-relaxed text-slate-400">
                  • <strong>Canvas Fill (<PaintBucket className="w-3 h-3 inline text-cyan-400" />):</strong> Instantly changes the entire canvas background to the currently active color.
                </p>
              </div>

              {/* Frame Clone */}
              <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <CopyPlus className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Frame Clone (<CopyPlus className="w-3 h-3 inline text-cyan-300" />)</span>
                </div>
                <p className="leading-relaxed text-slate-400">
                  • Duplicates the current frame with all its strokes from both Draw and Color layers into a new keyframe, perfect for incremental animation.
                </p>
              </div>

              {/* Toolbar Icons Directory */}
              <div>
                <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Tools & Icons
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
                      <PenTool className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Pen Tool</div>
                      <div className="text-[11px] text-slate-400">Pressure-sensitive vector drawing</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 shrink-0">
                      <Eraser className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Eraser Tool</div>
                      <div className="text-[11px] text-slate-400">Erases strokes on active layer</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 shrink-0">
                      <Layers className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Layer Switcher</div>
                      <div className="text-[11px] text-slate-400">Draw (Top) / Color (Bottom)</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-white shrink-0">
                      <Palette className="w-4 h-4 text-emerald-400" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">64-Color Palette</div>
                      <div className="text-[11px] text-slate-400">8×8 color swatches + custom hex</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
                      <PaintBucket className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Canvas Fill</div>
                      <div className="text-[11px] text-slate-400">Set canvas color to active color</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                      <Eye className="w-4 h-4 text-emerald-400" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Onion Skin</div>
                      <div className="text-[11px] text-slate-400">Ghost preview of previous frame</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-300 shrink-0">
                      <CopyPlus className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Clone Frame</div>
                      <div className="text-[11px] text-slate-400">Duplicate keyframe with all strokes</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0">
                      <FileDown className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Save Frame (SVG & PNG)</div>
                      <div className="text-[11px] text-slate-400">Save active frame with transparent or colored background</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-purple-500/50 flex items-center justify-center text-amber-300 shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">AI Palette (Google Gemma)</div>
                      <div className="text-[11px] text-slate-400">Open-weight AI model (ai.google.dev/gemma) for artistic palette generation</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                      <PenTool className="w-4 h-4 text-emerald-400" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Toggle UI / Zen Mode</div>
                      <div className="text-[11px] text-slate-400">Click lead pen icon, press Tab, H, or Esc to toggle full-screen canvas</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progressive Web App (PWA) Offline & Install Guide */}
              <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-1.5">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>PWA & Offline Capability</span>
                </div>
                <p className="leading-relaxed text-slate-400">
                  <strong>after-flash</strong> is a full Progressive Web App. It caches application assets locally so you can draw anywhere even without internet. Tap the 3 dots in Chrome and select <em>"Add to Home screen"</em> or <em>"Install App"</em> to launch in full-screen standalone mode.
                </p>
              </div>

              {/* Keyboard Shortcuts */}
              <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-1.5">
                <div className="font-semibold text-white">Keyboard Shortcuts</div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">Tab / H</kbd> Toggle UI (Zen Mode)</div>
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">Space</kbd> Play / Pause</div>
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">← / →</kbd> Prev / Next Frame</div>
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">E</kbd> Toggle Eraser</div>
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">B / P</kbd> Pen Mode</div>
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">L</kbd> Switch Layer (Draw / Color)</div>
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">D</kbd> Clone Current Frame</div>
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">G</kbd> AI Palette Generator</div>
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">Ctrl + Z</kbd> Undo stroke or erase</div>
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">?</kbd> Toggle Help screen</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save & Export Frame Modal Dialog */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl text-slate-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileDown className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold text-base text-white">Save Current Frame</h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                title="Close"
                aria-label="Close"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="py-4 space-y-4">
              <div className="text-xs text-slate-400 leading-relaxed">
                The current active frame (Frame {currentFrameIndex + 1}) will be exported at full canvas resolution ({dimensions.width} × {dimensions.height} px) as <span className="font-mono text-emerald-400 font-medium">after-flas-{"{random}"}</span>.
              </div>

              {/* Statistics & Preview Info */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                <div>
                  <div className="text-slate-500">Strokes in Frame</div>
                  <div className="font-mono font-semibold text-slate-200 text-sm mt-0.5 tabular-nums">
                    {currentFrame.strokes.length} strokes
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Dimensions</div>
                  <div className="font-mono font-semibold text-slate-200 text-sm mt-0.5">
                    {dimensions.width} × {dimensions.height} px
                  </div>
                </div>
              </div>

              {/* Transparent Background Option Toggle */}
              <div
                onClick={() => setTransparentBg((prev) => !prev)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  transparentBg
                    ? 'bg-emerald-950/40 border-emerald-500/60 shadow-sm'
                    : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Visual Checkerboard or Solid Swatch */}
                  <div
                    className="w-8 h-8 rounded-lg border border-white/20 shrink-0 overflow-hidden relative shadow-inner"
                    style={{
                      backgroundImage: transparentBg
                        ? 'linear-gradient(45deg, #334155 25%, transparent 25%), linear-gradient(-45deg, #334155 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #334155 75%), linear-gradient(-45deg, transparent 75%, #334155 75%)'
                        : 'none',
                      backgroundSize: '8px 8px',
                      backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                      backgroundColor: transparentBg ? '#0f172a' : canvasBgColor,
                    }}
                    title={transparentBg ? 'Transparent Background' : `Canvas Color: ${canvasBgColor}`}
                  />
                  <div>
                    <div className="font-semibold text-xs text-slate-200 flex items-center gap-1.5">
                      <span>Transparent background</span>
                      <span className="text-[10px] text-slate-400 font-normal">(Átlátszó háttér)</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {transparentBg
                        ? 'Alpha channel preserved, no background fill'
                        : `Solid background fill (${canvasBgColor})`}
                    </div>
                  </div>
                </div>

                <div className="relative inline-flex items-center shrink-0">
                  <input
                    type="checkbox"
                    checked={transparentBg}
                    onChange={(e) => setTransparentBg(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={`w-11 h-6 rounded-full transition-colors ${
                      transparentBg ? 'bg-emerald-600' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform transform mt-1 ml-1 ${
                        transparentBg ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={handleCopySvgCode}
                className="min-h-[42px] px-3.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1.5 transition-colors border border-slate-700 active:scale-95"
              >
                {svgCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied SVG!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy SVG</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    handleSaveCurrentFramePng();
                    setShowExportModal(false);
                  }}
                  disabled={isPngExporting}
                  className="flex-1 sm:flex-none min-h-[42px] px-3.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                  title="Download as transparent raster PNG"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Download PNG</span>
                </button>

                <button
                  onClick={() => {
                    handleSaveCurrentFrameSvg();
                    setShowExportModal(false);
                  }}
                  className="flex-1 sm:flex-none min-h-[42px] px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 transition-all active:scale-95"
                  title="Download as vector SVG"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Download SVG</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tablet Connection & QR Modal */}
      {showTabletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Tablet className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-base text-white">Open on Android Tablet</h3>
              </div>
              <button
                onClick={() => setShowTabletModal(false)}
                title="Close"
                aria-label="Close"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="py-4 space-y-4">
              {/* QR Code and Quick Scan */}
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-950 rounded-xl border border-slate-800">
                <div className="p-2 bg-white rounded-xl shadow-md shrink-0">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=${encodeURIComponent(
                      appShareUrl
                    )}`}
                    alt="Tablet QR Code"
                    className="w-36 h-36 sm:w-40 sm:h-40 block"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="space-y-2 text-center sm:text-left">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-800/50 text-[11px] font-medium text-cyan-300">
                    <QrCode className="w-3 h-3" />
                    <span>Camera Scan</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Point your tablet's camera or QR code scanner at this code to open the drawing canvas immediately.
                  </p>
                </div>
              </div>

              {/* Direct Web URL */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">Direct Web Address (URL):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={appShareUrl}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 select-all focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleCopyAppUrl}
                    className="min-h-[38px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700 shrink-0"
                  >
                    {urlCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <a
                    href={appShareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-[38px] px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Open</span>
                  </a>
                </div>
              </div>

              {/* Step by Step Tablet Guide */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Tips for the best tablet drawing experience:
                </h4>
                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-800/40">
                    <span className="w-5 h-5 rounded-full bg-cyan-900/60 text-cyan-300 font-bold flex items-center justify-center shrink-0 text-[10px]">
                      1
                    </span>
                    <p>
                      <strong>Open in Chrome or Samsung Internet</strong> by scanning the QR code or visiting the URL above.
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-800/40">
                    <span className="w-5 h-5 rounded-full bg-cyan-900/60 text-cyan-300 font-bold flex items-center justify-center shrink-0 text-[10px]">
                      2
                    </span>
                    <p>
                      <strong>Full-Screen Mode (Add to Home screen):</strong> Tap the <strong>3-dots menu (⋮)</strong> in Chrome and tap <em>„Add to Home screen”</em> (or <em>„Install App”</em>). The browser address bar will disappear, running like a native tablet drawing app!
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-800/40">
                    <span className="w-5 h-5 rounded-full bg-cyan-900/60 text-cyan-300 font-bold flex items-center justify-center shrink-0 text-[10px]">
                      3
                    </span>
                    <p>
                      <strong>S-Pen / Stylus Pressure:</strong> The canvas directly detects hardware physical pressure. Light touch draws delicate hairlines; firmer pressure creates rich, bold ink strokes.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowTabletModal(false)}
                className="min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Color Palette Modal (Powered by Google Gemma Open Weights) */}
      {showAiPaletteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-4 sm:p-5 shadow-2xl text-slate-100 max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-md shadow-emerald-950/50">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base sm:text-lg text-white">AI Color Palette</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/50 text-emerald-300 font-semibold uppercase flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Gemma Open Model
                    </span>
                    <a
                      href="https://ai.google.dev/gemma/docs"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 underline flex items-center gap-0.5 font-medium"
                      title="Google Gemma Documentation"
                    >
                      <span>ai.google.dev/gemma</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Generate artistic, cohesive color palettes using Google's open-weights Gemma model family
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAiPaletteModal(false)}
                title="Close"
                aria-label="Close"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="py-3.5 space-y-4 overflow-y-auto pr-1">
              {/* Quick Inspiration Chips */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Inspiration Suggestions:</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Cyberpunk Neon',
                    'Őszi erdő',
                    'Tokyo Rain',
                    'Pastel Anime',
                    'Sunset Glow',
                    'Dark Gothic',
                    'Desert Dunes',
                    'Deep Ocean',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setAiPrompt(preset);
                        handleGenerateAiPalette(preset, aiPaletteMode);
                      }}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-indigo-900/60 text-slate-300 hover:text-indigo-200 border border-slate-700/60 hover:border-indigo-600/60 transition-colors cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Form & Mode Selector */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleGenerateAiPalette();
                }}
                className="space-y-2.5 bg-slate-950/70 p-3 rounded-xl border border-slate-800"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Enter word or mood (e.g. 'retro synthwave', 'vadvirágos mező')..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    disabled={aiLoading}
                  />
                  <button
                    type="submit"
                    disabled={aiLoading || !aiPrompt.trim()}
                    className="min-h-[38px] px-4 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-950/40 disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95 shrink-0"
                  >
                    {aiLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Generate</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Palette Size Mode Radio & Save JSON Button */}
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]">Palette format:</span>
                    <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setAiPaletteMode('8')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          aiPaletteMode === '8'
                            ? 'bg-indigo-600 text-white font-medium shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        8 Curated
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiPaletteMode('64')}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          aiPaletteMode === '64'
                            ? 'bg-indigo-600 text-white font-medium shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        64 Studio
                      </button>
                    </div>
                  </div>

                  {/* Save Palette as JSON Button directly on the form */}
                  <button
                    type="button"
                    onClick={handleSavePaletteAsJson}
                    title="A generált paletta mentése JSON fájlként (.json) / Save palette as JSON"
                    className="min-h-[32px] px-3 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-300 hover:text-emerald-200 border border-emerald-600/50 flex items-center gap-1.5 text-xs font-semibold transition-all active:scale-95 shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Mentés JSON-ként</span>
                  </button>
                </div>
              </form>

              {/* Error Message */}
              {aiError && (
                <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-xs text-red-200 flex items-center justify-between gap-2">
                  <span>{aiError}</span>
                  <button
                    type="button"
                    onClick={() => handleGenerateAiPalette()}
                    className="text-[11px] font-semibold underline hover:text-white"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Loading State Banner */}
              {aiLoading && (
                <div className="p-6 bg-slate-950/50 border border-indigo-900/40 rounded-xl flex flex-col items-center justify-center gap-3 text-center animate-in fade-in">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
                    <Sparkles className="w-5 h-5 text-amber-400 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      Generating palette for "{aiPrompt}"...
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Google Gemma (Open Weights) is harmonizing colors, light & shadow contrasts
                    </div>
                  </div>
                </div>
              )}

              {/* Generated Palette Display */}
              {generatedAiPalette && !aiLoading && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {/* Palette Header Banner */}
                  <div className="p-3 bg-gradient-to-r from-slate-950 to-emerald-950/30 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-white flex items-center gap-2 flex-wrap">
                        <span>{generatedAiPalette.paletteName}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                          {generatedAiPalette.colors.length} shades
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 font-medium">
                          {generatedAiPalette.modelUsed || 'Google Gemma (Open Model)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 italic truncate">
                        "{generatedAiPalette.themeDescription}"
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Save JSON button in generated palette header */}
                      <button
                        type="button"
                        onClick={handleSavePaletteAsJson}
                        title={`Paletta mentése JSON-ként (${generatedAiPalette.paletteName}.json)`}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 flex items-center gap-1.5 text-xs font-medium transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="hidden sm:inline">Mentés JSON</span>
                      </button>

                      {/* Quick Canvas Fill with suggested background */}
                      <button
                        onClick={() => handleFillCanvasBackground(generatedAiPalette.recommendedBackground)}
                        title={`Fill canvas background with ${generatedAiPalette.recommendedBackground}`}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 flex items-center gap-1.5 text-xs font-medium transition-colors shrink-0"
                      >
                        <PaintBucket className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Set BG</span>
                        <span
                          className="w-3 h-3 rounded-full border border-white/40"
                          style={{ backgroundColor: generatedAiPalette.recommendedBackground }}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Swatches Grid */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Generated Swatches (tap any color to draw with it):</span>
                    </div>

                    {/* 8-Color Detailed Cards */}
                    {generatedAiPalette.colors.length <= 16 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {generatedAiPalette.colors.map((c, idx) => (
                          <button
                            key={`${c.hex}-${idx}`}
                            onClick={() => {
                              setStrokeColor(c.hex);
                              setBgToastMessage(`Color selected: ${c.name} (${c.hex})`);
                              setTimeout(() => setBgToastMessage(null), 1800);
                            }}
                            className={`p-2 rounded-xl bg-slate-950 border text-left transition-all hover:scale-[1.02] active:scale-95 group ${
                              strokeColor === c.hex
                                ? 'border-emerald-400 ring-2 ring-emerald-400/40 shadow-md'
                                : 'border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div
                              className="w-full h-10 rounded-lg border border-white/20 shadow-inner flex items-end justify-end p-1 mb-1.5 relative overflow-hidden"
                              style={{ backgroundColor: c.hex }}
                            >
                              {strokeColor === c.hex && (
                                <span className="p-0.5 rounded-full bg-slate-950/80 text-emerald-400">
                                  <Check className="w-3 h-3" />
                                </span>
                              )}
                            </div>
                            <div className="font-semibold text-xs text-white truncate">{c.name}</div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-0.5">
                              <span>{c.hex}</span>
                              {c.role && (
                                <span className="text-[9px] uppercase tracking-wider px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                                  {c.role}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      /* 64-Color compact grid */
                      <div className="grid grid-cols-8 gap-1.5 p-2 bg-slate-950 rounded-xl border border-slate-800">
                        {generatedAiPalette.colors.map((c, idx) => (
                          <button
                            key={`${c.hex}-${idx}`}
                            onClick={() => {
                              setStrokeColor(c.hex);
                              setBgToastMessage(`Selected: ${c.name} (${c.hex})`);
                              setTimeout(() => setBgToastMessage(null), 1800);
                            }}
                            title={`${c.name} (${c.hex}) - ${c.role || ''}`}
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md transition-all active:scale-90 border ${
                              strokeColor === c.hex
                                ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900 scale-105 border-white'
                                : 'border-white/15 hover:scale-110'
                            }`}
                            style={{ backgroundColor: c.hex }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
              {activePaletteName !== 'Classic Studio 64' ? (
                <button
                  onClick={handleRestoreDefaultPalette}
                  className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Restore Classic 64</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                {generatedAiPalette && (
                  <button
                    type="button"
                    onClick={handleSavePaletteAsJson}
                    title="Paletta mentése JSON fájlként / Save as JSON"
                    className="min-h-[40px] px-3 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Mentés JSON</span>
                  </button>
                )}

                {generatedAiPalette && (
                  <button
                    onClick={() => {
                      handleApplyAiPaletteAsActive();
                      setShowAiPaletteModal(false);
                    }}
                    className="min-h-[40px] px-3.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-950/40 transition-all active:scale-95"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply to Studio Palette</span>
                  </button>
                )}

                <button
                  onClick={() => setShowAiPaletteModal(false)}
                  className="min-h-[40px] px-4 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
