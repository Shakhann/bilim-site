/* ===== Mugalim kabinet ===== */

/* ---------- Auth gate: tek mugalimga ---------- */
(function () {
  const s = store.get("bilim.session", null);
  if (!s || s.role !== "teacher") {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="gate-overlay"><div class="gate-card"><h2>🔒 ${
        s ? t("gate_teacher_only") : t("gate_login")
      }</h2><p class="muted">${
        s ? t("gate_student") : t("gate_register")
      }</p><a class="btn btn-primary" href="auth.html">${t("btn_login_reg")}</a><a class="btn btn-ghost" href="index.html">${t("nav_home")}</a></div></div>`
    );
    throw new Error("auth gate: cabinet");
  }
})();

const params = new URLSearchParams(location.search);
let teacherId = params.get("teacher") || (store.get("bilim.session", {}).teacherId ?? 0);
let year = parseInt(params.get("year")) || 2026;
let teachers = getTeachers();
if (!teachers.some((t) => String(t.id) === String(teacherId))) teacherId = teachers.length ? teachers[0].id : 0;

const T = () => teachers.find((t) => String(t.id) === String(teacherId)) || { name: "—", subject: "", exp: "", color: "#4f46e5", certs: [], achievements: [], years: {}, schedule: [] };
const persist = () => {
  try {
    saveTeachers(teachers);
    return true;
  } catch {
    toast(t("quota_full"));
    return false;
  }
};

/* ---------- Profil ---------- */
function renderProfile() {
  const tc = T();
  const av = $("#cab-avatar");
  av.textContent = initials2(tc.name);
  av.style.background = tc.color;
  $("#cab-name").textContent = tc.name;
  $("#cab-subject").textContent = "📚 " + tc.subject;
  $("#cab-exp").textContent = "⭐ " + tc.exp;
}

function renderStats() {
  const tc = T();
  $("#stat-lessons").textContent = tc.schedule.length;
  const cls = new Set(tc.schedule.map((s) => s.cls)).size;
  $("#stat-classes").textContent = cls;
  $("#stat-certs").textContent = tc.certs.length;
  $("#stat-ach").textContent = tc.achievements.length;
}

/* ---------- Cloud sync status ---------- */
function renderSync() {
  const el = $("#sync-status");
  if (!el) return;
  const s = store.get("bilim.session", null);
  let html = "";
  if (s && s.role === "teacher") {
    const st = (typeof cloudStatus === "function") ? cloudStatus() : { state: "local" };
    const tm = st.time ? new Date(st.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    if (st.state === "ok") html = "☁️ " + t("sync_saved", tm);
    else if (st.state === "pushing") html = "☁️ " + t("sync_on");
    else if (st.state === "err") html = "⚠️ " + t("sync_err");
    else html = "💾 " + t("sync_local");
  }
  el.innerHTML = html;
  el.title = t("sync_note", (s && s.email) || "");
}

function initials2(name) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

/* ---------- Selekter ---------- */
function renderSelects() {
  $("#year-select").innerHTML = YEARS.map((y) => `<option value="${y}"${y === year ? " selected" : ""}>${t("year_of", y)}</option>`).join("");

  $("#year-select").addEventListener("change", (e) => {
    year = parseInt(e.target.value);
    location.search = `?teacher=${teacherId}&year=${year}`;
    renderAll();
  });
}


/* ---------- Mобильdi meni ---- */
$("#burger").addEventListener("click", () => {
  $("#burger").classList.toggle("open");
  $("#nav").classList.toggle("open");
});

/* ---------- Barlyn qosu ---------- */
function renderAll() {
  renderProfile();
  renderStats();
  renderSync();
}

ensureSeed();
renderSelects();
$("#year").textContent = new Date().getFullYear();
renderAll();

/* Тіл ауықса — динамикалық жолдарды қайта рендер */
window.addEventListener("langchange", () => renderAll());
window.addEventListener("cloudsync", (e) => {
  if (e.detail && e.detail.state === "ok") {
    /* Бұлттан жаңа дерек жүктелді — жаңа snapshot + қайта рендер */
    teachers = getTeachers();
    const s = store.get("bilim.session", null);
    if (s && !teachers.some((x) => String(x.id) === String(teacherId))) {
      const me = teachers.find((x) => x.email && String(x.email).toLowerCase() === String(s.email).toLowerCase());
      if (me) teacherId = me.id;
    }
    renderAll();
  }
  renderSync();
});
renderSync();
