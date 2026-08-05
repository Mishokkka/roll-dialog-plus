import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../scripts/utils.js";

test("HTML escaping is safe in both text and quoted attribute contexts", () => {
  assert.equal(
    escapeHtml(`<&>\"'`),
    "&lt;&amp;&gt;&quot;&#39;"
  );
});
