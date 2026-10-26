/* ===== Cloud sync (Firebase Firestore) =====
   Мұғалімнің деректері (профиль, расписание, сертификаттар, жетістіктер,
   тесттер, тақталар, сабақ слайдтары) есебінің астында бұлтта сақталады.
   Кез келген құрылғыда өз аккаунтпен кіргенде деректер сол жерден жүктеледі.

   Firestore қосылмаған болса — бәрі бұрынғыдай жергілікті (браузер) режимінде
   жұмыс істейді, ештеңе бұзылмайды.
*/

const FS_BASE = "https://www.gstatic.com/firebasejs/10.12.2";
let _fsApp = null;
let _fsDb = null;
let _fsMod = null;
let _fsFail = null;
let _fsLoadPromise = null;
let _pushTimer = null;
let _importing = false;
let _syncing = false;
let _lastSync = null;
let _syncState = "local";

const CLOUD_TIMEOUT = 15000;

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label + " timeout")), CLOUD_TIMEOUT)),
  ]);
}

function _isFatal(e) {
  const msg = String((e && e.message) || e);
  return !!(e && (e.code === "permission-denied" || e.code === "failed-precondition" || /permission|not enabled|failed-precondition|api not available/i.test(msg)));
}

function _cloudSession() {
  const s = store.get("bilim.session", null);
  if (s && s.role === "teacher" && s.uid) return s;
  return null;
}

async function _cloudLoad() {
  if (_fsDb) return _fsDb;
  if (_fsFail) return null;
  if (!window.BILIM_FIREBASE) return null;
  if (_fsLoadPromise) return _fsLoadPromise;
  _fsLoadPromise = (async () => {
    try {
      const appMod = await import(FS_BASE + "/firebase-app.js");
      const authMod = await import(FS_BASE + "/firebase-auth.js");
      const fsMod = await import(FS_BASE + "/firebase-firestore.js");
      _fsMod = fsMod;
      _fsApp = appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp(window.BILIM_FIREBASE);
      const auth = authMod.getAuth(_fsApp);
      if (!auth.currentUser) {
        /* Басқа беттерде: сақталған кіру (token) қалпына келгенше күту */
        await new Promise((resolve) => {
          let done = false;
          let unsub = null;
          const finish = () => {
            if (done) return;
            done = true;
            try { unsub && unsub(); } catch {}
            resolve();
          };
          unsub = authMod.onAuthStateChanged(auth, (u) => { if (u) finish(); });
          setTimeout(finish, 4000);
        });
      }
      _fsDb = _fsMod.getFirestore(_fsApp);
      return _fsDb;
    } catch (e) {
      _fsFail = e;
      return null;
    }
  })();
  try {
    return await _fsLoadPromise;
  } finally {
    _fsLoadPromise = null;
  }
}

function _syncSet(state) {
  _syncState = state;
  try {
    window.dispatchEvent(new CustomEvent("cloudsync", { detail: { state: _syncState, time: _lastSync } }));
  } catch {}
}

function cloudStatus() {
  return { state: _syncState, time: _lastSync, fail: _fsFail ? String((_fsFail && _fsFail.message) || _fsFail) : null };
}

/* ---------- Тіркемдерді бөлу (Firestore құжаты 1MB шекті) ---------- */
function _collectAtts(teachers) {
  const atts = new Map();
  teachers.forEach((tc) => {
    (tc.certs || []).forEach((c, i) => {
      if (c && typeof c.data === "string" && c.data.length) {
        const key = "t" + tc.id + "-c" + i;
        atts.set(key, c.data);
        c.data = "__ATT__" + key;
      }
    });
    (tc.achievements || []).forEach((a, i) => {
      if (a && a.att && typeof a.att.data === "string" && a.att.data.length) {
        const key = "t" + tc.id + "-a" + i;
        atts.set(key, a.att.data);
        a.att.data = "__ATT__" + key;
      }
    });
  });
  return atts;
}

function _restoreAtts(teachers, byKey) {
  const fix = (v) => {
    if (!v || typeof v !== "string" || !v.startsWith("__ATT__")) return v;
    const list = byKey.get(v.slice(7));
    if (!list) return v;
    let data = "";
    for (let i = 0; i < list.size; i++) data += list.get(i) || "";
    return data;
  };
  teachers.forEach((tc) => {
    (tc.certs || []).forEach((c) => {
      if (c) c.data = fix(c.data);
    });
    (tc.achievements || []).forEach((a) => {
      if (a && a.att) a.att.data = fix(a.att.data);
    });
  });
}

/* ---------- Жіберу (push) ---------- */
async function cloudPush() {
  const s = _cloudSession();
  if (!s || _syncing) return;
  const db = await _cloudLoad();
  if (!db) {
    _syncSet(window.BILIM_FIREBASE ? "off" : "local");
    return;
  }
  try {
    const f = _fsMod;
    const teachers = JSON.parse(JSON.stringify(getTeachers() || []));
    const atts = _collectAtts(teachers);
    const main = {
      teachers,
      quizzes: store.get("bilim.quizzes", []),
      boards: store.get("bilim.boards", []),
      lessons: store.get("bilim.lessons", []),
      ownerEmail: s.email || "",
      updatedAt: Date.now(),
    };
    if (JSON.stringify(main).length > 950000) console.warn("bilim cloud: негізгі құжат тым үлкен");
    const old = await withTimeout(f.getDocs(f.collection(db, "teachers", s.uid, "atts")), "list atts");
    const CH = 700000;
    const writes = [];
    atts.forEach((data, key) => {
      for (let i = 0; i < data.length; i += CH) writes.push({ key, seq: i / CH, part: data.slice(i, i + CH), total: Math.ceil(data.length / CH) });
    });
    if (old.size + writes.length + 1 > 450) throw new Error("too many attachments");
    const batch = f.writeBatch();
    batch.set(f.doc(db, "teachers", s.uid), main);
    old.forEach((d) => batch.delete(d.ref));
    writes.forEach((w) => {
      batch.set(f.doc(db, "teachers", s.uid, "atts", w.key + "_" + w.seq), { key: w.key, seq: w.seq, total: w.total, part: w.part });
    });
    await withTimeout(batch.commit(), "batch commit");
    _lastSync = Date.now();
    _syncSet("ok");
  } catch (e) {
    console.warn("bilim cloud push:", e);
    if (_isFatal(e)) _fsFail = e;
    _syncSet("err");
  }
}

/* ---------- Жүктеу (pull) ---------- */
async function cloudPull() {
  const s = _cloudSession();
  if (!s || _syncing) return;
  const db = await _cloudLoad();
  if (!db) {
    _syncSet(window.BILIM_FIREBASE ? "off" : "local");
    return;
  }
  _syncing = true;
  try {
    const f = _fsMod;
    const snap = await withTimeout(f.getDoc(f.doc(db, "teachers", s.uid)), "getDoc");
    if (!snap.exists()) {
      _syncing = false;
      await cloudPush(); /* есеп жаңа — жергілікті деректерді бұлтқа көшіреміз */
      return;
    }
    const p = snap.data();
    const attSnap = await withTimeout(f.getDocs(f.collection(db, "teachers", s.uid, "atts")), "list atts");
    const byKey = new Map();
    attSnap.forEach((d) => {
      const v = d.data();
      if (!byKey.has(v.key)) byKey.set(v.key, new Map());
      byKey.get(v.key).set(v.seq, v.part);
    });
    _restoreAtts(p.teachers || [], byKey);

    _importing = true;
    try {
      const local = getTeachers() || [];
      const emailToId = new Map(local.filter((t) => t.email).map((t) => [String(t.email).toLowerCase(), t.id]));
      const byId = new Map(local.map((t) => [String(t.id), t]));
      (p.teachers || []).forEach((tc) => {
        if (tc.email) {
          const oldId = emailToId.get(String(tc.email).toLowerCase());
          if (oldId !== undefined && String(oldId) !== String(tc.id)) byId.delete(String(oldId));
        }
        byId.set(String(tc.id), tc);
      });
      saveTeachers([...byId.values()]);
      store.set("bilim.quizzes", p.quizzes || []);
      store.set("bilim.boards", p.boards || []);
      store.set("bilim.lessons", p.lessons || []);
    } finally {
      _importing = false;
    }
    _lastSync = Date.now();
    _syncSet("ok");

    const me = (getTeachers() || []).find((t) => t.email && String(t.email).toLowerCase() === String(s.email).toLowerCase());
    if (me && String(me.id) !== String(s.teacherId)) {
      const users = store.get("bilim.users", {});
      if (users[s.email]) users[s.email].teacherId = me.id;
      store.set("bilim.users", users);
      const ns = store.get("bilim.session", null);
      if (ns) {
        ns.teacherId = me.id;
        store.set("bilim.session", ns);
        /* auth.html-де reload-сіз: login ағыны бағыттайды */
        if (!/auth\.html$/.test(location.pathname)) location.reload();
      }
    }
  } catch (e) {
    console.warn("bilim cloud pull:", e);
    if (_isFatal(e)) _fsFail = e;
    _syncSet("err");
  } finally {
    _syncing = false;
  }
}

/* ---------- Кіргеннен кейін синхрондау (auth.js шақырады) ---------- */
async function cloudSyncOnLogin() {
  const s = _cloudSession();
  if (!s) {
    _syncSet("local");
    return;
  }
  try {
    await Promise.race([cloudPull(), new Promise((r) => setTimeout(r, 25000))]);
  } catch (e) {
    console.warn("bilim cloud sync:", e);
    _syncSet("err");
  }
}

/* ---------- Бет ашылғанда: кірген болса — бұлтты тексеру ---------- */
(function () {
  const s = _cloudSession();
  if (s) cloudPull();
  else _syncSet("local");
})();

/* ---------- Деректер өзгерсе — кідіріспен жіберу ---------- */
window.cloudChanged = (key) => {
  if (_importing || _syncing) return;
  if (key !== "bilim.teachers" && key !== "bilim.quizzes" && key !== "bilim.boards" && key !== "bilim.lessons") return;
  if (!_cloudSession()) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    cloudPush();
  }, 1500);
};
