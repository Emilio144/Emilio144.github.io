/* ==========================================================================
   Page controller: palettes, scroll director, HUD, viewfinder, cursor,
   reveals, image plates. Shared by index.html and projects/*.html.
   ========================================================================== */
(function () {
  "use strict";
  var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- material palettes (page chrome follows the metal) ---------- */
  var PALETTES = [
    { "--bg": "#0a0806", "--bg-soft": "#140f09", "--ink": "#f3e9d6", "--ink-dim": "#a99a80", "--ink-faint": "#8a7c68",
      "--accent": "#e5a53a", "--accent-2": "#fff3cf", "--line": "rgba(229,165,58,0.16)", "--line-soft": "rgba(229,165,58,0.09)",
      "--glass": "rgba(20,15,9,0.5)", "--sel": "rgba(229,165,58,0.28)", "--edge": "#241a0e", name: "molten gold" },
    { "--bg": "#0b0d10", "--bg-soft": "#12161b", "--ink": "#eef2f6", "--ink-dim": "#9aa4b0", "--ink-faint": "#7f8895",
      "--accent": "#a9c6e0", "--accent-2": "#ffffff", "--line": "rgba(169,198,224,0.18)", "--line-soft": "rgba(169,198,224,0.09)",
      "--glass": "rgba(18,22,27,0.5)", "--sel": "rgba(169,198,224,0.30)", "--edge": "#1b2430", name: "liquid chrome" },
    { "--bg": "#07060a", "--bg-soft": "#100d18", "--ink": "#e7e2f2", "--ink-dim": "#9a92ad", "--ink-faint": "#827a96",
      "--accent": "#9d86e0", "--accent-2": "#d9ccff", "--line": "rgba(157,134,224,0.18)", "--line-soft": "rgba(157,134,224,0.09)",
      "--glass": "rgba(16,13,24,0.55)", "--sel": "rgba(157,134,224,0.30)", "--edge": "#1c1630", name: "obsidian glass" },
    { "--bg": "#06090a", "--bg-soft": "#0d1416", "--ink": "#e6f4ef", "--ink-dim": "#93b0a9", "--ink-faint": "#79928a",
      "--accent": "#6ce0c8", "--accent-2": "#ff9ad2", "--line": "rgba(108,224,200,0.18)", "--line-soft": "rgba(108,224,200,0.09)",
      "--glass": "rgba(13,20,22,0.5)", "--sel": "rgba(255,154,210,0.30)", "--edge": "#123028", name: "anodized oil" }
  ];
  var FORM_NAMES = ["liquid", "carabiner", "6-dof arm", "mini cnc", "split shell"];
  var CUR_HINT = ["", "click: gate · hold: melt", "click: grip · hold: melt", "click: plunge · hold: melt", "click: lock seam · hold: melt"];
  var themeMeta = $('meta[name="theme-color"]');
  var matNow = -1;

  function applyPalette(i) {
    if (i === matNow) return;
    matNow = i;
    var p = PALETTES[i];
    for (var k in p) if (k.indexOf("--") === 0) root.style.setProperty(k, p[k]);
    if (themeMeta) themeMeta.setAttribute("content", p["--bg"]);
    setText("hudMat", p.name);
    $$(".mat-dot").forEach(function (el) { el.setAttribute("aria-pressed", +el.dataset.mat === i ? "true" : "false"); });
    if (metal) metal.setMaterial(i);
  }
  function setText(id, v) { var el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; }

  /* ---------- the metal ---------- */
  var canvas = $("#gl"), fallback = $("#fallback"), stage = $("#stage");
  var metal = null, firstFrame = false;
  var finder = $("#finder"), draft = $(".draft");
  var cur = $("#wellCursor"), curLabel = $("#curLabel"), holdRing = $("#holdRing");
  var activeScene = null, finderWanted = false;
  var lastHold = 0, rememberUntil = 0;

  if (canvas && window.MetalField) {
    metal = new MetalField(canvas, {
      onFail: function () { if (fallback) fallback.classList.add("on"); canvas.style.opacity = "0"; setText("hudFps", "render · css fallback"); firstFrame = true; },
      onFrame: onFrame
    });
    if (!metal.ok && fallback) fallback.classList.add("on");
  } else if (fallback) { fallback.classList.add("on"); firstFrame = true; }

  var fpsTick = 0;
  function onFrame(f) {
    firstFrame = true;
    var now = performance.now();
    if (now - fpsTick > 500) {
      fpsTick = now;
      setText("hudFps", "render · " + f.fps + " fps · " + f.scale.toFixed(2) + "×");
      var formTxt = f.shape === 0 || f.liquid > 0.6 ? (f.target !== f.shape ? "melting → " + FORM_NAMES[f.target] : "liquid") : FORM_NAMES[f.shape];
      setText("hudForm", formTxt);
      setText("hudLiq", (1 - f.liquid).toFixed(2));
    }
    // viewfinder + drafting grid lock onto the formed object
    var show = finderWanted && f.shape > 0 && f.liquid < 0.35;
    if (finder) {
      finder.classList.toggle("on", show);
      if (show) {
        var size = f.r * 2.3;
        finder.style.width = finder.style.height = size + "px";
        finder.style.transform = "translate(" + (f.cx - size / 2) + "px," + (f.cy - size / 2) + "px)";
        var read = "";
        var deg = function (a) { a = ((a * 180 / Math.PI) % 360 + 360) % 360; return a.toFixed(1) + "°"; };
        if (f.shape === 1) read = "ry " + deg(f.yaw) + " · gate " + (f.gate > 0.03 ? "open" : "closed");
        else if (f.shape === 2) read = "θ1 " + deg(f.th[0]) + " · θ2 " + deg(f.th[1]) + " · grip " + (f.grip > 0.5 ? "closed" : "open");
        else if (f.shape === 3) read = f.gcode;
        else if (f.shape === 4) read = "seam " + Math.round(f.open * 100) + "% open · ry " + deg(f.yaw);
        setText("fRead", read);
      }
    }
    if (draft) {
      draft.classList.toggle("on", show);
      if (show) { draft.style.setProperty("--ox", f.cx + "px"); draft.style.setProperty("--oy", f.cy + "px"); draft.style.setProperty("--gs", (f.r * 5.2) + "px"); }
    }
    // cursor states
    if (cur) cur.classList.toggle("near", f.near);
    if (curLabel) {
      var lbl = "";
      if (f.hold > 0.05) lbl = "forgetting…";
      else if (now < rememberUntil) lbl = "remembering";
      else if (f.near) lbl = CUR_HINT[f.shape];
      if (lastHold > 0.3 && f.hold < lastHold && f.hold < 0.25) rememberUntil = now + 1100;
      lastHold = f.hold;
      curLabel.textContent = lbl;
      curLabel.classList.toggle("on", !!lbl);
    }
    if (holdRing) { holdRing.classList.toggle("on", f.hold > 0.02); holdRing.style.setProperty("--h", f.hold.toFixed(3)); }
  }

  /* ---------- scroll director: which shape should the metal remember? ---------- */
  var scenes = $$("[data-form]");
  var rail = $(".rail"), railLinks = rail ? $$("a", rail) : [];
  var matOverride = null; // {scene, mat}
  function smooth(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function direct() {
    if (!scenes.length) return;
    var mid = innerHeight * 0.5, active = null, rect = null;
    for (var i = 0; i < scenes.length; i++) {
      var r = scenes[i].getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) { active = scenes[i]; rect = r; break; }
    }
    if (!active) {
      var firstR = scenes[0].getBoundingClientRect();
      active = firstR.top > mid ? scenes[0] : scenes[scenes.length - 1];
      rect = active.getBoundingClientRect();
    }
    var form = +active.dataset.form || 0;
    var liquid = form ? 0 : 1;
    if (active.dataset.morph === "progress") {
      var p = (mid - rect.top) / (rect.height || 1);
      liquid = 1 - smooth(0.03, 0.2, p) * (1 - smooth(0.86, 0.99, p));
    }
    if (metal) {
      metal.setForm(form, liquid);
      metal.setAlign(active.dataset.align || "center");
      metal.setFocal(+(active.dataset.focal || 2.2));
    }
    if (active !== activeScene) {
      activeScene = active;
      if (matOverride && matOverride.scene !== active) matOverride = null;
      finderWanted = !!active.dataset.fig;
      if (finderWanted) {
        setText("fFig", active.dataset.fig);
        setText("fName", active.dataset.name || "");
        setText("fDim", active.dataset.note || "");
      }
      if (stage) stage.classList.toggle("dim", active.dataset.dim === "1");
      document.body.classList.toggle("reading", active.dataset.dim === "1" || !!active.closest(".plate,.plate-solid"));
      var nav = active.dataset.nav;
      $$(".top nav a[data-nav]").forEach(function (a) { a.setAttribute("aria-current", a.dataset.nav === nav ? "true" : "false"); });
    }
    document.body.classList.toggle("scrolled", scrollY > innerHeight * 0.5);
    // build index rail: which chapter, and how far through it
    var inBuilds = !!(active.id && rail && rail.querySelector('a[href="#' + active.id + '"]'));
    document.body.classList.toggle("in-builds", inBuilds);
    if (rail) railLinks.forEach(function (a) {
      var on = inBuilds && a.getAttribute("href") === "#" + active.id;
      a.setAttribute("aria-current", on ? "step" : "false");
      if (on) a.style.setProperty("--p", Math.min(1, Math.max(0, (mid - rect.top) / (rect.height || 1))).toFixed(3));
    });
    applyPalette(matOverride ? matOverride.mat : +(active.dataset.mat || 0));
  }
  var ticking = false;
  function onScroll() { if (ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; direct(); }); }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  direct();

  // manual material override (dots + keys 1–4)
  function override(i) { matOverride = { scene: activeScene, mat: i }; applyPalette(i); }
  $$(".mat-dot").forEach(function (el) { el.addEventListener("click", function () { override(+el.dataset.mat); }); });
  addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key >= "1" && e.key <= "4") override(+e.key - 1);
  });

  /* ---------- HUD tucks away at the footer ---------- */
  var hud = $(".hud"), foot = $("footer");
  if (hud && foot && "IntersectionObserver" in window) {
    new IntersectionObserver(function (ents) { ents.forEach(function (en) { hud.classList.toggle("tucked", en.isIntersecting); }); }, { threshold: 0.01 }).observe(foot);
  }

  /* ---------- reveals + counters ---------- */
  function countUp(el) {
    var to = parseFloat(el.dataset.count), dec = (el.dataset.count.split(".")[1] || "").length, t0 = performance.now(), dur = 1400;
    if (REDUCED) { el.textContent = to.toFixed(dec); return; }
    (function step() {
      var k = Math.max(0, Math.min(1, (performance.now() - t0) / dur)), e = 1 - Math.pow(1 - k, 4);
      el.textContent = (to * e).toFixed(dec);
      if (k < 1) requestAnimationFrame(step);
    })();
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("in");
        $$("[data-count]", en.target).forEach(countUp);
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach(function (el) { io.observe(el); });
  } else $$(".reveal").forEach(function (el) { el.classList.add("in"); });

  /* ---------- cursor ring (lags like the gravity well) ---------- */
  if (cur && !REDUCED && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    var cx = innerWidth / 2, cy = innerHeight / 2, px = cx, py = cy;
    addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      px = e.clientX; py = e.clientY; cur.classList.add("on");
      var link = e.target.closest && e.target.closest("a,button,summary,.mat-dot");
      cur.classList.toggle("link", !!link);
    }, { passive: true });
    document.addEventListener("pointerleave", function () { cur.classList.remove("on"); });
    addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse") cur.classList.add("press"); }, { passive: true });
    addEventListener("pointerup", function () { cur.classList.remove("press"); });
    (function loop() {
      cx += (px - cx) * 0.18; cy += (py - cy) * 0.18;
      cur.style.transform = "translate(" + cx + "px," + cy + "px)";
      if (curLabel) curLabel.style.transform = "translate(" + (px + 22) + "px," + (py + 16) + "px)";
      if (holdRing) holdRing.style.transform = "translate(" + px + "px," + py + "px)";
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- magnetic buttons ---------- */
  if (!REDUCED && matchMedia("(hover: hover)").matches) {
    $$(".btn,.mag").forEach(function (b) {
      b.addEventListener("pointermove", function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = "translate(" + ((e.clientX - r.left - r.width / 2) * 0.22) + "px," + ((e.clientY - r.top - r.height / 2) * 0.32) + "px)";
      });
      b.addEventListener("pointerleave", function () { b.style.transition = "transform .6s cubic-bezier(.2,.9,.3,1),border-color .4s,background .4s"; b.style.transform = ""; setTimeout(function () { b.style.transition = ""; }, 600); });
    });
  }

  /* ---------- image plates: a drawing-sheet placeholder until the photo exists ---------- */
  function pending(img) {
    var frame = img.parentNode;
    var src = img.getAttribute("src") || "";
    var file = src.replace(/^(\.\.\/)+/, "");
    var box = document.createElement("div");
    box.className = "pending";
    box.innerHTML = '<div class="p-top"><span>plate pending</span><span>' + (img.dataset.no || "") + '</span></div>' +
      '<div class="p-block"><div><b>' + (img.dataset.hint || img.alt || "") + '</b></div><div>add file → ' + file + '</div></div>';
    img.remove();
    frame.appendChild(box);
  }
  /* looping clips: hold on the poster frame for reduced-motion users */
  if (REDUCED) $$(".fig video").forEach(function (v) { v.removeAttribute("autoplay"); v.pause(); v.controls = true; });

  $$(".fig img").forEach(function (img) {
    if (img.complete && img.naturalWidth === 0) pending(img);
    else img.addEventListener("error", function () { pending(img); });
  });

  /* ---------- loader ---------- */
  var loader = $(".loader");
  function ready() { document.body.classList.add("ready"); }
  if (loader && !REDUCED) {
    var n = $(".loader-n span", loader), bar = $(".loader-bar", loader), t0 = performance.now(), shown = 0;
    (function tick() {
      var now = performance.now();
      var k = Math.max(0, Math.min(1, (now - t0) / 1300));
      var target = firstFrame ? k : Math.min(k, 0.86);
      shown += (target - shown) * 0.2;
      var v = Math.round(shown * 100);
      if (n) n.textContent = v < 10 ? "0" + v : "" + v;
      if (bar) bar.style.setProperty("--p", shown.toFixed(3));
      if ((shown > 0.995 && firstFrame) || now - t0 > 4500) { loader.classList.add("gone"); setTimeout(ready, 150); return; }
      requestAnimationFrame(tick);
    })();
  } else { if (loader) loader.classList.add("gone"); requestAnimationFrame(ready); }

  /* ---------- misc ---------- */
  $$("[data-year]").forEach(function (y) { y.textContent = new Date().getFullYear(); });
})();
