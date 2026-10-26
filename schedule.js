/* ===== Aptylyq raspisyiye (jeki bet) ===== */

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
    throw new Error("auth gate: schedule");
  }
})();

const params = new URLSearchParams(location.search);
let teacherId = params.get("teacher") || (store.get("bilim.session", {}).teacherId ?? 0);
let year = parseInt(params.get("year")) || 2026;
const teachers = getTeachers();
if (!teachers.some((t) => String(t.id) === String(teacherId))) teacherId = teachers[0].id;

const T = () => teachers.find((t) => String(t.id) === String(teacherId));
const persist = () => {
  try {
    saveTeachers(teachers);
    return true;
  } catch {
    toast(t("quota_full"));
    return false;
  }
};

/* ---------- Selekter ---------- */
function renderYearSelect() {
  $("#year-select").innerHTML = YEARS.map((y) => `<option value="${y}"${y === year ? " selected" : ""}>${t("year_of", y)}</option>`).join("");
  $("#year-select").onchange = (e) => {
    year = parseInt(e.target.value);
    location.search = `?teacher=${teacherId}&year=${year}`;
    renderSchedule();
  };
}

/* ---------- Raspisyiye ---------- */
function schedEntry(shift, period, day) {
  return T().schedule.find((s) => s.shift === shift && s.period === period && s.day === day);
}

function renderSchedule() {
  $("#sched-year").textContent = year;
  const tc = T();
  const total = tc.schedule.length;

  const byClass = {};
  tc.schedule.forEach((s) => (byClass[s.cls] = (byClass[s.cls] || 0) + 1));
  const byClassHtml = Object.entries(byClass)
    .sort((a, b) => a[0].localeCompare(b[0], "kk"))
    .map(([c, n]) => `<div class="sched-stat"><b>${n}</b><span>${esc(c)} ${t("class_of")}</span></div>`)
    .join("");

  $("#sched-stats").innerHTML = `<div class="sched-stat"><b>${total}</b><span>${t("lessons_week_label")}</span></div>` + byClassHtml;

  ["am", "pm"].forEach((shift) => {
    const grid = $(`#grid-${shift}`);
    let html = "<tr><th>" + t("sched_lesson") + "</th><th>" + t("sched_time") + "</th>" + DAYS.map((d, i) => `<th>${tDay(i)}</th>`).join("") + "</tr>";
    PERIODS[shift].forEach((times, pi) => {
      const p = pi + 1;
      html += `<tr><td class="time">${p}</td><td class="time">${times[0]}–${times[1]}</td>`;
      for (let d = 0; d < DAYS.length; d++) {
        const e = schedEntry(shift, p, d);
        html += e
          ? `<td class="sched-cell" data-shift="${shift}" data-period="${p}" data-day="${d}">
               <div class="cls">${esc(e.cls)}</div><div class="room">${esc(e.room)} каб.</div><span class="x">✕</span>
             </td>`
          : `<td class="sched-cell"></td>`;
      }
      html += "</tr>";
    });
    grid.innerHTML = html;
  });

  $("#grid-am").onclick = onCellClick;
  $("#grid-pm").onclick = onCellClick;
}

function onCellClick(e) {
  const cell = e.target.closest(".sched-cell[data-shift]");
  if (!cell) return;
  const shift = cell.dataset.shift;
  const period = +cell.dataset.period;
  const day = +cell.dataset.day;
  const tc = T();
  const i = tc.schedule.findIndex((s) => s.shift === shift && s.period === period && s.day === day);
  if (i >= 0) {
    const removed = tc.schedule.splice(i, 1)[0];
    persist();
    renderSchedule();
    toast(t("sched_removed", tDay(day), removed.cls, removed.room));
  }
}

/* ---------- Saabaq qosu ---------- */
function renderAddForm() {
  $("#sa-day").innerHTML = DAYS.map((d, i) => `<option value="${i}">${tDay(i)}</option>`).join("");
  const shiftSel = $("#sa-shift");
  const periodSel = $("#sa-period");
  const updatePeriods = () => {
    periodSel.innerHTML = PERIODS[shiftSel.value]
      .map((times, i) => `<option value="${i + 1}">${t("period_label", i + 1, times[0] + "–" + times[1])}</option>`)
      .join("");
  };
  updatePeriods();
  shiftSel.onchange = updatePeriods;
}

$("#sa-add").addEventListener("click", () => {
  const shift = $("#sa-shift").value;
  const period = +$("#sa-period").value;
  const day = +$("#sa-day").value;
  const cls = $("#sa-cls").value.trim().toUpperCase();
  const room = $("#sa-room").value.trim();
  if (!cls || !room) return toast(t("sa_fill_req"));
  const tc = T();
  if (schedEntry(shift, period, day)) return toast(t("sa_busy"));
  tc.schedule.push({ day, shift, period, cls, room });
  persist();
  renderSchedule();
  toast(t("sa_added", tDay(day), period, cls, room));
});

/* ---------- Mobil meni ---------- */
$("#burger").addEventListener("click", () => {
  $("#burger").classList.toggle("open");
  $("#nav").classList.toggle("open");
});

ensureSeed();
renderYearSelect();
renderAddForm();
$("#year").textContent = new Date().getFullYear();
renderSchedule();

/* Anchor scroll: #add-form (мәзірден «Сабақ қосу» ашылғанда) */
if (location.hash) {
  const anchorEl = document.querySelector(location.hash);
  if (anchorEl) setTimeout(() => anchorEl.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

/* Тіл ауықса — қайта рендер */
window.addEventListener("langchange", () => {
  renderYearSelect();
  renderAddForm();
  renderSchedule();
});
