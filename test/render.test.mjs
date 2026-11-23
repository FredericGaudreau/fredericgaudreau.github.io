import fs from "node:fs";
import assert from "node:assert";
import vm from "node:vm";

const source = fs
  .readFileSync(new URL("../src/js/markdown.js", import.meta.url), "utf8")
  .replace(/^"use strict";/, "");
vm.runInThisContext(source, { filename: "markdown.js" });

assert.equal(typeof renderMarkdown, "function", "renderMarkdown exposé");

const cases = [
  ["# Titre", "<h1>Titre</h1>"],
  ["###### h6", "<h6>h6</h6>"],
  [
    "text **gras** et *italique* et ~~barré~~",
    "<p>text <strong>gras</strong> et <em>italique</em> et <del>barré</del></p>",
  ],
  [
    "[lien](https://exemple.com)",
    '<p><a href="https://exemple.com" rel="noopener noreferrer">lien</a></p>',
  ],
  ["[piege](javascript:alert(1))", "<p>piege (javascript:alert(1))</p>"],
  ["<img src=x onerror=alert(1)>", "<p>&lt;img src=x onerror=alert(1)&gt;</p>"],
  ["`code` et **x", "<p><code>code</code> et **x</p>"],
  ["- a\n- b", "<ul><li>a</li><li>b</li></ul>"],
  ["1. un\n2. deux", "<ol><li>un</li><li>deux</li></ol>"],
  ["- [ ] à faire\n- [x] fait", '<ul class="task-list">'],
  ["> citation", "<blockquote><p>citation</p></blockquote>"],
  ["---", "<hr />"],
  [
    "```js\nconst x = '<b>';\n```",
    '<pre><code class="language-js">const x = &#39;<b>&#39;;</code></pre>',
  ],
  ["L1\nL2", "<p>L1<br />L2</p>"],
];

const escapedScript = renderMarkdown("<script>alert(1)</script>");
assert.ok(!escapedScript.includes("<script>"), "script échappé");

let failed = 0;
for (const [md, expected] of cases) {
  const got = renderMarkdown(md).trim();
  try {
    if (expected.startsWith('<ul class="task-list">')) {
      assert.ok(got.startsWith(expected), `attendu: commence par ${expected}`);
      assert.ok(got.includes('aria-label="fait"'), "coche [x]");
    } else if (expected.includes("<b>")) {
      assert.ok(got.includes("&lt;b&gt;"), "contenu de bloc de code échappé");
    } else {
      assert.equal(got, expected);
    }
  } catch (error) {
    failed += 1;
    console.log(`FAIL: ${JSON.stringify(md)}\n  got:      ${got}\n  attendu:  ${expected}`);
  }
}

assert.ok(failed === 0, `${failed} cas(s) en échec`);
console.log("OK: rendu Markdown (régressions + XSS) validé");
