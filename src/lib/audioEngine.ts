export interface EqBand {
  id: string;
  frequency: number; // Center frequency in Hz
  gain: number;      // Multiplier (0 to 2) — 1 = unity, 0 = mute, 2 = double
  q: number;         // Quality factor (bandwidth)
  type?: 'bell' | 'lowpass' | 'highpass' | 'lowshelf' | 'highshelf' | 'notch';
}

export type TransformType = "fourier" | "wavelet";

/**
 * AudioEngine: Handles offline audio processing (EQ, AI masking).
 * Built with Web Audio API OfflineAudioContext for precision and amplitude integrity.
 */
export class AudioEngine {
  constructor() {}

  // --- Haar DWT (wavelet mode) ---
  private haar1d(arr: Float32Array) {
    let len = arr.length;
    const temp = new Float32Array(len);
    while (len > 1) {
      const half = Math.floor(len / 2);
      for (let i = 0; i < half; i++) {
        temp[i]        = (arr[i * 2] + arr[i * 2 + 1]) / Math.SQRT2;
        temp[i + half] = (arr[i * 2] - arr[i * 2 + 1]) / Math.SQRT2;
      }
      for (let i = 0; i < len; i++) arr[i] = temp[i];
      len = half;
    }
  }

  private ihaar1d(arr: Float32Array) {
    let len = 2;
    const temp = new Float32Array(arr.length);
    while (len <= arr.length) {
      const half = len / 2;
      for (let i = 0; i < half; i++) {
        temp[i * 2]     = (arr[i] + arr[i + half]) / Math.SQRT2;
        temp[i * 2 + 1] = (arr[i] - arr[i + half]) / Math.SQRT2;
      }
      for (let i = 0; i < len; i++) arr[i] = temp[i];
      len *= 2;
    }
  }

  private applyHaarEq(inputArray: Float32Array, bands: EqBand[], sampleRate: number): Float32Array {
    const N = Math.pow(2, Math.ceil(Math.log2(Math.max(inputArray.length, 2))));
    const arr = new Float32Array(N);
    arr.set(inputArray);
    this.haar1d(arr);

    let len = N;
    while (len > 1) {
      const half = Math.floor(len / 2);
      const centerFreq = sampleRate * half / (2 * N);
      let avgGain = 1.0;
      for (const band of bands) {
        const bw = Math.max(band.frequency / Math.max(band.q, 0.1), 10);
        const dist = Math.abs(centerFreq - band.frequency);
        const influence = Math.exp(-0.5 * Math.pow(dist / (bw / 2), 2));
        avgGain += influence * (band.gain - 1.0);
      }
      avgGain = Math.max(0, avgGain);
      for (let i = half; i < len; i++) arr[i] *= avgGain;
      len = half;
    }

    this.ihaar1d(arr);
    return arr.slice(0, inputArray.length);
  }

  /**
   * Process buffer using Web Audio API nodes (fourier mode) or Haar DWT (wavelet mode).
   */
  public async processBuffer(
    buffer: AudioBuffer,
    bands: EqBand[],
    type: TransformType = "fourier"
  ): Promise<AudioBuffer> {
    // ── Wavelet mode ────────────────────────────────────────────────────────
    if (type === "wavelet") {
      const outBuffer = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
        .createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const filtered = this.applyHaarEq(buffer.getChannelData(ch), bands, buffer.sampleRate);
        outBuffer.getChannelData(ch).set(filtered);
      }
      return outBuffer;
    }

    // ── Fourier/Natural mode (Web Audio API Chain) ─────────────────────────
    console.log(`[AudioEngine] Processing ${bands.length} bands in ${type} mode`);
    const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

    // Defensive clone
    const sourceBuffer = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      sourceBuffer.getChannelData(i).set(buffer.getChannelData(i));
    }

    const source = ctx.createBufferSource();
    source.buffer = sourceBuffer;

    // Convert linear gain multiplier to dB level for peaking/shelf filters
    const toDb = (gain: number) => (gain <= 0 ? -40 : 20 * Math.log10(gain));

    let lastNode: AudioNode = source;

    for (const band of bands) {
      const filter = ctx.createBiquadFilter();
      
      // Map custom band type to BiquadFilterType
      const bandType = band.type || 'bell';
      switch (bandType) {
        case 'lowpass': filter.type = 'lowpass'; break;
        case 'highpass': filter.type = 'highpass'; break;
        case 'lowshelf': filter.type = 'lowshelf'; break;
        case 'highshelf': filter.type = 'highshelf'; break;
        case 'notch': filter.type = 'notch'; break;
        default: filter.type = 'peaking'; break;
      }

      filter.frequency.value = Math.max(20, Math.min(band.frequency, buffer.sampleRate / 2 - 1));
      filter.Q.value = Math.max(0.1, band.q);
      filter.gain.value = toDb(band.gain);

      lastNode.connect(filter);
      lastNode = filter;
    }
    
    lastNode.connect(ctx.destination);
    source.start(0);

    const rendered = await ctx.startRendering();

    // Verify Peak Amplitude
    let peak = 0;
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      const data = rendered.getChannelData(ch);
      for (let i = 0; i < data.length; i += 1000) {
        if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]);
      }
    }
    console.log(`[AudioEngine] Render complete. Peak amplitude: ${peak.toFixed(4)}`);
    
    return rendered;
  }
}
