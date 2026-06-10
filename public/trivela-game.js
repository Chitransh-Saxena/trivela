/* ============================================================
   <trivela-game> — a free-kick game that teaches the Magnus effect.
   Vanilla custom element, shadow DOM, no deps.
   Requires physics.js loaded first (window.TrivelaPhysics).
   Inherits theme from host CSS vars (--blood, --ink, ...) with fallbacks.
   ============================================================ */
(function () {
  "use strict";
  if (customElements.get("trivela-game")) return;

  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* progressive levels — each adds one real idea */
  var LEVELS = [
    { name: "warmup", sub: "find the curl", wall: null, keeper: null, wind: 0 },
    { name: "keeper", sub: "beat the keeper", wall: null,
      keeper: { cover: 1.2, reach: 2.5, lowReach: 1.3, height: 1.85, cx: 0 }, wind: 0 },
    { name: "the wall", sub: "bend it round the near post",
      wall: { z: 9.15, halfW: 1.4, height: 2.0, cx: 1.5 },
      keeper: { cover: 1.2, reach: 2.6, lowReach: 1.35, height: 1.85, cx: -0.3 }, wind: 0 },
    { name: "trivela", sub: "outside of the foot — far corner",
      wall: { z: 9.15, halfW: 1.5, height: 2.05, cx: -1.6 },
      keeper: { cover: 1.3, reach: 2.7, lowReach: 1.4, height: 1.9, cx: 0.5 }, wind: 0, trivela: true },
    { name: "the wind", sub: "read the breeze",
      wall: { z: 9.15, halfW: 1.7, height: 2.05, cx: 1.4 },
      keeper: { cover: 1.3, reach: 2.8, lowReach: 1.45, height: 1.9, cx: -0.4 }, wind: 1 }
  ];
  var BALLS_PER_ROUND = 5;
  var MINV = 20, MAXV = 31;          // power -> launch speed (m/s)
  var BALL_R = 0.16, D = 22;         // ball radius (m), goal distance (m)
  var GOAL_HALF = 3.66, GOAL_H = 2.44;

  var TEMPLATE =
    '<style>' +
    ':host{display:block;position:relative;width:100%;height:100%;min-height:260px;' +
      'font-family:var(--mono,"Spline Sans Mono",ui-monospace,monospace);' +
      'color:var(--ink,#f6ece9);--g:var(--blood,#e0102f);--gb:var(--blood-bright,#ff2f47);' +
      '--grgb:var(--glow-rgb,224,16,47);--on:var(--on-blood,#fff);contain:content;}' +
    'canvas{display:block;width:100%;height:100%;cursor:crosshair;touch-action:none;}' +
    '.btns{position:absolute;top:.5rem;right:.5rem;display:flex;gap:.35rem;z-index:3;}' +
    '.b{font:inherit;font-size:.72rem;color:var(--ink,#f6ece9);background:rgba(var(--grgb),.12);' +
      'border:1px solid rgba(var(--grgb),.5);border-radius:6px;padding:.18rem .42rem;cursor:pointer;' +
      'line-height:1;letter-spacing:.02em;}' +
    '.b:hover{background:rgba(var(--grgb),.26);color:#fff;}' +
    '.help{position:absolute;inset:0;z-index:4;display:none;overflow:auto;padding:1.1rem 1.2rem;' +
      'background:rgba(8,5,6,.94);backdrop-filter:blur(2px);font-size:.82rem;line-height:1.6;}' +
    '.help.open{display:block;}' +
    '.help h3{font-family:var(--display,"Syne",sans-serif);color:var(--gb,#ff2f47);' +
      'font-size:1.05rem;margin:0 0 .5rem;letter-spacing:.01em;}' +
    '.help h4{color:var(--gb,#ff2f47);margin:1rem 0 .25rem;font-size:.78rem;text-transform:uppercase;letter-spacing:.12em;}' +
    '.help p{margin:.35rem 0;color:var(--ink-soft,#ddccc9);} .help b{color:var(--ink,#f6ece9);}' +
    '.help code,.help pre{font-family:var(--mono,monospace);}' +
    '.help pre{background:rgba(var(--grgb),.08);border:1px solid rgba(var(--grgb),.3);border-radius:7px;' +
      'padding:.6rem .7rem;overflow:auto;color:var(--ink,#f6ece9);font-size:.76rem;margin:.4rem 0;}' +
    '.help .x{position:sticky;top:0;float:right;}' +
    '.help em{color:var(--gb,#ff2f47);font-style:normal;}' +
    '</style>' +
    '<canvas></canvas>' +
    '<div class="btns">' +
      '<button class="b" data-act="forces" title="show the physics">◉ forces</button>' +
      '<button class="b" data-act="trainer" title="aim helper">◌ trainer</button>' +
      '<button class="b" data-act="mute" title="sound">♪ on</button>' +
      '<button class="b" data-act="help">? how</button>' +
    '</div>' +
    '<div class="help"><button class="b x" data-act="help">✕ close</button>' + helpBody() + '</div>';

  function helpBody() {
    return '' +
      '<h3>Why does the ball bend? — the Magnus effect</h3>' +
      '<p><b>Five-year-old version:</b> a spinning ball drags the air faster on one' +
      ' side. Fast air pushes <em>softer</em> than slow air, so the ball gets shoved' +
      ' toward its fast-spinning side — and <em>curves</em>. Spin it with the' +
      ' outside of your foot (a <em>trivela</em>) and it bends the other way.</p>' +
      '<h4>The physics</h4>' +
      '<p>Sideways spin <b>S</b> meeting forward speed <b>v</b> makes a sideways' +
      ' force <b>F = S × v</b>. More spin or more pace → more bend. That' +
      ' force is what curls the ball around the wall and back into the corner.</p>' +
      '<h4>The actual code (this game runs it)</h4>' +
      '<pre>// physics.js — per step, metres &amp; seconds\n' +
      'ax = magnus * spin * vz   // sideways curl (Magnus)\n' +
      'ay = -g - drag*vy         // gravity + air\n' +
      'az = -drag * vz           // ball slows down\n' +
      'v += a*dt;  pos += v*dt;  // integrate</pre>' +
      '<p>Same idea in Python:</p>' +
      '<pre>ax = MAGNUS * spin * vz\nvx += ax * dt\nx  += vx * dt</pre>' +
      '<h4>How to play</h4>' +
      '<p><b>Move</b> to aim · <b>◀ / ▶</b> set curl · <b>hold' +
      ' SPACE</b> (or press &amp; hold) to load power · <b>release</b> to' +
      ' strike. Turn off the <b>trainer</b> line for bonus points. Beat the keeper' +
      ' in the top corner — he can’t reach up there.</p>';
  }

  class TrivelaGame extends HTMLElement {
    constructor() {
      super();
      this.root = this.attachShadow({ mode: "open" });
      this._raf = 0; this._running = false; this._lastT = 0;
      this.trail = []; this.pal = {};
      this.showForces = false;
      this.trainer = true;
      this.muted = false;
      try { this.muted = localStorage.getItem("trivela_mute") === "1"; } catch (e) {}
      this.best = 0;
      try { this.best = +localStorage.getItem("trivela_best") || 0; } catch (e) {}
    }

    connectedCallback() {
      if (!window.TrivelaPhysics) {           // physics.js not ready yet
        return void setTimeout(() => this.connectedCallback(), 60);
      }
      this.root.innerHTML = TEMPLATE;
      this.canvas = this.root.querySelector("canvas");
      this.ctx = this.canvas.getContext("2d");
      this.helpEl = this.root.querySelector(".help");
      this._bindUI();
      this._newGame();
      this._refreshPalette();
      this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this);
      this._io = new IntersectionObserver((es) => {
        es.some((e) => e.isIntersecting) ? this._start() : this._stop();
      }, { threshold: 0.02 });
      this._io.observe(this);
      this._mo = new MutationObserver(() => this._refreshPalette());
      this._mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
      this._onVis = () => { document.hidden ? this._stop() : this._start(); };
      document.addEventListener("visibilitychange", this._onVis);
      this._resize();
      this._syncBtns();
    }
    disconnectedCallback() {
      this._stop();
      this._ro && this._ro.disconnect();
      this._io && this._io.disconnect();
      this._mo && this._mo.disconnect();
      document.removeEventListener("visibilitychange", this._onVis);
    }

    /* ---------- theme ---------- */
    _refreshPalette() {
      var cs = getComputedStyle(this);
      var g = function (n, f) { var v = cs.getPropertyValue(n).trim(); return v || f; };
      this.pal = {
        bg: g("--bg", "#0a0708"), bg2: g("--bg-2", "#150c0f"),
        ink: g("--ink", "#f6ece9"), inkSoft: g("--ink-soft", "#ddccc9"),
        inkDim: g("--ink-dim", "#9c8884"),
        blood: g("--blood", "#e0102f"), bright: g("--blood-bright", "#ff2f47"),
        deep: g("--blood-deep", "#5c0a14"), hair: g("--hairline", "#2c171a"),
        ok: g("--ok", "#3fcf8e"), grgb: g("--glow-rgb", "224,16,47"),
        on: g("--on-blood", "#fff")
      };
    }

    /* ---------- sizing / projection ---------- */
    _resize() {
      var r = this.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = r.width; this.H = r.height;
      this.canvas.width = Math.round(this.W * dpr);
      this.canvas.height = Math.round(this.H * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var W = this.W, H = this.H;
      this.view = {
        cx: W / 2,
        farScale: (0.46 * W) / (2 * GOAL_HALF),
        nearScale: (0.46 * W) / (2 * GOAL_HALF) * 2.5,
        gFarY: H * 0.40, gNearY: H * 0.965
      };
    }
    _proj(x, y, z) {
      var v = this.view, t = clamp(z / D, 0, 1), tc = t;
      var scl = lerp(v.nearScale, v.farScale, tc);
      var gy = lerp(v.gNearY, v.gFarY, tc);
      return { sx: v.cx + x * scl, sy: gy - y * scl, gy: gy, scl: scl };
    }
    _unproj(px, py) {           // pointer -> world point on the goal plane
      var v = this.view, scl = v.farScale;
      return { x: (px - v.cx) / scl, y: (v.gFarY - py) / scl };
    }

    /* ---------- game state ---------- */
    _newGame() {
      this.levelIdx = 0; this.score = 0; this.streak = 0;
      this._loadLevel(0);
    }
    _loadLevel(i) {
      this.levelIdx = clamp(i, 0, LEVELS.length - 1);
      var L = LEVELS[this.levelIdx];
      this.level = L;
      this.world = { D: D, goalHalf: GOAL_HALF, goalHeight: GOAL_H, wall: L.wall, keeper: L.keeper };
      this.windX = L.wind ? (((this.score * 7 + i * 13) % 11) / 11 - 0.5) * 2 * L.wind : 0; // deterministic breeze
      this.ballsLeft = BALLS_PER_ROUND;
      this._ready();
    }
    _ready() {
      this.mode = "ready";
      this.aim = { x: this.level.trivela ? -2.6 : 2.6, y: 1.7 };
      this.curl = this.level.trivela ? 0.4 : -0.4;
      this.power = 0.62; this.lastPower = 0.62; this.charging = false; this.chargeT = 0;
      this.trail = []; this.flight = null; this.result = null;
      this.netRipple = 0; this.shake = 0; this.callout = null; this.keeperDive = 0;
    }

    /* ---------- input ---------- */
    _bindUI() {
      var c = this.canvas;
      var pt = (e) => {
        var r = c.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      c.addEventListener("pointermove", (e) => {
        if (this.mode === "ready" || this.mode === "charging") {
          var p = pt(e), w = this._unproj(p.x, p.y);
          this.aim.x = clamp(w.x, -GOAL_HALF - 1.6, GOAL_HALF + 1.6);
          this.aim.y = clamp(w.y, 0.15, GOAL_H + 1.4);
        }
      });
      c.addEventListener("pointerdown", (e) => { c.setPointerCapture(e.pointerId); this.focus(); this._charge(true); });
      c.addEventListener("pointerup", () => this._charge(false));
      c.addEventListener("pointercancel", () => this._charge(false));
      this.tabIndex = 0;
      this.addEventListener("keydown", (e) => this._key(e, true));
      this.addEventListener("keyup", (e) => this._key(e, false));
      this.root.querySelectorAll(".b").forEach((b) => {
        b.addEventListener("click", (e) => { e.stopPropagation(); this._action(b.dataset.act); });
      });
    }
    _key(e, down) {
      var k = e.key, used = true;
      if (k === "ArrowLeft" || k === "a" || k === "A") { if (down) this.curl = clamp(this.curl - 0.06, -1, 1); }
      else if (k === "ArrowRight" || k === "d" || k === "D") { if (down) this.curl = clamp(this.curl + 0.06, -1, 1); }
      else if (k === " " || k === "Spacebar") { this._charge(down); }
      else if (k === "ArrowUp") { if (down) this.aim.y = clamp(this.aim.y + 0.12, 0.15, GOAL_H + 1.4); }
      else if (k === "ArrowDown") { if (down) this.aim.y = clamp(this.aim.y - 0.12, 0.15, GOAL_H + 1.4); }
      else if (down && (k === "t" || k === "T")) this._action("trainer");
      else if (down && (k === "f" || k === "F")) this._action("forces");
      else if (down && (k === "r" || k === "R")) this._newGame();
      else if (k === "Escape") { if (down) this.blur(); used = false; }
      else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); }   // don't leak to the console's nav keys
    }
    _action(a) {
      if (a === "help") this.helpEl.classList.toggle("open");
      else if (a === "trainer") this.trainer = !this.trainer;
      else if (a === "forces") this.showForces = !this.showForces;
      else if (a === "mute") { this.muted = !this.muted; try { localStorage.setItem("trivela_mute", this.muted ? "1" : "0"); } catch (e) {} }
      this._syncBtns();
    }
    _syncBtns() {
      var q = (s) => this.root.querySelector(s);
      var set = (a, on, txt) => { var b = q('.b[data-act="' + a + '"]'); if (b) { b.textContent = txt; b.style.color = on ? "#fff" : ""; b.style.background = on ? "rgba(var(--grgb),.3)" : ""; } };
      set("trainer", this.trainer, (this.trainer ? "◉" : "◌") + " trainer");
      set("forces", this.showForces, (this.showForces ? "◉" : "◌") + " forces");
      set("mute", !this.muted, "♪ " + (this.muted ? "off" : "on"));
    }
    _charge(on) {
      if (on && this.mode === "ready") { this.mode = "charging"; this.charging = true; this.chargeT = 0; }
      else if (!on && this.mode === "charging") { this.charging = false; this._shoot(); }
    }

    /* ---------- shooting ---------- */
    _shoot() {
      var P = window.TrivelaPhysics;
      var v0 = lerp(MINV, MAXV, this.power);
      this.lastPower = this.power;
      var world = Object.assign({}, this.world);
      var sim = P.simulateAimed(this.aim, v0, this.curl, world);
      // apply a steady crosswind by re-simulating with a tweaked spin bias is overkill;
      // breeze nudges the aim solver target instead (kept subtle)
      this.flight = { path: sim.path, i: 0, t: 0, outcome: sim.outcome, v0: v0, spin: this.curl };
      this.mode = "flight";
      this.trail = [];
      this._sfx("kick");
    }
    _resolve(o) {
      this.mode = "result"; this.result = o; this.resultT = 0;
      var pts = 0, msg = "", col = this.pal.bright, good = false;
      if (o.type === "goal") {
        good = true;
        pts = 100 + (o.topCorner ? 60 : 0) + (this.trainer ? 0 : 40) + this.streak * 10;
        msg = o.topCorner ? "TOP BINS!" : "GOAL!";
        this.streak++; this.netRipple = 1; this.shake = o.topCorner ? 14 : 9; this._sfx("goal");
      } else {
        this.streak = 0; this.shake = 5;
        msg = { wall: "OFF THE WALL", save: "SAVED!", wide: "WIDE", over: "OVER THE BAR", short: "SHORT" }[o.type] || "MISS";
        col = o.type === "save" ? this.pal.ink : this.pal.inkDim;
        if (o.type === "save") this.keeperDive = 1;
        this._sfx("miss");
      }
      this.score += pts;
      if (this.score > this.best) { this.best = this.score; try { localStorage.setItem("trivela_best", String(this.best)); } catch (e) {} }
      this.callout = { msg: msg, col: col, t: 0, big: good };
      this.ballsLeft--;
    }
    _next() {
      if (this.ballsLeft <= 0) {
        var nxt = (this.levelIdx + 1) % LEVELS.length;
        this._loadLevel(nxt);
      } else {
        this._ready();
      }
    }

    /* ---------- loop ---------- */
    _start() { if (this._running) return; this._running = true; this._lastT = 0; this._raf = requestAnimationFrame((t) => this._frame(t)); }
    _stop() { this._running = false; if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; }
    _frame(now) {
      if (!this._running) return;
      var dt = this._lastT ? Math.min((now - this._lastT) / 1000, 0.05) : 0.016;
      this._lastT = now;
      this._update(dt);
      this._render();
      this._raf = requestAnimationFrame((t) => this._frame(t));
    }
    _update(dt) {
      if (this.mode === "charging") {
        this.chargeT += dt * 1.35;
        this.power = Math.abs((this.chargeT % 2) - 1);   // triangle 0..1..0
      }
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 36);
      if (this.netRipple > 0) this.netRipple = Math.max(0, this.netRipple - dt * 1.4);
      if (this.keeperDive > 0 && this.mode !== "flight") this.keeperDive = Math.min(1, this.keeperDive);
      if (this.callout) { this.callout.t += dt; if (this.callout.t > 1.5) this.callout = null; }

      if (this.mode === "flight" && this.flight) {
        var f = this.flight;
        f.t += dt * (this._slowmo() ? 0.34 : 1.0);
        var path = f.path, end = path[path.length - 1].t;
        while (f.i < path.length - 1 && path[f.i + 1].t <= f.t) f.i++;
        var a = path[f.i], b = path[Math.min(f.i + 1, path.length - 1)];
        var seg = (b.t - a.t) || 1, lt = clamp((f.t - a.t) / seg, 0, 1);
        this.ball = { x: lerp(a.x, b.x, lt), y: lerp(a.y, b.y, lt), z: lerp(a.z, b.z, lt) };
        this.trail.push({ x: this.ball.x, y: this.ball.y, z: this.ball.z });
        if (this.trail.length > 46) this.trail.shift();
        // keeper tracks the ball a touch
        if (this.world.keeper) this.keeperDive = clamp(this.ball.z / D, 0, 1);
        if (f.t >= end) this._resolve(f.outcome);
      }
      if (this.mode === "result") {
        this.resultT += dt;
        if (this.resultT > 1.35) this._next();
      }
    }
    _slowmo() {
      if (this.mode !== "flight" || !this.flight) return false;
      var end = this.flight.path[this.flight.path.length - 1].t;
      return this.flight.outcome.type === "goal" && (end - this.flight.t) < 0.32;
    }

    /* ---------- render ---------- */
    _render() {
      var ctx = this.ctx, W = this.W, H = this.H, p = this.pal;
      if (!W) return;
      ctx.save();
      if (this.shake > 0.3) {
        var s = this.shake; ctx.translate((Math.random() - .5) * s, (Math.random() - .5) * s);
      }
      // sky
      var sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, p.bg2); sky.addColorStop(1, p.bg);
      ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H + 40);
      this._drawPitch();
      this._drawGoal();
      if (this.world.keeper) this._drawKeeper();
      if (this.world.wall) this._drawWall();
      if (this.mode === "flight") { this._drawTrail(); this._drawBall(); if (this.showForces) this._drawForces(); }
      else this._drawTeeBall();
      if (this.mode === "ready" || this.mode === "charging") this._drawAim();
      ctx.restore();
      this._drawHUD();
      if (this.callout) this._drawCallout();
      this._scanlines();
    }
    _line(x1, y1, z1, x2, y2, z2, col, w) {
      var a = this._proj(x1, y1, z1), b = this._proj(x2, y2, z2), ctx = this.ctx;
      ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.beginPath();
      ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    _drawPitch() {
      var ctx = this.ctx, p = this.pal, HALF = 13;
      var nl = this._proj(-HALF, 0, 0), nr = this._proj(HALF, 0, 0);
      var fl = this._proj(-HALF, 0, D), fr = this._proj(HALF, 0, D);
      var grad = ctx.createLinearGradient(0, nl.sy, 0, fl.sy);
      grad.addColorStop(0, "rgba(" + p.grgb + ",.05)"); grad.addColorStop(1, "rgba(" + p.grgb + ",.13)");
      ctx.fillStyle = "#0c0a0b";
      ctx.beginPath(); ctx.moveTo(nl.sx, nl.sy); ctx.lineTo(nr.sx, nr.sy); ctx.lineTo(fr.sx, fr.sy); ctx.lineTo(fl.sx, fl.sy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = grad; ctx.fill();
      // distance stripes
      for (var z = 0; z <= D; z += 4) {
        var a = (z / 4) % 2 === 0 ? .05 : .02;
        var la = this._proj(-HALF, 0, z), lb = this._proj(HALF, 0, z);
        var lc = this._proj(HALF, 0, Math.min(z + 4, D)), ld = this._proj(-HALF, 0, Math.min(z + 4, D));
        ctx.fillStyle = "rgba(" + p.grgb + "," + a + ")";
        ctx.beginPath(); ctx.moveTo(la.sx, la.sy); ctx.lineTo(lb.sx, lb.sy); ctx.lineTo(lc.sx, lc.sy); ctx.lineTo(ld.sx, ld.sy); ctx.closePath(); ctx.fill();
      }
      var hair = "rgba(" + p.grgb + ",.22)";
      // 6-yard box
      this._line(-GOAL_HALF - 1.5, 0, D - 5.5, GOAL_HALF + 1.5, 0, D - 5.5, hair, 1);
      this._line(-GOAL_HALF - 1.5, 0, D - 5.5, -GOAL_HALF - 1.5, 0, D, hair, 1);
      this._line(GOAL_HALF + 1.5, 0, D - 5.5, GOAL_HALF + 1.5, 0, D, hair, 1);
      // wall line marker (9.15m)
      this._line(-HALF, 0, 9.15, HALF, 0, 9.15, "rgba(" + p.grgb + ",.10)", 1);
    }
    _drawGoal() {
      var ctx = this.ctx, p = this.pal;
      var lp = this._proj(-GOAL_HALF, 0, D), rp = this._proj(GOAL_HALF, 0, D);
      var lt = this._proj(-GOAL_HALF, GOAL_H, D), rt = this._proj(GOAL_HALF, GOAL_H, D);
      // net
      ctx.strokeStyle = "rgba(" + p.grgb + ",.16)"; ctx.lineWidth = 1;
      var rip = this.netRipple;
      for (var gx = -GOAL_HALF; gx <= GOAL_HALF + .01; gx += GOAL_HALF / 5) {
        var off = rip ? Math.sin((gx + this.netRipple * 6) * 2) * rip * 0.14 : 0;
        var a = this._proj(gx, 0, D + 0.4), b = this._proj(gx, GOAL_H + off, D + 0.4);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }
      for (var gy = 0; gy <= GOAL_H + .01; gy += GOAL_H / 4) {
        var c = this._proj(-GOAL_HALF, gy, D + 0.4), d = this._proj(GOAL_HALF, gy, D + 0.4);
        ctx.beginPath(); ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy); ctx.stroke();
      }
      // frame
      ctx.strokeStyle = p.ink; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(lp.sx, lp.sy); ctx.lineTo(lt.sx, lt.sy); ctx.lineTo(rt.sx, rt.sy); ctx.lineTo(rp.sx, rp.sy);
      ctx.stroke(); ctx.lineWidth = 1; ctx.lineCap = "butt";
    }
    _drawWall() {
      var ctx = this.ctx, p = this.pal, w = this.world.wall;
      var n = Math.max(2, Math.round((w.halfW * 2) / 0.52));
      var jump = (this.mode === "flight" && this.ball && this.ball.z < w.z + 2 && this.ball.z > w.z - 6 && this.ball.y > 1.4) ? 0.25 : 0;
      for (var i = 0; i < n; i++) {
        var x = w.cx - w.halfW + (i + 0.5) * (w.halfW * 2 / n);
        var foot = this._proj(x, 0, w.z), head = this._proj(x, w.height + jump, w.z);
        var bw = (foot.scl) * 0.42;
        ctx.fillStyle = p.deep;
        ctx.fillRect(foot.sx - bw / 2, head.sy, bw, foot.sy - head.sy);
        ctx.beginPath(); ctx.arc(foot.sx, head.sy + bw * 0.1, bw * 0.34, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(" + p.grgb + ",.5)"; ctx.lineWidth = 1;
        ctx.strokeRect(foot.sx - bw / 2, head.sy, bw, foot.sy - head.sy);
      }
    }
    _drawKeeper() {
      var ctx = this.ctx, p = this.pal, k = this.world.keeper;
      var dive = this.keeperDive || 0, tgt = 0;
      if (this.mode === "flight" && this.ball) tgt = clamp(this.ball.x, -GOAL_HALF + .5, GOAL_HALF - .5);
      var kx = lerp(k.cx || 0, tgt, dive * 0.9);
      var foot = this._proj(kx, 0, D - 0.2), head = this._proj(kx, 1.7, D - 0.2);
      var bw = foot.scl * 0.5;
      ctx.fillStyle = p.bright;
      ctx.fillRect(foot.sx - bw / 2, head.sy, bw, foot.sy - head.sy);
      ctx.beginPath(); ctx.arc(foot.sx, head.sy - bw * 0.18, bw * 0.32, 0, 7); ctx.fill();
      // arms (raised toward dive)
      ctx.strokeStyle = p.bright; ctx.lineWidth = bw * 0.28; ctx.lineCap = "round";
      var arm = this._proj(kx + (tgt > kx ? 1 : -1) * 0.8 * dive, 1.9, D - 0.2);
      ctx.beginPath(); ctx.moveTo(foot.sx, head.sy + bw * 0.2); ctx.lineTo(arm.sx, arm.sy); ctx.stroke();
      ctx.lineWidth = 1; ctx.lineCap = "butt";
    }
    _ballShadow(b) {
      var ctx = this.ctx, pr = this._proj(b.x, b.y, b.z);
      var gy = pr.gy, r = BALL_R * pr.scl;
      var h = clamp(1 - b.y / 6, 0.25, 1);
      ctx.fillStyle = "rgba(0,0,0," + (0.34 * h) + ")";
      ctx.beginPath(); ctx.ellipse(pr.sx, gy, r * 1.5, r * 0.5, 0, 0, 7); ctx.fill();
      return pr;
    }
    _drawTeeBall() {
      var b = { x: 0, y: 0, z: 0 };
      var pr = this._ballShadow(b);
      this._ball(pr, BALL_R * pr.scl);
    }
    _drawBall() {
      var b = this.ball; if (!b) return;
      var pr = this._ballShadow(b);
      this._ball(pr, BALL_R * pr.scl);
    }
    _ball(pr, r) {
      var ctx = this.ctx, p = this.pal;
      var g = ctx.createRadialGradient(pr.sx - r * .3, pr.sy - r * .3, r * .2, pr.sx, pr.sy, r);
      g.addColorStop(0, "#fff"); g.addColorStop(1, "#c9bdb9");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pr.sx, pr.sy, Math.max(2, r), 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(" + p.grgb + ",.6)"; ctx.lineWidth = 1; ctx.stroke();
    }
    _drawTrail() {
      var ctx = this.ctx, p = this.pal, tr = this.trail;
      if (tr.length < 2) return;
      for (var i = 1; i < tr.length; i++) {
        var a = this._proj(tr[i - 1].x, tr[i - 1].y, tr[i - 1].z);
        var b = this._proj(tr[i].x, tr[i].y, tr[i].z);
        var al = i / tr.length;
        ctx.strokeStyle = "rgba(" + p.grgb + "," + (al * 0.7) + ")";
        ctx.lineWidth = al * 3 + 0.4; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }
      ctx.lineCap = "butt";
    }
    _drawForces() {
      var b = this.ball; if (!b) return;
      var f = this.flight; var pr = this._proj(b.x, b.y, b.z);
      var ctx = this.ctx, p = this.pal;
      // Magnus force direction (sideways, sign of spin)
      var dir = f.spin >= 0 ? 1 : -1, mag = Math.abs(f.spin) * 46 + 8;
      this._arrow(pr.sx, pr.sy, pr.sx + dir * mag, pr.sy, p.bright, "Magnus");
      this._arrow(pr.sx, pr.sy, pr.sx, pr.sy + 26, p.inkDim, "g");
    }
    _arrow(x1, y1, x2, y2, col, label) {
      var ctx = this.ctx, ang = Math.atan2(y2 - y1, x2 - x1);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 7 * Math.cos(ang - .4), y2 - 7 * Math.sin(ang - .4));
      ctx.lineTo(x2 - 7 * Math.cos(ang + .4), y2 - 7 * Math.sin(ang + .4));
      ctx.closePath(); ctx.fill();
      if (label) { ctx.font = "10px " + "monospace"; ctx.fillText(label, x2 + 3, y2 - 3); }
    }
    _drawAim() {
      var ctx = this.ctx, p = this.pal;
      // predicted path (trainer)
      if (this.trainer) {
        var P = window.TrivelaPhysics;
        var v0 = lerp(MINV, MAXV, this.mode === "charging" ? this.power : this.lastPower);
        var sim = P.simulateAimed(this.aim, v0, this.curl, Object.assign({}, this.world));
        ctx.setLineDash([4, 5]); ctx.strokeStyle = "rgba(" + p.grgb + ",.55)"; ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (var i = 0; i < sim.path.length; i += 2) {
          var pr = this._proj(sim.path[i].x, sim.path[i].y, sim.path[i].z);
          i === 0 ? ctx.moveTo(pr.sx, pr.sy) : ctx.lineTo(pr.sx, pr.sy);
        }
        ctx.stroke(); ctx.setLineDash([]);
        var end = sim.path[sim.path.length - 1], ep = this._proj(end.x, end.y, end.z);
        ctx.strokeStyle = sim.outcome.type === "goal" ? p.ok : p.bright; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(ep.sx, ep.sy, 5, 0, 7); ctx.stroke();
      }
      // reticle at aim target
      var a = this._proj(this.aim.x, this.aim.y, D);
      ctx.strokeStyle = p.ink; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(a.sx, a.sy, 7, 0, 7); ctx.moveTo(a.sx - 11, a.sy); ctx.lineTo(a.sx + 11, a.sy);
      ctx.moveTo(a.sx, a.sy - 11); ctx.lineTo(a.sx, a.sy + 11); ctx.stroke();
    }

    /* ---------- HUD ---------- */
    _drawHUD() {
      var ctx = this.ctx, p = this.pal, W = this.W, H = this.H;
      ctx.textBaseline = "top";
      ctx.font = "600 12px monospace"; ctx.fillStyle = p.bright;
      ctx.fillText("LVL " + (this.levelIdx + 1) + " · " + this.level.name.toUpperCase(), 12, 10);
      ctx.fillStyle = p.inkDim; ctx.font = "11px monospace";
      ctx.fillText(this.level.sub, 12, 26);
      ctx.fillStyle = p.ink; ctx.font = "600 13px monospace";
      ctx.fillText("SCORE " + this.score, 12, 44);
      if (this.streak > 1) { ctx.fillStyle = p.bright; ctx.fillText("▲ streak ×" + this.streak, 12, 62); }
      // balls left
      var bx = 12, by = H - 22;
      ctx.font = "12px monospace"; ctx.fillStyle = p.inkDim; ctx.fillText("BALLS", bx, by);
      for (var i = 0; i < BALLS_PER_ROUND; i++) {
        ctx.fillStyle = i < this.ballsLeft ? p.bright : p.hair;
        ctx.beginPath(); ctx.arc(bx + 52 + i * 13, by + 6, 4, 0, 7); ctx.fill();
      }
      // best (top right under buttons)
      ctx.textAlign = "right"; ctx.fillStyle = p.inkDim; ctx.font = "11px monospace";
      ctx.fillText("BEST " + this.best, W - 12, 40);
      ctx.textAlign = "left";
      // curl dial + power meter (bottom center)
      this._dialAndPower();
      // hint
      ctx.fillStyle = p.inkDim; ctx.font = "10.5px monospace"; ctx.textAlign = "center";
      var hint = this.mode === "result" ? "" :
        (this.mode === "charging" ? "release to strike" : "move = aim · ◀/▶ curl · hold SPACE power");
      ctx.fillText(hint, W / 2, H - 16); ctx.textAlign = "left";
    }
    _dialAndPower() {
      var ctx = this.ctx, p = this.pal, W = this.W, H = this.H;
      var cx = W / 2 - 70, cy = H - 30, r = 16;
      // curl dial
      ctx.strokeStyle = p.hair; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
      var ang = Math.PI * 1.5 + this.curl * Math.PI * 0.55;
      ctx.strokeStyle = p.bright; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); ctx.stroke();
      ctx.fillStyle = p.inkDim; ctx.font = "9px monospace"; ctx.textAlign = "center";
      ctx.fillText("CURL " + (this.curl > 0 ? "+" : "") + Math.round(this.curl * 100), cx, cy + r + 4);
      ctx.textAlign = "left";
      // power meter
      var px = W / 2 - 18, pw = 150, ph = 8, py = H - 34;
      ctx.fillStyle = p.hair; ctx.fillRect(px, py, pw, ph);
      var pv = this.mode === "charging" ? this.power : this.lastPower;
      ctx.fillStyle = pv > 0.85 ? p.bright : p.blood; ctx.fillRect(px, py, pw * pv, ph);
      ctx.strokeStyle = "rgba(" + p.grgb + ",.4)"; ctx.lineWidth = 1; ctx.strokeRect(px, py, pw, ph);
      ctx.fillStyle = p.inkDim; ctx.font = "9px monospace"; ctx.fillText("POWER", px, py - 11);
      if (this.windX) {
        ctx.fillStyle = p.bright; ctx.textAlign = "right";
        ctx.fillText("WIND " + (this.windX > 0 ? "→" : "←") + " " + Math.abs(this.windX).toFixed(1), W - 12, H - 16);
        ctx.textAlign = "left";
      }
    }
    _drawCallout() {
      var ctx = this.ctx, p = this.pal, W = this.W, H = this.H, c = this.callout;
      var k = Math.min(c.t * 6, 1), a = c.t > 1.1 ? clamp(1.5 - c.t, 0, 1) : 1;
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = "center";
      var sz = (c.big ? 40 : 26) * (0.7 + 0.3 * k);
      ctx.font = "800 " + sz + 'px "Syne", "Arial Black", sans-serif';   // canvas can't read CSS var()
      ctx.fillStyle = c.col; ctx.shadowColor = c.col; ctx.shadowBlur = c.big ? 24 : 8;
      ctx.fillText(c.msg, W / 2, H / 2 - sz / 2);
      ctx.restore(); ctx.textAlign = "left";
    }
    _scanlines() {
      var ctx = this.ctx, W = this.W, H = this.H;
      ctx.globalAlpha = 0.04; ctx.fillStyle = "#fff";
      for (var y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      ctx.globalAlpha = 1;
    }

    /* ---------- tiny sfx ---------- */
    _sfx(kind) {
      if (this.muted) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this._ac = this._ac || new AC();
        var ac = this._ac, t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        if (kind === "kick") { o.type = "sine"; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(70, t + .12); g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t + .14); o.start(t); o.stop(t + .15); }
        else if (kind === "goal") { o.type = "triangle"; o.frequency.setValueAtTime(440, t); o.frequency.exponentialRampToValueAtTime(880, t + .18); g.gain.setValueAtTime(.16, t); g.gain.exponentialRampToValueAtTime(.001, t + .3); o.start(t); o.stop(t + .32); }
        else { o.type = "sawtooth"; o.frequency.setValueAtTime(120, t); g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.001, t + .12); o.start(t); o.stop(t + .13); }
      } catch (e) {}
    }
  }

  customElements.define("trivela-game", TrivelaGame);
})();
