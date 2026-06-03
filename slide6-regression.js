/**
 * Slide 6 — Multiple Regression Contribution Plot
 *
 * Fits:  Tas = β₀ + β₁·CO₂ + β₂·od550aer
 * Shows predicted warming from CO₂ and cooling from aerosols over time.
 */

let slide6StateData = [];
let slide6States = [];
let slide6Redraw = null;

function initSlide6() {
  d3.csv("state_annual_climate.csv", (d) => ({
    year: +d.year,
    state: d.state,
    co2: +d.co2_ppm,
    od550aer: +d.od550aer,
    tas: +d.tas,
    tas_c: +d.tas_c,
    tas_anomaly: +d.tas_anomaly,
    rsdt: d.rsdt ? +d.rsdt : NaN,
  })).then((rows) => {
    slide6StateData = rows.filter(
      (d) =>
        d.year >= 1960 &&
        d.year <= 2014 &&
        Number.isFinite(d.co2) &&
        Number.isFinite(d.od550aer) &&
        Number.isFinite(d.tas)
    );

    const counts = d3.rollup(slide6StateData, (v) => v.length, (d) => d.state);
    slide6States = [...counts.entries()]
      .filter(([, n]) => n >= 50)
      .map(([state]) => state)
      .sort(d3.ascending);

    const stateSelect = document.getElementById("slide6StateSelect");
    stateSelect.innerHTML = slide6States
      .map((s) => `<option value="${s}">${s}</option>`)
      .join("");
    stateSelect.value = slide6States.includes("California")
      ? "California"
      : slide6States[0];

    const startSlider = document.getElementById("slide6StartYear");
    const endSlider = document.getElementById("slide6EndYear");
    const startLabel = document.getElementById("slide6StartLabel");
    const endLabel = document.getElementById("slide6EndLabel");
    const fill = document.getElementById("slide6SliderFill");
    const MIN = 1960;
    const MAX = 2014;

    slide6Redraw = function redraw() {
      const start = Math.min(+startSlider.value, +endSlider.value);
      const end = Math.max(+startSlider.value, +endSlider.value);
      startLabel.textContent = start;
      endLabel.textContent = end;
      const pct = (v) => ((v - MIN) / (MAX - MIN)) * 100;
      fill.style.left = `${pct(start)}%`;
      fill.style.right = `${100 - pct(end)}%`;

      const state = stateSelect.value;
      const subset = slide6StateData.filter(
        (d) => d.state === state && d.year >= start && d.year <= end
      );
      if (subset.length < 5) return;

      const model = fitMultipleRegression(subset, "tas", ["co2", "od550aer"]);
      const contributions = buildContributions(subset, model);
      updateSlide6Metrics(subset, model, contributions);
      drawSlide6Chart(contributions, model);
    };

    stateSelect.addEventListener("change", slide6Redraw);
    startSlider.addEventListener("input", slide6Redraw);
    endSlider.addEventListener("input", slide6Redraw);
    slide6Redraw();
  });
}

function fitMultipleRegression(rows, yKey, xKeys) {
  const n = rows.length;
  const p = xKeys.length + 1;
  const X = rows.map((row) => [1, ...xKeys.map((k) => row[k])]);
  const y = rows.map((row) => row[yKey]);

  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      Xty[j] += X[i][j] * y[i];
      for (let k = 0; k < p; k++) XtX[j][k] += X[i][j] * X[i][k];
    }
  }

  const beta = solveLinearSystem(XtX, Xty);
  const means = Object.fromEntries(xKeys.map((k) => [k, d3.mean(rows, (d) => d[k])]));
  const intercept = beta[0];
  const coeffs = Object.fromEntries(xKeys.map((k, i) => [k, beta[i + 1]]));

  return { intercept, coeffs, means, xKeys, yKey };
}

function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];

    const div = M[col][col] || 1e-12;
    for (let j = col; j <= n; j++) M[col][j] /= div;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
    }
  }

  return M.map((row) => row[n]);
}

function buildContributions(rows, model) {
  const { intercept, coeffs, means, xKeys } = model;
  const baselineYear = rows[0].year;

  return rows.map((row) => {
    const co2Contrib =
      coeffs.co2 * (row.co2 - means.co2);
    const aerosolContrib =
      coeffs.od550aer * (row.od550aer - means.od550aer);
    const predicted = intercept + co2Contrib + aerosolContrib;

    const co2Delta = coeffs.co2 * (row.co2 - rows[0].co2);
    const aerosolDelta = coeffs.od550aer * (row.od550aer - rows[0].od550aer);

    return {
      year: row.year,
      tas_c: row.tas_c,
      tas_anomaly: row.tas_anomaly,
      predicted,
      co2Contrib,
      aerosolContrib,
      co2Delta,
      aerosolDelta,
      residual: row.tas - predicted,
      isBaseline: row.year === baselineYear,
    };
  });
}

function updateSlide6Metrics(rows, model, contributions) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const { coeffs } = model;

  const observedChange = last.tas_c - first.tas_c;
  const co2Warming = coeffs.co2 * (last.co2 - first.co2);
  const aerosolCooling = coeffs.od550aer * (last.od550aer - first.od550aer);
  const predictedChange = co2Warming + aerosolCooling;

  document.getElementById("slide6ObservedChange").textContent = fmtTemp(observedChange);
  document.getElementById("slide6Co2Warming").textContent = fmtTemp(co2Warming);
  document.getElementById("slide6AerosolCooling").textContent = fmtTemp(aerosolCooling);
  document.getElementById("slide6PredictedChange").textContent = fmtTemp(predictedChange);

  const eqEl = document.getElementById("slide6Equation");
  eqEl.innerHTML =
    `Tas = ${model.intercept.toFixed(2)}` +
    ` + ${coeffs.co2.toExponential(2)}·CO₂` +
    ` + ${coeffs.od550aer.toFixed(2)}·od550aer`;
}

function fmtTemp(v) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)} °C`;
}

function drawSlide6Chart(data, model) {
  const svg = d3.select("#slide6Chart");
  svg.selectAll("*").remove();

  const { w, h, m } = box(svg, 900, 430);
  const x = d3.scaleLinear().domain(d3.extent(data, (d) => d.year)).range([m.left, w - m.right]);

  const allValues = data.flatMap((d) => [
    d.co2Delta,
    d.aerosolDelta,
    d.co2Delta + d.aerosolDelta,
    d.tas_c - data[0].tas_c,
  ]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(allValues))
    .nice()
    .range([h - m.bottom, m.top]);

  axes(svg, x, y, w, h, m, true);
  svg
    .select(".grid")
    .selectAll("line")
    .attr("class", "grid-line");

  const zero = y(0);
  svg
    .append("line")
    .attr("x1", m.left)
    .attr("x2", w - m.right)
    .attr("y1", zero)
    .attr("y2", zero)
    .attr("stroke", "#94a3b8")
    .attr("stroke-dasharray", "4,3");

  const lineGen = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.value))
    .curve(d3.curveMonotoneX);

  const series = [
    {
      key: "co2Delta",
      label: "CO₂ warming (β₁·ΔCO₂)",
      color: "#e53935",
      width: 2.5,
    },
    {
      key: "aerosolDelta",
      label: "Aerosol effect (β₂·Δod550aer)",
      color: "#2196f3",
      width: 2.5,
    },
    {
      key: "combined",
      label: "Combined prediction",
      color: "#6b7280",
      width: 1.5,
      dash: "6,4",
    },
    {
      key: "observed",
      label: "Observed ΔT",
      color: "#111827",
      width: 2,
    },
  ];

  const plotted = series.map((s) => {
    let values;
    if (s.key === "combined") {
      values = data.map((d) => ({
        year: d.year,
        value: d.co2Delta + d.aerosolDelta,
      }));
    } else if (s.key === "observed") {
      const base = data[0].tas_c;
      values = data.map((d) => ({ year: d.year, value: d.tas_c - base }));
    } else {
      values = data.map((d) => ({ year: d.year, value: d[s.key] }));
    }
    return { ...s, values };
  });

  plotted.forEach((s) => {
    const path = svg
      .append("path")
      .datum(s.values)
      .attr("class", "line")
      .attr("stroke", s.color)
      .attr("stroke-width", s.width)
      .attr("fill", "none")
      .attr("d", lineGen);
    if (s.dash) path.attr("stroke-dasharray", s.dash);
  });

  legend(svg, plotted, m.left, m.top - 18);
  label(
    svg,
    "Temperature change relative to start year (regression attribution)",
    m.left,
    m.top + 22
  );
  label(
    svg,
    "Years",
    (w + m.left - m.right) / 2,
    h - 8,
    "middle"
  );
}
