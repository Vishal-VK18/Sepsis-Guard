/**
 * SepsisGuard IoT Patient Early Warning Monitoring System
 * Reports Engine & CSV Export
 */

import { calculateStats } from './state.js';

export class ReportsEngine {
  /**
   * Generate an RFC 4180 compliant CSV file from stored history records
   */
  static exportToCSV(records, reportType = 'complete') {
    if (!records || records.length === 0) {
      alert('No recorded patient telemetry data available to export.');
      return;
    }

    let headers = [];
    let rows = [];

    if (reportType === 'temperature') {
      headers = ['Timestamp', 'Date_Time', 'TMP117_Temperature_C', 'Buzzer_State', 'Alert_Active'];
      rows = records.map(r => [
        r.timestamp,
        r.displayTime,
        r.temperature !== null ? r.temperature.toFixed(2) : '',
        r.buzzerState,
        r.alertActive ? 'TRUE' : 'FALSE'
      ]);
    } else if (reportType === 'heartrate') {
      headers = ['Timestamp', 'Date_Time', 'MAX30102_HeartRate_BPM', 'Sensor_Status'];
      rows = records.map(r => [
        r.timestamp,
        r.displayTime,
        r.heartRate !== null ? r.heartRate : 'DISCONNECTED',
        r.max30102Connected ? 'CONNECTED' : 'DISCONNECTED'
      ]);
    } else if (reportType === 'orientation') {
      headers = ['Timestamp', 'Date_Time', 'MPU6050_Orientation_Deg', 'Buzzer_State', 'Alert_Active'];
      rows = records.map(r => [
        r.timestamp,
        r.displayTime,
        r.orientation !== null ? r.orientation.toFixed(2) : '',
        r.buzzerState,
        r.alertActive ? 'TRUE' : 'FALSE'
      ]);
    } else {
      // Complete Telemetry Log
      headers = [
        'Timestamp',
        'Date_Time',
        'TMP117_Temperature_C',
        'MAX30102_HeartRate_BPM',
        'MPU6050_Orientation_Deg',
        'Hardware_Buzzer_State',
        'Patient_Alert_State'
      ];
      rows = records.map(r => [
        r.timestamp,
        r.displayTime,
        r.temperature !== null ? r.temperature.toFixed(2) : '',
        r.heartRate !== null ? r.heartRate : 'DISCONNECTED',
        r.orientation !== null ? r.orientation.toFixed(2) : '',
        r.buzzerState,
        r.alertActive ? 'ACTIVE' : 'INACTIVE'
      ]);
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    // Trigger browser file download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `sepsisguard_${reportType}_export_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Calculate high-level summary cards for the Reports view
   */
  static generateSummary(records, alerts) {
    const tempStats = calculateStats('temperature', records);
    const hrStats = calculateStats('heartRate', records);
    const orientStats = calculateStats('orientation', records);
    const buzzerActiveCount = records.filter(r => r.buzzerState === 'ACTIVE').length;

    return {
      temp: tempStats,
      hr: hrStats,
      orient: orientStats,
      readingCount: records.length,
      alertCount: alerts ? alerts.length : 0,
      buzzerActiveCount: buzzerActiveCount,
    };
  }
}
