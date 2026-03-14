const FFT = require('fft.js');
const fftSize = 4;
const fft = new FFT(fftSize);

const input = new Float32Array([1, 2, 3, 4]); // 4 samples
const complexArray = fft.createComplexArray();
fft.realTransform(complexArray, input);

fft.completeSpectrum(complexArray);

const outComplex = fft.createComplexArray();
fft.inverseTransform(outComplex, complexArray);

console.log("Input:", input);
console.log("Transformed:", complexArray);
console.log("Inverse:", outComplex);
