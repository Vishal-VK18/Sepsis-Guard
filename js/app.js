/**
 * SepsisGuard IoT Patient Early Warning Monitoring System
 * Main Frontend Application Controller
 */

import {
  state,
  initStore,
  subscribe,
  recordReading,
  acknowledgeAlert,
  getFilteredHistory,
  calculateStats,
  clearHistory,
} from './state.js';
import { ESP32Parser } from './parser.js';
import { SerialManager } from './serial.js';
import { TelemetryCharts } from './charts.js';
import { ReportsEngine } from './reports.js';

// Web Audio Context for clinical buzzer alerts
let audioCtx = null;
let isAudioMuted = false;

function playAlertTone() {
  if (isAudioMuted) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) {
    console.warn('Audio play failed:', e);
  }
}

// --------------------------------------------------------------------------
// Application Initialization
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initStore();

  // Serial Parser Setup
  const parser = new ESP32Parser(
    (reading) => {
      recordReading(reading);
    },
    (rawLine) => {
      appendTerminalLine(rawLine);
    }
  );

  // Serial Manager Setup
  const serialManager = new SerialManager(parser, {
    onConnect: (info) => {
      updateConnectionUI(true, info);
    },
    onDisconnect: () => {
      updateConnectionUI(false);
    },
    onError: (err) => {
      console.error('Serial Error:', err);
      appendTerminalLine(`[ERROR: ${err.message || err}]`, true);
    },
    onStatusChange: (status) => {
      updateStatusBadge(status);
    },
  });

  // State Change Listener
  subscribe((event, payload, currentState) => {
    handleStateUpdate(event, payload, currentState);
  });

  // UI Setup
  initNavigation();
  initDashboardActions(serialManager);
  initHistoryView();
  initReportsView();
  initAlertsView();
  initSettingsView(serialManager);
  initModals();

  // Initial UI Render
  renderDashboard(state);
  renderSparklines();
  renderTimeline(state.alertsHistory);

  // Live Clock
  setInterval(updateLiveClock, 1000);
  updateLiveClock();
});

// --------------------------------------------------------------------------
// Navigation & Tab Switching
// --------------------------------------------------------------------------
function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const views = document.querySelectorAll('.tab-view');

  function switchTab(targetTab) {
    const tabName = targetTab.replace('#', '') || 'dashboard';

    views.forEach(v => {
      if (v.id === `tab-${tabName}`) {
        v.classList.remove('hidden');
      } else {
        v.classList.add('hidden');
      }
    });

    navLinks.forEach(link => {
      if (link.dataset.tab === tabName) {
        link.className = 'nav-link group flex items-center gap-space-sm px-space-md py-space-sm rounded transition-all bg-primary-container text-surface border border-primary-container shadow-none';
      } else {
        link.className = 'nav-link group flex items-center gap-space-sm px-space-md py-space-sm rounded border border-transparent text-secondary hover:border-outline-variant hover:text-primary-container transition-all';
      }
    });

    const subhead = document.getElementById('top-subhead');
    if (subhead) {
      const titles = {
        dashboard: 'ESP32 Patient Telemetry Stream',
        history: 'Patient Telemetry Log & Charts',
        reports: 'Clinical Diagnostics & CSV Export',
        sensors: 'Patient Hardware Interface Specs',
        alerts: 'Hardware Buzzer & Early Warning Audit Log',
        settings: 'UART & Simulator Settings',
      };
      subhead.textContent = titles[tabName] || 'ESP32 Patient Telemetry';
    }

    if (tabName === 'history') {
      renderHistoryView();
    } else if (tabName === 'reports') {
      renderReportsView();
    } else if (tabName === 'alerts') {
      renderAlertsTable();
    }
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('href');
      history.pushState(null, '', target);
      switchTab(target);
    });
  });

  window.addEventListener('popstate', () => {
    switchTab(window.location.hash || '#dashboard');
  });

  // Initial route
  switchTab(window.location.hash || '#dashboard');
}

// --------------------------------------------------------------------------
// Dashboard & Telemetry Rendering
// --------------------------------------------------------------------------
function renderDashboard(currentState) {
  const c = currentState.current;

  // Temperature (TMP117)
  const tempEl = document.getElementById('dash-val-temp');
  if (tempEl && typeof c.temperature === 'number') {
    tempEl.textContent = c.temperature.toFixed(2);
  }
  const tempBadge = document.getElementById('badge-temp-status');
  if (tempBadge) {
    const isHigh = c.temperature > currentState.settings.tempThreshold;
    tempBadge.textContent = isHigh ? 'Elevated' : 'Nominal';
    tempBadge.className = isHigh
      ? 'px-space-xs py-0.5 bg-primary text-surface font-label-sm text-label-sm tracking-wider uppercase rounded font-semibold'
      : 'px-space-xs py-0.5 border border-primary text-primary font-label-sm text-label-sm tracking-wider uppercase rounded font-semibold bg-brand-lavender/10';
  }

  // Heart Rate (MAX30102) - STRICT: show actual unavailable state if disconnected
  const hrEl = document.getElementById('dash-val-hr');
  const hrBadge = document.getElementById('badge-hr-status');
  const hrSubtext = document.getElementById('dash-hr-subtext');

  if (c.max30102Connected && typeof c.heartRate === 'number') {
    if (hrEl) hrEl.textContent = c.heartRate;
    if (hrBadge) {
      const isHigh = c.heartRate > 100 || c.heartRate < 50;
      hrBadge.textContent = isHigh ? 'Abnormal' : 'Nominal';
      hrBadge.className = isHigh
        ? 'px-space-xs py-0.5 bg-primary text-surface font-label-sm text-label-sm tracking-wider uppercase rounded font-semibold'
        : 'px-space-xs py-0.5 border border-primary text-primary font-label-sm text-label-sm tracking-wider uppercase rounded font-semibold bg-brand-lavender/10';
    }
    if (hrSubtext) hrSubtext.textContent = 'Optical PPG Pulse Active';
  } else {
    if (hrEl) hrEl.textContent = '--';
    if (hrBadge) {
      hrBadge.textContent = c.max30102Status === 'NO_FINGER' ? 'No Finger' : 'Disconnected';
      hrBadge.className = 'px-space-xs py-0.5 border border-outline text-secondary font-label-sm text-label-sm tracking-wider uppercase rounded font-semibold bg-brand-lavender/10';
    }
    if (hrSubtext) hrSubtext.textContent = 'Physical Sensor Unconnected';
  }

  // Orientation (MPU6050)
  const orientEl = document.getElementById('dash-val-orient');
  const orientBadge = document.getElementById('badge-orient-status');
  if (orientEl && typeof c.orientation === 'number') {
    orientEl.textContent = c.orientation.toFixed(1);
  }
  if (orientBadge) {
    const isAbnormal = Math.abs(c.orientation) > currentState.settings.orientationThreshold;
    orientBadge.textContent = isAbnormal ? 'Posture Alert' : 'Normal';
    orientBadge.className = isAbnormal
      ? 'px-space-xs py-0.5 bg-primary text-surface font-label-sm text-label-sm tracking-wider uppercase rounded font-semibold'
      : 'px-space-xs py-0.5 border border-primary text-primary font-label-sm text-label-sm tracking-wider uppercase rounded font-semibold bg-brand-lavender/10';
  }

  // Motion & Acceleration (MPU6050)
  const motionBadge = document.getElementById('dash-motion-badge');
  const motionRadarText = document.getElementById('dash-motion-radar-text');
  const axEl = document.getElementById('dash-val-ax');
  const ayEl = document.getElementById('dash-val-ay');
  const azEl = document.getElementById('dash-val-az');

  if (c.mpu6050Connected) {
    if (motionBadge) {
      motionBadge.textContent = 'ACTIVE TRACKING';
      motionBadge.className = 'px-space-xs py-0.5 bg-primary text-surface font-label-sm text-label-sm tracking-wider uppercase rounded font-semibold';
    }
    if (motionRadarText) motionRadarText.textContent = '6-DOF Inertial Stream Active';
    if (axEl && c.accel.x !== null) axEl.textContent = c.accel.x.toFixed(2) + ' g';
    if (ayEl && c.accel.y !== null) ayEl.textContent = c.accel.y.toFixed(2) + ' g';
    if (azEl && c.accel.z !== null) azEl.textContent = c.accel.z.toFixed(2) + ' g';
  } else {
    if (motionBadge) {
      motionBadge.textContent = 'STANDBY';
      motionBadge.className = 'px-space-xs py-0.5 border border-primary text-primary font-label-sm text-label-sm tracking-wider uppercase rounded font-semibold bg-brand-lavender/20';
    }
    if (motionRadarText) motionRadarText.textContent = 'Awaiting MPU6050 frames...';
    if (axEl) axEl.textContent = '--';
    if (ayEl) ayEl.textContent = '--';
    if (azEl) azEl.textContent = '--';
  }

  // Hardware Buzzer Card
  const buzzerStatus = document.getElementById('dash-buzzer-status');
  const buzzerWrap = document.getElementById('dash-buzzer-badge-wrap');
  const buzzerPing = document.getElementById('dash-buzzer-ping');
  const buzzerDesc = document.getElementById('dash-buzzer-desc');

  const isBuzzerActive = c.buzzer.state === 'ACTIVE';
  if (buzzerStatus) {
    buzzerStatus.textContent = isBuzzerActive ? 'BUZZER ACTIVE' : 'BUZZER OFF';
  }
  if (buzzerWrap) {
    buzzerWrap.className = isBuzzerActive
      ? 'flex items-center gap-1.5 px-space-xs py-0.5 bg-primary text-surface rounded'
      : 'flex items-center gap-1.5 px-space-xs py-0.5 border border-brand-lavender text-secondary rounded';
  }
  if (buzzerPing) {
    buzzerPing.className = isBuzzerActive
      ? 'w-2 h-2 rounded-full bg-brand-lavender animate-ping'
      : 'w-2 h-2 rounded-full bg-brand-lavender';
  }
  if (buzzerDesc) {
    buzzerDesc.textContent = isBuzzerActive
      ? `State Description: ${c.buzzer.reason || 'Patient Alert Active'} (GPIO25 HIGH)`
      : 'State Description: Standby / Normal Operating Conditions (GPIO25 LOW)';
  }

  // Update timestamps
  const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const timeFields = ['update-temp-time', 'update-hr-time', 'update-orient-time', 'stat-last-update'];
  timeFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = `Updated: ${nowTime}`;
  });

  // Patient Status Pill
  const patientStatusEl = document.getElementById('stat-patient-status');
  if (patientStatusEl) {
    patientStatusEl.textContent = isBuzzerActive ? 'Early Warning' : 'Nominal';
  }

  // Sensors Online Counter
  const sensorsOnlineEl = document.getElementById('stat-sensors-online');
  if (sensorsOnlineEl) {
    let onlineCount = 0;
    if (c.sensors.tmp117 === 'ACTIVE') onlineCount++;
    if (c.sensors.mpu6050 === 'ACTIVE') onlineCount++;
    if (c.sensors.max30102 === 'ACTIVE') onlineCount++;
    if (c.sensors.oled === 'ACTIVE') onlineCount++;
    sensorsOnlineEl.textContent = `${onlineCount}/4 Active`;
  }

  // CRITICAL ALERT LOGIC: Large Alert Banner Visibility
  updateAlertBanner(currentState);
}

function updateAlertBanner(currentState) {
  const alertBanner = document.getElementById('alert-banner');
  if (!alertBanner) return;

  if (currentState.activeAlert) {
    alertBanner.classList.remove('hidden');

    const tempEl = document.getElementById('alert-capsule-temp');
    if (tempEl && typeof currentState.current.temperature === 'number') {
      tempEl.textContent = `${currentState.current.temperature.toFixed(2)} °C`;
    }
    const orientEl = document.getElementById('alert-capsule-orient');
    if (orientEl && typeof currentState.current.orientation === 'number') {
      orientEl.textContent = `${currentState.current.orientation.toFixed(1)} °`;
    }
    const timeEl = document.getElementById('alert-capsule-time');
    if (timeEl) {
      timeEl.textContent = currentState.activeAlert.displayTime || '--:-- --';
    }

    const ackBtn = document.getElementById('btn-alert-ack');
    const ackText = document.getElementById('btn-alert-ack-text');
    if (currentState.activeAlert.acknowledged) {
      if (ackBtn) {
        ackBtn.className = 'border border-primary bg-brand-lavender/20 text-primary px-space-md py-space-xs rounded font-label-md text-label-md tracking-wider uppercase font-semibold flex items-center gap-space-xs';
      }
      if (ackText) ackText.textContent = 'Acknowledged';
    } else {
      if (ackBtn) {
        ackBtn.className = 'bg-primary hover:bg-brand-lavender text-surface hover:text-primary px-space-md py-space-xs rounded font-label-md text-label-md tracking-wider uppercase transition-all flex items-center gap-space-xs font-semibold';
      }
      if (ackText) ackText.textContent = 'Acknowledge Alert';
      playAlertTone();
    }
  } else {
    alertBanner.classList.add('hidden');
  }
}

function renderSparklines() {
  const history = state.history;
  if (history.length === 0) return;

  const tempVals = history.map(h => h.temperature).filter(v => typeof v === 'number');
  const hrVals = history.map(h => h.heartRate).filter(v => typeof v === 'number');
  const orientVals = history.map(h => h.orientation).filter(v => typeof v === 'number');

  TelemetryCharts.renderSparkline(document.getElementById('sparkline-temp'), tempVals, {
    min: 28.0,
    max: 36.0,
    threshold: 34.0,
  });

  TelemetryCharts.renderSparkline(document.getElementById('sparkline-hr'), hrVals, {
    min: 40,
    max: 140,
  });

  TelemetryCharts.renderSparkline(document.getElementById('sparkline-orient'), orientVals, {
    min: -90,
    max: 90,
  });
}

function renderTimeline(alerts) {
  const tbody = document.getElementById('timeline-table-body');
  if (!tbody) return;

  if (!alerts || alerts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-space-md text-center text-secondary">
          No hardware early-warning events recorded yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = alerts.slice(0, 8).map(a => {
    const isAck = a.acknowledged;
    const isBuzzerActive = a.hardwareBuzzer === 'ACTIVE';

    return `
      <tr class="${isBuzzerActive && !isAck ? 'bg-brand-lavender/15 hover:bg-brand-lavender/25' : 'hover:bg-brand-lavender/10'} transition-colors">
        <td class="py-space-sm px-space-sm font-semibold tabular-nums">${a.displayTime}</td>
        <td class="py-space-sm px-space-sm">
          <div class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full ${isBuzzerActive ? 'bg-primary' : 'bg-secondary'}"></span>
            <span class="${isBuzzerActive ? 'font-bold' : ''}">${a.event}</span>
          </div>
        </td>
        <td class="py-space-sm px-space-sm">
          <span class="px-space-xs py-0.5 ${isBuzzerActive ? 'bg-primary text-surface font-bold' : 'border border-brand-lavender text-secondary'} font-label-sm text-label-sm rounded uppercase tracking-wider">
            ${a.hardwareBuzzer}
          </span>
        </td>
        <td class="py-space-sm px-space-sm">
          <span class="font-semibold uppercase tracking-wider font-label-sm text-label-sm ${isAck ? 'text-secondary' : 'text-primary border border-primary px-1.5 py-0.5 rounded bg-surface'}">
            ${isAck ? 'Acknowledged' : 'Unacknowledged'}
          </span>
        </td>
        <td class="py-space-sm px-space-sm text-right">
          ${!isAck ? `
            <button class="btn-table-ack font-label-sm text-label-sm uppercase text-primary hover:underline font-semibold" data-id="${a.id}">
              [ Acknowledge ]
            </button>
          ` : `
            <span class="font-label-sm text-label-sm text-secondary">${a.audit || 'Clinical Staff'}</span>
          `}
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-table-ack').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      acknowledgeAlert(id, 'Clinical Staff 01');
      renderTimeline(state.alertsHistory);
      updateAlertBanner(state);
    });
  });
}

// --------------------------------------------------------------------------
// Actions & Handlers
// --------------------------------------------------------------------------
function initDashboardActions(serialManager) {
  // Header Connect Serial Button
  const btnHeaderSerial = document.getElementById('btn-header-serial');
  if (btnHeaderSerial) {
    btnHeaderSerial.addEventListener('click', async () => {
      if (serialManager.isConnected) {
        await serialManager.disconnect();
      } else {
        try {
          await serialManager.connect(state.connection.baudRate);
        } catch (err) {
          if (err.name !== 'NotFoundError') {
            alert(`Serial Connection Error: ${err.message}`);
          }
        }
      }
    });
  }

  // Acknowledge Alert Banner Button
  const btnAlertAck = document.getElementById('btn-alert-ack');
  if (btnAlertAck) {
    btnAlertAck.addEventListener('click', () => {
      acknowledgeAlert(state.activeAlert ? state.activeAlert.id : null, 'Clinical Staff 01');
      updateAlertBanner(state);
      renderTimeline(state.alertsHistory);
    });
  }

  // Silence Audio Alert
  const btnAlertSilence = document.getElementById('btn-alert-silence');
  if (btnAlertSilence) {
    btnAlertSilence.addEventListener('click', () => {
      isAudioMuted = !isAudioMuted;
      btnAlertSilence.textContent = isAudioMuted ? 'Unmute Browser Audio' : 'Mute Browser Audio';
      alert('Browser alert audio state updated.\n\nNote: The physical ESP32 GPIO25 buzzer is hardware-controlled by the microcontroller firmware and will continue sounding until conditions drop below threshold (34.0°C / 90°).');
    });
  }

  // Mute Buzzer in Hardware Card
  const btnBuzzerMute = document.getElementById('btn-buzzer-mute');
  if (btnBuzzerMute) {
    btnBuzzerMute.addEventListener('click', () => {
      isAudioMuted = true;
      alert('Browser acoustic notifications muted.\n(Hardware GPIO25 remains under firmware control).');
    });
  }

  // Test Pulse Tone
  const btnBuzzerTest = document.getElementById('btn-buzzer-test');
  if (btnBuzzerTest) {
    btnBuzzerTest.addEventListener('click', () => {
      playAlertTone();
    });
  }

  // Export Event Log from timeline
  const btnExportTimeline = document.getElementById('btn-export-timeline-log');
  if (btnExportTimeline) {
    btnExportTimeline.addEventListener('click', () => {
      ReportsEngine.exportToCSV(state.history, 'complete');
    });
  }
}

// --------------------------------------------------------------------------
// History View
// --------------------------------------------------------------------------
let currentHistoryMetric = 'temperature';
let currentHistoryWindow = 'all';

function initHistoryView() {
  document.querySelectorAll('.hist-metric-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hist-metric-btn').forEach(b => {
        b.className = 'hist-metric-btn px-3 py-1 rounded font-label-sm text-label-sm uppercase font-semibold border border-brand-lavender text-primary hover:bg-brand-lavender/10';
      });
      btn.className = 'hist-metric-btn px-3 py-1 rounded font-label-sm text-label-sm uppercase font-semibold bg-primary text-surface';
      currentHistoryMetric = btn.dataset.metric;
      renderHistoryView();
    });
  });

  document.querySelectorAll('.hist-time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hist-time-btn').forEach(b => {
        b.className = 'hist-time-btn px-2.5 py-1 rounded font-label-sm text-label-sm uppercase border border-brand-lavender text-primary hover:bg-brand-lavender/10';
      });
      btn.className = 'hist-time-btn px-2.5 py-1 rounded font-label-sm text-label-sm uppercase bg-primary text-surface';
      currentHistoryWindow = btn.dataset.window;
      renderHistoryView();
    });
  });
}

function renderHistoryView() {
  const filtered = getFilteredHistory(currentHistoryWindow);
  const container = document.getElementById('history-chart-container');
  const countEl = document.getElementById('hist-total-count');
  if (countEl) countEl.textContent = `${filtered.length} Stored Records`;

  const meta = {
    temperature: { label: 'TMP117 Temperature', unit: '°C', setpoint: 34.0 },
    heartRate: { label: 'MAX30102 Heart Rate', unit: 'BPM', setpoint: null },
    orientation: { label: 'MPU6050 Orientation Angle', unit: '°', setpoint: 90.0 },
  };

  const currentMeta = meta[currentHistoryMetric] || meta.temperature;
  TelemetryCharts.renderExpandedChart(
    container,
    filtered,
    currentHistoryMetric,
    currentMeta.label,
    currentMeta.unit,
    currentMeta.setpoint
  );

  // Render Table
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-space-md text-center text-secondary">No records found for selected window.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.slice().reverse().slice(0, 100).map(r => `
    <tr class="hover:bg-brand-lavender/10 transition-colors">
      <td class="py-space-xs px-space-sm font-mono">${r.displayTime}</td>
      <td class="py-space-xs px-space-sm font-semibold">${r.temperature !== null ? r.temperature.toFixed(2) + ' °C' : '--'}</td>
      <td class="py-space-xs px-space-sm">${r.heartRate !== null ? r.heartRate + ' BPM' : 'DISCONNECTED'}</td>
      <td class="py-space-xs px-space-sm font-mono">${r.orientation !== null ? r.orientation.toFixed(1) + ' °' : '--'}</td>
      <td class="py-space-xs px-space-sm">${r.mpu6050Connected ? 'ACTIVE' : 'STANDBY'}</td>
      <td class="py-space-xs px-space-sm">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${r.buzzerState === 'ACTIVE' ? 'bg-primary text-surface' : 'border border-brand-lavender text-secondary'}">
          ${r.buzzerState || 'OFF'}
        </span>
      </td>
    </tr>
  `).join('');
}

// --------------------------------------------------------------------------
// Reports View
// --------------------------------------------------------------------------
function initReportsView() {
  const btnExport = document.getElementById('btn-report-export-csv');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const type = document.getElementById('report-select-type').value;
      const windowType = document.getElementById('report-select-window').value;
      const records = getFilteredHistory(windowType);
      ReportsEngine.exportToCSV(records, type);
    });
  }

  const btnPrint = document.getElementById('btn-report-print');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  document.getElementById('report-select-type')?.addEventListener('change', renderReportsView);
  document.getElementById('report-select-window')?.addEventListener('change', renderReportsView);
}

function renderReportsView() {
  const windowType = document.getElementById('report-select-window')?.value || 'all';
  const records = getFilteredHistory(windowType);
  const summary = ReportsEngine.generateSummary(records, state.alertsHistory);

  document.getElementById('rep-stat-readings').textContent = summary.readingCount;
  document.getElementById('rep-stat-temp-range').textContent = `${summary.temp.min} / ${summary.temp.max} °C`;
  document.getElementById('rep-stat-temp-avg').textContent = `${summary.temp.avg} °C`;
  document.getElementById('rep-stat-hr-avg').textContent = summary.hr.avg ? `${summary.hr.avg} BPM` : 'N/A';
  document.getElementById('rep-stat-orient-range').textContent = `${summary.orient.min}° / ${summary.orient.max}°`;
  document.getElementById('rep-stat-alerts').textContent = summary.buzzerActiveCount;

  // Preview table
  const tbody = document.getElementById('report-table-body');
  if (!tbody) return;

  tbody.innerHTML = records.slice(-50).reverse().map(r => `
    <tr class="hover:bg-brand-lavender/10 transition-colors font-body-sm text-body-sm">
      <td class="py-space-xs px-space-sm font-mono">${r.displayTime}</td>
      <td class="py-space-xs px-space-sm font-semibold">${r.temperature !== null ? r.temperature.toFixed(2) + ' °C' : '--'}</td>
      <td class="py-space-xs px-space-sm">${r.heartRate !== null ? r.heartRate + ' BPM' : 'DISCONNECTED'}</td>
      <td class="py-space-xs px-space-sm font-mono">${r.orientation !== null ? r.orientation.toFixed(1) + ' °' : '--'}</td>
      <td class="py-space-xs px-space-sm">${r.mpu6050Connected ? 'ACTIVE' : 'STANDBY'}</td>
      <td class="py-space-xs px-space-sm font-bold ${r.buzzerState === 'ACTIVE' ? 'text-primary' : 'text-secondary'}">
        ${r.buzzerState || 'OFF'}
      </td>
    </tr>
  `).join('');
}

// --------------------------------------------------------------------------
// Alerts View
// --------------------------------------------------------------------------
let currentAlertFilter = 'all';

function initAlertsView() {
  document.querySelectorAll('.alert-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.alert-filter-btn').forEach(b => {
        b.className = 'alert-filter-btn px-3 py-1 rounded font-label-sm text-label-sm uppercase border border-brand-lavender text-primary hover:bg-brand-lavender/10 font-semibold';
      });
      btn.className = 'alert-filter-btn px-3 py-1 rounded font-label-sm text-label-sm uppercase bg-primary text-surface font-semibold';
      currentAlertFilter = btn.dataset.filter;
      renderAlertsTable();
    });
  });
}

function renderAlertsTable() {
  const tbody = document.getElementById('alerts-page-table-body');
  if (!tbody) return;

  let alerts = state.alertsHistory;
  if (currentAlertFilter === 'unacknowledged') {
    alerts = alerts.filter(a => !a.acknowledged);
  } else if (currentAlertFilter === 'acknowledged') {
    alerts = alerts.filter(a => a.acknowledged);
  }

  if (alerts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-space-md text-center text-secondary">No early warning alerts matching filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = alerts.map(a => `
    <tr class="hover:bg-brand-lavender/10 transition-colors font-body-sm text-body-sm">
      <td class="py-space-sm px-space-sm font-mono font-semibold">${a.displayTime}</td>
      <td class="py-space-sm px-space-sm font-semibold">${a.event}</td>
      <td class="py-space-sm px-space-sm">
        <span class="px-2 py-0.5 rounded font-label-sm text-label-sm uppercase font-bold ${a.hardwareBuzzer === 'ACTIVE' ? 'bg-primary text-surface' : 'border border-brand-lavender text-secondary'}">
          ${a.hardwareBuzzer}
        </span>
      </td>
      <td class="py-space-sm px-space-sm font-mono">${a.temperature ? a.temperature.toFixed(2) + ' °C' : '34.0+ °C'}</td>
      <td class="py-space-sm px-space-sm">
        <span class="font-semibold font-label-sm text-label-sm uppercase ${a.acknowledged ? 'text-secondary' : 'text-primary border border-primary px-1.5 py-0.5 rounded'}">
          ${a.acknowledged ? 'Acknowledged (' + (a.audit || 'Staff') + ')' : 'Pending Review'}
        </span>
      </td>
      <td class="py-space-sm px-space-sm text-right">
        ${!a.acknowledged ? `
          <button class="btn-page-ack bg-primary text-surface hover:bg-brand-lavender hover:text-primary px-3 py-1 rounded font-label-sm text-label-sm uppercase font-semibold" data-id="${a.id}">
            Acknowledge
          </button>
        ` : `
          <span class="text-secondary font-label-sm text-label-sm uppercase">Verified</span>
        `}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-page-ack').forEach(btn => {
    btn.addEventListener('click', () => {
      acknowledgeAlert(btn.dataset.id, 'Clinical Staff 01');
      renderAlertsTable();
      renderTimeline(state.alertsHistory);
      updateAlertBanner(state);
    });
  });
}

// --------------------------------------------------------------------------
// Settings View & Simulation
// --------------------------------------------------------------------------
function initSettingsView(serialManager) {
  // Settings Connect/Disconnect Buttons
  document.getElementById('btn-settings-connect')?.addEventListener('click', async () => {
    try {
      await serialManager.connect(115200);
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        alert(`Serial Error: ${err.message}`);
      }
    }
  });

  document.getElementById('btn-settings-disconnect')?.addEventListener('click', async () => {
    await serialManager.disconnect();
  });

  // Simulation Toggles
  const simEnable = document.getElementById('sim-toggle-enable');
  const simAlert = document.getElementById('sim-toggle-alert');
  const simOrient = document.getElementById('sim-toggle-orient');
  const simHr = document.getElementById('sim-toggle-hr');
  const simLabel = document.getElementById('sim-status-label');

  if (simEnable) {
    simEnable.addEventListener('change', () => {
      if (simEnable.checked) {
        serialManager.startSimulation(115200);
        if (simLabel) simLabel.textContent = 'Simulator: Streaming (2000ms)';
      } else {
        serialManager.stopSimulation();
        serialManager.disconnect();
        if (simLabel) simLabel.textContent = 'Simulator: Inactive';
      }
    });
  }

  if (simAlert) {
    simAlert.addEventListener('change', () => {
      serialManager.setSimTempAlert(simAlert.checked);
    });
  }

  if (simOrient) {
    simOrient.addEventListener('change', () => {
      serialManager.setSimOrientationAlert(simOrient.checked);
    });
  }

  if (simHr) {
    simHr.addEventListener('change', () => {
      serialManager.setSimHeartRate(simHr.checked);
    });
  }

  // Clear Storage
  document.getElementById('btn-clear-history')?.addEventListener('click', () => {
    if (confirm('Clear all stored patient telemetry history and local records?')) {
      clearHistory();
      renderSparklines();
      renderTimeline([]);
      renderHistoryView();
      renderReportsView();
    }
  });

  // Clear Terminal
  document.getElementById('btn-clear-terminal')?.addEventListener('click', () => {
    const term = document.getElementById('raw-terminal');
    if (term) term.innerHTML = '<div class="text-secondary/70">[Terminal cleared.]</div>';
  });
}

function appendTerminalLine(line, isError = false) {
  const term = document.getElementById('raw-terminal');
  if (!term) return;

  const div = document.createElement('div');
  div.className = isError ? 'text-red-700 font-bold' : 'text-primary';
  div.textContent = line;
  term.appendChild(div);

  // Keep terminal within 300 lines
  if (term.childNodes.length > 300) {
    term.removeChild(term.firstChild);
  }
  term.scrollTop = term.scrollHeight;
}

// --------------------------------------------------------------------------
// Sensor Details Modal
// --------------------------------------------------------------------------
function initModals() {
  const modal = document.getElementById('sensor-modal');
  const btnClose = document.getElementById('btn-close-modal');
  const btnDone = document.getElementById('btn-modal-done');

  function closeModal() {
    modal.classList.add('hidden');
  }

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnDone) btnDone.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Attach click listener to all sensor cards
  document.querySelectorAll('.sensor-card, .open-modal-btn').forEach(el => {
    el.addEventListener('click', () => {
      const sensorKey = el.dataset.sensor;
      openSensorModal(sensorKey);
    });
  });

  // Alert banner view details button
  document.getElementById('btn-alert-details')?.addEventListener('click', () => {
    openSensorModal('buzzer');
  });
}

function openSensorModal(sensorKey) {
  const modal = document.getElementById('sensor-modal');
  if (!modal) return;

  const titleEl = document.getElementById('modal-title');
  const valCurr = document.getElementById('modal-val-curr');
  const valAvg = document.getElementById('modal-val-avg');
  const valMin = document.getElementById('modal-val-min');
  const valMax = document.getElementById('modal-val-max');
  const specText = document.getElementById('modal-spec-text');
  const chartBox = document.getElementById('modal-chart-box');
  const tableBody = document.getElementById('modal-recent-table');

  const history = state.history;
  const current = state.current;

  let metricKey = 'temperature';
  let unit = '°C';
  let setpoint = null;

  if (sensorKey === 'temperature') {
    if (titleEl) titleEl.textContent = 'TMP117 Temperature Telemetry';
    const stats = calculateStats('temperature', history);
    if (valCurr) valCurr.textContent = current.temperature !== null ? `${current.temperature.toFixed(2)} °C` : '--';
    if (valAvg) valAvg.textContent = `${stats.avg} °C`;
    if (valMin) valMin.textContent = `${stats.min} °C`;
    if (valMax) valMax.textContent = `${stats.max} °C`;
    metricKey = 'temperature';
    unit = '°C';
    setpoint = 34.0;
    if (specText) {
      specText.innerHTML = `
        <p><strong>Hardware Interface:</strong> I2C (Address 0x48 / 0x49) • SDA D4 / SCL D5</p>
        <p><strong>Clinical Precision:</strong> ±0.1°C Accuracy (ASTM E1112 / ISO 80601)</p>
        <p><strong>Early Warning Threshold:</strong> &gt; 34.0 °C (Hardware Buzzer Trigger)</p>
      `;
    }
  } else if (sensorKey === 'heartrate') {
    if (titleEl) titleEl.textContent = 'MAX30102 Photoplethysmography (PPG)';
    const stats = calculateStats('heartRate', history);
    if (valCurr) valCurr.textContent = current.heartRate !== null ? `${current.heartRate} BPM` : 'DISCONNECTED';
    if (valAvg) valAvg.textContent = stats.avg ? `${stats.avg} BPM` : 'N/A';
    if (valMin) valMin.textContent = stats.min ? `${stats.min} BPM` : 'N/A';
    if (valMax) valMax.textContent = stats.max ? `${stats.max} BPM` : 'N/A';
    metricKey = 'heartRate';
    unit = 'BPM';
    setpoint = null;
    if (specText) {
      specText.innerHTML = `
        <p><strong>Hardware Interface:</strong> I2C (Address 0x57) • Optical Red/IR LED Sensor</p>
        <p><strong>Status:</strong> ${current.max30102Connected ? 'Connected & Streaming' : 'Physically Unconnected / Standby'}</p>
        <p><strong>Nominal Clinical Range:</strong> 60 – 100 BPM Resting Heart Rate</p>
      `;
    }
  } else if (sensorKey === 'orientation') {
    if (titleEl) titleEl.textContent = 'MPU6050 Patient Posture & Orientation';
    const stats = calculateStats('orientation', history);
    if (valCurr) valCurr.textContent = current.orientation !== null ? `${current.orientation.toFixed(1)} °` : '--';
    if (valAvg) valAvg.textContent = `${stats.avg} °`;
    if (valMin) valMin.textContent = `${stats.min} °`;
    if (valMax) valMax.textContent = `${stats.max} °`;
    metricKey = 'orientation';
    unit = '°';
    setpoint = 90.0;
    if (specText) {
      specText.innerHTML = `
        <p><strong>Hardware Interface:</strong> I2C (Address 0x68) • 6-Axis Motion Tracking</p>
        <p><strong>Posture Angle:</strong> Range ±180° Pitch / Roll Vector</p>
        <p><strong>Bed-Exit / Fall Trigger:</strong> |Angle| &gt; 90.0° triggers early-warning alert</p>
      `;
    }
  } else if (sensorKey === 'motion') {
    if (titleEl) titleEl.textContent = 'MPU6050 6-Axis Inertial Measurement';
    if (valCurr) valCurr.textContent = current.accel.z !== null ? `${current.accel.z.toFixed(2)} g` : '--';
    if (valAvg) valAvg.textContent = '±2g Scale';
    if (valMin) valMin.textContent = current.accel.x !== null ? `X: ${current.accel.x.toFixed(2)}` : '--';
    if (valMax) valMax.textContent = current.accel.y !== null ? `Y: ${current.accel.y.toFixed(2)}` : '--';
    metricKey = 'orientation';
    unit = '°';
    setpoint = null;
    if (specText) {
      specText.innerHTML = `
        <p><strong>Accelerometer:</strong> 3-Axis Digital Accelerometer (±2g / ±4g / ±8g / ±16g)</p>
        <p><strong>Gyroscope:</strong> 3-Axis Digital Gyroscope (±250 to ±2000 °/sec)</p>
        <p><strong>Sampling Rate:</strong> 100Hz Internal DMP / 2000ms Serial Stream</p>
      `;
    }
  } else if (sensorKey === 'buzzer') {
    if (titleEl) titleEl.textContent = 'Hardware Buzzer & Early Warning System';
    if (valCurr) valCurr.textContent = current.buzzer.state;
    if (valAvg) valAvg.textContent = 'GPIO 25';
    if (valMin) valMin.textContent = current.buzzer.reason || 'Nominal';
    if (valMax) valMax.textContent = state.activeAlert ? 'ACTIVE' : 'IDLE';
    metricKey = 'temperature';
    unit = '°C';
    setpoint = 34.0;
    if (specText) {
      specText.innerHTML = `
        <p><strong>Hardware Pin:</strong> ESP32 BUZZER_PIN = GPIO 25 (Active HIGH)</p>
        <p><strong>Firmware Logic:</strong> if (temperature &gt; 34 || abs(orientation) &gt; 90) digitalWrite(BUZZER_PIN, HIGH);</p>
        <p><strong>Early Warning Notice:</strong> System acts as an early-warning monitor for abnormal vitals.</p>
      `;
    }
  }

  // Render chart inside modal
  TelemetryCharts.renderExpandedChart(chartBox, history.slice(-20), metricKey, titleEl.textContent, unit, setpoint);

  // Render recent 10 table
  if (tableBody) {
    tableBody.innerHTML = history.slice(-10).reverse().map(h => `
      <tr>
        <td class="p-1.5 font-mono">${h.displayTime}</td>
        <td class="p-1.5 font-semibold">${h[metricKey] !== null && h[metricKey] !== undefined ? h[metricKey] + ' ' + unit : '--'}</td>
        <td class="p-1.5">${h.buzzerState}</td>
        <td class="p-1.5 font-semibold ${h.buzzerState === 'ACTIVE' ? 'text-primary' : 'text-secondary'}">
          ${h.buzzerState === 'ACTIVE' ? 'ALERT ACTIVE' : 'NOMINAL'}
        </td>
      </tr>
    `).join('');
  }

  modal.classList.remove('hidden');
}

// --------------------------------------------------------------------------
// UI State Updates
// --------------------------------------------------------------------------
function updateConnectionUI(isConnected, info = {}) {
  const btnHeader = document.getElementById('btn-header-serial');
  const btnHeaderText = document.getElementById('btn-header-serial-text');
  const dashConn = document.getElementById('dash-conn-status');
  const sideConn = document.getElementById('sidebar-conn-text');
  const sideMode = document.getElementById('sidebar-mode');
  const sidePing = document.getElementById('sidebar-ping');
  const sideDot = document.getElementById('sidebar-dot');

  if (isConnected) {
    if (btnHeader) {
      btnHeader.className = 'border border-primary bg-brand-lavender/20 hover:bg-primary text-primary hover:text-surface px-space-md py-1.5 rounded font-label-md text-label-md tracking-wider uppercase transition-all flex items-center gap-1.5 font-semibold';
    }
    if (btnHeaderText) btnHeaderText.textContent = 'Disconnect';

    const desc = info.isSimulated ? 'ESP32: Simulated (115200 baud)' : 'ESP32: Connected (115200 baud)';
    if (dashConn) dashConn.textContent = desc;
    if (sideConn) sideConn.textContent = 'ESP32 Connected';
    if (sideMode) sideMode.textContent = info.isSimulated ? 'Simulated' : 'USB Serial';
    if (sidePing) sidePing.classList.remove('hidden');
    if (sideDot) sideDot.className = 'relative inline-flex rounded-full h-2 w-2 bg-primary-container';
  } else {
    if (btnHeader) {
      btnHeader.className = 'bg-primary hover:bg-brand-lavender text-surface hover:text-primary px-space-md py-1.5 rounded font-label-md text-label-md tracking-wider uppercase transition-all flex items-center gap-1.5 font-semibold border border-primary';
    }
    if (btnHeaderText) btnHeaderText.textContent = 'Connect ESP32';

    if (dashConn) dashConn.textContent = 'ESP32: Disconnected (115200 baud)';
    if (sideConn) sideConn.textContent = 'ESP32 Offline';
    if (sideMode) sideMode.textContent = 'Standby';
    if (sidePing) sidePing.classList.add('hidden');
    if (sideDot) sideDot.className = 'relative inline-flex rounded-full h-2 w-2 bg-secondary/50';
  }
}

function updateStatusBadge(status) {
  const badge = document.getElementById('header-status-text');
  if (!badge) return;
  if (status === 'connecting') {
    badge.textContent = 'Connecting...';
  } else if (status === 'connected') {
    badge.textContent = 'System Operational';
  } else {
    badge.textContent = 'System Standby';
  }
}

function updateLiveClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const headerClock = document.getElementById('header-clock');
  if (headerClock) headerClock.textContent = `${timeStr} (Live)`;

  const dashClock = document.getElementById('telemetry-live-clock');
  if (dashClock) dashClock.textContent = `${timeStr} (Live)`;
}

function handleStateUpdate(event, payload, currentState) {
  renderDashboard(currentState);

  if (event === 'reading_recorded') {
    renderSparklines();
  } else if (event === 'alert_triggered' || event === 'alert_acknowledged' || event === 'alert_cleared') {
    renderTimeline(currentState.alertsHistory);
  }
}
