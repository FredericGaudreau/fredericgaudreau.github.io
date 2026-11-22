# Site personnel

Site statique personnel hébergé avec [GitHub Pages](https://pages.github.com/).

**Lien :** https://fredericgaudreau.github.io/

## Outils

- **Carte** ([`map.html`](map.html)) — carte interactive Leaflet : points d'intérêt avec collections, météo, altitude, qualité de l'air, recherche d'adresse, itinéraires, partage par URL et export JSON/CSV/Markdown
- **Notes** ([`notes.html`](notes.html)) — éditeur Markdown avec rendu en direct, lié aux points de la carte, export `.md`
- Parseur Markdown partagé sans dépendance ([`src/js/markdown.js`](src/js/markdown.js))

## Technologie

- HTML5, CSS3, JavaScript (Vanilla, sans framework)
- [Leaflet.js](https://leafletjs.com/) 1.9.4 — carte interactive
- [Font Awesome](https://fontawesome.com/) 6.4.0 — icônes
- [Google Fonts](https://fonts.google.com/) — typographie (Outfit)
- PWA : [manifest](manifest.webmanifest) + service worker ([`sw.js`](sw.js), pré-cache et mode hors ligne)

## Structure

```
index.html          accueil
map.html            application carte (outil principal)
notes.html          éditeur de notes Markdown
carte.html          page d'information de la carte
apropos.html        à propos
404.html            page introuvable
manifest.webmanifest  manifeste PWA
sw.js               service worker
src/
  js/               scripts (markdown partagé, carte, notes, composants)
  css/              styles
  components/       fragments header / footer
  images/           favicons
test/               tests unitaires Node
```

## Développement

```sh
npm install
npm run check     # tests unitaires + ESLint + Prettier + html-validate + syntaxe
npm test          # tests unitaires uniquement
npm run serve     # serveur local sur http://127.0.0.1:8000
```

La CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) exécute ces vérifications à chaque push et pull request.
