(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) document.documentElement.classList.add("reduce");
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var register = {};
  try { register = JSON.parse($("#register").textContent).records || {}; } catch (e) { register = {}; }

  /* ---------- damped spring solver ---------- */
  function spring(opts) {
    var k = opts.stiffness || 170, c = opts.damping || 24, m = 1;
    var x = 0, v = 0, last = performance.now(), raf = 0, dead = false;
    function frame(now) {
      if (dead) return;
      var dt = Math.min((now - last) / 1000, 0.05); last = now;
      var steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
      for (var i = 0; i < steps; i++) { var a = (-k * (x - 1) - c * v) / m; v += a * h; x += v * h; }
      opts.onUpdate(x);
      if (Math.abs(x - 1) < 0.0008 && Math.abs(v) < 0.001) { opts.onUpdate(1); if (opts.onDone) opts.onDone(); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(function (t) { last = t; frame(t); });
    return function () { dead = true; cancelAnimationFrame(raf); };
  }

  /* ---------- scroll-reveal with stagger ---------- */
  function setupReveal() {
    var els = $$("[data-reveal]");
    if (reduce || !("IntersectionObserver" in window)) { els.forEach(function (e) { e.style.opacity = 1; }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target; io.unobserve(el);
        var delay = (parseInt(el.getAttribute("data-stagger") || "0", 10)) * 90;
        setTimeout(function () {
          spring({ stiffness: 170, damping: 22, onUpdate: function (p) {
            el.style.opacity = Math.max(0, Math.min(1, p));
            el.style.transform = "translate3d(0," + ((1 - p) * 28).toFixed(2) + "px,0)";
          }, onDone: function () { el.style.transform = ""; } });
        }, delay);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (e) { e.style.transform = "translate3d(0,28px,0)"; io.observe(e); });
  }

  /* ---------- progress bar + header state ---------- */
  function setupScroll() {
    var bar = $("#progress"), top = $("#top"), layers = $$("[data-depth]"), tx = 0, ty = 0, cx = 0, cy = 0, sy = 0, ticking = false;
    function measure() {
      var h = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = "scaleX(" + (h > 0 ? Math.min(1, scrollY / h) : 0) + ")";
      top.classList.toggle("is-scrolled", scrollY > 8);
      sy = scrollY; ticking = false;
    }
    addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(measure); } }, { passive: true });
    measure();
    if (reduce) return;
    var hero = $("#hero");
    hero.addEventListener("pointermove", function (e) { tx = (e.clientX / innerWidth - 0.5) * 2; ty = (e.clientY / innerHeight - 0.5) * 2; });
    hero.addEventListener("pointerleave", function () { tx = 0; ty = 0; });
    (function loop() {
      cx += (tx - cx) * 0.07; cy += (ty - cy) * 0.07;
      if (sy < innerHeight * 1.3) {
        layers.forEach(function (l) {
          var d = parseFloat(l.getAttribute("data-depth"));
          l.style.transform = "translate3d(" + (cx * d * -18).toFixed(2) + "px," + (cy * d * -14 + sy * d * 0.12).toFixed(2) + "px,0)";
        });
      }
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- spotlight ---------- */
  function setupSpot() {
    document.addEventListener("pointermove", function (e) {
      var t = e.target.closest && e.target.closest(".spot, .mrow");
      if (!t) return;
      var r = t.getBoundingClientRect();
      t.style.setProperty("--mx", (e.clientX - r.left) + "px");
      t.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
  }

  /* ---------- copy ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? res() : rej(); } catch (e) { rej(e); } ta.remove();
    });
  }
  function setupCopy() {
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-copy]");
      if (!b || b.getAttribute("aria-disabled") === "true") return;
      var text = b.getAttribute("data-copy"); if (!text) return;
      var label = $("[data-copy-state]", b), prev = label ? label.textContent : "";
      copyText(text).then(function () {
        b.classList.add("is-done"); if (label) label.textContent = "Copied";
        var live = $("#live"); if (live) live.textContent = "Copied to clipboard";
        setTimeout(function () { b.classList.remove("is-done"); if (label) label.textContent = prev; }, 1600);
      }, function () { if (label) { label.textContent = "Press Ctrl+C"; setTimeout(function () { label.textContent = prev; }, 1600); } });
    });
  }

  /* ---------- exposure toggle ---------- */
  function setupLedger() {
    var sw = $("#mode-switch"), led = $("#ledger"); if (!sw) return;
    sw.addEventListener("click", function () {
      var on = sw.getAttribute("aria-checked") !== "true";
      sw.setAttribute("aria-checked", String(on));
      led.setAttribute("data-mode", on ? "masked" : "traceable");
      $("#mode-label").textContent = on ? "Route around the vault" : "Route through the vault";
      var tag = $("#ledger-tag"); tag.textContent = on ? "Masked" : "Traceable"; tag.classList.toggle("tag--muted", on);
      $$("[data-src]", led).forEach(function (s) { s.textContent = on ? "the vault" : "your address"; });
    });
  }

  /* ---------- flow steps ---------- */
  function setupFlow() {
    var steps = $$(".step"); if (!steps.length || !("IntersectionObserver" in window)) return;
    var ids = { 1: ["n-wallet", "n-vault", "pipe-a"], 2: ["n-vault", "halo"], 3: ["n-vault", "n-rec", "pipe-b"] };
    function show(n) {
      steps.forEach(function (s) { s.classList.toggle("is-active", s.getAttribute("data-step") === String(n)); });
      ["n-wallet", "n-vault", "n-rec", "pipe-a", "pipe-b", "halo"].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.classList.toggle("on", ids[n].indexOf(id) > -1);
      });
    }
    show(1);
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) show(e.target.getAttribute("data-step")); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(function (s) { io.observe(s); });
  }

  /* ---------- faq ---------- */
  function setupFaq() {
    $$(".faq-q").forEach(function (b) {
      b.addEventListener("click", function () {
        var it = b.parentNode, open = !it.classList.contains("is-open");
        it.classList.toggle("is-open", open); b.setAttribute("aria-expanded", String(open));
      });
    });
  }

  /* ---------- market ---------- */
  var Market = (function () {
    var rec = register["market-source"];
    var live = !!(rec && rec.state === "stated" && rec.url);
    var base = live ? rec.url.replace(/\/$/, "") : "";
    var POLL = 60000, TIMEOUT = 12000;
    var rowsEl = $("#rows"), statusEl = $("#board-status"), errEl = $("#board-err"), pill = $("#pill"), pillText = $("#pill-text");
    var chain = (register.chain && register.chain.state === "stated" && register.chain.value) || "Solana";
    var data = [], rowMap = {}, fails = 0, timer = 0, retry = 0, inflight = false, first = true, started = false;

    var nf = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }), big = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
    function usd(n) { return "$" + nf.format(n); }
    function price(n) {
      if (!isFinite(n)) return "—";
      if (n >= 1000) return "$" + big.format(Math.round(n));
      if (n >= 1) return "$" + n.toFixed(2);
      if (n >= 0.01) return "$" + n.toFixed(4);
      var s = n.toPrecision(3); return "$" + (Number(s) < 1e-8 ? n.toExponential(2) : Number(s).toFixed(Math.min(12, Math.max(4, -Math.floor(Math.log10(n)) + 2))));
    }
    function pct(n) { return (n > 0 ? "+" : "") + n.toFixed(Math.abs(n) >= 100 ? 0 : 2) + "%"; }
    var fmt = { price: price, chg: pct, vol: usd, liq: usd };

    function setPill(state, text) { pill.setAttribute("data-state", state); pillText.textContent = text; }
    function dash() { ["#hp-count", "#hp-vol", "#s-count", "#s-vol", "#s-top"].forEach(function (s) { var e = $(s); if (e && !e.dataset.v) e.textContent = "—"; }); }

    function animateNumber(el, to, f) {
      var from = el.dataset.v === undefined ? null : parseFloat(el.dataset.v);
      el.dataset.v = String(to);
      if (reduce || from === null || from === to) { el.textContent = f(to); if (from !== null && from !== to) flash(el, to > from); return; }
      var t0 = performance.now(), dur = 700;
      (function step(now) {
        var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
        el.textContent = f(from + (to - from) * e);
        if (p < 1) requestAnimationFrame(step); else el.textContent = f(to);
      })(t0);
      flash(el, to > from);
    }
    function flash(el, up) { el.classList.remove("flash-up", "flash-down"); void el.offsetWidth; el.classList.add(up ? "flash-up" : "flash-down"); }

    var copyIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
    function makeRow(t, i) {
      var r = document.createElement("div"); r.className = "mrow cols fade-in"; r.style.setProperty("--d", (i * 55) + "ms"); r.setAttribute("data-addr", t.address);
      r.innerHTML = '<span class="rank"></span><div class="tk"><span class="tile"><span class="ph"></span></span><div class="tk-name"><b></b><span></span></div></div>' +
        '<span class="num" data-f="price"></span><span class="num" data-f="chg"></span><span class="num" data-f="vol"></span><span class="num" data-f="liq"></span>' +
        '<button class="copy-mini" type="button">' + copyIcon + '</button>';
      var tile = $(".tile", r), ph = $(".ph", r);
      if (t.image) {
        var img = new Image(); img.alt = ""; img.decoding = "async"; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
        img.addEventListener("error", function () { img.remove(); });
        img.src = t.image; tile.appendChild(img);
      }
      return r;
    }
    function fill(r, t, i) {
      $(".rank", r).textContent = String(i + 1);
      $(".ph", r).textContent = (t.symbol || t.name || "?").trim().charAt(0).toUpperCase() || "?";
      $(".tk-name b", r).textContent = t.symbol || "—";
      $(".tk-name span", r).textContent = t.name || "";
      var b = $(".copy-mini", r); b.setAttribute("data-copy", t.address); b.setAttribute("aria-label", "Copy address for " + (t.symbol || "token"));
      animateNumber($('[data-f="price"]', r), t.price, fmt.price);
      var c = $('[data-f="chg"]', r); animateNumber(c, t.chg, fmt.chg); c.classList.toggle("up", t.chg > 0); c.classList.toggle("down", t.chg <= 0);
      animateNumber($('[data-f="vol"]', r), t.vol, fmt.vol);
      animateNumber($('[data-f="liq"]', r), t.liq, fmt.liq);
    }

    function skeleton() {
      if (!rowsEl) return;
      var h = "";
      for (var i = 0; i < 10; i++) h += '<div class="mrow cols" aria-hidden="true"><span class="rank">' + (i + 1) + '</span><div class="tk"><span class="tile skel"></span><div class="tk-name" style="flex:1"><span class="skel" style="width:60%;height:14px"></span></div></div><span class="skel" style="height:14px;width:70%"></span><span class="skel" style="height:14px;width:60%"></span><span class="skel" style="height:14px;width:70%"></span><span class="skel" style="height:14px;width:70%"></span><span class="skel" style="width:44px;height:44px;border-radius:12px"></span></div>';
      rowsEl.innerHTML = h;
    }

    function render() {
      if (!rowsEl) return;
      if (first) { rowsEl.innerHTML = ""; first = false; }
      var seen = {};
      data.forEach(function (t, i) {
        var r = rowMap[t.address];
        if (!r) { r = rowMap[t.address] = makeRow(t, i); }
        seen[t.address] = 1; fill(r, t, i);
        if (rowsEl.children[i] !== r) rowsEl.insertBefore(r, rowsEl.children[i] || null);
      });
      Object.keys(rowMap).forEach(function (k) { if (!seen[k]) { rowMap[k].remove(); delete rowMap[k]; } });
      var vol = data.reduce(function (a, t) { return a + t.vol; }, 0);
      animateNumber($("#hp-count"), data.length, function (n) { return String(Math.round(n)); });
      animateNumber($("#s-count"), data.length, function (n) { return String(Math.round(n)); });
      animateNumber($("#hp-vol"), vol, usd); animateNumber($("#s-vol"), vol, usd);
      var best = data.slice().sort(function (a, b) { return b.chg - a.chg; })[0];
      if (best) { animateNumber($("#s-top"), best.chg, pct); $("#s-top-sym").textContent = best.symbol || best.name; }
      ticker();
    }
    function ticker() {
      var a = $("#ticker-a"), b = $("#ticker-b"); if (!a || !data.length) return;
      var h = data.map(function (t) {
        var up = t.chg > 0; var d = document.createElement("span"); d.className = "tick";
        var s = document.createElement("b"); s.textContent = t.symbol || "—";
        var p = document.createElement("span"); p.textContent = price(t.price);
        var c = document.createElement("span"); c.className = up ? "up" : "down"; c.textContent = (up ? "▲ " : "▼ ") + pct(t.chg);
        d.appendChild(s); d.appendChild(p); d.appendChild(c); return d;
      });
      a.textContent = ""; b.textContent = "";
      h.forEach(function (n) { a.appendChild(n); b.appendChild(n.cloneNode(true)); });
    }

    function fetchJson(url) {
      var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, TIMEOUT);
      return fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } }).then(function (r) {
        clearTimeout(to); if (!r.ok) throw new Error("http " + r.status); return r.json();
      }, function (e) { clearTimeout(to); throw e; });
    }
    function load() {
      return fetchJson(base + "/token-boosts/top/v1").then(function (list) {
        if (!Array.isArray(list)) throw new Error("shape");
        var seen = {}, addrs = [];
        list.forEach(function (x) { if (x && x.chainId === "solana" && x.tokenAddress && !seen[x.tokenAddress]) { seen[x.tokenAddress] = 1; addrs.push(x.tokenAddress); } });
        if (!addrs.length) throw new Error("empty");
        var chunks = []; for (var i = 0; i < addrs.length; i += 30) chunks.push(addrs.slice(i, i + 30));
        return Promise.all(chunks.map(function (c) { return fetchJson(base + "/tokens/v1/solana/" + c.join(",")); }));
      }).then(function (parts) {
        var best = {};
        parts.forEach(function (arr) {
          if (!Array.isArray(arr)) return;
          arr.forEach(function (p) {
            if (!p || !p.baseToken || !p.baseToken.address || p.chainId !== "solana") return;
            var v = p.volume && +p.volume.h24; if (!isFinite(v)) return;
            var cur = best[p.baseToken.address];
            if (!cur || v > cur.vol) best[p.baseToken.address] = {
              address: p.baseToken.address, symbol: p.baseToken.symbol, name: p.baseToken.name,
              image: p.info && p.info.imageUrl && /^https:\/\//.test(p.info.imageUrl) ? p.info.imageUrl : "",
              price: +p.priceUsd, chg: p.priceChange && isFinite(+p.priceChange.h24) ? +p.priceChange.h24 : 0,
              vol: v, liq: p.liquidity && isFinite(+p.liquidity.usd) ? +p.liquidity.usd : 0
            };
          });
        });
        var out = Object.keys(best).map(function (k) { return best[k]; }).filter(function (t) { return isFinite(t.price); })
          .sort(function (a, b) { return b.vol - a.vol; }).slice(0, 10);
        if (!out.length) throw new Error("empty");
        return out;
      });
    }

    function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }
    function tick() {
      if (document.hidden || inflight) return;
      inflight = true;
      load().then(function (out) {
        data = out; fails = 0; errEl.hidden = true;
        render(); statusEl.textContent = "Feed live · refreshes every minute";
        setPill("live", chain + " feed live");
        schedule(POLL);
      }, function () {
        fails++;
        var wait = Math.min(POLL, 2000 * Math.pow(2, fails - 1)) + Math.random() * 400;
        errEl.hidden = false; errEl.textContent = "Source unreachable. Retrying.";
        if (!data.length) { dash(); statusEl.textContent = "No reading yet"; if (first) { rowsEl.innerHTML = '<div class="mrow" style="grid-template-columns:1fr;padding:24px 20px;color:var(--muted)">—  Market source did not answer.</div>'; first = false; } }
        else statusEl.textContent = "Showing the last good reading";
        setPill("retry", chain + " feed retrying");
        schedule(wait);
      }).then(function () { inflight = false; });
    }
    function start() {
      if (started) return; started = true;
      if (!live) { dash(); if (rowsEl) rowsEl.innerHTML = '<div class="mrow" style="grid-template-columns:1fr;padding:24px 20px;color:var(--muted)">Market source <span class="tag tag--muted" style="margin-left:10px">pending</span></div>'; statusEl.textContent = "Source pending"; setPill("idle", chain + " feed pending"); return; }
      skeleton(); setPill("idle", chain + " feed connecting");
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) { clearTimeout(timer); setPill("idle", chain + " feed paused"); }
        else { fails = 0; tick(); }
      });
      tick();
    }
    return { start: start };
  })();

  /* ---------- boot ---------- */
  document.documentElement.classList.remove("no-js");
  var live = document.createElement("div"); live.id = "live"; live.className = "sr"; live.setAttribute("aria-live", "polite"); document.body.appendChild(live);
  setupReveal(); setupScroll(); setupSpot(); setupCopy(); setupLedger(); setupFlow(); setupFaq(); Market.start();
})();
