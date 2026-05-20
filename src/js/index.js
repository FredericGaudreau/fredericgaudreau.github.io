// Load header and footer dynamically
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

// Initialize components on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  includeHTML('header', 'src/components/header.html');
  includeHTML('footer', 'src/components/footer.html');
});