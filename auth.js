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

/* ---------- Firebase ---------- */
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

function fbErr(err) {
  const map = {
    "auth/email-already-in-use": "Бұл email бұрын тіркелген — кіріңіз",
    "auth/invalid-email": "Email дұрыс емес",
    "auth/weak-password": "Пароль қысқа — кемінде 6 таңба жазыңыз",
    "auth/user-not-found": "Мұндай email табылмады",
    "auth/wrong-password": "Пароль дұрыс емес",
    "auth/invalid-credential": "Email немесе пароль дұрыс емес",
    "auth/popup-closed-by-user": "Google терезесі жабылды — қайта басыңыз",
    "auth/cancelled-popup-request": "Google терезесі жабылды — қайта басыңыз",
    "auth/popup-blocked": "Браузер терезені тоқтатты — рұқсат беріп қайта басыңыз",
  };
  return map[err.code] || err.message || String(err);
}

/* ---------- Профиль (браузердегі деректер) ---------- */
function sessionOf(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    teacherId: user.teacherId || null,
    className: user.className || null,
    photo: user.photo || null,
  };
}

/* Email бойынша профиль табу / жасау. Рөл белгісіз болса — сұрайды */
async function ensureProfile(email, name, provider, prefRole) {
  const users = getAuthUsers();
  let user = users[email];
  if (!user) {
    const role = prefRole || (await askRole(name));
    user = { id: uid(), name, email, provider: provider || "local", role, createdAt: Date.now() };
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
    }
    users[email] = user;
    store.set(USERS_KEY, users);
  }
  return user;
}

function askRole(name) {
  return new Promise((resolve) => {
    const answer = prompt(`${name} — сәлем! Сіз кімсіз?\n1 — Мұғалім\n2 — Оқушы\n\n1 немесе 2 жазыңыз`);
    resolve(answer === "2" ? "student" : "teacher");
  });
}

/* ---------- Тіркелу ---------- */
async function registerUser({ name, email, pw, role, subject, className }) {
  email = email.trim().toLowerCase();
  if (!name.trim() || !email || pw.length < 6) throw new Error("Аты, email және кемінде 6 таңбалы пароль жазыңыз");

  const fb = await loadFirebase();
  if (fb) {
    try {
      const cred = await fb.authMod.createUserWithEmailAndPassword(fb.auth, email, pw);
      await fb.authMod.updateProfile(cred.user, { displayName: name.trim() });
    } catch (err) {
      throw new Error(fbErr(err));
    }
  } else if (getAuthUsers()[email]) {
    throw new Error("Бұл email бұрын тіркелген — кіріңіз");
  }

  /* Жергілікті профиль + (мұғалім болса) кабинет */
  const users = getAuthUsers();
  let user = users[email];
  if (user && user.role !== role) user.role = role;
  if (!user) {
    const s = salt();
    user = {
      id: uid(), name: name.trim(), email,
      salt: s,
      hash: await hashPassword(pw, s),
      role, provider: fb ? "firebase" : "local", createdAt: Date.now(),
    };
  }
  if (role === "teacher") {
    user.subject = (subject || "").trim();
    const teachers = getTeachers();
    if (!user.teacherId || !teachers.find((x) => x.id === user.teacherId)) {
      const t = {
        id: Math.max(0, ...teachers.map((x) => x.id)) + 1,
        name: user.name,
        subject: user.subject || "Жаңа мұғалім",
        exp: "Тәжірибесі —",
        color: ["#4f46e5", "#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444"][teachers.length % 6],
        certs: [], achievements: [], years: {}, schedule: [], email,
      };
      teachers.push(t);
      saveTeachers(teachers);
      user.teacherId = t.id;
    } else {
      const t = teachers.find((x) => x.id === user.teacherId);
      if (user.subject) { t.subject = user.subject; saveTeachers(teachers); }
    }
  } else {
    user.className = (className || "").trim().toUpperCase();
  }
  users[email] = user;
  store.set(USERS_KEY, users);
  setSession(sessionOf(user));
  return user;
}
function salt() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

/* ---------- Кіру ---------- */
async function loginUser(email, pw) {
  email = email.trim().toLowerCase();
  const fb = await loadFirebase();
  if (fb) {
    try {
      const cred = await fb.authMod.signInWithEmailAndPassword(fb.auth, email, pw);
      const user = await ensureProfile(email, cred.user.displayName || email.split("@")[0], "firebase");
      setSession(sessionOf(user));
      return user;
    } catch (err) {
      if (err.code === "auth/wrong-password") throw new Error("Пароль дұрыс емес");
      if (err.code !== "auth/user-not-found" && err.code !== "auth/invalid-credential") throw new Error(fbErr(err));
      /* Firebase-те жоқ — ескі жергілікті аккаунт болуы мүмкін, төменге */
    }
  }
  /* Жергілікті хэш (Firebase-сіз немесе ескі аккаунт) */
  const user = getAuthUsers()[email];
  if (!user || user.provider === "google") throw new Error("Мұндай email табылмады (Google аккаунты болса — «Google» түймесін басыңыз)");
  const h = await hashPassword(pw, user.salt);
  if (h !== user.hash) throw new Error("Пароль дұрыс емес");
  setSession(sessionOf(user));
  return user;
}

/* ---------- Парольді қалпына келтіру ---------- */
async function resetPassword(email) {
  const fb = await loadFirebase();
  if (!fb) throw new Error("Бұл мүмкіндік Google/Firebase қосылған соң ғана іске асады.");
  await fb.authMod.sendPasswordResetEmail(fb.auth, email.trim().toLowerCase());
}

/* ---------- Google ---------- */
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
  const user = await ensureProfile(email, name, "google", prefRole);
  user.photo = cred.user.photoURL || user.photo || null;
  const users = getAuthUsers();
  users[email] = user;
  store.set(USERS_KEY, users);
  setSession(sessionOf(user));
  return user;
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
