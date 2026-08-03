/**
 * Illustrated scroll-growing root network for the Pando homepage.
 * Draws woody, tapering roots (not thin strokes) that grow and interconnect
 * as the user scrolls — one continuous background under all sections.
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
  let pageH = 3000;
  let startY = 700;
  const MAX_ROOTS = 420;

  const COLORS = {
    fill: '#7A6248',
    fillDeep: '#5C4632',
    edge: '#3F2E22',
    highlight: 'rgba(232, 213, 168, 0.45)',
    fine: '#9A8168',
    bridge: '#6B5340',
    goldJoin: '#C9973D'
  };

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
        // Catmull-Rom-ish blend for organic curves
        const t2 = t * t, t3 = t2 * t;
        const x = 0.5 * ((2 * a.x) + (-p.x + b.x) * t + (2 * p.x - 5 * a.x + 4 * b.x - c.x) * t2 + (-p.x + 3 * a.x - 3 * b.x + c.x) * t3);
        const y = 0.5 * ((2 * a.y) + (-p.y + b.y) * t + (2 * p.y - 5 * a.y + 4 * b.y - c.y) * t2 + (-p.y + 3 * a.y - 3 * b.y + c.y) * t3);
        out.push({ x, y });
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  function buildNetwork() {
    const rand = mulberry32(77);
    roots = [];
    bridges = [];

    pageH = Math.max(document.documentElement.scrollHeight, h * 3);
    const hero = document.querySelector('.hero');
    startY = hero ? hero.offsetHeight - 20 : Math.min(h * 0.9, 720);
    const endY = pageH - 40;

    // Primary trunks — thick woody roots entering from top of content
    const trunkCount = w < 700 ? 3 : 5;
    for (let i = 0; i < trunkCount; i++) {
      const startX = (w / (trunkCount + 1)) * (i + 1) + (rand() - 0.5) * 80;
      const thickness = (w < 700 ? 18 : 26) * (0.85 + rand() * 0.4);
      growRoot(rand, startX, startY, endY, 0, thickness, roots);
    }

    // Mid-page secondary root systems that thicken the network lower down
    const midCount = w < 700 ? 2 : 3;
    for (let i = 0; i < midCount; i++) {
      const sx = 40 + rand() * (w - 80);
      const sy = startY + (endY - startY) * (0.2 + rand() * 0.4);
      growRoot(rand, sx, sy, endY, 0, 10 + rand() * 7, roots);
    }

    // Collect a capped set of joints for interconnection bridges (avoid O(n²) blowups)
    const joints = [];
    roots.forEach(r => {
      r.samples.forEach((p, idx) => {
        if (idx > 0 && idx % 10 === 0) {
          joints.push({ x: p.x, y: p.y });
        }
      });
    });
    // Shuffle-lite and cap
    for (let i = joints.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = joints[i]; joints[i] = joints[j]; joints[j] = tmp;
    }
    const jointCap = Math.min(joints.length, 120);
    const maxBridges = w < 700 ? 40 : 70;
    const maxDist = w < 700 ? 150 : 210;

    for (let i = 0; i < jointCap && bridges.length < maxBridges; i++) {
      const a = joints[i];
      for (let j = i + 1; j < jointCap && bridges.length < maxBridges; j++) {
        const b = joints[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist > 55 && dist < maxDist && Math.abs(a.y - b.y) < 240 && rand() < 0.22) {
          bridges.push({
            points: densify([
              { x: a.x, y: a.y },
              { x: (a.x + b.x) / 2 + (rand() - 0.5) * 40, y: (a.y + b.y) / 2 + (rand() - 0.5) * 30 },
              { x: b.x, y: b.y }
            ], 4),
            startW: 3.5 + rand() * 2.5,
            endW: 1.5 + rand() * 1.5,
            appearY: Math.max(a.y, b.y) + 40
          });
        }
      }
    }

    needsRebuild = false;
  }

  function growRoot(rand, x, y, endY, depth, width, out) {
    if (depth > 3 || width < 2 || out.length >= MAX_ROOTS) return;

    const points = [{ x, y }];
    let cx = x, cy = y;
    const bias = (rand() - 0.5) * 1.1;
    const segs = 4 + Math.floor(rand() * 3) + (depth === 0 ? 2 : 0);

    for (let s = 0; s < segs; s++) {
      const remaining = endY - cy;
      if (remaining < 30) break;
      const step = Math.min(remaining * (0.14 + rand() * 0.2), 110 + rand() * 130);
      // Organic wobble — never straight
      cx += Math.sin(cy * 0.01 + bias * 3) * (18 + depth * 8) + (rand() - 0.5 + bias * 0.35) * (55 + depth * 20);
      cy += step;
      if (cx < 16) cx = 16 + rand() * 30;
      if (cx > w - 16) cx = w - 16 - rand() * 30;
      points.push({ x: cx, y: cy });
    }

    if (points.length < 2) return;

    const samples = densify(points, depth === 0 ? 7 : 5);
    out.push({
      samples,
      startW: width,
      endW: Math.max(1.4, width * 0.2),
      depth,
      startY: points[0].y,
      endY: points[points.length - 1].y
    });

    // Branches — sparse enough to stay illustrated and performant
    if (depth < 2 && out.length < MAX_ROOTS) {
      const chance = depth === 0 ? 0.55 : 0.35;
      for (let i = 1; i < points.length; i++) {
        if (out.length >= MAX_ROOTS) break;
        if (rand() < chance) {
          const bw = width * (0.45 + rand() * 0.25);
          const branchEnd = Math.min(endY, points[i].y + 180 + rand() * 260);
          growRoot(rand, points[i].x, points[i].y, branchEnd, depth + 1, bw, out);
        }
      }
    }

    // Fine tip hairs near ends of deeper roots
    if (depth >= 1 && depth <= 2 && rand() < 0.45 && out.length < MAX_ROOTS) {
      const tip = points[points.length - 1];
      const hairs = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < hairs; k++) {
        if (out.length >= MAX_ROOTS) break;
        const hx = tip.x + (rand() - 0.5) * 55;
        const hy = tip.y + 24 + rand() * 80;
        out.push({
          samples: densify([tip, { x: (tip.x + hx) / 2 + (rand() - 0.5) * 18, y: (tip.y + hy) / 2 }, { x: hx, y: hy }], 4),
          startW: 2.4,
          endW: 0.7,
          depth: depth + 1,
          startY: tip.y,
          endY: hy,
          fine: true
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
      const nx = -dy, ny = dx;
      left.push({ x: slice[i].x + nx * half, y: slice[i].y + ny * half });
      right.push({ x: slice[i].x - nx * half, y: slice[i].y - ny * half });
    }

    // Filled woody body
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();

    if (opts.fine) {
      ctx.fillStyle = COLORS.fine;
      ctx.globalAlpha = 0.55 * Math.min(1, progress * 1.4);
    } else {
      const g = ctx.createLinearGradient(slice[0].x, slice[0].y, slice[slice.length - 1].x, slice[slice.length - 1].y);
      g.addColorStop(0, COLORS.fill);
      g.addColorStop(1, COLORS.fillDeep);
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.88 * Math.min(1, progress * 1.3);
    }
    ctx.fill();

    // Dark bark edge
    ctx.strokeStyle = COLORS.edge;
    ctx.lineWidth = opts.fine ? 0.7 : 1.4;
    ctx.globalAlpha = 0.45 * Math.min(1, progress);
    ctx.stroke();

    // Soft highlight along the spine for illustrated depth
    if (!opts.fine && startW > 6) {
      ctx.beginPath();
      ctx.moveTo(slice[0].x, slice[0].y);
      for (let i = 1; i < slice.length; i++) {
        ctx.lineTo(slice[i].x, slice[i].y);
      }
      ctx.strokeStyle = COLORS.highlight;
      ctx.lineWidth = Math.max(1, startW * 0.18);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.35 * Math.min(1, progress);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  function draw() {
    raf = 0;
    try {
      if (needsRebuild) buildNetwork();

      ctx.clearRect(0, 0, w, h);

      const scrollY = window.scrollY;
      const hero = document.querySelector('.hero');
      const heroH = hero ? hero.offsetHeight : h;

      // Show roots once we leave the hero photo
      if (scrollY > heroH * 0.2) canvas.classList.add('visible');
      else canvas.classList.remove('visible');

      // Growth frontier in document coordinates — roots grow ahead of the viewport
      const growthY = scrollY + h * 0.95;

      ctx.save();
      ctx.translate(0, -scrollY);

      // Draw thicker/deeper roots first so fine ones sit on top
      const ordered = roots.slice().sort((a, b) => a.depth - b.depth);
      let drawn = 0;

      for (let i = 0; i < ordered.length; i++) {
        const r = ordered[i];
        if (growthY < r.startY - 20) continue;
        const span = Math.max(40, r.endY - r.startY);
        const progress = Math.min(1, Math.max(0, (growthY - r.startY) / span));
        if (progress <= 0) continue;
        drawTaperedRoot(r.samples, r.startW, r.endW, progress, { fine: !!r.fine });
        drawn++;
      }

      // Interconnecting bridges — appear as the network densifies
      for (let i = 0; i < bridges.length; i++) {
        const b = bridges[i];
        if (growthY < b.appearY) continue;
        const progress = Math.min(1, (growthY - b.appearY) / 180);
        drawTaperedRoot(b.points, b.startW, b.endW, progress, { fine: false });

        // Small gold join node at midpoint once fully connected
        if (progress > 0.85) {
          const mid = b.points[Math.floor(b.points.length / 2)];
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, 2.8, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.goldJoin;
          ctx.globalAlpha = 0.55 * progress;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();
      window.__rootsDebug = { roots: roots.length, bridges: bridges.length, drawn, scrollY, growthY, startY, visible: canvas.classList.contains('visible') };
    } catch (err) {
      window.__rootsDebug = { error: String(err && err.message || err) };
      console.error('roots-network draw error', err);
    }
  }

  function scheduleDraw() {
    if (!raf) raf = requestAnimationFrame(draw);
  }

  window.addEventListener('scroll', scheduleDraw, { passive: true });
  window.addEventListener('resize', () => { resize(); scheduleDraw(); });
  window.addEventListener('load', () => { needsRebuild = true; scheduleDraw(); });

  resize();
  scheduleDraw();
  setTimeout(() => { needsRebuild = true; scheduleDraw(); }, 600);
  setTimeout(() => { needsRebuild = true; scheduleDraw(); }, 1800);
})();
