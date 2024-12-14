// index.js

async function includeHTML(id, file) {
  const element = document.getElementById(id);
  const response = await fetch(file);
  if (response.ok) {
    element.innerHTML = await response.text();
  } else {
    console.error(`Failed to load ${file}`);
  }
}

includeHTML("header", "src/components/header.html");
includeHTML("footer", "src/components/footer.html");
