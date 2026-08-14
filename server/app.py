from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit
import random
import time

app = Flask(__name__, template_folder='../templates', static_folder='../static')
app.config['SECRET_KEY'] = 'sepsisguard_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Admin Credentials
ADMIN_USERNAME = "Admin"
ADMIN_PASSWORD = "Admin123"

# Memory store with initial default patient records
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
    # Pass all active patient records on initial render
    return render_template('index.html', is_admin=is_admin, initial_patients=patients)

# Admin Login Endpoint
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
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
        
    data = request.json
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
    
    # Broadcast new patient card live to all connected clients
    socketio.emit('vitals_update', new_patient)
    return jsonify({"status": "success", "patient": new_patient}), 200

# Endpoint to accept sensor vitals
@app.route('/api/vitals', methods=['POST'])
def receive_vitals():
    data = request.json
    patient_id = data.get('patient_id', 'P-101')
    vitals = data.get('vitals', {})
    
    hr = vitals.get('hr', 75)
    spo2 = vitals.get('spo2', 98)
    temp = vitals.get('temp', 37.0)
    
    risk = 10
    if hr > 100 or spo2 < 95 or temp > 38.0:
        risk = random.randint(75, 90)
    elif hr > 90 or temp > 37.5:
        risk = random.randint(35, 60)
        
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

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)