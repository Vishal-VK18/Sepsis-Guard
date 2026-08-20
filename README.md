# 🏥 SepsisGuard — Real-Time Clinical & IoT Ward Dashboard

**SepsisGuard** is an open-source, real-time clinical decision-support, ward-monitoring, and IoT telemetry platform designed for hospital ICUs and general wards. It streams patient physiological vitals (Temperature, Heart Rate, SpO₂, Respiratory Rate) and 6-axis motion metrics (Linear Acceleration & Gyroscope) via WebSocket (`Socket.IO`) directly from physical IoT hardware nodes to enable proactive vital monitoring and early risk indicators.

---

## ✨ Key Features

* **📡 Real-Time IoT Hardware Integration:** Connects physical **Seeed Studio XIAO ESP32-C3** nodes streaming clinical temperature (**TMP117**) and 6-axis inertial motion (**MPU6050**) over local Wi-Fi.
* **🔒 Hardware-Only Telemetry:** Operates in pure Hardware Mode. Real sensor readings from physical hardware are the single source of truth—no simulated, fake, or fallback data.
* **📈 Dynamic Temperature Trend Chart:** Live rolling temperature graph (last 60s) rendering real-time physiological trends directly from incoming telemetry.
* **🏃 Experimental Motion & Fall Event Detection:** Calculates 3D acceleration vector magnitude ($\sqrt{X^2+Y^2+Z^2}$) from real MPU6050 data to detect abnormal activity spikes and potential fall impacts.
* **⏱️ Inactivity Watchdog:** Automatically flags sensor nodes as `🔴 DISCONNECTED` when no telemetry packet is received for >10 seconds.
* **🩺 Real-Time Vitals Streaming:** Instant WebSocket (`Socket.IO`) broadcasts for all connected sensor nodes and general ward patient beds.
* **🚨 Visual Clinical Alerts:** Flashing clinical red alert banners and pulsing card highlights when vitals cross threshold limits.
* **🔐 Role-Based Access Control (RBAC):**
  * **View-Only Mode:** Default safe monitoring mode for ward nurses and doctors.
  * **Admin Mode:** Secured with credentials (`Admin` / `Admin123`) to register new patient beds.
* **🏥 Hospital-Grade UI/UX:** High-contrast light clinical theme designed for clinical legibility and accessibility.
* **🖥️ Cross-Platform Support:** Accessible in any modern web browser or as a native desktop application using **Electron**.

---

## 🏗️ Tech Stack

* **Embedded Hardware:** Seeed Studio XIAO ESP32-C3, TMP117 (I²C), MPU6050 (I²C)
* **Frontend:** HTML5, CSS3, JavaScript (ES6+), Socket.IO Client, Chart.js
* **Backend:** Python (Flask, Flask-SocketIO)
* **Desktop Application:** Electron.js
* **Data Protocol:** WebSockets & RESTful JSON API

---

## 📂 Project Structure

```text
sepsisguard/
│
├── firmware/
│   └── esp32_sepsisguard.ino # Arduino IDE sketch for Seeed Studio XIAO ESP32-C3
├── server/
│   ├── app.py                # Flask server, WebSocket routes, IoT endpoints & watchdog
│   ├── database.py           # Real sensor telemetry storage, history & motion analytics
│   └── requirements.txt      # Python dependencies
├── static/
│   ├── css/
│   │   └── style.css         # Clinical hospital stylesheet & IoT node styling
│   └── js/
│       └── app.js            # Client-side state, Socket.IO client & Chart.js graph
├── templates/
│   └── index.html            # Ward & IoT telemetry dashboard interface
├── main.js                   # Electron desktop application main process
├── package.json              # Node.js configuration & dependencies
├── ESP32_SETUP.md            # Hardware wiring, Arduino IDE setup & troubleshooting guide
├── .gitignore                # Ignored files (node_modules, pycache, data, secrets)
└── README.md                 # Project documentation
```

---

## 🚀 Quick Start

### 1. Install Backend Dependencies & Start Server
```powershell
# Install Python requirements
py -m pip install -r server/requirements.txt simple-websocket

# Start SepsisGuard server
py server/app.py
```
Server runs on **`http://localhost:5000`** (and is accessible on your local network at `http://<YOUR_IP>:5000`).

### 2. Launch Dashboard
- **In Web Browser:** Open [`http://localhost:5000`](http://localhost:5000)
- **Desktop Electron App:**
  ```powershell
  npm start
  ```

### 3. Connect ESP32 Hardware
Refer to [**ESP32_SETUP.md**](file:///d:/SepsisGuard/ESP32_SETUP.md) for full hardware wiring diagrams, library installation, and Arduino IDE flashing instructions.

---

## ⚠️ Medical Prototype Notice

SepsisGuard is an engineering research prototype designed for vital-sign and motion telemetry. It is **not** a certified clinical diagnostic medical device. Complete sepsis risk assessment requires additional vital parameters (Heart Rate, SpO₂, Blood Pressure) which will be integrated in future phases with the MAX30102 sensor.