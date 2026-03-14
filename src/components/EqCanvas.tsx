"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { EqBand } from "@/lib/audioEngine";

interface EqCanvasProps {
  bands: EqBand[];
  setBands?: React.Dispatch<React.SetStateAction<EqBand[]>>;
  scaleType: "linear" | "audiogram";
  readOnly?: boolean;
}

export default function EqCanvas({ bands, setBands, scaleType, readOnly = false }: EqCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const MIN_FREQ = 20;
  const MAX_FREQ = 20000;
  const MIN_GAIN = 0;
  const MAX_GAIN = 2; // Actually FabFilter uses dB, but we'll stick to 0-2 multipliers to not break the audio engine. 1 = 0dB.

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
      }
    });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const freqToX = useCallback((freq: number) => {
    const w = dimensions.width;
    if (scaleType === "linear") {
      return ((freq - MIN_FREQ) / (MAX_FREQ - MIN_FREQ)) * w;
    } else {
      const minLog = Math.log10(MIN_FREQ);
      const maxLog = Math.log10(MAX_FREQ);
      return Math.max(0, Math.min(w, ((Math.log10(freq) - minLog) / (maxLog - minLog)) * w));
    }
  }, [dimensions.width, scaleType]);

  const xToFreq = useCallback((x: number) => {
    const w = dimensions.width;
    const ratio = Math.max(0, Math.min(1, x / w));
    if (scaleType === "linear") {
      return MIN_FREQ + ratio * (MAX_FREQ - MIN_FREQ);
    } else {
      const minLog = Math.log10(MIN_FREQ);
      const maxLog = Math.log10(MAX_FREQ);
      return Math.pow(10, minLog + ratio * (maxLog - minLog));
    }
  }, [dimensions.width, scaleType]);

  const gainToY = useCallback((gain: number) => {
    const h = dimensions.height;
    const clampedGain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, gain));
    return h - (clampedGain / MAX_GAIN) * h;
  }, [dimensions.height]);

  const yToGain = useCallback((y: number) => {
    const h = dimensions.height;
    const ratio = Math.max(0, Math.min(1, y / h));
    return MAX_GAIN * (1 - ratio);
  }, [dimensions.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    // Don't trigger if dimensions are 0
    if (dimensions.width === 0 || dimensions.height === 0) return;

    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const w = dimensions.width;
    const h = dimensions.height;

    ctx.clearRect(0, 0, w, h);

    // Grid lines - FabFilter has a dark grey grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;

    // Draw vertical freq lines
    const freqsToDraw = scaleType === "audiogram" 
      ? [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
      : [0, 5000, 10000, 15000, 20000];
      
    ctx.beginPath();
    freqsToDraw.forEach(f => {
      const x = freqToX(f);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    });

    // Draw horizontal gain lines (0.5, 1.0, 1.5)
    [0.5, 1.0, 1.5].forEach(gain => {
        const y = gainToY(gain);
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
    });
    ctx.stroke();

    // The EQ Curve (Total Response)
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";

    const numPoints = Math.min(w, 800); // Optimization
    const step = w / numPoints;
    
    // Create an array to hold the curve points to easily fill it
    ctx.moveTo(0, h);
    
    let firstY = 0;
    for (let i = 0; i <= numPoints; i++) {
      const x = i * step;
      const freq = xToFreq(x);
      let binGain = 1.0;
      for (const band of bands) {
        // Broaden the Q visual mathematically to look better in Hz space
        // FabFilter usually draws in log scale, this is an approximation for linear/log canvas
        const bandwidth = band.frequency / Math.max(0.1, band.q);
        const dist = Math.abs(freq - band.frequency);
        const influence = Math.exp(-0.5 * Math.pow(dist / (bandwidth / 2), 2));
        binGain += influence * (band.gain - 1.0);
      }
      binGain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, binGain));
      
      const y = gainToY(binGain);
      if (i === 0) {
        ctx.lineTo(0, y);
        firstY = y;
      }
      else {
          ctx.lineTo(x, y);
      }
    }
    
    // To fill it properly, go back down to the bottom
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Now stroke only the top curve
    ctx.beginPath();
    for (let i = 0; i <= numPoints; i++) {
        const x = i * step;
        const freq = xToFreq(x);
        let binGain = 1.0;
        for (const band of bands) {
          const bandwidth = band.frequency / Math.max(0.1, band.q);
          const dist = Math.abs(freq - band.frequency);
          const influence = Math.exp(-0.5 * Math.pow(dist / (bandwidth / 2), 2));
          binGain += influence * (band.gain - 1.0);
        }
        binGain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, binGain));
        const y = gainToY(binGain);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw Node Handles
    bands.forEach(band => {
      const x = freqToX(band.frequency);
      const y = gainToY(band.gain);
      const isSelected = selectedNode === band.id;
      const isDragging = draggingNode === band.id;

      ctx.beginPath();
      // Outer glow for selected
      if (isSelected) {
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fill();
        ctx.beginPath();
      }

      ctx.arc(x, y, isSelected || isDragging ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isDragging ? "#ffffff" : isSelected ? "#eab308" : "#888888";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isSelected ? "#ffffff" : "#444444";
      ctx.stroke();
    });

  }, [dimensions, bands, scaleType, freqToX, gainToY, xToFreq, draggingNode, selectedNode]);

  const getMousePos = (e: React.PointerEvent | React.MouseEvent | React.WheelEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly || !setBands) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = getMousePos(e);
    
    let clickedNode: string | null = null;
    for (const band of [...bands].reverse()) {
      const bx = freqToX(band.frequency);
      const by = gainToY(band.gain);
      if (Math.hypot(bx - x, by - y) < 20) {
        clickedNode = band.id;
        break;
      }
    }

    setDraggingNode(clickedNode);
    if (clickedNode) setSelectedNode(clickedNode);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (readOnly || !draggingNode || !setBands) return;
    const { x, y } = getMousePos(e);
    
    const newFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x)));
    const newGain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, yToGain(y)));

    setBands(prev => prev.map(b => 
      b.id === draggingNode ? { ...b, frequency: newFreq, gain: newGain } : b
    ));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setDraggingNode(null);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (readOnly || !setBands) return;
    const { x, y } = getMousePos(e);
    const freq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x)));
    const gain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, yToGain(y)));
    
    const newId = Math.random().toString(36).substring(7);
    setBands(prev => [...prev, {
      id: newId,
      frequency: freq,
      gain,
      q: 1,
    }]);
    setSelectedNode(newId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (readOnly || !setBands) return;
    e.preventDefault(); // Might not work here passively, see useEffect below

    let targetNode = selectedNode;
    // If no node selected, try to find hovered node
    if (!targetNode) {
      const { x, y } = getMousePos(e);
      for (const band of [...bands].reverse()) {
        const bx = freqToX(band.frequency);
        const by = gainToY(band.gain);
        if (Math.hypot(bx - x, by - y) < 20) {
          targetNode = band.id;
          break;
        }
      }
    }

    if (targetNode) {
      const isNarrowing = e.deltaY > 0;
      const delta = isNarrowing ? 0.2 : -0.2; // Increase Q to narrow, decrease to widen
      setBands(prev => prev.map(b => {
        if (b.id === targetNode) {
          return { ...b, q: Math.max(0.1, Math.min(20, b.q + delta)) };
        }
        return b;
      }));
    }
  };

  // Prevent default scroll when wheeling on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const preventScroll = (e: Event) => e.preventDefault();
    canvas?.addEventListener('wheel', preventScroll, { passive: false });
    return () => canvas?.removeEventListener('wheel', preventScroll);
  }, []);

  const handleClickOutside = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) return;
    if (!readOnly && !draggingNode) {
        setSelectedNode(null);
    }
  }

  // Prevent drag overlay from bubbling event down when adjusting sliders on overlay
  const stopPropagation = (e: React.UIEvent) => {
      e.stopPropagation();
  };

  return (
    <div ref={containerRef} className={`w-full h-full relative ${readOnly ? '' : 'cursor-crosshair'} bg-[#141414] overflow-hidden rounded-xl shadow-xl`} onClick={handleClickOutside}>
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />

      {/* Floating Node Controls Overlay */}
      {selectedNode && !readOnly && dimensions.width > 0 && (
          (() => {
              const band = bands.find(b => b.id === selectedNode);
              if (!band) return null;
              
              const x = freqToX(band.frequency);
              const y = gainToY(band.gain);
              
              const tooltipWidth = 180;
              const tooltipHeight = 100;
              let left = x - tooltipWidth / 2;
              let top = y + 20;

              if (left < 10) left = 10;
              if (left + tooltipWidth > dimensions.width - 10) left = dimensions.width - tooltipWidth - 10;
              
              if (top + tooltipHeight > dimensions.height - 10) {
                  top = y - tooltipHeight - 30; // Flip above
              }

              return (
                <div 
                  className="absolute z-20 bg-[#1c1c1c]/95 backdrop-blur-md border border-zinc-700/50 rounded-lg p-3 shadow-2xl flex flex-col gap-2 scale-100 transition-transform origin-top"
                  style={{ left, top, width: tooltipWidth }}
                  onClick={stopPropagation}
                  onPointerDown={stopPropagation}
                  onWheel={stopPropagation}
                  onDoubleClick={stopPropagation}
                >
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Band Settings</span>
                        <button onClick={() => {
                            setBands && setBands(prev => prev.filter(b => b.id !== band.id));
                            setSelectedNode(null);
                        }} className="text-zinc-500 hover:text-red-400 text-xs">✕</button>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-zinc-500 w-8">Freq</label>
                        <input type="range" min="20" max="20000" value={band.frequency} onChange={e => setBands && setBands(prev => prev.map(b => b.id === band.id ? {...b, frequency: Number(e.target.value)} : b))} className="flex-1 accent-white h-1 bg-zinc-800 rounded-full appearance-none outline-none" style={{height:'4px'}} />
                        <span className="text-[10px] text-zinc-400 w-10 text-right font-mono">{Math.round(band.frequency)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-zinc-500 w-8">Gain</label>
                        <input type="range" min="0" max="2" step="0.01" value={band.gain} onChange={e => setBands && setBands(prev => prev.map(b => b.id === band.id ? {...b, gain: Number(e.target.value)} : b))} className="flex-1 accent-eq-yellow h-1 bg-zinc-800 rounded-full appearance-none outline-none" style={{height:'4px'}} />
                        <span className="text-[10px] text-zinc-400 w-10 text-right font-mono">{band.gain.toFixed(2)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-zinc-500 w-8">Q</label>
                        <input type="range" min="0.1" max="20" step="0.1" value={band.q} onChange={e => setBands && setBands(prev => prev.map(b => b.id === band.id ? {...b, q: Number(e.target.value)} : b))} className="flex-1 accent-eq-cyan h-1 bg-zinc-800 rounded-full appearance-none outline-none" style={{height:'4px'}} />
                        <span className="text-[10px] text-zinc-400 w-10 text-right font-mono">{band.q.toFixed(1)}</span>
                    </div>
                </div>
              );
          })()
      )}
    </div>
  );
}
