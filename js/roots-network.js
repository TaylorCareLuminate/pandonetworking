/**
 * Illustrated scroll-growing root network for the Pando homepage.
 * Soft, light woody roots that taper organically, run the FULL length of the
 * page, and interconnect as the user scrolls — one continuous background.
 */
(function () {
  const canvas = document.getElementById('roots-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let w = 0, h = 0, dpr = 1;
  let roots = [];
  let bridges = [];
  let raf = 0;
  let needsRebuild = true;
  let builtPageH = 0;
  let startY = 700;
  const MAX_ROOTS = 950;

  // Light, dignified palette — warm parchment-friendly taupes with sage accents
  const PALETTES = [
    { fill: '#D3C3AB', deep: '#C2AF94', edge: 'rgba(146, 126, 100, 0.45)' },  // light taupe
    { fill: '#CFC2A6', deep: '#BCAC8D', edge: 'rgba(140, 124, 94, 0.42)' },   // warm sand
    { fill: '#C5C2A8', deep: '#AFAC8E', edge: 'rgba(125, 122, 95, 0.4)' }     // sage-tinted
  ];
  const HIGHLIGHT = 'rgba(255, 252, 244, 0.55)';
  const FINE = '#CDBFA6';
  const GOLD = '#C9973D';

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    needsRebuild = true;
  }

  function densify(points, perSeg) {
    if (points.length < 2) return points.slice();
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const c = points[Math.min(points.length - 1, i + 2)];
      const p = points[Math.max(0, i - 1)];
      for (let s = 0; s < perSeg; s++) {
        const t = s / perSeg;
        const t2 = t * t, t3 = t2 * t;
        const x = 0.5 * ((2 * a.x) + (-p.x + b.x) * t + (2 * p.x - 5 * a.x + 4 * b.x - c.x) * t2 + (-p.x + 3 * a.x - 3 * b.x + c.x) * t3);
        const y = 0.5 * ((2 * a.y) + (-p.y + b.y) * t + (2 * p.y - 5 * a.y + 4 * b.y - c.y) * t2 + (-p.y + 3 * a.y - 3 * b.y + c.y) * t3);
        out.push({ x, y });
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  function pageHeight() {
    return Math.max(document.documentElement.scrollHeight, h * 2);
  }

  // Different pages name their top banner section differently
  // (.hero, .connect-hero, .accelerate-hero, ...) — find whichever exists.
  function findHeroEl() {
    return document.querySelector('.hero, .connect-hero, .accelerate-hero, [class$="-hero"]');
  }

  function buildNetwork() {
    const rand = mulberry32(2024);
    roots = [];
    bridges = [];

    builtPageH = pageHeight();
    const hero = findHeroEl();
    startY = hero ? hero.offsetHeight - 30 : Math.min(h * 0.9, 720);
    const endY = builtPageH - 30;

    // Primary trunks — travel the ENTIRE page, top of content to footer
    const trunkCount = w < 700 ? 4 : 6;
    for (let i = 0; i < trunkCount; i++) {
      const startX = (w / (trunkCount + 1)) * (i + 1) + (rand() - 0.5) * 100;
      const thickness = (w < 700 ? 15 : 22) * (0.85 + rand() * 0.4);
      growRoot(rand, startX, startY, endY, 0, thickness, roots, true);
    }

    // Extra systems joining mid-page and lower — density builds as you descend
    const midCount = w < 700 ? 4 : 8;
    for (let i = 0; i < midCount; i++) {
      const sx = 40 + rand() * (w - 80);
      const sy = startY + (endY - startY) * (0.2 + rand() * 0.6);
      growRoot(rand, sx, sy, endY, 1, 10 + rand() * 6, roots, true);
    }

    const pageSpan = Math.max(1, endY - startY);

    // Long lateral runners — near-horizontal roots weaving across the page,
    // concentrated in the lower half where the network is most mature
    const runnerCount = w < 700 ? 5 : 9;
    for (let i = 0; i < runnerCount; i++) {
      const t = 0.35 + (i / runnerCount) * 0.62 + (rand() - 0.5) * 0.06; // biased low
      const yBase = startY + pageSpan * Math.min(0.97, t);
      const leftToRight = rand() < 0.5;
      const x0 = leftToRight ? rand() * w * 0.15 : w - rand() * w * 0.15;
      const x1 = leftToRight ? w - rand() * w * 0.12 : rand() * w * 0.12;
      const pts = [];
      const n = 6 + Math.floor(rand() * 3);
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        pts.push({
          x: x0 + (x1 - x0) * f,
          y: yBase + Math.sin(f * Math.PI * (1.5 + rand())) * (50 + rand() * 70) + (rand() - 0.5) * 40
        });
      }
      const width = 5 + t * 7 + rand() * 3;
      const ys = pts.map(p => p.y);
      roots.push({
        samples: densify(pts, 5),
        startW: width,
        endW: width * (0.6 + rand() * 0.3),
        depth: 1,
        startY: Math.min.apply(null, ys),
        endY: Math.max.apply(null, ys) + 100,
        palette: Math.floor(rand() * PALETTES.length)
      });
    }

    // Joints for interconnection bridges — sampled densely low on the page
    const joints = [];
    roots.forEach(r => {
      r.samples.forEach((p, idx) => {
        if (idx === 0) return;
        const depthT = Math.min(1, Math.max(0, (p.y - startY) / pageSpan));
        const every = depthT > 0.55 ? 6 : 12;
        if (idx % every === 0) joints.push({ x: p.x, y: p.y });
      });
    });
    for (let i = joints.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = joints[i]; joints[i] = joints[j]; joints[j] = tmp;
    }
    const jointCap = Math.min(joints.length, 550);
    const maxBridges = w < 700 ? 170 : 320;

    const jointUse = new Array(jointCap).fill(0);
    for (let i = 0; i < jointCap && bridges.length < maxBridges; i++) {
      const a = joints[i];
      for (let j = i + 1; j < jointCap && bridges.length < maxBridges; j++) {
        // Cap connections per joint — avoids artificial "starburst" hubs
        if (jointUse[i] >= 3) break;
        if (jointUse[j] >= 3) continue;
        const b = joints[j];
        const depthT = Math.min(1, Math.max(0, ((a.y + b.y) / 2 - startY) / pageSpan));
        // Reach and likelihood of connection both grow with depth —
        // by the bottom the network is dramatically interconnected
        const maxDist = (w < 700 ? 150 : 210) + depthT * (w < 700 ? 130 : 220);
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist <= 60 || dist >= maxDist || Math.abs(a.y - b.y) >= 320) continue;
        if (rand() < 0.06 + depthT * depthT * 0.85) {
          bridges.push({
            points: densify([
              { x: a.x, y: a.y },
              { x: (a.x + b.x) / 2 + (rand() - 0.5) * 46, y: (a.y + b.y) / 2 + (rand() - 0.5) * 34 },
              { x: b.x, y: b.y }
            ], 4),
            startW: 3 + depthT * 3.5 + rand() * 2,
            endW: 1.6 + depthT * 2 + rand() * 1.2,
            appearY: Math.max(a.y, b.y) + 50,
            palette: Math.floor(rand() * PALETTES.length)
          });
          jointUse[i]++;
          jointUse[j]++;
        }
      }
    }

    needsRebuild = false;
  }

  /**
   * Grows one root. When fullLength is true the root keeps stepping until it
   * reaches endY (so trunks span the whole document, however long it is).
   */
  function growRoot(rand, x, y, endY, depth, width, out, fullLength) {
    if (depth > 3 || width < 2 || out.length >= MAX_ROOTS) return;

    const points = [{ x, y }];
    let cx = x, cy = y;
    const bias = (rand() - 0.5) * 1.1;
    const maxPoints = fullLength ? 220 : 4 + Math.floor(rand() * 4);
    const laneCenter = x; // trunks meander around their lane rather than drifting off

    while (points.length < maxPoints) {
      const remaining = endY - cy;
      if (remaining < 40) break;
      const step = fullLength
        ? Math.min(remaining, 130 + rand() * 150)
        : Math.min(remaining * (0.2 + rand() * 0.25), 120 + rand() * 130);
      const pull = fullLength ? (laneCenter - cx) * 0.12 : 0;
      cx += pull + Math.sin(cy * 0.008 + bias * 3) * (16 + depth * 7) + (rand() - 0.5 + bias * 0.25) * (60 + depth * 18);
      cy += step;
      if (cx < 14) cx = 14 + rand() * 36;
      if (cx > w - 14) cx = w - 14 - rand() * 36;
      points.push({ x: cx, y: cy });
    }

    if (points.length < 2) return;

    const samples = densify(points, depth === 0 ? 6 : 5);
    out.push({
      samples,
      startW: width,
      // Trunks GAIN girth as they descend (the network matures with depth);
      // short branches still taper away to a point
      endW: fullLength ? width * 1.5 : Math.max(1.6, width * 0.22),
      depth,
      startY: points[0].y,
      endY: points[points.length - 1].y,
      palette: Math.floor(rand() * PALETTES.length)
    });

    // Branches — sparse near the top, splitting aggressively further down.
    // depthT is position down the WHOLE page, so even sub-branches keep
    // multiplying near the footer.
    if (depth < 3 && out.length < MAX_ROOTS) {
      const every = fullLength ? 3 : 2;             // consider every Nth point
      const base = depth === 0 ? 0.4 : 0.32;
      const pageSpan = Math.max(1, builtPageH - startY);
      for (let i = 2; i < points.length; i += every) {
        if (out.length >= MAX_ROOTS) break;
        const depthT = Math.min(1, Math.max(0, (points[i].y - startY) / pageSpan));
        if (rand() < base * (0.4 + depthT * 2.1)) {
          const bw = width * (0.45 + rand() * 0.25);
          const reach = (200 + rand() * 320) * (1 + depthT * 0.8);
          const branchEnd = Math.min(endY, points[i].y + reach);
          growRoot(rand, points[i].x, points[i].y, branchEnd, depth + 1, bw, out, false);
        }
      }
    }

    // Fine root hairs at branch tips
    if (depth >= 1 && rand() < 0.5 && out.length < MAX_ROOTS) {
      const tip = points[points.length - 1];
      const hairs = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < hairs; k++) {
        if (out.length >= MAX_ROOTS) break;
        const hx = tip.x + (rand() - 0.5) * 60;
        const hy = tip.y + 26 + rand() * 90;
        out.push({
          samples: densify([tip, { x: (tip.x + hx) / 2 + (rand() - 0.5) * 20, y: (tip.y + hy) / 2 }, { x: hx, y: hy }], 4),
          startW: 2.2,
          endW: 0.7,
          depth: depth + 1,
          startY: tip.y,
          endY: hy,
          fine: true,
          palette: 0
        });
      }
    }
  }

  function drawTaperedRoot(samples, startW, endW, progress, opts) {
    if (progress <= 0.01 || samples.length < 2) return;
    const count = Math.max(2, Math.floor(samples.length * Math.min(1, progress)));
    const slice = samples.slice(0, count);

    const left = [];
    const right = [];
    for (let i = 0; i < slice.length; i++) {
      const t = i / Math.max(1, samples.length - 1);
      const half = (startW * (1 - t) + endW * t) * 0.5;
      const p0 = slice[Math.max(0, i - 1)];
      const p1 = slice[Math.min(slice.length - 1, i + 1)];
      let dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      left.push({ x: slice[i].x - dy * half, y: slice[i].y + dx * half });
      right.push({ x: slice[i].x + dy * half, y: slice[i].y - dx * half });
    }

    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();

    const pal = PALETTES[opts.palette || 0];
    // Fade in over the first ~250px of growth (absolute, not relative to total
    // length — trunks span thousands of px and must not stay translucent)
    const grownPx = progress * (opts.span || 400);
    const reveal = Math.min(1, grownPx / 250);

    if (opts.fine) {
      ctx.fillStyle = FINE;
      ctx.globalAlpha = 0.4 * reveal;
      ctx.fill();
    } else {
      const g = ctx.createLinearGradient(slice[0].x, slice[0].y, slice[slice.length - 1].x, slice[slice.length - 1].y);
      g.addColorStop(0, pal.fill);
      g.addColorStop(1, pal.deep);
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.62 * reveal;
      ctx.fill();

      // Delicate bark edge
      ctx.strokeStyle = pal.edge;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5 * reveal;
      ctx.stroke();

      // Cream highlight along the spine for illustrated volume
      if (startW > 6) {
        ctx.beginPath();
        ctx.moveTo(slice[0].x, slice[0].y);
        for (let i = 1; i < slice.length; i++) ctx.lineTo(slice[i].x, slice[i].y);
        ctx.strokeStyle = HIGHLIGHT;
        ctx.lineWidth = Math.max(1, startW * 0.22);
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.4 * reveal;
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }

  function draw() {
    raf = 0;
    try {
      // Rebuild if the document grew (partials/images loaded after first build)
      if (needsRebuild || Math.abs(pageHeight() - builtPageH) > 400) buildNetwork();

      ctx.clearRect(0, 0, w, h);

      const scrollY = window.scrollY;
      const hero = findHeroEl();
      const heroH = hero ? hero.offsetHeight : h;

      if (scrollY > heroH * 0.2) canvas.classList.add('visible');
      else canvas.classList.remove('visible');

      // Growth frontier — roots grow slightly ahead of the viewport bottom
      const growthY = scrollY + h * 1.05;

      ctx.save();
      ctx.translate(0, -scrollY);

      const viewTop = scrollY - 200;
      const viewBottom = scrollY + h + 200;
      const ordered = roots.slice().sort((a, b) => a.depth - b.depth);
      let drawn = 0;

      for (let i = 0; i < ordered.length; i++) {
        const r = ordered[i];
        // Skip roots entirely outside the visible window (with margin)
        if (r.endY < viewTop || r.startY > viewBottom) continue;
        if (growthY < r.startY - 20) continue;
        const span = Math.max(40, r.endY - r.startY);
        const progress = Math.min(1, Math.max(0, (growthY - r.startY) / span));
        if (progress <= 0) continue;
        drawTaperedRoot(r.samples, r.startW, r.endW, progress, { fine: !!r.fine, palette: r.palette, span: span });
        drawn++;
      }

      for (let i = 0; i < bridges.length; i++) {
        const b = bridges[i];
        if (growthY < b.appearY) continue;
        const mid = b.points[Math.floor(b.points.length / 2)];
        if (mid.y < viewTop - 100 || mid.y > viewBottom + 100) continue;
        const progress = Math.min(1, (growthY - b.appearY) / 200);
        drawTaperedRoot(b.points, b.startW, b.endW, progress, { fine: false, palette: b.palette, span: 300 });

        if (progress > 0.85) {
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = GOLD;
          ctx.globalAlpha = 0.5 * progress;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();
      window.__rootsDebug = { roots: roots.length, bridges: bridges.length, drawn, scrollY, growthY, startY, pageH: builtPageH, visible: canvas.classList.contains('visible') };
    } catch (err) {
      window.__rootsDebug = { error: String(err && err.message || err) };
      console.error('roots-network draw error', err);
    }
  }

  function scheduleDraw() {
    if (raf) return;
    raf = requestAnimationFrame(draw);
    // Fallback: rAF is throttled/paused in hidden tabs — keep growth in sync anyway
    setTimeout(function () {
      if (raf) { cancelAnimationFrame(raf); draw(); }
    }, 150);
  }

  window.addEventListener('scroll', scheduleDraw, { passive: true });
  window.addEventListener('resize', () => { resize(); scheduleDraw(); });
  window.addEventListener('load', () => { needsRebuild = true; scheduleDraw(); });

  resize();
  scheduleDraw();
  setTimeout(() => { needsRebuild = true; scheduleDraw(); }, 600);
  setTimeout(() => { needsRebuild = true; scheduleDraw(); }, 1800);
})();
