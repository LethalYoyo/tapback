// AudioWorklet continues processing when the studio window is hidden.
class TapMeter extends AudioWorkletProcessor {
  constructor() { super(); this.sum = 0; this.peak = 0; this.count = 0; }
  process(inputs) {
    const data = inputs[0]?.[0];
    if (data) {
      for (const sample of data) { this.sum += sample * sample; this.peak = Math.max(this.peak, Math.abs(sample)); this.count++; }
      if (this.count >= 512) {
        this.port.postMessage({ rms: Math.sqrt(this.sum / this.count), peak: this.peak });
        this.sum = 0; this.peak = 0; this.count = 0;
      }
    }
    return true;
  }
}
registerProcessor('tap-meter', TapMeter);
