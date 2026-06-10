/* ============================================================
   <trivela-game> — a free-kick game that teaches the Magnus effect.
   Vanilla custom element, shadow DOM, no deps.
   Requires physics.js loaded first (window.TrivelaPhysics).
   Inherits theme from host CSS vars (--blood, --ink, ...) with fallbacks.

   UX: the PITCH is for aiming only (drag the target). All controls live in
   a bezel deck at the bottom — CURL slider, POWER slider, STRIKE button —
   so on-screen controls never collide with the play surface.
   ============================================================ */
(function () {
  "use strict";
  if (customElements.get("trivela-game")) return;

  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  var LEVELS = [
    { name: "warm-up", sub: "just bend it in", wall: null, keeper: null },
    { name: "the keeper", sub: "beat him in a corner", wall: null,
      keeper: { cover: 1.2, reach: 2.5, lowReach: 1.3, height: 1.85, cx: 0 } },
    { name: "the wall", sub: "curl it round the near post",
      wall: { z: 9.15, halfW: 1.4, height: 2.0, cx: 1.5 },
      keeper: { cover: 1.2, reach: 2.6, lowReach: 1.35, height: 1.85, cx: -0.3 } },
    { name: "trivela", sub: "outside of the foot → far corner",
      wall: { z: 9.15, halfW: 1.5, height: 2.05, cx: -1.6 },
      keeper: { cover: 1.3, reach: 2.7, lowReach: 1.4, height: 1.9, cx: 0.5 }, trivela: true }
  ];
  var BALLS_PER_ROUND = 5;
  var MINV = 19, MAXV = 31;          // power 0..1 -> launch speed (m/s)
  var BALL_R = 0.16, D = 22;
  var GOAL_HALF = 3.66, GOAL_H = 2.44;

  function helpBody() {
    return '' +
      '<h3>Why the ball bends — the Magnus effect</h3>' +
      '<p><b>Five-year-old version:</b> a spinning ball drags the air faster on' +
      ' one side. Faster air pushes <em>softer</em>, so the ball gets sucked' +
      ' toward its fast-spinning side — and <em>curves</em>. Spin it with the' +
      ' outside of your foot (a <em>trivela</em>) and it bends the other way.</p>' +
      '<h4>The physics</h4>' +
      '<p>Sideways spin <b>S</b> + forward speed <b>v</b> = a sideways force' +
      ' <b>F = S × v</b>. More spin or more pace → more bend.</p>' +
      '<h4>The actual code this game runs</h4>' +
      '<pre>ax = magnus * spin * vz   // sideways curl (Magnus)\n' +
      'ay = -g - drag * vy        // gravity + air\n' +
      'v += a*dt;  pos += v*dt;   // integrate</pre>' +
      '<h4>Levels</h4>' +
      '<p>Four of them — clear <b>5 balls</b> to advance: <em>1</em> warm-up ·' +
      ' <em>2</em> the keeper · <em>3</em> the wall · <em>4</em> trivela.</p>' +
      '<h4>How to play</h4>' +
      '<p><b>Drag the pitch</b> to aim the target. Set <b>CURL</b> and' +
      ' <b>POWER</b> on the deck, then hit <b>STRIKE</b>. The dotted line is' +
      ' the trainer — it shows where the ball will go. Beat the keeper in a' +
      ' top corner; he can’t reach up there.</p>';
  }

  var TEMPLATE =
    '<style>' +
    ':host{display:block;position:relative;width:100%;height:100%;min-height:300px;' +
      'font-family:var(--mono,"Spline Sans Mono",ui-monospace,monospace);color:var(--ink,#f6ece9);' +
      '--g:var(--blood,#e0102f);--gb:var(--blood-bright,#ff2f47);--grgb:var(--glow-rgb,224,16,47);' +
      '--ok:var(--ok,#3fcf8e);--hair:var(--hairline,#2c171a);--dim:var(--ink-dim,#9c8884);' +
      '--surf:var(--surface,#150c0f);--bg2:var(--bg-2,#110b0d);}' +
    '.wrap{position:absolute;inset:0;display:flex;flex-direction:column;}' +
    '.pitch{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;}' +
    'canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none;}' +
    'canvas:active{cursor:grabbing;}' +
    /* top HUD overlay (read-only, lets drags pass through) */
    '.hud{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;' +
      'align-items:flex-start;padding:.5rem .6rem;pointer-events:none;gap:.5rem;z-index:2;}' +
    '.board{pointer-events:none;background:rgba(8,5,6,.64);border:1px solid rgba(var(--grgb),.45);border-radius:9px;' +
      'padding:.42rem .55rem;box-shadow:0 0 18px -6px rgba(var(--grgb),.6),inset 0 0 0 1px rgba(var(--grgb),.06);min-width:152px;}' +
    '.board__top{display:flex;align-items:center;justify-content:space-between;gap:.5rem;}' +
    '.board__top .lvl{color:var(--gb);font-weight:700;font-size:.72rem;letter-spacing:.04em;}' +
    '.pips{letter-spacing:2px;font-size:.6rem;color:var(--gb);}' +
    '.board__name{font-size:.62rem;color:var(--ink-soft,#ddccc9);text-transform:uppercase;letter-spacing:.1em;margin:.12rem 0 .3rem;}' +
    '.board__row{display:flex;justify-content:space-between;gap:.7rem;font-size:.72rem;margin-top:.14rem;}' +
    '.cell{display:flex;gap:.32rem;align-items:baseline;} .cell i{color:var(--dim);font-style:normal;font-size:.56rem;letter-spacing:.08em;}' +
    '.cell b{color:var(--ink,#f6ece9);font-weight:600;} .balls{letter-spacing:1px;color:var(--gb);} .streak{color:var(--gb);font-size:.68rem;align-self:center;}' +
    '.banner{position:absolute;top:13%;left:50%;transform:translate(-50%,-8px);pointer-events:none;z-index:4;text-align:center;opacity:0;transition:opacity .35s,transform .35s;}' +
    '.banner.show{opacity:1;transform:translate(-50%,0);}' +
    '.banner .bg{display:block;font-family:var(--display,"Syne",sans-serif);font-weight:800;font-size:1.45rem;color:var(--gb);text-shadow:0 2px 12px rgba(var(--grgb),.6);}' +
    '.banner .bs{display:block;font-size:.66rem;color:var(--ink-soft,#ddccc9);text-transform:uppercase;letter-spacing:.16em;margin-top:.1rem;}' +
    '.hud__r{display:flex;gap:.3rem;pointer-events:auto;}' +
    '.t{font:inherit;font-size:.7rem;color:var(--ink,#f6ece9);background:rgba(var(--grgb),.14);' +
      'border:1px solid rgba(var(--grgb),.5);border-radius:6px;padding:.16rem .4rem;cursor:pointer;line-height:1;}' +
    '.t:hover{background:rgba(var(--grgb),.3);} .t[aria-pressed="true"]{background:rgba(var(--grgb),.34);color:#fff;}' +
    '.aimhint{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);pointer-events:none;' +
      'font-size:.78rem;color:var(--ink,#f6ece9);background:rgba(8,5,6,.6);border:1px solid rgba(var(--grgb),.5);' +
      'border-radius:999px;padding:.3rem .8rem;z-index:2;transition:opacity .4s;text-shadow:0 1px 3px #000;}' +
    '.aimhint.gone{opacity:0;}' +
    /* the bezel / control deck */
    '.deck{flex:0 0 auto;display:flex;align-items:center;gap:.7rem;padding:.55rem .7rem;' +
      'background:linear-gradient(180deg,var(--bg2),#0a0708);border-top:1px solid rgba(var(--grgb),.34);' +
      'box-shadow:0 -8px 24px -12px #000, inset 0 1px 0 rgba(var(--grgb),.12);z-index:3;}' +
    '.ctrl{flex:1 1 0;min-width:0;}' +
    '.ctrl label{display:flex;justify-content:space-between;font-size:.62rem;letter-spacing:.14em;' +
      'text-transform:uppercase;color:var(--dim);margin-bottom:.18rem;}' +
    '.ctrl label .v{color:var(--gb);font-weight:600;letter-spacing:.04em;}' +
    'input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:20px;background:transparent;cursor:pointer;display:block;}' +
    'input[type=range]::-webkit-slider-runnable-track{height:5px;border-radius:3px;' +
      'background:linear-gradient(90deg,rgba(var(--grgb),.7),rgba(var(--grgb),.18));border:1px solid var(--hair);}' +
    'input[type=range]::-moz-range-track{height:5px;border-radius:3px;background:rgba(var(--grgb),.3);border:1px solid var(--hair);}' +
    'input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;margin-top:-7px;' +
      'border-radius:50%;background:var(--gb);border:2px solid #0a0708;box-shadow:0 0 8px rgba(var(--grgb),.7);}' +
    'input[type=range]::-moz-range-thumb{width:15px;height:15px;border-radius:50%;background:var(--gb);border:2px solid #0a0708;box-shadow:0 0 8px rgba(var(--grgb),.7);}' +
    'input[type=range]:focus-visible{outline:2px solid var(--gb);outline-offset:3px;border-radius:4px;}' +
    '.strike{flex:0 0 auto;font:inherit;font-weight:700;letter-spacing:.06em;font-size:.92rem;color:var(--on-blood,#fff);' +
      'background:var(--g);border:1px solid var(--gb);border-radius:9px;padding:.6rem 1.15rem;cursor:pointer;' +
      'box-shadow:0 0 18px rgba(var(--grgb),.45);transition:transform .08s,box-shadow .2s,filter .2s;white-space:nowrap;}' +
    '.strike:hover{filter:brightness(1.12);box-shadow:0 0 26px rgba(var(--grgb),.7);}' +
    '.strike:active{transform:translateY(1px) scale(.98);}' +
    '.strike:disabled{opacity:.4;cursor:default;box-shadow:none;filter:none;}' +
    '.strike small{display:block;font-weight:400;font-size:.56rem;letter-spacing:.1em;opacity:.8;}' +
    '@media (max-width:560px){.strike{padding:.6rem .8rem;font-size:.82rem;} .deck{gap:.5rem;}}' +
    /* help overlay */
    '.help{position:absolute;inset:0;z-index:6;display:none;overflow:auto;padding:1.1rem 1.2rem;' +
      'background:rgba(8,5,6,.95);backdrop-filter:blur(2px);font-size:.82rem;line-height:1.6;}' +
    '.help.open{display:block;} .help h3{font-family:var(--display,"Syne",sans-serif);color:var(--gb);font-size:1.05rem;margin:0 0 .5rem;}' +
    '.help h4{color:var(--gb);margin:1rem 0 .25rem;font-size:.72rem;text-transform:uppercase;letter-spacing:.12em;}' +
    '.help p{margin:.35rem 0;color:var(--ink-soft,#ddccc9);} .help b{color:var(--ink,#f6ece9);} .help em{color:var(--gb);font-style:normal;}' +
    '.help pre{background:rgba(var(--grgb),.08);border:1px solid rgba(var(--grgb),.3);border-radius:7px;padding:.6rem .7rem;overflow:auto;color:var(--ink,#f6ece9);font-size:.74rem;margin:.4rem 0;}' +
    '.help .x{position:sticky;top:0;float:right;}' +
    '</style>' +
    '<div class="wrap">' +
      '<div class="pitch">' +
        '<canvas></canvas>' +
        '<div class="hud">' +
          '<div class="board" title="Your progress">' +
            '<div class="board__top"><b class="lvl">LEVEL 1/4</b><span class="pips"></span></div>' +
            '<div class="board__name lvlname">warm-up</div>' +
            '<div class="board__row"><span class="cell"><i>SCORE</i><b class="score">0</b></span><span class="cell"><i>BEST</i><b class="best">0</b></span></div>' +
            '<div class="board__row"><span class="cell"><i>BALLS</i><b class="balls">●●●●●</b></span><span class="streak"></span></div>' +
          '</div>' +
          '<div class="hud__r">' +
            '<button class="t" data-act="trainer" aria-pressed="true" title="Trainer line — shows where the ball will go. Toggle off for +40 pts a goal.">◎ aim</button>' +
            '<button class="t" data-act="mute" aria-pressed="false" title="Sound on / off">♪</button>' +
            '<button class="t" data-act="help" title="How to play &amp; the physics">?</button>' +
          '</div>' +
        '</div>' +
        '<div class="banner"></div>' +
        '<div class="aimhint">⊕ drag here to aim</div>' +
      '</div>' +
      '<div class="deck">' +
        '<div class="ctrl" title="Curl — how much the ball swerves in flight (the Magnus effect). Drag left or right.">' +
          '<label>curl / swerve <span class="v vcurl">0</span></label>' +
          '<input type="range" class="curl" min="-100" max="100" value="0" step="1" aria-label="curl — how much the ball swerves"></div>' +
        '<div class="ctrl" title="Power — how hard you strike the ball.">' +
          '<label>power <span class="v vpow">70</span></label>' +
          '<input type="range" class="pow" min="25" max="100" value="70" step="1" aria-label="power"></div>' +
        '<button class="strike" type="button" title="Strike the ball (or press Space)">STRIKE<small>space</small></button>' +
      '</div>' +
      '<div class="help"><button class="t x" data-act="help">✕ close</button>' + helpBody() + '</div>' +
    '</div>';

  class TrivelaGame extends HTMLElement {
    constructor() {
      super();
      this.root = this.attachShadow({ mode: "open" });
      this._raf = 0; this._running = false; this._lastT = 0;
      this.trail = []; this.pal = {};
      this.trainer = true; this.muted = false; this._aimed = false;
      try { this.muted = localStorage.getItem("trivela_mute") === "1"; } catch (e) {}
      this.best = 0; try { this.best = +localStorage.getItem("trivela_best") || 0; } catch (e) {}
    }

    connectedCallback() {
      if (!window.TrivelaPhysics) return void setTimeout(() => this.connectedCallback(), 60);
      this.root.innerHTML = TEMPLATE;
      var q = (s) => this.root.querySelector(s);
      this.pitchEl = q(".pitch");
      this.canvas = q("canvas");
      this.ctx = this.canvas.getContext("2d");
      this.helpEl = q(".help");
      this.curlEl = q(".curl"); this.powEl = q(".pow");
      this.btnStrike = q(".strike");
      this.elLvl = q(".lvl"); this.elLvlName = q(".lvlname"); this.elScore = q(".score");
      this.elStreak = q(".streak"); this.elBalls = q(".balls"); this.elHint = q(".aimhint");
      this.elBest = q(".best"); this.elPips = q(".pips"); this.elBanner = q(".banner");
      this.elVcurl = q(".vcurl"); this.elVpow = q(".vpow");
      this._bindUI();
      this._newGame();
      this._refreshPalette();
      this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this.pitchEl);
      this._io = new IntersectionObserver((es) => { es.some((e) => e.isIntersecting) ? this._start() : this._stop(); }, { threshold: 0.02 });
      this._io.observe(this);
      this._mo = new MutationObserver(() => this._refreshPalette());
      this._mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
      this._onVis = () => { document.hidden ? this._stop() : this._start(); };
      document.addEventListener("visibilitychange", this._onVis);
      this._resize(); this._syncHud(); this._syncControls();
    }
    disconnectedCallback() {
      this._stop();
      this._ro && this._ro.disconnect(); this._io && this._io.disconnect(); this._mo && this._mo.disconnect();
      document.removeEventListener("visibilitychange", this._onVis);
    }

    _refreshPalette() {
      var cs = getComputedStyle(this), g = (n, f) => (cs.getPropertyValue(n).trim() || f);
      this.pal = {
        bg: g("--bg", "#0a0708"), bg2: g("--bg-2", "#150c0f"),
        ink: g("--ink", "#f6ece9"), inkSoft: g("--ink-soft", "#ddccc9"), inkDim: g("--ink-dim", "#9c8884"),
        blood: g("--blood", "#e0102f"), bright: g("--blood-bright", "#ff2f47"),
        deep: g("--blood-deep", "#5c0a14"), hair: g("--hairline", "#2c171a"),
        ok: g("--ok", "#3fcf8e"), grgb: g("--glow-rgb", "224,16,47")
      };
    }

    _resize() {
      var r = this.pitchEl.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = r.width; this.H = r.height;
      this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var W = this.W, H = this.H, fs = (0.46 * W) / (2 * GOAL_HALF);
      this.view = { cx: W / 2, farScale: fs, nearScale: fs * 2.5, gFarY: H * 0.4, gNearY: H * 0.97 };
    }
    _proj(x, y, z) {
      var v = this.view, t = clamp(z / D, 0, 1);
      var scl = lerp(v.nearScale, v.farScale, t), gy = lerp(v.gNearY, v.gFarY, t);
      return { sx: v.cx + x * scl, sy: gy - y * scl, gy: gy, scl: scl };
    }
    _unproj(px, py) { var v = this.view; return { x: (px - v.cx) / v.farScale, y: (v.gFarY - py) / v.farScale }; }

    _newGame() {
      this.levelIdx = 0; this.score = 0; this.streak = 0;
      this.curl = 0; this.power = 0.7;
      this._loadLevel(0);
    }
    _loadLevel(i) {
      this.levelIdx = clamp(i, 0, LEVELS.length - 1);
      this.level = LEVELS[this.levelIdx];
      this.world = { D: D, goalHalf: GOAL_HALF, goalHeight: GOAL_H, wall: this.level.wall, keeper: this.level.keeper };
      this.ballsLeft = BALLS_PER_ROUND;
      this._ready();
      this._announceLevel();
    }
    _ready() {
      this.mode = "ready";
      this.aim = { x: this.level.trivela ? -2.7 : 2.6, y: 1.7 };
      this.flight = null; this.result = null; this.trail = [];
      this.netRipple = 0; this.shake = 0; this.callout = null; this.keeperDive = 0;
      if (this.btnStrike) this.btnStrike.disabled = false;
      this._syncHud();
    }

    /* ---------- input: pitch aims, deck controls ---------- */
    _bindUI() {
      var c = this.canvas, dragging = false;
      var setAim = (e) => {
        var r = c.getBoundingClientRect(), w = this._unproj(e.clientX - r.left, e.clientY - r.top);
        this.aim.x = clamp(w.x, -GOAL_HALF - 1.7, GOAL_HALF + 1.7);
        this.aim.y = clamp(w.y, 0.15, GOAL_H + 1.5);
        if (!this._aimed) { this._aimed = true; this.elHint && this.elHint.classList.add("gone"); }
      };
      c.addEventListener("pointerdown", (e) => { if (this.mode !== "ready") return; dragging = true; c.setPointerCapture(e.pointerId); setAim(e); });
      c.addEventListener("pointermove", (e) => { if (dragging) setAim(e); });
      c.addEventListener("pointerup", () => { dragging = false; });
      c.addEventListener("pointercancel", () => { dragging = false; });

      this.curlEl.addEventListener("input", () => { this.curl = (+this.curlEl.value) / 100; this._syncControls(); });
      this.powEl.addEventListener("input", () => { this.power = (+this.powEl.value) / 100; this._syncControls(); });
      this.btnStrike.addEventListener("click", () => this._shoot());

      this.root.querySelectorAll(".t").forEach((b) => {
        b.addEventListener("click", (e) => { e.stopPropagation(); this._act(b.dataset.act); });
      });

      // keyboard: keep the game's keys from leaking to the host console
      this.tabIndex = 0;
      this.addEventListener("keydown", (e) => {
        var k = e.key, foc = this.root.activeElement;
        var onControl = foc && (foc.tagName === "INPUT" || foc.tagName === "BUTTON");
        if (k === " " || k === "Enter") {
          if (!onControl || foc === this.btnStrike) { e.preventDefault(); this._shoot(); }
          e.stopPropagation(); return;
        }
        if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
          if (!onControl) {                       // not on a slider → drive curl/power ourselves
            e.preventDefault();
            if (k === "ArrowLeft") this._nudgeCurl(-4);
            else if (k === "ArrowRight") this._nudgeCurl(4);
            else if (k === "ArrowUp") this._nudgePow(4);
            else this._nudgePow(-4);
          }
          e.stopPropagation(); return;            // slider handles it natively; just don't leak
        }
        if (k === "t" || k === "T") { this._act("trainer"); e.preventDefault(); e.stopPropagation(); }
        else if (k === "r" || k === "R") { this._newGame(); e.preventDefault(); e.stopPropagation(); }
        else if (k === "Escape") { this.helpEl.classList.remove("open"); this.blur(); }
      });
    }
    _nudgeCurl(d) { this.curlEl.value = clamp((+this.curlEl.value) + d, -100, 100); this.curl = (+this.curlEl.value) / 100; this._syncControls(); }
    _nudgePow(d) { this.powEl.value = clamp((+this.powEl.value) + d, 25, 100); this.power = (+this.powEl.value) / 100; this._syncControls(); }
    _act(a) {
      if (a === "help") this.helpEl.classList.toggle("open");
      else if (a === "trainer") this.trainer = !this.trainer;
      else if (a === "mute") { this.muted = !this.muted; try { localStorage.setItem("trivela_mute", this.muted ? "1" : "0"); } catch (e) {} }
      this._syncControls();
    }
    _syncControls() {
      var s = (a, on) => { var b = this.root.querySelector('.t[data-act="' + a + '"]'); if (b) b.setAttribute("aria-pressed", on ? "true" : "false"); };
      s("trainer", this.trainer); s("mute", !this.muted);
      var mb = this.root.querySelector('.t[data-act="mute"]'); if (mb) mb.textContent = this.muted ? "♪̸" : "♪";
      if (this.elVcurl) this.elVcurl.textContent = (this.curl > 0 ? "+" : "") + Math.round(this.curl * 100) + (Math.abs(this.curl) < 0.04 ? " straight" : (this.curl > 0 ? " ↻" : " ↺"));
      if (this.elVpow) this.elVpow.textContent = Math.round(this.power * 100);
    }
    _syncHud() {
      if (!this.elLvl) return;
      this.elLvl.textContent = "LEVEL " + (this.levelIdx + 1) + "/" + LEVELS.length;
      this.elLvlName.textContent = this.level.name;
      this.elScore.textContent = this.score;
      if (this.elBest) this.elBest.textContent = this.best;
      this.elStreak.textContent = this.streak > 1 ? "▲×" + this.streak : "";
      var b = "", i; for (i = 0; i < BALLS_PER_ROUND; i++) b += i < this.ballsLeft ? "●" : "○";
      this.elBalls.textContent = b;
      if (this.elPips) { var pp = "", j; for (j = 0; j < LEVELS.length; j++) pp += j <= this.levelIdx ? "●" : "○"; this.elPips.textContent = pp; }
    }
    _announceLevel() {
      if (!this.elBanner) return;
      this.elBanner.innerHTML = '<span class="bg">LEVEL ' + (this.levelIdx + 1) + ' / ' + LEVELS.length + '</span><span class="bs">' + this.level.name + ' — ' + this.level.sub + '</span>';
      this.elBanner.classList.add("show");
      clearTimeout(this._bannerT);
      this._bannerT = setTimeout(() => { if (this.elBanner) this.elBanner.classList.remove("show"); }, 1900);
    }

    /* ---------- shooting ---------- */
    _shoot() {
      if (this.mode !== "ready") return;
      var v0 = lerp(MINV, MAXV, this.power);
      var sim = window.TrivelaPhysics.simulateAimed(this.aim, v0, this.curl, Object.assign({}, this.world));
      this.flight = { path: sim.path, t: 0, i: 0, outcome: sim.outcome, spin: this.curl };
      this.mode = "flight"; this.trail = []; this.btnStrike.disabled = true;
      this._sfx("kick");
    }
    _resolve(o) {
      this.mode = "result"; this.resultT = 0;
      var pts = 0, msg, col = this.pal.bright, good = false;
      if (o.type === "goal") {
        good = true; pts = 100 + (o.topCorner ? 60 : 0) + (this.trainer ? 0 : 40) + this.streak * 10;
        msg = o.topCorner ? "TOP BINS!" : "GOAL!"; this.streak++; this.netRipple = 1; this.shake = o.topCorner ? 14 : 9; this._sfx("goal");
      } else {
        this.streak = 0; this.shake = 5;
        msg = { wall: "OFF THE WALL", save: "SAVED!", wide: "WIDE", over: "OVER THE BAR", short: "SHORT" }[o.type] || "MISS";
        col = o.type === "save" ? this.pal.ink : this.pal.inkDim; if (o.type === "save") this.keeperDive = 1; this._sfx("miss");
      }
      this.score += pts;
      if (this.score > this.best) { this.best = this.score; try { localStorage.setItem("trivela_best", String(this.best)); } catch (e) {} }
      this.callout = { msg: msg, col: col, t: 0, big: good }; this.ballsLeft--; this._syncHud();
    }
    _next() { this.ballsLeft <= 0 ? this._loadLevel((this.levelIdx + 1) % LEVELS.length) : this._ready(); }

    /* ---------- loop ---------- */
    _start() { if (this._running) return; this._running = true; this._lastT = 0; this._resize(); this._raf = requestAnimationFrame((t) => this._frame(t)); }
    _stop() { this._running = false; if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; }
    _frame(now) {
      if (!this._running) return;
      var dt = this._lastT ? Math.min((now - this._lastT) / 1000, 0.05) : 0.016; this._lastT = now;
      this._update(dt); this._render();
      this._raf = requestAnimationFrame((t) => this._frame(t));
    }
    _update(dt) {
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 36);
      if (this.netRipple > 0) this.netRipple = Math.max(0, this.netRipple - dt * 1.4);
      if (this.callout) { this.callout.t += dt; if (this.callout.t > 1.5) this.callout = null; }
      if (this.mode === "flight" && this.flight) {
        var f = this.flight, path = f.path, end = path[path.length - 1].t;
        f.t += dt * (this._slowmo() ? 0.34 : 1);
        while (f.i < path.length - 1 && path[f.i + 1].t <= f.t) f.i++;
        var a = path[f.i], b = path[Math.min(f.i + 1, path.length - 1)], seg = (b.t - a.t) || 1, lt = clamp((f.t - a.t) / seg, 0, 1);
        this.ball = { x: lerp(a.x, b.x, lt), y: lerp(a.y, b.y, lt), z: lerp(a.z, b.z, lt) };
        this.trail.push({ x: this.ball.x, y: this.ball.y, z: this.ball.z }); if (this.trail.length > 46) this.trail.shift();
        if (this.world.keeper) this.keeperDive = clamp(this.ball.z / D, 0, 1);
        if (f.t >= end) this._resolve(f.outcome);
      }
      if (this.mode === "result") { this.resultT += dt; if (this.resultT > 1.35) this._next(); }
    }
    _slowmo() { if (this.mode !== "flight" || !this.flight) return false; var end = this.flight.path[this.flight.path.length - 1].t; return this.flight.outcome.type === "goal" && (end - this.flight.t) < 0.32; }

    /* ---------- render ---------- */
    _render() {
      var ctx = this.ctx, W = this.W, H = this.H, p = this.pal; if (!W) return;
      ctx.save();
      if (this.shake > 0.3) ctx.translate((Math.random() - .5) * this.shake, (Math.random() - .5) * this.shake);
      var sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, p.bg2); sky.addColorStop(1, p.bg);
      ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H + 40);
      this._drawPitch(); this._drawGoal();
      if (this.world.keeper) this._drawKeeper();
      if (this.world.wall) this._drawWall();
      if (this.mode === "flight") { this._drawTrail(); this._drawBall(); }
      else { this._drawTeeBall(); this._drawAim(); }
      ctx.restore();
      if (this.callout) this._drawCallout();
      this._scanlines();
    }
    _line(x1, y1, z1, x2, y2, z2, col, w) {
      var a = this._proj(x1, y1, z1), b = this._proj(x2, y2, z2), ctx = this.ctx;
      ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    _drawPitch() {
      var ctx = this.ctx, p = this.pal, HALF = 13;
      var nl = this._proj(-HALF, 0, 0), nr = this._proj(HALF, 0, 0), fl = this._proj(-HALF, 0, D), fr = this._proj(HALF, 0, D);
      ctx.fillStyle = "#0c0a0b"; ctx.beginPath(); ctx.moveTo(nl.sx, nl.sy); ctx.lineTo(nr.sx, nr.sy); ctx.lineTo(fr.sx, fr.sy); ctx.lineTo(fl.sx, fl.sy); ctx.closePath(); ctx.fill();
      for (var z = 0; z < D; z += 4) {
        var la = this._proj(-HALF, 0, z), lb = this._proj(HALF, 0, z), lc = this._proj(HALF, 0, Math.min(z + 4, D)), ld = this._proj(-HALF, 0, Math.min(z + 4, D));
        ctx.fillStyle = "rgba(" + p.grgb + "," + ((z / 4) % 2 === 0 ? .05 : .02) + ")";
        ctx.beginPath(); ctx.moveTo(la.sx, la.sy); ctx.lineTo(lb.sx, lb.sy); ctx.lineTo(lc.sx, lc.sy); ctx.lineTo(ld.sx, ld.sy); ctx.closePath(); ctx.fill();
      }
      var hair = "rgba(" + p.grgb + ",.22)";
      this._line(-GOAL_HALF - 1.5, 0, D - 5.5, GOAL_HALF + 1.5, 0, D - 5.5, hair, 1);
      this._line(-GOAL_HALF - 1.5, 0, D - 5.5, -GOAL_HALF - 1.5, 0, D, hair, 1);
      this._line(GOAL_HALF + 1.5, 0, D - 5.5, GOAL_HALF + 1.5, 0, D, hair, 1);
    }
    _drawGoal() {
      var ctx = this.ctx, p = this.pal;
      var lp = this._proj(-GOAL_HALF, 0, D), rp = this._proj(GOAL_HALF, 0, D), lt = this._proj(-GOAL_HALF, GOAL_H, D), rt = this._proj(GOAL_HALF, GOAL_H, D);
      ctx.strokeStyle = "rgba(" + p.grgb + ",.16)"; ctx.lineWidth = 1;
      for (var gx = -GOAL_HALF; gx <= GOAL_HALF + .01; gx += GOAL_HALF / 5) {
        var off = this.netRipple ? Math.sin((gx + this.netRipple * 6) * 2) * this.netRipple * 0.14 : 0;
        var a = this._proj(gx, 0, D + .4), b = this._proj(gx, GOAL_H + off, D + .4);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }
      for (var gy = 0; gy <= GOAL_H + .01; gy += GOAL_H / 4) {
        var c = this._proj(-GOAL_HALF, gy, D + .4), d = this._proj(GOAL_HALF, gy, D + .4);
        ctx.beginPath(); ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy); ctx.stroke();
      }
      ctx.strokeStyle = p.ink; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(lp.sx, lp.sy); ctx.lineTo(lt.sx, lt.sy); ctx.lineTo(rt.sx, rt.sy); ctx.lineTo(rp.sx, rp.sy); ctx.stroke();
      ctx.lineWidth = 1; ctx.lineCap = "butt";
    }
    _drawWall() {
      var ctx = this.ctx, p = this.pal, w = this.world.wall, n = Math.max(2, Math.round((w.halfW * 2) / 0.52));
      var jump = (this.mode === "flight" && this.ball && this.ball.z < w.z + 2 && this.ball.z > w.z - 6 && this.ball.y > 1.4) ? 0.25 : 0;
      for (var i = 0; i < n; i++) {
        var x = w.cx - w.halfW + (i + 0.5) * (w.halfW * 2 / n), foot = this._proj(x, 0, w.z), head = this._proj(x, w.height + jump, w.z), bw = foot.scl * 0.42;
        ctx.fillStyle = p.deep; ctx.fillRect(foot.sx - bw / 2, head.sy, bw, foot.sy - head.sy);
        ctx.beginPath(); ctx.arc(foot.sx, head.sy + bw * 0.1, bw * 0.34, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(" + p.grgb + ",.5)"; ctx.lineWidth = 1; ctx.strokeRect(foot.sx - bw / 2, head.sy, bw, foot.sy - head.sy);
      }
    }
    _drawKeeper() {
      var ctx = this.ctx, p = this.pal, k = this.world.keeper, dive = this.keeperDive || 0, tgt = 0;
      if (this.mode === "flight" && this.ball) tgt = clamp(this.ball.x, -GOAL_HALF + .5, GOAL_HALF - .5);
      var kx = lerp(k.cx || 0, tgt, dive * 0.9), foot = this._proj(kx, 0, D - .2), head = this._proj(kx, 1.7, D - .2), bw = foot.scl * 0.5;
      ctx.fillStyle = p.bright; ctx.fillRect(foot.sx - bw / 2, head.sy, bw, foot.sy - head.sy);
      ctx.beginPath(); ctx.arc(foot.sx, head.sy - bw * .18, bw * .32, 0, 7); ctx.fill();
      ctx.strokeStyle = p.bright; ctx.lineWidth = bw * .28; ctx.lineCap = "round";
      var arm = this._proj(kx + (tgt > kx ? 1 : -1) * 0.8 * dive, 1.9, D - .2);
      ctx.beginPath(); ctx.moveTo(foot.sx, head.sy + bw * .2); ctx.lineTo(arm.sx, arm.sy); ctx.stroke(); ctx.lineWidth = 1; ctx.lineCap = "butt";
    }
    _ballShadow(b) {
      var ctx = this.ctx, pr = this._proj(b.x, b.y, b.z), r = BALL_R * pr.scl, h = clamp(1 - b.y / 6, .25, 1);
      ctx.fillStyle = "rgba(0,0,0," + (.34 * h) + ")"; ctx.beginPath(); ctx.ellipse(pr.sx, pr.gy, r * 1.5, r * .5, 0, 0, 7); ctx.fill(); return pr;
    }
    _drawTeeBall() { var pr = this._ballShadow({ x: 0, y: 0, z: 0 }); this._ball(pr, BALL_R * pr.scl); }
    _drawBall() { if (!this.ball) return; var pr = this._ballShadow(this.ball); this._ball(pr, BALL_R * pr.scl); }
    _ball(pr, r) {
      var ctx = this.ctx, p = this.pal, g = ctx.createRadialGradient(pr.sx - r * .3, pr.sy - r * .3, r * .2, pr.sx, pr.sy, r);
      g.addColorStop(0, "#fff"); g.addColorStop(1, "#c9bdb9");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pr.sx, pr.sy, Math.max(2, r), 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(" + p.grgb + ",.6)"; ctx.lineWidth = 1; ctx.stroke();
    }
    _drawTrail() {
      var ctx = this.ctx, p = this.pal, tr = this.trail; if (tr.length < 2) return;
      for (var i = 1; i < tr.length; i++) {
        var a = this._proj(tr[i - 1].x, tr[i - 1].y, tr[i - 1].z), b = this._proj(tr[i].x, tr[i].y, tr[i].z), al = i / tr.length;
        ctx.strokeStyle = "rgba(" + p.grgb + "," + (al * .7) + ")"; ctx.lineWidth = al * 3 + .4; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }
      ctx.lineCap = "butt";
    }
    _drawAim() {
      var ctx = this.ctx, p = this.pal;
      if (this.trainer) {
        var v0 = lerp(MINV, MAXV, this.power), sim = window.TrivelaPhysics.simulateAimed(this.aim, v0, this.curl, Object.assign({}, this.world));
        ctx.setLineDash([4, 5]); ctx.strokeStyle = "rgba(" + p.grgb + ",.5)"; ctx.lineWidth = 1.4; ctx.beginPath();
        for (var i = 0; i < sim.path.length; i += 2) { var pr = this._proj(sim.path[i].x, sim.path[i].y, sim.path[i].z); i === 0 ? ctx.moveTo(pr.sx, pr.sy) : ctx.lineTo(pr.sx, pr.sy); }
        ctx.stroke(); ctx.setLineDash([]);
        var e = sim.path[sim.path.length - 1], ep = this._proj(e.x, e.y, e.z);
        ctx.strokeStyle = sim.outcome.type === "goal" ? p.ok : p.bright; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(ep.sx, ep.sy, 5, 0, 7); ctx.stroke();
      }
      var a = this._proj(this.aim.x, this.aim.y, D);
      ctx.strokeStyle = p.ink; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(a.sx, a.sy, 8, 0, 7); ctx.moveTo(a.sx - 13, a.sy); ctx.lineTo(a.sx + 13, a.sy); ctx.moveTo(a.sx, a.sy - 13); ctx.lineTo(a.sx, a.sy + 13); ctx.stroke();
      if (!this._aimed) { ctx.strokeStyle = "rgba(" + p.grgb + ",.7)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(a.sx, a.sy, 14 + Math.sin(this._lastT / 200) * 3, 0, 7); ctx.stroke(); }
    }
    _drawCallout() {
      var ctx = this.ctx, W = this.W, H = this.H, c = this.callout;
      var k = Math.min(c.t * 6, 1), a = c.t > 1.1 ? clamp(1.5 - c.t, 0, 1) : 1, sz = (c.big ? 40 : 26) * (.7 + .3 * k);
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = "center";
      ctx.font = "800 " + sz + 'px "Syne","Arial Black",sans-serif';
      ctx.fillStyle = c.col; ctx.shadowColor = c.col; ctx.shadowBlur = c.big ? 24 : 8;
      ctx.fillText(c.msg, W / 2, H * 0.46); ctx.restore(); ctx.textAlign = "left";
    }
    _scanlines() { var ctx = this.ctx, W = this.W, H = this.H; ctx.globalAlpha = .04; ctx.fillStyle = "#fff"; for (var y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1); ctx.globalAlpha = 1; }

    _sfx(kind) {
      if (this.muted) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this._ac = this._ac || new AC(); var ac = this._ac, t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        if (kind === "kick") { o.type = "sine"; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(70, t + .12); g.gain.setValueAtTime(.18, t); g.gain.exponentialRampToValueAtTime(.001, t + .14); o.start(t); o.stop(t + .15); }
        else if (kind === "goal") { o.type = "triangle"; o.frequency.setValueAtTime(440, t); o.frequency.exponentialRampToValueAtTime(880, t + .18); g.gain.setValueAtTime(.16, t); g.gain.exponentialRampToValueAtTime(.001, t + .3); o.start(t); o.stop(t + .32); }
        else { o.type = "sawtooth"; o.frequency.setValueAtTime(120, t); g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.001, t + .12); o.start(t); o.stop(t + .13); }
      } catch (e) {}
    }
  }

  customElements.define("trivela-game", TrivelaGame);
})();
