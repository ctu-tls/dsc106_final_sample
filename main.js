let currentSlide = 0;
let slides;
let totalSlides;
let isTransitioning = false;

const prevSlideBtn = document.getElementById("prevSlideBtn");
const nextSlideBtn = document.getElementById("nextSlideBtn");

function updateNavigationButtons() {
  prevSlideBtn.disabled = currentSlide === 0;
  nextSlideBtn.disabled = currentSlide === slides.length - 1;
}

function resetTypewriters(slide) {
  slide.querySelectorAll(".typewriter").forEach((el) => {
    if (el._typingTimeout) clearTimeout(el._typingTimeout);
    el._typingTimeout = null;
    const textElement = el.querySelector(".typewriter-text");
    if (textElement) textElement.textContent = "";
  });
}

function typewriterEffect(element, speed = 38) {
  const text = element.getAttribute("data-text") || "";
  const textElement = element.querySelector(".typewriter-text");
  if (!textElement) return;
  if (element._typingTimeout) clearTimeout(element._typingTimeout);
  textElement.textContent = "";
  let i = 0;
  function type() {
    if (i < text.length) {
      textElement.textContent += text.charAt(i++);
      element._typingTimeout = setTimeout(type, speed);
    }
  }
  type();
}

function triggerTypewriterInSlide(slide) {
  slide.querySelectorAll(".typewriter").forEach((el) => typewriterEffect(el));
}

function updateSlide() {
  slides.forEach((slide, index) => {
    slide.classList.remove("active", "prev", "next");
    resetTypewriters(slide);
    if (index === currentSlide) {
      slide.classList.add("active");
      triggerTypewriterInSlide(slide);
    } else if (index < currentSlide) slide.classList.add("prev");
    else slide.classList.add("next");
  });
  document.querySelectorAll(".indicator-dot").forEach((dot, index) => {
    dot.classList.toggle("active", index === currentSlide);
  });
  updateNavigationButtons();
}

function goToSlide(index) {
  if (index === currentSlide || isTransitioning) return;
  isTransitioning = true;
  currentSlide = Math.max(0, Math.min(totalSlides - 1, index));
  updateSlide();
  setTimeout(() => (isTransitioning = false), 250);
}
function nextSlide() { if (currentSlide < totalSlides - 1) goToSlide(currentSlide + 1); }
function previousSlide() { if (currentSlide > 0) goToSlide(currentSlide - 1); }

document.addEventListener("DOMContentLoaded", () => {
  slides = document.querySelectorAll(".slide");
  totalSlides = slides.length;
  const indicatorContainer = document.getElementById("slide-indicator");
  for (let i = 0; i < totalSlides; i++) {
    const dot = document.createElement("div");
    dot.className = "indicator-dot" + (i === 0 ? " active" : "");
    dot.addEventListener("click", () => goToSlide(i));
    indicatorContainer.appendChild(dot);
  }
  prevSlideBtn.addEventListener("click", previousSlide);
  nextSlideBtn.addEventListener("click", nextSlide);
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); nextSlide(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); previousSlide(); }
  });
  document.querySelector(".slides-container").addEventListener("click", (e) => {
    if (e.target.closest("button,select,input,svg,.indicator-dot,.chart-container")) return;
    if (e.clientX < window.innerWidth / 2) previousSlide(); else nextSlide();
  });
  updateSlide();
  loadData();
});

function loadData() {
  d3.csv("global_yearly.csv", (d) => ({ year: +d.year, od550aer: +d.od550aer, tas_c: +d.tas_c, tas_anomaly: +d.tas_anomaly })).then((data) => {
    drawSlide4Chart(data);

    const startSlider = document.getElementById("startYearSlider");
    const endSlider   = document.getElementById("endYearSlider");
    const startLabel  = document.getElementById("startYearLabel");
    const endLabel    = document.getElementById("endYearLabel");
    const rangeTitle  = document.getElementById("slide3YearRange");

    const fill = document.getElementById("sliderFill");
    const MIN = 1850, MAX = 2014;
    function redraw() {
      const s = Math.min(+startSlider.value, +endSlider.value);
      const e = Math.max(+startSlider.value, +endSlider.value);
      startLabel.textContent = s;
      endLabel.textContent   = e;
      rangeTitle.textContent = `${s}–${e}`;
      const pct = (v) => ((v - MIN) / (MAX - MIN)) * 100;
      fill.style.left  = `${pct(s)}%`;
      fill.style.right = `${100 - pct(e)}%`;
      drawSlide3Chart(data.filter((d) => d.year >= s && d.year <= e));
    }

    startSlider.addEventListener("input", redraw);
    endSlider.addEventListener("input", redraw);
    redraw();
  });
}

function drawSlide3Chart(data) {
  const svg = d3.select("#slide3Chart"); svg.selectAll("*").remove();
  const { w, h, m } = box(svg, 900, 430);
  const x = d3.scaleLinear().domain(d3.extent(data, (d) => d.year)).range([m.left, w - m.right]);
  const y = d3.scaleLinear().domain(d3.extent(data, (d) => d.tas_anomaly)).nice().range([h - m.bottom, m.top]);
  const zero = y(0);
  const barW = (w - m.left - m.right) / data.length;

  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.bottom})`).call(d3.axisBottom(x).ticks(8).tickFormat(d3.format("d")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${d > 0 ? "+" : ""}${d.toFixed(2)} °C`));
  svg.append("g").attr("class", "grid").attr("transform", `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.left - m.right)).tickFormat("")).selectAll("line").attr("class", "grid-line");

  svg.append("defs").append("clipPath").attr("id", "slide3Clip")
    .append("rect").attr("x", m.left).attr("y", m.top)
    .attr("width", w - m.left - m.right).attr("height", h - m.top - m.bottom);

  svg.append("g").attr("clip-path", "url(#slide3Clip)")
    .selectAll("rect.bar").data(data).join("rect")
    .attr("class", "bar")
    .attr("x", (d) => x(d.year) - barW / 2)
    .attr("width", Math.max(barW - 0.5, 1))
    .attr("y", (d) => d.tas_anomaly >= 0 ? y(d.tas_anomaly) : zero)
    .attr("height", (d) => Math.abs(y(d.tas_anomaly) - zero))
    .attr("fill", (d) => d.tas_anomaly >= 0 ? "#e53935" : "#2196f3");

  svg.append("line")
    .attr("x1", m.left).attr("x2", w - m.right).attr("y1", zero).attr("y2", zero)
    .attr("stroke", "#333").attr("stroke-width", 1.5).attr("stroke-dasharray", "4,3");

  label(svg, "Temperature anomaly relative to 1850–1900 baseline", m.left, m.top - 10);
}

function drawSlide4Chart(data) {
  const svg = d3.select("#slide4Chart");
  const { w, h, m } = box(svg, 900, 430);
  const x = d3.scaleLinear().domain(d3.extent(data, (d) => d.year)).range([m.left, w - m.right]);
  const series = [
    { key: "od550aer", label: "od550aer", color: "#f6ae2d" },
    { key: "tas_c",    label: "temperature (°C)", color: "#e53935" },
  ].map((s) => {
    const sc = d3.scaleLinear().domain(d3.extent(data, (d) => d[s.key])).range([0, 1]);
    return { ...s, values: data.map((d) => ({ year: d.year, value: sc(d[s.key]) })) };
  });
  const y = d3.scaleLinear().domain([0, 1]).range([h - m.bottom, m.top]);
  axes(svg, x, y, w, h, m, true);
  const lineGen = d3.line().x((d) => x(d.year)).y((d) => y(d.value)).curve(d3.curveMonotoneX);
  const bisect = d3.bisector((d) => d.year).left;
  const paths = series.map((s) =>
    svg.append("path").datum(s.values).attr("class", "line").attr("stroke", s.color).attr("d", lineGen)
  );
  legend(svg, series, m.left, m.top - 18);
  label(svg, "Normalized (0–1 within each variable)", m.left, m.top + 22);
  svg.append("rect")
    .attr("x", m.left).attr("y", m.top)
    .attr("width", w - m.left - m.right).attr("height", h - m.top - m.bottom)
    .attr("fill", "none").attr("pointer-events", "all")
    .on("mousemove", function (event) {
      const [mx, my] = d3.pointer(event);
      const year = x.invert(mx);
      let minDist = Infinity, closestIdx = 0;
      series.forEach((s, i) => {
        const idx = bisect(s.values, year, 1);
        const d0 = s.values[idx - 1], d1 = s.values[idx];
        const val = d1 ? d0.value + (year - d0.year) / (d1.year - d0.year) * (d1.value - d0.value) : d0.value;
        const dist = Math.abs(my - y(val));
        if (dist < minDist) { minDist = dist; closestIdx = i; }
      });
      paths.forEach((p, i) => p.attr("stroke-width", i === closestIdx ? 4 : 1.5).attr("opacity", i === closestIdx ? 1 : 0.2));
    })
    .on("mouseleave", () => paths.forEach((p) => p.attr("stroke-width", null).attr("opacity", null)));
}

// D3 chart helpers
function axes(svg, x, y, w, h, m, yearTicks) {
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.bottom})`).call(d3.axisBottom(x).ticks(6).tickFormat(yearTicks ? d3.format("d") : undefined));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5));
  svg.append("g").attr("class", "grid").attr("transform", `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.left - m.right)).tickFormat("")).selectAll("line").attr("class", "grid-line");
}
function box(svg, w = 620, h = 340) { svg.attr("viewBox", `0 0 ${w} ${h}`); return { w, h, m: { top: 44, right: 28, bottom: 48, left: 64 } }; }
function label(svg, text, x, y, anchor = "start") { svg.append("text").attr("class", "chart-label").attr("x", x).attr("y", y).attr("text-anchor", anchor).text(text); }
function legend(svg, items, x, y) { const g = svg.append("g").attr("class", "legend").attr("transform", `translate(${x},${y})`); items.forEach((s, i) => { const e = g.append("g").attr("transform", `translate(${i * 150},0)`); e.append("circle").attr("r", 5).attr("fill", s.color); e.append("text").attr("x", 12).attr("y", 4).text(s.label); }); }
function corr(a, b) { const ma = d3.mean(a), mb = d3.mean(b); const num = d3.sum(a, (v, i) => (v - ma) * (b[i] - mb)); const den = Math.sqrt(d3.sum(a, (v) => (v - ma) ** 2) * d3.sum(b, (v) => (v - mb) ** 2)); return den ? num / den : 0; }
function showTooltip(event, html, container) { d3.select(container || "#tooltip").classed("hidden", false).style("left", `${event.offsetX + 14}px`).style("top", `${event.offsetY + 14}px`).html(html); }
function hideTooltip(container) { d3.select(container || "#tooltip").classed("hidden", true); }