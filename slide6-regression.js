let slide6AnnualData = [];
let slide6CoefData = [];

function initSlide6() {
  Promise.all([
    d3.csv("state_annual_climate.csv", d3.autoType),
    d3.csv("state_regression_coefficients.csv", d3.autoType),
  ]).then(([annualRows, coefRows]) => {
    slide6AnnualData = annualRows.filter(
      d =>
        d.year >= 1960 &&
        d.year <= 2014 &&
        Number.isFinite(d.tas_anomaly) &&
        Number.isFinite(d.co2_ppm) &&
        Number.isFinite(d.od550aer) &&
        Number.isFinite(d.rsdt)
    );

    slide6CoefData = coefRows;

    const stateSelect = document.getElementById("slide6StateSelect");
    const states = slide6CoefData.map(d => d.state).sort();

    stateSelect.innerHTML = states
      .map(s => `<option value="${s}">${s}</option>`)
      .join("");

    stateSelect.value = states.includes("California") ? "California" : states[0];

    document.getElementById("slide6StateSelect").addEventListener("change", updateSlide6);
    document.getElementById("slide6StartYear").addEventListener("input", updateSlide6);
    document.getElementById("slide6EndYear").addEventListener("input", updateSlide6);

    updateSlide6();
  });
}

function updateSlide6() {
  const state = document.getElementById("slide6StateSelect").value;

  const startSlider = document.getElementById("slide6StartYear");
  const endSlider = document.getElementById("slide6EndYear");

  let start = Math.min(+startSlider.value, +endSlider.value);
  let end = Math.max(+startSlider.value, +endSlider.value);

  document.getElementById("slide6StartLabel").textContent = start;
  document.getElementById("slide6EndLabel").textContent = end;

  const fill = document.getElementById("slide6SliderFill");
  const pct = v => ((v - 1960) / (2014 - 1960)) * 100;
  fill.style.left = `${pct(start)}%`;
  fill.style.right = `${100 - pct(end)}%`;

  const coef = slide6CoefData.find(d => d.state === state);
  const stateRows = slide6AnnualData
    .filter(d => d.state === state && d.year >= start && d.year <= end)
    .sort((a, b) => a.year - b.year);

  if (!coef || stateRows.length < 2) return;

  const first = stateRows[0];
  const last = stateRows[stateRows.length - 1];

  const observed = last.tas_anomaly - first.tas_anomaly;
  const co2Contribution = coef.beta_co2 * (last.co2_ppm - first.co2_ppm);
  const aerosolContribution = coef.beta_od550aer * (last.od550aer - first.od550aer);
  const rsdtContribution = coef.beta_rsdt * (last.rsdt - first.rsdt);
  const predicted = co2Contribution + aerosolContribution + rsdtContribution;

  document.getElementById("slide6ObservedChange").textContent = fmtSlide6Temp(observed);
  document.getElementById("slide6Co2Warming").textContent = fmtSlide6Temp(co2Contribution);
  document.getElementById("slide6AerosolCooling").textContent = fmtSlide6Temp(aerosolContribution);
  document.getElementById("slide6PredictedChange").textContent = fmtSlide6Temp(predicted);

  document.getElementById("slide6Equation").innerHTML =
    `Model: tas anomaly = ${coef.intercept.toFixed(2)} 
    + ${coef.beta_co2.toExponential(2)}·CO₂ 
    + ${coef.beta_od550aer.toFixed(2)}·od550aer 
    + ${coef.beta_rsdt.toFixed(2)}·rsdt`;

  const chartRows = stateRows.map(d => ({
    year: d.year,
    observed: d.tas_anomaly - first.tas_anomaly,
    co2: coef.beta_co2 * (d.co2_ppm - first.co2_ppm),
    aerosol: coef.beta_od550aer * (d.od550aer - first.od550aer),
    rsdt: coef.beta_rsdt * (d.rsdt - first.rsdt),
  }));

  chartRows.forEach(d => {
    d.predicted = d.co2 + d.aerosol + d.rsdt;
  });

  drawSlide6Chart(chartRows);
}

function fmtSlide6Temp(v) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)} °C`;
}

function drawSlide6Chart(data) {
  const svg = d3.select("#slide6Chart");
  svg.selectAll("*").remove();

  const { w, h, m } = box(svg, 900, 430);

  const x = d3.scaleLinear()
    .domain(d3.extent(data, d => d.year))
    .range([m.left, w - m.right]);

  const allValues = data.flatMap(d => [
    d.observed,
    d.co2,
    d.aerosol,
    d.rsdt,
    d.predicted,
  ]);

  const y = d3.scaleLinear()
    .domain(d3.extent(allValues))
    .nice()
    .range([h - m.bottom, m.top]);

  axes(svg, x, y, w, h, m, true);

  svg.append("line")
    .attr("x1", m.left)
    .attr("x2", w - m.right)
    .attr("y1", y(0))
    .attr("y2", y(0))
    .attr("stroke", "#94a3b8")
    .attr("stroke-dasharray", "4,3");

  const series = [
    { key: "observed", label: "Observed ΔT", color: "#111827" },
    { key: "predicted", label: "Predicted ΔT", color: "#6b7280", dash: "6,4" },
    { key: "co2", label: "CO₂ contribution", color: "#e53935" },
    { key: "aerosol", label: "Aerosol contribution", color: "#2196f3" },
    { key: "rsdt", label: "Solar radiation contribution", color: "#f6ae2d" },
  ];

  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.value))
    .curve(d3.curveMonotoneX);

  series.forEach(s => {
    const values = data.map(d => ({
      year: d.year,
      value: d[s.key],
    }));

    const path = svg.append("path")
      .datum(values)
      .attr("fill", "none")
      .attr("stroke", s.color)
      .attr("stroke-width", 2.4)
      .attr("d", line);

    if (s.dash) path.attr("stroke-dasharray", s.dash);
  });

  legend(svg, series, m.left, m.top - 18);
  label(svg, "Temperature anomaly change relative to selected start year", m.left, m.top + 22);
}
