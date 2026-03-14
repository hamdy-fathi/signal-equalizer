import { useState, useRef, useEffect, useCallback } from 'react';
import { AudioEngine, EqBand } from '../lib/audioEngine';
import { AIModelSimulator } from '../lib/aiModel';

export function useAudio() {
  const [audioCtx, setAudioCtx] = useState<AudioContext | null>(null);
  const sessionId = useRef(Math.random().toString(36).substring(7));

  useEffect(() => {
    const version = "Build 2.1.0-STABLE";
    (window as any).AUDIO_VERSION = version;
    console.log(`%c[AudioEngine] %cSession ID: ${sessionId.current} %c- ${version}`, "color: #06b6d4; font-weight: bold", "color: #ffffff", "color: #eq-yellow; font-weight: bold");
    setAudioCtx(new (window.AudioContext || (window as any).webkitAudioContext)());
  }, []);
  const [inputBuffer, setInputBuffer] = useState<AudioBuffer | null>(null);
  const [outputBuffer, setOutputBuffer] = useState<AudioBuffer | null>(null);
  const [aiOutputBuffer, setAiOutputBuffer] = useState<AudioBuffer | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [outputGain, setOutputGain] = useState(1.0);
  const [eqEnabled, setEqEnabled] = useState(true);

  // STABLE REFS for processing logic to break the circular dependency loop
  const inputBufferRef = useRef<AudioBuffer | null>(null);
  const isPlayingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const eqEnabledRef = useRef(true);
  const playbackRateRef = useRef(1.0);
  const outputGainRef = useRef(1.0);
  const outputBufferRef = useRef<AudioBuffer | null>(null);

  // Sync refs with state
  useEffect(() => { inputBufferRef.current = inputBuffer; }, [inputBuffer]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { eqEnabledRef.current = eqEnabled; }, [eqEnabled]);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);
  useEffect(() => { outputGainRef.current = outputGain; }, [outputGain]);
  useEffect(() => { outputBufferRef.current = outputBuffer; }, [outputBuffer]);

  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  const engineRef = useRef(new AudioEngine());

  const updateTime = () => {
    if (!audioCtx) return;
    if (isPlayingRef.current && sourceNodeRef.current) {
      const elapsed = (audioCtx.currentTime - startTimeRef.current) * playbackRateRef.current;
      setCurrentTime(pauseTimeRef.current + elapsed);
      animationFrameRef.current = requestAnimationFrame(updateTime);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    } else {
      cancelAnimationFrame(animationFrameRef.current);
    }
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [isPlaying, playbackRate]);

  const getLiveTime = useCallback(() => {
    if (!audioCtx) return pauseTimeRef.current;
    if (isPlayingRef.current && sourceNodeRef.current) {
      const elapsed = (audioCtx.currentTime - startTimeRef.current) * playbackRateRef.current;
      return pauseTimeRef.current + elapsed;
    }
    return pauseTimeRef.current;
  }, [audioCtx]);

  const stop = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    pauseTimeRef.current = 0;
    setCurrentTime(0);
  }, []);

  const pause = useCallback(() => {
    if (!audioCtx || !isPlaying || !sourceNodeRef.current) return;
    sourceNodeRef.current.stop();
    sourceNodeRef.current.disconnect();
    sourceNodeRef.current = null;

    const elapsed = (audioCtx.currentTime - startTimeRef.current) * playbackRate;
    pauseTimeRef.current += elapsed;
    setCurrentTime(pauseTimeRef.current);
    setIsPlaying(false);
  }, [audioCtx, isPlaying, playbackRate]);

  const play = useCallback(() => {
    if (!audioCtx || !outputBufferRef.current || isPlayingRef.current) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const source = audioCtx.createBufferSource();
    source.buffer = outputBufferRef.current;
    source.playbackRate.value = playbackRateRef.current;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = outputGainRef.current;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const offset = pauseTimeRef.current % outputBufferRef.current.duration;

    source.start(0, offset);

    startTimeRef.current = audioCtx.currentTime;
    pauseTimeRef.current = offset;
    sourceNodeRef.current = source;
    setIsPlaying(true);
  }, [audioCtx]);

  const loadAudioFile = useCallback(async (file: File) => {
    if (!audioCtx) return;
    stop();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    setInputBuffer(buffer);

    // Create separate buffer for output to prevent any shared mutation
    const outputClone = audioCtx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      outputClone.getChannelData(i).set(buffer.getChannelData(i));
    }
    setOutputBuffer(outputClone);
    setAiOutputBuffer(null);
    setCurrentTime(0);
  }, [audioCtx, stop]);

  const generateSyntheticSignal = useCallback(async () => {
    if (!audioCtx) return;
    stop();
    const duration = 5.0; // seconds
    const sampleRate = audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      data[i] = (
        Math.sin(2 * Math.PI * 440 * t) +
        Math.sin(2 * Math.PI * 1000 * t) +
        Math.sin(2 * Math.PI * 5000 * t)
      ) / 3.0; // Normalize
    }
    setInputBuffer(buffer);

    const outputClone = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
    outputClone.getChannelData(0).set(buffer.getChannelData(0));
    setOutputBuffer(outputClone);
    setAiOutputBuffer(null);
    setCurrentTime(0);
  }, [audioCtx, stop]);

  const applyEq = useCallback(async (bands: EqBand[], transformType: "fourier" | "wavelet" = "fourier") => {
    if (!inputBufferRef.current || !audioCtx) return;
    
    if (!eqEnabledRef.current) {
      const outputClone = audioCtx.createBuffer(inputBufferRef.current.numberOfChannels, inputBufferRef.current.length, inputBufferRef.current.sampleRate);
      for (let i = 0; i < inputBufferRef.current.numberOfChannels; i++) {
        outputClone.getChannelData(i).set(inputBufferRef.current.getChannelData(i));
      }
      setOutputBuffer(outputClone);
      return;
    }

    if (isProcessingRef.current) return;
    setIsProcessing(true);
    try {
      const processed = await engineRef.current.processBuffer(inputBufferRef.current, bands, transformType);

      if (processed) {
        const wasPlaying = isPlayingRef.current;
        const currentPos = getLiveTime();

        if (wasPlaying) {
          if (sourceNodeRef.current) {
            sourceNodeRef.current.stop();
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
          }
        }

        setOutputBuffer(processed);

        if (wasPlaying) {
          if (sourceNodeRef.current) {
            try { sourceNodeRef.current.stop(); } catch (e) { }
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
          }
          setIsPlaying(false);
          
          setTimeout(() => {
            if (!audioCtx) return;
            const source = audioCtx.createBufferSource();
            source.buffer = processed;
            source.playbackRate.value = playbackRateRef.current;
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = outputGainRef.current;
            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            const startOffset = Math.max(0, currentPos % processed.duration);
            source.start(0, startOffset);
            
            sourceNodeRef.current = source;
            startTimeRef.current = audioCtx.currentTime;
            pauseTimeRef.current = startOffset;
            setIsPlaying(true);
          }, 50);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  }, [audioCtx, getLiveTime]);

  const applyAi = useCallback(async (modeId: string) => {
    if (!inputBufferRef.current) return;
    setIsAiProcessing(true);
    try {
      const processed = await AIModelSimulator.processSignal(inputBufferRef.current, modeId);
      setAiOutputBuffer(processed);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiProcessing(false);
    }
  }, []);

  const setSpeed = useCallback((rate: number) => {
    const wasPlaying = isPlaying;
    if (wasPlaying) pause();
    setPlaybackRate(rate);
    if (wasPlaying) {
      setTimeout(play, 10);
    }
  }, [isPlaying, pause, play]);

  const seek = useCallback((timeInSeconds: number) => {
    const wasPlaying = isPlaying;
    if (wasPlaying) pause();
    pauseTimeRef.current = Math.max(0, Math.min(timeInSeconds, outputBuffer?.duration || 0));
    setCurrentTime(pauseTimeRef.current);
    if (wasPlaying) play();
  }, [pause, play, outputBuffer]);

  return {
    inputBuffer,
    outputBuffer,
    aiOutputBuffer,
    isPlaying,
    currentTime,
    playbackRate,
    isProcessing,
    isAiProcessing,
    loadAudioFile,
    generateSyntheticSignal,
    applyEq,
    applyAi,
    play,
    pause,
    stop,
    setSpeed,
    seek,
    outputGain,
    setOutputGain,
    eqEnabled,
    setEqEnabled,
  };
}
