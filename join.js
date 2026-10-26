/* ===== Oqusha beti: QR arqyly oindarga qosyluu ===== */

const params = new URLSearchParams(location.search);
const mode = params.get("t"); // quiz | board
const room = (params.get("room") || "").toUpperCase();
const group = +params.get("g") || 1;
const card = $("#card");

if (!mode || !room) {
  card.innerHTML = `<h1>⚠️ Қате сілтеме</h1><p class="muted">Бұл бет мұғалім көрсеткен QR код арқылы ашылады.</p>`;
  throw new Error("bad url");
}

function joinScreen(title, sub) {
  card.innerHTML = `
    <h1>${title}</h1>
    <p class="muted">${sub}</p>
    <div style="text-align:center;margin-top:14px;font-size:1.5rem;font-weight:800;letter-spacing:4px;color:var(--brand)">${esc(room)}</div>
    <input type="text" id="name" placeholder="Атыңды жаз" maxlength="18" />
    <button class="btn btn-primary" id="join-btn">Кіру</button>
    <div class="join-status" id="status">Байланыс орнатылуда...</div>`;
  $("#join-btn").addEventListener("click", doJoin);
  $("#name").addEventListener("keydown", (e) => e.key === "Enter" && doJoin());
  setTimeout(() => $("#name").focus(), 300);
}

let client = null;

function doJoin() {
  const name = $("#name").value.trim();
  if (!name) return ($("#status").textContent = "Атыңды жаз!");
  $("#join-btn").disabled = true;
  $("#status").textContent = "Мұғалімге қосылуда...";

  client = rtJoin(room, {
    onOpen() {
      client.send({ type: "join", name, g: group });
      $("#status").textContent = "✅ Қосылдың! Мұғалімнің бастауын күт...";
    },
    onMessage(d) {
      if (mode === "quiz") onQuizMsg(d);
      else onBoardMsg(d);
    },
    onError(msg) {
      $("#status").innerHTML = `⚠️ ${esc(msg)}<br><small>Интернет байланысын тексеріп, QR-ды қайта сканерле</small>`;
      $("#join-btn").disabled = false;
    },
    onClose() {
      const st = $("#status");
      if (st) st.textContent = "⚠️ Байланыс үзілді (мұғалім ойынды аяқтады)";
    },
  });
}

/* ================= QUIZ (Kahoot) ================= */
let myId = null;
let qState = null;

function onQuizMsg(d) {
  if (d.type === "cfg") {
    myId = client.selfId;
    qState = { title: d.title, total: d.total, time: d.time, myTotal: 0 };
    card.innerHTML = `
      <div class="quiz-wait">
        <div class="big">🎯</div>
        <h1>${esc(d.title)}</h1>
        <p class="muted">${d.total} сұрақ · сұраққа ${d.time} секунд</p>
        <p style="margin-top:18px;font-weight:700;color:var(--brand)">Мұғалім ойынды бастағанда сұрақ пайда болады...</p>
      </div>`;
  }

  if (d.type === "ask") {
    const t0 = Date.now();
    renderQuestion(d.q, t0);
  }

  if (d.type === "reveal") {
    const gained = d.gained && myId ? d.gained[myId] || 0 : 0;
    if (gained > 0) qState.myTotal += gained;
    revealAnswers(d.correct, gained);
  }

  if (d.type === "results") {
    const myRank = d.ranks && myId ? d.ranks[myId] : null;
    const medals = ["🥇", "🥈", "🥉"];
    const heights = [110, 84, 60];
    const cols = [1, 0, 2];
    card.innerHTML = `
      <h1 style="text-align:center">🏆 Нәтижелер</h1>
      <div class="podium" style="margin-top:26px">
        ${cols
          .map(
            (pos) =>
              d.top[pos]
                ? `<div class="podium-col">
                    <div class="p-name">${medals[pos]} ${esc(d.top[pos].name)}</div>
                    <div class="p-score">${d.top[pos].score}</div>
                    <div class="podium-block" style="height:${heights[pos]}px;background:linear-gradient(180deg,#4f46e5,#312e81);color:#fff">${medals[pos]}</div>
                  </div>`
                : ""
          )
          .join("")}
      </div>
      <p style="text-align:center;margin-top:22px;font-weight:800;font-size:1.1rem">
        ${myRank ? (myRank <= 3 ? `${medals[myRank - 1]} Сіз ${myRank}-орында! Үздіксің! 🎉` : `Сіз ${myRank}-орында. Ұмтыл! 💪`) : `Сіздің жалпы ұпайыңыз: ${qState ? qState.myTotal : 0}`}
      </p>`;
  }
}

function renderQuestion(q, t0) {
  const shapes = ["▲", "●", "◆", "■"];
  card.innerHTML = `
    <p class="muted" style="text-align:center">Сұрақ · ${qState ? qState.time : q.time} сек</p>
    <div class="quiz-q">${esc(q.q)}</div>
    <div class="quiz-answers">
      ${q.answers
        .map(
          (a, i) => `
        <button class="quiz-ans" data-i="${i}" style="background:${QUIZ_COLORS[i]}">
          <span class="shape">${shapes[i]}</span><span>${esc(a)}</span>
        </button>`
        )
        .join("")}
    </div>
    <div class="quiz-timer"><div class="bar" id="tbar"></div></div>
    <div class="quiz-points" id="pts"></div>`;

  const bar = $("#tbar");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.width = "0%";
    bar.style.transition = `width ${q.time}s linear`;
  }));

  $$(".quiz-ans").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.classList.contains("picked")) return;
      b.classList.add("picked");
      $$(".quiz-ans").forEach((x) => x.classList.add("disabled"));
      client.send({ type: "answer", choice: +b.dataset.i });
      $("#pts").textContent = "⏳ Жауап қабылданды...";
      $("#pts").style.color = "var(--muted)";
    })
  );
}

function revealAnswers(correct, gained) {
  const btns = $$(".quiz-ans");
  btns.forEach((b) => {
    b.classList.add("disabled");
    if (+b.dataset.i === correct) b.classList.add("right");
    else if (b.classList.contains("picked")) b.classList.add("wrong");
    else b.style.opacity = 0.35;
  });
  const pts = $("#pts");
  if (pts) {
    pts.textContent = gained > 0 ? `✅ Дұрыс! +${gained} ұпай (жалпы: ${qState.myTotal})` : "❌ Қате жауап";
    pts.style.color = gained > 0 ? "var(--green)" : "#be123c";
  }
}

/* ================= BOARD (топтық ойын) ================= */
let bCfg = null;
let bIdeas = [];

function onBoardMsg(d) {
  if (d.type === "cfg") {
    bCfg = { topic: d.topic, branches: d.branches, groups: d.groups };
    bIdeas = d.ideas || [];
    renderBoard();
  }
  if (d.type === "ideas") {
    bIdeas = d.ideas || [];
    renderBoard();
  }
}

function renderBoard() {
  const branches = bCfg.branches || [];
  card.innerHTML = `
    <div class="board-topic" style="color:var(--ink);background:var(--brand-soft);border-radius:14px;padding:14px;text-align:center;font-weight:800">🎯 ${esc(bCfg.topic)}</div>
    <div class="bgroup-head"><span class="dot" style="background:${GROUP_COLORS[group - 1]}"></span>${group}-топ · сенің топтағы ойларың</div>
    <div class="bideas" id="bideas"></div>
    <div class="bidea-form">
      <select id="bbranch">
        <option value="">— тарақ таңба</option>
        ${branches.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join("")}
      </select>
      <input type="text" id="btext" placeholder="Өз ойыңды жаз..." maxlength="140" />
      <button id="badd">➕</button>
    </div>`;
  renderBideas();
  $("#badd").addEventListener("click", addIdea);
  $("#btext").addEventListener("keydown", (e) => e.key === "Enter" && addIdea());
}

function renderBideas() {
  const el = $("#bideas");
  if (!el) return;
  el.innerHTML = bIdeas.length
    ? bIdeas
        .map(
          (i) =>
            `<div class="bidea" style="border-left:3px solid ${GROUP_COLORS[group - 1]}">
              ${esc(i.branch ? `<em style="color:var(--muted)">${esc(i.branch)}:</em> ` : "")}${esc(i.text)}
              <div class="by">— ${esc(i.name)}</div>
            </div>`
        )
        .join("")
    : '<p class="muted" style="font-size:0.88rem">Әзірге ой жоқ — бірінші бол!</p>';
}

function addIdea() {
  const text = $("#btext").value.trim();
  if (!text) return;
  client.send({ type: "idea", text, branch: $("#bbranch").value });
  $("#btext").value = "";
  toast("✅ Ой жіберілді");
}

/* ---------- start ---------- */
if (mode === "quiz") {
  joinScreen("🎯 Тестке қосылу", "Мұғалімнің тестіне қатыс");
} else if (mode === "board") {
  joinScreen(`👥 Топтық ойын · ${group}-топ`, "Тақырыпқа өз ойыңды қос");
} else {
  card.innerHTML = `<h1>⚠️ Белгісіз режим</h1><p class="muted">t=quiz немесе t=board болуы керек</p>`;
}
