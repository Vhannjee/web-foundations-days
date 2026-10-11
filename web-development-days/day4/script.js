// ---------- 1. Select the elements ----------
const textarea = document.querySelector("#note-text");
const charCount = document.querySelector("#char-count");
const wordCount = document.querySelector("#word-count");
const clearBtn = document.querySelector("#clear-btn");
const themeBtn = document.querySelector("#theme-toggle");

const DRAFT_KEY = "draft";
const THEME_KEY = "theme";
const LIMIT = 200;
const WARNING_AT = 180;

// ---------- 2. Counters ----------
function countWords(text) {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function updateCounts() {
  const length = textarea.value.length;

  charCount.textContent = `${length} / ${LIMIT} characters`;
  wordCount.textContent = `${countWords(textarea.value)} words`;

  charCount.classList.toggle("warning", length > WARNING_AT);
  charCount.classList.toggle("over", length > LIMIT);
}

// ---------- 3. Draft ----------
function saveDraft() {
  localStorage.setItem(DRAFT_KEY, textarea.value);
}

function clearAll() {
  textarea.value = "";
  localStorage.removeItem(DRAFT_KEY);
  updateCounts();
  textarea.focus();
}

// ---------- 4. Theme ----------
function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeBtn.textContent = isDark ? "Light mode" : "Dark mode";
}

// ---------- 5. Events ----------
textarea.addEventListener("input", () => {
  updateCounts();
  saveDraft();
});

textarea.addEventListener("keydown", (event) => {
  if (event.key === "Escape") clearAll();
});

clearBtn.addEventListener("click", clearAll);

themeBtn.addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark);
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
});

// ---------- 6. On page load: restore theme and draft ----------
applyTheme(localStorage.getItem(THEME_KEY) === "dark");

const savedDraft = localStorage.getItem(DRAFT_KEY);
if (savedDraft !== null) {
  textarea.value = savedDraft;
}
updateCounts();
