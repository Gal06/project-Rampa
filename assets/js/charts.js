// Project Rampa — Chart.js grafi

const CHARTS = (() => {
  let detailChartInstance = null;

  function destroyDetailChart() {
    if (detailChartInstance) {
      detailChartInstance.destroy();
      detailChartInstance = null;
    }
  }

  // Plugin ki nariše horizontalne pragove direktno na canvas
  // — vedno čez celotno širino, neodvisno od števila podatkovnih točk
  const thresholdLinesPlugin = {
    id: 'thresholdLines',
    afterDraw(chart) {
      const { ctx, chartArea, scales, config } = chart;
      const thresholds = config.options._thresholds;
      if (!thresholds || !scales.y) return;

      const { left, right } = chartArea;
      const yScale = scales.y;

      const lines = [
        { value: thresholds.low,  color: 'rgba(91,155,213,0.6)',  label: `Prenizko  ${thresholds.low} m³/s` },
        { value: thresholds.ok,   color: 'rgba(243,156,18,0.6)',  label: `Visoko  ${thresholds.ok} m³/s` },
        { value: thresholds.high, color: 'rgba(231,76,60,0.6)',   label: `Nevarno  ${thresholds.high} m³/s` },
      ];

      ctx.save();
      for (const line of lines) {
        const y = yScale.getPixelForValue(line.value);
        if (y < chartArea.top || y > chartArea.bottom) continue;

        // Črta
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = line.color;
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();

        // Oznaka na desni strani
        ctx.setLineDash([]);
        ctx.font = '10px sans-serif';
        ctx.fillStyle = line.color;
        ctx.textAlign = 'right';
        ctx.fillText(line.label, right - 4, y - 4);
      }
      ctx.restore();
    },
  };

  // Renderira detail chart v modal
  // options: { history, thresholds, statusColor }
  function renderDetailChart(canvasId, options) {
    destroyDetailChart();

    const { history, thresholds, statusColor } = options;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const labels = history.map((p) => formatLabel(p.date));
    const values = history.map((p) => p.flow);

    const maxY = Math.max(...values.filter((v) => v != null), thresholds.high * 1.5, 1);

    const ctx = canvas.getContext('2d');
    detailChartInstance = new Chart(ctx, {
      type: 'line',
      plugins: [thresholdLinesPlugin],
      data: {
        labels,
        datasets: [
          {
            label: 'Pretok (m³/s)',
            data: values,
            borderColor: statusColor,
            backgroundColor: hexToRgba(statusColor, 0.1),
            borderWidth: 2.5,
            pointRadius: 3,
            pointBackgroundColor: statusColor,
            fill: true,
            tension: 0.3,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        _thresholds: thresholds,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: '#1a2f4a',
            borderColor: '#2a4a6a',
            borderWidth: 1,
            titleColor: '#ffffff',
            bodyColor: '#b0c4de',
            callbacks: {
              label: (ctx) => {
                if (ctx.parsed.y === null) return null;
                return ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} m³/s`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#b0c4de', font: { size: 11 }, maxTicksLimit: 8 },
            grid: { color: 'rgba(42,74,106,0.4)' },
          },
          y: {
            min: 0,
            suggestedMax: maxY,
            ticks: { color: '#b0c4de', font: { size: 11 }, callback: (v) => `${v} m³/s` },
            grid: { color: 'rgba(42,74,106,0.4)' },
          },
        },
      },
    });
  }

  function formatLabel(dateStr) {
    const parts = dateStr.split('-');
    return `${parseInt(parts[2])}. ${parseInt(parts[1])}.`;
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  return { renderDetailChart, destroyDetailChart };
})();
