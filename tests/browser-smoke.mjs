import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "module.json"), "utf8"));
const css = manifest.styles.map((file) => readFileSync(path.join(root, file), "utf8")).join("\n");

globalThis.document = {
  createElement() {
    return {
      _text: "",
      innerHTML: "",
      set textContent(value) {
        this._text = String(value ?? "");
        this.innerHTML = this._text
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      },
      get textContent() { return this._text; }
    };
  }
};
const { buildShellHTML } = await import("../scripts/templates.js");
const shell = buildShellHTML({
  baseLabel: "Empathy",
  skillLabel: "Performance",
  baseValue: 3,
  skillValue: 4,
  gearValue: 0,
  artifactValue: "d8",
  modifierValue: -1,
  attrValues: { strength: 3, agility: 3, wits: 4, empathy: 3 },
  selectedAttr: "empathy",
  nativeSystemModifiers: [{ id: "talent", name: "Painter", display: "D8", artifactCounts: { d8: 1 }, checked: true }],
  canUseChance: true,
  quickPanelId: "quick-smoke"
});

const tempDir = mkdtempSync(path.join(os.tmpdir(), "fblrp-smoke-"));
const htmlPath = path.join(tempDir, "fixture.html");
writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:900px;height:700px;font-family:Georgia,serif;background:#333}.fblrp-shell-window{position:relative}.window-header{height:30px}.window-content{display:block}
${css}
</style></head><body>
<section class="application window-app fblrp-shell-window" data-fblrp-selected-attr="empathy">
<header class="window-header"><span class="window-title">Performance</span></header>
<div class="window-content"><form class="roll-dialog attack-dialog">${shell}</form></div>
</section>
<pre id="smoke-result"></pre>
<script>
setTimeout(() => {
  const win = document.querySelector('.fblrp-shell-window');
  const form = document.querySelector('form.roll-dialog');
  const shell = document.querySelector('.fblrp-shell');
  const active = document.querySelector('.fblrp-attr-card.is-active');
  const roll = document.querySelector('.fblrp-roll-button');
  const shellRect = shell.getBoundingClientRect();
  const rollRect = roll.getBoundingClientRect();
  const result = {
    background: getComputedStyle(win).backgroundColor,
    shellBackground: getComputedStyle(shell).backgroundColor,
    activeBorder: getComputedStyle(active).borderColor,
    width: win.getBoundingClientRect().width,
    noOverflow: win.scrollWidth <= win.clientWidth && form.scrollWidth <= form.clientWidth && shell.scrollWidth <= shell.clientWidth,
    rollCentered: Math.abs((rollRect.left + rollRect.width / 2) - (shellRect.left + shellRect.width / 2)) < 20,
    quickClosed: !document.querySelector('.fblrp-quick-panel').classList.contains('is-open')
  };
  const node = document.getElementById('smoke-result');
  node.dataset.json = JSON.stringify(result);
  node.textContent = JSON.stringify(result);
}, 50);
</script></body></html>`);

try {
  const pythonBin = resolvePythonInterpreter();
  if (!pythonBin) {
    console.log("Browser smoke skipped: no Python interpreter found (set FBLRP_PYTHON to override).");
    process.exitCode = 0;
  } else if (!hasPythonPlaywright(pythonBin)) {
    console.log(`Browser smoke skipped: Python Playwright is unavailable for '${pythonBin}'.`);
    process.exitCode = 0;
  } else {
    const chromiumPath = process.env.FBLRP_CHROMIUM ?? "";
  const python = String.raw`
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
html = Path(sys.argv[1]).read_text(encoding="utf8")
with sync_playwright() as p:
    launch = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
    if len(sys.argv) > 2 and sys.argv[2]:
        launch["executable_path"] = sys.argv[2]
    try:
        browser = p.chromium.launch(**launch)
    except Exception as error:
        print(f"FBLRP_SMOKE_SKIP: {error}", file=sys.stderr)
        raise SystemExit(77)
    page = browser.new_page(viewport={"width": 900, "height": 700})
    page.set_content(html, wait_until="load")
    page.wait_for_function("document.querySelector('#smoke-result')?.dataset?.json")
    print(page.locator("#smoke-result").get_attribute("data-json"))
    browser.close()
`;
    let output;
    try {
      output = execFileSync(pythonBin, ["-c", python, htmlPath, chromiumPath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000
      });
    } catch (error) {
      if (error?.status === 77 || String(error?.stderr ?? "").includes("FBLRP_SMOKE_SKIP:")) {
        console.log("Browser smoke skipped: Chromium is unavailable (set FBLRP_CHROMIUM to an installed executable).");
        process.exitCode = 0;
        output = null;
      } else {
        throw error;
      }
    }

    if (output != null) {
      const result = JSON.parse(output.trim());
      assert.notEqual(result.background, "rgb(255, 255, 255)");
      assert.notEqual(result.shellBackground, "rgb(255, 255, 255)");
      assert.ok(result.width <= 600.5, `window is too wide: ${result.width}`);
      assert.equal(result.noOverflow, true);
      assert.equal(result.rollCentered, true);
      assert.equal(result.quickClosed, true);
      assert.notEqual(result.activeBorder, "rgba(0, 0, 0, 0)");
      console.log(`Browser smoke passed: ${JSON.stringify(result)}`);
    }
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function resolvePythonInterpreter() {
  const candidates = [process.env.FBLRP_PYTHON, "python3", "python"].filter(Boolean);
  for (const candidate of [...new Set(candidates)]) {
    try {
      execFileSync(candidate, ["-c", "import sys"], { stdio: "ignore", timeout: 5_000 });
      return candidate;
    } catch (_error) {
      // Try the next configured or conventional interpreter name.
    }
  }
  return null;
}

function hasPythonPlaywright(pythonBin) {
  try {
    execFileSync(pythonBin, ["-c", "from playwright.sync_api import sync_playwright"], { stdio: "ignore", timeout: 5_000 });
    return true;
  } catch (_error) {
    return false;
  }
}
