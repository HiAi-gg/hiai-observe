function setupCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  return { ctx, width: rect.width, height: rect.height };
}

export function drawTimeSeriesChart(
  canvas: HTMLCanvasElement,
  data: number[],
  options?: { color?: string; max?: number; fillGradient?: boolean }
) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, width, height } = setup;

  ctx.clearRect(0, 0, width, height);
  if (data.length === 0) return;

  const color = options?.color || "#3b82f6";
  const max = options?.max !== undefined ? options.max : Math.max(1, ...data);
  const min = 0;
  const range = max - min || 1;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const val = data[i];
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  if (options?.fillGradient !== false) {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, `${color}33`);
    grad.addColorStop(1, `${color}00`);
    ctx.fillStyle = grad;

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawBarChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  data: number[],
  options?: { color?: string }
) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, width, height } = setup;

  ctx.clearRect(0, 0, width, height);
  if (data.length === 0) return;

  const color = options?.color || "#3b82f6";
  const max = Math.max(1, ...data);
  const barCount = data.length;
  const gap = 8;
  const totalGapWidth = gap * (barCount - 1);
  const barWidth = (width - totalGapWidth) / barCount;

  for (let i = 0; i < barCount; i++) {
    const val = data[i];
    const barHeight = (val / max) * (height - 20);
    const x = i * (barWidth + gap);
    const y = height - barHeight - 15;

    ctx.fillStyle = color;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
    } else {
      ctx.rect(x, y, barWidth, barHeight);
    }
    ctx.fill();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    const label = labels[i] || "";
    ctx.fillText(label, x + barWidth / 2, height - 2);
  }
}

export function drawDonutChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  data: number[],
  colors?: string[]
) {
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, width, height } = setup;

  ctx.clearRect(0, 0, width, height);
  if (data.length === 0) return;

  const total = data.reduce((acc, v) => acc + v, 0);
  const defaultColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
  const sliceColors = colors || defaultColors;

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 10;
  const innerRadius = radius * 0.6;

  let startAngle = -Math.PI / 2;

  for (let i = 0; i < data.length; i++) {
    const val = data[i];
    const sliceAngle = (val / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;
    const color = sliceColors[i % sliceColors.length] || "#3b82f6";

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fill();

    startAngle = endAngle;
  }
}
