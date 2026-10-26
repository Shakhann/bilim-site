/* ===== Жарлымалау конфигурациясы ===== */
/*
  Google арқылы кіруді қосу үшін:
  1. console.firebase.google.com → жаңа жоба (мыс: "bilim")
  2. Build → Authentication → Get started →
     "Sign-in method" табы: "Email/Password" мен "Google" қосыңыз
     (Google-де өзіңіздің жұмыс email-іңізді жазыңыз)
  3. Project settings → "Your apps" → Web app (</>) → конфигурацияны көшіріңіз
  4. төмендегі null орнына сол объектті қойыңыз:
  window.BILIM_FIREBASE = {
    apiKey: "AIza...",
    authDomain: "bilim.firebaseapp.com",
    projectId: "bilim"
  };
  5. Authentication → Settings → "Authorized domains" тізіміне өз доменіңізді қосыңыз
     (жергілікті тест үшін 127.0.0.1 қосуға болады)
*/
window.BILIM_FIREBASE = null;
