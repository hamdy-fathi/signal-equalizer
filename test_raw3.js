const FFT = require('fft.js');

function testProcess() {
  const fftSize = 64;
  const fft = new FFT(fftSize);

  const realInput = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) realInput[i] = Math.sin(i * 0.1);

  const complexArray = fft.createComplexArray();
  fft.realTransform(complexArray, realInput);
  fft.completeSpectrum(complexArray);
  
  const outComplex = fft.createComplexArray();
  fft.inverseTransform(outComplex, complexArray);
  
  const outputDataNoDivision = new Float32Array(fftSize);
  for (let j = 0; j < fftSize; j++) {
    outputDataNoDivision[j] = outComplex[j * 2];
  }

  console.log("Input:", Array.from(realInput).slice(0, 5));
  console.log("Output (No Division by N):", Array.from(outputDataNoDivision).slice(0, 5));
}

testProcess();
