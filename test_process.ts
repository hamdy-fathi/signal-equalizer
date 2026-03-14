import { AudioEngine } from './src/lib/audioEngine';

class MockAudioBuffer {
  numberOfChannels = 1;
  length = 44100;
  sampleRate = 44100;
  data = new Float32Array(44100);
  constructor() {
    for(let i=0; i<44100; i++) this.data[i] = Math.sin(i * 0.1);
  }
  getChannelData() { return this.data; }
}

// @ts-ignore
global.OfflineAudioContext = class {
  constructor(c: any, l: any, s: any) { this.c = c; this.l = l; this.s = s; }
  createBuffer(c: any, l: any, s: any) { return new MockAudioBuffer(); }
}

async function run() {
  const engine = new AudioEngine(4096, 44100);
  const buf = new MockAudioBuffer() as any;
  console.log("Starting processBuffer...");
  const start = Date.now();
  const out = await engine.processBuffer(buf, [{id:"1", frequency:1000, gain:1, q:1}]);
  console.log("Done in", Date.now() - start, "ms");
  
  let valid = false;
  const outData = out.getChannelData(0);
  let nanFound = false;
  for(let i=0; i<outData.length; i++) {
    if (isNaN(outData[i])) { nanFound = true; }
    if (outData[i] !== 0 && !isNaN(outData[i])) {
      valid = true;
    }
  }
  console.log("Output has non-zero values:", valid, "NaN found:", nanFound);
  if (!valid || nanFound) {
    console.log("First 10 values:", outData.slice(0, 10));
  }
}
run().catch(console.error);
