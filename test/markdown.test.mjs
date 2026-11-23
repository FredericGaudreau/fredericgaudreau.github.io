import fs from "node:fs";
import assert from "node:assert";

const stubs = {};
function makeEl(id) {
  return {
    id,
    value: "",
    innerHTML: "",
    textContent: "",
    hidden: false,
    disabled: false,
    readOnly: false,
    dataset: {},
    classList: { add() {}, remove() {}, toggle: () => true, contains: () => false },
    setAttribute() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    appendChild() {},
    focus() {},
  };
}
globalThis.document = {
  getElementById: (id) => stubs[id] || (stubs[id] = makeEl(id)),
  createElement: () => makeEl("created"),
  addEventListener() {},
  body: makeEl("body"),
  querySelectorAll: () => [],
};
const storage = new Map([
  [
    "mapPoints",
    JSON.stringify([
      {
        name: "Sentier Nord",
        lat: 45.8924,
        lng: -74.1546,
        note: "Vue **superbe** au lever du jour.",
      },
    ]),
  ],
]);
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
};
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
globalThis.confirm = () => false;
globalThis.window = {
  innerWidth: 1200,
  addEventListener() {},
  location: {
    href: "http://127.0.0.1:8000/notes.html#point=45.89240,-74.15460",
    hash: "#point=45.89240,-74.15460",
  },
};

const boot = fs.readFileSync("src/js/markdown.js", "utf8").replace('"use strict";', "");
(0, eval)(boot);
const app = fs.readFileSync("src/js/notes.js", "utf8").replace('"use strict";', "");
(0, eval)(app);

assert.equal(stubs["linked-point-name"].textContent, "Sentier Nord", "bannière nom du point");
assert.equal(stubs["linked-banner"].hidden, false, "bannière visible");
assert.equal(stubs["markdown-input"].value, "Vue **superbe** au lever du jour.", "note chargée");
assert.equal(
  stubs["markdown-preview"].innerHTML.includes("<strong>superbe</strong>"),
  true,
  "aperçu rendu",
);
assert.equal(stubs["note-title"].readOnly, true, "titre en lecture seule");
assert.equal(stubs["new-note"].disabled, true, "nouvelle note désactivée");

stubs["markdown-input"].value = "Note modifiée avec `code`";
stubs["markdown-input"].value !== "Vue **superbe** au lever du jour.";
saveCurrent();
const updated = JSON.parse(storage.get("mapPoints"));
assert.equal(updated[0].note, "Note modifiée avec `code`", "note écrite vers mapPoints");

console.log("OK: mode lié + parseur partagé validés");
