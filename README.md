# 🏥 SepsisGuard — Real-Time Clinical Sepsis Dashboard

**SepsisGuard** is an open-source, real-time clinical decision-support and ward-monitoring system designed for hospital ICUs and general wards. It streams patient physiological vitals (Heart Rate, SpO₂, Temperature, Respiratory Rate) and dynamically calculates risk indicators to enable early detection of sepsis.

---

## ✨ Features

* **🩺 Real-Time Vitals Streaming:** Utilizes WebSocket (`Socket.IO`) connection to instantly push physiological sensor updates to all connected monitoring dashboards without page refreshes.
* **⚡ Early Risk Indicator:** Calculates real-time risk scores and dynamically updates color-coded status badges (`Low Risk`, `Medium Risk`, `Critical Risk`).
* **🚨 Visual Critical Alerts:** Automatically triggers flashing clinical red alert banners and pulsing card highlights when patient vitals cross threshold limits.
* **🔐 Role-Based Access Control (RBAC):**
  * **View-Only Mode:** Accessible by default for general ward nurses, doctors, and monitoring staff to view live patient records safely.
  * **Admin Mode:** Secured with credentials (`Admin` / `Admin123`) to unlock administrative actions like registering new patients into the ward system.
* **🏥 Hospital-Grade UI/UX:** High-contrast light clinical theme built according to healthcare accessibility standards for maximum legibility under hospital lighting.
* **🖥️ Cross-Platform Support:** Can be accessed via standard web browser or launched as a dedicated desktop client using **Electron**.

---

## 🏗️ Tech Stack

* **Frontend:** HTML5, CSS3, JavaScript (ES6+), Socket.IO Client
* **Backend:** Python, Flask, Flask-SocketIO
* **Desktop Application:** Electron.js
* **Data Protocol:** WebSockets & RESTful JSON API

---

## 📂 Project Structure

```text
sepsisguard/
│
├── server/
│   └── app.py              # Flask server, WebSocket routes, & risk calculation
├── static/
│   ├── css/
│   │   └── style.css       # Hospital-themed clinical stylesheet
│   └── js/
│       └── app.js          # Client-side state handling & Socket.IO client
├── templates/
│   └── index.html          # Ward Dashboard interface
├── main.js                 # Electron main process
├── package.json            # Node.js configuration & dependencies
├── requirements.txt        # Python dependencies
├── .gitignore              # Ignored files (node_modules, pycache, etc.)
└── README.md               # Project documentation