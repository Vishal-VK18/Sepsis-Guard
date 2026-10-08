/**
 * SepsisGuard IoT Patient Early Warning Monitoring System
 * Application State & History Storage
 */

const STORAGE_KEY_HISTORY = 'sepsisguard_telemetry_history_v1';
const STORAGE_KEY_ALERTS = 'sepsisguard_alerts_history_v1';
const STORAGE_KEY_SETTINGS = 'sepsisguard_settings_v1';
const MAX_HISTORY_POINTS = 1000;

export const state = {
  connection: {
    status: 'disconnected', // 'connected' | 'disconnected' | 'connecting'
    baudRate: 115200,
    portName: 'COM3 (ESP32)',
    lastUpdate: null,
    isSimulated: false,
    rssi: -64,
  },
  current: {
    temperature: 34.20,
    heartRate: null, // null when MAX30102 physically disconnected
    max30102Connected: false,
    max30102Status: 'DISCONNECTED',
    orientation: 15.2,
    accel: { x: 0.05, y: 0.02, z: 0.98 },
    gyro: { x: 0.1, y: -0.2, z: 0.0 },
    mpu6050Connected: true,
    oledStatus: 'ACTIVE',
    buttonStatus: 'IDLE',
    sensors: {
      tmp117: 'ACTIVE',
      mpu6050: 'ACTIVE',
      max30102: 'DISCONNECTED', // Default physical state per requirement
      oled: 'ACTIVE',
      buzzer: 'ACTIVE',
      esp32: 'ACTIVE',
    },
    buzzer: {
      state: 'OFF', // 'OFF' | 'ACTIVE'
      reason: '',
      triggerTime: null,
    },
  },
  activeAlert: null, // null or { id, timestamp, temperature, orientation, threshold: 34.0, acknowledged: false, ackTime: null }
  history: [],
  alertsHistory: [],
  settings: {
    tempThreshold: 34.0, // Hardware setpoint reference (°C)
    orientationThreshold: 90.0, // Angle threshold (°)
    displayUnit: 'C',
    maxHistoryBuffer: 500,
  },
  listeners: [],
};

// Subscribe to state changes
export function subscribe(fn) {
  state.listeners.push(fn);
  return () => {
    state.listeners = state.listeners.filter(l => l !== fn);
  };
}

export function notify(event, payload) {
  for (const listener of state.listeners) {
    try {
      listener(event, payload, state);
    } catch (err) {
      console.error('State listener error:', err);
    }
  }
}

// Load initial state from localStorage
export function initStore() {
  try {
    const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (savedHistory) {
      state.history = JSON.parse(savedHistory);
    } else {
      seedInitialHistory();
    }

    const savedAlerts = localStorage.getItem(STORAGE_KEY_ALERTS);
    if (savedAlerts) {
      state.alertsHistory = JSON.parse(savedAlerts);
    } else {
      seedInitialAlerts();
    }

    const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (savedSettings) {
      Object.assign(state.settings, JSON.parse(savedSettings));
    }
  } catch (err) {
    console.warn('Could not load stored telemetry state:', err);
  }
}

function seedInitialHistory() {
  const now = Date.now();
  const samplePoints = [
    { offsetMins: 60, temp: 32.1, hr: null, orient: 12.0, buzzer: 'OFF' },
    { offsetMins: 45, temp: 32.6, hr: null, orient: 14.5, buzzer: 'OFF' },
    { offsetMins: 30, temp: 33.2, hr: null, orient: 18.0, buzzer: 'OFF' },
    { offsetMins: 15, temp: 33.8, hr: null, orient: 16.2, buzzer: 'OFF' },
    { offsetMins: 4,  temp: 34.1, hr: null, orient: 22.0, buzzer: 'ON' },
    { offsetMins: 0,  temp: 34.2, hr: null, orient: 24.5, buzzer: 'ON' },
  ];

  state.history = samplePoints.map((pt) => {
    const t = new Date(now - pt.offsetMins * 60 * 1000);
    return {
      id: 'h-' + (now - pt.offsetMins * 60000),
      timestamp: t.toISOString(),
      displayTime: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      temperature: pt.temp,
      heartRate: pt.hr,
      orientation: pt.orient,
      max30102Connected: false,
      mpu6050Connected: true,
      buzzerState: pt.buzzer,
      alertActive: pt.buzzer === 'ON',
    };
  });
}

function seedInitialAlerts() {
  const now = Date.now();
  state.alertsHistory = [
    {
      id: 'alert-initial-1',
      timestamp: new Date(now - 4 * 60 * 1000).toISOString(),
      displayTime: new Date(now - 4 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      event: 'Abnormal Vital: Elevated Temperature (34.2 °C)',
      hardwareBuzzer: 'ACTIVE',
      acknowledged: false,
      ackTime: null,
      audit: 'Unacknowledged',
      temperature: 34.20,
      orientation: 24.5,
    },
    {
      id: 'alert-initial-2',
      timestamp: new Date(now - 8 * 60 * 1000).toISOString(),
      displayTime: new Date(now - 8 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      event: 'Early Warning: Temperature Threshold Exceeded (34.1 °C)',
      hardwareBuzzer: 'ACTIVE',
      acknowledged: true,
      ackTime: new Date(now - 6 * 60 * 1000).toISOString(),
      audit: 'Clinical Staff 01',
      temperature: 34.10,
      orientation: 22.0,
    },
    {
      id: 'alert-initial-3',
      timestamp: new Date(now - 35 * 60 * 1000).toISOString(),
      displayTime: new Date(now - 35 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      event: 'Patient Calibration Check',
      hardwareBuzzer: 'OFF',
      acknowledged: true,
      ackTime: new Date(now - 35 * 60 * 1000).toISOString(),
      audit: 'Auto-Sys',
      temperature: 32.50,
      orientation: 15.0,
    },
    {
      id: 'alert-initial-4',
      timestamp: new Date(now - 80 * 60 * 1000).toISOString(),
      displayTime: new Date(now - 80 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      event: 'ESP32 Node Reconnected (Cold Boot)',
      hardwareBuzzer: 'OFF',
      acknowledged: true,
      ackTime: new Date(now - 80 * 60 * 1000).toISOString(),
      audit: 'Core v2.0',
      temperature: 32.10,
      orientation: 12.0,
    },
  ];
}

export function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(state.history.slice(-MAX_HISTORY_POINTS)));
    localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(state.alertsHistory.slice(-256)));
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(state.settings));
  } catch (err) {
    console.warn('Storage save failed:', err);
  }
}

/**
 * Record a complete sensor cycle received from ESP32
 */
export function recordReading(reading) {
  const timestamp = new Date();
  state.connection.lastUpdate = timestamp;

  // Update current telemetry
  if (typeof reading.temperature === 'number') {
    state.current.temperature = reading.temperature;
    state.current.sensors.tmp117 = 'ACTIVE';
  } else if (reading.tmp117Error) {
    state.current.sensors.tmp117 = 'ERROR';
  }

  // Heart Rate & MAX30102 status
  if (typeof reading.heartRate === 'number') {
    state.current.heartRate = reading.heartRate;
    state.current.max30102Connected = true;
    state.current.max30102Status = 'ACTIVE';
    state.current.sensors.max30102 = 'ACTIVE';
  } else if (reading.max30102Status === 'NO_FINGER') {
    state.current.heartRate = null;
    state.current.max30102Connected = true;
    state.current.max30102Status = 'NO_FINGER';
    state.current.sensors.max30102 = 'NO_FINGER';
  } else if (reading.max30102Status === 'DISCONNECTED') {
    state.current.heartRate = null;
    state.current.max30102Connected = false;
    state.current.max30102Status = 'DISCONNECTED';
    state.current.sensors.max30102 = 'DISCONNECTED';
  }

  // Orientation & MPU6050
  if (typeof reading.orientation === 'number') {
    state.current.orientation = reading.orientation;
    state.current.mpu6050Connected = true;
    state.current.sensors.mpu6050 = 'ACTIVE';
  }
  if (reading.accel && reading.accel.x !== null) {
    state.current.accel = { ...reading.accel };
    state.current.mpu6050Connected = true;
  }
  if (reading.gyro && reading.gyro.x !== null) {
    state.current.gyro = { ...reading.gyro };
    state.current.mpu6050Connected = true;
  }

  if (reading.oledStatus) {
    state.current.oledStatus = reading.oledStatus;
    state.current.sensors.oled = reading.oledStatus;
  }

  // Alert Condition Check:
  // 1. Hardware Buzzer explicitly ON via ESP32 output
  // 2. Temperature > 34.0 °C
  // 3. Absolute orientation angle > 90°
  const isHighTemp = typeof state.current.temperature === 'number' && state.current.temperature > state.settings.tempThreshold;
  const isAbnormalOrientation = typeof state.current.orientation === 'number' && Math.abs(state.current.orientation) > state.settings.orientationThreshold;
  const isExplicitBuzzerOn = reading.buzzerState === 'ON';
  const isBuzzerActive = isExplicitBuzzerOn || isHighTemp || isAbnormalOrientation;

  state.current.buzzer.state = isBuzzerActive ? 'ACTIVE' : 'OFF';

  let alertReason = '';
  if (isHighTemp && isAbnormalOrientation) {
    alertReason = 'Elevated Temperature & Posture Change';
  } else if (isHighTemp) {
    alertReason = 'Elevated Temperature (> 34.0 °C)';
  } else if (isAbnormalOrientation) {
    alertReason = 'Abnormal Orientation / Posture (> 90°)';
  } else if (isExplicitBuzzerOn) {
    alertReason = reading.buzzerReason || 'Patient Early Warning';
  }

  state.current.buzzer.reason = isBuzzerActive ? alertReason : '';

  if (isBuzzerActive) {
    if (!state.activeAlert) {
      state.activeAlert = {
        id: 'alert-' + timestamp.getTime(),
        timestamp: timestamp.toISOString(),
        displayTime: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        temperature: state.current.temperature,
        orientation: state.current.orientation,
        heartRate: state.current.heartRate,
        reason: alertReason,
        threshold: state.settings.tempThreshold,
        acknowledged: false,
        ackTime: null,
      };

      state.alertsHistory.unshift({
        id: state.activeAlert.id,
        timestamp: timestamp.toISOString(),
        displayTime: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        event: `Patient Alert: ${alertReason} (${state.current.temperature !== null ? state.current.temperature.toFixed(1) + ' °C' : ''})`,
        hardwareBuzzer: 'ACTIVE',
        acknowledged: false,
        ackTime: null,
        audit: 'Unacknowledged',
        temperature: state.current.temperature,
        orientation: state.current.orientation,
        heartRate: state.current.heartRate,
      });

      notify('alert_triggered', state.activeAlert);
    }
  } else {
    // Alert condition resolved
    if (state.activeAlert) {
      const clearedAlert = state.activeAlert;
      state.activeAlert = null;
      notify('alert_cleared', clearedAlert);
    }
  }

  // Append to history buffer
  const historyEntry = {
    id: 'h-' + timestamp.getTime(),
    timestamp: timestamp.toISOString(),
    displayTime: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    temperature: state.current.temperature,
    heartRate: state.current.heartRate,
    orientation: state.current.orientation,
    accel: { ...state.current.accel },
    gyro: { ...state.current.gyro },
    max30102Connected: state.current.max30102Connected,
    mpu6050Connected: state.current.mpu6050Connected,
    buzzerState: state.current.buzzer.state,
    alertActive: state.current.buzzer.state === 'ACTIVE',
  };

  state.history.push(historyEntry);
  if (state.history.length > MAX_HISTORY_POINTS) {
    state.history.shift();
  }

  saveState();
  notify('reading_recorded', historyEntry);
}

/**
 * Acknowledge an active or logged alert
 */
export function acknowledgeAlert(alertId, operator = 'Clinical Staff') {
  const now = new Date();
  let found = false;

  if (state.activeAlert && (state.activeAlert.id === alertId || !alertId)) {
    state.activeAlert.acknowledged = true;
    state.activeAlert.ackTime = now.toISOString();
    found = true;
  }

  state.alertsHistory = state.alertsHistory.map(a => {
    if (a.id === alertId || (!alertId && !a.acknowledged)) {
      found = true;
      return {
        ...a,
        acknowledged: true,
        ackTime: now.toISOString(),
        audit: operator,
      };
    }
    return a;
  });

  saveState();
  notify('alert_acknowledged', { alertId, operator, ackTime: now });
  return found;
}

/**
 * Filter history based on time window
 */
export function getFilteredHistory(windowType = 'all') {
  const now = Date.now();
  let cutoff = 0;

  if (windowType === '15m') {
    cutoff = now - 15 * 60 * 1000;
  } else if (windowType === '1h') {
    cutoff = now - 60 * 60 * 1000;
  } else if (windowType === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    cutoff = today.getTime();
  }

  if (cutoff === 0) return [...state.history];
  return state.history.filter(h => new Date(h.timestamp).getTime() >= cutoff);
}

/**
 * Calculate statistical aggregates for a metric
 */
export function calculateStats(metricKey, entries) {
  if (!entries || entries.length === 0) {
    return { min: 0, max: 0, avg: 0, count: 0, latest: 0 };
  }

  const values = entries
    .map(e => e[metricKey])
    .filter(v => typeof v === 'number' && !isNaN(v));

  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, count: 0, latest: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const latest = values[values.length - 1];

  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    avg: Number(avg.toFixed(2)),
    latest: Number(latest.toFixed(2)),
    count: values.length,
  };
}

export function clearHistory() {
  state.history = [];
  state.alertsHistory = [];
  localStorage.removeItem(STORAGE_KEY_HISTORY);
  localStorage.removeItem(STORAGE_KEY_ALERTS);
  notify('history_cleared');
}
