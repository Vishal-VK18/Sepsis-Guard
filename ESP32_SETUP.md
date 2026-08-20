# 📡 SepsisGuard — ESP32-C3 Hardware & Sensor Setup Guide

This guide provides step-by-step instructions to connect a **Seeed Studio XIAO ESP32-C3** microcontroller with **TMP117** (Clinical Skin Temperature) and **MPU6050** (6-Axis IMU) sensors to the **SepsisGuard** real-time clinical dashboard over local Wi-Fi.

SepsisGuard operates in **pure Hardware Mode** — all vital readings and motion metrics displayed on the dashboard originate directly from physical sensors.

---

## 🛠️ 1. Required Hardware

| Component | Description | Function |
| :--- | :--- | :--- |
| **Seeed Studio XIAO ESP32-C3** | Ultra-compact RISC-V Wi-Fi/BLE MCU | Telemetry processing & Wi-Fi transmission |
| **TMP117 Sensor Module** | High-precision clinical digital temperature sensor | ±0.1°C accurate body/skin temperature |
| **MPU6050 / GY-521 Module** | 3-axis accelerometer + 3-axis gyroscope | Linear acceleration & fall/motion detection |
| **Breadboard & Jumper Wires** | Prototyping connections | Shared I²C bus wiring |
| **USB Type-C Cable** | Data cable | Programming & power supply |

---

## 🔌 2. Wiring & Pinout Table

Both the **TMP117** and **MPU6050** sensors communicate over a shared **I²C bus**. Connect all pins as follows:

| XIAO ESP32-C3 Pin | TMP117 Pin | MPU6050 (GY-521) Pin | Description |
| :--- | :--- | :--- | :--- |
| **3V3** | **VCC** | **VCC** | 3.3V Power Supply |
| **GND** | **GND** | **GND** | Common Ground |
| **D4 (GPIO 6)** | **SDA** | **SDA** | I²C Serial Data |
| **D5 (GPIO 7)** | **SCL** | **SCL** | I²C Serial Clock |

> [!NOTE]
> - Ensure **3.3V (3V3)** is used to power the sensors.
> - The I²C addresses are `0x48` or `0x49` for TMP117, and `0x68` or `0x69` for MPU6050, allowing them to peacefully coexist on the same two I²C wires (`D4` and `D5`).

---

## 💻 3. Arduino IDE Setup

### Step 3.1: Install ESP32 Board Package
1. Open **Arduino IDE** (v2.0+ recommended).
2. Go to **File → Preferences** (or `Ctrl + ,`).
3. In **Additional Boards Manager URLs**, paste:
   ```text
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Open **Tools → Board → Boards Manager...**
5. Search for `esp32` (by Espressif Systems) and click **Install**.
6. Select your board: **Tools → Board → ESP32 Arduino → XIAO_ESP32C3** (or `Seeed Studio XIAO ESP32-C3`).

### Step 3.2: Install Required Libraries
Open **Tools → Manage Libraries...** (or `Ctrl + Shift + I`) and search/install:
1. **`Adafruit TMP117`** (by Adafruit) — Click *Install All* to include dependencies.
2. **`Adafruit MPU6050`** (by Adafruit) — Click *Install All* to include dependencies.
3. **`Adafruit Unified Sensor`** (by Adafruit).

---

## 🌐 4. Local Network & Server IP Configuration

The ESP32 and the computer running SepsisGuard must be connected to the **SAME Wi-Fi network**.

### Step 4.1: Find Your Computer's Local IP Address

#### On Windows (PowerShell / Command Prompt):
```powershell
ipconfig
```
Look for **Wireless LAN adapter Wi-Fi** → **IPv4 Address**.
*Example: `192.168.1.10` or `10.252.74.249`*

#### On macOS / Linux:
```bash
ifconfig | grep "inet "
# or
ip a
```

> [!IMPORTANT]
> Do NOT use `127.0.0.1` or `localhost` in the ESP32 code. The ESP32 is an independent device on the network and must point to your computer's actual local IPv4 address (e.g. `192.168.1.10`).

---

## ⚙️ 5. Configure Firmware

Open [`firmware/esp32_sepsisguard.ino`](file:///d:/SepsisGuard/firmware/esp32_sepsisguard.ino) in Arduino IDE.

Update the configuration variables at the top:

```cpp
// ============================================================================
// ⚙️ NETWORK & DEVICE CONFIGURATION
// ============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_NAME";        // Enter your 2.4GHz Wi-Fi name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";    // Enter your Wi-Fi password
const char* SERVER_IP     = "192.168.1.10";          // Enter your computer's IPv4 address from Step 4
const int   SERVER_PORT   = 5000;                    // Flask server port (default: 5000)
const char* DEVICE_ID     = "sepsisguard-node-01";   // Device identifier
```

---

## 🚀 6. Start the SepsisGuard Server

### Step 6.1: Run Backend
Open a terminal in the project root directory and run:
```powershell
py server/app.py
```
*The server will start on `http://0.0.0.0:5000`.*

### Step 6.2: Open Dashboard
- **Web Browser:** Open [`http://localhost:5000`](http://localhost:5000)
- **Desktop Electron Client (Optional):**
  ```powershell
  npm start
  ```

---

## 📤 7. Flash Firmware & Verify Serial Telemetry

1. Connect the Seeed Studio XIAO ESP32-C3 to your computer via USB-C.
2. In Arduino IDE, select the correct Port (**Tools → Port → COMx**).
3. Click **Upload** (`Ctrl + U`).
4. Open the **Serial Monitor** (**Tools → Serial Monitor**, set baud rate to **115200**).

You should see output similar to:
```text
==========================================
🏥 SepsisGuard Node: Starting Initialization
==========================================
Detecting TMP117 Temperature Sensor... ✅ TMP117 ONLINE
Detecting MPU6050 IMU Sensor... ✅ MPU6050 ONLINE
Connecting to Wi-Fi SSID: MyHomeWiFi
.....
✅ Wi-Fi Connected!
📡 Node IP Address: 192.168.1.25
🎯 Target SepsisGuard Backend: http://192.168.1.10:5000
==========================================
 Node Ready. Starting Real-Time Telemetry 
==========================================
--------------------------------------------------
[TMP117]  Temperature: 32.20 °C
[MPU6050] Accel (m/s²): X=-0.23, Y=-0.89, Z=8.03
[MPU6050] Gyro (rad/s): X=-0.00, Y=0.01, Z=-0.04
📤 Telemetry Sent -> HTTP 200
```

---

## 🧪 8. How to Test Communication Manually

You can test the backend sensor receiver API from PowerShell or `curl`:

### PowerShell Test Command:
```powershell
$payload = @{
    device_id   = "sepsisguard-node-01"
    temperature = 32.20
    accel_x     = -0.23
    accel_y     = -0.89
    accel_z     = 8.03
    gyro_x      = -0.00
    gyro_y      = 0.01
    gyro_z      = -0.04
    tmp117_ok   = $true
    mpu6050_ok  = $true
    timestamp   = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/sensor-data" -Method Post -Body $payload -ContentType "application/json"
```

### curl Test Command:
```bash
curl -X POST http://localhost:5000/api/sensor-data \
  -H "Content-Type: application/json" \
  -d '{"device_id":"sepsisguard-node-01","temperature":32.20,"accel_x":-0.23,"accel_y":-0.89,"accel_z":8.03,"gyro_x":-0.00,"gyro_y":0.01,"gyro_z":-0.04,"tmp117_ok":true,"mpu6050_ok":true,"timestamp":1700000000}'
```

---

## 🖥️ 9. Verifying Real Data on the Dashboard

1. Open [`http://localhost:5000`](http://localhost:5000) in your browser.
2. Initially, the dashboard shows `🔴 WAITING FOR HARDWARE` with `-- °C` until the first packet arrives.
3. When the ESP32 sends telemetry:
   - **Connection Status**: Switches immediately to **`🟢 CONNECTED`**.
   - **Sensors**: Display **`TMP117: ● ONLINE`** and **`MPU6050: ● ONLINE`**.
   - **Skin Temperature**: Displays real temperature in **`°C`** (e.g. `32.20 °C`).
   - **Real-Time Temperature Trend Chart**: Dynamic line graph plotting incoming readings.
   - **Linear Acceleration & Gyroscope**: Real-time $X, Y, Z$ breakdown + magnitude $\sqrt{X^2+Y^2+Z^2}$.
   - **Motion Status**: Real-time evaluation (`NORMAL`, `HIGH ACTIVITY`, `POSSIBLE FALL EVENT`).
   - **Sepsis Risk Assessment**: Displays `NOT AVAILABLE` (*"Additional vital signs required"*).
4. If the ESP32 is powered off or disconnected for >10 seconds:
   - **Connection Status**: Automatically switches to **`🔴 DISCONNECTED`**.
   - **Sensors**: Show **`TMP117: ● UNKNOWN`** and **`MPU6050: ● UNKNOWN`**.
   - **Values**: Retain the last known real values with `Updated: X seconds ago`. No fake numbers are generated.
5. When the ESP32 resumes sending data:
   - Status automatically switches back to **`🟢 CONNECTED`** and resumes plotting live values.

---

## 🔧 10. Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **`❌ TMP117 NOT FOUND`** | Loose wiring or wrong I²C pins | Check wiring: `D4 (GPIO6) → SDA`, `D5 (GPIO7) → SCL`. Ensure 3V3 power is solid. |
| **`❌ MPU6050 NOT FOUND`** | AD0 pin floating or wiring issue | Ensure AD0 is connected to GND (address `0x68`) or VCC (`0x69`). |
| **`❌ Wi-Fi Connection Failed`** | 5GHz Wi-Fi or wrong password | ESP32-C3 only supports **2.4GHz Wi-Fi networks**. Verify `WIFI_SSID` and `WIFI_PASSWORD`. |
| **`HTTP POST Failed`** | Wrong IP or Windows Firewall | Verify `SERVER_IP` matches your computer's `ipconfig` IPv4 address. Allow Python through Windows Firewall on port `5000`. |
| **Dashboard says `DISCONNECTED`** | No packets received in >10 seconds | Check Serial Monitor to ensure ESP32 is transmitting `HTTP 200`. |

---

## ⚠️ Medical Disclaimer
> **SepsisGuard Prototype Notice:** This system is an academic and engineering prototype designed for vital-sign and motion telemetry. It is **not** a clinically validated diagnostic device. Full clinical sepsis risk calculations (qSOFA / MEWS) require heart rate, blood oxygen saturation (SpO₂), and respiratory parameters, which will be integrated in future phases with the MAX30102 sensor.
