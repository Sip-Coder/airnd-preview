(function () {
  const body = document.body;
  const base = body.dataset.base ?? "/";
  const ext = body.dataset.ext ?? "";
  const inputs = [
    document.getElementById("globalSearch"),
    document.getElementById("heroSearch"),
  ].filter(Boolean);

  function urlFor(path) {
    let clean = String(path).replace(/^\//, "").replace(/\/$/, "");
    if (ext === ".html") {
      if (!clean) clean = "index.html";
      else if (clean === "encyclopedia" || clean === "sections" || clean === "atlas") clean = clean + "/index.html";
      else clean = clean + ".html";
    }
    if (base === "/") return "/" + clean;
    return base + clean;
  }

  function indexFromPage() {
    const inline = document.getElementById("search-index");
    if (!inline || !inline.textContent) return null;
    try {
      return JSON.parse(inline.textContent);
    } catch {
      return null;
    }
  }

  let entries = indexFromPage();

  function ensurePanel(input) {
    const parent = input.parentElement;
    if (!parent) return null;
    parent.style.position = parent.classList.contains("search-wrap") ? parent.style.position : "relative";
    let panel = parent.querySelector(".search-results");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "search-results";
      panel.hidden = true;
      parent.appendChild(panel);
    }
    return panel;
  }

  function render(input) {
    const panel = ensurePanel(input);
    if (!panel || !entries) return;
    const q = input.value.trim().toLowerCase();
    panel.innerHTML = "";
    if (!q) {
      panel.hidden = true;
      return;
    }
    const hits = entries.filter((item) =>
      (item.title + " " + item.summary + " " + item.sectionTitle + " " + item.moduleTitle)
        .toLowerCase()
        .includes(q)
    ).slice(0, 8);
    if (!hits.length) {
      panel.hidden = false;
      panel.innerHTML = '<p class="form-note" style="padding:.6rem .8rem">No matching nodes.</p>';
      return;
    }
    panel.hidden = false;
    hits.forEach((item) => {
      const a = document.createElement("a");
      a.href = urlFor("encyclopedia/" + item.id);
      a.innerHTML = "<small></small><strong></strong>";
      a.querySelector("small").textContent = item.sectionTitle + " · " + item.moduleTitle;
      a.querySelector("strong").textContent = item.title;
      panel.appendChild(a);
    });
  }

  async function ready() {
    if (entries) return;
    const catalog = body.dataset.catalog;
    if (!catalog) return;
    const response = await fetch(catalog);
    const data = await response.json();
    entries = data.nodes || [];
  }

  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      ready().then(() => render(input));
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      ready().then(() => {
        render(input);
        const first = input.parentElement?.querySelector(".search-results a");
        if (first) window.location.href = first.href;
        else window.location.href = urlFor("encyclopedia");
      });
    });
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      (document.getElementById("heroSearch") || document.getElementById("globalSearch"))?.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(".search-wrap") || event.target.closest(".hero-search")) return;
    document.querySelectorAll(".search-results").forEach((panel) => {
      panel.hidden = true;
    });
  });
})();
