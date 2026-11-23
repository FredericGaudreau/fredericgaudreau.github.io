/**
 * Service Worker pour le site de Frédéric Gaudreau
 * Gère le cache des ressources pour une expérience hors ligne optimale
 */

const CACHE_VERSION = 'v5';
const CACHE_NAME = `site-cache-${CACHE_VERSION}`;

// Ressources à précacher
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/map.html',
  '/carte.html',
  '/apropos.html',
  '/notes.html',
  '/404.html',
  '/manifest.webmanifest',
  '/src/css/style.css',
  '/src/css/notes.css',
  '/src/js/index.js',
  '/src/js/markdown.js',
  '/src/js/map.js',
  '/src/js/notes.js',
  '/src/components/header.html',
  '/src/components/footer.html',
  '/src/images/favicon.png',
  '/src/images/favicon.svg',
];

// Ressources externes à mettre en cache (si disponibles)
const EXTERNAL_RESOURCES = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// Stratégie: Network First, Cache Fallback
const NETWORK_FIRST = 'network-first';
// Stratégie: Cache First, Network Fallback
const CACHE_FIRST = 'cache-first';
// Stratégie: Cache Only
const CACHE_ONLY = 'cache-only';

// Configuration des stratégies par type de fichier
const STRATEGIES = {
  html: NETWORK_FIRST,
  css: CACHE_FIRST,
  js: CACHE_FIRST,
  png: CACHE_FIRST,
  svg: CACHE_FIRST,
  jpg: CACHE_FIRST,
  jpeg: CACHE_FIRST,
  gif: CACHE_FIRST,
  ico: CACHE_FIRST,
  json: NETWORK_FIRST,
  default: NETWORK_FIRST,
};

/**
 * Retourne la stratégie à utiliser pour une URL
 */
function getStrategy(url) {
  const path = url.pathname.toLowerCase();
  
  if (path.endsWith('.html') || path === '/') return STRATEGIES.html;
  if (path.endsWith('.css')) return STRATEGIES.css;
  if (path.endsWith('.js')) return STRATEGIES.js;
  if (path.endsWith('.png')) return STRATEGIES.png;
  if (path.endsWith('.svg')) return STRATEGIES.svg;
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return STRATEGIES.jpg;
  if (path.endsWith('.gif')) return STRATEGIES.gif;
  if (path.endsWith('.ico')) return STRATEGIES.ico;
  if (path.endsWith('.json')) return STRATEGIES.json;
  
  return STRATEGIES.default;
}

/**
 * Gère la réponse en fonction de la stratégie
 */
async function handleRequest(event, strategy) {
  const { request } = event;
  const url = new URL(request.url);
  
  switch (strategy) {
    case CACHE_FIRST:
      return handleCacheFirst(request, url);
    
    case NETWORK_FIRST:
      return handleNetworkFirst(request, url);
    
    case CACHE_ONLY:
      return handleCacheOnly(request);
    
    default:
      return handleNetworkFirst(request, url);
  }
}

/**
 * Stratégie Cache First
 */
async function handleCacheFirst(request, url) {
  const cached = await caches.match(request);
  
  if (cached) {
    // Mettre à jour le cache en arrière-plan
    updateCacheInBackground(request, url);
    return cached;
  }
  
  // Si pas en cache, aller sur le réseau
  return fetchWithFallback(request, url);
}

/**
 * Stratégie Network First
 */
async function handleNetworkFirst(request, url) {
  try {
    const response = await fetch(request);
    
    // Si la réponse est valide, la mettre en cache
    if (isValidResponse(response)) {
      const clone = response.clone();
      await caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
    }
    
    return response;
  } catch (error) {
    // Si le réseau échoue, retourner la version en cache
    const cached = await caches.match(request);
    return cached || await caches.match('/404.html');
  }
}

/**
 * Stratégie Cache Only
 */
async function handleCacheOnly(request) {
  return caches.match(request);
}

/**
 * Met à jour le cache en arrière-plan
 */
async function updateCacheInBackground(request, url) {
  try {
    const response = await fetch(request);
    if (isValidResponse(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
  } catch (error) {
    // Ignorer les erreurs de mise à jour en arrière-plan
    console.warn(`[SW] Failed to update cache for ${url.href}:`, error);
  }
}

/**
 * Récupère depuis le réseau avec fallback sur le cache
 */
async function fetchWithFallback(request, url) {
  try {
    const response = await fetch(request);
    
    if (isValidResponse(response)) {
      const clone = response.clone();
      await caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
    }
    
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    return cached || await caches.match('/404.html');
  }
}

/**
 * Vérifie si une réponse est valide pour le cache
 */
function isValidResponse(response) {
  return response && 
         response.status === 200 && 
         response.type === 'basic' &&
         !response.headers.get('Cache-Control')?.includes('no-store');
}

/**
 * Est-ce une requête de navigation ?
 */
function isNavigationRequest(request) {
  return request.mode === 'navigate' || 
         (request.method === 'GET' && request.headers.get('Accept')?.includes('text/html'));
}

/**
 * Installation du Service Worker
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      // Précacher les ressources principales
      await Promise.allSettled(
        PRECACHE_URLS.map(url => cache.add(new Request(url, { cache: 'reload' })))
      );
      
      // Précacher les ressources externes si possible
      await Promise.allSettled(
        EXTERNAL_RESOURCES.map(url => 
          fetch(url).then(response => {
            if (isValidResponse(response)) {
              return cache.put(url, response);
            }
          })
        )
      );
      
      // Passer à l'état waiting immédiatement
      await self.skipWaiting();
      console.log('[SW] Installé et prêt à servir');
    })()
  );
});

/**
 * Activation du Service Worker
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Supprimer les anciens caches
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(key => !key.includes(CACHE_VERSION))
            .map(key => caches.delete(key))
      );
      
      // Prendre le contrôle des clients
      await self.clients.claim();
      console.log('[SW] Activé et contrôle des clients pris');
    })()
  );
});

/**
 * Interception des requêtes
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorer les requêtes non-GET
  if (request.method !== 'GET') return;
  
  // Ignorer les requêtes cross-origin (sauf pour les CDN autorisés)
  const allowedCDNs = [
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'unpkg.com',
    'tile.openstreetmap.org',
    'tile.opentopomap.org',
    'server.arcgisonline.com',
  ];
  
  if (url.origin !== self.location.origin && 
      !allowedCDNs.some(cdn => url.hostname.includes(cdn))) {
    return;
  }
  
  // Gérer la requête avec la stratégie appropriée
  const strategy = getStrategy(url);
  event.respondWith(handleRequest(event, strategy));
});

/**
 * Gestion des messages
 */
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(keys => 
        Promise.all(keys.map(key => caches.delete(key)))
      )
    );
  }
});

/**
 * Écouteur pour les erreurs
 */
self.addEventListener('error', (error) => {
  console.error('[SW] Erreur:', error);
});
