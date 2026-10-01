(() => {
  'use strict';
  const FRAMES = 97, SIZE = 420, MAX_YAW = 55 * Math.PI / 180;
  const IDLE_AFTER = 2200;               // ms without pointer movement before he looks around
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const view = document.getElementById('pup');
  const vctx = view.getContext('2d');
  const loading = document.getElementById('loading');
  const bar = document.getElementById('bar');

  /* ---------- tiny clay-style 3D renderer: shaded ellipsoids, depth-sorted ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const shade = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    const f = c => clamp(Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt), 0, 255);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  };

  function renderFrame(yaw) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = SIZE;
    const c = cv.getContext('2d');
    const S = SIZE / 8.2, cx = SIZE / 2, cy = SIZE * 0.5;
    const proj = (x, y, z) => { const k = 1 / (1 - z * 0.05); return { x: cx + x * S * k, y: cy - y * S * k, k, z }; };
    const items = [];
    const cb = Math.cos(yaw * 0.25), sb = Math.sin(yaw * 0.25);
    const ch = Math.cos(yaw), sh = Math.sin(yaw);
    const roll = -yaw * 0.16, cr = Math.cos(roll), sr = Math.sin(roll);

    // body-space point -> world (slight body twist)
    const B = (x, y, z) => [x * cb + z * sb, y, -x * sb + z * cb];
    // head-space point -> world: yaw, roll around the neck, then up onto the shoulders
    const H = (x, y, z) => {
      let X = x * ch + z * sh, Z = -x * sh + z * ch, Y = y + 1.35;
      const rx = X * cr - Y * sr, ry = X * sr + Y * cr;
      return [rx, ry - 0.45, Z];
    };
    // head-space direction (no translation) for facing tests
    const Hn = (x, y, z) => { const X = x * ch + z * sh; return [X, y, -x * sh + z * ch]; };

    const ell = (p, r, color, rot = 0, bias = 0) => {
      const q = proj(...p);
      items.push({ z: p[2] + bias, draw() {
        c.save(); c.translate(q.x, q.y); c.rotate(rot); c.scale(r[0] * S * q.k, r[1] * S * q.k);
        const g = c.createRadialGradient(-.35, -.4, .05, 0, 0, 1.05);
        g.addColorStop(0, shade(color, .3)); g.addColorStop(.55, shade(color, 0)); g.addColorStop(1, shade(color, -.32));
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, 7); c.fill(); c.restore();
      } });
    };

    // ground shadow
    const sp = proj(0, -3.05, 0);
    c.save(); c.translate(sp.x, sp.y); c.scale(2.3 * S, 0.45 * S);
    const sg = c.createRadialGradient(0, 0, 0, 0, 0, 1); sg.addColorStop(0, 'rgba(60,30,10,.28)'); sg.addColorStop(1, 'rgba(60,30,10,0)');
    c.fillStyle = sg; c.beginPath(); c.arc(0, 0, 1, 0, 7); c.fill(); c.restore();

    // ---- body & jumper ----
    const RED = '#c8312b', RED2 = '#a32420', TAN = '#d8a066', CREAM = '#f1d7ae', BROWN = '#85512c';
    ell(B(0, -1.35, 0), [1.4, 1.4, 1.2], RED);
    ell(B(0, -2.45, 0.05), [1.38, .3, 1.18], RED2);                    // ribbed hem
    ell(B(0, -.2, 0), [.95, .32, .9], RED2);                           // rolled collar
    for (const s of [-1, 1]) {
      ell(B(s * 1.35, -1.15, .3), [.48, .85, .5], RED, s * -.15);      // sleeves
      ell(B(s * 1.4, -2.0, .55), [.36, .3, .36], CREAM);               // paws
      ell(B(s * .75, -2.7, .75), [.55, .32, .6], CREAM);               // feet
    }
    ell(B(0, -1.9, -1.35), [.3, .3, .3], TAN);                         // tail

    // ---- head ----
    ell(H(0, 0, 0), [1.25, 1.2, 1.2], TAN);
    ell(H(0, -.42, 1.02), [.66, .52, .52], CREAM);                     // muzzle
    ell(H(0, -.17, 1.5), [.22, .16, .16], '#2a1a14');                  // nose
    for (const s of [-1, 1]) {
      ell(H(s * 1.12, .25, -.15), [.42, .8, .36], BROWN, s * .28 + roll, -.2);   // floppy ears
    }

    // flat face features, only drawn while they face the camera
    const faces = (n) => Hn(...n)[2];
    const frown = () => {
      const pts = [[-.34, -.84, 1.16], [0, -.64, 1.45], [.34, -.84, 1.16]].map(p => proj(...H(...p)));
      items.push({ z: pts[1].z + .4, draw() {
        if (faces([0, -.4, 1]) < .25) return;
        c.strokeStyle = '#3a2218'; c.lineWidth = S * .085; c.lineCap = 'round';
        c.beginPath(); c.moveTo(pts[0].x, pts[0].y); c.quadraticCurveTo(pts[1].x, pts[1].y - S * .22, pts[2].x, pts[2].y); c.stroke();
      } });
    };
    frown();

    const hc = proj(...H(0, 0, 0));
    for (const s of [-1, 1]) {
      const e = proj(...H(s * .52, .3, 1.0));
      const nz = faces([s * .45, .25, .9]);
      items.push({ z: e.z + .5, draw() {
        if (nz < .12) return;
        const fx = clamp(nz, .2, 1), rr = S * .33 * e.k;
        const u = (e.x - hc.x) > 0 ? -1 : 1;                          // screen direction toward the nose
        c.save(); c.translate(e.x, e.y);
        c.beginPath(); c.ellipse(0, 0, rr * fx, rr, 0, 0, 7); c.save(); c.clip();
        c.fillStyle = '#fbf6ea'; c.fillRect(-rr * 2, -rr * 2, rr * 4, rr * 4);
        c.fillStyle = '#25160f';                                       // pupil, glaring
        c.beginPath(); c.ellipse(-u * rr * .08 * fx, rr * .12, rr * .5 * fx, rr * .5, 0, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(-rr * .15 * fx, -rr * .12, rr * .12, 0, 7); c.fill();
        c.restore();
        c.restore();
      } });
    }
    // heavy lids sloping to the nose + furrowed brows
    for (const s of [-1, 1]) {
      const e = proj(...H(s * .52, .3, 1.0));
      const nz = faces([s * .45, .25, .9]);
      items.push({ z: e.z + .6, draw() {
        if (nz < .12) return;
        const fx = clamp(nz, .2, 1), rr = S * .33 * e.k;
        const u = (e.x - hc.x) > 0 ? -1 : 1;
        c.save(); c.translate(e.x, e.y);
        c.beginPath(); c.ellipse(0, 0, rr * fx, rr, 0, 0, 7); c.clip();
        c.fillStyle = shade(TAN, 0);
        c.beginPath();
        c.moveTo(-u * rr * 2, -rr * .55); c.lineTo(u * rr * 2, rr * .45);
        c.lineTo(u * rr * 2, -rr * 2); c.lineTo(-u * rr * 2, -rr * 2); c.closePath(); c.fill();
        c.restore();
        if (nz < .4) return;                                           // thick furrowed brow
        const o = proj(...H(s * 1.0, .98, .62)), i = proj(...H(s * .2, .6, 1.12));
        c.strokeStyle = '#4a2a18'; c.lineWidth = S * .17; c.lineCap = 'round';
        c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(i.x, i.y); c.stroke();
      } });
    }

    items.sort((a, b) => a.z - b.z).forEach(it => it.draw());
    return cv;
  }

  /* ---------- frame sequence: real images if /puppy/frames exists, else render procedurally ---------- */
  const frames = new Array(FRAMES);
  const yawOf = i => (i / (FRAMES - 1) * 2 - 1) * MAX_YAW;
  const setProgress = n => { bar.style.setProperty('--p', n / FRAMES); };

  async function loadImageFrames() {
    const name = i => `frames/frame_${String(i + 1).padStart(3, '0')}.jpg`;
    const first = new Image(); first.src = name(0);
    await first.decode();                                              // throws if missing
    frames[0] = first;
    await Promise.all(Array.from({ length: FRAMES - 1 }, async (_, k) => {
      const im = new Image(); im.src = name(k + 1); await im.decode(); frames[k + 1] = im; setProgress(k);
    }));
  }
  async function buildFrames() {
    for (let i = 0; i < FRAMES; i++) {
      frames[i] = renderFrame(yawOf(i)); setProgress(i + 1);
      if (i % 6 === 5) await new Promise(r => setTimeout(r));          // keep the page responsive
    }
  }

  /* ---------- scrubbing: pointer -> position in [0,1], eased, crossfaded between frames ---------- */
  let pos = .5, target = .5, lastMove = -1e9, idleGoal = .5, idleNext = 0;
  addEventListener('pointermove', e => {
    target = clamp((e.clientX / innerWidth - .05) / .9, 0, 1); lastMove = performance.now();
  }, { passive: true });
  addEventListener('pointerdown', e => { target = clamp(e.clientX / innerWidth, 0, 1); lastMove = performance.now(); });

  function idleLook(now) {                                             // wander: look left, right, glance back, pause
    if (now > idleNext) {
      const far = Math.random() < .5;
      idleGoal = far ? (Math.random() < .5 ? .04 + Math.random() * .16 : .8 + Math.random() * .16) : .35 + Math.random() * .3;
      idleNext = now + 900 + Math.random() * 1500;
    }
    return idleGoal;
  }

  function draw(now) {
    const idle = !reduceMotion && now - lastMove > IDLE_AFTER;
    if (idle) { if (now - lastMove < IDLE_AFTER + 20) idleNext = 0; target = idleLook(now); }
    pos += (target - pos) * (idle ? .045 : .14);
    const f = pos * (FRAMES - 1), i = Math.min(FRAMES - 2, Math.floor(f)), a = f - i;
    const W = view.width;
    vctx.clearRect(0, 0, W, W);
    vctx.globalAlpha = 1; vctx.drawImage(frames[i], 0, 0, W, W);
    if (a > .001) { vctx.globalAlpha = a; vctx.drawImage(frames[i + 1], 0, 0, W, W); }
    vctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  (async () => {
    try { await loadImageFrames(); } catch { await buildFrames(); }
    loading.classList.add('done');
    requestAnimationFrame(draw);
  })();
})();
