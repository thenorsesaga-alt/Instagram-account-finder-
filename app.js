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

function truncate(str, max) {
  return str.length > max ? str.slice(0, max).trimEnd() + "..." : str;
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
    const saveBtn = backdrop.querySelector('button[type="submit"]');
    const originalLabel = saveBtn.textContent;
    errorEl.hidden = true;
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    const formData = new FormData(e.target);
    const setStatus = (label) => {
      saveBtn.textContent = label;
    };
    try {
      await onSubmit(formData, setStatus);
      close();
    } catch (err) {
      errorEl.textContent = err.message || "Something went wrong";
      errorEl.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = originalLabel;
    }
  });
}

function openDetailSheet(title, rows, onDelete) {
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  const rowsHtml = rows
    .filter((r) => r.value !== null && r.value !== undefined && r.value !== "")
    .map((r) => {
      const value = r.isLink
        ? `<a href="${escapeHtml(r.value)}" target="_blank" rel="noopener">${escapeHtml(r.value)}</a>`
        : escapeHtml(r.value);
      return `<div class="detail-row"><div class="detail-label">${escapeHtml(r.label)}</div><div class="detail-value">${value}</div></div>`;
    })
    .join("");

  backdrop.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <h2 class="sheet-title">${escapeHtml(title)}</h2>
      ${rowsHtml || '<p class="detail-value">Nothing else recorded yet.</p>'}
      <div class="sheet-actions">
        <button type="button" class="btn btn-secondary" id="detail-close">Close</button>
        <button type="button" class="btn btn-danger" id="detail-delete">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector("#detail-close").addEventListener("click", close);
  backdrop.querySelector("#detail-delete").addEventListener("click", async () => {
    const deleteBtn = backdrop.querySelector("#detail-delete");
    deleteBtn.disabled = true;
    deleteBtn.textContent = "Deleting...";
    try {
      await onDelete();
      close();
    } catch (err) {
      showToast(err.message || "Couldn't delete");
      deleteBtn.disabled = false;
      deleteBtn.textContent = "Delete";
    }
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
}

async function analyzeProductFile(file) {
  const pdfBase64 = await fileToBase64(file);
  const res = await fetch("/api/analyze-product", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdfBase64, mimeType: file.type || "application/pdf" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Analysis failed");
  return data;
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
       </div>
       <div class="field">
         <label for="p-url">Product URL (optional)</label>
         <input id="p-url" name="product_url" type="url" placeholder="https://...">
       </div>
       <div class="field">
         <label for="p-price">Price (optional)</label>
         <input id="p-price" name="price" type="number" step="0.01" min="0" placeholder="9.99">
       </div>
       <div class="field">
         <label for="p-file">Ebook or PDF (optional -- Gemini reads it automatically)</label>
         <input id="p-file" name="file" type="file" accept="application/pdf">
       </div>`,
      async (formData, setStatus) => {
        const name = formData.get("name").trim();
        if (!name) throw new Error("Give it a name");

        const row = { name };

        const url = formData.get("product_url");
        if (url) row.product_url = url;

        const price = formData.get("price");
        if (price) row.price = parseFloat(price);

        const file = formData.get("file");
        if (file && file.size > 0) {
          if (file.size > 4 * 1024 * 1024) {
            throw new Error("Keep the PDF under 4MB for now -- try a smaller export or an excerpt");
          }
          setStatus("Analyzing with Gemini...");
          const analysis = await analyzeProductFile(file);
          Object.assign(row, analysis);
        }

        setStatus("Saving...");
        const { error } = await supabaseClient.from("products").insert(row);
        if (error) throw error;
        showToast(row.category ? "Product added and analyzed" : "Product added");
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
    .map((p) => {
      const meta = p.category
        ? `<span class="chip">${escapeHtml(p.category)}</span>${escapeHtml(p.description || "")}`
        : `Added ${new Date(p.created_at).toLocaleDateString()}`;
      return `
    <div class="list-row">
      <div class="list-row-main">
        <div class="list-row-title">${escapeHtml(p.name)}</div>
        <div class="list-row-meta">${meta}</div>
      </div>
    </div>
  `;
    })
    .join("");

  listEl.querySelectorAll(".list-row").forEach((rowEl, i) => {
    rowEl.addEventListener("click", () => {
      const p = data[i];
      openDetailSheet(
        p.name,
        [
          { label: "Description", value: p.description },
          { label: "Category", value: p.category },
          { label: "Target audience", value: p.target_audience },
          { label: "Problems solved", value: p.problems_solved },
          { label: "Benefits", value: p.benefits },
          { label: "Keywords", value: p.keywords },
          { label: "Product URL", value: p.product_url, isLink: true },
          { label: "Price", value: p.price != null ? `$${p.price}` : null },
        ],
        async () => {
          const { error } = await supabaseClient.from("products").delete().eq("id", p.id);
          if (error) throw error;
          showToast("Product deleted");
          renderProducts();
        }
      );
    });
  });
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
       </div>
       <div class="field">
         <label for="c-profile-url">Profile URL (optional)</label>
         <input id="c-profile-url" name="profile_url" type="url" placeholder="https://...">
       </div>
       <div class="field">
         <label for="c-niche">Niche (optional)</label>
         <input id="c-niche" name="niche" placeholder="e.g. fitness, productivity">
       </div>
       <div class="field">
         <label for="c-bio">Bio (optional)</label>
         <textarea id="c-bio" name="bio" rows="3"></textarea>
       </div>
       <div class="field">
         <label for="c-email">Email (optional)</label>
         <input id="c-email" name="email" type="email">
       </div>
       <div class="field">
         <label for="c-website">Website (optional)</label>
         <input id="c-website" name="website" type="url" placeholder="https://...">
       </div>
       <div class="field">
         <label for="c-notes">Notes (optional)</label>
         <textarea id="c-notes" name="notes" rows="2"></textarea>
       </div>`,
      async (formData) => {
        const username = formData.get("username").trim().replace(/^@/, "");
        if (!username) throw new Error("Enter a username");

        const row = { username, platform: formData.get("platform") };
        ["profile_url", "niche", "bio", "email", "website", "notes"].forEach((key) => {
          const val = formData.get(key);
          if (val) row[key] = val;
        });

        const { error } = await supabaseClient.from("creators").insert(row);
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
    .map((c) => {
      const metaParts = [`<span class="chip">${escapeHtml(c.platform)}</span>`];
      if (c.niche) metaParts.push(`<span class="chip">${escapeHtml(c.niche)}</span>`);
      metaParts.push(escapeHtml(c.bio ? truncate(c.bio, 60) : c.status));
      return `
    <div class="list-row ${c.status === "qualified" ? "tier-hot" : ""}">
      <div class="list-row-main">
        <div class="list-row-title">@${escapeHtml(c.username)}</div>
        <div class="list-row-meta">${metaParts.join("")}</div>
      </div>
      ${c.overall_score != null ? `<div class="list-row-score">${c.overall_score}</div>` : ""}
    </div>
  `;
    })
    .join("");

  listEl.querySelectorAll(".list-row").forEach((rowEl, i) => {
    rowEl.addEventListener("click", () => {
      const c = data[i];
      openDetailSheet(
        `@${c.username}`,
        [
          { label: "Platform", value: c.platform },
          { label: "Status", value: c.status },
          { label: "Followers", value: c.followers_count != null ? String(c.followers_count) : null },
          { label: "Overall score", value: c.overall_score != null ? String(c.overall_score) : null },
          { label: "Niche", value: c.niche },
          { label: "Bio", value: c.bio },
          { label: "Email", value: c.email },
          { label: "Website", value: c.website, isLink: true },
          { label: "Profile URL", value: c.profile_url, isLink: true },
          { label: "Notes", value: c.notes },
        ],
        async () => {
          const { error } = await supabaseClient.from("creators").delete().eq("id", c.id);
          if (error) throw error;
          showToast("Creator deleted");
          renderCreators();
        }
      );
    });
  });
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
