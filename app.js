// ====================================================================
// SETUP REQUIRED: paste your Supabase project values below.
// Find these in your Supabase project: Settings -> API.
// The anon key is safe to expose here -- it's protected by the
// row-level security policies you set up in SQL, not by secrecy.
// ====================================================================
const SUPABASE_URL = "https://ctqcevjroulpwzgitnjz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0cWNldmpyb3VscHd6Z2l0bmp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NTYxMTcsImV4cCI6MjEwNTEzMjExN30.YzASRZW3LHr1FgzdLEI7DKLnHat4foH5cBBop2RGVKM";

const supabaseClient = SUPABASE_URL.startsWith("http")
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const root = document.getElementById("view-root");
const tabs = document.querySelectorAll(".tab-btn");

// ---------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function emptyStateHtml(title, message) {
  return `<div class="empty-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></div>`;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function requireConnection() {
  if (!supabaseClient) {
    showToast("Add your Supabase URL and key in app.js first");
    return false;
  }
  return true;
}

function openSheet(title, bodyHtml, onSubmit) {
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <h2 class="sheet-title">${escapeHtml(title)}</h2>
      <form id="sheet-form">
        ${bodyHtml}
        <p class="error-text" id="sheet-error" hidden></p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" id="sheet-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector("#sheet-cancel").addEventListener("click", close);
  backdrop.querySelector("#sheet-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = backdrop.querySelector("#sheet-error");
    errorEl.hidden = true;
    const formData = new FormData(e.target);
    try {
      await onSubmit(formData);
      close();
    } catch (err) {
      errorEl.textContent = err.message || "Something went wrong";
      errorEl.hidden = false;
    }
  });
}

// ---------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------

async function renderDashboard() {
  root.innerHTML = `
    <h1 class="section-heading">Dashboard</h1>
    <div id="status" class="status-line">
      <span class="status-dot pending"></span>
      <span>Checking connection...</span>
    </div>
    <div class="stat-strip" id="stats"></div>
  `;

  const statusEl = document.getElementById("status");
  const statsEl = document.getElementById("stats");

  if (!supabaseClient) {
    statusEl.innerHTML =
      '<span class="status-dot error"></span><span>Not connected -- add your Supabase URL and key in app.js</span>';
    return;
  }

  try {
    const [creatorsRes, productsRes] = await Promise.all([
      supabaseClient.from("creators").select("*", { count: "exact", head: true }),
      supabaseClient.from("products").select("*", { count: "exact", head: true }),
    ]);

    if (creatorsRes.error) throw creatorsRes.error;
    if (productsRes.error) throw productsRes.error;

    statusEl.innerHTML =
      '<span class="status-dot ok"></span><span>Connected to your database</span>';
    statsEl.innerHTML = `
      <div class="stat"><span class="stat-value">${creatorsRes.count ?? 0}</span><span class="stat-label">creators</span></div>
      <div class="stat"><span class="stat-value">${productsRes.count ?? 0}</span><span class="stat-label">products</span></div>
      <div class="stat"><span class="stat-value">0</span><span class="stat-label">emails sent</span></div>
    `;
  } catch (err) {
    statusEl.innerHTML = `<span class="status-dot error"></span><span>${escapeHtml(err.message || "Connection failed")}</span>`;
  }
}

// ---------------------------------------------------------------
// Products
// ---------------------------------------------------------------

async function renderProducts() {
  root.innerHTML = `
    <h1 class="section-heading">Products</h1>
    <div id="product-list">${emptyStateHtml("Loading...", "One moment.")}</div>
    <button class="fab" id="add-product" aria-label="Add product">+</button>
  `;

  document.getElementById("add-product").addEventListener("click", () => {
    if (!requireConnection()) return;
    openSheet(
      "Add product",
      `<div class="field">
         <label for="p-name">Product name</label>
         <input id="p-name" name="name" required>
       </div>`,
      async (formData) => {
        const name = formData.get("name").trim();
        if (!name) throw new Error("Give it a name");
        const { error } = await supabaseClient.from("products").insert({ name });
        if (error) throw error;
        showToast("Product added");
        renderProducts();
      }
    );
  });

  const listEl = document.getElementById("product-list");
  if (!supabaseClient) {
    listEl.innerHTML = emptyStateHtml("Not connected", "Add your Supabase URL and key in app.js first.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = emptyStateHtml("Couldn't load products", error.message);
    return;
  }

  if (!data.length) {
    listEl.innerHTML = emptyStateHtml(
      "No products yet",
      "Add your first ebook or PDF to start matching creators against it."
    );
    return;
  }

  listEl.innerHTML = data
    .map(
      (p) => `
    <div class="list-row">
      <div class="list-row-main">
        <div class="list-row-title">${escapeHtml(p.name)}</div>
        <div class="list-row-meta">Added ${new Date(p.created_at).toLocaleDateString()}</div>
      </div>
    </div>
  `
    )
    .join("");
}

// ---------------------------------------------------------------
// Creators
// ---------------------------------------------------------------

async function renderCreators() {
  root.innerHTML = `
    <h1 class="section-heading">Creators</h1>
    <div id="creator-list">${emptyStateHtml("Loading...", "One moment.")}</div>
    <button class="fab" id="add-creator" aria-label="Add creator">+</button>
  `;

  document.getElementById("add-creator").addEventListener("click", () => {
    if (!requireConnection()) return;
    openSheet(
      "Add creator",
      `<div class="field">
         <label for="c-username">Username</label>
         <input id="c-username" name="username" required placeholder="without the @">
       </div>
       <div class="field">
         <label for="c-platform">Platform</label>
         <select id="c-platform" name="platform">
           <option value="instagram">Instagram</option>
           <option value="youtube">YouTube</option>
         </select>
       </div>`,
      async (formData) => {
        const username = formData.get("username").trim().replace(/^@/, "");
        if (!username) throw new Error("Enter a username");
        const { error } = await supabaseClient
          .from("creators")
          .insert({ username, platform: formData.get("platform") });
        if (error) throw error;
        showToast("Creator added");
        renderCreators();
      }
    );
  });

  const listEl = document.getElementById("creator-list");
  if (!supabaseClient) {
    listEl.innerHTML = emptyStateHtml("Not connected", "Add your Supabase URL and key in app.js first.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("creators")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = emptyStateHtml("Couldn't load creators", error.message);
    return;
  }

  if (!data.length) {
    listEl.innerHTML = emptyStateHtml(
      "No creators yet",
      "Add one by username, or wait for Phase 6's automatic discovery."
    );
    return;
  }

  listEl.innerHTML = data
    .map(
      (c) => `
    <div class="list-row ${c.status === "qualified" ? "tier-hot" : ""}">
      <div class="list-row-main">
        <div class="list-row-title">@${escapeHtml(c.username)}</div>
        <div class="list-row-meta"><span class="chip">${escapeHtml(c.platform)}</span>${escapeHtml(c.status)}</div>
      </div>
      ${c.overall_score != null ? `<div class="list-row-score">${c.overall_score}</div>` : ""}
    </div>
  `
    )
    .join("");
}

// ---------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------

const views = {
  dashboard: renderDashboard,
  products: renderProducts,
  creators: renderCreators,
};

function switchView(name) {
  tabs.forEach((btn) => {
    if (btn.dataset.view === name) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  views[name]();
  history.replaceState(null, "", `#${name}`);
}

tabs.forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

const initialView = (location.hash || "#dashboard").slice(1);
switchView(views[initialView] ? initialView : "dashboard");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
