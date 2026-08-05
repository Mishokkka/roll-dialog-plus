import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function installMinimalDocument() {
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
}

function shellArgs(overrides = {}) {
  return {
    baseLabel: "Agility",
    skillLabel: "Move",
    baseValue: 3,
    skillValue: 2,
    gearValue: 0,
    artifactValue: "",
    modifierValue: -1,
    attrValues: { strength: 2, agility: 3, wits: 4, empathy: 2 },
    selectedAttr: "agility",
    nativeSystemModifiers: [{ id: "talent", name: "Fast Footwork", value: 1, checked: true }],
    quickPanelId: "quick-policy",
    ...overrides
  };
}

test("chance controls are omitted for players and rendered only for GM shells", async () => {
  installMinimalDocument();
  const { buildShellHTML } = await import("../scripts/templates.js");
  const player = buildShellHTML(shellArgs({ canUseChance: false }));
  const gm = buildShellHTML(shellArgs({ canUseChance: true }));

  assert.doesNotMatch(player, /data-action="calculate-chance"/);
  assert.doesNotMatch(player, /data-chance-panel/);
  assert.match(gm, /data-action="calculate-chance"/);
  assert.match(gm, /data-chance-panel/);
  assert.doesNotMatch(gm, /toggle-chance-button/);
});

test("artifact inputs cannot own or trigger chance controls", async () => {
  installMinimalDocument();
  const { buildShellHTML } = await import("../scripts/templates.js");
  const html = buildShellHTML(shellArgs({ canUseChance: true }));
  const artifactStart = html.indexOf("class=\"fblrp-artifacts\"");
  const artifactEnd = html.indexOf("</section>", artifactStart);
  const artifactBlock = html.slice(artifactStart, artifactEnd);

  assert.match(artifactBlock, /data-artifact-die-input="d8"/);
  assert.doesNotMatch(artifactBlock, /calculate-chance|toggle-chance-button|Chance/);
});

test("modifier toolbar owns Quick, custom actions and the sigma total without redundant headings", async () => {
  installMinimalDocument();
  const { buildShellHTML } = await import("../scripts/templates.js");
  const html = buildShellHTML(shellArgs({ canUseChance: true }));

  assert.doesNotMatch(html, />Modifiers</);
  assert.doesNotMatch(html, />System</);
  const toolbarStart = html.indexOf("fblrp-modifier-toolbar");
  const toolbarEnd = html.indexOf("</div>", toolbarStart);
  const toolbar = html.slice(toolbarStart, toolbarEnd);
  assert.ok(toolbar.indexOf('data-action="toggle-quick-panel"') < toolbar.indexOf('data-action="add-custom-modifier"'));
  assert.ok(toolbar.indexOf('data-action="add-custom-modifier"') < toolbar.indexOf('class="fblrp-modifier-total"'));
  assert.doesNotMatch(toolbar, /data-action="clear-quick"/);
  assert.doesNotMatch(toolbar, /data-action="calculate-chance"/);
  assert.match(toolbar, /\bCustom<\/button>/);
  assert.match(toolbar, /Σ/);
  assert.match(toolbar, /data-field="modifier-total"/);
});

test("attribute abbreviation is above the value and active colors are attribute-specific", async () => {
  installMinimalDocument();
  const { buildShellHTML } = await import("../scripts/templates.js");
  const html = buildShellHTML(shellArgs());
  assert.match(html, /data-attr="agility"[^>]*is-active|is-active[^>]*data-attr="agility"/);
  assert.match(html, /data-attr="agility"[\s\S]*?<span class="fblrp-attr-short">AGI<\/span>[\s\S]*?<strong>3<\/strong>/);

  const css = await readFile(path.join(root, "styles/components/attribute-strip.css"), "utf8");
  assert.match(css, /data-attr="strength"[^}]*--fblrp-attr-color:\s*var\(--fblrp-attr-strength\)/);
  assert.match(css, /data-attr="agility"[^}]*--fblrp-attr-color:\s*var\(--fblrp-attr-agility\)/);
  assert.match(css, /data-attr="wits"[^}]*--fblrp-attr-color:\s*var\(--fblrp-attr-wits\)/);
  assert.match(css, /data-attr="empathy"[^}]*--fblrp-attr-color:\s*var\(--fblrp-attr-empathy\)/);
});

test("chat cards are not rendered or rewritten by the module", async () => {
  const main = await readFile(path.join(root, "scripts/main.js"), "utf8");
  const chat = await readFile(path.join(root, "scripts/chat-patch.js"), "utf8");
  assert.doesNotMatch(main, /renderChatMessageHTML/);
  assert.doesNotMatch(chat, /querySelector|updateSource|flags\./);
  assert.match(chat, /fblRollDialogPlusContextConsumed/);
});

test("host compatibility CSS enforces the compact tinted unframed window", async () => {
  const css = await readFile(path.join(root, "styles/compat/fbl-v13-host.css"), "utf8");
  assert.match(css, /width:\s*min\(600px/);
  assert.match(css, /background:\s*var\(--fblrp-window-tint, #ffffff\)\s*!important/);
  assert.match(css, /border-image:\s*none\s*!important/);
  assert.match(css, /window-content::before/);
});

test("attribute tint, enlarged values and centered animated-border roll action are declared", async () => {
  const attributes = await readFile(path.join(root, "styles/components/attribute-strip.css"), "utf8");
  const footer = await readFile(path.join(root, "styles/components/footer.css"), "utf8");
  const tokens = await readFile(path.join(root, "styles/tokens.css"), "utf8");
  const modifiers = await readFile(path.join(root, "styles/components/modifier-list.css"), "utf8");
  assert.match(attributes, /\.fblrp-shell \.fblrp-attr-card strong\s*\{[^}]*font-size:\s*27px/s);
  assert.match(footer, /\.fblrp-shell \.fblrp-footer\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/s);
  assert.match(footer, /\.fblrp-shell\[data-selected-attr\] \.fblrp-footer \.fblrp-roll-button::before/);
  assert.match(footer, /conic-gradient\(/);
  assert.match(footer, /@keyframes\s+fblrp-roll-border-wave/);
  assert.doesNotMatch(footer, /filter:\s*blur|box-shadow:\s*0 0/);
  assert.match(tokens, /data-selected-attr="agility"[\s\S]*--fblrp-window-tint:\s*#dff1e4/);
  assert.match(tokens, /data-selected-attr="agility"[\s\S]*--fblrp-active-attr-tint:\s*#c2e1ca/);
  assert.match(modifiers, /\.fblrp-shell \.fblrp-modifiers-section\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  assert.match(modifiers, /\.fblrp-shell \.fblrp-modifiers-section \.fblrp-custom-block\s*\{[^}]*margin-top:\s*auto/s);
});

test("quick choices close their panel after selection", async () => {
  const source = await readFile(path.join(root, "scripts/roll-dialog.js"), "utf8");
  assert.match(source, /action === "quick-mod"[\s\S]*callbacks\.onQuick\(button\);[\s\S]*setQuickPanelOpen\(ui, false\);/);
});


test("hidden overlays and footer effects cannot create horizontal scroll ranges", async () => {
  const host = await readFile(path.join(root, "styles/compat/fbl-v13-host.css"), "utf8");
  const shell = await readFile(path.join(root, "styles/components/shell.css"), "utf8");
  const quick = await readFile(path.join(root, "styles/components/quick-panel.css"), "utf8");
  const footer = await readFile(path.join(root, "styles/components/footer.css"), "utf8");

  assert.match(host, /overflow-x:\s*hidden\s*!important/);
  assert.match(shell, /\.fblrp-shell\s*\{[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(quick, /translateX\(calc\(100%/);
  assert.doesNotMatch(footer, /inset:\s*-|scale\(1\.0[1-9]|filter:\s*blur/);
});

test("attribute color tokens have one CSS owner and JS only selects the attribute", async () => {
  const dialog = await readFile(path.join(root, "scripts/roll-dialog.js"), "utf8");
  const theme = await readFile(path.join(root, "scripts/services/attribute-theme.js"), "utf8");
  const tokens = await readFile(path.join(root, "styles/tokens.css"), "utf8");
  assert.doesNotMatch(dialog, /ATTRIBUTE_THEME_STYLES|style\.setProperty/);
  assert.match(theme, /dataset\[datasetKey\] = value/);
  assert.doesNotMatch(theme, /#[0-9a-f]{3,8}/i);
  assert.match(tokens, /data-fblrp-selected-attr="strength"/);
  assert.match(tokens, /data-fblrp-selected-attr="agility"/);
});



test("probability analysis is lazy and only runs after the GM opens Chance", async () => {
  const dialog = await readFile(path.join(root, "scripts/roll-dialog.js"), "utf8");
  assert.match(dialog, /state\.canUseChance && \(state\.chanceRevealed \|\| revealChance\)/);
  assert.match(dialog, /const analysis = state\.canUseChance && state\.chanceRevealed/);
});

test("submission hooks distinguish attempted from confirmed ChatMessage creation", async () => {
  const submitter = await readFile(path.join(root, "scripts/services/roll-submitter.js"), "utf8");
  const dialog = await readFile(path.join(root, "scripts/roll-dialog.js"), "utf8");
  const chat = await readFile(path.join(root, "scripts/chat-patch.js"), "utf8");
  const main = await readFile(path.join(root, "scripts/main.js"), "utf8");
  assert.match(submitter, /fblRollDialogPlusSubmissionAttempted/);
  assert.doesNotMatch(dialog, /fblRollDialogPlusRollSubmitted/);
  assert.match(chat, /fblRollDialogPlusRollSubmitted/);
  assert.match(chat, /consumePendingRollContext/);
  assert.match(main, /Hooks\.on\("createChatMessage"/);
  assert.doesNotMatch(main, /Hooks\.on\("preCreateChatMessage"/);
});

test("retired compact, theme and legacy Chance settings are absent", async () => {
  const settings = await readFile(path.join(root, "scripts/core/settings.js"), "utf8");
  assert.doesNotMatch(settings, /COMPACT_MODE|SHOW_CHANCE_BUTTON|THEME|compactMode|showChanceButton/);
});

test("reset, last quick setup and native header close are removed", async () => {
  const templates = await readFile(path.join(root, "scripts/templates.js"), "utf8");
  const dialog = await readFile(path.join(root, "scripts/roll-dialog.js"), "utf8");
  const host = await readFile(path.join(root, "styles/compat/fbl-v13-host.css"), "utf8");
  const settings = await readFile(path.join(root, "scripts/core/settings.js"), "utf8");

  assert.doesNotMatch(templates, /data-action="(?:reset|use-last)"/);
  assert.doesNotMatch(dialog, /readQuickMemory|writeQuickMemory|persistQuickState|useLastSetup|action === "reset"|action === "use-last"/);
  assert.doesNotMatch(settings, /REMEMBER_QUICK|QUICK_MEMORY|rememberQuick|quickMemory/);
  assert.match(host, /window-header[\s\S]*data-action="close"[\s\S]*display:\s*none\s*!important/);
});

test("attribute tints are slightly stronger in 0.6.7", async () => {
  const tokens = await readFile(path.join(root, "styles/tokens.css"), "utf8");
  assert.match(tokens, /data-selected-attr="strength"[\s\S]*--fblrp-window-tint:\s*#f6dddd/);
  assert.match(tokens, /data-selected-attr="agility"[\s\S]*--fblrp-window-tint:\s*#dff1e4/);
  assert.match(tokens, /data-selected-attr="wits"[\s\S]*--fblrp-window-tint:\s*#dfecf9/);
  assert.match(tokens, /data-selected-attr="empathy"[\s\S]*--fblrp-window-tint:\s*#ecdef4/);
});
