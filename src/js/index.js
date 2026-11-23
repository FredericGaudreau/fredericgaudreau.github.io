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

  let isMenuOpen = false;
  const $ = (id) => document.getElementById(id);

  // ============================================
  // Menu mobile - Délégation d'événement
  // ============================================
  
  // Utiliser la délégation d'événement pour gérer le bouton mobile menu
  // qui est chargé dynamiquement
  document.addEventListener('click', function(e) {
    // Clic sur le bouton mobile menu
    const menuBtn = e.target.closest('#mobile-menu-btn');
    if (menuBtn) {
      e.preventDefault();
      toggleMobileMenu();
      return;
    }
    
    // Clic sur un lien du menu mobile
    const menuLink = e.target.closest('#mobile-menu a');
    if (menuLink) {
      closeMobileMenu();
    }
  });

  // Fermer avec Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isMenuOpen) {
      closeMobileMenu();
    }
  });

  // Fermer en cliquant à l'extérieur
  document.addEventListener('click', function(e) {
    if (isMenuOpen && !e.target.closest('#mobile-menu-btn') && !e.target.closest('#mobile-menu')) {
      closeMobileMenu();
    }
  });

  function toggleMobileMenu() {
    const menuBtn = $('#mobile-menu-btn');
    const mobileMenu = $('#mobile-menu');
    
    if (!menuBtn || !mobileMenu) return;

    isMenuOpen = !isMenuOpen;
    menuBtn.setAttribute('aria-expanded', isMenuOpen);
    mobileMenu.hidden = !isMenuOpen;
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    
    if (isMenuOpen) {
      mobileMenu.querySelector('a')?.focus();
    } else {
      menuBtn.focus();
    }
  }

  function closeMobileMenu() {
    const menuBtn = $('#mobile-menu-btn');
    const mobileMenu = $('#mobile-menu');
    
    if (!menuBtn || !mobileMenu) return;

    isMenuOpen = false;
    menuBtn.setAttribute('aria-expanded', false);
    mobileMenu.hidden = true;
    document.body.style.overflow = '';
    menuBtn.focus();
  }

  // ============================================
  // Chargement des composants
  // ============================================
  
  async function includeHTML(id, file) {
    const element = $(id);
    if (!element) return;

    try {
      const response = await fetch(file);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      element.innerHTML = await response.text();
      
      // Initialiser après chargement
      if (id === 'header') {
        markCurrentLink();
      }
      if (id === 'footer') {
        updateCurrentYear();
      }
    } catch (error) {
      console.warn(`Failed to load ${file}:`, error);
      element.innerHTML = `<p class="error-msg">Erreur de chargement</p>`;
    }
  }

  // ============================================
  // Navigation
  // ============================================
  
  function markCurrentLink() {
    const currentPage = document.body.dataset.page;
    
    ['home', 'map', 'notes', 'about'].forEach(key => {
      const link = $(`${key}-link`);
      const mobileLink = $(`mobile-${key}-link`);
      const path = PAGE_MAPPING[key] || `/${key}.html`;
      
      if (link) {
        link.setAttribute('href', path);
        link.toggleAttribute('aria-current', key === currentPage);
      }
      if (mobileLink) {
        mobileLink.setAttribute('href', path);
        mobileLink.toggleAttribute('aria-current', key === currentPage);
      }
    });
  }

  // ============================================
  // Header scroll
  // ============================================
  
  function initHeaderScroll() {
    const header = $('#site-header');
    if (!header) return;

    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  // ============================================
  // Footer
  // ============================================
  
  function updateCurrentYear() {
    const yearEl = $('#current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  // ============================================
  // Initialisation
  // ============================================
  
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
