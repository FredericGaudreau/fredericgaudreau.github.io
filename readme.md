# Site personnel

Site statique personnel hébergé avec [GitHub Pages](https://pages.github.com/).

**Lien:** https://fredericgaudreau.github.io/

## Technologie

- HTML5
- CSS3
- JavaScript (Vanilla)
- [Leaflet.js](https://leafletjs.com/) - Carte interactive
- [Font Awesome](https://fontawesome.com/) - Icônes
- [Google Fonts](https://fonts.google.com/) - Typographie (Outfit)

## Développement

```sh
npm install
npm run check     # ESLint + Prettier + html-validate + vérification syntaxe
npm run serve     # serveur local sur http://127.0.0.1:8000
```

La CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) exécute ces vérifications à chaque push et pull request.
