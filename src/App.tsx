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
} from 'lucide-react';
import {
  Frame,
  VectorStroke,
  generateStrokePath,
  frameToSvgString,
  downloadSvg,
} from './utils/stroke.ts';

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
      // Exact physical pressure: at 0.5 width is exactly baseSize. Clamp minimum so ultra-light contact doesn't break.
      const p = e.pressure > 0 ? Math.max(0.04, Math.min(1.0, e.pressure)) : 0.5;

      const initialPoint: [number, number, number] = [px, py, p];
      currentPointsRef.current = [initialPoint];

      const initialPath = generateStrokePath(currentPointsRef.current, strokeSize);
      livePathRef.current?.setAttribute('d', initialPath);
    },
    [isPlaying, strokeSize]
  );

  // Zero-latency Pointer Move (Direct DOM update without React re-render)
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDrawingRef.current) return;

      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Extract high-frequency coalesced events from stylus hardware if available
      const native = e.nativeEvent;
      const events =
        native && typeof (native as any).getCoalescedEvents === 'function'
          ? (native as any).getCoalescedEvents()
          : [e];

      for (let i = 0; i < events.length; i++) {
        const evt = events[i];
        const px = evt.clientX - rect.left;
        const py = evt.clientY - rect.top;
        const p = evt.pressure > 0 ? Math.max(0.04, Math.min(1.0, evt.pressure)) : 0.5;
        currentPointsRef.current.push([px, py, p]);
      }

      const path = generateStrokePath(currentPointsRef.current, strokeSize);
      livePathRef.current?.setAttribute('d', path);
    },
    [strokeSize]
  );

  // Pointer Up: Commit stroke once to React state
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }

      const finalPath = livePathRef.current?.getAttribute('d') || '';
      livePathRef.current?.setAttribute('d', '');

      if (currentPointsRef.current.length > 0 && finalPath) {
        const newStroke: VectorStroke = {
          id: `stroke-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          points: [...currentPointsRef.current],
          pathData: finalPath,
          baseSize: strokeSize,
        };

        setFrames((prev) =>
          prev.map((frame, idx) => {
            if (idx !== currentFrameIndex) return frame;
            return {
              ...frame,
              strokes: [...frame.strokes, newStroke],
              undoStack: [],
            };
          })
        );
      }

      currentPointsRef.current = [];
    },
    [currentFrameIndex, strokeSize]
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

  // Undo stroke
  const handleUndo = () => {
    setFrames((prev) =>
      prev.map((frame, idx) => {
        if (idx !== currentFrameIndex || frame.strokes.length === 0) return frame;
        const lastStroke = frame.strokes[frame.strokes.length - 1];
        return {
          ...frame,
          strokes: frame.strokes.slice(0, -1),
          undoStack: [...frame.undoStack, lastStroke],
        };
      })
    );
  };

  // Redo stroke
  const handleRedo = () => {
    setFrames((prev) =>
      prev.map((frame, idx) => {
        if (idx !== currentFrameIndex || frame.undoStack.length === 0) return frame;
        const strokeToRestore = frame.undoStack[frame.undoStack.length - 1];
        return {
          ...frame,
          strokes: [...frame.strokes, strokeToRestore],
          undoStack: frame.undoStack.slice(0, -1),
        };
      })
    );
  };

  // Export current frame to SVG
  const handleSaveCurrentFrameSvg = () => {
    const svgCode = frameToSvgString(
      currentFrame,
      dimensions.width,
      dimensions.height,
      !transparentBg
    );
    const fileName = `vector_drawing_frame_${currentFrameIndex + 1}.svg`;
    downloadSvg(svgCode, fileName);
  };

  // Copy SVG Code
  const handleCopySvgCode = async () => {
    const svgCode = frameToSvgString(
      currentFrame,
      dimensions.width,
      dimensions.height,
      !transparentBg
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
      } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShowHelpModal((h) => !h);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFrameIndex, frames.length]);

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
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 select-none overflow-hidden font-sans">
      {/* Top Application Bar - Clean Icon-Only Controls, No Top Play Button */}
      <header className="h-14 shrink-0 bg-slate-900 border-b border-slate-800 px-3 md:px-5 flex items-center justify-between gap-2 sm:gap-3 z-30">
        {/* Left: App Logo & Frame Counter */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-black border border-slate-700 flex items-center justify-center text-white shrink-0 shadow-inner">
            <PenTool className="w-4 h-4 text-emerald-400" />
          </div>

          {/* Frame count badge */}
          <div className="flex items-center text-xs text-slate-400 border-l border-slate-800 pl-2 sm:pl-3 font-mono">
            <span className="font-semibold text-slate-200 tabular-nums">
              {currentFrameIndex + 1}
            </span>
            <span className="mx-1 text-slate-500">/</span>
            <span className="text-slate-400 tabular-nums">{frames.length}</span>
          </div>
        </div>

        {/* Center: Stroke Width & Undo/Redo - Icon Only */}
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
            <Layers className="w-4 h-4" />
          </button>

          {/* Undo Button - Icon Only */}
          <button
            onClick={handleUndo}
            disabled={currentFrame.strokes.length === 0}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-colors border border-slate-700/50 active:scale-95"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Redo Button - Icon Only */}
          <button
            onClick={handleRedo}
            disabled={currentFrame.undoStack.length === 0}
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
              title="Install app to tablet home screen"
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

          {/* Export Frame to SVG - Icon Only */}
          <button
            onClick={() => setShowExportModal(true)}
            title="Export frame as SVG vector"
            aria-label="Export SVG"
            className="min-h-[38px] min-w-[38px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-950/40 transition-all active:scale-95"
          >
            <FileDown className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Full-Screen Canvas Drawing Workspace (Zero Margins, Edge-to-Edge) */}
      <main
        ref={containerRef}
        className="flex-1 w-full h-full relative overflow-hidden bg-white select-none"
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
        >
          {/* White Background */}
          <rect width={dimensions.width} height={dimensions.height} fill="#ffffff" />

          {/* Onion Skinning: Previous frame strokes in faint gray */}
          {onionSkin && previousFrame && !isPlaying && (
            <g id="onion-skin-layer" opacity={0.3} className="pointer-events-none">
              {previousFrame.strokes.map((stroke) => (
                <path
                  key={`onion-${stroke.id}`}
                  d={stroke.pathData}
                  fill="#64748b"
                  stroke="none"
                />
              ))}
            </g>
          )}

          {/* Current Frame Saved Vector Strokes */}
          <g id="current-frame-layer">
            {currentFrame.strokes.map((stroke) => (
              <path
                key={stroke.id}
                d={stroke.pathData}
                fill="#000000"
                stroke="none"
                fillRule="nonzero"
              />
            ))}
          </g>

          {/* Zero-Latency Live Drawing Path (Direct DOM manipulated) */}
          <path
            ref={livePathRef}
            d=""
            fill="#000000"
            stroke="none"
            fillRule="nonzero"
            className="pointer-events-none"
          />
        </svg>

        {/* Deleted Frame Toast Notification */}
        {deletedFrameState && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-700 text-slate-100 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
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

      {/* Bottom Frame Navigation & Timeline Toolbar - Icon Only, Single Play Button */}
      <footer className="h-18 sm:h-20 shrink-0 bg-slate-900 border-t border-slate-800 px-3 md:px-6 flex flex-col justify-center gap-1.5 z-30">
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
                      className={`w-1.5 h-1.5 rounded-full ${
                        isActive ? 'bg-slate-900' : 'bg-slate-500'
                      }`}
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

            {/* New Frame Button - Icon Only */}
            <button
              onClick={handleAddNewFrame}
              title="Add new frame"
              aria-label="New Frame"
              className="min-h-[44px] min-w-[44px] sm:min-w-[48px] rounded-xl bg-white hover:bg-slate-100 active:scale-95 text-slate-950 flex items-center justify-center shadow-md transition-all shrink-0"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </footer>

      {/* Help Screen Modal Dialog */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-base text-white">Help & Icon Guide</h3>
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
                  • <strong>50% Pressure Baseline:</strong> At 50% physical pen pressure, the stroke width matches your selected preset (6px, 12px, or 22px) exactly.
                </p>
                <p className="leading-relaxed text-slate-400">
                  • <strong>True Pressure:</strong> Lighter pressure naturally draws hair-thin strokes, and heavier pressure expands the line up to 2× thickness with zero artificial simulation.
                </p>
                <p className="leading-relaxed text-slate-400">
                  • <strong>Zero Latency:</strong> The line directly sticks to the stylus tip at full 60–120Hz display refresh rates.
                </p>
              </div>

              {/* Toolbar Icons Directory */}
              <div>
                <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Header Icons
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                      <Layers className="w-4 h-4 text-emerald-400" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Onion Skin</div>
                      <div className="text-[11px] text-slate-400">Ghost preview of previous frame</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                      <Undo2 className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Undo / Redo</div>
                      <div className="text-[11px] text-slate-400">Undo or restore previous strokes</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-red-950/40 border border-red-800/40 flex items-center justify-center text-red-400 shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Delete Frame</div>
                      <div className="text-[11px] text-slate-400">Remove current frame (with undo)</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0">
                      <FileDown className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Export SVG</div>
                      <div className="text-[11px] text-slate-400">Download resolution-free vector file</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
                      <Tablet className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Tablet Link</div>
                      <div className="text-[11px] text-slate-400">QR code & tablet connection</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Navigation Icons */}
              <div>
                <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Bottom Navigation
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0">
                      <Play className="w-4 h-4 fill-current" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">Play / Pause</div>
                      <div className="text-[11px] text-slate-400">Play/pause the animation loop</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="w-8 h-8 rounded-lg bg-white text-slate-950 flex items-center justify-center shrink-0">
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                    </span>
                    <div>
                      <div className="font-semibold text-white">New Frame</div>
                      <div className="text-[11px] text-slate-400">Add a blank frame ready to draw</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Keyboard Shortcuts */}
              <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-1.5">
                <div className="font-semibold text-white">Keyboard Shortcuts</div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">Space</kbd> Play / Pause</div>
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">← / →</kbd> Prev / Next Frame</div>
                  <div><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">Ctrl + Z</kbd> Undo stroke</div>
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

      {/* SVG Export Modal Dialog */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl text-slate-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold text-base text-white">Export Frame to SVG</h3>
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
                The current frame (Frame {currentFrameIndex + 1}) will be exported as a standard vector SVG file matching your full canvas resolution ({dimensions.width} × {dimensions.height}).
              </div>

              {/* Statistics & Preview Info */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                <div>
                  <div className="text-slate-500">Strokes</div>
                  <div className="font-mono font-semibold text-slate-200 text-sm mt-0.5 tabular-nums">
                    {currentFrame.strokes.length} strokes
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Canvas Dimensions</div>
                  <div className="font-mono font-semibold text-slate-200 text-sm mt-0.5">
                    {dimensions.width} × {dimensions.height}
                  </div>
                </div>
              </div>

              {/* Background option toggle */}
              <label className="flex items-center justify-between text-xs text-slate-300 p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 cursor-pointer">
                <span>Transparent background (no white fill)</span>
                <input
                  type="checkbox"
                  checked={transparentBg}
                  onChange={(e) => setTransparentBg(e.target.checked)}
                  className="rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 h-4 w-4 bg-slate-900"
                />
              </label>

              {/* Animation Playback Speed Setting */}
              <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 space-y-1.5">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Playback speed (FPS):</span>
                  <span className="font-mono text-emerald-400 font-semibold">{fps} FPS</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="24"
                  step="1"
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={handleCopySvgCode}
                className="min-h-[44px] px-3.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                {svgCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy SVG Code</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  handleSaveCurrentFrameSvg();
                  setShowExportModal(false);
                }}
                className="min-h-[44px] px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 transition-all active:scale-95"
              >
                <FileDown className="w-4 h-4" />
                <span>Download SVG (.svg)</span>
              </button>
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
    </div>
  );
}
