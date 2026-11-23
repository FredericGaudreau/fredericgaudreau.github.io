/**
 * Site personnel - JavaScript principal
 */

(function() {
  'use strict';

  const COMPONENTS = {
    header: 'src/components/header.html',
    footer: 'src/components/footer.html'
  };

  const PAGE_MAPPING = {
    home: '/',
    map: '/map.html',
    notes: '/notes.html',
    about: '/apropos.html'
  };

  const $ = (id) => document.getElementById(id);

  async function includeHTML(id, file) {
    const element = $(id);
    if (!element) return;

    try {
      const response = await fetch(file);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      element.innerHTML = await response.text();
      
      if (id === 'header') markCurrentLink();
      if (id === 'footer') updateCurrentYear();
    } catch (error) {
      console.warn(`Failed to load ${file}:`, error);
      element.innerHTML = `<p class="error-msg">Erreur de chargement</p>`;
    }
  }

  function markCurrentLink() {
    const currentPage = document.body.dataset.page;
    
    ['home', 'map', 'notes', 'about'].forEach(key => {
      const link = $(`${key}-link`);
      if (link) {
        link.setAttribute('href', PAGE_MAPPING[key] || `/${key}.html`);
        link.toggleAttribute('aria-current', key === currentPage);
      }
    });
  }

  function initHeaderScroll() {
    const header = $('#site-header');
    if (!header) return;

    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  function updateCurrentYear() {
    const yearEl = $('#current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  async function init() {
    await Promise.all([
      includeHTML('header', COMPONENTS.header),
      includeHTML('footer', COMPONENTS.footer)
    ]);

    initHeaderScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
