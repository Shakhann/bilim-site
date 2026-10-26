/* ===== Mugalim kabinet ===== */

/* ---------- Auth gate: tek mugalimga ---------- */
(function () {
  const s = store.get("bilim.session", null);
  if (!s || s.role !== "teacher") {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="gate-overlay"><div class="gate-card"><h2>🔒 ${
        s ? "Бұл бет тек мұғалімдерге арналған" : "Кіру қажет"
      }</h2><p class="muted">${
        s ? "Сіз оқушы ретінде кіргенсіз. Кабинет — мұғалімдерге ғана ашылады." : "Мұғалім ретінде тіркеліңіз немесе кіріңіз (Google-мен де болады)"
      }</p><a class="btn btn-primary" href="auth.html">Кіру / Тіркелу</a><a class="btn btn-ghost" href="index.html">Басты бетке</a></div></div>`
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
    toast("⚠️ Браузер жады толық — кейбір файлдарды өшіріп көріңіз");
    return false;
  }
};

/* ---------- Profil ---------- */
function renderProfile() {
  const t = T();
  const av = $("#cab-avatar");
  av.textContent = initials2(t.name);
  av.style.background = t.color;
  $("#cab-name").textContent = t.name;
  $("#cab-subject").textContent = "📚 " + t.subject;
  $("#cab-exp").textContent = "⭐ " + t.exp;
}

function renderStats() {
  const t = T();
  $("#stat-lessons").textContent = t.schedule.length;
  const cls = new Set(t.schedule.map((s) => s.cls)).size;
  $("#stat-classes").textContent = cls;
  $("#stat-classes-year").textContent = "расписаниедегі сынып";
  $("#stat-certs").textContent = t.certs.length;
  $("#stat-ach").textContent = t.achievements.length;
}

function initials2(name) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

/* ---------- Selekter ---------- */
function renderSelects() {
  $("#teacher-select").innerHTML = teachers
    .map((t) => `<option value="${t.id}"${String(t.id) === String(teacherId) ? " selected" : ""}>${esc(t.name)}</option>`)
    .join("");
  $("#year-select").innerHTML = YEARS.map((y) => `<option value="${y}"${y === year ? " selected" : ""}>${y} оқу жылы</option>`).join("");

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
  const t = T();
  const grid = $("#certs-grid");
  if (!t.certs.length) {
    grid.innerHTML = '<p class="certs-empty">Әзірге сертификат жоқ. Жоғарғы пішін арқылы қосыңыз.</p>';
    return;
  }
  grid.innerHTML = t.certs
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
      toast("Сертификат жойылды");
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
  if (pendingCertFile) toast("📎 Файл таңдалды: " + pendingCertFile.name);
});

$("#cert-add").addEventListener("click", async () => {
  if (!pendingCertFile) return toast("Алдымен файл таңдаңыз (сурет, PDF, Word...)");
  const f = pendingCertFile;
  const name = $("#cert-name").value.trim() || f.name.replace(/\.[^.]+$/, "");
  try {
    let cert;
    if (f.type.startsWith("image/")) {
      cert = { name, kind: "image", data: await fileToDataUrl(f, 900) };
    } else {
      if (f.size > 2 * 1024 * 1024) return toast("⚠️ Файл 2MB-тан үлкен — кішірейтіп жүктеңіз");
      cert = { name, kind: "file", data: await fileToRawDataUrl(f), fname: f.name, mime: f.type };
    }
    T().certs.unshift(cert);
    if (!persist()) return;
    renderCerts();
    $("#cert-name").value = "";
    $("#cert-file").value = "";
    pendingCertFile = null;
    toast("✅ Сертификат қосылды");
  } catch {
    toast("Қате: файлты оқу мүмкін болмады");
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
  const t = T();
  const list = $("#ach-list");
  list.innerHTML = t.achievements.length
    ? t.achievements
        .map((a, i) => {
          const item = normAch(a);
          let media = "";
          if (item.att) {
            media = item.att.kind === "image"
              ? `<img class="ach-thumb" src="${item.att.data}" alt="" />`
              : `<span class="ach-file" title="Ашу үшін басыңыз">${fileIcon(item.att.fname)} <span class="fname">${esc(item.att.fname || "Файл")}</span></span>`;
          }
          const textPart = item.text ? `<span>🏆 ${esc(item.text)}</span>` : "";
          return `<div class="ach-item${item.att ? (item.att.kind === "image" ? " has-img" : " has-file") : ""}">${media}${textPart}<button class="ach-del" data-i="${i}">✕</button></div>`;
        })
        .join("")
    : '<p class="certs-empty">Әзірге жетістік жоқ.</p>';
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
  if (!v && !achFile) return toast("Жетістік жазыңыз немесе файл таңдаңыз");
  let att = null;
  if (achFile) {
    try {
      if (achFile.type.startsWith("image/")) {
        att = { kind: "image", data: await fileToDataUrl(achFile) };
      } else {
        if (achFile.size > 2 * 1024 * 1024) return toast("⚠️ Файл 2MB-тан үлкен — кішірейтіп жүктеңіз");
        att = { kind: "file", data: await fileToRawDataUrl(achFile), fname: achFile.name };
      }
    } catch {
      return toast("Файлды оқу мүмкін болмады");
    }
  }
  T().achievements.unshift({ text: v, att });
  if (!persist()) return;
  renderAch();
  $("#ach-input").value = "";
  achFile = null;
  const f = $("#ach-file");
  if (f) f.value = "";
  $("#ach-file-btn").textContent = "📎 Файл таңда";
  renderStats();
  toast("✅ Жетістік қосылды");
}
$("#ach-add").addEventListener("click", addAch);
$("#ach-input").addEventListener("keydown", (e) => e.key === "Enter" && addAch());
$("#ach-file").addEventListener("change", (e) => {
  const file = e.target.files[0] || null;
  achFile = file;
  $("#ach-file-btn").textContent = file ? "✅ " + (file.name.length > 18 ? file.name.slice(0, 18) + "…" : file.name) : "📎 Файл таңда";
  if (file) toast("📎 Файл таңдалды: " + file.name);
});

/* ---------- Raspi ---- */
function schedEntry(shift, period, day) {
  return T().schedule.find((s) => s.shift === shift && s.period === period && s.day === day);
}

function renderSchedule() {
  $("#sched-year").textContent = year;
  const t = T();
  const total = t.schedule.length;

  /* Top-synyp boiynsha sana */
  const byClass = {};
  t.schedule.forEach((s) => (byClass[s.cls] = (byClass[s.cls] || 0) + 1));
  const byClassHtml = Object.entries(byClass)
    .sort((a, b) => a[0].localeCompare(b[0], "kk"))
    .map(([c, n]) => `<div class="sched-stat"><b>${n}</b><span>${esc(c)} сыныбы</span></div>`)
    .join("");

  $("#sched-stats").innerHTML = `<div class="sched-stat"><b>${total}</b><span>аптасына сабақ саны</span></div>` + byClassHtml;

  ["am", "pm"].forEach((shift) => {
    const grid = $(`#grid-${shift}`);
    let html = "<tr><th>Сабақ</th><th>Уақыт</th>" + DAYS.map((d) => `<th>${d}</th>`).join("") + "</tr>";
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
  const t = T();
  const i = t.schedule.findIndex((s) => s.shift === shift && s.period === period && s.day === day);
  if (i >= 0) {
    const removed = t.schedule.splice(i, 1)[0];
    persist();
    renderSchedule();
    toast(`Жойылды: ${DAYS[day]}, ${removed.cls} (${removed.room} каб.)`);
  }
}

/* Saabaq qosu */
function renderAddForm() {
  $("#sa-day").innerHTML = DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join("");
  $("#sa-period").innerHTML = PERIODS.am
    .map((times, i) => `<option value="${i + 1}">${i + 1} сабақ (${times[0]}–${times[1]})</option>`)
    .join("");

  /* Auysym auysqanda uaqyt jazbalary */
  const shiftSel = $("#sa-shift");
  const periodSel = $("#sa-period");
  const updatePeriods = () => {
    periodSel.innerHTML = PERIODS[shiftSel.value]
      .map((times, i) => `<option value="${i + 1}">${i + 1} сабақ (${times[0]}–${times[1]})</option>`)
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
  if (!cls || !room) return toast("Сынып пен кабинетті жазыңыз");
  const t = T();
  if (schedEntry(shift, period, day)) return toast("Бұл кезде сабақ бар — алдымен жойыңыз");
  t.schedule.push({ day, shift, period, cls, room });
  persist();
  renderSchedule();
  toast(`✅ Қосылды: ${DAYS[day]}, ${period} сабақ, ${cls}, ${room} каб.`);
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
