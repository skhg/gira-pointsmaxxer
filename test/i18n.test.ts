import assert from "node:assert/strict";
import test from "node:test";

import {
  detectInitialLanguage,
  resolveLanguage,
} from "../src/i18n.js";

function createStorage(initialEntries: Record<string, string> = {}) {
  const storage = new Map(Object.entries(initialEntries));

  return {
    clear() {
      storage.clear();
    },
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    setItem(key: string, value: string) {
      storage.set(key, String(value));
    },
  };
}

test("language helpers resolve browser Portuguese and stored preferences", () => {
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: createStorage(),
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      language: "en-GB",
      languages: ["pt-PT", "en-GB"],
    },
  });

  try {
    assert.equal(resolveLanguage("pt"), "pt-PT");
    assert.equal(resolveLanguage("pt-br"), "pt-PT");
    assert.equal(resolveLanguage("en-US"), "en");
    assert.equal(detectInitialLanguage(), "pt-PT");

    globalThis.localStorage.setItem("gira-pointsmaxxer-language-v1", "en");
    assert.equal(detectInitialLanguage(), "en");
  } finally {
    if (localStorageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }

    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    } else {
      delete (globalThis as { navigator?: unknown }).navigator;
    }
  }
});
