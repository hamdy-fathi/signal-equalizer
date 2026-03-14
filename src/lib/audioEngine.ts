import FFT from 'fft.js';

export interface EqBand {
  id: string;
  frequency: number; // Center frequency in Hz
  gain: number;      // Multiplier (0 to 2) 0 = mute, 1 = unchaged, 2 = max
  q: number;         // Quality factor (width)
}

export type TransformType = "fourier" | "wavelet";

export class AudioEngine {
  private fftSize: number;
  private fft: any;
  private sampleRate: number;

  constructor(fftSize = 4096, sampleRate = 44100) {
    this.fftSize = fftSize;
    this.sampleRate = sampleRate;
    // @ts-ignore
    this.fft = new FFT(fftSize);
  }

  private getWindow(): Float32Array {
    const window = new Float32Array(this.fftSize);
    for (let i = 0; i < this.fftSize; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (this.fftSize - 1)));
    }
    return window;
  }

  private getFrequencyResponse(bands: EqBand[]): Float32Array {
    const response = new Float32Array(this.fftSize / 2 + 1);
    response.fill(1.0);
    for (let i = 0; i < response.length; i++) {
      const freq = (i * this.sampleRate) / this.fftSize;
      let binGain = 1.0;
      for (const band of bands) {
        const bandwidth = band.frequency / band.q;
        const dist = Math.abs(freq - band.frequency);
        const influence = Math.exp(-0.5 * Math.pow(dist / (bandwidth / 2), 2));
        binGain += influence * (band.gain - 1.0);
      }
      response[i] = Math.max(0, binGain);
    }
    return response;
  }

  private haar1d(arr: Float32Array) {
    let len = arr.length;
    const temp = new Float32Array(len);
    while (len > 1) {
      const half = len / 2;
      for (let i = 0; i < half; i++) {
        temp[i] = (arr[i * 2] + arr[i * 2 + 1]) / Math.SQRT2;
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
        temp[i * 2] = (arr[i] + arr[i + half]) / Math.SQRT2;
        temp[i * 2 + 1] = (arr[i] - arr[i + half]) / Math.SQRT2;
      }
      for (let i = 0; i < len; i++) arr[i] = temp[i];
      len *= 2;
    }
  }

  private applyHaarEq(inputArray: Float32Array, bands: EqBand[], sampleRate: number): Float32Array {
    const N = Math.pow(2, Math.ceil(Math.log2(inputArray.length)));
    const arr = new Float32Array(N);
    arr.set(inputArray);
    
    this.haar1d(arr);
    
    let len = N;
    while (len > 1) {
      const half = len / 2;
      const centerFreq = sampleRate * (half + (len - half) / 2) / (2 * N);
      
      let avgGain = 1.0;
      for (const band of bands) {
        const dist = Math.abs(centerFreq - band.frequency);
        const bw = Math.max(band.frequency / band.q, 10);
        const influence = Math.exp(-0.5 * Math.pow(dist / (bw / 2), 2));
        avgGain += influence * (band.gain - 1.0);
      }
      avgGain = Math.max(0, avgGain);
      
      for (let i = half; i < len; i++) {
        arr[i] *= avgGain;
      }
      len = half;
    }
    
    this.ihaar1d(arr);
    return arr.slice(0, inputArray.length);
  }

  public async processBuffer(buffer: AudioBuffer, bands: EqBand[], type: TransformType = "fourier"): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    const outBuffer = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    this.sampleRate = buffer.sampleRate;

    if (type === "wavelet") {
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const filtered = this.applyHaarEq(buffer.getChannelData(channel), bands, buffer.sampleRate);
        outBuffer.getChannelData(channel).set(filtered);
      }
      return outBuffer;
    }

    const response = this.getFrequencyResponse(bands);
    const window = this.getWindow();
    const hopSize = this.fftSize / 2;
    // Window normalization factor for Hanning window overlap-add (hop = N/2) is ~0.5.
    // The inverse FFT usually already divides by N or we must do it manually depending on fft.js implementation.
    // fft.js `inverseTransform` DOES NOT scale by 1/N. We must scale by 1/N.
    // And to account for Hanning window energy, we scale so the total sum is 1.0
    const scalingFactor = 1.0 / this.fftSize;

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = outBuffer.getChannelData(channel);
      const complexArray = this.fft.createComplexArray();
      const realInput = new Float32Array(this.fftSize);

      let chunkCounter = 0;

      for (let i = 0; i < inputData.length - this.fftSize; i += hopSize) {
        // 1. Windowing and Real -> Complex
        for (let j = 0; j < this.fftSize; j++) {
          realInput[j] = inputData[i + j] * window[j];
        }
        
        this.fft.realTransform(complexArray, realInput);
        
        // 2. Apply EQ in Frequency Domain
        for (let k = 0; k <= this.fftSize / 2; k++) {
          const reIdx = k * 2;
          const imIdx = k * 2 + 1;
          const multiplier = response[k];
          complexArray[reIdx] *= multiplier;
          complexArray[imIdx] *= multiplier;
        }
        
        this.fft.completeSpectrum(complexArray);
        
        // 3. Inverse FFT
        const outComplex = this.fft.createComplexArray();
        this.fft.inverseTransform(outComplex, complexArray);
        
        // 4. Overlap-Add with Windowing and scaling
        for (let j = 0; j < this.fftSize; j++) {
          // The real part is at outComplex[j * 2].
          // Apply inverse window and 1/N scaling.
          let val = (outComplex[j * 2] * scalingFactor) * window[j];
          
          // Guard against infinity/NaN
          if (!isFinite(val)) val = 0;
          
          outputData[i + j] += val;
        }

        chunkCounter++;
        if (chunkCounter % 50 === 0) {
            // Yield to main thread
            await new Promise(r => setTimeout(r, 0));
        }
      }
    }
    return outBuffer;
  }
}
