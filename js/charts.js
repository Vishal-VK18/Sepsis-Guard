/**
 * SepsisGuard IoT Patient Early Warning Monitoring System
 * Technical SVG & Sparkline Patient Telemetry Charts
 * Color Palette: Primary (#474C80), Background (#F8F7E2), Lavender Tint (#9DA2CD)
 */

export class TelemetryCharts {
  /**
   * Render or update a responsive mini sparkline in SVG
   */
  static renderSparkline(svgElement, values, options = {}) {
    if (!svgElement) return;

    if (!values || values.length === 0) {
      svgElement.innerHTML = `
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="JetBrains Mono" font-size="11" fill="#7D81A8">
          AWAITING STREAM
        </text>
      `;
      return;
    }

    const width = options.width || 280;
    const height = options.height || 64;
    const threshold = options.threshold !== undefined ? options.threshold : null;
    const minVal = options.min !== undefined ? options.min : Math.min(...values);
    const maxVal = options.max !== undefined ? options.max : Math.max(...values);
    const range = (maxVal - minVal) === 0 ? 1 : (maxVal - minVal);

    svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svgElement.setAttribute('preserveAspectRatio', 'none');

    // Generate polyline points
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const points = values.map((val, idx) => {
      const x = (idx * step).toFixed(1);
      const normalized = (val - minVal) / range;
      // Invert Y coordinate since SVG 0 is top
      const y = (height - 8 - (normalized * (height - 16))).toFixed(1);
      return `${x},${y}`;
    }).join(' ');

    let thresholdLineHtml = '';
    if (threshold !== null && threshold >= minVal && threshold <= maxVal) {
      const normThresh = (threshold - minVal) / range;
      const threshY = (height - 8 - (normThresh * (height - 16))).toFixed(1);
      thresholdLineHtml = `<line x1="0" y1="${threshY}" x2="${width}" y2="${threshY}" stroke="#474C80" stroke-width="1.2" stroke-dasharray="3 3" />`;
    }

    const lastPoint = values.length > 0 ? points.split(' ').pop().split(',') : [width, height / 2];

    svgElement.innerHTML = `
      <!-- Subgrid lines in Lavender (#9DA2CD) -->
      <line x1="0" y1="${(height * 0.25).toFixed(0)}" x2="${width}" y2="${(height * 0.25).toFixed(0)}" stroke="#9DA2CD" stroke-dasharray="2 2" stroke-opacity="0.4" />
      <line x1="0" y1="${(height * 0.75).toFixed(0)}" x2="${width}" y2="${(height * 0.75).toFixed(0)}" stroke="#9DA2CD" stroke-dasharray="2 2" stroke-opacity="0.4" />
      ${thresholdLineHtml}
      <!-- Telemetry Signal Trace in Primary (#474C80) -->
      <polyline points="${points}" fill="none" stroke="#474C80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Active Live Marker Point -->
      <circle cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="3.5" fill="#474C80" />
    `;
  }

  /**
   * Render an expanded technical telemetry chart for History and Sensor Detail views
   */
  static renderExpandedChart(container, dataPoints, metricKey, label, unit, setpoint = null) {
    if (!container) return;

    if (!dataPoints || dataPoints.length === 0) {
      container.innerHTML = `
        <div class="h-64 flex flex-col items-center justify-center border border-[#9DA2CD]/40 rounded bg-[#9DA2CD]/10 text-[#5B6096]">
          <span class="material-symbols-outlined text-[32px] text-[#9DA2CD]">query_stats</span>
          <span class="font-label-sm text-label-sm uppercase tracking-wider mt-2">Awaiting patient telemetry frames...</span>
        </div>
      `;
      return;
    }

    const values = dataPoints.map(d => d[metricKey]).filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) {
      container.innerHTML = `
        <div class="h-64 flex flex-col items-center justify-center border border-[#9DA2CD]/40 rounded bg-[#9DA2CD]/10 text-[#5B6096]">
          <span class="material-symbols-outlined text-[32px] text-[#9DA2CD]">sensors_off</span>
          <span class="font-label-sm text-label-sm uppercase tracking-wider mt-2">Sensor stream unavailable (${label})</span>
        </div>
      `;
      return;
    }

    let min = Math.min(...values);
    let max = Math.max(...values);
    if (setpoint !== null) {
      min = Math.min(min, setpoint - 1);
      max = Math.max(max, setpoint + 1);
    }
    // Add margin
    const padding = (max - min) * 0.1 || 1;
    min = min - padding;
    max = max + padding;
    const range = max - min;

    const width = 800;
    const height = 240;
    const leftGutter = 60;
    const bottomGutter = 30;
    const chartW = width - leftGutter - 20;
    const chartH = height - bottomGutter - 20;

    const step = values.length > 1 ? chartW / (values.length - 1) : chartW;
    const points = values.map((val, i) => {
      const x = (leftGutter + i * step).toFixed(1);
      const y = (20 + chartH - ((val - min) / range) * chartH).toFixed(1);
      return `${x},${y}`;
    }).join(' ');

    // Horizontal grid ticks
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    const gridLines = ticks.map(t => {
      const y = 20 + chartH - t * chartH;
      const val = (min + t * range).toFixed(1);
      return `
        <line x1="${leftGutter}" y1="${y}" x2="${width - 20}" y2="${y}" stroke="#9DA2CD" stroke-opacity="0.35" stroke-dasharray="2 2" />
        <text x="${leftGutter - 8}" y="${y + 4}" font-family="JetBrains Mono" font-size="10" fill="#5B6096" text-anchor="end">${val} ${unit}</text>
      `;
    }).join('');

    let setpointSvg = '';
    if (setpoint !== null) {
      const sy = 20 + chartH - ((setpoint - min) / range) * chartH;
      setpointSvg = `
        <line x1="${leftGutter}" y1="${sy}" x2="${width - 20}" y2="${sy}" stroke="#474C80" stroke-width="1.5" stroke-dasharray="4 3" />
        <text x="${width - 24}" y="${sy - 4}" font-family="JetBrains Mono" font-size="10" font-weight="600" fill="#474C80" text-anchor="end">SETPOINT: ${setpoint} ${unit}</text>
      `;
    }

    // Time markers
    const firstTime = dataPoints[0].displayTime || 'Start';
    const lastTime = dataPoints[dataPoints.length - 1].displayTime || 'Now';

    container.innerHTML = `
      <div class="relative w-full overflow-hidden bg-[#F8F7E2] border border-[#9DA2CD] rounded p-2">
        <div class="flex justify-between items-center text-[#5B6096] font-label-sm text-label-sm px-2 pb-1 border-b border-[#9DA2CD]/40">
          <span class="uppercase tracking-wider font-semibold text-[#474C80]">${label} Stream Telemetry</span>
          <span>Sampling: Real-time • ${values.length} Records</span>
        </div>
        <svg class="w-full h-56" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          ${gridLines}
          ${setpointSvg}
          <polyline points="${points}" fill="none" stroke="#474C80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="${points.split(' ').pop().split(',')[0]}" cy="${points.split(' ').pop().split(',')[1]}" r="4" fill="#474C80" />
          <!-- X-Axis Labels -->
          <text x="${leftGutter}" y="${height - 8}" font-family="JetBrains Mono" font-size="10" fill="#5B6096">${firstTime}</text>
          <text x="${width - 20}" y="${height - 8}" font-family="JetBrains Mono" font-size="10" fill="#5B6096" text-anchor="end">${lastTime} (Latest)</text>
        </svg>
      </div>
    `;
  }
}
