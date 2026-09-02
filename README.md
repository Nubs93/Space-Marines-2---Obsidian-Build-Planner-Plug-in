# Space Marine 2 Build Planner v0.2.11

## What's new
- Fixed follow-up regression from v0.2.6: `createDiv` was destructured from
  `require("obsidian")`, but Obsidian does not export a standalone `createDiv`
  factory function from the module — it only patches `HTMLElement.prototype`
  at runtime with `createDiv`/`createEl`/etc. So the imported `createDiv` was
  `undefined`, and calling it in `perkCard()` still threw, still aborting
  `renderClass()` before any class or prestige perks rendered. `perkCard()`
  now creates its detached root node with the native `document.createElement("div")`
  (always available) and sets `className` directly; its children still use
  the patched `el.createDiv(...)` instance method, which works correctly on
  any element once Obsidian has initialized. No `createDiv` import remains.

- Fixed class perk tree failing to render at all. `perkCard()` was calling
  `document.createDiv(...)`, but Obsidian's `createDiv`/`createEl` DOM helpers
  are only added to `HTMLElement`/`DocumentFragment` (and exposed as globals
  importable from `"obsidian"`) — never to `document` itself. Calling it threw
  an exception partway through `renderClass()`, which aborted rendering and
  left the class page empty. Now imports `createDiv` from `"obsidian"` and
  uses that instead.
- Fixed selected perks showing a plain/black border instead of green.
  `.sm2-perk.active` and `.sm2-weapon-perk.active` relied on `color-mix()`
  combined with `var(--interactive-success)`; if either wasn't supported or
  defined by the active theme/Obsidian version, the background rule was
  dropped entirely and the border fell back to an unstyled color. Replaced
  with a plain `rgba()` green tint plus an explicit border/inset box-shadow
  using `var(--interactive-success, #4caf50)` (with a hardcoded fallback), so
  the selected state is unmistakably green regardless of theme or Obsidian's
  Chromium version.

- Fixed weapon perk clicks staying on the Weapons tab.
- Added real build switching through the Build selector.
- New Build creates a separate unsaved working build.
- Save prompts for a build name and saves/updates that build.
- Current changes auto-save locally.
- Saved builds can be loaded and deleted.
- Primary/Secondary/Melee weapon selections are stored per build.
- Weapon perk selections are stored per weapon slot.
- Restored and hardened the Techmarine class perk tree rendering.
- Added migration safeguards for builds created by earlier versions.
- Dropdown stacking was improved so an open selector appears above the other selectors.

## Current storage
v0.2.5 still uses Obsidian's plugin data storage (`loadData`/`saveData`). It is intentionally not yet the final vault-file storage design. A later milestone can migrate builds into visible JSON/Markdown files in the vault.

## Install
Copy the `sm2-build-planner` folder into:
`.obsidian/plugins/`

Then enable it under Settings → Community plugins and run:
`Space Marine 2 Build Planner: Open Space Marine 2 Build Planner`


## v0.2.5
- Fixed migration of builds created by older prototypes that could leave `classActive` undefined and stop the class perk renderer.
- Normalizes every stored build on startup and when switching builds.
- Added a guard around Techmarine class data rendering.


## v0.2.8
- Added class perk mutual-exclusion behavior: only one perk can be selected from a tree row; the other choices become locked until it is deselected.
- Added weapon perk prerequisites: a perk in a later tier requires a selected perk from the previous tier.
- Only one perk can be selected per weapon tier.
- Removing a weapon prerequisite automatically clears dependent later-tier selections.
- Existing saved builds are normalized on load to prevent invalid prerequisite/exclusivity combinations.
- Added locked/unavailable visual states and explanatory hover/notice feedback.


## v0.2.9
- Reworked the populated Plasma Incinerator weapon tree to include all perks shown in the current tree.
- Replaced the one-per-tier weapon rule for Plasma Incinerator with connector-based prerequisite data.
- Added data-driven `requiresAny` prerequisites and `exclusiveWith` branch choices for weapon perks.
- Added automatic cleanup of obsolete/unknown weapon perk IDs when loading older builds.
- Preserved the legacy one-per-tier behavior for the other currently populated weapon trees until their game-accurate tree images are available.


## v0.2.11
- Replaced the Plasma Incinerator's inferred `requiresAny` prerequisite model with a literal connection graph transcribed from the supplied red-line perk-tree image.
- Solid lines are now stored as explicit `connections`; no connection is inferred from spatial proximity or matching rows.
- Added per-perk progression columns so horizontal connections move left-to-right while vertical connectors in the same column can be traversed in either direction.
- Kept mutual exclusivity separate from topology through `exclusiveGroups`; the two Standard Plasma Incinerator starting perks remain alternate starting paths.
- Removing a selected perk now prunes later selections that are no longer reachable from the selected Standard root.
- Corrected the Plasma Incinerator topology, including Blast Radius ↔ Common Speed and removing the false Adamant Restoration ↔ Adamant Velocity relationship.
- Other populated weapons retain the legacy v0.2.8 tier behavior until their authoritative trees are supplied.
