const socket = io();

// Parse initial state passed from server on page load
let patients = JSON.parse(document.body.dataset.initialPatients || '{}');
let nodes = JSON.parse(document.body.dataset.initialNodes || '{}');
let initialHistory = JSON.parse(document.body.dataset.initialHistory || '[]');
let isAdmin = document.body.dataset.isAdmin === 'true';

// Global Chart.js instance for real-time temperature telemetry
let tempChart = null;
const MAX_CHART_POINTS = 60;

document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();
  renderNodes();
  renderPatients();
  initTempChart();

  // Periodic elapsed time counter (updates 'Updated: X seconds ago' text only)
  setInterval(updateElapsedTimers, 1000);
});

// ============================================================================
// 📡 SOCKET.IO REAL-TIME EVENT LISTENERS (Hardware-Only)
// ============================================================================

// 1. Patient Vitals Update (Ward Beds)
socket.on('vitals_update', (data) => {
  patients[data.patient_id] = data;
  renderPatients();
});

// 2. Real ESP32 Sensor Telemetry Update
socket.on('sensor_data_update', (payload) => {
  const { node, reading } = payload;
  nodes[node.device_id] = node;
  
  // Update Node UI with real hardware values
  updateNodeCardUI(node, reading);
  
  // Append real temperature reading to chart
  if (reading && reading.temperature !== undefined && reading.temperature !== null) {
    addChartDataPoint(reading.time_str || new Date().toLocaleTimeString(), reading.temperature);
  }
});

// 3. Sensor Node Inactivity Disconnect Event
socket.on('sensor_node_status', (data) => {
  if (nodes[data.device_id]) {
    nodes[data.device_id].status = data.status;
    nodes[data.device_id].tmp117_status = data.tmp117_status || 'UNKNOWN';
    nodes[data.device_id].mpu6050_status = data.mpu6050_status || 'UNKNOWN';
    if (data.node) {
      nodes[data.device_id] = data.node;
    }
    const lastReading = nodes[data.device_id].last_reading || {};
    updateNodeCardUI(nodes[data.device_id], lastReading);
  }
});

// ============================================================================
// 🎨 UI RENDERING & DOM UPDATES
// ============================================================================

function updateAuthUI() {
  const authBtn = document.getElementById('auth-btn');
  const addBtn = document.getElementById('add-patient-btn');
  const statusText = document.getElementById('admin-status-text');

  if (isAdmin) {
    authBtn.textContent = 'Logout';
    addBtn.classList.remove('hidden');
    statusText.textContent = 'Logged in as Admin';
  } else {
    authBtn.textContent = 'Admin Login';
    addBtn.classList.add('hidden');
    statusText.textContent = 'View Only Mode';
  }
}

function renderNodes() {
  const container = document.getElementById('node-grid');
  container.innerHTML = '';

  let nodeEntries = Object.values(nodes);

  // If no hardware node has registered yet, render default awaiting hardware card
  if (nodeEntries.length === 0) {
    nodeEntries = [{
      device_id: 'sepsisguard-node-01',
      name: 'Sensor Node (sepsisguard-node-01)',
      status: 'AWAITING_DATA',
      tmp117_status: 'UNKNOWN',
      mpu6050_status: 'UNKNOWN',
      last_reading: null,
      last_seen_epoch: 0,
      last_updated: 'Waiting for ESP32 telemetry...'
    }];
  }

  nodeEntries.forEach(node => {
    const devId = node.device_id;
    const reading = node.last_reading;
    const isConn = node.status === 'CONNECTED';
    const isFall = reading && reading.motion_status === 'POSSIBLE FALL EVENT';

    let cardClass = 'node-card';
    if (!isConn) cardClass += ' disconnected';
    if (isFall) cardClass += ' fall-alert';

    const tempDisplay = (reading && reading.temperature !== undefined && reading.tmp117_ok !== false) 
      ? `${Number(reading.temperature).toFixed(2)}` 
      : '--';

    const magnitudeDisplay = (reading && reading.magnitude !== undefined) 
      ? `${Number(reading.magnitude).toFixed(2)}` 
      : '--';

    const motionStatus = reading ? (reading.motion_status || 'NORMAL') : 'AWAITING DATA';
    let motionPillClass = 'motion-normal';
    if (motionStatus === 'HIGH ACTIVITY') motionPillClass = 'motion-warning';
    if (motionStatus === 'POSSIBLE FALL EVENT') motionPillClass = 'motion-danger';

    const tmpOnline = isConn && (node.tmp117_status === 'ONLINE' || (reading && reading.tmp117_ok));
    const mpuOnline = isConn && (node.mpu6050_status === 'ONLINE' || (reading && reading.mpu6050_ok));

    let connBadgeText = '🔴 WAITING FOR HARDWARE';
    let connBadgeClass = 'conn-disconnected';
    if (isConn) {
      connBadgeText = '🟢 CONNECTED';
      connBadgeClass = 'conn-connected';
    } else if (node.status === 'DISCONNECTED') {
      connBadgeText = '🔴 DISCONNECTED';
      connBadgeClass = 'conn-disconnected';
    }

    container.innerHTML += `
      <div id="node-card-${devId}" class="${cardClass}">
        <!-- Header -->
        <div class="node-header">
          <div class="node-title-group">
            <span class="node-device-id">${devId.toUpperCase()}</span>
            <span class="node-chip">Seeed XIAO ESP32-C3</span>
            <span id="tmp-status-${devId}" class="sensor-chip ${tmpOnline ? 'sensor-online' : 'sensor-offline'}">
              TMP117: ${tmpOnline ? '● ONLINE' : '● ' + (node.tmp117_status || 'UNKNOWN')}
            </span>
            <span id="mpu-status-${devId}" class="sensor-chip ${mpuOnline ? 'sensor-online' : 'sensor-offline'}">
              MPU6050: ${mpuOnline ? '● ONLINE' : '● ' + (node.mpu6050_status || 'UNKNOWN')}
            </span>
          </div>

          <div class="node-status-group">
            <span id="conn-badge-${devId}" class="connection-badge ${connBadgeClass}">
              ${connBadgeText}
            </span>
            <span id="last-update-${devId}" class="last-update-text" data-last-epoch="${node.last_seen_epoch || 0}">
              ${node.last_seen_epoch ? 'Updated: Just now' : (node.last_updated || 'Waiting for ESP32 telemetry...')}
            </span>
          </div>
        </div>

        <!-- Primary Clinical & Motion Metrics Grid -->
        <div class="node-metrics-grid">
          <!-- Metric 1: Skin Temperature -->
          <div class="metric-card">
            <div class="metric-label-row">
              <span class="metric-label">Skin Temperature</span>
              <span style="font-size:16px;">🌡️</span>
            </div>
            <div class="metric-value">
              <span id="node-temp-${devId}">${tempDisplay}</span><span class="metric-unit">°C</span>
            </div>
            <span class="metric-subtext">TMP117 High-Precision Sensor</span>
          </div>

          <!-- Metric 2: Acceleration Magnitude -->
          <div class="metric-card">
            <div class="metric-label-row">
              <span class="metric-label">Accel Magnitude</span>
              <span style="font-size:16px;">📈</span>
            </div>
            <div class="metric-value">
              <span id="node-mag-${devId}">${magnitudeDisplay}</span><span class="metric-unit">m/s²</span>
            </div>
            <span class="metric-subtext">Vector: √(X² + Y² + Z²)</span>
          </div>

          <!-- Metric 3: Motion & Fall Status -->
          <div class="metric-card">
            <div class="metric-label-row">
              <span class="metric-label">Motion Status</span>
              <span style="font-size:16px;">🏃</span>
            </div>
            <div style="margin-top: 4px;">
              <span id="node-motion-${devId}" class="motion-pill ${motionPillClass}">${motionStatus}</span>
            </div>
            <span class="metric-subtext">Experimental motion detection — not medically validated.</span>
          </div>

          <!-- Metric 4: Sepsis Risk Status -->
          <div class="metric-card">
            <div class="metric-label-row">
              <span class="metric-label">Sepsis Risk Assessment</span>
              <span style="font-size:16px;">🛡️</span>
            </div>
            <div style="margin-top: 4px;">
              <span class="sepsis-na-badge">NOT AVAILABLE</span>
            </div>
            <span class="metric-subtext highlight">Additional vital signs required (HR, SpO₂).</span>
          </div>
        </div>

        <!-- Secondary Detailed Panel: 6-Axis Motion & Real-time Temp Chart -->
        <div class="node-details-split">
          <!-- 6-Axis IMU Panel -->
          <div class="imu-panel">
            <div class="panel-title">
              <span>MPU6050 6-Axis Telemetry</span>
              <span style="font-size:11px; color:#64748b;">(m/s² & rad/s)</span>
            </div>

            <!-- Acceleration Axis -->
            <div class="axis-group">
              <span class="axis-group-title">Linear Acceleration (m/s²)</span>
              <div class="axis-row">
                <div class="axis-cell"><span class="axis-tag">ACCEL X</span><span id="ax-${devId}" class="axis-val">${reading && reading.accel_x !== undefined ? reading.accel_x : '--'}</span></div>
                <div class="axis-cell"><span class="axis-tag">ACCEL Y</span><span id="ay-${devId}" class="axis-val">${reading && reading.accel_y !== undefined ? reading.accel_y : '--'}</span></div>
                <div class="axis-cell"><span class="axis-tag">ACCEL Z</span><span id="az-${devId}" class="axis-val">${reading && reading.accel_z !== undefined ? reading.accel_z : '--'}</span></div>
              </div>
            </div>

            <!-- Gyroscope Axis -->
            <div class="axis-group">
              <span class="axis-group-title">Angular Velocity (rad/s)</span>
              <div class="axis-row">
                <div class="axis-cell"><span class="axis-tag">GYRO X</span><span id="gx-${devId}" class="axis-val">${reading && reading.gyro_x !== undefined ? reading.gyro_x : '--'}</span></div>
                <div class="axis-cell"><span class="axis-tag">GYRO Y</span><span id="gy-${devId}" class="axis-val">${reading && reading.gyro_y !== undefined ? reading.gyro_y : '--'}</span></div>
                <div class="axis-cell"><span class="axis-tag">GYRO Z</span><span id="gz-${devId}" class="axis-val">${reading && reading.gyro_z !== undefined ? reading.gyro_z : '--'}</span></div>
              </div>
            </div>
          </div>

          <!-- Real-Time Temperature Trend Chart -->
          <div class="chart-panel">
            <div class="chart-header">
              <span class="panel-title">Real-Time Temperature Trend (°C)</span>
              <span style="font-size:11px; color:#64748b;">Rolling Real Telemetry</span>
            </div>
            <div class="chart-wrapper">
              <canvas id="temp-trend-chart"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;
  });
}

function updateNodeCardUI(node, reading) {
  const devId = node.device_id;
  const card = document.getElementById(`node-card-${devId}`);
  if (!card) {
    renderNodes();
    initTempChart();
    return;
  }

  const isConn = node.status === 'CONNECTED';
  const isFall = reading && reading.motion_status === 'POSSIBLE FALL EVENT';

  // Update card border state
  card.className = 'node-card' + (!isConn ? ' disconnected' : '') + (isFall ? ' fall-alert' : '');

  // Connection badge
  const connBadge = document.getElementById(`conn-badge-${devId}`);
  if (connBadge) {
    if (isConn) {
      connBadge.className = 'connection-badge conn-connected';
      connBadge.textContent = '🟢 CONNECTED';
    } else {
      connBadge.className = 'connection-badge conn-disconnected';
      connBadge.textContent = '🔴 DISCONNECTED';
    }
  }

  // Sensor online tags
  const tmpStatus = document.getElementById(`tmp-status-${devId}`);
  if (tmpStatus) {
    const online = isConn && (node.tmp117_status === 'ONLINE' || (reading && reading.tmp117_ok));
    tmpStatus.className = `sensor-chip ${online ? 'sensor-online' : 'sensor-offline'}`;
    tmpStatus.textContent = `TMP117: ${online ? '● ONLINE' : '● ' + (node.tmp117_status || 'UNKNOWN')}`;
  }

  const mpuStatus = document.getElementById(`mpu-status-${devId}`);
  if (mpuStatus) {
    const online = isConn && (node.mpu6050_status === 'ONLINE' || (reading && reading.mpu6050_ok));
    mpuStatus.className = `sensor-chip ${online ? 'sensor-online' : 'sensor-offline'}`;
    mpuStatus.textContent = `MPU6050: ${online ? '● ONLINE' : '● ' + (node.mpu6050_status || 'UNKNOWN')}`;
  }

  // Last update timestamp attribute
  const lastUpdateEl = document.getElementById(`last-update-${devId}`);
  if (lastUpdateEl) {
    lastUpdateEl.dataset.lastEpoch = node.last_seen_epoch || (Date.now() / 1000);
    lastUpdateEl.textContent = isConn ? 'Updated: Just now' : (node.last_updated ? `Updated: ${node.last_updated}` : 'Waiting for ESP32 telemetry...');
  }

  // Primary Metrics
  const tempEl = document.getElementById(`node-temp-${devId}`);
  if (tempEl && reading && reading.temperature !== undefined) {
    tempEl.textContent = Number(reading.temperature).toFixed(2);
  }

  const magEl = document.getElementById(`node-mag-${devId}`);
  if (magEl && reading && reading.magnitude !== undefined) {
    magEl.textContent = Number(reading.magnitude).toFixed(2);
  }

  const motionEl = document.getElementById(`node-motion-${devId}`);
  if (motionEl && reading && reading.motion_status) {
    motionEl.textContent = reading.motion_status;
    let pillClass = 'motion-normal';
    if (reading.motion_status === 'HIGH ACTIVITY') pillClass = 'motion-warning';
    if (reading.motion_status === 'POSSIBLE FALL EVENT') pillClass = 'motion-danger';
    motionEl.className = `motion-pill ${pillClass}`;
  }

  // 6-Axis values
  const axEl = document.getElementById(`ax-${devId}`);
  const ayEl = document.getElementById(`ay-${devId}`);
  const azEl = document.getElementById(`az-${devId}`);
  const gxEl = document.getElementById(`gx-${devId}`);
  const gyEl = document.getElementById(`gy-${devId}`);
  const gzEl = document.getElementById(`gz-${devId}`);

  if (axEl && reading && reading.accel_x !== undefined) axEl.textContent = Number(reading.accel_x).toFixed(2);
  if (ayEl && reading && reading.accel_y !== undefined) ayEl.textContent = Number(reading.accel_y).toFixed(2);
  if (azEl && reading && reading.accel_z !== undefined) azEl.textContent = Number(reading.accel_z).toFixed(2);
  if (gxEl && reading && reading.gyro_x !== undefined) gxEl.textContent = Number(reading.gyro_x).toFixed(2);
  if (gyEl && reading && reading.gyro_y !== undefined) gyEl.textContent = Number(reading.gyro_y).toFixed(2);
  if (gzEl && reading && reading.gyro_z !== undefined) gzEl.textContent = Number(reading.gyro_z).toFixed(2);
}

function updateElapsedTimers() {
  const nowEpoch = Date.now() / 1000;
  document.querySelectorAll('.last-update-text').forEach(el => {
    const lastEpoch = parseFloat(el.dataset.lastEpoch);
    if (!lastEpoch || isNaN(lastEpoch) || lastEpoch === 0) return;
    const diff = Math.max(0, Math.floor(nowEpoch - lastEpoch));
    if (diff < 3) {
      el.textContent = 'Updated: Just now';
    } else if (diff < 60) {
      el.textContent = `Updated: ${diff}s ago`;
    } else {
      const mins = Math.floor(diff / 60);
      el.textContent = `Updated: ${mins}m ago`;
    }
  });
}

// ============================================================================
// 📈 REAL-TIME TEMPERATURE CHART (Chart.js)
// ============================================================================

function initTempChart() {
  const ctx = document.getElementById('temp-trend-chart');
  if (!ctx) return;

  if (tempChart) {
    tempChart.destroy();
  }

  // Extract initial labels and values from real history if available
  const initialLabels = initialHistory.map(h => h.time_str || '');
  const initialData = initialHistory.map(h => h.temperature || 0);

  tempChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: initialLabels,
      datasets: [{
        label: 'TMP117 Temp (°C)',
        data: initialData,
        borderColor: '#0284c7',
        backgroundColor: 'rgba(2, 132, 199, 0.08)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointRadius: 2.5,
        pointBackgroundColor: '#0284c7',
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `Temp: ${context.parsed.y.toFixed(2)} °C`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            maxTicksLimit: 8
          }
        },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#64748b',
            font: { size: 10 },
            callback: (val) => `${val}°C`
          },
          suggestedMin: 25.0,
          suggestedMax: 40.0
        }
      }
    }
  });
}

function addChartDataPoint(timeStr, tempVal) {
  if (!tempChart) return;

  tempChart.data.labels.push(timeStr);
  tempChart.data.datasets[0].data.push(tempVal);

  // Maintain rolling window of real data points
  if (tempChart.data.labels.length > MAX_CHART_POINTS) {
    tempChart.data.labels.shift();
    tempChart.data.datasets[0].data.shift();
  }

  tempChart.update('none');
}

// ============================================================================
// 🏥 GENERAL WARD PATIENT CARDS & MODALS
// ============================================================================

function renderPatients() {
  const grid = document.getElementById('patient-grid');
  grid.innerHTML = '';
  let criticals = 0;

  Object.values(patients).forEach(p => {
    let cardState = '';
    let badgeState = 'risk-low';

    if (p.risk_score >= 70) {
      cardState = 'critical';
      badgeState = 'risk-hi';
      criticals++;
    } else if (p.risk_score >= 30) {
      cardState = 'warning';
      badgeState = 'risk-med';
    }

    grid.innerHTML += `
      <div class="card ${cardState}">
        <div class="card-header">
          <div>
            <h3>${p.name}</h3>
            <small style="color:#94a3b8">${p.bed} (${p.patient_id})</small>
          </div>
          <span class="risk-tag ${badgeState}">RISK ${p.risk_score}</span>
        </div>
        <div class="vitals">
          <div class="vital-box"><span class="val ${p.vitals.hr > 100 ? 'bad' : 'ok'}">${p.vitals.hr}</span><span class="label">HR (bpm)</span></div>
          <div class="vital-box"><span class="val ${p.vitals.spo2 < 95 ? 'warn' : 'ok'}">${p.vitals.spo2}</span><span class="label">SpO₂ (%)</span></div>
          <div class="vital-box"><span class="val ${p.vitals.temp > 38 ? 'bad' : 'ok'}">${p.vitals.temp}</span><span class="label">Temp (°C)</span></div>
          <div class="vital-box"><span class="val ${p.vitals.rr > 22 ? 'bad' : 'ok'}">${p.vitals.rr}</span><span class="label">RR (b/min)</span></div>
        </div>
        <small style="color:#94a3b8">Updated: ${p.last_updated}</small>
      </div>
    `;
  });

  const banner = document.getElementById('alert-banner');
  if (criticals > 0) {
    banner.textContent = `⚠ ${criticals} Critical Alert(s)`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function toggleAuth() {
  if (isAdmin) {
    fetch('/api/logout', { method: 'POST' }).then(() => {
      isAdmin = false;
      document.body.dataset.isAdmin = 'false';
      updateAuthUI();
    });
  } else {
    openModal('login-modal');
  }
}

async function handleLogin() {
  const u = document.getElementById('login-user').value;
  const p = document.getElementById('login-pass').value;

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p })
  });

  if (res.ok) {
    isAdmin = true;
    document.body.dataset.isAdmin = 'true';
    closeModal('login-modal');
    updateAuthUI();
  } else {
    alert('Invalid Credentials! (User: Admin, Pass: Admin123)');
  }
}

async function handleAddPatient() {
  const pid = document.getElementById('pat-id').value;
  const name = document.getElementById('pat-name').value;
  const bed = document.getElementById('pat-bed').value;

  const res = await fetch('/api/add_patient', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patient_id: pid, name: name, bed: bed })
  });

  if (res.ok) {
    closeModal('patient-modal');
    document.getElementById('pat-id').value = '';
    document.getElementById('pat-name').value = '';
    document.getElementById('pat-bed').value = '';
  } else {
    alert('Failed to register patient. Make sure you are logged in as Admin.');
  }
}

function openModal(id) { 
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden'); 
}

function closeModal(id) { 
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden'); 
}