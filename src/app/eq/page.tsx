"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import EqCanvas from "@/components/EqCanvas";
import CineViewer from "@/components/CineViewer";
import NavOverview from "@/components/NavOverview";
import Spectrogram from "@/components/Spectrogram";
import { EqBand } from "@/lib/audioEngine";
import { useAudio } from "@/hooks/useAudio";
import { defaultPresets, MacroSliderDef } from "@/lib/presets";

export default function EqualizerApp() {
  const [modeId, setModeId] = useState<string>("generic");
  const [scaleType, setScaleType] = useState<"linear" | "audiogram">("linear");
  const [transformType, setTransformType] = useState<"fourier" | "wavelet">("fourier");
  const [viewRange, setViewRange] = useState<[number, number]>([0, 5]);
  const [showSpectrograms, setShowSpectrograms] = useState(true);

  // Generic Mode State
  const [bands, setBands] = useState<EqBand[]>([
    { id: "band-1", frequency: 1000, gain: 1.0, q: 1, type: 'bell' },
  ]);

  // Custom Modes State Map
  const [customSliders, setCustomSliders] = useState<Record<string, MacroSliderDef[]>>(() => {
    const init: Record<string, MacroSliderDef[]> = {};
    defaultPresets.forEach(p => { init[p.id] = JSON.parse(JSON.stringify(p.sliders)); });
    return init;
  });

  const {
    inputBuffer, outputBuffer, aiOutputBuffer, isPlaying, currentTime, playbackRate,
    loadAudioFile, generateSyntheticSignal, applyEq, applyAi, play, pause, stop, setSpeed, seek, 
    isProcessing, isAiProcessing, outputGain, setOutputGain, eqEnabled, setEqEnabled
  } = useAudio();

  // Compute final bands array sent to processing and canvas
  const activeBands = useMemo(() => {
    if (modeId === "generic") return bands;

    // For custom modes, map the sliders to individual EQ bands
    const currentSliders = customSliders[modeId] || [];
    const computed: EqBand[] = [];
    currentSliders.forEach(slider => {
      slider.bands.forEach((b, idx) => {
        const targetGainModifier = (slider.value - 1.0) * b.gainScale;
        const finalGain = Math.max(0, 1.0 + targetGainModifier);
        computed.push({
          id: `${slider.id}-${idx}`,
          frequency: b.frequency,
          q: b.q,
          gain: finalGain
        });
      });
    });
    return computed;
  }, [modeId, bands, customSliders]);

  // Sync viewRange to buffer duration when a new file is loaded
  useEffect(() => {
    if (inputBuffer) setViewRange([0, inputBuffer.duration]);
  }, [inputBuffer]);

  // Apply EQ automatically when bands change (debounced)
  const lastAppliedRef = useRef<string>("");
  
  // Auto-apply EQ whenever bands or transform type or bypass state changes
  useEffect(() => {
    if (!inputBuffer) return;
    
    // Create a stable fingerprint of the current EQ state
    const fingerprint = JSON.stringify({ 
      bands: eqEnabled ? activeBands : [], 
      transformType 
    });

    const handler = setTimeout(() => {
      // Only apply if the state has actually changed from the last successful apply
      if (fingerprint === lastAppliedRef.current) {
        return;
      }
      
      console.log("Applying EQ change...");
      applyEq(eqEnabled ? activeBands : [], transformType);
      lastAppliedRef.current = fingerprint;
    }, 800);
    
    return () => clearTimeout(handler);
  }, [activeBands, transformType, eqEnabled, !!inputBuffer, applyEq]);

  const handleZoom = (factor: number) => {
    if (!inputBuffer) return;
    const duration = inputBuffer.duration;
    const range = viewRange[1] - viewRange[0];
    const newRangeDuration = Math.max(0.01, Math.min(range * factor, duration));
    const center = viewRange[0] + range / 2;
    let newStart = center - newRangeDuration / 2;
    let newEnd = center + newRangeDuration / 2;
    if (newStart < 0) {
      newEnd -= newStart;
      newStart = 0;
    }
    if (newEnd > duration) {
      newStart -= (newEnd - duration);
      newEnd = duration;
    }
    setViewRange([Math.max(0, newStart), Math.min(duration, newEnd)]);
  };

  const handlePan = (direction: 1 | -1) => {
    if (!inputBuffer) return;
    const duration = inputBuffer.duration;
    const range = viewRange[1] - viewRange[0];
    const shift = range * 0.25 * direction;
    let newStart = viewRange[0] + shift;
    let newEnd = viewRange[1] + shift;
    if (newStart < 0) {
      newEnd -= newStart;
      newStart = 0;
    }
    if (newEnd > duration) {
      newStart -= (newEnd - duration);
      newEnd = duration;
    }
    setViewRange([Math.max(0, newStart), Math.min(duration, newEnd)]);
  };

  // Save/Load Settings
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveSettings = () => {
    const data = modeId === "generic" ? bands : customSliders[modeId];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eq_${modeId}_settings.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (modeId === "generic") {
          setBands(json);
        } else {
          setCustomSliders(prev => ({ ...prev, [modeId]: json }));
        }
      } catch (err) {
        alert("Invalid settings file");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#111111] text-zinc-300 overflow-hidden select-none">
      <header className="h-14 border-b border-zinc-800 bg-[#18181A] flex items-center justify-between px-6 shrink-0 shadow-sm z-10 w-full">
        <div className="flex items-center gap-4 shrink-0 max-w-[200px]">
          <h1 className="font-bold text-lg text-zinc-100 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-eq-magenta animate-pulse" />
            Equalizer
          </h1>
        </div>

        <div className="flex items-center gap-6 flex-1 justify-center whitespace-nowrap overflow-x-auto mx-4 scrollbar-hide">
          <select
            value={modeId}
            onChange={e => setModeId(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-sm rounded px-3 py-1.5 outline-none focus:border-eq-cyan transition-colors"
          >
            <option value="generic">Generic Mode</option>
            {defaultPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded p-1 shrink-0">
            <button onClick={() => setScaleType("linear")} className={`px-3 py-1 rounded text-sm transition-colors ${scaleType === "linear" ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"}`}>Linear</button>
            <button onClick={() => setScaleType("audiogram")} className={`px-3 py-1 rounded text-sm transition-colors ${scaleType === "audiogram" ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"}`}>Audiogram</button>
          </div>

          <button
            onClick={() => setTransformType(t => t === "fourier" ? "wavelet" : "fourier")}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-4 py-1.5 rounded transition-colors shrink-0"
          >
            Wavelets: {transformType === "fourier" ? "Fourier" : "Haar"}
          </button>
        </div>

        <div className="flex items-center gap-4 shrink-0 ml-auto justify-end max-w-[350px]">
          <button
            onClick={() => applyAi(modeId)}
            className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-3 py-1.5 rounded hover:bg-purple-500/30 transition-colors whitespace-nowrap"
          >
            {isAiProcessing ? "Inferring..." : "Enhance with AI"}
          </button>
          <button onClick={generateSyntheticSignal} className="text-xs bg-eq-cyan/20 text-eq-cyan border border-eq-cyan/30 px-3 py-1.5 rounded hover:bg-eq-cyan/30 transition-colors whitespace-nowrap">
            Synthetic Test
          </button>
          <label className="text-xs bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded hover:bg-zinc-700 transition-colors cursor-pointer whitespace-nowrap">
            Upload Audio
            <input type="file" className="hidden" accept="audio/*" onChange={(e) => e.target.files && loadAudioFile(e.target.files[0])} />
          </label>
        </div>
      </header>

      <main className="flex-1 flex flex-col xl:flex-row overflow-hidden w-full">
        <aside className="w-full xl:w-[400px] border-r border-zinc-800 bg-[#141414] flex flex-col shrink-0 lg:max-w-full">
          <div className="p-4 border-b border-zinc-800 bg-[#18181A]/40 shrink-0">
            <NavOverview
              buffer={inputBuffer}
              currentTime={currentTime}
              viewRange={viewRange}
              onViewRangeChange={setViewRange}
              onSeek={seek}
            />
          </div>

          <div className="p-3 border-b border-zinc-800 flex justify-between items-center bg-[#18181A]">
            <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Analysis Views</span>
            <button onClick={() => setShowSpectrograms(s => !s)} className="text-xs text-eq-cyan hover:text-white transition-colors">Toggle Spectrograms</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            <div className="space-y-1">
              <span className="text-xs font-medium text-zinc-400">Input Waveform</span>
              <div className="h-24 bg-black rounded-lg border border-zinc-800 shadow-inner overflow-hidden relative">
                <CineViewer buffer={inputBuffer} currentTime={currentTime} viewRange={viewRange} onViewRangeChange={setViewRange} onSeek={seek} color="#22c55e" />
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-zinc-400">Manual EQ Waveform</span>
              <div className="h-24 bg-black rounded-lg border border-zinc-800 shadow-inner overflow-hidden relative">
                {isProcessing && <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center text-xs text-zinc-400">Processing offline FFT...</div>}
                <CineViewer buffer={outputBuffer} currentTime={currentTime} viewRange={viewRange} onViewRangeChange={setViewRange} onSeek={seek} color="#eab308" />
              </div>
            </div>
            {aiOutputBuffer && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-purple-400">AI Model Result</span>
                <div className="h-24 bg-black rounded-lg border border-zinc-800 shadow-inner overflow-hidden relative">
                  <CineViewer buffer={aiOutputBuffer} currentTime={currentTime} viewRange={viewRange} onViewRangeChange={setViewRange} onSeek={seek} color="#c084fc" />
                </div>
              </div>
            )}

            {showSpectrograms && (
              <>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-zinc-400">Input Spectrogram</span>
                  <div className="h-24 bg-black rounded-lg border border-zinc-800 shadow-inner overflow-hidden relative">
                    <Spectrogram buffer={inputBuffer} viewRange={viewRange} isVisible={showSpectrograms} />
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-zinc-400">Output Spectrogram</span>
                  <div className="h-24 bg-black rounded-lg border border-zinc-800 shadow-inner overflow-hidden relative">
                    {isProcessing && <div className="absolute inset-0 bg-black/50 z-10" />}
                    <Spectrogram buffer={outputBuffer} viewRange={viewRange} isVisible={showSpectrograms} />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-zinc-800 bg-[#18181A] p-4 flex flex-col gap-3 shrink-0">
            {/* Playback Controls */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Playback</span>
              <div className="flex items-center gap-2">
                <button onClick={stop} className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs transition">Stop</button>
                {!isPlaying ? (
                  <button onClick={play} className="px-4 py-1.5 rounded bg-zinc-200 hover:bg-white text-black text-xs font-bold transition">Play</button>
                ) : (
                  <button onClick={pause} className="px-4 py-1.5 rounded bg-eq-magenta hover:bg-pink-500 text-white text-xs font-bold transition">Pause</button>
                )}
              </div>
            </div>

            {/* Navigation Controls (Zoom / Pan) */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">View</span>
              <div className="flex items-center gap-1">
                <button onClick={() => handleZoom(0.8)} className="px-2 py-1 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-300 text-xs transition" title="Zoom In">Zoom In</button>
                <button onClick={() => handleZoom(1.2)} className="px-2 py-1 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-300 text-xs transition" title="Zoom Out">Zoom Out</button>
                <div className="w-2" />
                <button onClick={() => handlePan(-1)} className="px-2 py-1 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-300 text-xs transition" title="Pan Left">Pan ←</button>
                <button onClick={() => handlePan(1)} className="px-2 py-1 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-300 text-xs transition" title="Pan Right">Pan →</button>
              </div>
            </div>

            {/* Speed Control */}
            <div className="flex items-center justify-between gap-4 mt-1">
              <span className="text-xs text-zinc-500 w-16">Speed: {playbackRate.toFixed(1)}x</span>
              <input type="range" min="0.5" max="2" step="0.1" value={playbackRate} onChange={(e) => setSpeed(Number(e.target.value))} className="flex-1 accent-eq-cyan" />
            </div>
          </div>
        </aside>

        <section className="flex-1 relative bg-[#0a0a0a] flex flex-col min-w-0">
          <div className="absolute inset-0 p-4 xl:p-8 flex flex-col">
            <div className="flex-1 flex gap-4 min-h-[300px]">
              {/* EQ Canvas Area */}
              <div className="flex-1 border border-zinc-800 rounded-xl bg-[#111111] relative overflow-hidden flex items-center justify-center shadow-inner">
                <EqCanvas
                  bands={activeBands}
                  setBands={modeId === "generic" ? setBands : undefined}
                  scaleType={scaleType}
                  readOnly={modeId !== "generic"}
                />
                {isProcessing && (
                  <div className="absolute top-2 right-2 bg-zinc-900/80 text-zinc-300 px-3 py-1 rounded text-xs animate-pulse border border-zinc-700">
                    Applying EQ Filters...
                  </div>
                )}
              </div>

              {/* Master Output Gain Fader (The "Right Slider") */}
              <div className="w-12 bg-[#18181A] border border-zinc-800 rounded-xl flex flex-col items-center py-4 gap-2 shrink-0 shadow-lg">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">Gain</span>
                <div className="flex-1 relative w-full flex items-center justify-center">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={outputGain}
                    onChange={(e) => setOutputGain(Number(e.target.value))}
                    className="vertical-range accent-white"
                    style={{
                      appearance: 'none',
                      width: '150px',
                      transform: 'rotate(-90deg)',
                      background: 'transparent'
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-zinc-400">{(outputGain * 100).toFixed(0)}%</span>
              </div>
            </div>

            <div className="h-64 mt-4 xl:mt-6 border border-zinc-800 rounded-xl bg-[#18181A] p-4 flex flex-col shrink-0">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">
                  {modeId === "generic" ? "Active Eq Bands" : "Macro Controls"}
                </span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setEqEnabled(!eqEnabled)} 
                    className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded border transition-all ${
                      eqEnabled 
                      ? "bg-eq-cyan/10 border-eq-cyan text-eq-cyan" 
                      : "bg-zinc-800 border-zinc-700 text-zinc-500"
                    }`}
                  >
                    {eqEnabled ? "EQ Active" : "EQ Bypassed"}
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="text-xs border border-zinc-700 px-2 py-1 rounded text-zinc-400 hover:text-white hover:border-zinc-500">
                    Load Settings
                  </button>
                  <button onClick={handleSaveSettings} className="text-xs border border-zinc-700 px-2 py-1 rounded text-zinc-400 hover:text-white hover:border-zinc-500">
                    Save Settings
                  </button>
                  <input type="file" className="hidden" ref={fileInputRef} accept=".json" onChange={handleLoadSettings} />
                </div>
              </div>

              <div className="flex-1 overflow-x-auto flex gap-4 pb-2 custom-scrollbar">
                {modeId === "generic" ? (
                  <>
                    {bands.map((band, i) => (
                      <div key={band.id} className={`w-52 bg-zinc-900/40 border border-zinc-800 p-4 rounded-xl flex flex-col shrink-0 shadow-lg transition-opacity ${!eqEnabled ? 'opacity-40 grayscale-[0.5]' : ''}`}>
                        <div className="flex justify-between items-center text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-2">
                          <span>Band {i + 1}</span>
                          <button onClick={() => setBands(prev => prev.filter(b => b.id !== band.id))} className="hover:text-red-400 transition-colors p-1 -mt-1 -mr-1">✕</button>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm">
                            <label className="text-zinc-500 text-[10px] uppercase font-bold tracking-tighter block mb-1">Freq (Hz)</label>
                            <input type="range" min="20" max="20000" value={band.frequency} onChange={(e) => setBands(prev => prev.map(b => b.id === band.id ? { ...b, frequency: Number(e.target.value) } : b))} className="w-full" disabled={!eqEnabled} />
                            <span className="text-[11px] font-mono block text-right text-zinc-400 mt-0.5">{Math.round(band.frequency)} Hz</span>
                          </div>
                          <div className="text-sm">
                            <label className="text-zinc-500 text-[10px] uppercase font-bold tracking-tighter block mb-1">Gain (0-2x)</label>
                            <input type="range" min="0" max="2" step="0.01" value={band.gain} onChange={(e) => setBands(prev => prev.map(b => b.id === band.id ? { ...b, gain: Number(e.target.value) } : b))} className="w-full" disabled={!eqEnabled} />
                            <span className="text-[11px] font-mono block text-right text-zinc-400 mt-0.5">{band.gain.toFixed(2)}x</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div onClick={() => setBands(prev => [...prev, { id: Math.random().toString(36).substring(7), frequency: 1000, gain: 1, q: 1, type: 'bell' }])} className="w-24 bg-zinc-900/20 hover:bg-zinc-800/40 border border-dashed border-zinc-700/50 p-3 rounded-xl flex items-center justify-center cursor-pointer transition-all text-zinc-500 hover:text-zinc-300 shrink-0 h-full group">
                      <span className="text-2xl group-hover:scale-125 transition-transform">+</span>
                    </div>
                  </>
                ) : (
                  <>
                    {customSliders[modeId]?.map(slider => (
                      <div key={slider.id} className="w-52 bg-zinc-900/40 border border-zinc-800 p-5 rounded-xl flex flex-col shrink-0 h-full shadow-lg">
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-6 text-center">{slider.label}</div>
                        <div className="flex-1 flex flex-col justify-center gap-4">
                          <input
                            type="range" min="0" max="2" step="0.01" value={slider.value}
                            onChange={(e) => setCustomSliders(prev => ({
                              ...prev,
                              [modeId]: prev[modeId].map(s => s.id === slider.id ? { ...s, value: Number(e.target.value) } : s)
                            }))}
                            className="w-full"
                          />
                          <span className="text-[11px] font-mono block text-center text-zinc-400">{slider.value.toFixed(2)}x Intensity</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
