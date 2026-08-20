from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit
import time
import threading
import database

app = Flask(__name__, template_folder='../templates', static_folder='../static')
app.config['SECRET_KEY'] = 'sepsisguard_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Admin Credentials
ADMIN_USERNAME = "Admin"
ADMIN_PASSWORD = "Admin123"

# Memory store with initial default patient records (for ICU/Ward)
patients = {
    "P-101": {
        "patient_id": "P-101",
        "name": "Ramesh Kumar",
        "bed": "Bed 3",
        "vitals": {"hr": 78, "spo2": 98, "temp": 36.8, "rr": 16},
        "qsofa_score": 0,
        "risk_score": 12,
        "last_updated": time.strftime("%H:%M:%S")
    },
    "P-102": {
        "patient_id": "P-102",
        "name": "Anitha Roy",
        "bed": "Bed 7",
        "vitals": {"hr": 88, "spo2": 96, "temp": 37.1, "rr": 18},
        "qsofa_score": 0,
        "risk_score": 22,
        "last_updated": time.strftime("%H:%M:%S")
    }
}

@app.route('/')
def index():
    is_admin = session.get('is_admin', False)
    all_nodes = database.get_all_nodes()
    default_history = database.get_node_history("sepsisguard-node-01", limit=60)
    
    return render_template(
        'index.html',
        is_admin=is_admin,
        initial_patients=patients,
        initial_nodes=all_nodes,
        initial_history=default_history
    )

# Admin Login Endpoint
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')
    
    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        session['is_admin'] = True
        return jsonify({"status": "success", "message": "Logged in successfully"}), 200
    return jsonify({"status": "error", "message": "Invalid username or password"}), 401

# Admin Logout Endpoint
@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('is_admin', None)
    return jsonify({"status": "success"}), 200

# Endpoint to Add New Patient (Admin Only)
@app.route('/api/add_patient', methods=['POST'])
def add_patient():
    if not session.get('is_admin'):
        return jsonify({"status": "error", "message": "Unauthorized"}), 403
        
    data = request.json or {}
    patient_id = data.get('patient_id')
    name = data.get('name')
    bed = data.get('bed')

    if not patient_id or not name or not bed:
        return jsonify({"status": "error", "message": "All fields are required"}), 400

    new_patient = {
        "patient_id": patient_id,
        "name": name,
        "bed": bed,
        "vitals": {"hr": 72, "spo2": 98, "temp": 36.6, "rr": 16},
        "qsofa_score": 0,
        "risk_score": 10,
        "last_updated": time.strftime("%H:%M:%S")
    }

    patients[patient_id] = new_patient
    socketio.emit('vitals_update', new_patient)
    return jsonify({"status": "success", "patient": new_patient}), 200

# Endpoint to accept ward sensor vitals
@app.route('/api/vitals', methods=['POST'])
def receive_vitals():
    data = request.json or {}
    patient_id = data.get('patient_id', 'P-101')
    vitals = data.get('vitals', {})
    
    hr = vitals.get('hr', 75)
    spo2 = vitals.get('spo2', 98)
    temp = vitals.get('temp', 37.0)
    
    risk = 10
    if hr > 100 or spo2 < 95 or temp > 38.0:
        risk = 80
    elif hr > 90 or temp > 37.5:
        risk = 45
        
    updated_patient = {
        "patient_id": patient_id,
        "name": patients.get(patient_id, {}).get("name", f"Patient {patient_id}"),
        "bed": patients.get(patient_id, {}).get("bed", "Unassigned"),
        "vitals": vitals,
        "qsofa_score": 2 if risk > 70 else (1 if risk > 35 else 0),
        "risk_score": risk,
        "last_updated": time.strftime("%H:%M:%S")
    }
    
    patients[patient_id] = updated_patient
    socketio.emit('vitals_update', updated_patient)
    return jsonify({"status": "success", "risk_score": risk}), 200

# ============================================================================
# 📡 IOT SENSOR NODE ENDPOINTS (Hardware-Only Telemetry)
# ============================================================================

@app.route('/api/sensor-data', methods=['POST'])
def receive_sensor_data():
    """
    Receives real telemetry from Seeed Studio XIAO ESP32-C3.
    Expected JSON payload:
    {
      "device_id": "sepsisguard-node-01",
      "temperature": 32.20,
      "accel_x": -0.23,
      "accel_y": -0.89,
      "accel_z": 8.03,
      "gyro_x": -0.00,
      "gyro_y": 0.01,
      "gyro_z": -0.04,
      "tmp117_ok": true,
      "mpu6050_ok": true,
      "timestamp": 123456789
    }
    """
    if not request.is_json:
        return jsonify({"status": "error", "message": "Payload must be valid JSON"}), 400
        
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"status": "error", "message": "Invalid JSON structure"}), 400

    device_id = str(data.get('device_id', 'sepsisguard-node-01')).strip()
    if not device_id:
        device_id = "sepsisguard-node-01"

    try:
        # Validate and sanitize numeric types safely
        sanitized_record = {
            "device_id": device_id,
            "temperature": float(data.get('temperature', 0.0)),
            "accel_x": float(data.get('accel_x', 0.0)),
            "accel_y": float(data.get('accel_y', 0.0)),
            "accel_z": float(data.get('accel_z', 0.0)),
            "gyro_x": float(data.get('gyro_x', 0.0)),
            "gyro_y": float(data.get('gyro_y', 0.0)),
            "gyro_z": float(data.get('gyro_z', 0.0)),
            "tmp117_ok": bool(data.get('tmp117_ok', True)),
            "mpu6050_ok": bool(data.get('mpu6050_ok', True)),
            "timestamp": data.get('timestamp', int(time.time() * 1000))
        }
    except (ValueError, TypeError) as e:
        return jsonify({"status": "error", "message": f"Invalid sensor data types: {str(e)}"}), 400

    # Save real reading to database and compute analytics (magnitude, motion status)
    reading = database.save_sensor_reading(device_id, sanitized_record)
    node_summary = database.get_node(device_id)

    # Broadcast real-time update to all connected dashboard clients via WebSocket
    socketio.emit('sensor_data_update', {
        "node": node_summary,
        "reading": reading
    })

    return jsonify({
        "status": "success",
        "device_id": device_id,
        "magnitude": reading.get("magnitude"),
        "motion_status": reading.get("motion_status")
    }), 200

@app.route('/api/nodes', methods=['GET'])
def list_nodes():
    return jsonify(database.get_all_nodes()), 200

@app.route('/api/nodes/<device_id>/history', methods=['GET'])
def get_node_history(device_id):
    limit = request.args.get('limit', 60, type=int)
    history = database.get_node_history(device_id, limit=limit)
    return jsonify({"device_id": device_id, "history": history}), 200

# ============================================================================
# ⏱️ BACKGROUND INACTIVITY WATCHDOG (Hardware-Only)
# ============================================================================

def watchdog_worker():
    """
    Background worker thread:
    Checks if any active hardware node has timed out (> 10 seconds without data).
    Transitions node status to DISCONNECTED. NEVER generates fake/simulated data.
    """
    while True:
        try:
            now = time.time()
            all_nodes = database.get_all_nodes()

            for dev_id, node_info in all_nodes.items():
                if node_info.get("status") == "CONNECTED":
                    last_seen = node_info.get("last_seen_epoch", 0)
                    if now - last_seen > 10.0:
                        database.mark_node_disconnected(dev_id)
                        updated_node = database.get_node(dev_id)
                        socketio.emit('sensor_node_status', {
                            "device_id": dev_id,
                            "status": "DISCONNECTED",
                            "tmp117_status": "UNKNOWN",
                            "mpu6050_status": "UNKNOWN",
                            "node": updated_node
                        })
        except Exception as e:
            print(f"[Watchdog Worker Error]: {e}")

        time.sleep(1.0)

# Start background watchdog as daemon
watchdog_thread = threading.Thread(target=watchdog_worker, daemon=True)
watchdog_thread.start()

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)