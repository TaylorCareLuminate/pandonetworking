/**
 * "Sapling Grove" — scroll-driven background scene for Pando.
 *
 * A young sapling stands in the middle of a grove of towering aspens.
 * As the user scrolls, it grows tall and interlocks branches and roots
 * with its neighbors — one connected organism, like Pando itself.
 * Sky, drifting clouds and a gentle sway animate continuously.
 *
 * The previous scroll-growing roots animation is preserved, unused,
 * in js/roots-network.js in case we want to bring it back.
 */
(function () {
  const canvas = document.getElementById('roots-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let w = 0, h = 0, dpr = 1;
  let horizonY = 0;
  let trees = [];
  let sapling = null;
  let clouds = [];
  let driftLeaves = [];
  let grass = [];
  let treeline = [];
  let pShown = 0;              // eased growth progress (0 = sprout, 1 = fully grown)
  let lastT = performance.now();
  let leafSpawnAt = 0;
  const connectedAt = {};      // connection id -> timestamp of first completion (gold pulse)

  // ── Palette ────────────────────────────────────────────────────────────
  const NAVY_EDGE   = 'rgba(15, 45, 77, 0.48)';
  const BARK_MARK   = 'rgba(15, 45, 77, 0.38)';
  const TRUNK_TOP   = '#F8F5EC';
  const TRUNK_BOT   = '#E0D5BC';
  const GREENS      = ['#6B8A67', '#7FA377', '#93B08B', '#5E7C5B'];
  const ROOT_FILL   = '#D0BFA3';
  const ROOT_DEEP   = '#BDA987';
  const ROOT_EDGE   = 'rgba(140, 124, 94, 0.42)';
  const GOLD        = '#C9973D';

  // ── Small utilities ────────────────────────────────────────────────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const lerp   = (a, b, t) => a + (b - a) * t;
  const clamp01 = t => Math.min(1, Math.max(0, t));
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

  function sampleQuad(p0, p1, p2, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push({
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
      });
    }
    return out;
  }

  function findHeroEl() {
    return document.querySelector('.hero, .connect-hero, .accelerate-hero, [class$="-hero"]');
  }

  /** Tapered organic limb along a polyline, revealed up to `progress`. */
  function drawTapered(samples, w0, w1, progress, style) {
    if (progress <= 0.01 || samples.length < 2) return;
    const count = Math.max(2, Math.round(samples.length * clamp01(progress)));
    const slice = samples.slice(0, count);
    const left = [], right = [];
    for (let i = 0; i < slice.length; i++) {
      const t = i / Math.max(1, samples.length - 1);
      const half = Math.max(0.3, (w0 * (1 - t) + w1 * t) * 0.5);
      const a = slice[Math.max(0, i - 1)], b = slice[Math.min(slice.length - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y;
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

    const g = ctx.createLinearGradient(samples[0].x, samples[0].y,
      samples[samples.length - 1].x, samples[samples.length - 1].y);
    g.addColorStop(0, style.fillA);
    g.addColorStop(1, style.fillB);
    ctx.fillStyle = g;
    ctx.globalAlpha = style.alpha != null ? style.alpha : 0.65;
    ctx.fill();
    if (style.edge) {
      ctx.strokeStyle = style.edge;
      ctx.lineWidth = 1;
      ctx.globalAlpha = (style.alpha != null ? style.alpha : 0.65) * 0.8;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ── Scene construction ─────────────────────────────────────────────────
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildScene();
  }

  function buildScene() {
    const rand = mulberry32(7);
    horizonY = h * 0.74;
    const mobile = w < 700;

    trees = [];
    const slots = mobile ? [0.10, 0.90] : [0.06, 0.22, 0.78, 0.94];
    slots.forEach(fx => {
      const dir = fx < 0.5 ? 1 : -1; // leans/reaches toward center
      trees.push(buildTree(rand, w * fx, h * (0.50 + rand() * 0.10), dir, mobile));
    });

    sapling = buildSapling(rand, mobile);
    buildClouds(rand);

    grass = [];
    const tufts = mobile ? 26 : 54;
    for (let i = 0; i < tufts; i++) {
      grass.push({ x: rand() * w, len: 3 + rand() * 6, lean: (rand() - 0.5) * 4, a: 0.18 + rand() * 0.2 });
    }

    // Distant treeline along the horizon for depth
    treeline = [];
    let tx = -40;
    while (tx < w + 40) {
      const r = 24 + rand() * 52;
      treeline.push({ x: tx, rx: r, ry: r * (0.5 + rand() * 0.35) });
      tx += r * (0.9 + rand() * 0.5);
    }
    driftLeaves = [];
  }

  function buildTree(rand, x, height, dir, mobile) {
    const topY = horizonY - height;
    const baseW = (mobile ? 13 : 18) * (0.9 + rand() * 0.35);
    const curve = dir * (14 + rand() * 22);

    const trunk = sampleQuad(
      { x: x, y: horizonY + 6 },
      { x: x + curve * 0.6, y: horizonY - height * 0.55 },
      { x: x + curve, y: topY },
      26
    );

    // Aspen bark "eyes"
    const marks = [];
    const mCount = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < mCount; i++) {
      marks.push({ t: 0.12 + rand() * 0.72, s: (rand() - 0.5), len: 3 + rand() * 4 });
    }

    // Canopy: a cohesive crown built from three overlapping lobes of
    // large, tightly-packed leaf blobs (big blobs underneath, small on top)
    const lean = dir * height * 0.05;
    const lobes = [
      { dx: lean, dy: -height * 0.17, r: height * 0.21 },
      { dx: lean - height * 0.14, dy: -height * 0.04, r: height * 0.155 },
      { dx: lean + height * 0.14, dy: -height * 0.05, r: height * 0.155 }
    ];
    const leafBlobs = [];
    lobes.forEach(lb => {
      const blobs = mobile ? 10 : 14;
      for (let i = 0; i < blobs; i++) {
        const ang = rand() * Math.PI * 2;
        const rr = Math.sqrt(rand()) * lb.r * 0.72;
        leafBlobs.push({
          dx: lb.dx + Math.cos(ang) * rr,
          dy: lb.dy + Math.sin(ang) * rr * 0.8,
          r: lb.r * (0.34 + rand() * 0.3),
          color: GREENS[Math.floor(rand() * GREENS.length)],
          a: 0.4 + rand() * 0.25,
          ph: rand() * Math.PI * 2
        });
      }
    });
    // Big blobs first so smaller, brighter ones layer on top
    leafBlobs.sort((a, b) => b.r - a.r);

    // Visible upper branches
    const limbs = [];
    for (let i = 0; i < 3; i++) {
      const t0 = 0.68 + rand() * 0.22;
      const p0 = trunk[Math.floor(t0 * (trunk.length - 1))];
      const s = rand() < 0.5 ? 1 : -1;
      const len = height * (0.14 + rand() * 0.12);
      limbs.push(sampleQuad(
        p0,
        { x: p0.x + s * len * 0.5, y: p0.y - len * 0.45 },
        { x: p0.x + s * len, y: p0.y - len * (0.6 + rand() * 0.3) },
        10
      ));
    }

    // Inner branch tip — where the sapling's reach branches will interlock
    const innerTip = {
      x: x + dir * height * (0.30 + rand() * 0.08),
      y: topY + height * (0.16 + rand() * 0.10)
    };

    // Mature roots below ground; the innermost tips await the sapling
    const roots = [];
    const rCount = 3 + Math.floor(rand() * 2);
    let innerRootTip = null;
    for (let i = 0; i < rCount; i++) {
      const f = i / (rCount - 1);              // 0 = most inward, 1 = most outward
      const spread = lerp(dir * (60 + rand() * 90), -dir * (50 + rand() * 70), f);
      const depth = h * (0.07 + rand() * 0.12);
      const path = sampleQuad(
        { x: x, y: horizonY + 2 },
        { x: x + spread * 0.55, y: horizonY + depth * 0.45 },
        { x: x + spread, y: horizonY + depth },
        16
      );
      roots.push({ path, w0: baseW * 0.55, w1: 2 });
      if (i === 0) innerRootTip = path[path.length - 1];
    }

    return { x, topY, height, dir, baseW, trunk, marks, leafBlobs, limbs, innerTip, roots, innerRootTip, ph: rand() * Math.PI * 2 };
  }

  function nearestTreeOnSide(side, nth) {
    // side: -1 = left of sapling, +1 = right. nth: 0 = innermost.
    const cx = w / 2;
    const group = trees.filter(t => (side < 0 ? t.x < cx : t.x > cx))
      .sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx));
    return group[Math.min(nth, group.length - 1)] || null;
  }

  function buildSapling(rand, mobile) {
    const Hf = h * 0.52;
    const branches = [];

    // Ordinary branches — appear as the trunk passes their height
    const hFracs = [0.34, 0.46, 0.58, 0.70, 0.82, 0.92];
    hFracs.forEach((hf, i) => {
      [-1, 1].forEach(s => {
        branches.push({
          side: s,
          hf: clamp01(hf + (rand() - 0.5) * 0.05),
          len: Hf * (0.20 - hf * 0.08 + rand() * 0.07),
          rise: 0.45 + rand() * 0.4,
          reach: false,
          wob: rand() * Math.PI * 2
        });
      });
    });

    // Reach branches — grow far and interlock with the neighboring trees
    // (birth + 0.32 growth window must stay under 1.0 so they complete)
    const reachDefs = mobile ? [[0.58, 0]] : [[0.52, 0], [0.66, 1]];
    reachDefs.forEach(([hf, nth], i) => {
      [-1, 1].forEach(s => {
        branches.push({ side: s, hf, nth, reach: true, id: 'branch:' + s + ':' + i });
      });
    });

    // Roots — birth thresholds stagger the underground story
    const roots = [];
    const rdefs = mobile
      ? [[-1, 0.18], [1, 0.22], [0, 0.30]]
      : [[-1, 0.15], [1, 0.19], [-0.45, 0.30], [0.45, 0.34], [0, 0.26]];
    rdefs.forEach(([dirF, birth], i) => {
      roots.push({
        dirF,
        birth,
        id: 'root:' + i,
        depth: h * (0.08 + rand() * 0.09),
        spread: dirF * (w * (mobile ? 0.10 : 0.07) + 40 + rand() * 60),
        bridge: Math.abs(dirF) >= 0.45,
        wig: (rand() - 0.5) * 40
      });
    });

    return { x: w / 2, Hf, branches, roots, ph: rand() * Math.PI * 2 };
  }

  function buildClouds(rand) {
    clouds = [];
    const layers = [
      { n: w < 700 ? 3 : 5, scale: 0.55, speed: 7, alpha: 0.45, yMax: 0.28 },
      { n: w < 700 ? 2 : 4, scale: 1.0, speed: 15, alpha: 0.6, yMax: 0.42 }
    ];
    layers.forEach((L, li) => {
      for (let i = 0; i < L.n; i++) {
        const puffs = [];
        const pc = 5 + Math.floor(rand() * 3);
        for (let k = 0; k < pc; k++) {
          puffs.push({
            dx: (k - pc / 2) * (18 + rand() * 14),
            dy: (rand() - 0.5) * 14 - (Math.abs(k - pc / 2) < 1.2 ? 8 : 0),
            r: 16 + rand() * 18
          });
        }
        clouds.push({
          x: rand() * (w + 300) - 150,
          y: h * (0.04 + rand() * L.yMax),
          scale: L.scale * (0.8 + rand() * 0.5),
          speed: L.speed * (0.75 + rand() * 0.6),
          alpha: L.alpha * (0.8 + rand() * 0.35),
          puffs, layer: li
        });
      }
    });
  }

  // ── Painting ───────────────────────────────────────────────────────────
  function paintSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, '#DFEBF1');
    sky.addColorStop(0.55, '#EBEEE5');
    sky.addColorStop(1, '#F3EEE4');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizonY);

    // Soft sun glow
    const sx = w * 0.80, sy = h * 0.13, sr = h * 0.30;
    const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sun.addColorStop(0, 'rgba(255, 243, 209, 0.55)');
    sun.addColorStop(1, 'rgba(255, 243, 209, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);

    // Ground
    const gnd = ctx.createLinearGradient(0, horizonY, 0, h);
    gnd.addColorStop(0, '#EFE7D6');
    gnd.addColorStop(1, '#E5DAC1');
    ctx.fillStyle = gnd;
    ctx.fillRect(0, horizonY, w, h - horizonY);
  }

  function paintClouds(dt) {
    clouds.forEach(c => {
      c.x += c.speed * dt;
      const width = 90 * c.scale;
      if (c.x - width > w + 60) { c.x = -width - 60; }
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(c.scale, c.scale * 0.82);
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      c.puffs.forEach(p => {
        ctx.moveTo(p.dx + p.r, p.dy);
        ctx.arc(p.dx, p.dy, p.r, 0, Math.PI * 2);
      });
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    });
  }

  function paintTreeline() {
    ctx.fillStyle = 'rgba(147, 176, 139, 0.16)';
    ctx.beginPath();
    treeline.forEach(b => {
      ctx.moveTo(b.x + b.rx, horizonY);
      ctx.ellipse(b.x, horizonY, b.rx, b.ry, 0, Math.PI, 0);
    });
    ctx.fill();
  }

  function paintHorizon() {
    ctx.strokeStyle = 'rgba(94, 124, 91, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();
    grass.forEach(gr => {
      ctx.strokeStyle = 'rgba(94, 124, 91, ' + gr.a + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gr.x, horizonY);
      ctx.lineTo(gr.x + gr.lean, horizonY - gr.len);
      ctx.stroke();
    });
  }

  function paintTree(tree, now) {
    const sway = Math.sin(now / 2400 + tree.ph) * 3;

    // Roots (mature, always fully grown)
    tree.roots.forEach(r => {
      drawTapered(r.path, r.w0, r.w1, 1, { fillA: ROOT_FILL, fillB: ROOT_DEEP, edge: ROOT_EDGE, alpha: 0.55 });
    });

    // Trunk
    drawTapered(tree.trunk, tree.baseW, tree.baseW * 0.3, 1,
      { fillA: TRUNK_BOT, fillB: TRUNK_TOP, edge: NAVY_EDGE, alpha: 0.92 });

    // Bark eyes
    ctx.fillStyle = BARK_MARK;
    tree.marks.forEach(m => {
      const p = tree.trunk[Math.floor(m.t * (tree.trunk.length - 1))];
      const halfW = tree.baseW * (1 - m.t * 0.6) * 0.5;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.ellipse(p.x + m.s * halfW * 0.6, p.y, m.len, 1.6, m.s * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Upper limbs
    tree.limbs.forEach(l => {
      drawTapered(l, tree.baseW * 0.28, 1.2, 1, { fillA: TRUNK_BOT, fillB: TRUNK_TOP, edge: NAVY_EDGE, alpha: 0.7 });
    });

    // Canopy
    const cx = tree.trunk[tree.trunk.length - 1].x;
    const cy = tree.trunk[tree.trunk.length - 1].y;
    tree.leafBlobs.forEach(b => {
      const wob = Math.sin(now / 1900 + b.ph) * 1.6;
      ctx.fillStyle = b.color;
      ctx.globalAlpha = b.a;
      ctx.beginPath();
      ctx.ellipse(cx + b.dx + sway + wob, cy + b.dy, b.r, b.r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  /** Register a completed connection once and paint its gold node + pulse. */
  function paintConnection(id, x, y, now) {
    if (!connectedAt[id]) connectedAt[id] = now;
    const age = (now - connectedAt[id]) / 1000;

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = GOLD;
    ctx.globalAlpha = 0.75;
    ctx.fill();

    if (age < 1.8) {
      const t = age / 1.8;
      ctx.beginPath();
      ctx.arc(x, y, 4 + t * 22, 0, Math.PI * 2);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2 * (1 - t);
      ctx.globalAlpha = 0.5 * (1 - t);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function paintSapling(now) {
    const s = sapling;
    const g = 0.08 + 0.92 * pShown;         // trunk growth: 8% -> 100% of final height
    const Hcur = s.Hf * g;
    const topY = horizonY - Hcur;
    const sway = Math.sin(now / 1700 + s.ph) * (5 - 3 * pShown);

    // Trunk polyline (recomputed each frame — the sapling is alive)
    const N = 18;
    const trunk = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const bend = Math.sin(t * Math.PI * 0.9) * 6 * (1 - pShown * 0.6);
      trunk.push({
        x: s.x + bend + sway * Math.pow(t, 1.6),
        y: horizonY + 4 - (Hcur + 4) * t
      });
    }
    const w0 = 3.5 + 9 * pShown;

    // ── Roots first (under everything the trunk overlaps) ──
    s.roots.forEach(r => {
      const q = smooth((pShown - r.birth) / 0.30);
      if (q <= 0) return;
      const path = sampleQuad(
        { x: s.x, y: horizonY + 2 },
        { x: s.x + r.spread * 0.4 + r.wig, y: horizonY + r.depth * 0.5 },
        { x: s.x + r.spread, y: horizonY + r.depth },
        16
      );
      drawTapered(path, w0 * 0.6, 1.6, q, { fillA: ROOT_FILL, fillB: ROOT_DEEP, edge: ROOT_EDGE, alpha: 0.55 });

      // Bridge onward to the neighboring tree's inner root
      if (r.bridge && q >= 1) {
        const tree = nearestTreeOnSide(r.dirF < 0 ? -1 : 1, 0);
        if (tree && tree.innerRootTip) {
          const from = path[path.length - 1];
          const to = tree.innerRootTip;
          const bq = smooth((pShown - r.birth - 0.28) / 0.30);
          if (bq > 0) {
            const bridge = sampleQuad(
              from,
              { x: (from.x + to.x) / 2, y: Math.max(from.y, to.y) + 26 },
              to, 18
            );
            drawTapered(bridge, 3.4, 2, bq, { fillA: ROOT_FILL, fillB: ROOT_DEEP, edge: ROOT_EDGE, alpha: 0.5 });
            if (bq >= 1) paintConnection(r.id, to.x, to.y, now);
          }
        }
      }
    });

    // Center root goes deep and meets nothing — it anchors
    // (handled above via rdefs dirF 0, bridge=false)

    // ── Trunk ──
    drawTapered(trunk, w0, Math.max(1.2, w0 * 0.25), 1,
      { fillA: '#E3DCC6', fillB: '#F6F3E8', edge: 'rgba(94, 124, 91, 0.45)', alpha: 0.85 });

    const trunkPointAt = hf => {
      // point on trunk at fraction hf of FINAL height (only valid when grown past it)
      const t = clamp01((s.Hf * hf) / Math.max(1, Hcur));
      const idx = Math.min(N, Math.floor(t * N));
      return trunk[idx];
    };

    // ── Branches ──
    s.branches.forEach(br => {
      if (br.reach) return;
      if (g <= br.hf + 0.01) return;
      const q = smooth((g - br.hf) / 0.14);
      const A = trunkPointAt(br.hf);
      const len = br.len * q;
      const tip = {
        x: A.x + br.side * len,
        y: A.y - len * br.rise
      };
      const path = sampleQuad(A, { x: A.x + br.side * len * 0.5, y: A.y - len * br.rise * 0.3 }, tip, 8);
      drawTapered(path, Math.max(1.4, w0 * 0.4 * q), 0.8, 1,
        { fillA: '#E3DCC6', fillB: '#F6F3E8', edge: 'rgba(94, 124, 91, 0.4)', alpha: 0.75 });

      // Leaf cluster at the tip
      if (q > 0.35) {
        const cr = (6 + 15 * q) * (0.7 + 0.5 * pShown);
        paintLeafCluster(tip.x, tip.y - 2, cr, q, now, br.wob);
      }
    });

    // Crown cluster
    if (g > 0.12) {
      const crownR = 8 + 34 * pShown;
      paintLeafCluster(trunk[N].x, trunk[N].y - 4, crownR, Math.min(1, g * 2), now, s.ph);
    }

    // ── Reach branches: interlock with the neighbors ──
    s.branches.forEach(br => {
      if (!br.reach) return;
      const birth = br.hf; // reach branches wake when the trunk passes their height
      if (g <= birth + 0.02) return;
      const tree = nearestTreeOnSide(br.side, br.nth || 0);
      if (!tree) return;

      const A = trunkPointAt(br.hf);
      const target = tree.innerTip;
      const q = smooth((pShown - birth) / 0.32);
      if (q <= 0) return;

      const midX = lerp(A.x, target.x, 0.5) + br.side * 20;
      const midY = Math.min(A.y, target.y) - 34;
      const path = sampleQuad(A, { x: midX, y: midY }, target, 26);
      drawTapered(path, Math.max(1.6, w0 * 0.42), 1, q,
        { fillA: '#E3DCC6', fillB: '#F6F3E8', edge: 'rgba(94, 124, 91, 0.42)', alpha: 0.7 });

      // The tree answers — a short branch reaching back to meet it
      if (q > 0.5) {
        const answer = smooth((q - 0.5) / 0.5);
        const from = { x: target.x + br.side * -46, y: target.y - 20 };
        const back = sampleQuad(from, { x: (from.x + target.x) / 2, y: target.y - 26 }, target, 10);
        drawTapered(back, 3, 1, answer, { fillA: TRUNK_BOT, fillB: TRUNK_TOP, edge: NAVY_EDGE, alpha: 0.6 });
      }

      // Interlocked!
      if (q >= 1) {
        // Entwine curl at the meeting point
        ctx.beginPath();
        ctx.arc(target.x, target.y, 6, Math.PI * 0.2, Math.PI * 1.6);
        ctx.strokeStyle = 'rgba(94, 124, 91, 0.5)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        paintConnection(br.id, target.x, target.y, now);
        // Young leaves burst where they meet
        paintLeafCluster(target.x, target.y - 6, 12, 1, now, br.side * 2.1);
      }
    });
  }

  function paintLeafCluster(x, y, r, alphaScale, now, phase) {
    if (r < 2) return;
    const blobs = Math.max(4, Math.min(9, Math.round(r / 4)));
    for (let i = 0; i < blobs; i++) {
      const ang = (i / blobs) * Math.PI * 2 + phase;
      const rr = r * (0.35 + 0.55 * ((i * 2654435761 % 97) / 97));
      const wob = Math.sin(now / 1600 + phase + i) * 1.4;
      ctx.fillStyle = GREENS[i % GREENS.length];
      ctx.globalAlpha = 0.42 * alphaScale;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(ang) * rr + wob, y + Math.sin(ang) * rr * 0.7, r * 0.42, r * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function updateDriftLeaves(now, dt) {
    if (now > leafSpawnAt && driftLeaves.length < 6 && trees.length) {
      leafSpawnAt = now + 2600 + Math.random() * 3200;
      const tree = trees[Math.floor(Math.random() * trees.length)];
      const top = tree.trunk[tree.trunk.length - 1];
      driftLeaves.push({
        x: top.x + (Math.random() - 0.5) * tree.height * 0.4,
        y: top.y + (Math.random() - 0.3) * tree.height * 0.2,
        vx: 12 + Math.random() * 18,
        vy: 10 + Math.random() * 12,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 2.4,
        size: 3 + Math.random() * 2.5,
        gold: Math.random() < 0.45
      });
    }
    for (let i = driftLeaves.length - 1; i >= 0; i--) {
      const L = driftLeaves[i];
      L.x += (L.vx + Math.sin(now / 700 + L.rot) * 9) * dt;
      L.y += L.vy * dt;
      L.rot += L.vr * dt;
      if (L.y > horizonY + 10 || L.x > w + 30 || L.x < -30) { driftLeaves.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(L.x, L.y);
      ctx.rotate(L.rot);
      ctx.fillStyle = L.gold ? GOLD : GREENS[1];
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, L.size, L.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // ── Main loop ──────────────────────────────────────────────────────────
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    try {
      const scrollY = window.scrollY;
      const hero = findHeroEl();
      const heroH = hero ? hero.offsetHeight : h;

      if (scrollY > heroH * 0.2) canvas.classList.add('visible');
      else canvas.classList.remove('visible');

      // Growth progress: 0 just past the hero, 1 at the bottom of the page
      const docH = document.documentElement.scrollHeight;
      const denom = Math.max(1, docH - h - heroH * 0.35);
      const target = clamp01((scrollY - heroH * 0.35) / denom);
      pShown += (target - pShown) * Math.min(1, dt * 3.2);
      if (Math.abs(target - pShown) < 0.0004) pShown = target;

      // Skip painting entirely while the canvas is faded out
      if (!canvas.classList.contains('visible') && scrollY < heroH * 0.1) {
        window.__groveDebug = { hidden: true, pShown, scrollY };
        return;
      }

      ctx.clearRect(0, 0, w, h);
      paintSky();
      paintClouds(dt);
      paintTreeline();
      paintHorizon();
      trees.forEach(t => paintTree(t, now));
      paintSapling(now);
      updateDriftLeaves(now, dt);

      window.__groveDebug = {
        pShown: +pShown.toFixed(3), target: +target.toFixed(3),
        trees: trees.length, clouds: clouds.length,
        connections: Object.keys(connectedAt).length,
        visible: canvas.classList.contains('visible')
      };
    } catch (err) {
      window.__groveDebug = { error: String(err && err.message || err) };
      console.error('sapling-grove draw error', err);
    }
  }

  window.addEventListener('resize', resize);
  window.addEventListener('load', () => resize());

  resize();
  requestAnimationFrame(frame);
})();
