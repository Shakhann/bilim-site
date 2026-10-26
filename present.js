/* ===== Korestuu rezhimi: slyad + online oindar (host) ===== */

const params = new URLSearchParams(location.search);
const lessonId = params.get("lesson");
const lessons = store.get("bilim.lessons", []);
const quizzes = store.get("bilim.quizzes", []);
const boards = store.get("bilim.boards", []);
let lesson = lessons.find((l) => l.id === lessonId);

/* Сабақсыз тікелей ойын: present.html?board=ID немесе ?quiz=ID */
if (!lesson) {
  const boardId = params.get("board");
  const quizId = params.get("quiz");
  if (boardId) {
    lesson = {
      id: "game-" + boardId,
      title: t("default_board_title"),
      slides: [{ id: "s1", type: "board", title: "", text: "", bg: "#ffffff", url: "", quizId: null, boardId }],
    };
  } else if (quizId) {
    lesson = {
      id: "game-" + quizId,
      title: t("default_quiz_title"),
      slides: [{ id: "s1", type: "quiz", title: "", text: "", bg: "#ffffff", url: "", quizId, boardId: null }],
    };
  }
}

if (!lesson) {
  document.body.innerHTML = '<div style="color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;font-size:1.2rem">' + t("lesson_not_found") + ' <a href="slides.html" style="color:#a5b4fc">' + t("btn_back_slides") + "</a></div>";
  throw new Error("lesson not found");
}

$("#p-title").textContent = "🎓 " + (lesson.title || t("p_lesson_title"));
let idx = 0;
let activeHost = null;
let hostSlideIdx = -1;
let hostTimers = [];

function clearHost() {
  if (activeHost) {
    activeHost.close();
    activeHost = null;
  }
  hostSlideIdx = -1;
  hostTimers.forEach(clearTimeout);
  hostTimers.forEach(clearInterval);
  hostTimers = [];
}

function show(i) {
  idx = Math.max(0, Math.min(lesson.slides.length - 1, i));
  clearHost();
  render();
}

function darkBg(bg) {
  if (!bg) return false;
  const m = String(bg).match(/^#([0-9a-f]{6})$/i);
  if (!m) return false;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

function render() {
  const s = lesson.slides[idx];
  const el = $("#slide");
  el.style.background = s.bg || "#eef0ff";
  el.style.color = darkBg(s.bg) ? "#fff" : "#1c2333";
  $("#counter").textContent = `${idx + 1} / ${lesson.slides.length}`;
  $("#prev").disabled = idx === 0;
  $("#next").disabled = idx === lesson.slides.length - 1;

  if (s.type === "text") {
    hostSlideIdx = -1;
    el.innerHTML = `<h1>${esc(s.title || "")}</h1><p>${esc(s.text || "")}</p>`;
  } else if (s.type === "video") {
    hostSlideIdx = -1;
    el.innerHTML = videoEmbed(s.url || "");
  } else if (s.type === "quiz") {
    if (hostSlideIdx === idx && activeHost) return;
    clearHost();
    hostSlideIdx = idx;
    startQuizHost(s, el);
  } else if (s.type === "board") {
    if (hostSlideIdx === idx && activeHost) return;
    clearHost();
    hostSlideIdx = idx;
    startBoardHost(s, el);
  }
}

/* ================= QUIZ HOST (Kahoot) ================= */
function startQuizHost(s, el) {
  const quiz = quizzes.find((q) => q.id === s.quizId);
  el.style.background = "#1e1b4b";
  el.style.color = "#fff";
  if (!quiz) {
    el.innerHTML = '<div class="game-wait">' + t("slide_no_quiz") + "</div>";
    return;
  }

  const code = roomCode();
  const url = joinUrl("quiz", code);
  el.innerHTML = `
    <div class="game-host">
      <div class="game-panel">
        <div style="text-align:center;font-weight:800">${t("qz_show_qr")}</div>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=2&data=${encodeURIComponent(url)}" alt="QR" />
        <div class="room-code">${code}</div>
        <div class="muted" style="font-size:0.75rem;text-align:center;word-break:break-all;color:rgba(255,255,255,0.55)">${url}</div>
        <div style="margin-top:12px">
          <div style="font-size:0.82rem;font-weight:800;color:rgba(255,255,255,0.75)">📋 ${t("p_lessons")}</div>
          <div class="player-chips" id="players" style="margin-top:8px"></div>
          <div id="player-count" style="margin-top:8px;font-size:0.85rem;font-weight:700;color:#fde68a"></div>
        </div>
        <div id="host-actions" style="margin-top:14px"></div>
      </div>
      <div class="game-stage" id="stage">
        <div class="game-wait">${t("qz_info", esc(quiz.title), quiz.questions.length, quiz.time)}</div>
      </div>
    </div>`;

  const players = new Map();
  let phase = "lobby";
  let round = 0;
  let t0 = 0;

  const host = rtHost(code, {
    onConnect(conn) {
      host.sendTo(conn, { type: "cfg", title: quiz.title, total: quiz.questions.length, time: quiz.time });
      updatePlayers();
    },
    onDisconnect(conn) {
      players.delete(conn);
      updatePlayers();
    },
    onMessage(d, conn) {
      if (d.type === "join") {
        players.set(conn, { name: String(d.name || t("student_default")).slice(0, 18), answers: [], total: 0 });
        updatePlayers();
      }
      if (d.type === "answer" && phase === "asking") {
        const p = players.get(conn);
        if (p && p.answers[round] === undefined) {
          p.answers[round] = { choice: d.choice, dt: Date.now() - t0 };
          renderDist();
        }
      }
    },
    onError(msg) {
      $("#stage").innerHTML = `<div class="game-wait">${t("conn_err")} ${esc(msg)}</div>`;
    },
  });
  activeHost = host;

  const setStage = (html) => ($("#stage").innerHTML = html);
  const updatePlayers = () => {
    $("#players").innerHTML = players.size
      ? [...players.values()].map((p) => `<span class="player-chip">👤 ${esc(p.name)}</span>`).join("")
      : '<span class="muted" style="font-size:0.8rem;color:rgba(255,255,255,0.5)">' + t("qz_none") + "</span>";
    const pc = $("#player-count");
    if (pc) pc.textContent = players.size ? t("p_players_ready", players.size) : t("qz_none_show");
    const btn = $("#start-btn");
    if (btn) btn.disabled = phase !== "lobby";
  };
  updatePlayers();

  $("#host-actions").innerHTML = `<button class="host-btn" id="start-btn">${t("p_start")}</button>`;
  $("#start-btn").addEventListener("click", () => startRound());

  function renderDist() {
    const q = quiz.questions[round];
    const counts = [0, 0, 0, 0];
    players.forEach((p) => {
      const a = p.answers[round];
      if (a) counts[a.choice]++;
    });
    const answered = counts.reduce((a, b) => a + b, 0);
    $("#dist").innerHTML = q.answers
      .map(
        (a, i) => `
      <div class="dist-bar">
        <span class="ans-letter" style="background:${QUIZ_COLORS[i]}">${"▲●◆■"[i]}</span>
        <span style="width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a)}</span>
        <div class="track"><div class="fill" data-i="${i}" style="background:${QUIZ_COLORS[i]};width:0%"></div></div>
      </div>`
      )
      .join("") + `<div style="margin-top:10px;font-size:0.85rem;color:rgba(255,255,255,0.6)">${t("qz_answered", answered, players.size)}</div>`;
    const max = Math.max(1, ...counts);
    $$("#dist .fill").forEach((f) => {
      const c = counts[+f.dataset.i];
      f.style.width = players.size ? Math.round((c / players.size) * 100) + "%" : "0%";
      f.textContent = c || "";
    });
  }

  function startRound() {
    phase = "asking";
    t0 = Date.now();
    const q = quiz.questions[round];
    host.sendAll({ type: "ask", round, q: { q: q.q, answers: q.answers, time: quiz.time } });
    setStage(`
      <div class="game-q">${round + 1}/${quiz.questions.length}. ${esc(q.q)}</div>
      <div class="dist-bars" id="dist"></div>
      <div class="timer-big" id="timer">${quiz.time}</div>
      <div style="margin-top:12px;color:rgba(255,255,255,0.6);font-size:0.85rem">${t("qz_on_screen")}</div>
    `);
    renderDist();
    let left = quiz.time;
    const tick = setInterval(() => {
      left = Math.ceil((t0 + quiz.time * 1000 - Date.now()) / 1000);
      const t = $("#timer");
      if (t) t.textContent = Math.max(0, left);
      if (left <= 0) clearInterval(tick);
    }, 250);
    hostTimers.push(tick);
    const end = setTimeout(endRound, quiz.time * 1000 + 100);
    hostTimers.push(end);
  }

  function endRound() {
    phase = "reveal";
    const q = quiz.questions[round];
    const gained = {};
    const gList = [];
    players.forEach((p, conn) => {
      const a = p.answers[round];
      let pts = 0;
      if (a && a.choice === q.correct) pts = Math.round(500 + 500 * Math.max(0, 1 - a.dt / (quiz.time * 1000)));
      p.total += pts;
      gained[conn.peer] = pts;
      gList.push({ name: p.name, pts, total: p.total, answered: !!a });
    });
    gList.sort((x, y) => y.pts - x.pts || y.total - x.total);
    host.sendAll({ type: "reveal", round, correct: q.correct, gained });
    const ptsRows = gList
      .map(
        (p) => `<div class="round-pts-item${p.pts ? " got" : ""}">
            <span class="rpi-name">👤 ${esc(p.name)}</span>
            <span class="rpi-pts">${p.pts ? "+" + p.pts : p.answered ? "0" : "—"}</span>
            <span class="rpi-total">${t("qz_total_short", p.total)}</span>
          </div>`
      )
      .join("");
    setStage(`
      <div class="game-q">${t("qz_correct_label")} <span style="color:#86efac">${esc(q.answers[q.correct])}</span></div>
      <div class="dist-bars" id="dist"></div>
      ${
        ptsRows
          ? `<div class="round-pts"><div class="round-pts-title">${t("qz_round_pts")}</div><div class="round-pts-grid">${ptsRows}</div></div>`
          : ""
      }
      <div style="margin-top:14px;font-size:0.95rem;font-weight:700">${t("qz_reveal_watch")}</div>
    `);
    renderDist();
    round++;
    if (round < quiz.questions.length) {
      const next = setTimeout(() => phase !== "done" && startRound(), 8000);
      hostTimers.push(next);
    } else {
      const fin = setTimeout(finishQuiz, 8000);
      hostTimers.push(fin);
    }
  }

  function finishQuiz() {
    phase = "done";
    const sorted = [...players.values()].sort((a, b) => b.total - a.total);
    const top = sorted.slice(0, 3).map((p) => ({ name: p.name, score: p.total }));
    const ranks = {};
    [...players.entries()].forEach(([conn, p], i) => (ranks[conn.peer] = i + 1));
    host.sendAll({ type: "results", top, ranks });
    const medals = ["🥇", "🥈", "🥉"];
    const heights = [120, 90, 66];
    const cols = [1, 0, 2];
    setStage(`
      <div style="text-align:center;font-size:1.5rem;font-weight:800;margin-bottom:20px">🏆 ${t("qz_winners")}</div>
      <div class="podium">
        ${cols
          .map(
            (pos) =>
              `<div class="podium-col">
                ${
                  top[pos]
                    ? `<div class="p-name">${medals[pos]} ${esc(top[pos].name)}</div>
                       <div class="p-score">${top[pos].score} ${t("pts_word")}</div>
                       <div class="podium-block" style="height:${heights[pos]}px;background:linear-gradient(180deg,#4f46e5,#312e81)">${medals[pos]}</div>`
                    : ""
                }
              </div>`
          )
          .join("")}
      </div>
      <div style="text-align:center;margin-top:26px">
        <button class="host-btn green" id="cont-btn">${t("btn_continue_lesson")}</button>
      </div>
    `);
    $("#cont-btn").addEventListener("click", () => show(idx + 1));
  }
}

/* ================= BOARD HOST (топтық ойын) ================= */
function startBoardHost(s, el) {
  const board = boards.find((b) => b.id === s.boardId);
  el.style.background = "#0f172a";
  el.style.color = "#fff";
  if (!board) {
    el.innerHTML = '<div class="game-wait">' + t("slide_no_board") + "</div>";
    return;
  }

  const code = roomCode();
  const gname = (g) => (board.names && String(board.names[g - 1] || "").trim()) || t("gname_default", g);
  el.innerHTML = `
    <div class="board-host">
      <div class="board-topic-row">
        <div class="board-topic">🎯 ${esc(board.topic)}</div>
        <div class="board-room"><span data-i18n="p_room_code">Бөлме коды</span><b>${code}</b></div>
      </div>
      <div class="qr-row" id="bqr"></div>
      <div class="board-groups" id="bgroups"></div>
      <div class="board-err" id="berr"></div>
      <div class="board-evlog" id="bevlog"></div>
      <div class="board-bottom">
        <div class="board-status" id="bstatus"></div>
        <div style="display:flex;gap:12px;flex-shrink:0">
          <button class="host-btn" id="bstart" style="padding:10px 24px;font-size:1.05rem">${t("p_start")}</button>
          <button class="host-btn green" id="bfinish" style="display:none;padding:10px 20px;font-size:0.95rem">${t("p_finish")}</button>
        </div>
      </div>
    </div>`;

  $("#bqr").innerHTML =
    Array.from(
      { length: board.groups },
      (_, i) => `
    <div class="qr-box">
      ${qrImg(joinUrl("board", code, "&g=" + (i + 1)), 400)}
      <div style="margin-top:8px;font-weight:800;color:${GROUP_COLORS[i]};font-size:1.9rem">${esc(gname(i + 1))}</div>
      <div class="qr-players" data-g="${i + 1}"></div>
    </div>`
    ).join("");

  let ideas = [];
  let started = false;
  const evLog = [];
  function logEv(msg) {
    const tm = new Date().toLocaleTimeString("ru-RU", { hour12: false });
    evLog.push(`<span class="evlog-tm">${tm}</span> ${msg}`);
    if (evLog.length > 5) evLog.shift();
    const el = $("#bevlog");
    if (el) el.innerHTML = evLog.map((m) => "<div>" + m + "</div>").join("");
  }
  const host = rtHost(code, {
    onConnect(conn) {},
    onDisconnect(conn) {
      if (conn.player) logEv("👋 " + esc(conn.player.name) + " — шықты");
      conn.player = null;
      updateBplayers();
    },
    onMessage(d, conn) {
      if (d.type === "join") {
        conn.player = { name: String(d.name || t("student_default")).slice(0, 18), g: Math.min(board.groups, Math.max(1, +d.g || 1)) };
        logEv("👤 " + esc(conn.player.name) + " → " + esc(gname(conn.player.g)));
        host.sendTo(conn, {
          type: "cfg",
          topic: board.topic,
          branches: board.branches,
          groups: board.groups,
          names: board.names,
          started,
          ideas: ideas.filter((i) => i.g === conn.player.g),
        });
        updateBplayers();
      }
      if (d.type === "idea" && conn.player && started) {
        const idea = { id: uid(), g: conn.player.g, name: conn.player.name, text: String(d.text || "").slice(0, 140), branch: d.branch || "" };
        ideas.push(idea);
        logEv("💬 " + esc(idea.name) + ": " + esc(idea.text.slice(0, 50)));
        broadcastGroup(conn.player.g);
        renderBgroups();
      }
    },
    onError(msg) {
      $("#berr").textContent = "⚠️ " + msg;
      logEv("⚠️ " + esc(msg));
    },
  });
  activeHost = host;

  function broadcastGroup(g) {
    const list = ideas.filter((i) => i.g === g);
    host.players.forEach((c) => c.player && c.player.g === g && host.sendTo(c, { type: "ideas", ideas: list }));
  }

  function updateBplayers() {
    const st = $("#bstatus");
    if (st) {
      const total = host.players.filter((c) => c.player).length;
      st.textContent = started
        ? t("p_status_go", total)
        : t("p_status_wait", total);
    }
    /* Ойын басталған соң QR қатары жасырылады — бос орын топтардың ойларына */
    const qrRow = $("#bqr");
    if (qrRow) qrRow.style.display = started ? "none" : "";
    /* Әр QR астында сол топтың оқушылары */
    $("#bqr").querySelectorAll(".qr-players").forEach((box) => {
      const g = +box.dataset.g;
      const names = host.players.filter((c) => c.player && c.player.g === g).map((c) => c.player.name);
      box.innerHTML = names.length
        ? names.map((n) => `<span class="player-chip">👤 ${esc(n)}</span>`).join("")
        : '<span class="qr-empty">' + t("qr_none_yet") + "</span>";
    });
    renderBgroups(); /* оқушылар өз тобының астында көрсетіледі */
  }

  function renderBgroups() {
    /* Ой тақтасы «Бастау» басылған соң ашылады */
    $("#bgroups").style.display = started ? "" : "none";
    if (!started) return;
    $("#bgroups").style.gridTemplateColumns = `repeat(${Math.min(board.groups, 3)}, 1fr)`;
    $("#bgroups").innerHTML = Array.from({ length: board.groups }, (_, gi) => {
      const g = gi + 1;
      const list = ideas.filter((i) => i.g === g);
      const players = host.players.filter((c) => c.player && c.player.g === g).map((c) => c.player.name);
      return `
      <div class="board-group">
        <h4><span class="dot" style="background:${GROUP_COLORS[gi]}"></span>${esc(gname(g))} · ${t("g_ideas", list.length)}</h4>
        <div class="board-players${players.length ? "" : " empty"}">
          ${
            players.length
              ? players.map((n) => `<span class="player-chip">👤 ${esc(n)}</span>`).join("")
              : ""
          }
        </div>
        ${
          list
            .map(
              (i) => `
          <div class="idea-bubble" style="border-left:3px solid ${GROUP_COLORS[gi]}">
            <span class="idea-name">👤 ${esc(i.name)}${i.branch ? ` <em class="idea-branch">${esc(i.branch)}</em>` : ""}:</span> ${esc(i.text)}
            <button class="idea-del" data-id="${i.id}" title="${t("del_tooltip")}">✕</button>
          </div>`
            )
            .join("") || '<div style="color:rgba(255,255,255,0.4);font-size:1.05rem;margin-top:8px">' + t("g_no_ideas") + "</div>"
        }
      </div>`;
    }).join("");
    $("#bgroups").onclick = (e) => {
      const del = e.target.closest(".idea-del");
      if (!del) return;
      const idea = ideas.find((i) => i.id === del.dataset.id);
      if (!idea) return;
      ideas = ideas.filter((i) => i.id !== del.dataset.id);
      broadcastGroup(idea.g);
      renderBgroups();
    };
  }
  updateBplayers();

  $("#bstart").addEventListener("click", () => {
    started = true;
    host.sendAll({ type: "start" });
    $("#bstart").style.display = "none";
    $("#bfinish").style.display = "";
    updateBplayers();
  });
  $("#bfinish").addEventListener("click", () => show(idx + 1));
}

/* ================= Navigation ================= */
$("#prev").addEventListener("click", () => show(idx - 1));
$("#next").addEventListener("click", () => show(idx + 1));
$("#exit-btn").addEventListener("click", () => (location.href = "slides.html"));
document.addEventListener("keydown", (e) => {
  const slide = lesson.slides[idx];
  if (slide && (slide.type === "quiz" || slide.type === "board")) return; // ойын кезінде пернелер бет ауытқырмасын
  if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") show(idx + 1);
  if (e.key === "ArrowLeft" || e.key === "PageUp") show(idx - 1);
});

window.addEventListener("beforeunload", clearHost);
render();
