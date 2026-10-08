/**
 * SepsisGuard IoT Patient Early Warning Monitoring System
 * Serial Data Parser for ESP32 Firmware Output
 */

export class ESP32Parser {
  constructor(onReadingComplete, onRawLine) {
    this.onReadingComplete = onReadingComplete || (() => {});
    this.onRawLine = onRawLine || (() => {});
    this.buffer = '';
    this.currentCycle = this.createEmptyCycle();
    this.hasActiveFields = false;
  }

  createEmptyCycle() {
    return {
      temperature: null,
      tmp117Error: false,
      heartRate: null,
      max30102Connected: false,
      max30102Status: 'DISCONNECTED',
      orientation: null,
      accel: { x: null, y: null, z: null },
      gyro: { x: null, y: null, z: null },
      mpu6050Connected: false,
      oledStatus: 'STANDBY',
      buzzerState: null,
      buzzerReason: '',
      timestamp: null,
    };
  }

  /**
   * Feed a raw text chunk received from Web Serial
   */
  feed(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop();

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '').trim();
      if (line.length > 0) {
        this.parseLine(line);
      }
    }
  }

  /**
   * Process an individual line of serial output
   */
  parseLine(line) {
    this.onRawLine(line);

    // End-of-cycle delimiter (standard delimiter convention)
    if (line.startsWith('=====')) {
      if (this.hasActiveFields) {
        this.emitCycle();
      }
      return;
    }

    // Auto-emit if a new cycle starts without explicit ===== delimiter
    if (line.match(/^Temperature:/i) && this.currentCycle.temperature !== null) {
      this.emitCycle();
    }

    // TMP117 Temperature Parsing
    // e.g. "Temperature: 34.20 C", "Temperature: 34.2 C"
    const tempMatch = line.match(/^Temperature:\s*([0-9.]+)\s*C?/i) || line.match(/^(?:TMP117|Temp):\s*([0-9.]+)/i);
    if (tempMatch) {
      this.currentCycle.temperature = parseFloat(tempMatch[1]);
      this.currentCycle.tmp117Error = false;
      this.hasActiveFields = true;
      return;
    }

    // TMP117 Error
    if (line.includes('TMP117 ERROR') || line.includes('TMP117 NOT FOUND')) {
      this.currentCycle.tmp117Error = true;
      this.hasActiveFields = true;
      return;
    }

    // MAX30102 Heart Rate Parsing
    // e.g. "Heart Rate: 74 BPM", "Heart Rate: 74", "BPM: 74"
    const hrMatch = line.match(/^Heart Rate:\s*([0-9]+)\s*(?:BPM)?/i) || line.match(/^BPM:\s*([0-9]+)/i);
    if (hrMatch) {
      this.currentCycle.heartRate = parseInt(hrMatch[1], 10);
      this.currentCycle.max30102Connected = true;
      this.currentCycle.max30102Status = 'ACTIVE';
      this.hasActiveFields = true;
      return;
    }

    if (line.includes('MAX30102: NO FINGER')) {
      this.currentCycle.heartRate = null;
      this.currentCycle.max30102Connected = true;
      this.currentCycle.max30102Status = 'NO_FINGER';
      this.hasActiveFields = true;
      return;
    }

    if (line.includes('MAX30102 NOT FOUND') || line.includes('MAX30102: NOT DETECTED') || line.includes('MAX30102: DISCONNECTED')) {
      this.currentCycle.heartRate = null;
      this.currentCycle.max30102Connected = false;
      this.currentCycle.max30102Status = 'DISCONNECTED';
      this.hasActiveFields = true;
      return;
    }

    // MPU6050 Orientation Parsing
    // e.g. "Orientation: 12.4 deg", "Orientation: 12.4", "Angle: 12.4"
    const orientMatch = line.match(/^(?:Orientation|Angle):\s*([0-9.-]+)/i);
    if (orientMatch) {
      this.currentCycle.orientation = parseFloat(orientMatch[1]);
      this.currentCycle.mpu6050Connected = true;
      this.hasActiveFields = true;
      return;
    }

    // Pitch & Roll combined format: "Pitch: 12.4 Roll: -5.2"
    const pitchRollMatch = line.match(/Pitch:\s*([0-9.-]+)\s*Roll:\s*([0-9.-]+)/i);
    if (pitchRollMatch) {
      this.currentCycle.orientation = parseFloat(pitchRollMatch[1]);
      this.currentCycle.mpu6050Connected = true;
      this.hasActiveFields = true;
      return;
    }

    // MPU6050 Acceleration: "Accel: X: 0.05, Y: 0.02, Z: 0.98 g" or "Ax: 0.05 Ay: 0.02 Az: 0.98"
    const accelMatch = line.match(/(?:Accel|Acceleration):\s*X:\s*([0-9.-]+),?\s*Y:\s*([0-9.-]+),?\s*Z:\s*([0-9.-]+)/i) ||
                       line.match(/Ax:\s*([0-9.-]+)\s*Ay:\s*([0-9.-]+)\s*Az:\s*([0-9.-]+)/i);
    if (accelMatch) {
      this.currentCycle.accel = {
        x: parseFloat(accelMatch[1]),
        y: parseFloat(accelMatch[2]),
        z: parseFloat(accelMatch[3]),
      };
      this.currentCycle.mpu6050Connected = true;
      this.hasActiveFields = true;
      return;
    }

    // MPU6050 Gyroscope: "Gyro: X: 0.1, Y: -0.2, Z: 0.0 deg/s"
    const gyroMatch = line.match(/(?:Gyro|Gyroscope):\s*X:\s*([0-9.-]+),?\s*Y:\s*([0-9.-]+),?\s*Z:\s*([0-9.-]+)/i) ||
                      line.match(/Gx:\s*([0-9.-]+)\s*Gy:\s*([0-9.-]+)\s*Gz:\s*([0-9.-]+)/i);
    if (gyroMatch) {
      this.currentCycle.gyro = {
        x: parseFloat(gyroMatch[1]),
        y: parseFloat(gyroMatch[2]),
        z: parseFloat(gyroMatch[3]),
      };
      this.currentCycle.mpu6050Connected = true;
      this.hasActiveFields = true;
      return;
    }

    // MPU6050 Error / Not found
    if (line.includes('MPU6050 NOT FOUND') || line.includes('MPU6050 ERROR')) {
      this.currentCycle.mpu6050Connected = false;
      this.hasActiveFields = true;
      return;
    }

    // OLED Status
    if (line.includes('OLED NOT FOUND')) {
      this.currentCycle.oledStatus = 'ERROR';
      this.hasActiveFields = true;
      return;
    }
    if (line.includes('SYSTEM READY') || line.includes('OLED: READY')) {
      this.currentCycle.oledStatus = 'ACTIVE';
      this.hasActiveFields = true;
      return;
    }

    // Buzzer State Parsing - CRITICAL ALERT SOURCE OF TRUTH
    // "BUZZER: ON - HIGH TEMPERATURE"
    if (line.includes('BUZZER: ON - HIGH TEMPERATURE')) {
      this.currentCycle.buzzerState = 'ON';
      this.currentCycle.buzzerReason = 'High Temperature';
      this.hasActiveFields = true;
      return;
    }

    // "BUZZER: ON - ABNORMAL ORIENTATION"
    if (line.includes('BUZZER: ON - ABNORMAL ORIENTATION')) {
      this.currentCycle.buzzerState = 'ON';
      this.currentCycle.buzzerReason = 'Abnormal Orientation';
      this.hasActiveFields = true;
      return;
    }

    // General "BUZZER: ON"
    if (line.startsWith('BUZZER: ON')) {
      this.currentCycle.buzzerState = 'ON';
      this.currentCycle.buzzerReason = line.replace('BUZZER: ON', '').replace('-', '').trim() || 'Patient Alert';
      this.hasActiveFields = true;
      return;
    }

    // "BUZZER: OFF"
    if (line.includes('BUZZER: OFF')) {
      this.currentCycle.buzzerState = 'OFF';
      this.currentCycle.buzzerReason = '';
      this.hasActiveFields = true;
      return;
    }
  }

  emitCycle() {
    this.currentCycle.timestamp = new Date();
    this.onReadingComplete({ ...this.currentCycle });
    this.currentCycle = this.createEmptyCycle();
    this.hasActiveFields = false;
  }

  reset() {
    this.buffer = '';
    this.currentCycle = this.createEmptyCycle();
    this.hasActiveFields = false;
  }
}
