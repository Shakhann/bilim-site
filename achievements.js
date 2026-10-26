/* ===== Zhetistikter (jeki bet) ===== */

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
    throw new Error("auth gate: achievements");
  }
})();

const params = new URLSearchParams(location.search);
let teacherId = params.get("teacher") || (store.get("bilim.session", {}).teacherId ?? 0);
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
          const dlBtn = item.att ? `<button class="ach-dl" data-i="${i}" title="${t("dl_title")}">⬇</button>` : "";
          return `<div class="ach-item${item.att ? (item.att.kind === "image" ? " has-img" : " has-file") : ""}">${media}${textPart}${dlBtn}<button class="ach-del" data-i="${i}">✕</button></div>`;
        })
        .join("")
    : '<p class="certs-empty">' + t("ach_empty") + "</p>";
  list.onclick = (e) => {
    const dl = e.target.closest(".ach-dl");
    if (dl) {
      const it = normAch(T().achievements[+dl.dataset.i]);
      if (it && it.att) downloadDataUrl(it.att.data, it.att.fname || (it.att.kind === "image" ? "achievement.jpg" : "achievement.bin"));
      return;
    }
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

/* ---------- Mobil meni ---------- */
$("#burger").addEventListener("click", () => {
  $("#burger").classList.toggle("open");
  $("#nav").classList.toggle("open");
});

ensureSeed();
$("#year").textContent = new Date().getFullYear();
renderAch();

/* Тіл ауықса — қайта рендер */
window.addEventListener("langchange", renderAch);
