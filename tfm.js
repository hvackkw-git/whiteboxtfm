// tfm.js (ES module)

function $(id) { return document.getElementById(id); }

let kernelChart, qChart;

function readInputs() {
  const R = Number($("R").value);
  const C = Number($("C").value);
  const A = Number($("A").value);

  const dtHours = Number($("dtHours").value);
  const kernelHours = Number($("kernelHours").value);
  const warmupHours = Number($("warmupHours").value);
  const runHours = Number($("runHours").value);

  const To = Number($("To").value);
  const Ti = Number($("Ti").value);

  const seriesTerms = Number($("seriesTerms").value);

  return { R, C, A, dtHours, kernelHours, warmupHours, runHours, To, Ti, seriesTerms };
}

// ---------------------------
// Roblox(Hittle) 방식 커널 생성: TODO (다음 단계에서 여길 채움)
// ---------------------------
function buildKernels_Hittle_TFM({ R, C, dtHours, kernelHours, seriesTerms }) {
  const N = Math.max(1, Math.round(kernelHours / dtHours));

  // TODO: 여기서 Roblox의 ramp→triangular 커널 X[j], Y[j] 생성 로직을 그대로 JS로 옮기면 됨.
  // 지금은 “자리”만 잡기 위해 매우 단순한 더미 커널을 넣음(그래프/파이프라인 확인용).
  // 다음 단계에서 이 더미는 제거하고, Roblox와 동일한 X/Y가 나오게 만들 거야.
  const X = new Array(N).fill(0);
  const Y = new Array(N).fill(0);

  // 더미: 첫 항만 1/R로 맞춰서(대략) 형태만 보이게
  X[0] = 1 / R;
  Y[0] = 1 / R;

  return { X, Y };
}

// ---------------------------
// 컨볼루션 기반 q 계산 (Roblox 코드 구조 그대로 가져갈 자리)
// q = A * ( Σ X * ToHist - Σ Y * TiHist )
// ---------------------------
function runSimulation({ X, Y, A, dtHours, warmupHours, runHours, To, Ti }) {
  const warmN = Math.max(0, Math.round(warmupHours / dtHours));
  const runN = Math.max(1, Math.round(runHours / dtHours));

  const kN = X.length;

  // 히스토리: 최신값이 끝에 오도록 push
  const ToHist = [];
  const TiHist = [];

  // warmup
  for (let i = 0; i < warmN; i++) {
    ToHist.push(To);
    TiHist.push(Ti);
  }

  // run
  const qW = [];
  const cumKwh = [];
  let eKwh = 0;

  for (let t = 0; t < runN; t++) {
    ToHist.push(To);
    TiHist.push(Ti);

    // 컨볼루션 (최근 시점부터 X[0], Y[0]가 곱해지도록)
    let sumXTo = 0;
    let sumYTi = 0;

    for (let j = 0; j < kN; j++) {
      const idx = ToHist.length - 1 - j;
      if (idx < 0) break;
      sumXTo += X[j] * ToHist[idx];
      sumYTi += Y[j] * TiHist[idx];
    }

    const q = A * (sumXTo - sumYTi); // W (부호는 네 Roblox 정의에 맞춰 나중에 정렬)
    qW.push(q);

    // 에너지 적분: W → kWh
    eKwh += (q * dtHours) / 1000.0;
    cumKwh.push(eKwh);
  }

  return { qW, cumKwh };
}

function setupCharts() {
  const kernelCtx = $("kernelChart").getContext("2d");
  const qCtx = $("qChart").getContext("2d");

  kernelChart = new Chart(kernelCtx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "X[j]", data: [], tension: 0.15 },
        { label: "Y[j]", data: [], tension: 0.15 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#e7eaf0" } } },
      scales: {
        x: { ticks: { color: "#a9b1c4" }, grid: { color: "rgba(255,255,255,0.06)" } },
        y: { ticks: { color: "#a9b1c4" }, grid: { color: "rgba(255,255,255,0.06)" } },
      },
    },
  });

  qChart = new Chart(qCtx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "q(t) [W]", data: [], tension: 0.15 },
        { label: "Cum. Energy [kWh]", data: [], tension: 0.15, yAxisID: "y2" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#e7eaf0" } } },
      scales: {
        x: { ticks: { color: "#a9b1c4" }, grid: { color: "rgba(255,255,255,0.06)" } },
        y: { ticks: { color: "#a9b1c4" }, grid: { color: "rgba(255,255,255,0.06)" } },
        y2: {
          position: "right",
          ticks: { color: "#a9b1c4" },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function updateKernelChart(X, Y) {
  const labels = X.map((_, i) => String(i));
  kernelChart.data.labels = labels;
  kernelChart.data.datasets[0].data = X;
  kernelChart.data.datasets[1].data = Y;
  kernelChart.update();
}

function updateQChart(qW, cumKwh) {
  const labels = qW.map((_, i) => String(i));
  qChart.data.labels = labels;
  qChart.data.datasets[0].data = qW;
  qChart.data.datasets[1].data = cumKwh;
  qChart.update();

  const total = cumKwh.length ? cumKwh[cumKwh.length - 1] : 0;
  const peak = qW.length ? Math.max(...qW.map(v => Math.abs(v))) : 0;

  $("totalKwh").textContent = total.toFixed(3);
  $("peakW").textContent = peak.toFixed(1);
}

function main() {
  setupCharts();

  $("runBtn").addEventListener("click", () => {
    const inp = readInputs();

    const { X, Y } = buildKernels_Hittle_TFM(inp);
    updateKernelChart(X, Y);

    const { qW, cumKwh } = runSimulation({ ...inp, X, Y });
    updateQChart(qW, cumKwh);
  });

  // 첫 로드 때 1회 실행
  $("runBtn").click();
}

main();
