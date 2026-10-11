// ---------- 1. Select the elements ----------
const loadBtn = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

const API_URL = "https://jsonplaceholder.typicode.com/users";

// ---------- 2. Data: every user we have loaded ----------
let users = [];

// ---------- 3. Drawing ----------
function createUserItem(user) {
  const li = document.createElement("li");

  const name = document.createElement("strong");
  name.textContent = user.name;

  const email = document.createElement("div");
  email.textContent = `Email: ${user.email}`;

  const city = document.createElement("div");
  city.textContent = `City: ${user.address.city}`;

  const company = document.createElement("div");
  company.textContent = `Company: ${user.company.name}`;

  li.append(name, email, city, company);
  return li;
}

// Draws any array of users (all of them, or just the filtered ones)
function renderUsers(userList) {
  usersList.replaceChildren();

  if (userList.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No users match your filter.";
    usersList.appendChild(empty);
    return;
  }

  userList.forEach((user) => usersList.appendChild(createUserItem(user)));
}

// ---------- 4. Filtering (works on the stored array, no new request) ----------
function getFilteredUsers() {
  const term = filterInput.value.trim().toLowerCase();
  return users.filter((user) => user.name.toLowerCase().includes(term));
}

// ---------- 5. Loading from the API ----------
async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadBtn.disabled = true;

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`Status ${response.status}`);

    users = await response.json();
    renderUsers(getFilteredUsers());
    statusText.textContent = `Loaded ${users.length} users.`;
  } catch (error) {
    statusText.textContent = "Could not load users. Please try again.";
    console.error(error);
  } finally {
    loadBtn.disabled = false; // runs after success and after failure
  }
}

// ---------- 6. Events ----------
loadBtn.addEventListener("click", loadUsers);

filterInput.addEventListener("input", () => {
  if (users.length === 0) return; // nothing loaded yet
  const matches = getFilteredUsers();
  renderUsers(matches);
  statusText.textContent = `Showing ${matches.length} of ${users.length} users.`;
});
