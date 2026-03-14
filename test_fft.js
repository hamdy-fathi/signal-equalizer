const FFT = require('fft.js');
const fftSize = 64;
const fft = new FFT(fftSize);

const input = new Float32Array(fftSize);
for(let i=0; i<fftSize; i++) input[i] = Math.sin(i * 0.1);

const complexArray = fft.createComplexArray();
try {
    fft.realTransform(complexArray, input);
    console.log("realTransform success");
    fft.completeSpectrum(complexArray);
    console.log("completeSpectrum success");
    const outComplex = fft.createComplexArray();
    fft.inverseTransform(outComplex, complexArray);
    console.log("inverseTransform success");
} catch(e) {
    console.error("Error:", e);
}
