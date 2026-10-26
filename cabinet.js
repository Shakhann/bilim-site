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
const persist = () => saveTeachers(teachers);

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
  const cls = t.years[year] || [];
  $("#stat-classes").textContent = cls.length;
  $("#stat-classes-year").textContent = year + " жыл: сынып саны";
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
      <img src="${c.data}" alt="${esc(c.name)}" />
      <div class="cert-name">${esc(c.name)}</div>
      <button class="cert-del" data-i="${i}" title="Жою">✕</button>
    </div>`
    )
    .join("");
  grid.onclick = (e) => {
    const btn = e.target.closest(".cert-del");
    if (!btn) return;
    T().certs.splice(+btn.dataset.i, 1);
    persist();
    renderCerts();
    toast("Сертификат жойылды");
  };
}

let pendingCertFile = null;
$("#cert-file").addEventListener("change", (e) => {
  pendingCertFile = e.target.files[0] || null;
  if (pendingCertFile) toast("📎 Сурет таңдалды: " + pendingCertFile.name);
});

$("#cert-add").addEventListener("click", async () => {
  if (!pendingCertFile) return toast("Алдымен сурет таңдаңыз");
  const name = $("#cert-name").value.trim() || pendingCertFile.name;
  try {
    const data = await fileToDataUrl(pendingCertFile, 900);
    T().certs.unshift({ name, data });
    persist();
    renderCerts();
    $("#cert-name").value = "";
    $("#cert-file").value = "";
    pendingCertFile = null;
    toast("✅ Сертификат қосылды");
  } catch {
    toast("Қате: сурет өте үлкен болуы мүмкін");
  }
});

/* ---------- Zhetistikter ---------- */
function renderAch() {
  const t = T();
  const list = $("#ach-list");
  list.innerHTML = t.achievements.length
    ? t.achievements
        .map((a, i) => `<div class="ach-item"><span>🏆 ${esc(a)}</span><button class="ach-del" data-i="${i}">✕</button></div>`)
        .join("")
    : '<p class="certs-empty">Әзірге жетістік жоқ.</p>';
  list.onclick = (e) => {
    const btn = e.target.closest(".ach-del");
    if (!btn) return;
    T().achievements.splice(+btn.dataset.i, 1);
    persist();
    renderAch();
  };
}

function addAch() {
  const v = $("#ach-input").value.trim();
  if (!v) return;
  T().achievements.unshift(v);
  persist();
  renderAch();
  $("#ach-input").value = "";
  toast("✅ Жетістік қосылды");
}
$("#ach-add").addEventListener("click", addAch);
$("#ach-input").addEventListener("keydown", (e) => e.key === "Enter" && addAch());

/* ---------- Jyldyq synyp ---- */
function renderYears() {
  const t = T();
  $("#years-classes").innerHTML = YEARS.map((y) => {
    const cls = t.years[y] || [];
    return `
    <div class="year-block${y === year ? " current" : ""}">
      <h3>${y} оқу жылы ${y === year ? "· қазіргі" : ""}</h3>
      <div class="chips">
        ${
          cls.length
            ? cls
                .map(
                  (c, i) => `<span class="chip">${esc(c)}<button data-y="${y}" data-i="${i}" title="Жою">✕</button></span>`
                )
                .join("")
            : '<span class="muted" style="font-size:0.85rem">сынып жоқ</span>'
        }
      </div>
      <div class="year-add">
        <input type="text" id="yc-${y}" placeholder="сынып, мыс: 6Б" maxlength="5" />
        <button class="mini-btn" id="ycb-${y}">+ Қосу</button>
      </div>
    </div>`;
  }).join("");

  $("#years-classes").onclick = (e) => {
    const del = e.target.closest(".chip button");
    if (del) {
      const y = del.dataset.y;
      T().years[y].splice(+del.dataset.i, 1);
      persist();
      renderYears();
      return;
    }
    const add = e.target.closest("[id^='ycb-']");
    if (add) {
      const y = add.id.slice(4);
      const input = $(`#yc-${y}`);
      const v = input.value.trim();
      if (!v) return toast("Сынып атауын жазыңыз");
      T().years[y] = T().years[y] || [];
      if (!T().years[y].includes(v)) T().years[y].push(v);
      persist();
      renderYears();
      toast(`✅ ${y} жылға «${v}» қосылды`);
    }
  };
}

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
      for (let d = 0; d < 5; d++) {
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
  renderYears();
  renderSchedule();
}

ensureSeed();
renderSelects();
renderAddForm();
$("#year").textContent = new Date().getFullYear();
renderAll();
