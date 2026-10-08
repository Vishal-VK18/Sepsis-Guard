/**
 * SepsisGuard IoT Patient Early Warning Monitoring System
 * Web Serial API Manager & ESP32 Offline Simulator
 */

export class SerialManager {
  constructor(parser, callbacks = {}) {
    this.parser = parser;
    this.callbacks = {
      onConnect: callbacks.onConnect || (() => {}),
      onDisconnect: callbacks.onDisconnect || (() => {}),
      onError: callbacks.onError || (() => {}),
      onStatusChange: callbacks.onStatusChange || (() => {}),
    };

    this.port = null;
    this.reader = null;
    this.keepReading = false;
    this.isConnected = false;
    this.isSimulated = false;
    this.simInterval = null;
    this.simConfig = {
      highTempAlert: true,
      abnormalOrientation: false,
      enableHeartRate: false, // Default false: MAX30102 physically unconnected per requirement
      baseTemp: 34.20,
      baseOrient: 18.50,
      baseHr: 74,
    };
  }

  isSupported() {
    return 'serial' in navigator;
  }

  /**
   * Request user to pick an ESP32 serial port and open connection
   */
  async connect(baudRate = 115200) {
    if (!this.isSupported()) {
      throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or enable Simulation Mode.');
    }

    try {
      this.callbacks.onStatusChange('connecting');
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: parseInt(baudRate, 10) || 115200 });

      this.isConnected = true;
      this.isSimulated = false;
      this.keepReading = true;
      this.callbacks.onConnect({
        baudRate: baudRate,
        isSimulated: false,
      });

      this.readLoop();
      return true;
    } catch (err) {
      this.isConnected = false;
      this.callbacks.onError(err);
      this.callbacks.onStatusChange('disconnected');
      throw err;
    }
  }

  async readLoop() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    this.reader = reader;

    try {
      while (this.keepReading) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.parser.feed(value);
        }
      }
    } catch (error) {
      console.warn('Serial stream read error:', error);
      this.callbacks.onError(error);
    } finally {
      reader.releaseLock();
      this.disconnect();
    }
  }

  async disconnect() {
    this.keepReading = false;
    this.stopSimulation();

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
      this.reader = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
      this.port = null;
    }

    this.isConnected = false;
    this.isSimulated = false;
    this.callbacks.onDisconnect();
    this.callbacks.onStatusChange('disconnected');
    this.parser.reset();
  }

  /**
   * Toggle offline ESP32 Simulator for testing without physical board
   */
  startSimulation(baudRate = 115200) {
    if (this.isConnected) {
      this.disconnect();
    }

    this.isSimulated = true;
    this.isConnected = true;
    this.callbacks.onConnect({
      baudRate: baudRate,
      isSimulated: true,
    });

    this.simInterval = setInterval(() => {
      // Sensor jitter
      const tempJitter = (Math.random() * 0.2 - 0.1);
      const orientJitter = (Math.random() * 0.6 - 0.3);

      let currentTemp = (this.simConfig.baseTemp + tempJitter);
      let currentOrient = this.simConfig.abnormalOrientation ? 95.4 : (this.simConfig.baseOrient + orientJitter);

      const isHighTemp = this.simConfig.highTempAlert && (currentTemp > 34.0);
      const isAbnormalOrient = this.simConfig.abnormalOrientation || (Math.abs(currentOrient) > 90.0);
      const isBuzzerOn = isHighTemp || isAbnormalOrient;

      let output = '\n--- TMP117 ---\n';
      output += `Temperature: ${currentTemp.toFixed(2)} C\n`;

      output += '--- MPU6050 ---\n';
      output += `Orientation: ${currentOrient.toFixed(2)} deg\n`;
      output += `Accel: X: 0.05, Y: 0.02, Z: 0.98 g\n`;
      output += `Gyro: X: 0.1, Y: -0.2, Z: 0.0 deg/s\n`;

      output += '--- MAX30102 ---\n';
      if (this.simConfig.enableHeartRate) {
        const hrJitter = Math.floor(Math.random() * 4 - 2);
        output += `Heart Rate: ${this.simConfig.baseHr + hrJitter} BPM\n`;
      } else {
        output += 'MAX30102: NOT DETECTED\n';
      }

      output += '--- OLED ---\n';
      output += 'OLED: READY\n';

      output += '--- Buzzer ---\n';
      if (isHighTemp && isAbnormalOrient) {
        output += 'BUZZER: ON - HIGH TEMPERATURE & ORIENTATION ALERT\n';
      } else if (isHighTemp) {
        output += 'BUZZER: ON - HIGH TEMPERATURE\n';
      } else if (isAbnormalOrient) {
        output += 'BUZZER: ON - ABNORMAL ORIENTATION\n';
      } else {
        output += 'BUZZER: OFF\n';
      }
      output += '================================\n';

      this.parser.feed(output);
    }, 2000);
  }

  stopSimulation() {
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
  }

  setSimTempAlert(enableHighTemp) {
    this.simConfig.highTempAlert = enableHighTemp;
    this.simConfig.baseTemp = enableHighTemp ? 34.25 : 32.40;
  }

  setSimOrientationAlert(enableAbnormal) {
    this.simConfig.abnormalOrientation = enableAbnormal;
  }

  setSimHeartRate(enable) {
    this.simConfig.enableHeartRate = enable;
  }
}
