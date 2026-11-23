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

  async function includeHTML(id, file) {
    const element = $(id);
    if (!element) return;

    try {
      const response = await fetch(file);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      element.innerHTML = await response.text();
      
      // Initialiser après chargement
      if (id === 'header') {
        await new Promise(resolve => requestAnimationFrame(resolve));
        initMobileMenu();
        markCurrentLink();
      }
    } catch (error) {
      console.warn(`Failed to load ${file}:`, error);
      element.innerHTML = `<p class="error-msg">Erreur de chargement</p>`;
    }
  }

  function markCurrentLink() {
    const currentPage = document.body.dataset.page;
    
    const navLinks = {
      home: 'home-link',
      map: 'map-link',
      notes: 'notes-link',
      about: 'about-link'
    };
    
    Object.entries(navLinks).forEach(([key, id]) => {
      const link = $(id);
      if (link) {
        link.setAttribute('href', PAGE_MAPPING[key] || `/${key}.html`);
        link.toggleAttribute('aria-current', key === currentPage);
      }
    });
    
    const mobileNavLinks = {
      home: 'mobile-home-link',
      map: 'mobile-map-link',
      notes: 'mobile-notes-link',
      about: 'mobile-about-link'
    };
    
    Object.entries(mobileNavLinks).forEach(([key, id]) => {
      const link = $(id);
      if (link) {
        link.setAttribute('href', PAGE_MAPPING[key] || `/${key}.html`);
        link.toggleAttribute('aria-current', key === currentPage);
      }
    });
  }

  function initHeaderScroll() {
    const header = $('#site-header');
    if (!header) return;

    const handleScroll = () => {
      header.classList.toggle('scrolled', window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
  }

  function initMobileMenu() {
    const menuBtn = $('#mobile-menu-btn');
    const mobileMenu = $('#mobile-menu');
    
    if (!menuBtn || !mobileMenu) {
      setTimeout(initMobileMenu, 200);
      return;
    }

    const toggleMenu = () => {
      isMenuOpen = !isMenuOpen;
      menuBtn.setAttribute('aria-expanded', isMenuOpen);
      mobileMenu.hidden = !isMenuOpen;
      document.body.style.overflow = isMenuOpen ? 'hidden' : '';
      
      if (isMenuOpen) {
        mobileMenu.querySelector('a')?.focus();
      } else {
        menuBtn.focus();
      }
    };

    menuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleMenu();
    });

    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        isMenuOpen = false;
        menuBtn.setAttribute('aria-expanded', false);
        mobileMenu.hidden = true;
        document.body.style.overflow = '';
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isMenuOpen) toggleMenu();
    });

    document.addEventListener('click', (e) => {
      if (isMenuOpen && !e.target.closest('#mobile-menu-btn') && !e.target.closest('#mobile-menu')) {
        toggleMenu();
      }
    });
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
    updateCurrentYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
