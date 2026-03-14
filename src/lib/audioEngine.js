import FFT from 'fft.js';
export class AudioEngine {
    constructor(fftSize = 4096, sampleRate = 44100) {
        this.fftSize = fftSize;
        this.sampleRate = sampleRate;
        // @ts-ignore
        this.fft = new FFT(fftSize);
    }
    getWindow() {
        const window = new Float32Array(this.fftSize);
        for (let i = 0; i < this.fftSize; i++) {
            window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (this.fftSize - 1)));
        }
        return window;
    }
    getFrequencyResponse(bands) {
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
    haar1d(arr) {
        let len = arr.length;
        const temp = new Float32Array(len);
        while (len > 1) {
            const half = len / 2;
            for (let i = 0; i < half; i++) {
                temp[i] = (arr[i * 2] + arr[i * 2 + 1]) / Math.SQRT2;
                temp[i + half] = (arr[i * 2] - arr[i * 2 + 1]) / Math.SQRT2;
            }
            for (let i = 0; i < len; i++)
                arr[i] = temp[i];
            len = half;
        }
    }
    ihaar1d(arr) {
        let len = 2;
        const temp = new Float32Array(arr.length);
        while (len <= arr.length) {
            const half = len / 2;
            for (let i = 0; i < half; i++) {
                temp[i * 2] = (arr[i] + arr[i + half]) / Math.SQRT2;
                temp[i * 2 + 1] = (arr[i] - arr[i + half]) / Math.SQRT2;
            }
            for (let i = 0; i < len; i++)
                arr[i] = temp[i];
            len *= 2;
        }
    }
    applyHaarEq(inputArray, bands, sampleRate) {
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
    async processBuffer(buffer, bands, type = "fourier") {
        const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        const outBuffer = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        this.sampleRate = buffer.sampleRate;
        if (type === "wavelet") {
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const filtered = this.applyHaarEq(buffer.getChannelData(channel), bands, buffer.sampleRate);
                outBuffer.getChannelData(channel).set(filtered);
                await new Promise(r => setTimeout(r, 0)); // Yield to main thread
            }
            return outBuffer;
        }
        const response = this.getFrequencyResponse(bands);
        const window = this.getWindow();
        const hopSize = this.fftSize / 2;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const inputData = buffer.getChannelData(channel);
            const outputData = outBuffer.getChannelData(channel);
            const complexArray = this.fft.createComplexArray();
            const realInput = new Float32Array(this.fftSize);
            let iterations = 0;
            for (let i = 0; i < inputData.length - this.fftSize; i += hopSize) {
                realInput.fill(0);
                for (let j = 0; j < this.fftSize; j++) {
                    if (i + j < inputData.length) {
                        realInput[j] = inputData[i + j] * window[j];
                    }
                }
                this.fft.realTransform(complexArray, realInput);
                for (let k = 0; k <= this.fftSize / 2; k++) {
                    const reIdx = k * 2;
                    const imIdx = k * 2 + 1;
                    const multiplier = response[k];
                    complexArray[reIdx] *= multiplier;
                    complexArray[imIdx] *= multiplier;
                }
                this.fft.completeSpectrum(complexArray);
                const outComplex = this.fft.createComplexArray();
                this.fft.inverseTransform(outComplex, complexArray);
                for (let j = 0; j < this.fftSize; j++) {
                    if (i + j < outputData.length) {
                        const val = (outComplex[j * 2] / this.fftSize) * window[j];
                        if (!isNaN(val)) {
                            outputData[i + j] += val;
                        }
                    }
                }
                iterations++;
                // Yield every ~100 frames to keep the UI responsive
                if (iterations % 100 === 0) {
                    await new Promise(r => setTimeout(r, 0));
                }
            }
        }
        return outBuffer;
    }
}
