import test from "node:test";
import assert from "node:assert/strict";
import { NativeFormBridge } from "../scripts/services/native-form-bridge.js";

function makeInput(value = "0", { disabled = false, checked = false } = {}) {
  return {
    value,
    disabled,
    checked,
    dataset: {},
    events: [],
    dispatchEvent(event) {
      this.events.push(event.type);
      return true;
    }
  };
}

function makeFixture() {
  const base = makeInput("4");
  const skill = makeInput("3");
  const gear = makeInput("2");
  const option = makeInput("1", { checked: true });
  const form = {
    submitted: 0,
    requestSubmit(button) {
      this.submitted += 1;
      this.lastButton = button;
    }
  };
  const app = { base: { name: "strength", label: "Strength", value: 4 }, gear: { value: 2 } };
  const bridge = new NativeFormBridge({
    app,
    form,
    inputs: { base, skill, gear },
    nativeSubmit: { id: "submit" },
    nativeModifiers: [{ input: option }]
  });
  return { app, form, base, skill, gear, option, bridge };
}

test("native field events are emitted only when the value changes", () => {
  const { base, bridge } = makeFixture();
  assert.equal(bridge.setValue("base", 4), false);
  assert.deepEqual(base.events, []);
  assert.equal(bridge.setValue("base", 5), true);
  assert.deepEqual(base.events, ["input", "change"]);
});

test("a submission attempt can still be restored until a chat result commits it", () => {
  const { app, form, base, option, bridge } = makeFixture();
  bridge.disableNativeOptions();
  bridge.setValue("base", 6, { dispatch: false });
  bridge.applySelectedAttribute({ key: "agility", label: "Agility" }, 6);
  assert.equal(bridge.submit(), true);
  assert.equal(form.submitted, 1);
  assert.equal(bridge.restore(), true);
  assert.equal(base.value, "4");
  assert.equal(option.disabled, false);
  assert.deepEqual(app.base, { name: "strength", label: "Strength", value: 4 });
});

test("committed submissions are not rolled back by close restoration", () => {
  const { base, bridge } = makeFixture();
  bridge.setValue("base", 6, { dispatch: false });
  bridge.submit();
  bridge.markCommitted();
  assert.equal(bridge.restore(), false);
  assert.equal(base.value, "6");
});


test("manual Gear dice synchronize with the native FBL roll handler and restore safely", () => {
  const { app, bridge } = makeFixture();
  assert.equal(bridge.setNativeGearValue(0), true);
  assert.equal(app.gear.value, 0);
  assert.equal(bridge.setNativeGearValue(0), false);
  bridge.restore();
  assert.equal(app.gear.value, 2);
});

test("native Gear state remains changed after a confirmed submission", () => {
  const { app, bridge } = makeFixture();
  bridge.setNativeGearValue(1);
  bridge.submit();
  bridge.markCommitted();
  assert.equal(bridge.restore(), false);
  assert.equal(app.gear.value, 1);
});
