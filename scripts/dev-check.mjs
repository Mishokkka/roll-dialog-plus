import { spawnSync } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const expectedVersion = "0.7.0";
const moduleJson = JSON.parse(await readFile(path.join(root, "module.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const constantsSource = await readFile(path.join(root, "scripts/constants.js"), "utf8");
const en = JSON.parse(await readFile(path.join(root, "lang/en.json"), "utf8"));
const ru = JSON.parse(await readFile(path.join(root, "lang/ru.json"), "utf8"));
const prefix = "FBL_ROLL_DIALOG_PLUS";

if (moduleJson.version !== expectedVersion) errors.push(`module.json version is ${moduleJson.version}, expected ${expectedVersion}`);
if (packageJson.version !== expectedVersion) errors.push(`package.json version is ${packageJson.version}, expected ${expectedVersion}`);
if (!constantsSource.includes(`MODULE_VERSION = "${expectedVersion}"`)) errors.push("scripts/constants.js version is not synchronized");
if (moduleJson.relationships?.systems?.[0]?.id !== "forbidden-lands") errors.push("Forbidden Lands system relationship is missing");
if (!en[prefix] || !ru[prefix]) errors.push("Language root is missing");

const referencedFiles = [
  ...(moduleJson.esmodules ?? []),
  ...(moduleJson.styles ?? []),
  ...(moduleJson.languages ?? []).map((entry) => entry.path),
  moduleJson.readme,
  moduleJson.license,
  moduleJson.changelog
].filter(Boolean);
for (const relative of referencedFiles) {
  try {
    await access(path.join(root, relative));
  } catch {
    errors.push(`module.json references a missing file: ${relative}`);
  }
}

const scripts = await collect(path.join(root, "scripts"), [".js", ".mjs"]);
const tests = await collect(path.join(root, "tests"), [".js", ".mjs"]);
for (const file of [...scripts, ...tests]) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) errors.push(`Syntax check failed for ${path.relative(root, file)}: ${result.stderr.trim()}`);
}
const keyPattern = /(?:localize|format)\(\s*["']([^"']+)["']/g;
for (const file of scripts) {
  if (file.endsWith("dev-check.mjs")) continue;
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(keyPattern)) {
    for (const [name, dictionary] of [["en", en], ["ru", ru]]) {
      if (get(dictionary[prefix], match[1]) === undefined) errors.push(`${name}: missing ${match[1]} used by ${path.relative(root, file)}`);
    }
  }
}

const styles = await collect(path.join(root, "styles"), [".css"]);
const ownedSelectorFiles = new Map();
for (const file of styles) {
  const source = await readFile(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const importantCount = (source.match(/!important\b/g) ?? []).length;
  if (importantCount && !relative.startsWith("styles/compat/")) {
    errors.push(`${relative}: ${importantCount} !important declarations outside the compatibility owner file`);
  }

  // Foundry and the Forbidden Lands system ship unlayered CSS. Unlayered
  // author rules outrank every normal declaration inside a cascade layer,
  // regardless of selector specificity. Component styles therefore remain
  // deliberately unlayered and strictly scoped to .fblrp-shell.
  if (/@layer\b/.test(source)) {
    errors.push(`${relative}: cascade layers are forbidden for this compatibility patch`);
  }

  const openBraces = (source.match(/\{/g) ?? []).length;
  const closeBraces = (source.match(/\}/g) ?? []).length;
  if (openBraces !== closeBraces) {
    errors.push(`${relative}: unbalanced CSS braces (${openBraces} opening, ${closeBraces} closing)`);
  }

  if (relative.startsWith("styles/components/") || relative.startsWith("styles/variants/")) {
    for (const selector of collectCssSelectors(source)) {
      if (!selector.includes(".fblrp-shell")) {
        errors.push(`${relative}: selector is outside its shell owner: ${selector}`);
      }
      const previousOwner = ownedSelectorFiles.get(selector);
      if (previousOwner && previousOwner !== relative) {
        errors.push(`${selector}: duplicated across owner files ${previousOwner} and ${relative}`);
      } else {
        ownedSelectorFiles.set(selector, relative);
      }
    }
  }
}

if ((moduleJson.styles ?? []).includes("styles/fbl-roll-dialog-plus.css")) {
  errors.push("module.json still references the retired monolithic stylesheet");
}
if ((moduleJson.styles ?? []).includes("styles/index.css")) {
  errors.push("module.json still references the retired cascade-layer index");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  const importantCount = await countImportant(styles);
  console.log(`Static metadata/i18n/syntax/CSS owner check passed (${scripts.length - 1} source files, ${tests.length} test files, ${styles.length} stylesheets, ${importantCount} compatibility !important declarations).`);
}

function collectCssSelectors(source) {
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

async function collect(directory, extensions) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collect(full, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) output.push(full);
  }
  return output;
}

async function countImportant(files) {
  let count = 0;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    count += (source.match(/!important\b/g) ?? []).length;
  }
  return count;
}

function get(object, dotted) {
  return dotted.split(".").reduce((value, key) => value?.[key], object);
}
