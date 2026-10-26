/* ===== Білім мектебі — басты бет ===== */

/* ---------- Мобильді мәзір ---------- */
const burger = $("#burger");
const nav = $("#nav");
burger.addEventListener("click", () => {
  burger.classList.toggle("open");
  nav.classList.toggle("open");
});
nav.addEventListener("click", (e) => {
  if (e.target.tagName === "A") {
    burger.classList.remove("open");
    nav.classList.remove("open");
  }
});

/* ---------- Жыл ---------- */
$("#year").textContent = new Date().getFullYear();

/* ---------- Іске қосу ---------- */
ensureSeed();
