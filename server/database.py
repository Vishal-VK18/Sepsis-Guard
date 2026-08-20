import os
import json
import time
import math
from collections import deque
import threading

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
DATA_FILE = os.path.join(DATA_DIR, 'sensor_history.json')

_lock = threading.Lock()
# Rolling in-memory history cache: device_id -> deque of readings (max 100)
_history = {}
_nodes = {}

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

def _load_persisted_data():
    global _nodes, _history
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                _nodes = data.get('nodes', {})
                raw_history = data.get('history', {})
                for dev_id, readings in raw_history.items():
                    _history[dev_id] = deque(readings, maxlen=100)
        except Exception as e:
            print(f"[Database] Warning: Could not load {DATA_FILE}: {e}")

def _persist_data():
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            serializable_hist = {k: list(v) for k, v in _history.items()}
            json.dump({
                'nodes': _nodes,
                'history': serializable_hist,
                'last_saved': time.strftime("%Y-%m-%d %H:%M:%S")
            }, f, indent=2)
    except Exception as e:
        print(f"[Database] Warning: Could not save {DATA_FILE}: {e}")

# Initial load
_load_persisted_data()

def save_sensor_reading(device_id: str, record: dict) -> dict:
    """
    Saves real sensor readings received from ESP32 into memory and updates node state.
    Calculates derived metrics (magnitude, motion status) strictly from real telemetry.
    """
    with _lock:
        now_ts = time.time()
        time_str = time.strftime("%H:%M:%S")

        # Extract & sanitize values
        temp = float(record.get('temperature', 0.0))
        ax = float(record.get('accel_x', 0.0))
        ay = float(record.get('accel_y', 0.0))
        az = float(record.get('accel_z', 0.0))
        gx = float(record.get('gyro_x', 0.0))
        gy = float(record.get('gyro_y', 0.0))
        gz = float(record.get('gyro_z', 0.0))

        # Sensor health flags based on real sensor feedback
        tmp_ok = bool(record.get('tmp117_ok', True if temp > 0 else False))
        mpu_ok = bool(record.get('mpu6050_ok', True if (ax != 0 or ay != 0 or az != 0) else False))

        # Calculate Acceleration Magnitude: sqrt(x^2 + y^2 + z^2)
        magnitude = math.sqrt(ax * ax + ay * ay + az * az)

        # Experimental Motion / Fall Detection Logic
        # Normal 1g is ~9.81 m/s^2.
        # Fall/Impact detection heuristic:
        # - Magnitude > 22 m/s^2 or sudden spike -> Possible Fall Event
        # - Magnitude > 14 m/s^2 or < 4 m/s^2 -> High Activity / Free-fall
        # - Otherwise -> Normal
        if magnitude >= 22.0:
            motion_status = "POSSIBLE FALL EVENT"
            motion_severity = "danger"
        elif magnitude >= 14.0 or magnitude <= 4.0:
            motion_status = "HIGH ACTIVITY"
            motion_severity = "warning"
        else:
            motion_status = "NORMAL"
            motion_severity = "ok"

        reading = {
            "device_id": device_id,
            "temperature": round(temp, 2),
            "accel_x": round(ax, 2),
            "accel_y": round(ay, 2),
            "accel_z": round(az, 2),
            "gyro_x": round(gx, 2),
            "gyro_y": round(gy, 2),
            "gyro_z": round(gz, 2),
            "magnitude": round(magnitude, 2),
            "motion_status": motion_status,
            "motion_severity": motion_severity,
            "tmp117_ok": tmp_ok,
            "mpu6050_ok": mpu_ok,
            "timestamp": record.get('timestamp', int(now_ts * 1000)),
            "time_str": time_str,
            "server_epoch": now_ts,
            "status": "CONNECTED"
        }

        # Initialize history deque for device if needed
        if device_id not in _history:
            _history[device_id] = deque(maxlen=100)
        
        _history[device_id].append(reading)

        # Update latest node summary
        _nodes[device_id] = {
            "device_id": device_id,
            "name": f"Sensor Node ({device_id})",
            "last_reading": reading,
            "last_seen_epoch": now_ts,
            "status": "CONNECTED",
            "tmp117_status": "ONLINE" if tmp_ok else "OFFLINE",
            "mpu6050_status": "ONLINE" if mpu_ok else "OFFLINE",
            "sepsis_risk": "NOT AVAILABLE",
            "sepsis_reason": "Additional vital signs required (HR, SpO₂). Future MAX30102 integration ready.",
            "last_updated": time_str
        }

        _persist_data()
        return reading

def get_node(device_id: str) -> dict:
    with _lock:
        return _nodes.get(device_id)

def get_all_nodes() -> dict:
    with _lock:
        return dict(_nodes)

def get_node_history(device_id: str, limit: int = 60) -> list:
    with _lock:
        if device_id in _history:
            readings = list(_history[device_id])
            return readings[-limit:]
        return []

def mark_node_disconnected(device_id: str):
    with _lock:
        if device_id in _nodes:
            _nodes[device_id]["status"] = "DISCONNECTED"
            _nodes[device_id]["tmp117_status"] = "UNKNOWN"
            _nodes[device_id]["mpu6050_status"] = "UNKNOWN"
            if "last_reading" in _nodes[device_id]:
                _nodes[device_id]["last_reading"]["status"] = "DISCONNECTED"
