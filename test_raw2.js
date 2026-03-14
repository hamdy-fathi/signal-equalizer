const FFT = require('fft.js');

function testProcess() {
  const fftSize = 64;
  const fft = new FFT(fftSize);
  
  const window = new Float32Array(fftSize);
  window.fill(1.0);

  const realInput = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) realInput[i] = Math.sin(i * 0.1);

  const complexArray = fft.createComplexArray();
  fft.realTransform(complexArray, realInput);
  
  // What are the values before?
  console.log("Before multiply:", complexArray.slice(0, 4));
  
  // completeSpectrum
  fft.completeSpectrum(complexArray);
  console.log("After complete:", complexArray.slice(0, 4), "...", complexArray.slice(-4));
  
  const outComplex = fft.createComplexArray();
  fft.inverseTransform(outComplex, complexArray);
  
  const outputData = new Float32Array(fftSize);
  for (let j = 0; j < fftSize; j++) {
    outputData[j] = outComplex[j * 2] / fftSize; // only take real part
  }

  console.log("Input:", realInput.slice(0, 5));
  console.log("Output:", outputData.slice(0, 5));
}

testProcess();
