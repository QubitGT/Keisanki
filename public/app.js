(function () {
  var DISCORD_URL = "https://discord.gg/qubit";
  var DOWNLOAD_URL = "https://github.com/QubitGT/Qubit/releases/latest";
  var d1 = document.getElementById("discord-link"), d2 = document.getElementById("download-link");
  if (DISCORD_URL !== "#") { d1.href = DISCORD_URL; d1.target = "_blank"; d1.rel = "noopener"; }
  if (DOWNLOAD_URL !== "#") { d2.href = DOWNLOAD_URL; d2.target = "_blank"; d2.rel = "noopener"; }

  var items = [
    { n: "Join Discord", c: "Action / Link", d: ["Opens the Qubit Discord so you can get updates, ask for help and report bugs."] },
    { n: "Settings", c: "Menu / Setting", d: ["Choose which hand opens the menu and how loud the button clicks are.", "Notifications can be moved and shortened here too."] },
    { n: "Players", c: "Room / Page", d: ["Lists everyone in your lobby. Pick a player to open the options for them."] },
    { n: "Favorite Mods", c: "Mods / Page", d: ["Pin the mods you use most so they sit at the top of the list."] },
    { n: "Enabled Mods", c: "Mods / Setting", d: ["Shows all mods you have enabled."] },
    { n: "Room Mods", c: "Room / Page", d: ["Tools that act on the room you are in, grouped together in one place."] }
  ];
  var themes = {
    violet:  { a: "#9585ff", b: "#c566ff", t: "#bcaaff" },
    ember:   { a: "#ff9a5c", b: "#ff4f93", t: "#ffb48a" },
    glacier: { a: "#70d6ff", b: "#6b8cff", t: "#a6e4ff" },
    toxic:   { a: "#c4f548", b: "#3fd69b", t: "#d6f98a" }
  };
  var state = { i: 4, p: 0, tab: "info" };
  var root = document.documentElement;
  var qm = document.getElementById("qm");
  var $ = function (id) { return document.getElementById(id); };

  function render() {
    var it = items[state.i];
    if (state.p >= it.d.length) state.p = 0;
    $("qm-title").textContent = it.n;
    $("qm-cat").textContent = it.c;
    $("qm-desc").textContent = it.d[state.p];
    $("qm-pbtn").textContent = it.n;
    $("qm-foot").textContent = "Description " + (state.p + 1) + "/" + it.d.length + " / <> to browse";
    Array.prototype.forEach.call(document.querySelectorAll("#qm-menu .qm-btn"), function (b) {
      b.setAttribute("aria-pressed", String(Number(b.dataset.i) === state.i));
    });
  }
  function showTab(name) {
    state.tab = name;
    ["info", "fonts", "themes"].forEach(function (k) { $("pane-" + k).hidden = k !== name; });
    Array.prototype.forEach.call(document.querySelectorAll(".qm-tab"), function (t) {
      t.setAttribute("aria-selected", String(t.dataset.tab === name));
    });
  }
  function setFont(btn) {
    qm.style.setProperty("--mf", "'" + btn.dataset.font + "', 'Pixelify Sans', monospace");
    qm.style.setProperty("--mfs", btn.dataset.scale);
    Array.prototype.forEach.call(document.querySelectorAll("#font-choices .qm-choice"), function (b) {
      b.setAttribute("aria-pressed", String(b === btn));
    });
  }
  function setTheme(name) {
    var t = themes[name]; if (!t) return;
    root.style.setProperty("--a", t.a); root.style.setProperty("--b", t.b); root.style.setProperty("--t", t.t);
    Array.prototype.forEach.call(document.querySelectorAll("[data-theme]"), function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.theme === name));
    });
    try { localStorage.setItem("qubit-theme", name); } catch (e) {}
  }

  $("qm-menu").addEventListener("click", function (e) {
    var b = e.target.closest(".qm-btn"); if (!b) return;
    state.i = Number(b.dataset.i); state.p = 0; showTab("info"); render();
  });
  document.querySelector(".qm-tabs").addEventListener("click", function (e) {
    var t = e.target.closest(".qm-tab"); if (t) showTab(t.dataset.tab);
  });
  $("font-choices").addEventListener("click", function (e) {
    var b = e.target.closest(".qm-choice"); if (b) setFont(b);
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-theme]"); if (b) setTheme(b.dataset.theme);
  });
  $("qm-prev").addEventListener("click", function () {
    var n = items[state.i].d.length; state.p = (state.p - 1 + n) % n; showTab("info"); render();
  });
  $("qm-next").addEventListener("click", function () {
    var n = items[state.i].d.length; state.p = (state.p + 1) % n; showTab("info"); render();
  });
  document.querySelector(".qm-icons").addEventListener("click", function (e) {
    var b = e.target.closest(".qm-ico"); if (!b) return;
    if (b.dataset.act === "home") { state.i = 4; state.p = 0; showTab("info"); render(); }
    if (b.dataset.act === "exit") { state.i = 0; state.p = 0; showTab("info"); render(); }
    if (b.dataset.act === "search") { showTab("fonts"); }
  });

  function tick() {
    var n = new Date();
    $("qm-time").textContent = n.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    $("qm-date").textContent = n.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  }
  tick(); setInterval(tick, 20000);

  try { var saved = localStorage.getItem("qubit-theme"); if (saved && themes[saved]) setTheme(saved); } catch (e) {}
  render();
})();
