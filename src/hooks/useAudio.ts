import { useState, useRef, useEffect } from 'react';
import { AudioEngine, EqBand } from '../lib/audioEngine';
import { AIModelSimulator } from '../lib/aiModel';

export function useAudio() {
  const [audioCtx] = useState(() => {
    if (typeof window !== 'undefined') {
      return new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return null as any as AudioContext;
  });
  const [inputBuffer, setInputBuffer] = useState<AudioBuffer | null>(null);
  const [outputBuffer, setOutputBuffer] = useState<AudioBuffer | null>(null);
  const [aiOutputBuffer, setAiOutputBuffer] = useState<AudioBuffer | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  
  const engineRef = useRef(new AudioEngine(4096, 44100));

  const updateTime = () => {
    if (isPlaying && sourceNodeRef.current) {
      const elapsed = (audioCtx.currentTime - startTimeRef.current) * playbackRate;
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

  const loadAudioFile = async (file: File) => {
    stop();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    setInputBuffer(buffer);
    setOutputBuffer(buffer);
    setAiOutputBuffer(null);
    setCurrentTime(0);
  };

  const generateSyntheticSignal = async () => {
    stop();
    const duration = 5.0; // seconds
    const sampleRate = audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);
    
    // Sum of 440Hz, 1000Hz, and 5000Hz
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      data[i] = (
        Math.sin(2 * Math.PI * 440 * t) +
        Math.sin(2 * Math.PI * 1000 * t) +
        Math.sin(2 * Math.PI * 5000 * t)
      ) / 3.0; // Normalize
    }
    setInputBuffer(buffer);
    setOutputBuffer(buffer);
    setAiOutputBuffer(null);
    setCurrentTime(0);
  };

  const applyEq = async (bands: EqBand[], transformType: "fourier" | "wavelet" = "fourier") => {
    if (!inputBuffer) return;
    setIsProcessing(true);
    try {
      await new Promise(r => setTimeout(r, 10));
      const processed = await engineRef.current.processBuffer(inputBuffer, bands, transformType);
      
      const wasPlaying = isPlaying;
      if (wasPlaying) pause();
      
      setOutputBuffer(processed);
      
      if (wasPlaying) {
          // Allow outputBuffer a moment to update before playing again.
          setTimeout(() => {
              if (sourceNodeRef.current === null) {
                 play();
              }
          }, 50);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const applyAi = async (modeId: string) => {
    if (!inputBuffer) return;
    setIsAiProcessing(true);
    try {
      const processed = await AIModelSimulator.processSignal(inputBuffer, modeId);
      setAiOutputBuffer(processed);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const play = async () => {
    if (!outputBuffer || isPlaying) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    
    const source = audioCtx.createBufferSource();
    source.buffer = outputBuffer;
    source.playbackRate.value = playbackRate;
    source.connect(audioCtx.destination);
    
    const offset = currentTime % outputBuffer.duration;
    
    source.start(0, offset);
    
    startTimeRef.current = audioCtx.currentTime;
    pauseTimeRef.current = offset;
    sourceNodeRef.current = source;
    setIsPlaying(true);
  };

  const pause = () => {
    if (!isPlaying || !sourceNodeRef.current) return;
    sourceNodeRef.current.stop();
    sourceNodeRef.current.disconnect();
    sourceNodeRef.current = null;
    
    const elapsed = (audioCtx.currentTime - startTimeRef.current) * playbackRate;
    pauseTimeRef.current += elapsed;
    setCurrentTime(pauseTimeRef.current);
    setIsPlaying(false);
  };

  const stop = () => {
    if (sourceNodeRef.current) {
       sourceNodeRef.current.stop();
       sourceNodeRef.current.disconnect();
       sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    pauseTimeRef.current = 0;
    setCurrentTime(0);
  };

  const setSpeed = (rate: number) => {
    const wasPlaying = isPlaying;
    if (wasPlaying) pause();
    setPlaybackRate(rate);
    if (wasPlaying) {
      setTimeout(play, 10); 
    }
  };

  const seek = (timeInSeconds: number) => {
    const wasPlaying = isPlaying;
    if (wasPlaying) pause();
    pauseTimeRef.current = Math.max(0, Math.min(timeInSeconds, outputBuffer?.duration || 0));
    setCurrentTime(pauseTimeRef.current);
    if (wasPlaying) play();
  };

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
  };
}
