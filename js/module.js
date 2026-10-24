(function () {
  const dataEl = document.getElementById("module-data");
  const grid = document.getElementById("styleGrid");
  const filtersEl = document.getElementById("filters");
  const search = document.getElementById("styleSearch");
  const shown = document.getElementById("shownCount");
  if (!dataEl || !grid || !filtersEl || !search || !shown) return;

  const data = JSON.parse(dataEl.textContent || '{"nodes":[]}');
  const nodes = data.nodes || [];
  const base = document.body.dataset.base ?? "/";
  const ext = document.body.dataset.ext ?? "";

  function urlFor(id) {
    const path = "encyclopedia/" + id;
    if (base === "/") return "/" + path + ext;
    return base + path + ext;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  let active = "All";
  const facets = ["All", ...new Set(nodes.map((node) => node.facet).filter(Boolean))];
  facets.forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-btn";
    button.textContent = name;
    button.setAttribute("aria-pressed", name === "All" ? "true" : "false");
    button.addEventListener("click", () => {
      active = name;
      filtersEl.querySelectorAll(".filter-btn").forEach((item) => {
        item.setAttribute("aria-pressed", item.textContent === active ? "true" : "false");
      });
      render();
    });
    filtersEl.appendChild(button);
  });

  function render() {
    const query = (search.value || "").trim().toLowerCase();
    const list = nodes.filter((node) => {
      if (active !== "All" && node.facet !== active) return false;
      if (!query) return true;
      return (
        node.title.toLowerCase().includes(query) ||
        node.facet.toLowerCase().includes(query) ||
        (node.summary || "").toLowerCase().includes(query)
      );
    });
    shown.textContent = "Showing " + list.length + " of " + nodes.length + " nodes";
    grid.innerHTML = "";
    const frag = document.createDocumentFragment();
    list.forEach((node) => {
      const el = document.createElement("a");
      el.className = "style-card is-link";
      el.href = urlFor(node.id);
      el.innerHTML =
        '<div class="sg">' +
        escapeHtml(node.facet) +
        "</div><h3>" +
        escapeHtml(node.title) +
        "</h3><p>" +
        escapeHtml(node.summary || "") +
        "</p>";
      frag.appendChild(el);
    });
    grid.appendChild(frag);
  }

  search.addEventListener("input", render);
  render();
})();
