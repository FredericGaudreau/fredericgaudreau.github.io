"use strict";

const CONFIG = {
  defaultCenter: [45.8924, -74.1546],
  defaultZoom: 13,
  focusZoom: 14,
  storageKey: "mapPoints",
  collectionsKey: "mapCollections",
  cacheExpiry: 3600000, // 1 heure en ms
  dbName: "MapCacheDB",
  dbVersion: 1,
};

// Système de cache amélioré avec IndexedDB + localStorage fallback
class PersistentCache {
  constructor() {
    this.db = null;
    this.ready = this.init();
  }

  async init() {
    try {
      this.db = await this.openDB();
    } catch (error) {
      console.warn("IndexedDB non disponible, utilisation localStorage", error);
      this.db = null;
    }
  }

  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.dbName, CONFIG.dbVersion);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("cache")) {
          db.createObjectStore("cache", { keyPath: "key" });
        }
      };
    });
  }

  async set(key, value) {
    await this.ready;
    const data = { key, value, timestamp: Date.now() };

    if (this.db) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(["cache"], "readwrite");
        const store = tx.objectStore("cache");
        const request = store.put(data);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } else {
      // Fallback localStorage
      try {
        localStorage.setItem(`cache_${key}`, JSON.stringify(data));
      } catch (e) {
        console.warn("Cache storage full");
      }
    }
  }

  async get(key) {
    await this.ready;

    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction(["cache"], "readonly");
        const store = tx.objectStore("cache");
        const request = store.get(key);
        request.onsuccess = () => {
          const result = request.result;
          if (result && Date.now() - result.timestamp < CONFIG.cacheExpiry) {
            resolve(result.value);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => resolve(null);
      });
    } else {
      // Fallback localStorage
      try {
        const cached = localStorage.getItem(`cache_${key}`);
        if (cached) {
          const data = JSON.parse(cached);
          if (Date.now() - data.timestamp < CONFIG.cacheExpiry) {
            return data.value;
          }
        }
      } catch (e) {
        // Ignore
      }
      return null;
    }
  }

  async clear() {
    await this.ready;
    if (this.db) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(["cache"], "readwrite");
        const store = tx.objectStore("cache");
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } else {
      // Fallback localStorage
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("cache_")) {
          localStorage.removeItem(key);
        }
      });
    }
  }
}

const persistentCache = new PersistentCache();

const map = L.map("map").setView(CONFIG.defaultCenter, CONFIG.defaultZoom);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
  maxZoom: 19,
}).addTo(map);

// Couches de carte
const baseLayers = {
  Standard: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }),
  Relief: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17 }),
  Satellite: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19 },
  ),
};
L.control.layers(baseLayers, null, { position: "bottomright" }).addTo(map);

const points = [];
let collections = [];
let currentCollectionFilter = null;
let previewMarker = null;
let routingControl = null;

function readHashState() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const lat = parseFloat(params.get("lat"));
  const lng = parseFloat(params.get("lng"));
  const zoom = parseInt(params.get("zoom"), 10);
  const [openLat, openLng] = (params.get("open") || "").split(",").map(parseFloat);
  return { lat, lng, zoom, openLat, openLng };
}

function writeHashState() {
  const params = new URLSearchParams();
  const { lat, lng } = map.getCenter();
  params.set("lat", lat.toFixed(5));
  params.set("lng", lng.toFixed(5));
  params.set("zoom", map.getZoom());
  const openPoint =
    points.find((p) => p.marker?.isPopupOpen?.()) ||
    (map._popup ? points.find((p) => p.marker === map._popup) : null);
  if (openPoint) {
    params.set("open", `${openPoint.lat.toFixed(5)},${openPoint.lng.toFixed(5)}`);
  }
  const hash = `#${params.toString()}`;
  if (window.location.hash !== hash) {
    history.replaceState(null, "", hash);
  }
}

function restoreViewFromHash() {
  const state = readHashState();
  if (Number.isFinite(state.lat) && Number.isFinite(state.lng)) {
    map.setView(
      [state.lat, state.lng],
      Number.isFinite(state.zoom) ? state.zoom : CONFIG.defaultZoom,
    );
  }
}

function openPointFromHash() {
  const state = readHashState();
  if (!Number.isFinite(state.openLat) || !Number.isFinite(state.openLng)) {
    return;
  }
  const target = points.find(
    (p) =>
      p.lat.toFixed(5) === state.openLat.toFixed(5) &&
      p.lng.toFixed(5) === state.openLng.toFixed(5),
  );
  if (target?.marker) {
    target.marker.openPopup();
  }
}

map.on("moveend", writeHashState);
map.on("popupopen", writeHashState);
map.on("popupclose", writeHashState);
restoreViewFromHash();

// Indicateur de disponibilité réseau (amélioré)
let isOnline = navigator.onLine;
window.addEventListener("online", () => {
  isOnline = true;
  showToast("Connexion rétablie", "success");
});
window.addEventListener("offline", () => {
  isOnline = false;
  showToast("Mode hors ligne activé", "success");
});

const COLLECTION_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#14b8a6",
  "#6366f1",
  "#f97316",
];

const getMarkerIcon = (color) => {
  if (!color) return null;
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const $ = (id) => document.getElementById(id);
const form = $("data-form");
const nameInput = $("point-name");
const collectionSelect = $("collection-select");
const pointsSection = $("points-section");
const pointsList = $("points-list");
const toggleBtn = $("toggle-points");
const locateBtn = $("locate-btn");
const counterBadge = toggleBtn.querySelector(".counter-badge");
const searchInput = $("search-points");
const addressSearchInput = $("search-address");
const addressSearchResults = $("search-results");
const nominatimSearch = $("nominatim-search");
const toggleNominatimBtn = $("toggle-nominatim");
const closeNominatimBtn = $("close-nominatim");
const toastContainer = $("toast-container");
const collectionsToggle = $("collections-toggle");
const collectionsDropdown = $("collections-dropdown");
const closeCollectionsBtn = $("close-collections");
const newCollectionBtn = $("new-collection-btn");
const collectionsList = $("collections-list");
const collectionModal = $("collection-modal");
const collectionNameInput = $("collection-name-input");
const modalCreate = $("modal-create");
const modalCancel = $("modal-cancel");
const renameModal = $("rename-modal");
const renameInput = $("rename-input");
const renameConfirm = $("rename-confirm");
const renameCancel = $("rename-cancel");
const exportModal = $("export-modal");
const exportCancel = $("export-cancel");
const exportConfirm = $("export-confirm");
const importModal = $("import-modal");
const importCancel = $("import-cancel");
const importConfirm = $("import-confirm");
const routingBtn = $("routing-btn");
const routingPanel = $("routing-panel");
const routingStart = $("routing-start");
const routingEnd = $("routing-end");
const routingCalculate = $("routing-calculate");
const routingClose = $("routing-close");
let pointEventsAttached = false;

const escapeHtml = (str) =>
  str.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

const debounce = (fn, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
};

const renderAddressResults = (results) => {
  addressSearchResults.innerHTML = "";

  if (!results || !Array.isArray(results) || results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "search-result-empty";
    empty.textContent = "Aucun résultat trouvé.";
    addressSearchResults.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  results.forEach((result) => {
    if (!result.lat || !result.lon || !result.display_name) return;

    const display = result.display_name;
    const details = [
      result.address?.city || result.address?.town || result.address?.village,
      result.address?.state,
      result.address?.country,
    ]
      .filter(Boolean)
      .join(" • ");

    const item = document.createElement("div");
    item.className = "search-result-item";
    item.dataset.lat = parseFloat(result.lat);
    item.dataset.lng = parseFloat(result.lon);
    item.dataset.name = display;

    const title = document.createElement("span");
    title.className = "search-result-title";
    title.textContent = display;

    const sub = document.createElement("span");
    sub.className = "search-result-sub";
    sub.textContent = details;

    const actions = document.createElement("div");
    actions.className = "search-result-actions";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-add-result";
    btn.textContent = "Ajouter";
    actions.appendChild(btn);

    item.appendChild(title);
    item.appendChild(sub);
    item.appendChild(actions);
    fragment.appendChild(item);
  });

  addressSearchResults.appendChild(fragment);
};

const searchAddress = async () => {
  const query = addressSearchInput.value.trim();
  if (query.length < 3) {
    addressSearchResults.innerHTML = "";
    return;
  }

  if (!isOnline) {
    addressSearchResults.innerHTML =
      '<div class="search-result-empty"><i class="fas fa-wifi-slash"></i> Mode hors ligne - recherche non disponible</div>';
    return;
  }

  addressSearchResults.innerHTML =
    '<div class="search-result-empty"><i class="fas fa-spinner fa-spin"></i> Recherche en cours...</div>';

  try {
    // Essayer avec le cache d'abord
    const cacheKey = `nominatim_${query}`;
    let results = await persistentCache.get(cacheKey);

    if (!results) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&accept-language=fr&q=${encodeURIComponent(
          query,
        )}`,
        { signal: controller.signal },
      );

      clearTimeout(timeout);

      if (!response.ok) {
        showToast("Service indisponible", "error");
        return;
      }

      results = await response.json();
      // Validation des résultats
      if (!Array.isArray(results)) {
        console.warn("Invalid API response");
        addressSearchResults.innerHTML = "";
        return;
      }
      // Sauvegarder dans le cache
      await persistentCache.set(cacheKey, results);
    }

    renderAddressResults(results);
  } catch (error) {
    if (error.name === "AbortError") {
      showToast("Recherche expirée", "error");
    } else {
      showToast("Erreur lors de la recherche", "error");
    }
    addressSearchResults.innerHTML = "";
  }
};

const addSearchResultPoint = (lat, lng, name) => {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  // Valider les coordonnées
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    showToast("Coordonnées invalides", "error");
    return;
  }
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    showToast("Coordonnées hors limites", "error");
    return;
  }

  const validName = (name || "").trim().substring(0, 200) || "Sans nom";

  const marker = createMarker(latNum, lngNum, validName, null, "");
  points.push({
    name: validName,
    lat: latNum,
    lng: lngNum,
    marker,
    collectionId: null,
    note: "",
  });
  updatePointsList();
  savePoints();
  map.setView([latNum, lngNum], CONFIG.focusZoom);
  marker.openPopup();
  showToast(`Point ajouté : ${name}`);
};

const clearAddressSearch = () => {
  if (addressSearchInput.value.trim() === "") {
    // Fermer le panneau si le champ est déjà vide
    nominatimSearch.style.display = "none";
    toggleNominatimBtn.style.display = "block";
    addressSearchResults.innerHTML = "";
  } else {
    // Sinon effacer le champ
    addressSearchInput.value = "";
    addressSearchResults.innerHTML = "";
    addressSearchInput.focus();
  }
};

// Fonction pour afficher les notifications toast
const showToast = (message, type = "success", duration = 3000) => {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === "success" ? "check-circle" : "exclamation-circle";
  toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("remove");
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

// Fonction pour filtrer les points par recherche
const filterPoints = () => {
  const query = searchInput.value.toLowerCase().trim();
  const cards = pointsList.querySelectorAll(".point-card");

  cards.forEach((card) => {
    const title = card.querySelector(".point-title").textContent.toLowerCase();
    if (query === "" || title.includes(query)) {
      card.classList.remove("hidden");
    } else {
      card.classList.add("hidden");
    }
  });
};

function loadCollections() {
  try {
    const saved = localStorage.getItem(CONFIG.collectionsKey);
    if (!saved) {
      collections = [];
      return;
    }
    collections = JSON.parse(saved);
    if (!Array.isArray(collections)) {
      console.warn("Collections data format invalid");
      collections = [];
    }
  } catch (error) {
    console.warn("Failed to load collections");
    collections = [];
  }
}

function saveCollections() {
  try {
    // Vérifier la limite de taille localStorage (~5MB)
    const data = JSON.stringify(collections);
    if (data.length > 4500000) {
      showToast("Espace de stockage insuffisant", "error");
      return false;
    }
    localStorage.setItem(CONFIG.collectionsKey, data);
    return true;
  } catch (error) {
    console.warn("Storage limit exceeded");
    showToast("Erreur lors de la sauvegarde", "error");
    return false;
  }
}

function createCollection(name) {
  const trimmedName = (name || "").trim();
  if (!trimmedName) {
    showToast("Nom de collection requis", "error");
    return null;
  }
  if (trimmedName.length > 100) {
    showToast("Le nom de collection ne peut pas dépasser 100 caractères", "error");
    return null;
  }

  // Vérifier que le nom ne contient que des caractères sûrs
  if (!/^[\p{L}\p{N}\s\-_.(),&'"]+$/u.test(trimmedName)) {
    showToast("Caractères non autorisés dans le nom", "error");
    return null;
  }

  // Vérifier que la collection n'existe pas déjà
  if (collections.some((c) => c.name === trimmedName)) {
    showToast("Une collection avec ce nom existe déjà", "error");
    return null;
  }

  const colorIndex = collections.length % COLLECTION_COLORS.length;
  const selectedColor = COLLECTION_COLORS[colorIndex];

  // Valider la couleur (hex color)
  if (!/^#[0-9A-F]{6}$/i.test(selectedColor)) {
    console.warn("Invalid color format");
    return null;
  }

  const collection = {
    id: Date.now().toString(),
    name: trimmedName,
    color: selectedColor,
  };
  collections.push(collection);
  if (!saveCollections()) {
    collections.pop();
    return null;
  }
  updateCollectionsUI();
  updateCollectionSelect();
  showToast(`Collection créée`, "success");
  return collection;
}

function deleteCollection(collectionId) {
  const collection = collections.find((c) => c.id === collectionId);
  if (!collection) return;

  // Retirer la collection des points
  points.forEach((p) => {
    if (p.collectionId === collectionId) {
      p.collectionId = null;
      p.marker.setIcon(new L.Icon.Default());
    }
  });

  collections = collections.filter((c) => c.id !== collectionId);
  saveCollections();
  savePoints();
  updateCollectionsUI();
  updateCollectionSelect();
  updatePointsList();
  showToast(`Collection "${collection.name}" supprimée`, "success");
}

function updateCollectionsUI() {
  collectionsList.innerHTML = "";

  if (collections.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "padding: 0.5rem 1rem; color: var(--text-secondary); font-size: 0.9rem;";
    empty.textContent = "Aucune collection";
    collectionsList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  collections.forEach((coll) => {
    const count = points.filter((p) => p.collectionId === coll.id).length;

    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "display:flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-bottom: 1px solid var(--border);";
    wrapper.dataset.collectionId = coll.id;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "collection-btn";
    if (currentCollectionFilter === coll.id) btn.classList.add("active");

    const badge = document.createElement("span");
    badge.className = "collection-badge";
    badge.style.background = coll.color;

    const nameSpan = document.createElement("span");
    nameSpan.textContent = coll.name;

    const countSpan = document.createElement("span");
    countSpan.className = "collection-count";
    countSpan.textContent = count;

    btn.appendChild(badge);
    btn.appendChild(nameSpan);
    btn.appendChild(countSpan);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "collection-delete";
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';

    wrapper.appendChild(btn);
    wrapper.appendChild(deleteBtn);
    fragment.appendChild(wrapper);
  });

  collectionsList.appendChild(fragment);
}

function updateCollectionSelect() {
  collectionSelect.innerHTML = '<option value="">--</option>';
  collections.forEach((coll) => {
    const opt = document.createElement("option");
    opt.value = coll.id;
    opt.textContent = coll.name;
    opt.style.borderLeft = `4px solid ${coll.color}`;
    collectionSelect.appendChild(opt);
  });
}

const formatCoords = (lat, lng) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });

const formatTime = (dateStr) =>
  new Date(dateStr).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

// Mise à jour du badge de compteur
const updateCounter = () => {
  const count = points.length;
  if (count > 0) {
    counterBadge.textContent = count;
    counterBadge.style.display = "block";
  } else {
    counterBadge.style.display = "none";
  }
};

const WEATHER_CODES = {
  0: { text: "Ciel dégagé", emoji: "☀️" },
  1: { text: "Principalement ensoleillé", emoji: "🌤️" },
  2: { text: "Partiellement nuageux", emoji: "⛅" },
  3: { text: "Couvert", emoji: "☁️" },
  45: { text: "Brouillard", emoji: "🌫️" },
  48: { text: "Brouillard givrant", emoji: "🌫️" },
  51: { text: "Bruine légère", emoji: "🌦️" },
  53: { text: "Bruine modérée", emoji: "🌦️" },
  55: { text: "Bruine dense", emoji: "🌧️" },
  61: { text: "Pluie légère", emoji: "🌧️" },
  63: { text: "Pluie modérée", emoji: "🌧️" },
  65: { text: "Pluie forte", emoji: "⛈️" },
  71: { text: "Neige légère", emoji: "🌨️" },
  73: { text: "Neige modérée", emoji: "❄️" },
  75: { text: "Fortes chutes de neige", emoji: "❄️" },
  80: { text: "Averses légères", emoji: "🌦️" },
  81: { text: "Averses modérées", emoji: "🌧️" },
  82: { text: "Averses violentes", emoji: "⛈️" },
  95: { text: "Orages", emoji: "⛈️" },
  96: { text: "Orages avec grêle", emoji: "⛈️" },
  99: { text: "Orages violents", emoji: "⛈️" },
};

const getWeather = (code) => WEATHER_CODES[code] || { text: "Inconnu", emoji: "🌍" };

const AQI_LEVELS = [
  { max: 50, label: "Bon", emoji: "✅", color: "#10b981" },
  { max: 100, label: "Modéré", emoji: "⚠️", color: "#f59e0b" },
  { max: 150, label: "Sensible", emoji: "😷", color: "#f97316" },
  { max: 200, label: "Mauvais", emoji: "🚫", color: "#ef4444" },
  { max: 300, label: "Très mauvais", emoji: "☢️", color: "#b91c1c" },
  { max: Infinity, label: "Dangereux", emoji: "☠️", color: "#7f1d1d" },
];

const getAQILevel = (aqi) => AQI_LEVELS.find((l) => aqi <= l.max);

const validateData = (data, requiredFields) => {
  if (!data || typeof data !== "object") return false;
  return requiredFields.every((field) => field in data);
};

// Fonction de fetch améliorée avec cache persistant et mode offline
async function fetchData(url, cacheKey, validator) {
  // Vérifier le cache d'abord
  const cached = await persistentCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Si pas de connexion, retourner les données en cache même expirées
  if (!isOnline) {
    console.warn(`Mode offline: pas de données fraîches pour ${cacheKey}`);
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status >= 500) {
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (validator && !validator(data)) {
      console.warn(`Données invalides pour ${cacheKey}`);
      return null;
    }

    // Sauvegarder dans le cache persistant
    await persistentCache.set(cacheKey, data);
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      console.warn(`Timeout API (${cacheKey})`);
    } else if (error.message.includes("HTTP")) {
      console.warn(`Service indisponible (${cacheKey}): ${error.message}`);
    } else {
      console.error(`Erreur API (${cacheKey}):`, error);
    }
    return null;
  }
}

const getWeatherData = (lat, lng) =>
  fetchData(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&daily=sunrise,sunset&timezone=auto`,
    `weather_${lat.toFixed(4)}_${lng.toFixed(4)}`,
    (d) => validateData(d, ["current_weather"]),
  );

const getGeoData = (lat, lng) =>
  fetchData(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
    `geo_${lat.toFixed(4)}_${lng.toFixed(4)}`,
    (d) => validateData(d, ["address"]),
  );

const getAirQualityData = (lat, lng) =>
  fetchData(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm10,pm2_5`,
    `air_${lat.toFixed(4)}_${lng.toFixed(4)}`,
    (d) => validateData(d, ["current"]),
  );

const getElevationData = (lat, lng) =>
  fetchData(
    `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`,
    `elevation_${lat.toFixed(4)}_${lng.toFixed(4)}`,
    (d) => validateData(d, ["results"]),
  );

function renderWeather(data) {
  if (!data?.current_weather) {
    return `<div class="error-msg">
            <i class="fas fa-${isOnline ? "cloud-slash" : "wifi-slash"}"></i>
            ${isOnline ? "Données météo indisponibles" : "Mode hors ligne - données non disponibles"}
          </div>`;
  }

  const w = data.current_weather;
  const weather = getWeather(w.weathercode);
  const sunrise = data.daily?.sunrise?.[0] ? formatTime(data.daily.sunrise[0]) : "N/A";
  const sunset = data.daily?.sunset?.[0] ? formatTime(data.daily.sunset[0]) : "N/A";

  return `
          <div class="weather-badge">${weather.emoji} ${w.temperature}°C</div>
          <div class="info-item">
            <i class="fas fa-cloud"></i>
            <strong>Conditions:</strong> ${weather.text}
          </div>
          <div class="info-item">
            <i class="fas fa-wind"></i>
            <strong>Vent:</strong> ${w.windspeed} km/h · ${Math.round(w.winddirection)}°
          </div>
          <div class="info-item">
            <i class="fas fa-sun"></i>
            <strong>Lever:</strong> ${sunrise} · <strong>Coucher:</strong> ${sunset}
          </div>
          <div class="info-item" style="font-size:0.75rem;color:var(--text-secondary);">
            <i class="fas fa-clock"></i>
            Mise à jour: ${formatDate(w.time)}
          </div>
        `;
}

function renderGeoInfo(geoData, elevationData) {
  if (!geoData?.address) {
    return `<div class="error-msg">
            <i class="fas fa-${isOnline ? "map-slash" : "wifi-slash"}"></i>
            ${isOnline ? "Informations indisponibles" : "Mode hors ligne - données non disponibles"}
          </div>`;
  }

  const addr = geoData.address;
  console.log("Données géographiques:", geoData);
  const elevation = elevationData?.results?.[0]?.elevation;

  const parts = [
    {
      icon: "map-marker-alt",
      label: "Adresse",
      value: geoData.display_name,
    },
    // { icon: "flag", label: "Pays", value: addr.country },
    // {
    //   icon: "city",
    //   label: "Ville",
    //   value: addr.city || addr.town || addr.village,
    // },
    // { icon: "envelope", label: "Code postal", value: addr.postcode },
    {
      icon: "mountain",
      label: "Altitude",
      value: elevation ? `${elevation.toFixed(1)} m` : null,
    },
  ];

  return parts
    .filter((p) => p.value)
    .map(
      (p) =>
        `<div class="info-item"><i class="fas fa-${p.icon}"></i><strong>${p.label}:</strong> ${escapeHtml(p.value)}</div>`,
    )
    .join("");
}

function formatPopupContent(
  point,
  weatherData = null,
  geoData = null,
  elevationData = null,
  airData = null,
) {
  const title = `📍 ${escapeHtml(point.name)}`;
  const coords = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  const note = point.note ? escapeHtml(point.note).replace(/\n/g, "<br>") : null;
  const noteHtml = note
    ? `<div class="info-item"><i class="fas fa-sticky-note"></i><strong>Notes</strong><br> <span style="white-space: pre-wrap;">${note}</span></div>`
    : "";

  const weather = weatherData?.current_weather
    ? getWeather(weatherData.current_weather.weathercode)
    : null;
  const temp = weatherData?.current_weather?.temperature;

  const city = geoData?.address
    ? geoData.address.city || geoData.address.town || geoData.address.village
    : null;
  const country = geoData?.address?.country;
  const postal = geoData?.address?.postcode;
  const elevation = elevationData?.results?.[0]?.elevation;

  const aqi = airData?.current?.us_aqi;
  const pm25 = airData?.current?.pm2_5;
  const pm10 = airData?.current?.pm10;
  let airHTML = "";

  if (aqi != null) {
    const level = getAQILevel(aqi);
    airHTML = `
            <div class="info-item"><strong>Air:</strong> ${Math.round(aqi)} – ${level.label}</div>
          `;
  }

  return `
          <div class="popup-card">
            <button class="popup-close-btn" data-lat="${point.lat}" data-lng="${point.lng}" aria-label="Fermer">×</button>
            <div class="popup-title">${title}</div>
            <button class="popup-share-btn" data-lat="${point.lat}" data-lng="${point.lng}" aria-label="Partager ce point" title="Partager ce point">
              <i class="fas fa-share" aria-hidden="true"></i> Partager
            </button>
            
            ${city || postal || country ? `<div class="info-item"><strong>Lieu:</strong> ${[city, postal, country].filter(Boolean).join(", ")}</div>` : ""}
            ${elevation != null ? `<div class="info-item"><strong>Alt:</strong> ${elevation.toFixed(1)} m</div>` : ""}
            ${weather ? `<div class="info-item"><strong>Météo:</strong> ${weather.emoji} ${weather.text} ${temp != null ? `(${temp}°C)` : ""}</div>` : ""}
            ${airHTML}
            ${noteHtml}
          </div>
        `;
}

function renderAirQuality(data) {
  if (!data?.current || data.current.us_aqi == null) {
    return `<div class="error-msg">
            <i class="fas fa-${isOnline ? "cloud" : "wifi-slash"}"></i>
            ${isOnline ? "Données qualité de l'air indisponibles" : "Mode hors ligne - données non disponibles"}
          </div>`;
  }

  const aqi = data.current.us_aqi;
  const pm25 = data.current.pm2_5;
  const pm10 = data.current.pm10;
  const level = getAQILevel(aqi);

  return `
          <div class="air-badge" style="background:${level.color};">
            ${level.emoji} AQI ${Math.round(aqi)} — ${level.label}
          </div>
          ${pm25 != null ? `<div class="info-item"><i class="fas fa-smog"></i><strong>PM2.5:</strong> ${pm25.toFixed(1)} µg/m³</div>` : ""}
          ${pm10 != null ? `<div class="info-item"><i class="fas fa-cloud"></i><strong>PM10:</strong> ${pm10.toFixed(1)} µg/m³</div>` : ""}
          <div class="info-item" style="font-size:0.75rem;color:var(--text-secondary);">
            <i class="fas fa-info-circle"></i>
            Index de qualité de l'air américain (US AQI)
          </div>
        `;
}

function renderCollectionOptions(selectedId = null) {
  return `
          <option value="">--</option>
          ${collections
            .map(
              (coll) =>
                `<option value="${coll.id}" ${coll.id === selectedId ? "selected" : ""}>${escapeHtml(coll.name)}</option>`,
            )
            .join("")}
        `;
}

function createPointCard(point, index) {
  const tabsId = `tabs_${index}`;
  return `
          <li class="point-card" data-index="${index}">
            <div class="point-header">
              <div style="flex:1;">
                <div class="point-title" data-index="${index}">${escapeHtml(point.name)}</div>
                <div class="point-coords">${formatCoords(point.lat, point.lng)}</div>
                </div>
                <select class="card-collection-select" data-index="${index}">
                  ${renderCollectionOptions(point.collectionId)}
                </select>
              <button class="rename-btn" data-index="${index}" aria-label="Renommer ${escapeHtml(point.name)}" title="Renommer">
                <i class="fas fa-edit"></i>
              </button>
              <button class="delete-btn" data-index="${index}" aria-label="Supprimer ${escapeHtml(point.name)}">
                <i class="fas fa-trash"></i> 
              </button>
            </div>
            <div class="point-info">
              <div class="tabs">
                <button class="tab active" data-tab="info" data-id="${tabsId}">
                  <i class="fas fa-info-circle"></i> Infos
                </button>
                <button class="tab" data-tab="weather" data-id="${tabsId}">
                  <i class="fas fa-cloud-sun"></i> Météo
                </button>
                <button class="tab" data-tab="air" data-id="${tabsId}">
                  <i class="fas fa-wind"></i> Air
                </button>
                <button class="tab" data-tab="notes" data-id="${tabsId}">
                  <i class="fas fa-sticky-note"></i> Notes
                </button>
              </div>
              <div class="tab-content active" data-content="info" data-id="${tabsId}">
                <div class="loading"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
              </div>
              <div class="tab-content" data-content="weather" data-id="${tabsId}">
                <div class="loading"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
              </div>
              <div class="tab-content" data-content="air" data-id="${tabsId}">
                <div class="loading"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
              </div>
              <div class="tab-content" data-content="notes" data-id="${tabsId}">
                <textarea maxlength="1000" class="notes-textarea" data-index="${index}" placeholder="Ajouter une note...">${escapeHtml(point.note || "")}</textarea>
              </div>
            </div>
          </li>
        `;
}

async function loadPointData(point, tabsId) {
  const { lat, lng } = point;

  // Charger en parallèle pour améliorer la performance
  const [weatherData, geoData, elevationData, airData] = await Promise.all([
    getWeatherData(lat, lng),
    getGeoData(lat, lng),
    getElevationData(lat, lng),
    getAirQualityData(lat, lng),
  ]);

  const weatherEl = document.querySelector(`[data-content="weather"][data-id="${tabsId}"]`);
  if (weatherEl) weatherEl.innerHTML = renderWeather(weatherData);

  const infoEl = document.querySelector(`[data-content="info"][data-id="${tabsId}"]`);
  if (infoEl) infoEl.innerHTML = renderGeoInfo(geoData, elevationData);

  const airEl = document.querySelector(`[data-content="air"][data-id="${tabsId}"]`);
  if (airEl) airEl.innerHTML = renderAirQuality(airData);

  // Conserver localement les dernières données récupérées pour ce point
  try {
    point._weatherData = weatherData;
    point._geoData = geoData;
    point._elevationData = elevationData;
    point._airData = airData;
  } catch (e) {
    // silent
  }

  if (point.marker) {
    point.marker.setPopupContent(
      formatPopupContent(point, weatherData, geoData, elevationData, airData),
    );
  }
}

function showPointCard(index) {
  if (pointsSection.style.display !== "block") {
    pointsSection.style.display = "block";
    toggleBtn.style.display = "none";
  }

  document.querySelectorAll(".point-card").forEach((card) => card.classList.remove("active"));
  const card = pointsList.querySelector(`.point-card[data-index="${index}"]`);
  if (card) {
    card.classList.add("active");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function updatePointsList() {
  pointsList.innerHTML = "";

  if (points.length === 0) {
    pointsSection.style.display = "none";
    toggleBtn.style.display = "none";
    updateCounter();
    return;
  }

  if (pointsSection.style.display !== "block") {
    toggleBtn.style.display = "block";
  }

  // Filtrer par collection si nécessaire
  const filteredPoints = currentCollectionFilter
    ? points.filter((p) => p.collectionId === currentCollectionFilter)
    : points;

  // Utiliser DocumentFragment pour améliorer les performances
  const fragment = document.createDocumentFragment();
  const tempDiv = document.createElement("div");

  filteredPoints.forEach((point, index) => {
    const originalIndex = points.indexOf(point);
    tempDiv.innerHTML = createPointCard(point, originalIndex);
    const card = tempDiv.firstElementChild;
    if (point.collectionId) {
      const collection = collections.find((c) => c.id === point.collectionId);
      if (collection) {
        card.setAttribute("data-collection", point.collectionId);
        card.style.setProperty("--collection-color", collection.color);
      }
    }
    fragment.appendChild(card);
    loadPointData(point, `tabs_${originalIndex}`);
  });

  pointsList.appendChild(fragment);
  attachPointEvents();
  updateCounter();
  updateCollectionsUI();
  updateRoutingSelects();
}

function attachPointEvents() {
  if (pointEventsAttached) return;
  pointEventsAttached = true;

  // Délégation d'événements pour les points - meilleure performance et gestion mémoire
  pointsList.addEventListener("click", (e) => {
    const card = e.target.closest(".point-card");
    if (!card) return;

    const index = parseInt(card.dataset.index);
    if (!Number.isInteger(index) || !points[index]) return;
    const point = points[index];

    // Clic sur titre
    if (e.target.closest(".point-title")) {
      map.setView([point.lat, point.lng], CONFIG.focusZoom);
      point.marker?.openPopup?.();
    }
    // Clic sur bouton suppression
    else if (e.target.closest(".delete-btn")) {
      if (confirm(`Êtes-vous sûr de vouloir supprimer "${point.name}" ?`)) {
        point.marker?.remove?.();
        points.splice(index, 1);
        updatePointsList();
        savePoints();
        showToast(`"${point.name}" supprimé`, "success");
      }
    }
    // Clic sur bouton renommer
    else if (e.target.closest(".rename-btn")) {
      renameInput.value = point.name;
      renameInput.placeholder = `Nouveau nom pour "${point.name}"`;
      openModal(renameModal);
      renameInput.focus();
      renameInput.select();

      // Stocker l'index du point à renommer
      renameConfirm.onclick = () => {
        const newName = renameInput.value.trim();
        if (!newName) {
          showToast("Le nom ne peut pas être vide", "error");
          return;
        }
        if (newName.length > 200) {
          showToast("Le nom ne peut pas dépasser 200 caractères", "error");
          return;
        }

        point.name = newName;
        savePoints();
        updatePointsList();
        closeModal(renameModal);
        showToast(`Point renommé en "${newName}"`, "success");

        // Mettre à jour le popup du marqueur
        if (point.marker) {
          point.marker.setPopupContent(
            formatPopupContent(
              point,
              point._weatherData,
              point._geoData,
              point._elevationData,
              point._airData,
            ),
          );
        }
      };
    }
    // Clic sur tab
    else if (e.target.closest(".tab")) {
      const tab = e.target.closest(".tab");
      const tabType = tab.dataset.tab;
      const tabsContainer = card.querySelector(".tabs");

      if (tabsContainer) {
        tabsContainer.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
      }

      const contentId = tab.dataset.id;
      card.querySelectorAll(".tab-content").forEach((tc) => {
        tc.classList.toggle(
          "active",
          tc.dataset.content === tabType && tc.dataset.id === contentId,
        );
      });
    }
  });

  pointsList.addEventListener("input", (e) => {
    const textarea = e.target.closest(".notes-textarea");
    if (!textarea) return;

    const card = textarea.closest(".point-card");
    const index = parseInt(card?.dataset.index);
    if (!Number.isInteger(index) || !points[index]) return;

    const point = points[index];
    point.note = textarea.value.substring(0, 1000);
    savePoints();

    if (point.marker) {
      const popup = point.marker.getPopup?.();
      if (popup) {
        popup.setContent(
          formatPopupContent(
            point,
            point._weatherData,
            point._geoData,
            point._elevationData,
            point._airData,
          ),
        );
        if (point.marker.isPopupOpen()) {
          point.marker.openPopup();
        }
      } else {
        point.marker.setPopupContent(
          formatPopupContent(
            point,
            point._weatherData,
            point._geoData,
            point._elevationData,
            point._airData,
          ),
        );
      }
    }
  });

  // Afficher un toast quand l'utilisateur quitte le champ de notes
  pointsList.addEventListener("focusout", (e) => {
    const textarea = e.target.closest(".notes-textarea");
    if (!textarea) return;

    const card = textarea.closest(".point-card");
    const index = parseInt(card?.dataset.index);
    if (!Number.isInteger(index) || !points[index]) return;

    showToast("Note sauvegardée", "success", 1500);
  });

  // Délégation: fermer un popup via le bouton ×
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".popup-close-btn");
    if (!btn) return;

    const lat = parseFloat(btn.dataset.lat);
    const lng = parseFloat(btn.dataset.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const p = points.find((pt) => pt.lat === lat && pt.lng === lng);
    if (p && p.marker) {
      p.marker.closePopup();
    } else if (typeof map !== "undefined" && map && map.closePopup) {
      map.closePopup();
    }
  });

  // Délégation pour changement de collection
  pointsList.addEventListener("change", (e) => {
    if (!e.target.classList.contains("card-collection-select")) return;

    const card = e.target.closest(".point-card");
    const index = parseInt(card?.dataset.index);
    if (!Number.isInteger(index) || !points[index]) return;

    const point = points[index];
    point.collectionId = e.target.value || null;
    savePoints();
    updatePointsList();
    const collection = collections.find((c) => c.id === point.collectionId);
    point.marker?.setIcon?.(getMarkerIcon(collection?.color) || new L.Icon.Default());
    showToast(
      collection
        ? `Point "${point.name}" déplacé vers ${collection.name}`
        : `Collection retirée pour "${point.name}"`,
      "success",
    );
  });
}

function savePoints() {
  try {
    const data = points.map(({ name, lat, lng, collectionId, note }) => ({
      name: (name || "").trim().substring(0, 200),
      lat: Number.isFinite(lat) ? lat : 0,
      lng: Number.isFinite(lng) ? lng : 0,
      collectionId: collectionId || null,
      note: String(note || "")
        .trim()
        .substring(0, 1000),
    }));
    const json = JSON.stringify(data);
    if (json.length > 4500000) {
      showToast("Espace de stockage insuffisant", "error");
      return false;
    }
    localStorage.setItem(CONFIG.storageKey, json);
    return true;
  } catch (error) {
    console.warn("Storage error");
    showToast("Impossible de sauvegarder les points", "error");
    return false;
  }
}

function loadPoints() {
  try {
    const saved = localStorage.getItem(CONFIG.storageKey);
    if (!saved) return;

    const parsedPoints = JSON.parse(saved);
    if (!Array.isArray(parsedPoints)) {
      console.warn("Invalid points format");
      return;
    }

    parsedPoints.forEach((pt) => {
      // Valider les données
      if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lng)) {
        return;
      }
      if (pt.lat < -90 || pt.lat > 90 || pt.lng < -180 || pt.lng > 180) {
        return;
      }
      const name = (pt.name || "").trim().substring(0, 200) || "Point";
      const note = String(pt.note || "")
        .trim()
        .substring(0, 1000);
      const marker = createMarker(pt.lat, pt.lng, name, pt.collectionId, note);
      points.push({
        name,
        lat: pt.lat,
        lng: pt.lng,
        marker,
        collectionId: pt.collectionId || null,
        note,
      });
    });
    updatePointsList();
  } catch (error) {
    console.warn("Failed to load points");
  }
}

function exportPoints() {
  // Filtrer les points selon la collection sélectionnée
  const pointsToExport = currentCollectionFilter
    ? points.filter((p) => p.collectionId === currentCollectionFilter)
    : points;

  if (pointsToExport.length === 0) {
    showToast("Aucun point à exporter", "error");
    return;
  }

  // Afficher le modal d'export
  $("export-count").textContent = pointsToExport.length;
  openModal(exportModal);

  // Gérer la confirmation
  exportConfirm.onclick = () => {
    const format = document.querySelector('input[name="export-format"]:checked').value;

    if (format === "csv") {
      exportAsCSV(pointsToExport);
    } else {
      exportAsJSON(pointsToExport);
    }

    closeModal(exportModal);
  };
}

function exportAsJSON(pointsToExport) {
  // Exporter les collections (seulement celle sélectionnée si filtrée)
  const collectionsToExport = currentCollectionFilter
    ? collections.filter((c) => c.id === currentCollectionFilter)
    : collections;

  const exportData = {
    version: 1,
    exportDate: new Date().toISOString(),
    points: pointsToExport.map(({ name, lat, lng, collectionId, note }) => ({
      name,
      lat,
      lng,
      collectionId: collectionId || null,
      note: (note || "").trim().substring(0, 1000),
    })),
    collections: collectionsToExport,
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  link.href = url;
  const collectionName = currentCollectionFilter
    ? collections.find((c) => c.id === currentCollectionFilter)?.name || "collection"
    : "all";
  link.download = `points_${collectionName}_${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  const message = currentCollectionFilter
    ? `${pointsToExport.length} point(s) de la collection exporté(s) en JSON`
    : `${pointsToExport.length} point(s) exporté(s) en JSON`;
  showToast(message, "success");
}

function exportAsCSV(pointsToExport) {
  const headers = ["Nom", "Latitude", "Longitude", "Collection", "Note"];
  const rows = pointsToExport.map((p) => {
    const collectionName = p.collectionId
      ? collections.find((c) => c.id === p.collectionId)?.name || ""
      : "";
    const note = (p.note || "").replace(/"/g, '""');
    return [
      `"${p.name.replace(/"/g, '""')}"`,
      p.lat,
      p.lng,
      `"${collectionName.replace(/"/g, '""')}"`,
      `"${note}"`,
    ];
  });

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

  const dataBlob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  link.href = url;
  const collectionName = currentCollectionFilter
    ? collections.find((c) => c.id === currentCollectionFilter)?.name || "collection"
    : "all";
  link.download = `points_${collectionName}_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  const message = currentCollectionFilter
    ? `${pointsToExport.length} point(s) de la collection exporté(s) en CSV`
    : `${pointsToExport.length} point(s) exporté(s) en CSV`;
  showToast(message, "success");
}

function importPoints() {
  const fileInput = $("import-file-input");
  fileInput.click();
}

function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Vérifier la taille du fichier (max 5MB)
  if (file.size > 5242880) {
    showToast("Fichier trop volumineux (max 5MB)", "error");
    event.target.value = "";
    return;
  }

  // Vérifier le type de fichier
  if (!file.name.endsWith(".json") && !file.name.endsWith(".csv")) {
    showToast("Format non supporté (JSON ou CSV uniquement)", "error");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      let importData;
      const fileContent = e.target.result;

      if (file.name.endsWith(".csv")) {
        importData = parseCSV(fileContent);
      } else {
        importData = JSON.parse(fileContent);
      }

      // Validation robuste
      if (!importData || !importData.points || !Array.isArray(importData.points)) {
        showToast("Format de fichier invalide", "error");
        return;
      }

      // Limiter le nombre de points (max 10000)
      if (importData.points.length > 10000) {
        showToast("Trop de points (max 10000)", "error");
        return;
      }

      // Valider les données des points
      const validPoints = importData.points.filter((pt) => {
        if (!pt || !pt.name || pt.lat === undefined || pt.lng === undefined) return false;
        if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lng)) return false;
        if (pt.lat < -90 || pt.lat > 90 || pt.lng < -180 || pt.lng > 180) return false;
        const name = (pt.name || "").trim();
        if (name.length === 0 || name.length > 200) return false;
        return true;
      });

      if (validPoints.length === 0) {
        showToast("Aucun point valide dans le fichier", "error");
        return;
      }

      // Afficher le modal d'import
      $("import-count").textContent = validPoints.length;
      openModal(importModal);

      // Gérer la confirmation
      importConfirm.onclick = () => {
        const mode = document.querySelector('input[name="import-mode"]:checked').value;
        performImport(validPoints, importData.collections || [], mode);
        closeModal(importModal);
      };
    } catch (error) {
      console.warn("File import failed");
      showToast("Erreur lors de la lecture du fichier", "error");
    }
  };

  reader.onerror = () => {
    showToast("Erreur lors de la lecture du fichier", "error");
  };

  reader.readAsText(file);
  event.target.value = "";
}

function parseCSV(csvContent) {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) throw new Error("Format CSV invalide");

  const splitCSVLine = (line) => {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current);
    return values.map((v) => v.trim());
  };

  const headerParts = splitCSVLine(lines[0]);
  const noteIndex = headerParts.findIndex((header) => header.toLowerCase().trim() === "note");

  const points = [];
  for (let i = 1; i < lines.length && i < 10001; i++) {
    const parts = splitCSVLine(lines[i]);
    if (parts.length < 3) continue;

    const name = (parts[0] || "").replace(/^"|"$/g, "").trim();
    const lat = parseFloat(parts[1]);
    const lng = parseFloat(parts[2]);
    const note = noteIndex !== -1 ? (parts[noteIndex] || "").replace(/^"|"$/g, "").trim() : "";

    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    if (name.length > 200) continue;

    points.push({
      name: name.substring(0, 200),
      lat,
      lng,
      collectionId: null,
      note: note.substring(0, 1000),
    });
  }

  return { points, collections: [] };
}

function performImport(validPoints, collectionsData, mode) {
  try {
    let importedCount = 0;

    if (mode === "replace") {
      // Supprimer tous les marqueurs existants
      points.forEach((p) => p.marker.remove());
      points = [];
    }

    // Importer les collections
    if (Array.isArray(collectionsData)) {
      collectionsData.forEach((importedColl) => {
        const exists = collections.some((c) => c.id === importedColl.id);
        if (!exists) {
          collections.push(importedColl);
        }
      });
      saveCollections();
      updateCollectionsUI();
      updateCollectionSelect();
    }

    // Importer les points
    validPoints.forEach((pt) => {
      // Vérifier les doublons si on fusionne
      const isDuplicate = points.some(
        (p) =>
          Math.abs(p.lat - pt.lat) < 0.0001 &&
          Math.abs(p.lng - pt.lng) < 0.0001 &&
          p.name === pt.name,
      );

      if (!isDuplicate) {
        const marker = createMarker(pt.lat, pt.lng, pt.name, pt.collectionId);
        points.push({ ...pt, marker });
        importedCount++;
      }
    });

    savePoints();
    updatePointsList();
    showToast(`${importedCount} point(s) importé(s) avec succès`, "success");
  } catch (error) {
    console.error("Erreur lors de l'import:", error);
    showToast("Erreur lors de l'import des données", "error");
  }
}

function createMarker(lat, lng, name, collectionId = null, note = "") {
  const collection = collectionId ? collections.find((c) => c.id === collectionId) : null;
  const icon = getMarkerIcon(collection?.color);
  const popupPoint = { name, lat, lng, note };
  const options = icon ? { icon } : {};
  return L.marker([lat, lng], options)
    .addTo(map)
    .bindPopup(formatPopupContent(popupPoint))
    .on("click", () => {
      const index = points.findIndex((p) => p.lat === lat && p.lng === lng);
      if (index !== -1) showPointCard(index);
    });
}

function updateRoutingSelects() {
  routingStart.innerHTML = '<option value="">Sélectionner le point de départ...</option>';
  routingEnd.innerHTML = '<option value="">Sélectionner la destination...</option>';

  points.forEach((point, index) => {
    const optStart = document.createElement("option");
    optStart.value = `${point.lat},${point.lng}`;
    optStart.textContent = `${escapeHtml(point.name)} (${formatCoords(point.lat, point.lng)})`;
    routingStart.appendChild(optStart);

    const optEnd = document.createElement("option");
    optEnd.value = `${point.lat},${point.lng}`;
    optEnd.textContent = `${escapeHtml(point.name)} (${formatCoords(point.lat, point.lng)})`;
    routingEnd.appendChild(optEnd);
  });
}

function calculateRoute() {
  const startVal = routingStart.value;
  const endVal = routingEnd.value;

  if (!startVal || !endVal) {
    showToast("Sélectionnez le point de départ et la destination", "error");
    return;
  }

  if (startVal === endVal) {
    showToast("Le départ et la destination ne peuvent pas être identiques", "error");
    return;
  }

  const [startLat, startLng] = startVal.split(",").map(parseFloat);
  const [endLat, endLng] = endVal.split(",").map(parseFloat);

  // Supprimer l'itinéraire précédent s'il existe
  if (routingControl) {
    map.removeControl(routingControl);
  }

  // Créer un nouvel itinéraire
  routingControl = L.Routing.control({
    waypoints: [L.latLng(startLat, startLng), L.latLng(endLat, endLng)],
    routeWhileDragging: true,
    showAlternatives: false,
    language: "fr",
    position: "bottomright",
    lineOptions: {
      styles: [
        {
          color: "#2563eb",
          opacity: 0.8,
          weight: 5,
          lineCap: "round",
          lineJoin: "round",
          dashArray: "none",
        },
      ],
    },
    altLineOptions: {
      styles: [
        {
          color: "#ccc",
          opacity: 0.8,
          weight: 4,
        },
      ],
    },
    createMarker: function (i, wp) {
      const colors = ["🟢", "🔴"];
      return L.marker(wp.latLng, {
        draggable: false,
        title: i === 0 ? "Départ" : "Destination",
      }).bindPopup(colors[i] + " " + (i === 0 ? "Départ" : "Destination"));
    },
  }).addTo(map);

  // Ajouter un bouton de fermeture au panneau d'instructions
  setTimeout(() => {
    const routingContainer = document.querySelector(".leaflet-routing-container-hideable");
    if (routingContainer) {
      // Créer le bouton de fermeture
      const closeButton = document.createElement("button");
      closeButton.innerHTML = "✕";
      closeButton.className = "routing-close-btn";
      closeButton.title = "Fermer les instructions";
      closeButton.onclick = clearRoute;

      // Ajouter le bouton au panneau
      routingContainer.style.position = "relative";
      routingContainer.appendChild(closeButton);
    }
  }, 100);

  // Forcer la langue française pour les instructions
  if (routingControl && routingControl._router) {
    routingControl._router.options.language = "fr";
    routingControl._router.options.units = "metric";
  }

  routingPanel.style.display = "none";
  showToast("Itinéraire calculé", "success");
}

function clearRoute() {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  routingPanel.style.display = "none";
  routingStart.value = "";
  routingEnd.value = "";
}

// Event listener pour la recherche de points
searchInput.addEventListener("input", debounce(filterPoints, 150));

// Event listener pour export/import
$("export-btn").addEventListener("click", exportPoints);
$("import-btn").addEventListener("click", importPoints);
$("import-file-input").addEventListener("change", handleFileImport);

// Event listener pour le routage
routingBtn.addEventListener("click", () => {
  updateRoutingSelects();
  routingPanel.style.display = routingPanel.style.display === "none" ? "block" : "none";
});

routingCalculate.addEventListener("click", calculateRoute);
routingClose.addEventListener("click", clearRoute);

// Event listener pour la recherche d'adresses Nominatim
addressSearchInput.addEventListener("input", debounce(searchAddress, 250));

addressSearchResults.addEventListener("click", (event) => {
  const resultItem = event.target.closest(".search-result-item");
  if (!resultItem) return;

  const lat = parseFloat(resultItem.dataset.lat);
  const lng = parseFloat(resultItem.dataset.lng);
  const name = resultItem.dataset.name || "Adresse trouvée";

  if (event.target.closest(".btn-add-result")) {
    // Ouvrir le formulaire d'ajout avec les coordonnées de la recherche
    if (previewMarker) previewMarker.remove();
    previewMarker = L.marker([lat, lng]).addTo(map);
    form.classList.add("visible");
    nameInput.value = name;
    nameInput.placeholder = `Nom du point (${formatCoords(lat, lng)})`;
    nameInput.focus();
    nameInput.select();
    map.setView([lat, lng], CONFIG.focusZoom);
    // Fermer le panel de recherche Nominatim
    nominatimSearch.style.display = "none";
    toggleNominatimBtn.style.display = "block";
    addressSearchResults.innerHTML = "";
    addressSearchInput.value = "";
    return;
  }

  map.setView([lat, lng], CONFIG.focusZoom);
  if (previewMarker) previewMarker.remove();
  previewMarker = L.marker([lat, lng]).addTo(map);
  previewMarker.bindPopup(`<strong>${escapeHtml(name)}</strong>`).openPopup();
});

// Event listener pour effacer la recherche
$("clear-search").addEventListener("click", () => {
  searchInput.value = "";
  filterPoints();
  searchInput.focus();
});

toggleNominatimBtn.addEventListener("click", () => {
  nominatimSearch.style.display = "block";
  toggleNominatimBtn.style.display = "none";
  addressSearchInput.focus();
});

closeNominatimBtn.addEventListener("click", (e) => {
  e.preventDefault();
  clearAddressSearch();
});

map.on("click", (e) => {
  const { lat, lng } = e.latlng;
  if (previewMarker) previewMarker.remove();

  previewMarker = L.marker([lat, lng]).addTo(map);
  form.classList.add("visible");
  nameInput.value = "";
  nameInput.placeholder = `Nom du point (${formatCoords(lat, lng)})`;
  nameInput.focus();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!previewMarker) return;

  let name = nameInput.value.trim();
  if (!name) {
    name = "Sans nom";
  } else if (name.length > 200) {
    // Limite de sécurité pour le nom
    name = name.substring(0, 200);
  }

  const { lat, lng } = previewMarker.getLatLng();

  // Valider les coordonnées
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    showToast("Coordonnées invalides", "error");
    return;
  }

  const collectionId = collectionSelect.value || null;
  const marker = createMarker(lat, lng, name, collectionId, "");

  points.push({ name, lat, lng, marker, collectionId, note: "" });
  previewMarker.remove();
  previewMarker = null;
  form.reset();
  collectionSelect.value = "";
  form.classList.remove("visible");
  updatePointsList();
  savePoints();
  showToast(`Point "${name}" ajouté`, "success");
});

$("close-form").addEventListener("click", () => {
  form.classList.remove("visible");
  if (previewMarker) {
    previewMarker.remove();
    previewMarker = null;
  }
});

$("close-points").addEventListener("click", () => {
  pointsSection.style.display = "none";
  toggleBtn.style.display = "block";
});

toggleBtn.addEventListener("click", () => {
  pointsSection.style.display = "block";
  toggleBtn.style.display = "none";
});

locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showToast("Géolocalisation non supportée", "error");
    return;
  }

  const originalHTML = locateBtn.innerHTML;
  locateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  locateBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;

      // Valider les coordonnées
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        showToast("Coordonnées invalides", "error");
        locateBtn.innerHTML = originalHTML;
        locateBtn.disabled = false;
        return;
      }

      // Vérifier que latitude et longitude sont dans les bonnes plages
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        showToast("Coordonnées hors limites", "error");
        locateBtn.innerHTML = originalHTML;
        locateBtn.disabled = false;
        return;
      }

      map.setView([latitude, longitude], 15);
      L.marker([latitude, longitude]).addTo(map).bindPopup("📍 Vous êtes ici !").openPopup();
      locateBtn.innerHTML = originalHTML;
      locateBtn.disabled = false;
      showToast("Position trouvée", "success");
    },
    (error) => {
      const messages = {
        1: "Permission refusée",
        2: "Position indisponible",
        3: "Délai d'attente dépassé",
      };
      showToast(`Erreur: ${messages[error.code] || error.message}`, "error");
      locateBtn.innerHTML = originalHTML;
      locateBtn.disabled = false;
    },
    { timeout: 10000, enableHighAccuracy: true },
  );
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const openDialog = modals.find((m) => isModalOpen(m));
    if (openDialog) {
      closeModal(openDialog);
    } else if (form.classList.contains("visible")) {
      $("close-form").click();
    } else if (pointsSection.style.display === "block") {
      $("close-points").click();
    } else if (map._popup) {
      map.closePopup();
    }
  } else if (e.key === "Tab") {
    trapModalFocus(e);
  }
});

window.addEventListener(
  "resize",
  debounce(() => map.invalidateSize(), 250),
);

collectionsToggle.addEventListener("click", () => {
  collectionsDropdown.style.display =
    collectionsDropdown.style.display === "none" ? "block" : "none";
});

closeCollectionsBtn.addEventListener("click", () => {
  collectionsDropdown.style.display = "none";
});

document.addEventListener("click", (e) => {
  if (!collectionsToggle.contains(e.target) && !collectionsDropdown.contains(e.target)) {
    collectionsDropdown.style.display = "none";
  }
});

newCollectionBtn.addEventListener("click", () => {
  collectionNameInput.value = "";
  openModal(collectionModal);
  collectionNameInput.focus();
  collectionsDropdown.style.display = "none";
});

// Délégation d'événements pour les collections
collectionsList.addEventListener("click", (e) => {
  const wrapper = e.target.closest("[data-collection-id]");
  if (!wrapper) return;

  const collectionId = wrapper.dataset.collectionId;
  const deleteBtn = e.target.closest(".collection-delete");

  if (deleteBtn) {
    const coll = collections.find((c) => c.id === collectionId);
    if (coll && confirm(`Supprimer la collection "${coll.name}" ?`)) {
      deleteCollection(collectionId);
    }
  } else {
    const collBtn = e.target.closest(".collection-btn");
    if (collBtn) {
      currentCollectionFilter = currentCollectionFilter === collectionId ? null : collectionId;
      updatePointsList();
      updateCollectionsUI();
    }
  }
});

modalCancel.addEventListener("click", () => {
  closeModal(collectionModal);
});

modalCreate.addEventListener("click", () => {
  const name = collectionNameInput.value.trim();
  if (name) {
    createCollection(name);
    closeModal(collectionModal);
  }
});

collectionNameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    modalCreate.click();
  }
});

collectionModal.addEventListener("click", (e) => {
  if (e.target === collectionModal) {
    closeModal(collectionModal);
  }
});

// Événements pour le modal de renommage
renameCancel.addEventListener("click", () => {
  closeModal(renameModal);
});

renameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    renameConfirm.click();
  }
});

renameModal.addEventListener("click", (e) => {
  if (e.target === renameModal) {
    closeModal(renameModal);
  }
});

// Événements pour le modal d'export
exportCancel.addEventListener("click", () => {
  closeModal(exportModal);
});

exportModal.addEventListener("click", (e) => {
  if (e.target === exportModal) {
    closeModal(exportModal);
  }
});

// Événements pour le modal d'import
importCancel.addEventListener("click", () => {
  closeModal(importModal);
});

importModal.addEventListener("click", (e) => {
  if (e.target === importModal) {
    closeModal(importModal);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => map.invalidateSize(), 100);
  loadCollections();
  loadPoints();
  openPointFromHash();
  updateCollectionsUI();
  updateCollectionSelect();
  updateRoutingSelects();
  updateNetworkStatus();
});

// Fonction pour mettre à jour l'indicateur de statut réseau
function updateNetworkStatus() {
  const statusBtn = $("network-status");
  if (isOnline) {
    statusBtn.style.background = "#10b981";
    statusBtn.title = "Connexion établie";
    statusBtn.innerHTML = '<i class="fas fa-wifi"></i>';
  } else {
    statusBtn.style.background = "#ef4444";
    statusBtn.title = "Mode hors ligne";
    statusBtn.innerHTML = '<i class="fas fa-wifi-slash"></i>';
  }
}

// Mettre à jour le bouton au changement de connexion
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);

const modals = [collectionModal, renameModal, exportModal, importModal];
let lastFocusedElement = null;

function isModalOpen(modal) {
  return modal.style.display !== "none";
}

function openModal(modal) {
  lastFocusedElement = document.activeElement;
  modal.style.display = "flex";
  const firstField = modal.querySelector("input, button");
  if (firstField) firstField.focus();
}

function closeModal(modal) {
  modal.style.display = "none";
  if (lastFocusedElement?.isConnected) {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;
}

function trapModalFocus(e) {
  const openDialog = modals.find((m) => isModalOpen(m));
  if (!openDialog) return;

  const focusable = openDialog.querySelectorAll(
    'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
  );
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

async function sharePoint(point) {
  const params = new URLSearchParams({
    lat: map.getCenter().lat.toFixed(5),
    lng: map.getCenter().lng.toFixed(5),
    zoom: map.getZoom(),
    open: `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`,
  });
  const url = `${window.location.origin}${window.location.pathname}#${params.toString()}`;

  try {
    if (navigator.share) {
      await navigator.share({ title: point.name, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    showToast("Lien copié dans le presse-papiers", "success");
  } catch (error) {
    if (error?.name !== "AbortError") {
      showToast("Impossible de partager le lien", "error");
    }
  }
}

document.addEventListener("click", (e) => {
  const shareBtn = e.target.closest(".popup-share-btn");
  if (!shareBtn) return;

  const lat = parseFloat(shareBtn.dataset.lat);
  const lng = parseFloat(shareBtn.dataset.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const point = points.find((pt) => pt.lat === lat && pt.lng === lng);
  if (point) {
    sharePoint(point);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service worker non enregistré:", error);
    });
  });
}
