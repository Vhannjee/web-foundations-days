// ---------- Data ----------
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const CATEGORIES = ["personal", "work", "study"];

// Lowercase, trim and collapse repeated spaces so comparisons are forgiving
function normalise(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

// ---------- Functions ----------

// Returns every note whose text contains the word (case-insensitive)
function searchNotes(word) {
  const target = normalise(word);
  return notes.filter((note) => normalise(note.text).includes(target));
}

// Returns the note with the most characters, or null if there are none
function longestNote() {
  if (notes.length === 0) return null;
  return notes.reduce((longest, note) =>
    note.text.length > longest.text.length ? note : longest
  );
}

// Returns an object such as { personal: 2, work: 1, study: 2 }
function countByCategory() {
  const counts = {};
  CATEGORIES.forEach((category) => {
    counts[category] = 0;
  });
  notes.forEach((note) => {
    counts[note.category] = (counts[note.category] || 0) + 1;
  });
  return counts;
}

// Returns a sentence such as "5 notes: 2 personal, 1 work, 2 study."
function getSummary() {
  if (notes.length === 0) return "0 notes.";
  const counts = countByCategory();
  const parts = CATEGORIES.filter((category) => counts[category] > 0).map(
    (category) => `${counts[category]} ${category}`
  );
  const noun = notes.length === 1 ? "note" : "notes";
  return `${notes.length} ${noun}: ${parts.join(", ")}.`;
}

// True if a note with the same text exists (ignoring case and extra spaces)
function isDuplicate(text) {
  const target = normalise(text);
  return notes.some((note) => normalise(note.text) === target);
}

// Adds a valid, unique note. Returns true if added, false otherwise.
function addNote(text, category) {
  const cleaned = text.trim();

  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("❌ Rejected: note must be 1-200 characters.");
    return false;
  }
  if (!CATEGORIES.includes(category)) {
    console.log(
      `❌ Rejected: category must be one of ${CATEGORIES.join(", ")}.`
    );
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log(`❌ Rejected: "${cleaned}" already exists.`);
    return false;
  }

  const nextId = notes.reduce((max, note) => Math.max(max, note.id), 0) + 1;
  notes.push({ id: nextId, text: cleaned, category: category });
  console.log(`✅ Added: "${cleaned}" (${category})`);
  return true;
}

// ---------- Tests ----------
// Each call has its expected output in a comment next to it.
// Tests that need a different array save the real one and restore it after.
const originalNotes = notes;

console.log("--- searchNotes ---");
console.log(searchNotes("the"));        // normal: 2 notes (id 2 "Finish the Day 3 assignment", id 3 "Email the project report to Grace")
console.log(searchNotes("JAVASCRIPT")); // case ignored: 1 note (id 4 "Revise JavaScript arrays")
console.log(searchNotes("zebra"));      // edge, no results: []

console.log("--- longestNote ---");
console.log(longestNote());             // normal: { id: 3, text: 'Email the project report to Grace', category: 'work' }
notes = [];
console.log(longestNote());             // edge, empty array: null
notes = originalNotes;

console.log("--- countByCategory ---");
console.log(countByCategory());         // normal: { personal: 2, work: 1, study: 2 }
notes = [];
console.log(countByCategory());         // edge, empty array: { personal: 0, work: 0, study: 0 }
notes = originalNotes;

console.log("--- getSummary ---");
console.log(getSummary());              // normal: 5 notes: 2 personal, 1 work, 2 study.
notes = [{ id: 1, text: "Call mum", category: "personal" }];
console.log(getSummary());              // edge, exactly one note: 1 note: 1 personal.
notes = [];
console.log(getSummary());              // edge, no notes: 0 notes.
notes = originalNotes;

console.log("--- isDuplicate ---");
console.log(isDuplicate("Call mum"));       // normal: true
console.log(isDuplicate("  call   MUM ")); // edge, different case and extra spaces: true
console.log(isDuplicate("Call dad"));       // not a duplicate: false

console.log("--- addNote ---");
console.log(addNote("Book dentist appointment", "personal")); // normal: logs ✅ Added..., then true
console.log(addNote("   ", "work"));                          // edge, only spaces: logs ❌ Rejected: note must be 1-200 characters., then false
console.log(addNote("a".repeat(201), "work"));                // edge, 201 characters: logs ❌ Rejected: note must be 1-200 characters., then false
console.log(addNote("Plan holiday", "fun"));                  // edge, bad category: logs ❌ Rejected: category must be one of personal, work, study., then false
console.log(addNote("call MUM", "personal"));                 // edge, duplicate: logs ❌ Rejected: "call MUM" already exists., then false
console.log(getSummary());                                    // after one successful add: 6 notes: 3 personal, 1 work, 2 study.
