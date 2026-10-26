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
      title: "Топтық ойын",
      slides: [{ id: "s1", type: "board", title: "", text: "", bg: "#ffffff", url: "", quizId: null, boardId }],
    };
  } else if (quizId) {
    lesson = {
      id: "game-" + quizId,
      title: "Тест",
      slides: [{ id: "s1", type: "quiz", title: "", text: "", bg: "#ffffff", url: "", quizId, boardId: null }],
    };
  }
}

if (!lesson) {
  document.body.innerHTML = '<div style="color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;font-size:1.2rem">Сабақ табылмады. <a href="slides.html" style="color:#a5b4fc">Слайдтарға оралу →</a></div>';
  throw new Error("lesson not found");
}

$("#p-title").textContent = "🎓 " + (lesson.title || "Сабақ");
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
    el.innerHTML = '<div class="game-wait">⚠️ Бұл слайдқа тест таңдалмаған.<br>slides.html-де слайдты ашып, «Тест таңдау» ретсінен таңдаңыз.</div>';
    return;
  }

  const code = roomCode();
  const url = joinUrl("quiz", code);
  el.innerHTML = `
    <div class="game-host">
      <div class="game-panel">
        <div style="text-align:center;font-weight:800">Оқушыларға QR көрсетіңіз</div>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=2&data=${encodeURIComponent(url)}" alt="QR" />
        <div class="room-code">${code}</div>
        <div class="muted" style="font-size:0.75rem;text-align:center;word-break:break-all;color:rgba(255,255,255,0.55)">${url}</div>
        <div class="player-chips" id="players"></div>
        <div id="host-actions"></div>
      </div>
      <div class="game-stage" id="stage">
        <div class="game-wait">🎯 Тест: ${esc(quiz.title)}<br><small>${quiz.questions.length} сұрақ · ${quiz.time} сек/сұрақ</small></div>
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
        players.set(conn, { name: String(d.name || "Оқушы").slice(0, 18), answers: [], total: 0 });
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
      $("#stage").innerHTML = `<div class="game-wait">⚠️ Байланыс қатесі: ${esc(msg)}</div>`;
    },
  });
  activeHost = host;

  const setStage = (html) => ($("#stage").innerHTML = html);
  const updatePlayers = () => {
    $("#players").innerHTML = players.size
      ? [...players.values()].map((p) => `<span class="player-chip">👤 ${esc(p.name)}</span>`).join("")
      : '<span class="muted" style="font-size:0.8rem;color:rgba(255,255,255,0.5)">Әлі оқушы жоқ</span>';
    const btn = $("#start-btn");
    if (btn) btn.disabled = phase !== "lobby";
  };
  updatePlayers();

  $("#host-actions").innerHTML = `<button class="host-btn" id="start-btn">🚀 Ойынды бастау</button>`;
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
      .join("") + `<div style="margin-top:10px;font-size:0.85rem;color:rgba(255,255,255,0.6)">Жауап берді: ${answered} / ${players.size}</div>`;
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
      <div style="margin-top:12px;color:rgba(255,255,255,0.6);font-size:0.85rem">Оқушылардың экранында сұрақ пайда болды</div>
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
    players.forEach((p, conn) => {
      const a = p.answers[round];
      let pts = 0;
      if (a && a.choice === q.correct) pts = Math.round(500 + 500 * Math.max(0, 1 - a.dt / (quiz.time * 1000)));
      p.total += pts;
      gained[conn.peer] = pts;
    });
    host.sendAll({ type: "reveal", round, correct: q.correct, gained });
    setStage(`
      <div class="game-q">Дұрыс жауап: <span style="color:#86efac">${esc(q.answers[q.correct])}</span></div>
      <div class="dist-bars" id="dist"></div>
      <div style="margin-top:14px;font-size:0.95rem;font-weight:700">Оқушылар жауапты көріп тұр...</div>
    `);
    renderDist();
    round++;
    if (round < quiz.questions.length) {
      const next = setTimeout(() => phase !== "done" && startRound(), 3500);
      hostTimers.push(next);
    } else {
      const fin = setTimeout(finishQuiz, 3500);
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
      <div style="text-align:center;font-size:1.5rem;font-weight:800;margin-bottom:20px">🏆 Жеңімпаздар</div>
      <div class="podium">
        ${cols
          .map(
            (pos) =>
              `<div class="podium-col">
                ${
                  top[pos]
                    ? `<div class="p-name">${medals[pos]} ${esc(top[pos].name)}</div>
                       <div class="p-score">${top[pos].score} ұпай</div>
                       <div class="podium-block" style="height:${heights[pos]}px;background:linear-gradient(180deg,#4f46e5,#312e81)">${medals[pos]}</div>`
                    : ""
                }
              </div>`
          )
          .join("")}
      </div>
      <div style="text-align:center;margin-top:26px">
        <button class="host-btn green" id="cont-btn">▶ Сабақты жалғастыру</button>
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
    el.innerHTML = '<div class="game-wait">⚠️ Бұл слайдқа ойын жоспары таңдалмаған.</div>';
    return;
  }

  const code = roomCode();
  const gname = (g) => (board.names && String(board.names[g - 1] || "").trim()) || (g + "-топ");
  el.innerHTML = `
    <div class="board-host">
      <div class="board-topic">🎯 ${esc(board.topic)}</div>
      <div class="qr-row" id="bqr"></div>
      <div class="board-groups" id="bgroups"></div>
      <div class="board-err" id="berr"></div>
      <div style="display:flex;align-items:center;gap:12px">
        <button class="host-btn green" id="bfinish" style="margin-left:auto;padding:10px 20px;font-size:0.9rem">✅ Аяқтау</button>
      </div>
    </div>`;

  $("#bqr").innerHTML =
    Array.from(
      { length: board.groups },
      (_, i) => `
    <div class="qr-box">
      ${qrImg(joinUrl("board", code, "&g=" + (i + 1)), 96)}
      <div style="margin-top:5px;font-weight:800;color:${GROUP_COLORS[i]}">${esc(gname(i + 1))}</div>
    </div>`
    ).join("") +
    `<div class="qr-box" style="align-self:center">
      <div style="font-size:1.6rem;font-weight:800;color:#fde68a;letter-spacing:2px">${code}</div>
      <div style="margin-top:5px">Бөлме коды</div>
    </div>`;

  let ideas = [];
  const host = rtHost(code, {
    onConnect(conn) {},
    onDisconnect(conn) {
      conn.player = null;
      updateBplayers();
    },
    onMessage(d, conn) {
      if (d.type === "join") {
        conn.player = { name: String(d.name || "Оқушы").slice(0, 18), g: Math.min(board.groups, Math.max(1, +d.g || 1)) };
        host.sendTo(conn, {
          type: "cfg",
          topic: board.topic,
          branches: board.branches,
          groups: board.groups,
          names: board.names,
          ideas: ideas.filter((i) => i.g === conn.player.g),
        });
        updateBplayers();
      }
      if (d.type === "idea" && conn.player) {
        const idea = { id: uid(), g: conn.player.g, name: conn.player.name, text: String(d.text || "").slice(0, 140), branch: d.branch || "" };
        ideas.push(idea);
        broadcastGroup(conn.player.g);
        renderBgroups();
      }
    },
    onError(msg) {
      $("#berr").textContent = "⚠️ " + msg;
    },
  });
  activeHost = host;

  function broadcastGroup(g) {
    const list = ideas.filter((i) => i.g === g);
    host.players.forEach((c) => c.player && c.player.g === g && host.sendTo(c, { type: "ideas", ideas: list }));
  }

  function updateBplayers() {
    renderBgroups(); /* оқушылар өз тобының астында көрсетіледі */
  }

  function renderBgroups() {
    $("#bgroups").style.gridTemplateColumns = `repeat(${Math.min(board.groups, 3)}, 1fr)`;
    $("#bgroups").innerHTML = Array.from({ length: board.groups }, (_, gi) => {
      const g = gi + 1;
      const list = ideas.filter((i) => i.g === g);
      const players = host.players.filter((c) => c.player && c.player.g === g).map((c) => c.player.name);
      return `
      <div class="board-group">
        <h4><span class="dot" style="background:${GROUP_COLORS[gi]}"></span>${esc(gname(g))} · ${list.length} ой</h4>
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
            ${esc(i.branch ? `<em style="opacity:0.6">${esc(i.branch)}:</em> ` : "")}${esc(i.text)}
            <span class="by">— ${esc(i.name)}</span>
            <button class="idea-del" data-id="${i.id}" title="Жою">✕</button>
          </div>`
            )
            .join("") || '<div style="color:rgba(255,255,255,0.4);font-size:0.8rem;margin-top:6px">ой жоқ...</div>'
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
  renderBgroups();

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
