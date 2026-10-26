/* ===== Saabaq slyadary + oindar banki ===== */

/* ---------- Auth gate: tek mugalimga ---------- */
(function () {
  const s = store.get("bilim.session", null);
  if (!s || s.role !== "teacher") {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="gate-overlay"><div class="gate-card"><h2>🔒 ${
        s ? "Бұл бет тек мұғалімдерге арналған" : "Кіру қажет"
      }</h2><p class="muted">Слайд конструкторы мен ойындар — мұғалімдерге ғана ашылады.</p><a class="btn btn-primary" href="auth.html">Кіру / Тіркелу</a><a class="btn btn-ghost" href="index.html">Басты бетке</a></div></div>`
    );
    throw new Error("auth gate: slides");
  }
})();

let lessons = store.get("bilim.lessons", []);
let quizzes = store.get("bilim.quizzes", []);
let boards = store.get("bilim.boards", []);
let curLessonId = null;
let curSlide = 0;

const saveLessons = () => store.set("bilim.lessons", lessons);
const saveQuizzes = () => store.set("bilim.quizzes", quizzes);
const saveBoards = () => store.set("bilim.boards", boards);
const lesson = () => lessons.find((l) => l.id === curLessonId);

/* ---------- Views ---------- */
function showView(name) {
  ["lessons", "builder", "games"].forEach((v) => {
    $(`#view-${v}`).style.display = v === name ? "" : "none";
  });
  $$(".tab-btn").forEach((b) => b.classList.toggle("active", (name === "games" && b.dataset.view === "games") || (name !== "games" && b.dataset.view === "lessons")));
  if (name === "lessons") renderLessons();
  if (name === "games") renderGames();
}

$$(".tab-btn").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

/* ---------- Lessons ---------- */
function renderLessons() {
  const grid = $("#lessons-grid");
  grid.innerHTML = lessons.length
    ? lessons
        .map(
          (l) => `
    <div class="lesson-card">
      <h3>📽️ ${esc(l.title || "Атауы жоқ сабақ")}</h3>
      <div class="muted">${l.slides.length} слайд</div>
      <div class="lesson-actions">
        <button class="mini-btn" data-act="open" data-id="${l.id}">✏️ Ашу</button>
        <a class="mini-btn primary" href="present.html?lesson=${l.id}">▶ Көрсету</a>
        <button class="mini-btn danger" data-act="del" data-id="${l.id}">🗑</button>
      </div>
    </div>`
        )
        .join("")
    : '<p class="muted">Әзірге сабақ жоқ. «Жаңа сабақ» батырмасын басыңыз.</p>';

  grid.onclick = (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.act === "open") {
      curLessonId = id;
      curSlide = 0;
      showBuilder();
    } else {
      if (!confirm("Сабақ жойылсын ба?")) return;
      lessons = lessons.filter((l) => l.id !== id);
      saveLessons();
      renderLessons();
      toast("Сабақ жойылды");
    }
  };
}

$("#new-lesson").addEventListener("click", () => {
  const l = {
    id: uid(),
    title: "Жаңа сабақ",
    slides: [{ id: uid(), type: "text", title: "Сабақ тақырыбы", text: "Мазмұнын оң жақтан жазыңыз", bg: "#eef0ff" }],
  };
  lessons.unshift(l);
  saveLessons();
  curLessonId = l.id;
  curSlide = 0;
  showBuilder();
});

/* ---------- Builder ---------- */
function showBuilder() {
  showView("builder");
  $("#lesson-title").value = lesson().title;
  renderBuilder();
}

function renderBuilder() {
  const l = lesson();
  if (!l) return showView("lessons");
  if (curSlide >= l.slides.length) curSlide = 0;
  renderThumbs();
  renderCanvas();
  renderProps();
}

function renderThumbs() {
  const l = lesson();
  const rail = $("#slides-rail");
  rail.innerHTML =
    l.slides
      .map(
        (s, i) => `
    <div class="slide-thumb${i === curSlide ? " active" : ""}" data-i="${i}">
      <div class="mini" style="background:${s.bg || "#fff"};color:${darkBg(s.bg) ? "#fff" : "var(--ink)"}">
        ${thumbIcon(s)} ${esc(s.title || (s.type === "video" ? "Видео" : ""))}
      </div>
      <div class="num">${i + 1}</div>
      <div class="thumbs-actions">
        <button data-mv="-1" data-i="${i}" title="Жоғары">↑</button>
        <button data-mv="1" data-i="${i}" title="Төмен">↓</button>
        <button data-del="${i}" title="Жою">🗑</button>
      </div>
    </div>`
      )
      .join("") +
    `<button class="slide-thumb" id="add-slide" style="min-height:84px;display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--brand)">＋ Слайд</button>`;

  rail.onclick = (e) => {
    const add = e.target.closest("#add-slide");
    if (add) return addSlide();
    const del = e.target.closest("[data-del]");
    if (del) {
      l.slides.splice(+del.dataset.del, 1);
      if (!l.slides.length) l.slides.push({ id: uid(), type: "text", title: "Слайд", text: "", bg: "#eef0ff" });
      saveLessons();
      renderBuilder();
      return;
    }
    const mv = e.target.closest("[data-mv]");
    if (mv) {
      const i = +mv.dataset.i;
      const j = i + +mv.dataset.mv;
      if (j < 0 || j >= l.slides.length) return;
      [l.slides[i], l.slides[j]] = [l.slides[j], l.slides[i]];
      saveLessons();
      renderBuilder();
      return;
    }
    const thumb = e.target.closest(".slide-thumb[data-i]");
    if (thumb) {
      curSlide = +thumb.dataset.i;
      renderBuilder();
    }
  };
}

function thumbIcon(s) {
  return { text: "📝", video: "🎬", quiz: "🎯", board: "👥" }[s.type] || "📝";
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

function renderCanvas() {
  const s = lesson().slides[curSlide];
  const c = $("#slide-canvas");
  c.style.background = s.bg || "#fff";
  c.style.color = darkBg(s.bg) ? "#fff" : "var(--ink)";
  const quiz = s.type === "quiz" ? quizzes.find((q) => q.id === s.quizId) : null;
  const board = s.type === "board" ? boards.find((b) => b.id === s.boardId) : null;
  if (s.type === "video") {
    c.innerHTML = videoEmbed(s.url || "") + (s.title ? `<h2 style="margin-top:10px">${esc(s.title)}</h2>` : "");
  } else if (s.type === "quiz") {
    c.innerHTML = `<div class="game-badge">🎯 Kahoot-тай тест<br><small style="font-weight:600;opacity:0.75">${esc(quiz ? quiz.title : "тест таңдалмаған!")}<br>${quiz ? quiz.questions.length + " сұрақ · " + quiz.time + " сек/сұрақ" : ""}</small></div>`;
  } else if (s.type === "board") {
    c.innerHTML = `<div class="game-badge">👥 Топтық ойын<br><small style="font-weight:600;opacity:0.75">${esc(board ? board.topic : "жоспар таңдалмаған!")}<br>${board ? board.groups + " топ · тарақтары: " + (board.branches.join(", ") || "—") : ""}</small></div>`;
  } else {
    c.innerHTML = `<h2>${esc(s.title || "")}</h2><p>${esc(s.text || "")}</p>`;
  }
}

function renderProps() {
  const l = lesson();
  const s = l.slides[curSlide];
  const p = $("#props-panel");
  let html = `<h3>Слайд ${curSlide + 1} · ${thumbIcon(s)} ${
    { text: "мәтін", video: "видео", quiz: "тест (Kahoot)", board: "топтық ойын" }[s.type]
  }</h3>
  <label><span>Слайд түрі</span>
    <select id="p-type">
      <option value="text"${s.type === "text" ? " selected" : ""}>📝 Мәтін</option>
      <option value="video"${s.type === "video" ? " selected" : ""}>🎬 Видео</option>
      <option value="quiz"${s.type === "quiz" ? " selected" : ""}>🎯 Тест (Kahoot)</option>
      <option value="board"${s.type === "board" ? " selected" : ""}>👥 Топтық ойын</option>
    </select>
  </label>`;

  if (s.type === "text") {
    html += `
    <label><span>Тақырып</span><input type="text" id="p-title" value="${esc(s.title)}" /></label>
    <label><span>Мәтін</span><textarea id="p-text" rows="6">${esc(s.text)}</textarea></label>`;
  }
  if (s.type === "video") {
    html += `
    <label><span>Видео сілтемесі (YouTube немесе .mp4)</span><input type="text" id="p-url" value="${esc(s.url || "")}" placeholder="https://youtube.com/watch?v=..." /></label>
    <label><span>Атауы (бос қалдыруға болады)</span><input type="text" id="p-title" value="${esc(s.title || "")}" /></label>
    <p class="muted" style="font-size:0.8rem;margin-top:10px">Сілтемені ғана қойыңыз — слайдта сілтеме емес, тікелей видео плейер шығады.</p>`;
  }
  if (s.type === "quiz") {
    html += `
    <label><span>Тест таңдау (ойын банкінен)</span>
      <select id="p-quiz">
        ${quizzes.map((q) => `<option value="${q.id}"${q.id === s.quizId ? " selected" : ""}>${esc(q.title)} (${q.questions.length} сұрақ)</option>`).join("")}
      </select>
    </label>
    <button class="mini-btn" id="p-edit-quiz" style="margin-top:12px">✏️ Тестті құрастыру (ойындар беті)</button>`;
  }
  if (s.type === "board") {
    html += `
    <label><span>Ойын жоспары таңдау</span>
      <select id="p-board">
        ${boards.map((b) => `<option value="${b.id}"${b.id === s.boardId ? " selected" : ""}>${esc(b.title)}</option>`).join("")}
      </select>
    </label>
    <button class="mini-btn" id="p-edit-board" style="margin-top:12px">✏️ Жоспар құрастыру (ойындар беті)</button>`;
  }

  if (s.type !== "video" || true) {
    html += `<label><span>Фон түсі</span><div class="bg-palette">
      ${SLIDE_BGS.map((b) => `<div class="bg-sw${(s.bg || "#eef0ff") === b ? " active" : ""}" data-bg="${b}" style="background:${b}"></div>`).join("")}
    </div></label>`;
  }
  p.innerHTML = html;

  $("#p-type").addEventListener("change", (e) => {
    s.type = e.target.value;
    if (s.type === "quiz" && !s.quizId && quizzes[0]) s.quizId = quizzes[0].id;
    if (s.type === "board" && !s.boardId && boards[0]) s.boardId = boards[0].id;
    if (s.type === "video" && !s.url) s.url = "";
    if (s.type === "text" && !s.title) s.title = "Тақырып";
    saveLessons();
    renderBuilder();
  });
  const bind = (id, key) => {
    const el = $(id);
    if (el) el.addEventListener("input", () => { s[key] = el.value; saveLessons(); if (id !== "#p-title") renderCanvas(); });
  };
  bind("#p-title", "title");
  bind("#p-text", "text");
  bind("#p-url", "url");
  $("#p-quiz")?.addEventListener("change", (e) => { s.quizId = e.target.value; saveLessons(); renderCanvas(); });
  $("#p-board")?.addEventListener("change", (e) => { s.boardId = e.target.value; saveLessons(); renderCanvas(); });
  $("#p-edit-quiz")?.addEventListener("click", () => { showView("games"); toast("Ойындар бетін ашыңыз — тестті сол жерде құрастырыңыз"); });
  $("#p-edit-board")?.addEventListener("click", () => showView("games"));
  $$(".bg-sw").forEach((sw) =>
    sw.addEventListener("click", () => {
      s.bg = sw.dataset.bg;
      saveLessons();
      renderBuilder();
    })
  );
}

$("#lesson-title").addEventListener("input", (e) => {
  const l = lesson();
  if (l) {
    l.title = e.target.value;
    saveLessons();
  }
});

function addSlide() {
  const l = lesson();
  const type = prompt("Слайд түрін таңдаңыз (мәтін / видео / тест / топтық ойын)", "мәтін");
  const t = type.includes("видео") ? "video" : type.includes("тест") ? "quiz" : type.includes("топтық") ? "board" : "text";
  const s = { id: uid(), type: t, title: "", text: "", bg: "#ffffff", url: "", quizId: quizzes[0]?.id, boardId: boards[0]?.id };
  l.slides.splice(curSlide + 1, 0, s);
  curSlide += 1;
  saveLessons();
  renderBuilder();
}

$("#back-to-lessons").addEventListener("click", (e) => {
  e.preventDefault();
  showView("lessons");
});
$("#open-present").addEventListener("click", () => {
  const l = lesson();
  if (l) location.href = `present.html?lesson=${l.id}`;
});

/* ---------- Quiz bank ---------- */
let editingQuizId = null;

function renderGames() {
  /* Quizzes */
  $("#quizzes-list").innerHTML = quizzes.length
    ? quizzes
        .map(
          (q) => `
    <div class="qz-card">
      <h3>🎯 ${esc(q.title)}</h3>
      <div class="qz-meta">${q.questions.length} сұрақ · ${q.time} сек/сұрақ</div>
      <div class="lesson-actions">
        <button class="mini-btn" data-act="edit" data-id="${q.id}">✏️ Ашу</button>
        <button class="mini-btn danger" data-act="del" data-id="${q.id}">🗑</button>
      </div>
    </div>`
        )
        .join("")
    : '<p class="muted">Тест жоқ — төменнен құрастырыңыз.</p>';
  $("#quizzes-list").onclick = (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "del") {
      if (!confirm("Тест жойылсын ба?")) return;
      quizzes = quizzes.filter((q) => q.id !== btn.dataset.id);
      saveQuizzes();
      renderGames();
    } else {
      openQuizEditor(btn.dataset.id);
    }
  };

  /* Boards */
  $("#boards-list").innerHTML = boards.length
    ? boards
        .map(
          (b) => `
    <div class="qz-card">
      <h3>👥 ${esc(b.title)}</h3>
      <div class="qz-meta">Тақырып: «${esc(b.topic)}» · ${b.groups} топ${
        b.names && b.names.some((n) => n && n.trim())
          ? " · " + esc(b.names.map((n, i) => (n && n.trim()) || gnameDefault(i)).join(", "))
          : ""
      }</div>
      <div class="qz-meta">Тарақтары: ${esc(b.branches.join(", ") || "—")}</div>
      <div class="lesson-actions">
        <button class="mini-btn" data-act="edit" data-id="${b.id}">✏️ Ашу</button>
        <button class="mini-btn danger" data-act="del" data-id="${b.id}">🗑</button>
      </div>
    </div>`
        )
        .join("")
    : '<p class="muted">Ойын жоспары жоқ.</p>';
  $("#boards-list").onclick = (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "del") {
      if (!confirm("Жоспар жойылсын ба?")) return;
      boards = boards.filter((b) => b.id !== btn.dataset.id);
      saveBoards();
      renderGames();
    } else {
      openBoardEditor(btn.dataset.id);
    }
  };
  updateBoardPreview();
}

/* --- Quiz editor --- */
function blankQuestion() {
  return { q: "Сұрақ мәтіні?", answers: ["", "", "", ""], correct: 0 };
}

function openQuizEditor(id) {
  editingQuizId = id || null;
  const q = quizzes.find((x) => x.id === id);
  $("#quiz-editor-title").textContent = q ? "Тестті өзгерту" : "Жаңа тест";
  $("#qz-name").value = q ? q.title : "";
  $("#qz-time").value = q ? q.time : 20;
  window.__qzDraft = q ? JSON.parse(JSON.stringify(q.questions)) : [blankQuestion()];
  renderQuizDraft();
  $("#quiz-editor-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderQuizDraft() {
  const d = window.__qzDraft;
  $("#qz-questions").innerHTML = d
    .map(
      (qq, i) => `
    <div class="question-block">
      <div class="q-text">Сұрақ ${i + 1}</div>
      <input type="text" class="qq" data-i="${i}" value="${esc(qq.q)}" placeholder="Сұрақ" style="width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-family:inherit" />
      ${qq.answers
        .map(
          (a, ai) => `
        <div class="ans-row">
          <span class="ans-color" style="background:${QUIZ_COLORS[ai]}"></span>
          <input type="text" class="qa" data-i="${i}" data-ai="${ai}" value="${esc(a)}" placeholder="Жауап ${ai + 1}" />
          <button class="ans-correct${qq.correct === ai ? " checked" : ""}" data-correct="${i}-${ai}" title="Дұрыс жауап">${qq.correct === ai ? "✔" : "○"}</button>
        </div>`
        )
        .join("")}
      <button class="mini-btn danger" data-qdel="${i}" style="margin-top:10px">🗑 Сұрақты жою</button>
    </div>`
    )
    .join("");

  $("#qz-questions").oninput = (e) => {
    const el = e.target;
    const d = window.__qzDraft;
    if (el.classList.contains("qq")) d[+el.dataset.i].q = el.value;
    if (el.classList.contains("qa")) d[+el.dataset.i].answers[+el.dataset.ai] = el.value;
  };
  $("#qz-questions").onclick = (e) => {
    const c = e.target.closest("[data-correct]");
    if (c) {
      const [qi, ai] = c.dataset.correct.split("-").map(Number);
      window.__qzDraft[qi].correct = ai;
      renderQuizDraft();
      return;
    }
    const del = e.target.closest("[data-qdel]");
    if (del) {
      window.__qzDraft.splice(+del.dataset.qdel, 1);
      renderQuizDraft();
    }
  };
}

$("#qz-add-q").addEventListener("click", () => {
  window.__qzDraft.push(blankQuestion());
  renderQuizDraft();
});
$("#qz-save").addEventListener("click", () => {
  const name = $("#qz-name").value.trim();
  const time = Math.max(5, +$("#qz-time").value || 20);
  const d = window.__qzDraft;
  if (!name) return toast("Тест атауын жазыңыз");
  if (!d.length || d.some((q) => !q.q.trim() || q.answers.some((a) => !a.trim())))
    return toast("Барлық сұрақ пен жауаптарды толтырыңыз");
  if (editingQuizId) {
    const q = quizzes.find((x) => x.id === editingQuizId);
    q.title = name;
    q.time = time;
    q.questions = d;
  } else {
    quizzes.unshift({ id: uid(), title: name, time, questions: d });
  }
  saveQuizzes();
  editingQuizId = null;
  renderGames();
  toast("✅ Тест сақталды — енді слайд арасына қосыңыз");
});
$("#qz-cancel").addEventListener("click", () => {
  editingQuizId = null;
  window.__qzDraft = [blankQuestion()];
  $("#qz-name").value = "";
  $("#quiz-editor-title").textContent = "Жаңа тест";
  renderQuizDraft();
});

/* --- Board editor --- */
let editingBoardId = null;

function openBoardEditor(id) {
  editingBoardId = id || null;
  const b = boards.find((x) => x.id === id);
  $("#board-editor-title").textContent = b ? "Ойын жоспарын өзгерту" : "Жаңа топтық ойын";
  $("#bd-name").value = b ? b.title : "";
  $("#bd-topic").value = b ? b.topic : "";
  $("#bd-branches").value = b ? b.branches.join(", ") : "";
  const groups = Math.min(6, Math.max(2, +(b ? b.groups : 3) || 3));
  $("#bd-groups").value = groups;
  renderGNames(groups, b ? b.names : []);
  updateBoardPreview();
}

/* Топ атауы: бос болса — «N-топ» */
function gnameDefault(i) {
  return i + 1 + "-топ";
}

function renderGNames(n, names) {
  names = names || [];
  const box = $("#bd-gnames");
  box.innerHTML = Array.from({ length: n }, (_, i) => `
    <label class="props" style="border:0;padding:0;background:none">
      <span><span class="gname-dot" style="background:${GROUP_COLORS[i]}"></span>Топ ${i + 1} атауы</span>
      <input type="text" class="bd-gname" value="${esc(names[i] || "")}" placeholder="${gnameDefault(i)} (бос қалдырсаң — осы атау)" />
    </label>`).join("");
  box.querySelectorAll(".bd-gname").forEach((inp) => inp.addEventListener("input", updateBoardPreview));
}

function groupNames() {
  return [...document.querySelectorAll("#bd-gnames .bd-gname")].map((inp) => inp.value.trim());
}

function updateBoardPreview() {
  const topic = $("#bd-topic").value.trim() || "Тақырып";
  const branches = $("#bd-branches").value.split(",").map((s) => s.trim()).filter(Boolean);
  const groups = Math.min(6, Math.max(2, +$("#bd-groups").value || 3));
  const names = groupNames();
  $("#bp-topic").textContent = "🎯 " + topic;
  $("#bp-branches").innerHTML = branches.map((b) => `<span class="chip">${esc(b)}</span>`).join("");
  $("#bp-groups").innerHTML = Array.from({ length: groups }, (_, i) => `<span class="chip" style="background:#fff;border:2px solid ${GROUP_COLORS[i]};color:${GROUP_COLORS[i]}">${esc(names[i] || gnameDefault(i))} (QR)</span>`).join("");
}
["bd-topic", "bd-branches"].forEach((id) => $("#bd-" + id.replace(/^bd-/, "")).addEventListener("input", updateBoardPreview));
$("#bd-groups").addEventListener("input", () => {
  const n = Math.min(6, Math.max(2, +$("#bd-groups").value || 3));
  renderGNames(n, groupNames());
  updateBoardPreview();
});

$("#bd-save").addEventListener("click", () => {
  const title = $("#bd-name").value.trim();
  const topic = $("#bd-topic").value.trim();
  if (!title || !topic) return toast("Атау мен тақырыпты жазыңыз");
  const data = {
    title,
    topic,
    branches: $("#bd-branches").value.split(",").map((s) => s.trim()).filter(Boolean),
    groups: Math.min(6, Math.max(2, +$("#bd-groups").value || 3)),
    names: groupNames(),
  };
  if (editingBoardId) Object.assign(boards.find((x) => x.id === editingBoardId), data);
  else boards.unshift({ id: uid(), ...data });
  saveBoards();
  editingBoardId = null;
  renderGames();
  toast("✅ Ойын жоспары сақталды");
});
$("#bd-cancel").addEventListener("click", () => {
  editingBoardId = null;
  $("#bd-name").value = "";
  $("#board-editor-title").textContent = "Жаңа топтық ойын";
  updateBoardPreview();
});

/* ---------- burger ---------- */
$("#burger").addEventListener("click", () => {
  $("#burger").classList.toggle("open");
  $("#nav").classList.toggle("open");
});

/* ---------- start ---------- */
ensureSeed();
$("#year").textContent = new Date().getFullYear();
window.__qzDraft = [blankQuestion()];
renderQuizDraft();
showView(new URLSearchParams(location.search).get("tab") === "games" ? "games" : "lessons");
