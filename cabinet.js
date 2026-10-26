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

function initials2(name) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

/* ---------- Selekter ---------- */
function renderSelects() {
  $("#teacher-select").innerHTML = teachers
    .map((tc) => `<option value="${tc.id}"${String(tc.id) === String(teacherId) ? " selected" : ""}>${esc(tc.name)}</option>`)
    .join("");
  $("#year-select").innerHTML = YEARS.map((y) => `<option value="${y}"${y === year ? " selected" : ""}>${t("year_of", y)}</option>`).join("");

  $("#teacher-select").addEventListener("change", (e) => {
    teacherId = e.target.value;
    location.search = `?teacher=${teacherId}&year=${year}`;
    renderAll();
  });
  $("#year-select").addEventListener("change", (e) => {
    year = parseInt(e.target.value);
    location.search = `?teacher=${teacherId}&year=${year}`;
    renderAll();
  });
}

/* ---------- Serdikat ---- */
function certMedia(c) {
  const kind = c.kind || "image";
  if (kind === "image") return `<img src="${c.data}" alt="${esc(c.name)}" />`;
  return `<div class="cert-file"><span class="cert-file-ico">${fileIcon(c.fname || c.name)}</span><span class="cert-file-name">${esc(c.fname || "Файл")}</span></div>`;
}

function renderCerts() {
  const tc = T();
  const grid = $("#certs-grid");
  if (!tc.certs.length) {
    grid.innerHTML = '<p class="certs-empty">' + t("certs_empty") + "</p>";
    return;
  }
  grid.innerHTML = tc.certs
    .map(
      (c, i) => `
    <div class="cert-card">
      ${certMedia(c)}
      <div class="cert-name">${esc(c.name)}</div>
      <button class="cert-del" data-i="${i}" title="Жою">✕</button>
    </div>`
    )
    .join("");
  grid.onclick = (e) => {
    const btn = e.target.closest(".cert-del");
    if (btn) {
      T().certs.splice(+btn.dataset.i, 1);
      if (persist()) renderCerts();
      toast(t("cert_deleted"));
      return;
    }
    /* Суретке/файлға басу — ашу */
    const card = e.target.closest(".cert-card");
    if (card) {
      const c = T().certs[[...card.parentElement.children].indexOf(card)];
      if (!c) return;
      if ((c.kind || "image") === "image") {
        const ov = document.createElement("div");
        ov.className = "lightbox";
        ov.innerHTML = `<img src="${c.data}" alt="" />`;
        ov.onclick = () => ov.remove();
        document.body.appendChild(ov);
      } else openFileDataUrl(c.data);
    }
  };
}

let pendingCertFile = null;
$("#cert-file").addEventListener("change", (e) => {
  pendingCertFile = e.target.files[0] || null;
  if (pendingCertFile) toast(t("file_selected") + pendingCertFile.name);
});

$("#cert-add").addEventListener("click", async () => {
  if (!pendingCertFile) return toast(t("file_first"));
  const f = pendingCertFile;
  const name = $("#cert-name").value.trim() || f.name.replace(/\.[^.]+$/, "");
  try {
    let cert;
    if (f.type.startsWith("image/")) {
      cert = { name, kind: "image", data: await fileToDataUrl(f, 900) };
    } else {
      if (f.size > 2 * 1024 * 1024) return toast(t("file_big"));
      cert = { name, kind: "file", data: await fileToRawDataUrl(f), fname: f.name, mime: f.type };
    }
    T().certs.unshift(cert);
    if (!persist()) return;
    renderCerts();
    $("#cert-name").value = "";
    $("#cert-file").value = "";
    pendingCertFile = null;
    toast(t("cert_added"));
  } catch {
    toast(t("file_read_err"));
  }
});

/* ---------- Zhetistikter ---------- */
/* Жетістік: жай мәтін немесе {text, att} (att = {kind:"image"|"file", data, fname?}) */
function normAch(a) {
  if (typeof a === "string") return { text: a, att: null };
  const att = a.att || (a.img ? { kind: "image", data: a.img } : null);
  return { text: a.text || "", att };
}

function renderAch() {
  const tc = T();
  const list = $("#ach-list");
  list.innerHTML = tc.achievements.length
    ? tc.achievements
        .map((a, i) => {
          const item = normAch(a);
          let media = "";
          if (item.att) {
            media = item.att.kind === "image"
              ? `<img class="ach-thumb" src="${item.att.data}" alt="" />`
              : `<span class="ach-file" title="${t("click_to_open")}">${fileIcon(item.att.fname)} <span class="fname">${esc(item.att.fname || "Файл")}</span></span>`;
          }
          const textPart = item.text ? `<span>🏆 ${esc(item.text)}</span>` : "";
          return `<div class="ach-item${item.att ? (item.att.kind === "image" ? " has-img" : " has-file") : ""}">${media}${textPart}<button class="ach-del" data-i="${i}">✕</button></div>`;
        })
        .join("")
    : '<p class="certs-empty">' + t("ach_empty") + "</p>";
  list.onclick = (e) => {
    const btn = e.target.closest(".ach-del");
    if (btn) {
      T().achievements.splice(+btn.dataset.i, 1);
      if (persist()) renderAch();
      return;
    }
    const idx = [...list.children].indexOf(e.target.closest(".ach-item"));
    if (idx < 0) return;
    const item = normAch(T().achievements[idx]);
    if (!item.att) return;
    if (item.att.kind === "image") {
      const ov = document.createElement("div");
      ov.className = "lightbox";
      ov.innerHTML = `<img src="${item.att.data}" alt="" />`;
      ov.onclick = () => ov.remove();
      document.body.appendChild(ov);
    } else openFileDataUrl(item.att.data);
  };
}

let achFile = null; /* таңдалған файлды уақытша сақтау */

async function addAch() {
  const v = $("#ach-input").value.trim();
  if (!v && !achFile) return toast(t("ach_required"));
  let att = null;
  if (achFile) {
    try {
      if (achFile.type.startsWith("image/")) {
        att = { kind: "image", data: await fileToDataUrl(achFile) };
      } else {
        if (achFile.size > 2 * 1024 * 1024) return toast(t("file_big"));
        att = { kind: "file", data: await fileToRawDataUrl(achFile), fname: achFile.name };
      }
    } catch {
      return toast(t("file_read_err"));
    }
  }
  T().achievements.unshift({ text: v, att });
  if (!persist()) return;
  renderAch();
  $("#ach-input").value = "";
  achFile = null;
  const f = $("#ach-file");
  if (f) f.value = "";
  $("#ach-file-btn").textContent = t("btn_choose_file");
  renderStats();
  toast(t("ach_added"));
}
$("#ach-add").addEventListener("click", addAch);
$("#ach-input").addEventListener("keydown", (e) => e.key === "Enter" && addAch());
$("#ach-file").addEventListener("change", (e) => {
  const file = e.target.files[0] || null;
  achFile = file;
  $("#ach-file-btn").textContent = file ? "✅ " + (file.name.length > 18 ? file.name.slice(0, 18) + "…" : file.name) : t("btn_choose_file");
  if (file) toast(t("file_selected") + file.name);
});

/* ---------- Raspi ---- */
function schedEntry(shift, period, day) {
  return T().schedule.find((s) => s.shift === shift && s.period === period && s.day === day);
}

function renderSchedule() {
  $("#sched-year").textContent = year;
  const tc = T();
  const total = tc.schedule.length;

  /* Top-synyp boiynsha sana */
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

  /* Tor kozege basu — joiu */
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

/* Saabaq qosu */
function renderAddForm() {
  $("#sa-day").innerHTML = DAYS.map((d, i) => `<option value="${i}">${tDay(i)}</option>`).join("");
  $("#sa-period").innerHTML = PERIODS.am
    .map((times, i) => `<option value="${i + 1}">${t("period_label", i + 1, times[0] + "–" + times[1])}</option>`)
    .join("");

  /* Auysym auysqanda uaqyt jazbalary */
  const shiftSel = $("#sa-shift");
  const periodSel = $("#sa-period");
  const updatePeriods = () => {
    periodSel.innerHTML = PERIODS[shiftSel.value]
      .map((times, i) => `<option value="${i + 1}">${t("period_label", i + 1, times[0] + "–" + times[1])}</option>`)
      .join("");
  };
  shiftSel.addEventListener("change", updatePeriods);
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

/* ---------- Mобильdi meni ---- */
$("#burger").addEventListener("click", () => {
  $("#burger").classList.toggle("open");
  $("#nav").classList.toggle("open");
});

/* ---------- Barlyn qosu ---------- */
function renderAll() {
  renderProfile();
  renderStats();
  renderCerts();
  renderAch();
  renderSchedule();
}

ensureSeed();
renderSelects();
renderAddForm();
$("#year").textContent = new Date().getFullYear();
renderAll();

/* Тіл ауықса — динамикалық жолдарды қайта рендер */
window.addEventListener("langchange", () => renderAll());
