/*
 * ============================================================================
 * 🏥 SepsisGuard — Real-Time IoT Sensor Node Firmware
 * ============================================================================
 * Target Board: Seeed Studio XIAO ESP32-C3
 * Sensors:
 *   - TMP117 (High-Precision Clinical Temperature Sensor)
 *   - MPU6050 / GY-521 (6-Axis Accelerometer & Gyroscope for Motion/Fall Detection)
 *
 * Wiring (Shared I2C Bus):
 *   XIAO ESP32-C3 3V3  --> TMP117 VCC & MPU6050 VCC
 *   XIAO ESP32-C3 GND  --> TMP117 GND & MPU6050 GND
 *   XIAO D4 (GPIO 6)   --> TMP117 SDA & MPU6050 SDA
 *   XIAO D5 (GPIO 7)   --> TMP117 SCL & MPU6050 SCL
 *
 * Libraries Required (Install via Arduino IDE Library Manager):
 *   1. "Adafruit TMP117" by Adafruit
 *   2. "Adafruit MPU6050" by Adafruit
 *   3. "Adafruit Unified Sensor" by Adafruit
 * ============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_TMP117.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

// ============================================================================
// ⚙️ NETWORK & DEVICE CONFIGURATION (Modify these for your local network)
// ============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_NAME";        // Replace with your Wi-Fi SSID
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";    // Replace with your Wi-Fi Password
const char* SERVER_IP     = "YOUR_SERVER_IP";        // Local IP of computer running SepsisGuard (e.g. "192.168.1.100")
const int   SERVER_PORT   = 5000;                    // Flask server port (default: 5000)
const char* DEVICE_ID     = "sepsisguard-node-01";   // Unique identifier for this hardware node

// Sampling & Transmission Rate (in milliseconds)
const unsigned long SEND_INTERVAL_MS = 1000; // 1 second interval (1 Hz)

// ============================================================================
// 📌 PIN DEFINITIONS FOR SEEED STUDIO XIAO ESP32-C3
// ============================================================================
#define I2C_SDA_PIN 6  // D4 / GPIO 6
#define I2C_SCL_PIN 7  // D5 / GPIO 7

// ============================================================================
// 🩺 SENSOR INSTANCES & STATE
// ============================================================================
Adafruit_TMP117  tmp117;
Adafruit_MPU6050 mpu;

bool tmp117_connected = false;
bool mpu6050_connected = false;
unsigned long lastSendTime = 0;
unsigned long lastWifiCheckTime = 0;

// Function declarations
void connectToWiFi();
void initSensors();
void sendSensorData();

void setup() {
  Serial.begin(115200);
  delay(1500); // Allow time for Serial Monitor to connect

  Serial.println("\n==========================================");
  Serial.println("🏥 SepsisGuard Node: Starting Initialization");
  Serial.println("==========================================");

  // Initialize I2C with explicit XIAO ESP32-C3 pins
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(400000); // 400kHz Fast I2C

  // Initialize Sensors
  initSensors();

  // Connect to Local Wi-Fi Network
  connectToWiFi();

  Serial.println("==========================================");
  Serial.println(" Node Ready. Starting Real-Time Telemetry ");
  Serial.println("==========================================\n");
}

void loop() {
  unsigned long currentMillis = millis();

  // Check Wi-Fi connection periodically (every 5 seconds)
  if (currentMillis - lastWifiCheckTime >= 5000) {
    lastWifiCheckTime = currentMillis;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("⚠️ Wi-Fi connection lost. Attempting reconnect...");
      connectToWiFi();
    }
  }

  // Sample and transmit sensor telemetry at defined interval
  if (currentMillis - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = currentMillis;
    sendSensorData();
  }

  yield(); // Allow background ESP32 tasks to execute
}

// ============================================================================
// 📡 WI-FI CONNECTION MANAGEMENT
// ============================================================================
void connectToWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("Connecting to Wi-Fi SSID: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttemptTime = millis();
  // Wait up to 10 seconds for connection
  while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 10000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Wi-Fi Connected!");
    Serial.print("📡 Node IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("🎯 Target SepsisGuard Backend: http://");
    Serial.print(SERVER_IP);
    Serial.print(":");
    Serial.println(SERVER_PORT);
  } else {
    Serial.println("\n❌ Wi-Fi Connection Failed. Will retry in background...");
  }
}

// ============================================================================
// 🩺 SENSOR INITIALIZATION
// ============================================================================
void initSensors() {
  // 1. Initialize TMP117 Temperature Sensor
  Serial.print("Detecting TMP117 Temperature Sensor... ");
  if (tmp117.begin()) {
    tmp117_connected = true;
    Serial.println("✅ TMP117 ONLINE");
  } else {
    tmp117_connected = false;
    Serial.println("❌ TMP117 NOT FOUND. Check I2C wiring (D4=SDA, D5=SCL).");
  }

  // 2. Initialize MPU6050 Accelerometer / Gyroscope
  Serial.print("Detecting MPU6050 IMU Sensor... ");
  if (mpu.begin()) {
    mpu6050_connected = true;
    Serial.println("✅ MPU6050 ONLINE");

    // Configure MPU6050 sensor ranges
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  } else {
    mpu6050_connected = false;
    Serial.println("❌ MPU6050 NOT FOUND. Check I2C wiring (D4=SDA, D5=SCL).");
  }
}

// ============================================================================
// 📤 SENSOR SAMPLING & HTTP TRANSMISSION
// ============================================================================
void sendSensorData() {
  // Read TMP117 Temperature
  float temperature = 0.0;
  if (tmp117_connected) {
    sensors_event_t temp_event;
    if (tmp117.getEvent(&temp_event)) {
      temperature = temp_event.temperature;
    } else {
      tmp117_connected = false; // Flag error if reading failed
    }
  } else {
    // Attempt re-initialization if previously disconnected
    if (tmp117.begin()) tmp117_connected = true;
  }

  // Read MPU6050 Accelerometer & Gyroscope
  float accel_x = 0.0, accel_y = 0.0, accel_z = 0.0;
  float gyro_x = 0.0, gyro_y = 0.0, gyro_z = 0.0;
  if (mpu6050_connected) {
    sensors_event_t a, g, temp_mpu;
    if (mpu.getEvent(&a, &g, &temp_mpu)) {
      accel_x = a.acceleration.x; // m/s^2
      accel_y = a.acceleration.y; // m/s^2
      accel_z = a.acceleration.z; // m/s^2
      gyro_x  = g.gyro.x;         // rad/s
      gyro_y  = g.gyro.y;         // rad/s
      gyro_z  = g.gyro.z;         // rad/s
    } else {
      mpu6050_connected = false;
    }
  } else {
    // Attempt re-initialization if previously disconnected
    if (mpu.begin()) mpu6050_connected = true;
  }

  // Print readable values to Serial Monitor for verification
  Serial.println("--------------------------------------------------");
  if (tmp117_connected) {
    Serial.printf("[TMP117]  Temperature: %.2f °C\n", temperature);
  } else {
    Serial.println("[TMP117]  Sensor Offline");
  }

  if (mpu6050_connected) {
    Serial.printf("[MPU6050] Accel (m/s²): X=%.2f, Y=%.2f, Z=%.2f\n", accel_x, accel_y, accel_z);
    Serial.printf("[MPU6050] Gyro (rad/s): X=%.2f, Y=%.2f, Z=%.2f\n", gyro_x, gyro_y, gyro_z);
  } else {
    Serial.println("[MPU6050] Sensor Offline");
  }

  // Only attempt HTTP transmission if Wi-Fi is active
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ HTTP Post skipped: No Wi-Fi connection.");
    return;
  }

  // Construct JSON Payload
  // Buffer size: 320 bytes is plenty for this JSON payload
  char payload[320];
  snprintf(payload, sizeof(payload),
    "{"
      "\"device_id\":\"%s\","
      "\"temperature\":%.2f,"
      "\"accel_x\":%.2f,"
      "\"accel_y\":%.2f,"
      "\"accel_z\":%.2f,"
      "\"gyro_x\":%.2f,"
      "\"gyro_y\":%.2f,"
      "\"gyro_z\":%.2f,"
      "\"tmp117_ok\":%s,"
      "\"mpu6050_ok\":%s,"
      "\"timestamp\":%lu"
    "}",
    DEVICE_ID,
    temperature,
    accel_x,
    accel_y,
    accel_z,
    gyro_x,
    gyro_y,
    gyro_z,
    tmp117_connected ? "true" : "false",
    mpu6050_connected ? "true" : "false",
    millis()
  );

  // Send HTTP POST request to SepsisGuard backend
  HTTPClient http;
  String serverPath = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/sensor-data";

  http.begin(serverPath);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(2500); // 2.5s network timeout

  int httpResponseCode = http.POST(payload);

  if (httpResponseCode > 0) {
    Serial.printf("📤 Telemetry Sent -> HTTP %d\n", httpResponseCode);
  } else {
    Serial.printf("❌ HTTP POST Failed. Error: %s\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}
