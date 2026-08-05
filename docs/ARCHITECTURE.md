# Architecture notes

## Design decision

Version 0.7.1 remains a compatibility shell, not a replacement roll engine.

Forbidden Lands 13.0.5 still uses `FBLRollHandler extends FormApplication`. The handler owns Push, gear damage, consumables, attack metadata and Year Zero roll construction. FBL Roll Dialog Plus keeps the native handler alive and routes normalized UI state through `NativeFormBridge`.

## Transactional patch lifecycle

```text
render hook
  -> strict target guard
  -> prepare context and detached shell
  -> validate required controls
  -> commit native wrapper + shell
  -> install controller and close lifecycle
  -> mark form as patched
```

Any exception before the final marker triggers rollback:

- restore original fields, option states and `app.base`;
- remove synthetic fields and new shell;
- return original child nodes to the form;
- remove host classes and theme data;
- remove lifecycle listeners.

The native form is never left hidden after a partial patch.

## Data flow

```text
FBLRollHandler render
  -> resolve actor/action/item context
  -> read every native modifier options container
  -> merge DOM and actor modifiers by stable source identity
  -> preserve residual native modifier value
  -> render validated shell
  -> user edits controller state
  -> cached probability preview reads normalized payload
  -> NativeFormBridge writes changed fields only
  -> native FormApplication submit
  -> createChatMessage consumes the exact metadata-matched context after message creation
  -> bridge commits only after matching ChatMessage creation
  -> native Forbidden Lands chat card remains untouched
```

## NativeFormBridge invariants

1. Native inputs remain in the form inside a hidden compatibility owner.
2. Original values and disabled/checked states are snapshotted.
3. Writes and synthetic gear updates are equality guarded.
4. Numeric modifier is written once to `modifier`, including residual system value.
5. Manual Gear is written to `app.gear.value`; the form field contains manual + active gear bonuses, while synthetic fields preserve individual gear flavors.
6. `app.base` mutation is isolated and restored until submission commit.
7. A submit attempt is not a commit. Restoration remains possible until a matching chat message is created.
8. Cancel, Escape, window close, `app.close()` and DOM removal use the same idempotent restoration path.
9. A submit is committed only after a metadata-matched ChatMessage consumes its nonce context.

## Modifier ownership and identity

Normalized modifiers carry:

```js
{
  id,
  name,
  value,
  display,
  artifactCounts,
  gearBonus,
  checked,
  input,
  origin,
  nativeName,
  sourceUuid,
  sourceId,
  ruleKey,
  explanation
}
```

Source UUID, source ID or rule key has priority over label/value matching. A sourced actor modifier may enrich an unsourced DOM row, but it cannot collapse into a different sourced modifier that merely has the same text and value.

The sole owner of native, special and custom modifier markup is `scripts/ui/modifier-components.js`. Controllers only mutate normalized data and request a render.

## Shared UI controller

Skill and armor modes use one shared controller for:

- custom modifiers;
- quick groups and counters;
- removal and active state;
- common keyboard and panel behavior.

Mode-specific code only provides pool math, system modifier refresh and native field mapping. Dodge and Parry remain special-roll profiles layered over skill mode.

## Probability model and performance

The system pool is normalized as:

```js
const diff = rawSkill + modifier;
{
  base,
  skill: Math.max(0, diff),
  gear,
  negative: Math.max(0, -diff),
  artifacts
}
```

Positive and negative success distributions are convolved independently. Negative successes cancel positive successes. All net totals `<= 0` are folded into failure.

Probability analysis is cached by serialized pool. UI refresh is scheduled through `requestAnimationFrame`. Pools above the preview threshold skip analysis but are still submitted to the native system without an artificial dice cap.

## CSS owner-file map

```text
styles/tokens.css                        shared design and attribute-tint tokens
styles/compat/fbl-v13-host.css           Foundry/FBL host DOM and all !important
styles/components/shell.css              root shell, generic sections and columns
styles/components/attribute-strip.css    attribute selector and active colors
styles/components/dice-pool.css          base/skill/gear/artifact controls
styles/components/modifier-list.css      system/quick/custom rows and toolbar
styles/components/footer.css             Chance/ROLL/Cancel action row
styles/components/quick-panel.css        quick drawer and controls
styles/components/chance-panel.css       GM probability component
styles/variants/special-roll.css         Dodge and Parry choice fieldsets
```

Foundry and Forbidden Lands provide unlayered author CSS. Normal unlayered declarations outrank every normal declaration inside a CSS Cascade Layer before selector specificity is considered. Therefore this compatibility shell deliberately does **not** use `@layer`.

Owner rules:

1. Every component and variant selector is rooted at `.fblrp-shell`.
2. Only `compat/fbl-v13-host.css` may style Foundry-owned DOM or use `!important`.
3. A selector may have one owner file only. Exact duplicates across owner files fail static validation.
4. Tokens contain values only; components own layout and appearance.
5. Special-roll fieldset resets belong only to `variants/special-roll.css`.

## Extension surface

Public API:

```js
const api = game.modules.get("fbl-roll-dialog-plus")?.api;
```

Quick groups and special-roll profiles can be registered before a dialog opens. Integration modules should use the registry and hooks rather than DOM queries.

Prepare hooks receive cloned modifier and quick-group arrays. Invalid values or exceptions fall back to the validated core context instead of leaving partially mutated state.


## Submission semantics

```text
beforeRoll (cancelable)
  -> native requestSubmit
  -> SubmissionAttempted
  -> createChatMessage metadata match
  -> ContextConsumed
  -> RollSubmitted (confirmed, includes ChatMessage)
```

Parallel dialogs are scored by actor, token, scene, item, roll type, skill, attribute and title. Actorless fallback is used only when no exact actor-bound context exists.

## Actor resolution

Only explicit actor/document parents, speaker actor, speaker token and actor UUID are accepted. A controlled token is never borrowed as a mechanical fallback. If resolution fails, the shell retains native form values and DOM modifiers without reading unrelated Actor data.

## CSS and browser smoke

Literal attribute colors live only in `styles/tokens.css`. JavaScript selects a theme through data attributes. `npm run smoke` renders the real stylesheet set in Chromium and checks computed tint, width, horizontal overflow, centered ROLL placement and closed Quick state.
