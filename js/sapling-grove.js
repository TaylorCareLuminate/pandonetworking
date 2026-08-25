/**
 * "Sapling Grove" — scroll-driven background scene for Pando.
 *
 * A young sapling stands in the middle of a grove of towering aspens.
 * As the user scrolls, it grows into by far the largest, most connected
 * tree in the grove — interlocking twisting branches and roots with its
 * neighbors, one organism, like Pando itself.
 * Sky, drifting clouds, birds, falling leaves and a gentle sway animate
 * continuously.
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
  let birds = [];
  let grass = [];
  let treeline = [];
  let pShown = 0;              // eased growth progress (0 = sprout, 1 = fully grown)
  let lastT = performance.now();
  let leafSpawnAt = 0;
  let birdSpawnAt = 0;
  const connectedAt = {};      // connection id -> timestamp of first completion (gold pulse)

  // ── Palette ────────────────────────────────────────────────────────────
  const NAVY_EDGE   = 'rgba(18, 49, 76, 0.48)';
  const BARK_MARK   = 'rgba(18, 49, 76, 0.38)';
  const TRUNK_TOP   = '#F8F5EC';
  const TRUNK_BOT   = '#E0D5BC';
  const SAPLING_A   = '#E3DCC6';
  const SAPLING_B   = '#F6F3E8';
  const SAPLING_EDGE = 'rgba(94, 124, 91, 0.45)';
  const GREENS      = ['#4E6E4A', '#6B8A67', '#94AD82', '#7FA377'];
  const LEAF_COLORS = ['#7FA377', '#94AD82', '#B9A77E', '#A9B183', '#6B8A67'];
  const ROOT_FILL   = '#D0BFA3';
  const ROOT_DEEP   = '#BDA987';
  const ROOT_EDGE   = 'rgba(140, 124, 94, 0.42)';
  const GOLD        = '#B9A77E';

  // ── Small utilities ────────────────────────────────────────────────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const lerp    = (a, b, t) => a + (b - a) * t;
  const clamp01 = t => Math.min(1, Math.max(0, t));
  const smooth  = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

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

  /**
   * Organic twist: displaces a polyline perpendicular to its direction with
   * two layered sine waves. Anchored at the start (joint), free at the tip.
   */
  function addTwist(samples, tw) {
    if (!tw || !tw.amp) return samples;
    const n = samples.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const a = samples[Math.max(0, i - 1)], b = samples[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const env = smooth(t / 0.18);
      const d = (Math.sin(t * tw.f1 + tw.p1) + 0.6 * Math.sin(t * tw.f2 + tw.p2)) * tw.amp * env;
      out.push({ x: samples[i].x + nx * d, y: samples[i].y + ny * d });
    }
    return out;
  }

  function makeTwist(rand, amp) {
    return {
      amp: amp,
      f1: 4.5 + rand() * 4.5,
      p1: rand() * Math.PI * 2,
      f2: 11 + rand() * 8,
      p2: rand() * Math.PI * 2
    };
  }

  /** Twisting curved path from p0 to p2 (control point auto-bowed). */
  function twistyPath(rand, p0, p2, bow, amp, n) {
    const mx = (p0.x + p2.x) / 2, my = (p0.y + p2.y) / 2;
    let dx = p2.x - p0.x, dy = p2.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const p1 = { x: mx - (dy / len) * bow, y: my + (dx / len) * bow };
    return addTwist(sampleQuad(p0, p1, p2, n), makeTwist(rand, amp));
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

  /** Faint gold shimmer along a completed connection path. */
  function goldShimmer(samples) {
    ctx.beginPath();
    ctx.moveTo(samples[0].x, samples[0].y);
    for (let i = 1; i < samples.length; i++) ctx.lineTo(samples[i].x, samples[i].y);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.18;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── Scene construction ─────────────────────────────────────────────────
  function viewBox() {
    // Draw into the canvas's actual CSS box (fixed, 100% of the viewport).
    // Never use window.innerWidth for layout — on phones a wider layout
    // viewport left-aligns the scene and the growing tree sits off-screen.
    const vv = window.visualViewport;
    const cw = canvas.clientWidth || (vv && vv.width) || window.innerWidth;
    const ch = canvas.clientHeight || (vv && vv.height) || window.innerHeight;
    return { w: Math.max(1, cw), h: Math.max(1, ch) };
  }

  function resize() {
    const box = viewBox();
    w = box.w;
    h = box.h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildScene();
  }

  function buildScene() {
    const rand = mulberry32(7);
    horizonY = h * 0.74;
    const mobile = w < 900;

    trees = [];
    // Phone / tablet: no large side trees — they read as "the two left
    // trees" when the viewport is narrow. The growing sapling is the subject.
    const slots = mobile ? [] : [0.06, 0.22, 0.78, 0.94];
    slots.forEach(fx => {
      const dir = fx < 0.5 ? 1 : -1; // leans/reaches toward center
      const height = h * (0.48 + rand() * 0.10);
      trees.push(buildTree(rand, w * fx, height, dir, mobile));
    });

    sapling = buildSapling(rand, mobile);
    buildClouds(rand);

    grass = [];
    const tufts = mobile ? 30 : 60;
    for (let i = 0; i < tufts; i++) {
      grass.push({
        x: rand() * w,
        len: 3 + rand() * 7,
        lean: (rand() - 0.5) * 5,
        a: 0.18 + rand() * 0.2,
        flower: rand() < 0.16 ? (rand() < 0.6 ? GOLD : '#FFFFFF') : null
      });
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
    birds = [];
  }

  function buildTree(rand, x, height, dir, mobile) {
    const topY = horizonY - height;
    const baseW = (mobile ? 12 : 17) * (0.9 + rand() * 0.35);
    const curve = dir * (14 + rand() * 22);

    // Trunk with a gentle organic S-twist
    const trunk = addTwist(sampleQuad(
      { x: x, y: horizonY + 6 },
      { x: x + curve * 0.6, y: horizonY - height * 0.55 },
      { x: x + curve, y: topY },
      26
    ), makeTwist(rand, 4 + rand() * 4));

    // Aspen bark "eyes"
    const marks = [];
    const mCount = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < mCount; i++) {
      marks.push({ t: 0.12 + rand() * 0.72, s: (rand() - 0.5), len: 3 + rand() * 4 });
    }

    // Canopy: a cohesive crown built from three overlapping lobes
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
    leafBlobs.sort((a, b) => b.r - a.r);

    // Visible upper branches — twisting
    const limbs = [];
    for (let i = 0; i < 3; i++) {
      const t0 = 0.68 + rand() * 0.22;
      const p0 = trunk[Math.floor(t0 * (trunk.length - 1))];
      const s = rand() < 0.5 ? 1 : -1;
      const len = height * (0.14 + rand() * 0.12);
      limbs.push(twistyPath(rand, p0,
        { x: p0.x + s * len, y: p0.y - len * (0.6 + rand() * 0.3) },
        (rand() - 0.5) * 30, 1.2 + rand() * 1.4, 12));
    }

    // Inner branch tip — where the sapling's reach branches will interlock.
    // Clamped to ~half the distance to center so it never lands on the sapling.
    const innerTip = {
      x: x + dir * Math.min(height * (0.30 + rand() * 0.08), Math.abs(w / 2 - x) * 0.52),
      y: topY + height * (0.16 + rand() * 0.10)
    };

    // Mature roots — twisting down and outward, with small rootlets
    const roots = [];
    const rootlets = [];
    const rCount = 3 + Math.floor(rand() * 2);
    let innerRootTip = null;
    for (let i = 0; i < rCount; i++) {
      const f = i / (rCount - 1);              // 0 = most inward, 1 = most outward
      const spread = lerp(dir * (70 + rand() * 100), -dir * (55 + rand() * 80), f);
      const depth = h * (0.07 + rand() * 0.12);
      const startX = x + (rand() - 0.5) * baseW * 0.8;
      const path = twistyPath(rand,
        { x: startX, y: horizonY + 2 },
        { x: x + spread, y: horizonY + depth },
        (rand() - 0.5) * 50, 8 + rand() * 9, 18);
      roots.push({ path, w0: baseW * 0.55, w1: 1.6 });
      if (i === 0) innerRootTip = path[path.length - 1];

      // 1-2 rootlets forking off the main root
      const forks = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < forks; k++) {
        const ft = 0.45 + rand() * 0.35;
        const fp = path[Math.floor(ft * (path.length - 1))];
        rootlets.push({
          path: twistyPath(rand, fp,
            { x: fp.x + (rand() - 0.5) * 90, y: fp.y + 20 + rand() * 50 },
            (rand() - 0.5) * 26, 4 + rand() * 5, 10)
        });
      }
    }

    return { x, topY, height, dir, baseW, trunk, marks, leafBlobs, limbs, innerTip, roots, rootlets, innerRootTip, ph: rand() * Math.PI * 2 };
  }

  function nearestTreeOnSide(side, nth) {
    const cx = w / 2;
    const group = trees.filter(t => (side < 0 ? t.x < cx : t.x > cx))
      .sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx));
    return group[Math.min(nth, group.length - 1)] || null;
  }

  function buildSapling(rand, mobile) {
    // By the bottom of the page: BY FAR the largest tree in the grove.
    // On mobile there are no neighbor trees to size against — use the
    // viewport so the trunk actually grows instead of becoming a bush.
    const tallest = trees.reduce((m, t) => Math.max(m, t.height), 0);
    const Hf = tallest > 0 ? Math.min(h * 0.70, tallest * 1.32) : h * 0.62;
    const maxTrunkW = mobile ? 17 : 24;

    // Trunk twist parameters (stable across frames)
    const trunkTwist = makeTwist(rand, 5 + rand() * 3);

    const branches = [];

    // Ordinary branches — appear as the trunk passes their height, twisting
    const hFracs = [0.30, 0.42, 0.54, 0.66, 0.78, 0.88];
    hFracs.forEach(hf => {
      [-1, 1].forEach(s => {
        branches.push({
          side: s,
          hf: clamp01(hf + (rand() - 0.5) * 0.05),
          len: Hf * (0.22 - hf * 0.09 + rand() * 0.07),
          rise: 0.45 + rand() * 0.4,
          reach: false,
          bow: (rand() - 0.5) * 36,
          twist: makeTwist(rand, 3 + rand() * 3.5),
          wob: rand() * Math.PI * 2
        });
      });
    });

    // Reach branches — interlock with the neighbors.
    // Desktop: three per side (inner tree twice, outer tree once).
    // (birth + 0.30 growth window stays under 1.0 so every one completes)
    const reachDefs = mobile
      ? [[0.44, 0], [0.60, 0]]
      : [[0.40, 0], [0.52, 1], [0.65, 0]];
    reachDefs.forEach(([hf, nth], i) => {
      [-1, 1].forEach(s => {
        branches.push({
          side: s, hf, nth, reach: true,
          id: 'branch:' + s + ':' + i,
          bow: (rand() - 0.5) * 40,
          twist: makeTwist(rand, 6 + rand() * 5),
          answerTwist: makeTwist(rand, 1.6),
          tipDy: (rand() - 0.5) * 26
        });
      });
    });

    // Roots — many of them, twisting; outer ones bridge to the trees
    const rdefs = mobile
      ? [[-1, 0.14], [-0.5, 0.24], [0, 0.20], [0.5, 0.28], [1, 0.17]]
      : [[-1, 0.12], [-0.7, 0.20], [-0.38, 0.30], [0, 0.22], [0.38, 0.33], [0.7, 0.24], [1, 0.15]];
    const roots = [];
    rdefs.forEach(([dirF, birth], i) => {
      roots.push({
        dirF,
        birth,
        id: 'root:' + i,
        depth: h * (0.08 + rand() * 0.10),
        spread: dirF * (w * (mobile ? 0.11 : 0.075) + 40 + rand() * 70),
        bridge: Math.abs(dirF) >= 0.38,
        nth: Math.abs(dirF) > 0.8 ? 0 : (mobile ? 0 : 1),
        bow: (rand() - 0.5) * 46,
        twist: makeTwist(rand, 8 + rand() * 8),
        bridgeBow: 18 + rand() * 26,
        bridgeTwist: makeTwist(rand, 6 + rand() * 6),
        forkT: 0.5 + rand() * 0.3,
        forkDx: (rand() - 0.5) * 80,
        forkDy: 24 + rand() * 44,
        forkTwist: makeTwist(rand, 4 + rand() * 4)
      });
    });

    // Mature crown — larger than any neighbor, built like theirs but grander
    const crownBlobs = [];
    const cLobes = [
      { dx: 0, dy: -Hf * 0.16, r: Hf * 0.235 },
      { dx: -Hf * 0.16, dy: -Hf * 0.03, r: Hf * 0.175 },
      { dx: Hf * 0.16, dy: -Hf * 0.04, r: Hf * 0.175 },
      { dx: 0, dy: -Hf * 0.30, r: Hf * 0.15 }
    ];
    cLobes.forEach(lb => {
      const blobs = mobile ? 11 : 15;
      for (let i = 0; i < blobs; i++) {
        const ang = rand() * Math.PI * 2;
        const rr = Math.sqrt(rand()) * lb.r * 0.72;
        crownBlobs.push({
          dx: lb.dx + Math.cos(ang) * rr,
          dy: lb.dy + Math.sin(ang) * rr * 0.8,
          r: lb.r * (0.34 + rand() * 0.3),
          color: GREENS[Math.floor(rand() * GREENS.length)],
          a: 0.42 + rand() * 0.25,
          ph: rand() * Math.PI * 2
        });
      }
    });
    crownBlobs.sort((a, b) => b.r - a.r);

    // Bark eyes appear as the sapling matures
    const marks = [];
    for (let i = 0; i < 5; i++) {
      marks.push({ t: 0.15 + rand() * 0.6, s: (rand() - 0.5), len: 2.5 + rand() * 3.5 });
    }

    return { x: w / 2, Hf, maxTrunkW, trunkTwist, branches, roots, crownBlobs, marks, ph: rand() * Math.PI * 2 };
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

    const sx = w * 0.80, sy = h * 0.13, sr = h * 0.30;
    const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sun.addColorStop(0, 'rgba(255, 243, 209, 0.55)');
    sun.addColorStop(1, 'rgba(255, 243, 209, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);

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

  function paintBirds(now, dt) {
    const maxBirds = w < 700 ? 1 : 2;
    if (now > birdSpawnAt && birds.length < maxBirds) {
      birdSpawnAt = now + 8000 + Math.random() * 9000;
      const fromLeft = Math.random() < 0.5;
      birds.push({
        x: fromLeft ? -30 : w + 30,
        y: h * (0.06 + Math.random() * 0.22),
        vx: (fromLeft ? 1 : -1) * (20 + Math.random() * 16),
        s: 0.7 + Math.random() * 0.5,
        ph: Math.random() * Math.PI * 2
      });
    }
    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i];
      b.x += b.vx * dt;
      b.y += Math.sin(now / 900 + b.ph) * 6 * dt;
      if (b.x < -50 || b.x > w + 50) { birds.splice(i, 1); continue; }
      const flap = Math.sin(now / 150 + b.ph) * 3.5 * b.s;
      ctx.strokeStyle = 'rgba(15, 45, 77, 0.38)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(b.x - 7 * b.s, b.y - flap);
      ctx.quadraticCurveTo(b.x - 2 * b.s, b.y + 2 * b.s, b.x, b.y);
      ctx.quadraticCurveTo(b.x + 2 * b.s, b.y + 2 * b.s, b.x + 7 * b.s, b.y - flap);
      ctx.stroke();
    }
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
      if (gr.flower) {
        ctx.fillStyle = gr.flower;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(gr.x + gr.lean, horizonY - gr.len - 1.5, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  }

  function paintGroundShadow(x, rx) {
    ctx.fillStyle = 'rgba(15, 45, 77, 0.06)';
    ctx.beginPath();
    ctx.ellipse(x, horizonY + 3, rx, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function paintTree(tree, now) {
    const sway = Math.sin(now / 2400 + tree.ph) * 3;

    paintGroundShadow(tree.x, tree.baseW * 2.6);

    // Roots and rootlets (mature, always fully grown)
    tree.roots.forEach(r => {
      drawTapered(r.path, r.w0, r.w1, 1, { fillA: ROOT_FILL, fillB: ROOT_DEEP, edge: ROOT_EDGE, alpha: 0.55 });
    });
    tree.rootlets.forEach(r => {
      drawTapered(r.path, 2.6, 0.8, 1, { fillA: ROOT_FILL, fillB: ROOT_DEEP, edge: null, alpha: 0.42 });
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
    const sway = Math.sin(now / 1900 + s.ph) * (5 - 3 * pShown);

    paintGroundShadow(s.x, (6 + s.maxTrunkW * pShown) * 2.4);

    // Trunk polyline (recomputed each frame — the sapling is alive).
    // Twists via stable stored parameters so it doesn't jitter.
    const N = 22;
    const base = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const bend = Math.sin(t * Math.PI * 0.9) * 6 * (1 - pShown * 0.6);
      base.push({
        x: s.x + bend + sway * Math.pow(t, 1.6),
        y: horizonY + 4 - (Hcur + 4) * t
      });
    }
    const twistScale = Math.min(1, Hcur / (s.Hf * 0.4)); // little sprouts barely twist
    const trunk = addTwist(base, {
      amp: s.trunkTwist.amp * twistScale,
      f1: s.trunkTwist.f1, p1: s.trunkTwist.p1,
      f2: s.trunkTwist.f2, p2: s.trunkTwist.p2
    });
    const w0 = 3.5 + (s.maxTrunkW - 3.5) * pShown;

    // ── Roots first ──
    const rand = null; // (twists are precomputed — no per-frame randomness)
    s.roots.forEach(r => {
      const q = smooth((pShown - r.birth) / 0.30);
      if (q <= 0) return;
      const p0 = { x: s.x, y: horizonY + 2 };
      const p2 = { x: s.x + r.spread, y: horizonY + r.depth };
      const mx = (p0.x + p2.x) / 2, my = (p0.y + p2.y) / 2;
      let dx = p2.x - p0.x, dy = p2.y - p0.y;
      const dl = Math.hypot(dx, dy) || 1;
      const path = addTwist(sampleQuad(p0,
        { x: mx - (dy / dl) * r.bow, y: my + (dx / dl) * r.bow }, p2, 18), r.twist);
      drawTapered(path, w0 * 0.62, 1.6, q, { fillA: ROOT_FILL, fillB: ROOT_DEEP, edge: ROOT_EDGE, alpha: 0.58 });

      // Rootlet fork once the main root is well along
      if (q > 0.75) {
        const fq = (q - 0.75) / 0.25;
        const fp = path[Math.floor(r.forkT * (path.length - 1))];
        const fpath = addTwist(sampleQuad(fp,
          { x: fp.x + r.forkDx * 0.5, y: fp.y + r.forkDy * 0.5 },
          { x: fp.x + r.forkDx, y: fp.y + r.forkDy }, 10), r.forkTwist);
        drawTapered(fpath, 2.6, 0.8, fq, { fillA: ROOT_FILL, fillB: ROOT_DEEP, edge: null, alpha: 0.45 });
      }

      // Bridge onward to a neighboring tree's inner root
      if (r.bridge && q >= 1) {
        const tree = nearestTreeOnSide(r.dirF < 0 ? -1 : 1, r.nth);
        if (tree && tree.innerRootTip) {
          const from = path[path.length - 1];
          const to = tree.innerRootTip;
          const bq = smooth((pShown - r.birth - 0.28) / 0.30);
          if (bq > 0) {
            const bridge = addTwist(sampleQuad(
              from,
              { x: (from.x + to.x) / 2, y: Math.max(from.y, to.y) + r.bridgeBow },
              to, 18), r.bridgeTwist);
            drawTapered(bridge, 3.4, 2, bq, { fillA: ROOT_FILL, fillB: ROOT_DEEP, edge: ROOT_EDGE, alpha: 0.52 });
            if (bq >= 1) {
              goldShimmer(bridge);
              paintConnection(r.id, to.x, to.y, now);
            }
          }
        }
      }
    });

    // ── Trunk ──
    drawTapered(trunk, w0, Math.max(1.2, w0 * 0.25), 1,
      { fillA: SAPLING_A, fillB: SAPLING_B, edge: SAPLING_EDGE, alpha: 0.88 });

    // Bark eyes emerge with maturity
    if (pShown > 0.45) {
      const mAlpha = smooth((pShown - 0.45) / 0.3) * 0.55;
      ctx.fillStyle = BARK_MARK;
      s.marks.forEach(m => {
        const p = trunk[Math.floor(m.t * (trunk.length - 1))];
        ctx.globalAlpha = mAlpha;
        ctx.beginPath();
        ctx.ellipse(p.x + m.s * w0 * 0.3, p.y, m.len, 1.4, m.s * 0.4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    const trunkPointAt = hf => {
      const t = clamp01((s.Hf * hf) / Math.max(1, Hcur));
      const idx = Math.min(N, Math.floor(t * N));
      return trunk[idx];
    };

    // ── Ordinary branches — twisting outward ──
    s.branches.forEach(br => {
      if (br.reach) return;
      if (g <= br.hf + 0.01) return;
      const q = smooth((g - br.hf) / 0.14);
      const A = trunkPointAt(br.hf);
      const len = br.len * q;
      const tip = { x: A.x + br.side * len, y: A.y - len * br.rise };
      const mx = (A.x + tip.x) / 2, my = (A.y + tip.y) / 2;
      let dx = tip.x - A.x, dy = tip.y - A.y;
      const dl = Math.hypot(dx, dy) || 1;
      const path = addTwist(sampleQuad(A,
        { x: mx - (dy / dl) * br.bow * q, y: my + (dx / dl) * br.bow * q }, tip, 12), br.twist);
      drawTapered(path, Math.max(1.4, w0 * 0.4 * q), 0.8, 1,
        { fillA: SAPLING_A, fillB: SAPLING_B, edge: 'rgba(94, 124, 91, 0.4)', alpha: 0.75 });

      if (q > 0.35) {
        const cr = (6 + 15 * q) * (0.7 + 0.5 * pShown);
        paintLeafCluster(tip.x, tip.y - 2, cr, q, now, br.wob);
      }
    });

    // ── Grand crown — eventually dwarfs the neighbors ──
    const crownScale = smooth((pShown - 0.30) / 0.70);
    if (crownScale > 0.02) {
      const cx = trunk[N].x, cy = trunk[N].y;
      const cs = 0.12 + 0.88 * crownScale;
      s.crownBlobs.forEach(b => {
        const wob = Math.sin(now / 1900 + b.ph) * 1.6;
        ctx.fillStyle = b.color;
        ctx.globalAlpha = b.a * Math.min(1, crownScale * 1.6);
        ctx.beginPath();
        ctx.ellipse(cx + b.dx * cs + wob, cy + b.dy * cs, b.r * cs, b.r * cs * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    } else if (g > 0.1) {
      // Young sprout tuft
      paintLeafCluster(trunk[N].x, trunk[N].y - 4, 8 + 20 * pShown, Math.min(1, g * 2), now, s.ph);
    }

    // ── Reach branches: interlock with the neighbors ──
    s.branches.forEach(br => {
      if (!br.reach) return;
      const birth = br.hf;
      if (g <= birth + 0.02) return;
      const tree = nearestTreeOnSide(br.side, br.nth || 0);
      if (!tree) return;

      const A = trunkPointAt(br.hf);
      const target = { x: tree.innerTip.x, y: tree.innerTip.y + (br.tipDy || 0) };
      const q = smooth((pShown - birth) / 0.30);
      if (q <= 0) return;

      const midX = lerp(A.x, target.x, 0.5) + br.side * 20;
      const midY = Math.min(A.y, target.y) - 34 - Math.abs(br.bow);
      const path = addTwist(sampleQuad(A, { x: midX, y: midY }, target, 26), br.twist);
      drawTapered(path, Math.max(1.6, w0 * 0.4), 1, q,
        { fillA: SAPLING_A, fillB: SAPLING_B, edge: 'rgba(94, 124, 91, 0.42)', alpha: 0.72 });

      // The tree answers — a short twisting branch reaching back to meet it
      // (originates on the tree's side of the meeting point)
      if (q > 0.5) {
        const answer = smooth((q - 0.5) / 0.5);
        const from = { x: target.x + br.side * 46, y: target.y - 20 };
        const back = addTwist(sampleQuad(from,
          { x: (from.x + target.x) / 2, y: target.y - 26 }, target, 10), br.answerTwist);
        drawTapered(back, 3, 1, answer, { fillA: TRUNK_BOT, fillB: TRUNK_TOP, edge: NAVY_EDGE, alpha: 0.62 });
      }

      // Interlocked!
      if (q >= 1) {
        goldShimmer(path);
        ctx.beginPath();
        ctx.arc(target.x, target.y, 6, Math.PI * 0.2, Math.PI * 1.6);
        ctx.strokeStyle = 'rgba(94, 124, 91, 0.5)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        paintConnection(br.id, target.x, target.y, now);
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
    const cap = w < 700 ? 12 : 18;
    if (now > leafSpawnAt && driftLeaves.length < cap && trees.length) {
      leafSpawnAt = now + 700 + Math.random() * 1300;
      // Mature sapling sheds leaves too
      const sources = trees.slice();
      if (pShown > 0.55 && sapling) sources.push({ trunk: null, sapling: true });
      const src = sources[Math.floor(Math.random() * sources.length)];
      let sx, sy, spreadX, spreadY;
      if (src.sapling) {
        sx = sapling.x; sy = horizonY - sapling.Hf * (0.08 + 0.92 * pShown);
        spreadX = sapling.Hf * 0.3; spreadY = sapling.Hf * 0.18;
      } else {
        const top = src.trunk[src.trunk.length - 1];
        sx = top.x; sy = top.y;
        spreadX = src.height * 0.4; spreadY = src.height * 0.2;
      }
      driftLeaves.push({
        x: sx + (Math.random() - 0.5) * spreadX,
        y: sy + (Math.random() - 0.3) * spreadY,
        vx: 10 + Math.random() * 22,
        vy: 9 + Math.random() * 14,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 2.8,
        size: 2.6 + Math.random() * 2.8,
        swayPh: Math.random() * Math.PI * 2,
        color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)]
      });
    }
    for (let i = driftLeaves.length - 1; i >= 0; i--) {
      const L = driftLeaves[i];
      L.x += (L.vx + Math.sin(now / 650 + L.swayPh) * 11) * dt;
      L.y += (L.vy + Math.cos(now / 800 + L.swayPh) * 3) * dt;
      L.rot += L.vr * dt;
      if (L.y > horizonY + 10 || L.x > w + 30 || L.x < -30) { driftLeaves.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(L.x, L.y);
      ctx.rotate(L.rot);
      ctx.fillStyle = L.color;
      ctx.globalAlpha = 0.42;
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
      paintBirds(now, dt);
      paintTreeline();
      paintHorizon();
      trees.forEach(t => paintTree(t, now));
      paintSapling(now);
      updateDriftLeaves(now, dt);

      window.__groveDebug = {
        pShown: +pShown.toFixed(3), target: +target.toFixed(3),
        trees: trees.length, clouds: clouds.length,
        leaves: driftLeaves.length, birds: birds.length,
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
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
  }

  resize();
  requestAnimationFrame(frame);
})();
