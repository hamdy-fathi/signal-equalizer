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

  const MIN_FREQ = 20;
  const MAX_FREQ = 20000;
  const MIN_GAIN = 0;
  const MAX_GAIN = 2;

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
      return ((Math.log10(freq) - minLog) / (maxLog - minLog)) * w;
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
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const w = dimensions.width;
    const h = dimensions.height;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    const freqsToDraw = scaleType === "audiogram" 
      ? [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
      : [0, 5000, 10000, 15000, 20000];
      
    freqsToDraw.forEach(f => {
      const x = freqToX(f);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    });
    
    const yCenter = gainToY(1.0);
    ctx.moveTo(0, yCenter);
    ctx.lineTo(w, yCenter);
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#eab308";
    ctx.fillStyle = "rgba(234, 179, 8, 0.1)";

    const numPoints = w;
    for (let x = 0; x <= numPoints; x++) {
      const freq = xToFreq(x);
      let binGain = 1.0;
      for (const band of bands) {
        const bandwidth = band.frequency / band.q;
        const dist = Math.abs(freq - band.frequency);
        const influence = Math.exp(-0.5 * Math.pow(dist / (bandwidth / 2), 2));
        binGain += influence * (band.gain - 1.0);
      }
      binGain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, binGain));
      
      const y = gainToY(binGain);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    bands.forEach(band => {
      const x = freqToX(band.frequency);
      const y = gainToY(band.gain);

      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = draggingNode === band.id ? "#ffffff" : "#06b6d4";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#000000";
      ctx.stroke();
    });

  }, [dimensions, bands, scaleType, freqToX, gainToY, xToFreq, draggingNode]);

  const getMousePos = (e: React.PointerEvent) => {
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
    
    for (const band of [...bands].reverse()) {
      const bx = freqToX(band.frequency);
      const by = gainToY(band.gain);
      if (Math.hypot(bx - x, by - y) < 15) {
        setDraggingNode(band.id);
        return;
      }
    }
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
    const { x, y } = getMousePos(e as unknown as React.PointerEvent);
    const freq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x)));
    const gain = Math.max(MIN_GAIN, Math.min(MAX_GAIN, yToGain(y)));
    
    setBands(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      frequency: freq,
      gain,
      q: 1,
    }]);
  };

  return (
    <div ref={containerRef} className={`w-full h-full relative ${readOnly ? '' : 'cursor-crosshair'}`}>
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
}
