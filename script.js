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
