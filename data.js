/* ===== Білім мектепі — ортақ деректер мен сақтау ===== */

/* Апталық кесте: 1 сабақ = 45 минут, үзіліс 5 минут */
const PERIODS = {
  am: [
    ["08:00", "08:45"],
    ["08:50", "09:35"],
    ["09:40", "10:25"],
    ["10:30", "11:15"],
    ["11:20", "12:05"],
    ["12:10", "12:55"],
    ["13:00", "13:45"],
  ],
  pm: [
    ["14:00", "14:45"],
    ["14:50", "15:35"],
    ["15:40", "16:25"],
    ["16:30", "17:15"],
    ["17:20", "18:05"],
    ["18:10", "18:55"],
    ["19:00", "19:45"],
  ],
};
const SHIFTS = { am: "Таңертеңгі ауысым", pm: "Түстен кейінгі ауысым" };
const DAYS = ["Дүйсенбі", "Сейсенбі", "Сәрсенбі", "Бейсенбі", "Жұма", "Сенбі", "Жексенбі"];
const DAYS_SHORT = ["Дс", "Сс", "Ср", "Бс", "Жм", "Сн", "Жс"];
const YEARS = [2026, 2027];

const GROUP_COLORS = ["#ef4444", "#3b82f6", "#f59e0b", "#22c55e", "#a855f7", "#14b8a6"];
const QUIZ_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e"];
const SLIDE_BGS = ["#eef0ff", "#f0fdf4", "#fff7ed", "#fdf2f8", "#ecfeff", "#ffffff", "#1e293b", "#312e81"];

/* ---------- Saqtaw (localStorage) ---------- */const store = {
  get(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null || v === undefined ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },
  del(key) {
    localStorage.removeItem(key);
  },
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ROOM_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const roomCode = (n = 5) =>
  Array.from({ length: n }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join("");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Mugalimder ---------- */


function sampleQuiz() {
  return {
    id: uid(),
    title: "Қазақ әдебиеті — жылжытып тексеру",
    time: 20,
    questions: [
      {
        q: "«Абай жолы» романының авторы кім?",
        answers: ["Сәкен Сейфуллин", "Мұхтар Әуезов", "Бейімбет Майлин", "Илияс Жансүгіров"],
        correct: 1,
      },
      {
        q: "«Қара сүмбіле» повесінің авторы кім?",
        answers: ["Мұхтар Әуезов", "Сәбит Дұлатов", "Бейімбет Майлин", "Жамбыл Жабаев"],
        correct: 2,
      },
      {
        q: "Абай Құнанбайұлы қай жылы дүниеге келген?",
        answers: ["1835", "1850", "1860", "1845"],
        correct: 3,
      },
    ],
  };
}

function sampleBoard() {
  return {
    id: uid(),
    title: "Білім туралы топтық ой",
    topic: "Білімнің пайдасы",
    branches: ["Денсаулық", "Болашақ кәсіп", "Қоғамдағы орын"],
    groups: 3,
    names: ["Білімпаздар", "Ақылшылар", "Зерттеушілер"],
  };
}

/* Birinshi ret — seed. Mugalimder localStorage-de jalpy saqtalady */
function ensureSeed() {
  /* Demo-mugalimderdi ketirip tastau (email-sizder — seed).
     Real registratsiya bolgen mugalimderde email bar. */
  const existing = store.get("bilim.teachers", null);
  if (Array.isArray(existing)) {
    const real = existing.filter((t) => t.email);
    const seed = existing.filter((t) => !t.email);
    /* Real mugalim bolganda ғana seed-lerdi joiu (baryn joiyp qalmasın) */
    if (seed.length && real.length) store.set("bilim.teachers", real);
  }
  if (!store.get("bilim.quizzes")) store.set("bilim.quizzes", [sampleQuiz()]);
  if (!store.get("bilim.boards")) store.set("bilim.boards", [sampleBoard()]);
  if (!store.get("bilim.lessons")) store.set("bilim.lessons", []);
}

function getTeachers() {
  ensureSeed();
  return store.get("bilim.teachers", []);
}
function getTeacher(id) {
  return getTeachers().find((t) => String(t.id) === String(id)) || getTeachers()[0];
}
function saveTeachers(list) {
  store.set("bilim.teachers", list);
}
