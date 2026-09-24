/**
 * Visor "Revisá el documento" — lectura requerida antes de firmar.
 *
 * Comportamiento (según las notas del diseño en Figma):
 * - Un segmento del indicador por página, que se llena con el scroll según la parte
 *   del recorrido que le toca a esa página. Al completarse, la página cuenta como
 *   revisada; la última, al llegar al final. El progreso nunca retrocede.
 * - Si el documento entra completo en pantalla al cargar, se marca como revisado.
 * - Chip "Ir al final del documento": scroll suave hasta el final; se oculta al completar.
 * - "Firmar documento" usa aria-disabled hasta completar la lectura. Hover, foco o
 *   click/tap muestran el tooltip; con click/tap se oculta a los 4 s o al hacer scroll,
 *   y el indicador hace un pulso de 600 ms.
 * - Scrollbar e indicador sincronizados con la lectura.
 * - Cambiar el zoom no reinicia el progreso.
 */
(() => {
  const $ = (id) => document.getElementById(id);

  const scroll = $("scroll");
  const pages = [...document.querySelectorAll(".doc-page")];
  const total = pages.length;

  const progress = $("progress");
  const progressLabel = $("progress-label");
  const progressCount = $("progress-count");
  const progressBar = $("progress-bar");

  const chip = $("chip");
  const signBtn = $("btn-sign");
  const tooltip = $("tooltip");
  const tooltipDetail = $("tooltip-detail");
  const live = $("live");
  const toast = $("toast");

  const scrollbar = $("scrollbar");
  const thumb = $("scrollbar-thumb");

  const zoomValue = $("zoom-value");
  const zoomIn = $("zoom-in");
  const zoomOut = $("zoom-out");

  const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];
  const TOOLTIP_TIMEOUT = 4000;
  const PULSE_MS = 600;

  const reviewed = new Set();
  let zoomIndex = ZOOM_STEPS.indexOf(100);
  let tooltipTimer = null;
  let tooltipPinned = false; // abierto por click/tap

  const plural = (n, one, many) => (n === 1 ? one : many);
  const isComplete = () => reviewed.size === total;

  /* ---------- Indicador de progreso ---------- */

  const segments = pages.map((_, i) => {
    const seg = document.createElement("span");
    seg.className = "progress__segment";
    seg.dataset.page = i + 1;
    const fill = document.createElement("span");
    fill.className = "progress__fill";
    seg.appendChild(fill);
    progressBar.appendChild(seg);
    return seg;
  });
  // Avance parcial de cada página (0 a 1). Solo crece: nunca retrocede.
  const pageFill = pages.map(() => 0);

  function setFill(i, value) {
    pageFill[i] = Math.max(pageFill[i], Math.min(1, value));
    segments[i].style.setProperty("--fill", pageFill[i]);
  }

  function renderProgress() {
    const done = reviewed.size;
    const missing = total - done;
    const state = done === 0 ? "sin-leer" : missing === 0 ? "completo" : "en-progreso";
    progress.dataset.state = state;

    segments.forEach((seg, i) => {
      seg.classList.toggle("is-done", reviewed.has(i + 1));
      if (reviewed.has(i + 1)) setFill(i, 1);
    });
    progressCount.textContent = `${done} de ${total} ${plural(total, "página", "páginas")}`;

    if (state === "sin-leer") {
      progressLabel.textContent = "Revisá el documento para habilitar la firma";
    } else if (state === "en-progreso") {
      progressLabel.textContent = `Te falta revisar ${missing} ${plural(missing, "página", "páginas")} para habilitar la firma`;
    } else {
      progressLabel.textContent = "Revisaste todo el documento. Ya podés firmar.";
    }

    tooltipDetail.textContent = `Te falta revisar ${missing} ${plural(missing, "página", "páginas")}.`;
  }

  function markReviewed(page) {
    if (reviewed.has(page)) return;
    const wasComplete = isComplete();
    reviewed.add(page);
    renderProgress();
    if (!wasComplete && isComplete()) onComplete();
  }

  function onComplete() {
    signBtn.removeAttribute("aria-disabled");
    signBtn.removeAttribute("aria-describedby");
    hideTooltip();
    chip.classList.add("is-hidden");
    chip.tabIndex = -1;
    live.textContent = "Revisaste todo el documento. Ya podés firmar.";
  }

  /* ---------- Seguimiento de lectura ---------- */

  // Cada segmento representa la parte del recorrido total que le corresponde a su
  // página (según su alto): con 2 páginas, la 1 se llena del 0 al 50 % del scroll
  // y la 2 del 50 al 100 %. La página cuenta como revisada cuando su segmento se
  // completa, así la barra y el contador nunca se contradicen, sin importar el alto
  // del visor ni el zoom.
  function checkReviewed() {
    const maxScroll = scroll.scrollHeight - scroll.clientHeight;
    // Documento que entra completo en pantalla: se marca como revisado de inmediato
    if (maxScroll <= 2) {
      pages.forEach((_, i) => markReviewed(i + 1));
      return;
    }
    const atEnd = scroll.scrollTop >= maxScroll - 2;
    const progressTotal = atEnd ? 1 : scroll.scrollTop / maxScroll;
    const heights = pages.map((page) => page.offsetHeight);
    const totalH = heights.reduce((a, b) => a + b, 0);
    let before = 0;
    heights.forEach((h, i) => {
      setFill(i, (progressTotal * totalH - before) / h);
      if (pageFill[i] >= 1) markReviewed(i + 1);
      before += h;
    });
  }

  /* ---------- Scrollbar personalizada ---------- */

  // Padding vertical del riel (4 + 4 px en desktop, 2 + 2 px en mobile)
  const trackPadding = () => {
    const cs = getComputedStyle(scrollbar);
    return parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  };

  function updateScrollbar() {
    const trackH = scrollbar.clientHeight - trackPadding();
    const ratio = scroll.clientHeight / scroll.scrollHeight;
    const thumbH = Math.max(40, Math.round(trackH * Math.min(1, ratio)));
    const maxScroll = scroll.scrollHeight - scroll.clientHeight;
    const y = maxScroll > 0 ? (scroll.scrollTop / maxScroll) * (trackH - thumbH) : 0;
    thumb.style.height = `${thumbH}px`;
    thumb.style.transform = `translateY(${y}px)`;
    scrollbar.style.visibility = ratio >= 1 ? "hidden" : "visible";
  }

  let drag = null;
  thumb.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    thumb.setPointerCapture(e.pointerId);
    scrollbar.classList.add("is-dragging");
    drag = { y: e.clientY, top: scroll.scrollTop };
  });
  thumb.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const trackH = scrollbar.clientHeight - trackPadding() - thumb.offsetHeight;
    const maxScroll = scroll.scrollHeight - scroll.clientHeight;
    scroll.scrollTop = drag.top + ((e.clientY - drag.y) / trackH) * maxScroll;
  });
  const endDrag = () => { drag = null; scrollbar.classList.remove("is-dragging"); };
  thumb.addEventListener("pointerup", endDrag);
  thumb.addEventListener("pointercancel", endDrag);
  scrollbar.addEventListener("pointerdown", (e) => {
    if (e.target === thumb) return;
    const rect = scrollbar.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    scroll.scrollTo({ top: ratio * (scroll.scrollHeight - scroll.clientHeight), behavior: "smooth" });
  });

  /* ---------- Scroll ---------- */

  let raf = 0;
  scroll.addEventListener("scroll", () => {
    if (tooltipPinned) hideTooltip();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      checkReviewed();
      updateScrollbar();
    });
  });

  /* ---------- Chip ---------- */

  chip.addEventListener("click", () => {
    scroll.scrollTo({ top: scroll.scrollHeight, behavior: "smooth" });
  });

  /* ---------- Zoom (no reinicia el progreso) ---------- */

  function setZoom(index) {
    zoomIndex = Math.max(0, Math.min(ZOOM_STEPS.length - 1, index));
    const maxScroll = scroll.scrollHeight - scroll.clientHeight;
    const pos = maxScroll > 0 ? scroll.scrollTop / maxScroll : 0;
    const z = ZOOM_STEPS[zoomIndex];
    scroll.style.setProperty("--zoom", z / 100);
    zoomValue.textContent = `${z}%`;
    zoomOut.disabled = zoomIndex === 0;
    zoomIn.disabled = zoomIndex === ZOOM_STEPS.length - 1;
    // Mantiene la posición relativa de lectura
    const newMax = scroll.scrollHeight - scroll.clientHeight;
    scroll.scrollTop = pos * newMax;
    scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2;
    checkReviewed();
    updateScrollbar();
  }
  zoomIn.addEventListener("click", () => setZoom(zoomIndex + 1));
  zoomOut.addEventListener("click", () => setZoom(zoomIndex - 1));

  /* ---------- Tooltip + botón Firmar ---------- */

  function showTooltip(pinned) {
    if (isComplete()) return;
    tooltip.classList.add("is-visible");
    if (pinned) {
      tooltipPinned = true;
      clearTimeout(tooltipTimer);
      tooltipTimer = setTimeout(hideTooltip, TOOLTIP_TIMEOUT);
    }
  }
  function hideTooltip() {
    tooltipPinned = false;
    clearTimeout(tooltipTimer);
    tooltip.classList.remove("is-visible");
  }

  function pulseProgress() {
    progress.classList.remove("is-pulsing");
    void progress.offsetWidth; // reinicia la animación
    progress.classList.add("is-pulsing");
    setTimeout(() => progress.classList.remove("is-pulsing"), PULSE_MS);
  }

  signBtn.addEventListener("mouseenter", () => showTooltip(false));
  signBtn.addEventListener("mouseleave", () => { if (!tooltipPinned) hideTooltip(); });
  signBtn.addEventListener("focus", () => showTooltip(false));
  signBtn.addEventListener("blur", () => { if (!tooltipPinned) hideTooltip(); });

  signBtn.addEventListener("click", () => {
    if (!isComplete()) {
      showTooltip(true);
      pulseProgress();
      return;
    }
    showToast("Documento listo para firmar. Continúa el paso de firma.");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideTooltip();
  });

  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  /* ---------- Alto del visor ajustado a la ventana ---------- */

  // El visor ocupa el alto disponible para que los botones de acción queden
  // siempre visibles sin scrollear la página. Máximo: una página completa al 100 %
  // (686 px en desktop, ~406 px en mobile), para que la siguiente no asome al cargar.
  const VIEWPORT_MIN = 240;
  function fitToWindow() {
    const root = document.documentElement;
    const current = scroll.clientHeight;
    const chrome = document.body.scrollHeight - current; // todo lo que no es el visor
    const available = window.innerHeight - chrome;
    const cs = getComputedStyle(scroll);
    const zoom = parseFloat(scroll.style.getPropertyValue("--zoom")) || 1;
    const onePage = pages[0].offsetHeight / zoom + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const h = Math.max(VIEWPORT_MIN, Math.min(Math.floor(onePage), available));
    root.style.setProperty("--viewport-h", `${h}px`);
  }

  /* ---------- Inicio ---------- */

  function init() {
    fitToWindow();
    renderProgress();
    setZoom(zoomIndex);
  }

  const img = pages[0].querySelector("img");
  if (img && !img.complete) img.addEventListener("load", init, { once: true });
  init();
  if (document.fonts) document.fonts.ready.then(() => { fitToWindow(); updateScrollbar(); });
  window.addEventListener("resize", () => { fitToWindow(); checkReviewed(); updateScrollbar(); });
})();
