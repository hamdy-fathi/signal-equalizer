"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

interface NavOverviewProps {
  buffer: AudioBuffer | null;
  currentTime: number;
  viewRange: [number, number];
  onViewRangeChange: (range: [number, number]) => void;
  onSeek: (time: number) => void;
}

/**
 * NavOverview: A horizontal scrollbar/overview that shows the full audio buffer waveform.
 * Allows users to drag the highlighted "view window" to navigate large files quickly.
 */
export default function NavOverview({
  buffer,
  currentTime,
  viewRange,
  onViewRangeChange,
  onSeek
}: NavOverviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Resize observer
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

  // Optimized draw loop for the full waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer || dimensions.width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const w = dimensions.width;
    const h = dimensions.height;
    ctx.clearRect(0, 0, w, h);

    const data = buffer.getChannelData(0);
    const duration = buffer.duration;

    // Draw background waveform (dimmed)
    ctx.strokeStyle = "#3f3f46";
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    // Low-resolution traversal
    const samplesPerPixel = data.length / w;
    for (let i = 0; i < w; i++) {
      const idx = Math.floor(i * samplesPerPixel);
      const y = (0.5 - data[idx] * 0.4) * h;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();

    // Draw View Window Highlight
    const startX = (viewRange[0] / duration) * w;
    const endX = (viewRange[1] / duration) * w;
    ctx.fillStyle = "rgba(6, 182, 212, 0.2)";
    ctx.fillRect(startX, 0, Math.max(2, endX - startX), h);
    
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, 0, Math.max(2, endX - startX), h);

    // Draw Playhead
    const playheadX = (currentTime / duration) * w;
    ctx.beginPath();
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 2;
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();
  }, [buffer, viewRange, currentTime, dimensions]);

  const handleInteraction = (e: React.PointerEvent) => {
    if (!buffer) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = Math.max(0, Math.min(e.clientX - rect.left, dimensions.width));
    const normalizedX = x / dimensions.width;
    const duration = buffer.duration;
    
    // Jump view so it is centered on the click point
    const currentRangeDuration = viewRange[1] - viewRange[0];
    let newStart = (normalizedX * duration) - (currentRangeDuration / 2);
    let newEnd = newStart + currentRangeDuration;
    
    // Boundary clamping
    if (newStart < 0) {
      newEnd = currentRangeDuration;
      newStart = 0;
    }
    if (newEnd > duration) {
      newStart = duration - currentRangeDuration;
      newEnd = duration;
    }
    
    onViewRangeChange([Math.max(0, newStart), Math.min(duration, newEnd)]);
    
    // Also seek if it's a click? Maybe just let user click the playhead specifically.
    // For now, dragging in the overview bar just moves the view. 
    // Double click could seek.
  };

  const handleSeek = (e: React.MouseEvent) => {
    if (!buffer || dimensions.width === 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(e.clientX - rect.left, dimensions.width));
    const normalizedX = x / dimensions.width;
    onSeek(normalizedX * buffer.duration);
  }

  return (
    <div 
      ref={containerRef}
      className="w-full h-8 bg-zinc-900/80 rounded-md border border-zinc-800 cursor-pointer overflow-hidden relative shadow-inner"
      onPointerDown={(e) => {
        setIsDragging(true);
        handleInteraction(e);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (isDragging) handleInteraction(e);
      }}
      onPointerUp={(e) => {
        setIsDragging(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }}
      onDoubleClick={handleSeek}
      title="Drag to navigate view, Double-click to seek"
    >
      <canvas ref={canvasRef} className="block w-full h-full pointer-events-none" />
      
      {/* Label Overlay */}
      <div className="absolute top-0 right-2 bottom-0 flex items-center pointer-events-none">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Navigation Overview</span>
      </div>
    </div>
  );
}
