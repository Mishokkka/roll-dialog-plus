import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

async function collectCss(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collectCss(full));
    else if (entry.name.endsWith(".css")) output.push(full);
  }
  return output;
}

function selectorsOf(source) {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [];
  for (const match of stripped.matchAll(/([^{}]+)\{/g)) {
    const prelude = match[1].trim();
    if (!prelude || prelude.startsWith("@") || /^(?:from|to|[\d\s%,.]+)$/.test(prelude)) continue;
    selectors.push(...splitSelectorList(prelude));
  }
  return selectors;
}

function splitSelectorList(prelude) {
  const output = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < prelude.length; index += 1) {
    const character = prelude[index];
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      const selector = prelude.slice(start, index).trim();
      if (selector) output.push(selector);
      start = index + 1;
    }
  }
  const selector = prelude.slice(start).trim();
  if (selector) output.push(selector);
  return output;
}

test("module CSS is unlayered so unlayered Foundry system rules cannot outrank it", async () => {
  const files = await collectCss(path.join(root, "styles"));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /@layer\b/, path.relative(root, file));
    assert.equal((source.match(/\{/g) ?? []).length, (source.match(/\}/g) ?? []).length, path.relative(root, file));
  }
});

test("component and variant owner files scope every selector to the module shell", async () => {
  const ownerFiles = [
    "styles/components/shell.css",
    "styles/components/attribute-strip.css",
    "styles/components/dice-pool.css",
    "styles/components/modifier-list.css",
    "styles/components/footer.css",
    "styles/components/quick-panel.css",
    "styles/components/chance-panel.css",
    "styles/variants/special-roll.css"
  ];
  for (const relative of ownerFiles) {
    const source = await readFile(path.join(root, relative), "utf8");
    for (const selector of selectorsOf(source)) {
      assert.match(selector, /\.fblrp-shell\b/, `${relative}: ${selector}`);
    }
  }
});

test("component owners do not duplicate exact selectors across files", async () => {
  const ownerFiles = [
    "styles/components/shell.css",
    "styles/components/attribute-strip.css",
    "styles/components/dice-pool.css",
    "styles/components/modifier-list.css",
    "styles/components/footer.css",
    "styles/components/quick-panel.css",
    "styles/components/chance-panel.css",
    "styles/variants/special-roll.css"
  ];
  const seen = new Map();
  for (const relative of ownerFiles) {
    const source = await readFile(path.join(root, relative), "utf8");
    for (const selector of new Set(selectorsOf(source))) {
      const previous = seen.get(selector);
      assert.equal(previous, undefined, `${selector} is owned by both ${previous} and ${relative}`);
      seen.set(selector, relative);
    }
  }
});

test("layout responsibilities are split between dedicated owner files", async () => {
  const shell = await readFile(path.join(root, "styles/components/shell.css"), "utf8");
  const attributes = await readFile(path.join(root, "styles/components/attribute-strip.css"), "utf8");
  const dice = await readFile(path.join(root, "styles/components/dice-pool.css"), "utf8");
  const footer = await readFile(path.join(root, "styles/components/footer.css"), "utf8");
  const special = await readFile(path.join(root, "styles/variants/special-roll.css"), "utf8");

  assert.match(shell, /\.fblrp-shell \.fblrp-two-columns\s*\{[^}]*display:\s*grid/s);
  assert.doesNotMatch(shell, /\.fblrp-attr-card\b/);
  assert.doesNotMatch(shell, /\.fblrp-stepper\b/);
  assert.doesNotMatch(shell, /\.fblrp-roll-button\b/);
  assert.match(attributes, /\.fblrp-shell \.fblrp-attr-grid\s*\{[^}]*display:\s*grid/s);
  assert.match(dice, /\.fblrp-shell \.fblrp-stepper\s*\{[^}]*display:\s*grid/s);
  assert.match(footer, /\.fblrp-shell \.fblrp-footer\s*\{[^}]*display:\s*grid/s);
  assert.match(footer, /@keyframes\s+fblrp-roll-border-wave/);
  assert.match(special, /\.fblrp-special-choice\s*\{[^}]*margin:\s*1px 0 0/s);
  assert.match(special, /\.fblrp-special-choice-groups\s*\{[^}]*gap:\s*1px/s);
});

test("retired and duplicate UI selectors are absent", async () => {
  const files = await collectCss(path.join(root, "styles"));
  const css = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  for (const retired of [
    "fblrp-artifacts-heading",
    "fblrp-chance-toggle-label",
    "fblrp-is-system-block",
    "fblrp-mod-block-title",
    "fblrp-switch",
    "fblrp-title-actions"
  ]) {
    assert.doesNotMatch(css, new RegExp(`\\.${retired}\\b`));
  }
});
