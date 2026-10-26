/* ===== Тіркелу / Кіру (жергілікті + Google/Firebase) ===== */

const USERS_KEY = "bilim.users";
const SESSION_KEY = "bilim.session";

function getAuthUsers() {
  return store.get(USERS_KEY, {});
}
function getSession() {
  return store.get(SESSION_KEY, null);
}
function setSession(s) {
  if (s) store.set(SESSION_KEY, s);
  else store.del(SESSION_KEY);
}

async function hashPassword(pw, salt) {
  const data = new TextEncoder().encode(salt + "::" + pw);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Тіркелу ---------- */
async function registerUser({ name, email, pw, role, subject, className }) {
  email = email.trim().toLowerCase();
  const users = getAuthUsers();
  if (!name.trim() || !email || pw.length < 6) throw new Error("Аты, email және кемінде 6 таңбалы пароль жазыңыз");
  if (users[email]) throw new Error("Бұл email бұрын тіркелген — кіріңіз");

  const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const user = {
    id: uid(),
    name: name.trim(),
    email,
    salt,
    hash: await hashPassword(pw, salt),
    role, // teacher | student
    provider: "local",
    createdAt: Date.now(),
  };
  if (role === "teacher") {
    user.subject = (subject || "").trim();
    /* Mugalimder tizbesine qosu */
    const teachers = getTeachers();
    const t = {
      id: Math.max(0, ...teachers.map((x) => x.id)) + 1,
      name: user.name,
      subject: user.subject || "Жаңа мұғалім",
      exp: "Тәжірибесі —",
      color: ["#4f46e5", "#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444"][teachers.length % 6],
      certs: [],
      achievements: [],
      years: {},
      schedule: [],
      email,
    };
    teachers.push(t);
    saveTeachers(teachers);
    user.teacherId = t.id;
  } else {
    user.className = (className || "").trim().toUpperCase();
  }
  users[email] = user;
  store.set(USERS_KEY, users);
  setSession({ id: user.id, name: user.name, email, role, teacherId: user.teacherId || null, className: user.className || null });
  return user;
}

/* ---------- Кіру ---------- */
async function loginUser(email, pw) {
  email = email.trim().toLowerCase();
  const user = getAuthUsers()[email];
  if (!user || user.provider === "google") throw new Error("Мұндай email табылмады (Google аккаунты болса — «Google» түймесін басыңыз)");
  const h = await hashPassword(pw, user.salt);
  if (h !== user.hash) throw new Error("Пароль дұрыс емес");
  setSession({ id: user.id, name: user.name, email, role: user.role, teacherId: user.teacherId || null, className: user.className || null });
  return user;
}

/* ---------- Google (Firebase) ---------- */
let _firebase = null;
async function loadFirebase() {
  if (!window.BILIM_FIREBASE) return null;
  if (_firebase) return _firebase;
  const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const authMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const app = appMod.initializeApp(window.BILIM_FIREBASE);
  const auth = authMod.getAuth(app);
  _firebase = { app, auth, authMod };
  return _firebase;
}

/* Google popup → local user. role null келсе — таңдау сұрайды */
async function googleLogin(prefRole) {
  const fb = await loadFirebase();
  if (!fb) {
    alert(
      "Google кіру әзірге қосылмаған.\n\nҚосу үшін config.js файлында BILIM_FIREBASE конфигурациясын толтырыңыз (файл ішінде нұсқау бар)."
    );
    return null;
  }
  const cred = await fb.authMod.signInWithPopup(fb.auth, new fb.authMod.GoogleAuthProvider());
  const email = cred.user.email.toLowerCase();
  const name = cred.user.displayName || email.split("@")[0];
  const photo = cred.user.photoURL || null;
  const users = getAuthUsers();

  let user = users[email];
  if (!user) {
    const role = prefRole || (await askRole(name));
    user = { id: uid(), name, email, provider: "google", role, createdAt: Date.now(), photo };
    if (role === "teacher") {
      const teachers = getTeachers();
      const t = {
        id: Math.max(0, ...teachers.map((x) => x.id)) + 1,
        name,
        subject: "Жаңа мұғалім",
        exp: "Тәжірибесі —",
        color: ["#4f46e5", "#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444"][teachers.length % 6],
        certs: [], achievements: [], years: {}, schedule: [], email,
      };
      teachers.push(t);
      saveTeachers(teachers);
      user.teacherId = t.id;
      user.subject = t.subject;
    }
    users[email] = user;
    store.set(USERS_KEY, users);
  }
  setSession({ id: user.id, name: user.name, email, role: user.role, teacherId: user.teacherId || null, className: user.className || null, photo });
  return user;
}

function askRole(name) {
  return new Promise((resolve) => {
    const answer = prompt(`${name} — сәлем! Сіз кімсіз?\n1 — Мұғалім\n2 — Оқушы\n\n(мәтіндік енгізу) 1 немесе 2 жазыңыз`);
    resolve(answer === "2" ? "student" : "teacher");
  });
}

function logout() {
  if (_firebase) {
    try {
      _firebase.authMod.signOut(_firebase.auth);
    } catch {}
  }
  setSession(null);
}

/* ---------- Кіргеннен кейін бағыттау ---------- */
function afterAuthRedirect(user) {
  if (user.role === "teacher") location.href = `cabinet.html?teacher=${user.teacherId ?? 0}`;
  else location.href = "index.html";
}
