let slide6AnnualData = [];
let slide6TempData = [];
let slide6CoefData = [];
let slide6MapFeatures = [];
let slide6MapReady = false;
let slide6MapColor = null;

const slide6StateFips = {
  "01": "Alabama",
  "02": "Alaska",
  "04": "Arizona",
  "05": "Arkansas",
  "06": "California",
  "08": "Colorado",
  "09": "Connecticut",
  "10": "Delaware",
  "11": "District of Columbia",
  "12": "Florida",
  "13": "Georgia",
  "15": "Hawaii",
  "16": "Idaho",
  "17": "Illinois",
  "18": "Indiana",
  "19": "Iowa",
  "20": "Kansas",
  "21": "Kentucky",
  "22": "Louisiana",
  "23": "Maine",
  "24": "Maryland",
  "25": "Massachusetts",
  "26": "Michigan",
  "27": "Minnesota",
  "28": "Mississippi",
  "29": "Missouri",
  "30": "Montana",
  "31": "Nebraska",
  "32": "Nevada",
  "33": "New Hampshire",
  "34": "New Jersey",
  "35": "New Mexico",
  "36": "New York",
  "37": "North Carolina",
  "38": "North Dakota",
  "39": "Ohio",
  "40": "Oklahoma",
  "41": "Oregon",
  "42": "Pennsylvania",
  "44": "Rhode Island",
  "45": "South Carolina",
  "46": "South Dakota",
  "47": "Tennessee",
  "48": "Texas",
  "49": "Utah",
  "50": "Vermont",
  "51": "Virginia",
  "53": "Washington",
  "54": "West Virginia",
  "55": "Wisconsin",
  "56": "Wyoming",
};

function initSlide6() {
  Promise.all([
    d3.csv("state_annual_climate.csv", d3.autoType),
    d3.csv("state_regression_coefficients.csv", d3.autoType),
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json").catch(() => null),
  ]).then(([annualRows, coefRows, usMap]) => {
    const co2ByYear = d3.rollup(
      annualRows.filter(d => Number.isFinite(d.co2_ppm)),
      rows => d3.median(rows, d => d.co2_ppm),
      d => d.year
    );

    const rowsWithImputedCo2 = annualRows.map(d => ({
      ...d,
      co2_ppm: Number.isFinite(d.co2_ppm) ? d.co2_ppm : co2ByYear.get(d.year),
    }));

    slide6TempData = annualRows.filter(
      d =>
        d.year >= 1960 &&
        d.year <= 2014 &&
        Number.isFinite(d.tas_c)
    );

    slide6AnnualData = rowsWithImputedCo2.filter(
      d =>
        d.year >= 1960 &&
        d.year <= 2014 &&
        Number.isFinite(d.tas_anomaly) &&
        Number.isFinite(d.co2_ppm) &&
        Number.isFinite(d.od550aer) &&
        Number.isFinite(d.rsdt)
    );

    slide6CoefData = coefRows;
    slide6MapFeatures = getSlide6StateFeatures(usMap);

    const stateSelect = document.getElementById("slide6StateSelect");
    const states = slide6CoefData.map(d => d.state).sort();

    stateSelect.innerHTML = states
      .map(s => `<option value="${s}">${s}</option>`)
      .join("");

    stateSelect.value = states.includes("California") ? "California" : states[0];

    document.getElementById("slide6StateSelect").addEventListener("change", updateSlide6);
    document.getElementById("slide6StartYear").addEventListener("input", () => {
      hideTooltip();
      updateSlide6();
    });
    document.getElementById("slide6EndYear").addEventListener("input", () => {
      hideTooltip();
      updateSlide6();
    });

    initSlide6Map();
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

  updateSlide6Map(start, end, state);

  if (!coef || stateRows.length < 2) {
    d3.select("#slide6Chart").selectAll("*").remove();
    return;
  }

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

function getSlide6StateFeatures(usMap) {
  if (!usMap || typeof topojson === "undefined") return [];

  return topojson
    .feature(usMap, usMap.objects.states)
    .features
    .map(feature => ({
      ...feature,
      properties: {
        ...feature.properties,
        name:
          feature.properties?.name ||
          slide6StateFips[String(feature.id).padStart(2, "0")] ||
          String(feature.id),
      },
    }));
}

function getSlide6StateAverages(start, end) {
  return d3.rollup(
    slide6TempData.filter(
      d => d.year >= start && d.year <= end && Number.isFinite(d.tas_c)
    ),
    rows => d3.mean(rows, d => d.tas_c),
    d => d.state
  );
}

function initSlide6Map() {
  const svg = d3.select("#slide6Map");
  svg.selectAll("*").remove();

  const width = 975;
  const height = 610;
  svg
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .on("click", event => event.stopPropagation())
    .on("pointerdown", event => event.stopPropagation());

  if (!slide6MapFeatures.length) {
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("class", "chart-label")
      .text("Map could not be loaded.");
    return;
  }

  const allTemps = slide6TempData
    .map(d => d.tas_c)
    .filter(Number.isFinite);
  slide6MapColor = d3.scaleSequential()
    .domain(d3.extent(allTemps))
    .interpolator(d3.interpolateRgbBasis(["#fee8a8", "#f97316", "#b91c1c"]));

  const path = d3.geoPath();

  svg.append("g")
    .attr("class", "state-map-layer")
    .selectAll("path")
    .data(slide6MapFeatures)
    .join("path")
    .attr("class", "state-map-path")
    .attr("d", path)
    .on("mousemove", (event, d) => {
      event.stopPropagation();
      const avg = d3.select(event.currentTarget).datum().properties.slide6AverageTemp;
      const hasModel = d3.select(event.currentTarget).classed("has-data");
      const value = Number.isFinite(avg) ? `${avg.toFixed(1)} °C` : "No temperature data";
      const modelNote = hasModel
        ? "Click to select"
        : "No regression model for this state yet";
      showTooltip(
        event,
        `<strong>${d.properties.name}</strong><br>Average temperature: ${value}<br>${modelNote}`
      );
    })
    .on("mouseleave", event => {
      event.stopPropagation();
      hideTooltip();
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      const name = d.properties.name;
      if (!d3.select(event.currentTarget).classed("has-data")) return;
      document.getElementById("slide6StateSelect").value = name;
      updateSlide6();
    });

  svg.append("text")
    .attr("class", "chart-label")
    .attr("id", "slide6MapLabel")
    .attr("x", 18)
    .attr("y", height - 16)
    .text("Average tas_c");

  slide6MapReady = true;
}

function updateSlide6Map(start, end, selectedState) {
  if (!slide6MapReady) {
    initSlide6Map();
  }

  if (!slide6MapFeatures.length || !slide6MapColor) return;

  const averages = getSlide6StateAverages(start, end);
  const availableStates = new Set(slide6CoefData.map(d => d.state));

  d3.select("#slide6Map")
    .selectAll(".state-map-path")
    .each(d => {
      d.properties.slide6AverageTemp = averages.get(d.properties.name);
    })
    .attr("class", d => {
      const name = d.properties.name;
      const avg = averages.get(name);
      return [
        "state-map-path",
        Number.isFinite(avg) ? "has-temp" : "no-temp",
        availableStates.has(name) ? "has-data" : "no-data",
        name === selectedState ? "selected" : "",
      ].join(" ");
    })
    .attr("fill", d => {
      const avg = averages.get(d.properties.name);
      return Number.isFinite(avg) ? slide6MapColor(avg) : "#e5e7eb";
    });

  d3.select("#slide6MapLabel").text(`Average tas_c, ${start}-${end}`);
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
