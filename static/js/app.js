const socket = io();

// Parse initial patient records passed from server on load
let patients = JSON.parse(document.body.dataset.initialPatients || '{}');
let isAdmin = document.body.dataset.isAdmin === 'true';

document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();
  render(); // Immediately render patient records on launch
});

socket.on('vitals_update', (data) => {
  patients[data.patient_id] = data;
  render();
});

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

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function render() {
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