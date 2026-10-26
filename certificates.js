/* ===== Serdikattar (jeki bet) ===== */

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
    throw new Error("auth gate: certificates");
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

/* ---------- Serdikat ---------- */
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
      <button class="cert-dl" data-i="${i}" title="${t("dl_title")}">⬇</button>
      <button class="cert-del" data-i="${i}" title="${t("dl_title_delete")}">✕</button>
    </div>`
    )
    .join("");
  grid.onclick = (e) => {
    const dl = e.target.closest(".cert-dl");
    if (dl) {
      const c = T().certs[+dl.dataset.i];
      if (!c) return;
      const fname = (c.kind || "image") === "image" ? (c.name || "certificate") + ".jpg" : (c.fname || c.name + ".bin");
      downloadDataUrl(c.data, fname);
      return;
    }
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

/* ---------- Mobil meni ---------- */
$("#burger").addEventListener("click", () => {
  $("#burger").classList.toggle("open");
  $("#nav").classList.toggle("open");
});

ensureSeed();
$("#year").textContent = new Date().getFullYear();
renderCerts();

/* Тіл ауықса — қайта рендер */
window.addEventListener("langchange", renderCerts);
