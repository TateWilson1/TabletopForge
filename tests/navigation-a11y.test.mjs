import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

test("keyboard users can skip directly to the main content", () => {
  assert.match(layout, /href="#main-content"/);
  assert.match(layout, /Skip to main content/);
  assert.match(layout, /id="main-content"/);
  assert.match(layout, /tabIndex=\{-1\}/);
});

test("primary navigation is named and shows keyboard focus", () => {
  assert.match(layout, /<nav aria-label="Main navigation"/);
  assert.match(layout, /focus-visible:ring-2/);
});
