export async function connectArduino(
    onStatusUpdate: (status: string) => void,
    onWarning: (warning: string) => void,
    onData: (accel: number) => void
  ) {
    if (!("serial" in navigator)) {
      alert("Web Serial API only works in Google Chrome or Edge.");
      return;
    }
  
    const port = await (navigator as any).serial.requestPort();
    await port.open({ baudRate: 9600 });
  
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
  
    let buffer = "";
    let isCalibrating = true;
    let calibrationSum = 0;
    let calibrationCount = 0;
    let baseline = 0;
    
    const calibrationStartTime = performance.now();
    onStatusUpdate("Calibrating... Please hold still for 5 seconds.");
  
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
  
      for (const line of lines) {
        const val = parseFloat(line.trim());
        if (!isNaN(val)) {
          const currentTime = performance.now();
  
          if (isCalibrating) {
            calibrationSum += val;
            calibrationCount++;
  
            // Check if 5 seconds have passed
            if (currentTime - calibrationStartTime >= 5000) {
              baseline = calibrationCount > 0 ? calibrationSum / calibrationCount : val;
              isCalibrating = false;
              onStatusUpdate(`Calibrated! Baseline: ${baseline.toFixed(1)}`);
            }
          } else {
            // Normal tracking phase after calibration
            onData(val);
  
            // Check if movement deviates by more than 3 from baseline
            const difference = val - baseline;
            if (difference > 4) {
              onWarning("Moving too fast!");
            } else if (difference < -4) {
              onWarning("Moving too slow / dropping!");
            } else {
              onWarning("Speed looks good!");
            }
          }
        }
      }
    }
  }