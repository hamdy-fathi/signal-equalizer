"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

interface CineViewerProps {
  buffer: AudioBuffer | null;
  currentTime: number;
  viewRange: [number, number]; // [startSec, endSec]
  onViewRangeChange: (range: [number, number]) => void;
  color?: string;
}

export default function CineViewer({ 
  buffer, 
  currentTime, 
  viewRange, 
  onViewRangeChange, 
  color = "#06b6d4" 
}: CineViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouseX, setLastMouseX] = useState(0);

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

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
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
    const sampleRate = buffer.sampleRate;
    
    const startSample = Math.max(0, Math.floor(viewRange[0] * sampleRate));
    const endSample = Math.min(data.length, Math.floor(viewRange[1] * sampleRate));
    const viewSamples = endSample - startSample;
    
    if (viewSamples <= 0) return;

    // Draw grid
    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Decide how many samples per pixel
    const samplesPerPixel = viewSamples / w;
    
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    if (samplesPerPixel < 2) {
      // Draw actual samples
      for (let i = 0; i < w; i++) {
        const sampleIdx = startSample + Math.floor(i * samplesPerPixel);
        if (sampleIdx >= data.length) break;
        
        const y = (0.5 - data[sampleIdx] * 0.5) * h;
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
    } else {
      // Draw envelope (min max)
      for (let i = 0; i < w; i++) {
        const chunkStart = startSample + Math.floor(i * samplesPerPixel);
        const chunkEnd = Math.min(data.length, startSample + Math.floor((i + 1) * samplesPerPixel));
        
        let min = 1, max = -1;
        for (let j = chunkStart; j < chunkEnd; j++) {
           if (data[j] < min) min = data[j];
           if (data[j] > max) max = data[j];
        }
        
        const yMin = (0.5 - min * 0.5) * h;
        const yMax = (0.5 - max * 0.5) * h;
        
        ctx.moveTo(i, yMin);
        ctx.lineTo(i, yMax);
      }
    }
    ctx.stroke();

    // Draw playhead
    if (currentTime >= viewRange[0] && currentTime <= viewRange[1]) {
      const playheadX = ((currentTime - viewRange[0]) / (viewRange[1] - viewRange[0])) * w;
      ctx.beginPath();
      ctx.strokeStyle = "#eab308"; // yellow playhead
      ctx.lineWidth = 2;
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
    }

  }, [buffer, currentTime, viewRange, dimensions, color]);

  // Interaction handlers (Pan / Zoom)
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!buffer) return;
    const duration = buffer.duration;
    
    // Zoom in/out based on wheel delta
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    
    const rangeDuration = viewRange[1] - viewRange[0];
    let newDuration = rangeDuration * zoomFactor;
    
    // Clamp zoom
    newDuration = Math.max(0.01, Math.min(newDuration, duration));
    
    // Zoom towards mouse X position
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const normalizedX = mouseX / dimensions.width;
    
    const hoverTime = viewRange[0] + normalizedX * rangeDuration;
    let newStart = hoverTime - normalizedX * newDuration;
    let newEnd = hoverTime + (1 - normalizedX) * newDuration;
    
    // Clamp to boundaries
    if (newStart < 0) {
      newEnd -= newStart;
      newStart = 0;
    }
    if (newEnd > duration) {
      newStart -= (newEnd - duration);
      newEnd = duration;
    }
    
    onViewRangeChange([Math.max(0, newStart), Math.min(duration, newEnd)]);
  }, [buffer, viewRange, dimensions, onViewRangeChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setLastMouseX(e.clientX);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !buffer) return;
    
    const deltaX = e.clientX - lastMouseX;
    const duration = viewRange[1] - viewRange[0];
    const timeDelta = (deltaX / dimensions.width) * duration;
    
    let newStart = viewRange[0] - timeDelta;
    let newEnd = viewRange[1] - timeDelta;
    
    if (newStart < 0) {
      newEnd -= newStart;
      newStart = 0;
    }
    if (newEnd > buffer.duration) {
      newStart -= (newEnd - buffer.duration);
      newEnd = buffer.duration;
    }
    
    onViewRangeChange([Math.max(0, newStart), Math.min(buffer.duration, newEnd)]);
    setLastMouseX(e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative" 
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ touchAction: 'none' }}
    >
      <canvas ref={canvasRef} className="block w-full h-full cursor-grab active:cursor-grabbing" />
      {!buffer && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs pointer-events-none">
          No Signal
        </div>
      )}
    </div>
  );
}
