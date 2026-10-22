/* SkillForge goal reminders. Load after lucide and dashboard.js. */
(() => {
  const KEY = "skillforge_goals";
  const IMP = { low: { l: "Low", c: "#22c55e" }, med: { l: "Medium", c: "#f97316" }, high: { l: "High", c: "#ef4444" } };
  const $ = (s, r = document) => r.querySelector(s);
  const pad = n => String(n).padStart(2, "0");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icons = () => window.lucide && lucide.createIcons();
  const fmtDate = d => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const fmtTime = d => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const toInputs = d => [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}`];
  function until(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `in ${Math.max(s, 0)}s`;
    const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    return d ? `in ${d}d ${h % 24}h` : h ? `in ${h}h ${m % 60}m` : `in ${m}m`;
  }

  let goals = [];
  try { goals = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(goals)); } catch (e) {} render(); };

  /* ---------- DOM ---------- */
  let ticks = "";
  for (let i = 0; i < 12; i++) ticks += `<line class="gl-tick ${i % 3 ? "" : "big"}" x1="60" y1="${i % 3 ? 8 : 6}" x2="60" y2="${i % 3 ? 12 : 15}" transform="rotate(${i * 30} 60 60)"/>`;
  const seg = (name, items, def, cls = "") => `<div class="gl-seg ${cls}">${items.map(([v, t, c]) => `<label style="${c ? `--c:${c}` : ""}"><input type="radio" name="${name}" value="${v}" ${v === def ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>`;
  document.body.insertAdjacentHTML("beforeend", `
  <div class="gl-overlay" id="glModal"><div class="gl-modal" role="dialog" aria-modal="true" aria-label="New goal reminder">
    <div class="gl-side">
      <div class="gl-clock"><svg viewBox="0 0 120 120"><circle class="gl-face" cx="60" cy="60" r="56"/>${ticks}
        <line class="gl-h" id="glH" x1="60" y1="60" x2="60" y2="34"/><line class="gl-m" id="glM" x1="60" y1="60" x2="60" y2="20"/><circle class="gl-pin" cx="60" cy="60" r="4"/></svg></div>
      <div><div class="gl-when" id="glWhen"></div><div class="gl-day" id="glDay"></div></div>
      <div class="gl-rel" id="glRel"></div>
    </div>
    <form class="gl-form" id="glForm" novalidate>
      <div class="gl-head"><h2>Set a goal reminder</h2><button type="button" class="gl-x" data-close aria-label="Close"><i data-lucide="x"></i></button></div>
      <label>Title <small>optional</small><input type="text" id="glTitle" maxlength="60" placeholder="e.g. Finish my CV draft"></label>
      <label>Description <small>optional</small><textarea id="glDesc" rows="2" maxlength="200" placeholder="What do you want to get done?"></textarea></label>
      <div class="gl-row"><label>Date<input type="date" id="glDate"></label><label>Time<input type="time" id="glTime"></label></div>
      <div class="gl-chips"><button type="button" data-in="10">In 10 min</button><button type="button" data-in="60">In 1 hour</button><button type="button" data-tom="1">Tomorrow 9:00</button></div>
      <div class="gl-lbl">Importance <small>optional</small>${seg("glImp", [["low", "Low", IMP.low.c], ["med", "Medium", IMP.med.c], ["high", "High", IMP.high.c]], "med")}</div>
      <div class="gl-alerts">
        <div class="gl-lbl">Sound length${seg("glSnd", [["0", "Off"], ["3", "3s"], ["5", "5s"], ["10", "10s"]], "5")}</div>
        <label class="gl-sw"><input type="checkbox" id="glVib" checked><span class="gl-track"></span>Vibrate</label>
      </div>
      <div class="gl-err" id="glErr" role="alert"></div>
      <div class="gl-actions"><button type="button" class="btn btn-secondary" id="glTest">Test alert</button><button type="submit" class="btn btn-primary">Set reminder</button></div>
    </form></div></div>
  <aside class="gl-drawer" id="glDrawer" aria-label="Goal reminders">
    <div class="gl-dh"><h2>My goals</h2><button class="gl-x" data-close aria-label="Close"><i data-lucide="x"></i></button></div>
    <div class="gl-tabs"><button class="on" data-tab="up"></button><button data-tab="hist"></button></div>
    <div class="gl-perm" id="glPerm" hidden></div>
    <div class="gl-list" id="glList"></div>
  </aside>
  <div class="gl-toasts" id="glToasts" aria-live="assertive"></div>`);

  const modal = $("#glModal"), drawer = $("#glDrawer"), list = $("#glList"), toasts = $("#glToasts");
  const f = id => $("#" + id);
  const val = n => $(`input[name=${n}]:checked`).value;
  let tab = "up";

  /* ---------- sound + vibration ---------- */
  let ac, bus;
  const unlock = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch (e) {} };
  document.addEventListener("pointerdown", unlock);
  document.addEventListener("keydown", unlock);
  function stopRing() { if (bus) { bus.disconnect(); bus = null; } navigator.vibrate && navigator.vibrate(0); }
  function ring(sec, vib) {
    stopRing();
    if (sec && ac) {
      bus = ac.createGain(); bus.connect(ac.destination);
      for (let t = ac.currentTime + .05; t < ac.currentTime + sec; t += .7) [880, 1175, 880].forEach((hz, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), s = t + i * .16;
        o.frequency.value = hz; g.gain.setValueAtTime(.0001, s);
        g.gain.exponentialRampToValueAtTime(.25, s + .02); g.gain.exponentialRampToValueAtTime(.0001, s + .14);
        o.connect(g).connect(bus); o.start(s); o.stop(s + .15);
      });
    }
    if (vib && navigator.vibrate) navigator.vibrate(Array(Math.ceil(Math.max(sec, 2) * 1000 / 450)).fill([300, 150]).flat());
  }

  /* ---------- toasts + system notifications ---------- */
  function toast(o) {
    const t = document.createElement("div");
    t.className = "gl-toast"; t.style.setProperty("--c", o.c || "#2563eb");
    t.innerHTML = `<div class="gl-ring"><i data-lucide="${o.icon || "bell-ring"}"></i></div><div class="gl-tb"><b>${esc(o.title)}</b><p>${esc(o.body || "")}</p><div class="gl-ta"></div></div><button class="gl-tx" aria-label="Dismiss">×</button>`;
    const close = () => { o.onClose && o.onClose(); t.classList.add("out"); setTimeout(() => t.remove(), 250); };
    (o.actions || []).forEach(([label, fn, primary]) => {
      const b = document.createElement("button"); b.textContent = label; b.className = primary ? "p" : "";
      b.onclick = () => { fn(); close(); }; $(".gl-ta", t).append(b);
    });
    $(".gl-tx", t).onclick = close;
    toasts.append(t); icons();
    if (o.auto) setTimeout(close, o.auto);
  }
  async function system(g) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const opts = { body: g.desc || "It’s time for your goal.", tag: g.id, renotify: true, vibrate: g.vib ? [300, 150, 300] : undefined, requireInteraction: g.imp === "high", data: { url: location.href } };
    try {
      const reg = "serviceWorker" in navigator && await navigator.serviceWorker.getRegistration();
      reg ? reg.showNotification(g.title, opts) : new Notification(g.title, opts);
    } catch (e) {}
  }

  /* ---------- scheduler ---------- */
  function fire(g) {
    const late = Date.now() - g.at > 60000;
    g.status = "fired"; save();
    toast({
      title: g.title, c: IMP[g.imp].c, onClose: stopRing,
      body: late ? `Missed at ${fmtTime(new Date(g.at))}. ${g.desc || ""}` : g.desc || "It’s time for your goal.",
      actions: [["Done", () => { g.status = "done"; save(); }, true], ["Snooze 5 min", () => { g.at = Date.now() + 3e5; g.status = "upcoming"; save(); }]]
    });
    if (!late) ring(+g.sound, g.vib);
    if (document.hidden) system(g);
  }
  function check() {
    goals.filter(g => g.status === "upcoming" && g.at <= Date.now()).forEach(fire);
    if (drawer.classList.contains("show") && tab === "up") list.querySelectorAll("[data-at]").forEach(e => e.textContent = until(+e.dataset.at - Date.now()));
  }
  // A Web Worker keeps ticking at full speed even when the tab is in the background.
  let tickOk = false;
  try { const w = new Worker(URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),1000)"]))); w.onmessage = () => { tickOk = true; check(); }; w.onerror = () => {}; } catch (e) {}
  setInterval(() => { if (!tickOk) check(); }, 1000);
  document.addEventListener("visibilitychange", check);

  /* ---------- drawer ---------- */
  function card(g) {
    const i = IMP[g.imp], d = new Date(g.at), up = g.status === "upcoming";
    const chip = up ? `<span class="gl-cd" data-at="${g.at}">${until(g.at - Date.now())}</span>` : g.status === "done" ? `<span class="gl-cd done">Completed</span>` : `<span class="gl-cd fired">Alerted</span>`;
    return `<div class="gl-card ${g.status}" style="--c:${i.c}"><div><div class="gl-ct">${esc(g.title)}</div>${g.desc ? `<p>${esc(g.desc)}</p>` : ""}
      <div class="gl-meta"><span><i data-lucide="calendar"></i>${fmtDate(d)}</span><span><i data-lucide="clock-3"></i>${fmtTime(d)}</span><span class="gl-imp">${i.l}</span>${+g.sound ? `<i data-lucide="volume-2"></i>` : ""}${g.vib ? `<i data-lucide="vibrate"></i>` : ""}</div></div>
      <div class="gl-cr">${chip}<div class="gl-ca">${g.status !== "done" ? `<button data-act="done" data-id="${g.id}" aria-label="Mark done"><i data-lucide="check"></i></button>` : ""}<button data-act="del" data-id="${g.id}" aria-label="Delete"><i data-lucide="trash-2"></i></button></div></div></div>`;
  }
  function render() {
    const up = goals.filter(g => g.status === "upcoming").sort((a, b) => a.at - b.at);
    const hist = goals.filter(g => g.status !== "upcoming").sort((a, b) => b.at - a.at);
    $("[data-tab=up]").textContent = `Upcoming (${up.length})`; $("[data-tab=hist]").textContent = `History (${hist.length})`;
    const items = tab === "up" ? up : hist;
    list.innerHTML = items.length ? items.map(card).join("") : `<div class="gl-empty"><i data-lucide="${tab === "up" ? "target" : "history"}"></i><div>${tab === "up" ? "No upcoming goals. Use Add Goal to set your first reminder." : "Goals you’ve been reminded about will appear here."}</div></div>`;
    const b = $(".gl-badge"); if (b) { b.textContent = up.length; b.hidden = !up.length; }
    perm(); icons();
  }
  function perm() {
    const p = f("glPerm");
    if (!("Notification" in window) || Notification.permission === "granted") return (p.hidden = true);
    p.hidden = false;
    p.innerHTML = Notification.permission === "denied" ? "Notifications are blocked. Allow them in your browser’s site settings." : `<span>Get alerts even when this tab is in the background.</span><button type="button" id="glAllow">Turn on</button>`;
    const a = f("glAllow"); if (a) a.onclick = () => Notification.requestPermission().then(perm);
  }
  list.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const g = goals.find(x => x.id === b.dataset.id); if (!g) return;
    if (b.dataset.act === "del") goals = goals.filter(x => x !== g); else g.status = "done";
    save();
  });
  $(".gl-tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (!b) return; tab = b.dataset.tab; document.querySelectorAll(".gl-tabs button").forEach(x => x.classList.toggle("on", x === b)); render(); });

  /* ---------- modal ---------- */
  const when = () => new Date(`${f("glDate").value}T${f("glTime").value}`);
  function preview() {
    const d = when(), ok = !isNaN(d);
    if (!ok) return;
    const h = d.getHours() % 12 + d.getMinutes() / 60;
    f("glH").style.transform = `rotate(${h * 30}deg)`; f("glM").style.transform = `rotate(${d.getMinutes() * 6}deg)`;
    f("glWhen").textContent = fmtTime(d); f("glDay").textContent = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    f("glRel").textContent = d > Date.now() ? `Rings ${until(d - Date.now())}` : "Pick a future time";
  }
  const setWhen = d => { [f("glDate").value, f("glTime").value] = toInputs(d); f("glErr").textContent = ""; preview(); };
  function openModal() {
    f("glForm").reset(); f("glErr").textContent = "";
    const d = new Date(Date.now() + 36e5); d.setMinutes(0); setWhen(d);
    f("glDate").min = toInputs(new Date())[0];
    modal.classList.add("show"); setTimeout(() => f("glTitle").focus(), 150); icons();
  }
  const closeAll = () => { modal.classList.remove("show"); drawer.classList.remove("show"); };
  ["glDate", "glTime"].forEach(id => f(id).addEventListener("input", preview));
  $(".gl-chips").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const d = new Date();
    if (b.dataset.in) d.setMinutes(d.getMinutes() + +b.dataset.in); else { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    setWhen(d);
  });
  f("glTest").onclick = () => { unlock(); ring(Math.min(+val("glSnd") || 2, 3), f("glVib").checked); };
  f("glForm").addEventListener("submit", e => {
    e.preventDefault(); unlock();
    const d = when();
    if (isNaN(d)) return (f("glErr").textContent = "Choose a date and time.");
    if (d <= Date.now()) return (f("glErr").textContent = "That time has passed. Pick a time in the future.");
    goals.push({ id: "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: f("glTitle").value.trim() || "Goal reminder", desc: f("glDesc").value.trim(), at: d.getTime(), imp: val("glImp"), sound: val("glSnd"), vib: f("glVib").checked, status: "upcoming" });
    save(); stopRing(); modal.classList.remove("show");
    toast({ title: "Reminder set", body: `${fmtDate(d)} at ${fmtTime(d)} (${until(d - Date.now())})`, icon: "check", c: "#22c55e", auto: 3500 });
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().then(perm);
  });

  /* ---------- wiring ---------- */
  document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => { closeAll(); stopRing(); });
  modal.addEventListener("click", e => { if (e.target === modal) closeAll(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });
  const bell = $(".topbar-right .icon-btn");
  if (bell) {
    bell.style.position = "relative"; bell.setAttribute("aria-label", "My goals");
    bell.insertAdjacentHTML("beforeend", `<span class="gl-badge" hidden></span>`);
  }
  // Delegated + capture phase: works even if other scripts re-render or intercept the buttons.
  document.addEventListener("click", e => {
    if (e.target.closest(".hero-actions .btn-primary")) openModal();
    else if (bell && e.target.closest(".topbar-right .icon-btn") === bell) { render(); drawer.classList.toggle("show"); }
  }, true);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  render(); check();
  console.log("[goals] ready");
})();