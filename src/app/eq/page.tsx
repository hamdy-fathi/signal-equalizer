"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import EqCanvas from "@/components/EqCanvas";
import CineViewer from "@/components/CineViewer";
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
    { id: "band-1", frequency: 1000, gain: 1.0, q: 1 },
  ]);

  // Custom Modes State Map
  const [customSliders, setCustomSliders] = useState<Record<string, MacroSliderDef[]>>(() => {
    const init: Record<string, MacroSliderDef[]> = {};
    defaultPresets.forEach(p => { init[p.id] = JSON.parse(JSON.stringify(p.sliders)); });
    return init;
  });

  const {
    inputBuffer, outputBuffer, aiOutputBuffer, isPlaying, currentTime,
    loadAudioFile, generateSyntheticSignal, applyEq, applyAi, play, pause, setSpeed, isProcessing, isAiProcessing
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

  // Apply EQ automatically when bands change (debounced)
  useEffect(() => {
    const handler = setTimeout(() => { applyEq(activeBands, transformType); }, 500);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBands, transformType]);

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
          <div className="p-3 border-b border-zinc-800 flex justify-between items-center bg-[#18181A]">
            <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Analysis Views</span>
            <button onClick={() => setShowSpectrograms(s => !s)} className="text-xs text-eq-cyan hover:text-white transition-colors">Toggle Spectrograms</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-1">
              <span className="text-xs font-medium text-zinc-400">Input Waveform</span>
              <div className="h-24 bg-black rounded-lg border border-zinc-800 shadow-inner overflow-hidden relative">
                <CineViewer buffer={inputBuffer} currentTime={currentTime} viewRange={viewRange} onViewRangeChange={setViewRange} color="#22c55e" />
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-zinc-400">Manual EQ Waveform</span>
              <div className="h-24 bg-black rounded-lg border border-zinc-800 shadow-inner overflow-hidden relative">
                {isProcessing && <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center text-xs text-zinc-400">Processing offline FFT...</div>}
                <CineViewer buffer={outputBuffer} currentTime={currentTime} viewRange={viewRange} onViewRangeChange={setViewRange} color="#eab308" />
              </div>
            </div>
            {aiOutputBuffer && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-purple-400">AI Model Result</span>
                <div className="h-24 bg-black rounded-lg border border-zinc-800 shadow-inner overflow-hidden relative">
                  <CineViewer buffer={aiOutputBuffer} currentTime={currentTime} viewRange={viewRange} onViewRangeChange={setViewRange} color="#c084fc" />
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

          <div className="h-[88px] border-t border-zinc-800 bg-[#18181A] p-3 flex flex-col justify-center gap-2 shrink-0">
            <div className="flex items-center justify-center gap-4">
              <button onClick={loadAudioFile as any} className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition">⏹</button>
              {!isPlaying ? (
                <button onClick={play} className="w-10 h-10 rounded-full bg-zinc-200 text-black flex items-center justify-center hover:bg-white transition text-lg">▶</button>
              ) : (
                <button onClick={pause} className="w-10 h-10 rounded-full bg-eq-magenta text-white flex items-center justify-center hover:bg-pink-400 transition text-sm">⏸</button>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
              <span>Speed: 1.0x</span>
              <input type="range" min="0.5" max="2" step="0.1" defaultValue="1" onChange={(e) => setSpeed(Number(e.target.value))} className="w-32 accent-eq-cyan" />
            </div>
          </div>
        </aside>

        <section className="flex-1 relative bg-[#0a0a0a] flex flex-col min-w-0">
          <div className="absolute inset-0 p-4 xl:p-8 flex flex-col">
            <div className="flex-1 border border-zinc-800 rounded-xl bg-[#111111] relative overflow-hidden flex items-center justify-center shadow-inner min-h-[300px]">
              <EqCanvas
                bands={activeBands}
                setBands={modeId === "generic" ? setBands : undefined}
                scaleType={scaleType}
                readOnly={modeId !== "generic"}
              />
              {isProcessing && (
                <div className="absolute top-2 right-2 bg-zinc-900/80 text-zinc-300 px-3 py-1 rounded text-xs animate-pulse">
                  Applying FFT...
                </div>
              )}
            </div>

            <div className="h-56 mt-4 xl:mt-6 border border-zinc-800 rounded-xl bg-[#18181A] p-4 flex flex-col shrink-0">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">
                  {modeId === "generic" ? "Active Eq Bands" : "Macro Controls"}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="text-xs border border-zinc-700 px-2 py-1 rounded text-zinc-400 hover:text-white hover:border-zinc-500">
                    Load Settings
                  </button>
                  <button onClick={handleSaveSettings} className="text-xs border border-zinc-700 px-2 py-1 rounded text-zinc-400 hover:text-white hover:border-zinc-500">
                    Save Settings
                  </button>
                  <input type="file" className="hidden" ref={fileInputRef} accept=".json" onChange={handleLoadSettings} />
                </div>
              </div>

              <div className="flex-1 overflow-x-auto flex gap-4 pb-2">
                {modeId === "generic" ? (
                  <>
                    {bands.map((band, i) => (
                      <div key={band.id} className="w-48 bg-zinc-900 border border-zinc-800 p-3 rounded-lg flex flex-col gap-2 shrink-0 h-full justify-center">
                        <div className="flex justify-between items-center text-xs text-zinc-400 font-semibold uppercase">
                          <span>Band {i + 1}</span>
                          <button onClick={() => setBands(prev => prev.filter(b => b.id !== band.id))} className="hover:text-red-400 transition">✕</button>
                        </div>
                        <div className="text-sm">
                          <label className="text-zinc-500 text-xs block mb-1">Freq (Hz)</label>
                          <input type="range" min="20" max="20000" value={band.frequency} onChange={(e) => setBands(prev => prev.map(b => b.id === band.id ? { ...b, frequency: Number(e.target.value) } : b))} className="w-full accent-eq-cyan" />
                          <span className="text-xs block text-right text-zinc-400">{Math.round(band.frequency)} Hz</span>
                        </div>
                        <div className="text-sm">
                          <label className="text-zinc-500 text-xs block mb-1">Gain (0-2x)</label>
                          <input type="range" min="0" max="2" step="0.01" value={band.gain} onChange={(e) => setBands(prev => prev.map(b => b.id === band.id ? { ...b, gain: Number(e.target.value) } : b))} className="w-full accent-eq-yellow" />
                          <span className="text-xs block text-right text-zinc-400">{band.gain.toFixed(2)}x</span>
                        </div>
                      </div>
                    ))}
                    <div onClick={() => setBands(prev => [...prev, { id: Math.random().toString(36).substring(7), frequency: 1000, gain: 1, q: 1 }])} className="w-24 bg-zinc-900/50 hover:bg-zinc-800 border border-dashed border-zinc-700 p-3 rounded-lg flex items-center justify-center cursor-pointer transition text-zinc-500 hover:text-white shrink-0 h-full">
                      + Add
                    </div>
                  </>
                ) : (
                  <>
                    {customSliders[modeId]?.map(slider => (
                      <div key={slider.id} className="w-48 bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col gap-4 shrink-0 h-full justify-center">
                        <div className="text-sm font-semibold text-zinc-300 text-center">{slider.label}</div>
                        <div className="flex-1 flex flex-col justify-center">
                          <input
                            type="range" min="0" max="2" step="0.01" value={slider.value}
                            onChange={(e) => setCustomSliders(prev => ({
                              ...prev,
                              [modeId]: prev[modeId].map(s => s.id === slider.id ? { ...s, value: Number(e.target.value) } : s)
                            }))}
                            className="w-full accent-eq-magenta"
                          />
                          <span className="text-xs block text-center text-zinc-400 mt-2">{slider.value.toFixed(2)}x Intensity</span>
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
