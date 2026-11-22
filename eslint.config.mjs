export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        indexedDB: "readonly",
        history: "readonly",
        location: "readonly",
        console: "readonly",
        confirm: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Blob: "readonly",
        L: "readonly",
        caches: "readonly",
        self: "readonly",
        clients: "readonly",
      },
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      sourceType: "module",
    },
  },
  {
    ignores: ["node_modules/**", "dist/**"],
  },
];
