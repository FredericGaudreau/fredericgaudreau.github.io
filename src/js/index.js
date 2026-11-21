async function includeHTML(id, file) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Element with id "${id}" not found`);
    return;
  }

  try {
    const response = await fetch(file);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    element.innerHTML = await response.text();
  } catch (error) {
    console.error(`Failed to load ${file}:`, error);
    element.innerHTML = `<p>Error loading content from ${file}</p>`;
  }
}

function markCurrentLink(id, path) {
  const link = document.getElementById(id);
  if (link) {
    link.setAttribute("aria-current", "page");
    link.setAttribute("href", path);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([
    includeHTML("header", "src/components/header.html"),
    includeHTML("footer", "src/components/footer.html"),
  ]);

  const page = document.body.dataset.page;
  if (page === "home") {
    markCurrentLink("home-link", "/");
  } else if (page === "map") {
    markCurrentLink("map-link", "/map.html");
  } else if (page === "about") {
    markCurrentLink("about-link", "/apropos.html");
  }
});
