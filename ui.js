/* ===== UI және реалтайм (PeerJS) көмекшілері ===== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(msg) {
  let t = $(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2800);
}

/* QR-код: сыртқы қызмет арқылы сурет ретінде */
function qrImg(text, size = 240, cls = "") {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=2&data=${encodeURIComponent(text)}`;
  return `<img class="${cls}" src="${url}" alt="QR" onerror="this.style.display='none'" />`;
}

/* Сілтемеден видео: YouTube → iframe, тікелей файл → <video> */
function videoEmbed(url) {
  const y = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/);
  if (y) return `<iframe class="vid" src="https://www.youtube.com/embed/${y[1]}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
  if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url))
    return `<video class="vid" src="${esc(url)}" controls autoplay></video>`;
  return `<div class="vid-fallback">⚠️ Бұл сілтеме видео ретінде танылмады:<br><a href="${esc(url)}" target="_blank">${esc(url)}</a></div>`;
}

/* Суретті кішірейтіп dataURL-ға айналдыру (localStorage үнемдеу үшін) */
function fileToDataUrl(file, maxW = 900) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ---------- Realtime: мұғалім = host, оқушы = join (PeerJS/WebRTC) ---------- */

function rtHost(code, h = {}) {
  if (typeof Peer === "undefined") {
    h.onError && h.onError("PeerJS жүктелмеді — интернет қажет");
    return { players: [], sendAll() {}, sendTo() {}, close() {} };
  }
  const peer = new Peer("bilim-rt-" + code);
  const conns = [];
  peer.on("connection", (conn) => {
    conn.on("open", () => {
      conns.push(conn);
      h.onConnect && h.onConnect(conn);
    });
    conn.on("data", (d) => h.onMessage && h.onMessage(d, conn));
    conn.on("close", () => {
      const i = conns.indexOf(conn);
      if (i >= 0) conns.splice(i, 1);
      h.onDisconnect && h.onDisconnect(conn);
    });
  });
  peer.on("error", (e) => h.onError && h.onError(e.message || String(e)));
  return {
    peer,
    get players() {
      return conns;
    },
    sendAll(data) {
      conns.forEach((c) => {
        try {
          c.send(data);
        } catch {}
      });
    },
    sendTo(conn, data) {
      try {
        conn.send(data);
      } catch {}
    },
    close() {
      try {
        conns.forEach((c) => c.close());
        peer.destroy();
      } catch {}
    },
  };
}

function rtJoin(code, h = {}) {
  if (typeof Peer === "undefined") {
    h.onError && h.onError("PeerJS жүктелмеді — интернет қажет");
    return { id: null, send() {}, close() {} };
  }
  const peer = new Peer();
  let conn = null;
  peer.on("open", () => {
    conn = peer.connect("bilim-rt-" + code, { reliable: true });
    conn.on("open", () => h.onOpen && h.onOpen(conn));
    conn.on("data", (d) => h.onMessage && h.onMessage(d));
    conn.on("close", () => h.onClose && h.onClose());
  });
  peer.on("error", (e) => h.onError && h.onError(e.message || String(e)));
  return {
    get id() {
      return conn ? conn.id : null;
    },
    get selfId() {
      return peer.id;
    },
    send(data) {
      try {
        conn && conn.send(data);
      } catch {}
    },
    close() {
      try {
        peer.destroy();
      } catch {}
    },
  };
}

/* Сілтеме: join.html-ге */
function joinUrl(type, room, extra = "") {
  const base = location.origin + location.pathname.replace(/[^/]*$/, "join.html");
  return `${base}?t=${type}&room=${room}${extra}`;
}

/* ---------- Auth chip: barlyq betterdiń shapkasyna ---------- */
function injectAuthChip() {
  const header = document.querySelector(".header-inner");
  if (!header || header.querySelector(".auth-chip")) return;
  const s = store.get("bilim.session", null);
  const a = document.createElement("a");
  a.className = "auth-chip";
  if (s) {
    a.href = "auth.html?out=1";
    a.title = "Түсу үшін басыңыз";
    a.innerHTML = `👤 ${esc(s.name)}<span class="auth-out">· Түсу</span>`;
  } else {
    a.href = "auth.html";
    a.textContent = "🔑 Кіру";
  }
  header.appendChild(a);
}
document.addEventListener("DOMContentLoaded", injectAuthChip);
