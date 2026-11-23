/**
 * Site personnel - JavaScript principal
 * Gère le chargement des composants HTML, la navigation et les interactions globales
 */

(function() {
  'use strict';

  // ============================================
  // Configuration
  // ============================================
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

  // ============================================
  // État
  // ============================================
  let isMenuOpen = false;

  // ============================================
  // Utilitaires
  // ============================================
  
  /**
   * Sélecteur d'élément par ID
   */
  const $ = (id) => document.getElementById(id);

  /**
   * Ajoute un gestionnaire d'événement
   */
  const on = (element, event, handler) => {
    if (element) {
      element.addEventListener(event, handler);
    }
  };

  // ============================================
  // Chargement des composants HTML
  // ============================================
  
  /**
   * Charge un composant HTML dans un conteneur
   */
  async function includeHTML(id, file) {
    const element = $(id);
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
      
      // Attendre que le DOM soit mis à jour
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      // Initialiser le menu mobile après le chargement du header
      if (id === 'header') {
        initMobileMenu();
        markCurrentLink();
      }
    } catch (error) {
      console.error(`Failed to load ${file}:`, error);
      element.innerHTML = `<p class="error-msg">Erreur de chargement du composant ${file}</p>`;
    }
  }

  // ============================================
  // Gestion de la navigation
  // ============================================
  
  /**
   * Met à jour le lien actuel dans le menu
   */
  function markCurrentLink() {
    const currentPage = document.body.dataset.page;
    
    // Lien dans le header principal
    const navLinks = {
      home: 'home-link',
      map: 'map-link',
      notes: 'notes-link',
      about: 'about-link'
    };
    
    Object.entries(navLinks).forEach(([key, id]) => {
      const link = $(id);
      if (link) {
        const path = PAGE_MAPPING[key] || `/${key}.html`;
        link.setAttribute('href', path);
        
        if (key === currentPage) {
          link.setAttribute('aria-current', 'page');
        } else {
          link.removeAttribute('aria-current');
        }
      }
    });
    
    // Lien dans le menu mobile
    const mobileNavLinks = {
      home: 'mobile-home-link',
      map: 'mobile-map-link',
      notes: 'mobile-notes-link',
      about: 'mobile-about-link'
    };
    
    Object.entries(mobileNavLinks).forEach(([key, id]) => {
      const link = $(id);
      if (link) {
        const path = PAGE_MAPPING[key] || `/${key}.html`;
        link.setAttribute('href', path);
        
        if (key === currentPage) {
          link.setAttribute('aria-current', 'page');
        } else {
          link.removeAttribute('aria-current');
        }
      }
    });
  }

  // ============================================
  // Header - Effets de scroll
  // ============================================
  
  /**
   * Gère l'effet de scroll du header
   */
  function initHeaderScroll() {
    const header = $('#site-header');
    if (!header) return;

    const handleScroll = () => {
      const scrollY = window.scrollY;
      if (scrollY > 10) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
  }

  // ============================================
  // Menu mobile - VERSION ROBUSTE
  // ============================================
  
  /**
   * Initialise le menu mobile
   */
  function initMobileMenu() {
    const menuBtn = $('#mobile-menu-btn');
    const mobileMenu = $('#mobile-menu');
    
    if (!menuBtn || !mobileMenu) {
      // Si les éléments n'existent pas encore, essayer plus tard
      console.warn('Mobile menu elements not found, retrying...');
      setTimeout(initMobileMenu, 200);
      return;
    }

    console.log('Mobile menu initialized');

    const toggleMenu = () => {
      isMenuOpen = !isMenuOpen;
      const isOpen = isMenuOpen;
      
      menuBtn.setAttribute('aria-expanded', isOpen);
      mobileMenu.hidden = !isOpen;
      document.body.style.overflow = isOpen ? 'hidden' : '';
      
      if (isOpen) {
        const firstLink = mobileMenu.querySelector('a');
        if (firstLink) firstLink.focus();
      } else {
        menuBtn.focus();
      }
    };

    // Écouteur direct sur le bouton
    on(menuBtn, 'click', (e) => {
      e.preventDefault();
      toggleMenu();
    });

    // Fermer le menu quand on clique sur un lien
    mobileMenu.querySelectorAll('a').forEach(link => {
      on(link, 'click', () => {
        isMenuOpen = false;
        menuBtn.setAttribute('aria-expanded', false);
        mobileMenu.hidden = true;
        document.body.style.overflow = '';
      });
    });

    // Fermer avec la touche Escape
    on(document, 'keydown', (e) => {
      if (e.key === 'Escape' && isMenuOpen) {
        toggleMenu();
      }
    });

    // Fermer en cliquant à l'extérieur
    on(document, 'click', (e) => {
      if (isMenuOpen && !e.target.closest('#mobile-menu-btn') && !e.target.closest('#mobile-menu')) {
        toggleMenu();
      }
    });
  }

  // ============================================
  // Footer - Année actuelle
  // ============================================
  
  /**
   * Met à jour l'année actuelle dans le footer
   */
  function updateCurrentYear() {
    const yearEl = $('#current-year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }

  // ============================================
  // Initialisation
  // ============================================
  
  /**
   * Initialise le site
   */
  async function init() {
    // Charger les composants
    await Promise.all([
      includeHTML('header', COMPONENTS.header),
      includeHTML('footer', COMPONENTS.footer)
    ]);

    // Initialiser le header scroll
    initHeaderScroll();

    // Mettre à jour l'année dans le footer
    updateCurrentYear();
  }

  // ============================================
  // Démarrage
  // ============================================
  
  // Attendre que le DOM soit chargé
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
