(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Footer year ---------- */
  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- Nav: scrolled state, mobile toggle, active link ---------- */
  const nav = document.getElementById('nav');
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  const navAnchors = [...links.querySelectorAll('a')];
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navAnchors.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main section[id]').forEach((s) => sectionObserver.observe(s));

  /* ---------- Scroll reveal ---------- */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

  /* ---------- Interactive ARFI monitor (toy model) ----------
     Displacement plateau is proportional to acoustic power. At push-on the
     trace overshoots briefly and settles; at push-off it relaxes back to zero. */
  (() => {
    const hud = document.getElementById('hud');
    const svg = document.getElementById('hudSvg');
    const focusG = document.getElementById('focusG');
    const lesion = document.getElementById('lesion');
    const beams = [...document.querySelectorAll('#beams line')];
    const powerEl = document.getElementById('power');
    const fireBtn = document.getElementById('fire');
    const stateEl = document.querySelector('#hudState b');
    const roPower = document.getElementById('roPower');
    const roDisp = document.getElementById('roDisp');
    const hint = document.getElementById('hudHint');
    const trace = document.getElementById('trace');
    const tctx = trace.getContext('2d');

    const UM_PER_W = 0.1;       // plateau displacement per watt
    const Y_MAX = 120;          // µm, top of the chart
    const WINDOW_S = 10;        // seconds of history shown
    const MAX_PUSH_S = 6;       // a manual sonication stops by itself
    const BASE = { x: 200, y: 120 };

    let power = Number(powerEl.value);
    let pushing = false, pushT = 0, disp = 0, dose = 0;
    let focus = { ...BASE };
    let history = [];           // { t, d, on }
    let now = 0, last = 0, running = false, userTookOver = false;

    // --- focus steering ---
    function setFocus(x, y) {
      // keep the focus inside the tissue contour
      const dx = (x - 200) / 118, dy = (y - 124) / 62;
      const r = Math.hypot(dx, dy);
      if (r > 1) { x = 200 + (dx / r) * 118; y = 124 + (dy / r) * 62; }
      if (Math.hypot(x - focus.x, y - focus.y) > 14) dose = 0; // new spot, fresh lesion
      focus = { x, y };
      focusG.setAttribute('transform', `translate(${(x - BASE.x).toFixed(1)} ${(y - BASE.y).toFixed(1)})`);
      beams.forEach((l) => { l.setAttribute('x2', x.toFixed(1)); l.setAttribute('y2', y.toFixed(1)); });
    }
    function pointerToSvg(e) {
      const r = svg.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * 400, ((e.clientY - r.top) / r.height) * 330];
    }
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return; // touch scrolls the page; tap steers instead
      setFocus(...pointerToSvg(e));
      hint.textContent = '';
      wake();
    });
    svg.addEventListener('click', (e) => { setFocus(...pointerToSvg(e)); hint.textContent = ''; wake(); });

    // --- controls ---
    function setPower(p) {
      power = p;
      powerEl.value = p;
      roPower.textContent = p + ' W';
      hud.style.setProperty('--ring-scale', (1.6 + (p / 800) * 3.4).toFixed(2));
      hud.style.setProperty('--beam-alpha', (0.25 + (p / 800) * 0.65).toFixed(2));
    }
    function setPushing(on) {
      pushing = on;
      if (on) pushT = 0;
      hud.classList.toggle('pushing', on);
      fireBtn.setAttribute('aria-pressed', String(on));
      fireBtn.textContent = on ? 'Stop' : 'Sonicate';
      stateEl.textContent = on ? 'PUSH ON' : 'STANDBY';
      wake();
    }
    powerEl.addEventListener('input', () => { userTookOver = true; setPower(Number(powerEl.value)); wake(); });
    fireBtn.addEventListener('click', () => { userTookOver = true; setPushing(!pushing); });

    // --- auto demo until the visitor takes over: three powers, three plateaus ---
    const demo = [200, 400, 600];
    let demoStep = 0, demoT = 0;
    function runDemo(dt) {
      demoT += dt;
      if (!pushing && demoT > 1.6) { setPower(demo[demoStep % demo.length]); demoStep++; setPushing(true); demoT = 0; }
      else if (pushing && demoT > 2.6) { setPushing(false); demoT = 0; }
    }

    // --- model ---
    function step(dt) {
      if (!userTookOver && !reduceMotion) runDemo(dt);
      let target = 0, tau = 0.3;
      if (pushing) {
        pushT += dt;
        if (userTookOver && pushT > MAX_PUSH_S) setPushing(false);
        target = power * UM_PER_W * (1 + 0.4 * Math.exp(-pushT / 0.9));
        tau = 0.09;
        dose += power * dt;
      }
      disp += (target - disp) * (1 - Math.exp(-dt / tau));
      const noisy = Math.max(0, disp + (Math.random() - 0.5) * (0.6 + disp * 0.025));
      history.push({ t: now, d: noisy, on: pushing });
      while (history.length && history[0].t < now - WINDOW_S) history.shift();
      roDisp.textContent = Math.round(noisy) + ' µm';
      const grow = Math.min(6, dose / 700);
      lesion.setAttribute('rx', (7 + grow * 0.6).toFixed(1));
      lesion.setAttribute('ry', (12 + grow).toFixed(1));
    }

    // --- chart ---
    function sizeTrace() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      trace.width = Math.round(trace.clientWidth * dpr);
      trace.height = Math.round(96 * dpr);
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function drawTrace() {
      const W = trace.clientWidth, H = 96, padL = 26, padB = 8, padT = 6;
      const plotW = W - padL, plotH = H - padB - padT;
      const X = (t) => padL + ((t - (now - WINDOW_S)) / WINDOW_S) * plotW;
      const Y = (d) => padT + plotH - (Math.min(d, Y_MAX) / Y_MAX) * plotH;
      tctx.clearRect(0, 0, W, H);
      tctx.font = '9px "JetBrains Mono", monospace';
      tctx.textBaseline = 'middle';
      for (const v of [0, 40, 80, 120]) {
        tctx.strokeStyle = 'rgba(77,227,200,.12)';
        tctx.beginPath(); tctx.moveTo(padL, Y(v)); tctx.lineTo(W, Y(v)); tctx.stroke();
        tctx.fillStyle = '#8ba39d';
        tctx.fillText(String(v), 2, Y(v));
      }
      // push-on periods as a copper band along the time axis
      tctx.fillStyle = 'rgba(224,168,74,.75)';
      let start = null;
      history.forEach((h, i) => {
        if (h.on && start === null) start = h.t;
        if (start !== null && (!h.on || i === history.length - 1)) {
          tctx.fillRect(X(start), H - 5, Math.max(1, X(h.t) - X(start)), 3);
          start = null;
        }
      });
      // expected plateau for the selected power
      tctx.strokeStyle = 'rgba(224,168,74,.55)';
      tctx.setLineDash([4, 4]);
      tctx.beginPath(); tctx.moveTo(padL, Y(power * UM_PER_W)); tctx.lineTo(W, Y(power * UM_PER_W)); tctx.stroke();
      tctx.setLineDash([]);
      // the trace
      if (history.length > 1) {
        tctx.strokeStyle = '#4de3c8';
        tctx.lineWidth = 1.8;
        tctx.lineJoin = 'round';
        tctx.beginPath();
        history.forEach((h, i) => (i ? tctx.lineTo(X(h.t), Y(h.d)) : tctx.moveTo(X(h.t), Y(h.d))));
        tctx.stroke();
        tctx.lineWidth = 1;
      }
    }

    // --- loop: runs while visible; under reduced motion only while something is happening ---
    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }).observe(hud);
    function frame(ts) {
      const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
      last = ts; now += dt;
      step(dt);
      drawTrace();
      const idle = reduceMotion && !pushing && disp < 0.3;
      if (visible && !idle && !document.hidden) requestAnimationFrame(frame);
      else running = false;
    }
    function wake() {
      if (running) return;
      running = true; last = performance.now();
      requestAnimationFrame(frame);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    window.addEventListener('resize', () => { sizeTrace(); drawTrace(); });

    setPower(power);
    sizeTrace();
    drawTrace();
    wake();
  })();

  /* ---------- Image lightbox ---------- */
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCap = document.getElementById('lightboxCap');
  document.querySelectorAll('.shot').forEach((btn) => {
    btn.addEventListener('click', () => {
      lightboxImg.src = btn.dataset.full;
      lightboxImg.alt = btn.querySelector('img').alt;
      lightboxCap.textContent = btn.dataset.caption || '';
      lightbox.showModal();
    });
  });
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.classList.contains('lightbox-close')) lightbox.close();
  });

  /* ---------- Contact form (Web3Forms) ---------- */
  const form = document.getElementById('contactForm');
  const statusEl = document.getElementById('contactStatus');
  const submitBtn = document.getElementById('contactSubmit');
  const setStatus = (msg, cls) => { statusEl.textContent = msg; statusEl.className = 'form-status' + (cls ? ' ' + cls : ''); };

  form.addEventListener('input', (e) => e.target.classList.remove('invalid'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = [form.elements.name, form.elements.email, form.elements.message];
    let firstBad = null;
    fields.forEach((f) => {
      const bad = !f.value.trim() || !f.checkValidity();
      f.classList.toggle('invalid', bad);
      if (bad && !firstBad) firstBad = f;
    });
    if (firstBad) {
      setStatus('Please fill in your name, a valid email and a message.', 'err');
      firstBad.focus();
      return;
    }
    if (form.elements.access_key.value === 'YOUR_ACCESS_KEY_HERE') {
      setStatus('The contact form is not set up yet. Please use the links below.', 'err');
      return;
    }

    submitBtn.disabled = true;
    setStatus('Sending…');
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Request failed');
      form.reset();
      setStatus('Message sent. Thank you, I will get back to you soon.', 'ok');
    } catch (err) {
      setStatus('Sending failed. Please try again later or use the links below.', 'err');
    } finally {
      submitBtn.disabled = false;
    }
  });

  /* ---------- Typed roles ---------- */
  const roles = [
    'research_assistant @ Uniklinik Köln',
    'programmer @ Gremse-IT',
    'MR-HIFU histotripsy · ARFI monitoring',
    'medical image analysis · AI tools',
  ];
  const typed = document.getElementById('typed');
  if (reduceMotion) {
    typed.textContent = roles[0];
  } else {
    let r = 0, i = 0, deleting = false;
    const tick = () => {
      const word = roles[r];
      i += deleting ? -1 : 1;
      typed.textContent = word.slice(0, i);
      let delay = deleting ? 28 : 55;
      if (!deleting && i === word.length) { deleting = true; delay = 1900; }
      else if (deleting && i === 0) { deleting = false; r = (r + 1) % roles.length; delay = 350; }
      setTimeout(tick, delay);
    };
    tick();
  }

  /* ---------- PCB trace background ---------- */
  const canvas = document.getElementById('pcb');
  const ctx = canvas.getContext('2d');
  const CELL = 30;
  const COPPER = '224,168,74';
  const SIGNAL = '77,227,200';
  let traces = [], w = 0, h = 0, raf = 0;

  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  function build() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL);
    const count = Math.round((cols * rows) / 26);
    traces = [];
    for (let n = 0; n < count; n++) {
      let x = Math.floor(Math.random() * cols), y = Math.floor(Math.random() * rows);
      let d = Math.floor(Math.random() * 4) * 2; // start orthogonal
      const pts = [[x * CELL, y * CELL]];
      const segs = 2 + Math.floor(Math.random() * 4);
      for (let s = 0; s < segs; s++) {
        const len = 1 + Math.floor(Math.random() * 5);
        x += DIRS[d][0] * len; y += DIRS[d][1] * len;
        pts.push([x * CELL, y * CELL]);
        d = (d + (Math.random() < 0.5 ? 1 : 7)) % 8; // 45° turns like real routing
      }
      // cumulative lengths for pulse travel
      const lens = [0];
      for (let k = 1; k < pts.length; k++) {
        lens.push(lens[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      }
      traces.push({
        pts, lens, total: lens[lens.length - 1],
        pulse: Math.random() < 0.35,
        t: Math.random(), speed: 0.0025 + Math.random() * 0.004,
      });
    }
  }

  function pointAt(tr, dist) {
    for (let k = 1; k < tr.pts.length; k++) {
      if (dist <= tr.lens[k]) {
        const f = (dist - tr.lens[k - 1]) / (tr.lens[k] - tr.lens[k - 1] || 1);
        return [
          tr.pts[k - 1][0] + (tr.pts[k][0] - tr.pts[k - 1][0]) * f,
          tr.pts[k - 1][1] + (tr.pts[k][1] - tr.pts[k - 1][1]) * f,
        ];
      }
    }
    return tr.pts[tr.pts.length - 1];
  }

  function draw(animate) {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    for (const tr of traces) {
      ctx.strokeStyle = `rgba(${COPPER},.2)`;
      ctx.beginPath();
      tr.pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
      // vias at both ends
      for (const [px, py] of [tr.pts[0], tr.pts[tr.pts.length - 1]]) {
        ctx.fillStyle = '#060c0b';
        ctx.strokeStyle = `rgba(${COPPER},.4)`;
        ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      if (animate && tr.pulse) {
        tr.t = (tr.t + tr.speed) % 1;
        const [px, py] = pointAt(tr, tr.t * tr.total);
        const g = ctx.createRadialGradient(px, py, 0, px, py, 9);
        g.addColorStop(0, `rgba(${SIGNAL},.95)`);
        g.addColorStop(1, `rgba(${SIGNAL},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  let visible = true;
  function loop() {
    if (visible) draw(true);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    cancelAnimationFrame(raf);
    build();
    if (reduceMotion) draw(false); else loop();
  }

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(start, 200); });
  start();
})();
