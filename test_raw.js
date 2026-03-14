const FFT = require('fft.js');

function testProcess() {
  const fftSize = 64;
  const fft = new FFT(fftSize);
  
  // Create window
  const window = new Float32Array(fftSize);
  window.fill(1.0);

  // Input data
  const realInput = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) realInput[i] = Math.sin(i * 0.1);

  const complexArray = fft.createComplexArray();
  fft.realTransform(complexArray, realInput);
  fft.completeSpectrum(complexArray);
  
  const outComplex = fft.createComplexArray();
  fft.inverseTransform(outComplex, complexArray);
  
  const outputData = new Float32Array(fftSize);
  for (let j = 0; j < fftSize; j++) {
    outputData[j] = outComplex[j * 2] / fftSize;
  }

  console.log("Input:", realInput.slice(0, 5));
  console.log("Output:", outputData.slice(0, 5));
}

testProcess();
