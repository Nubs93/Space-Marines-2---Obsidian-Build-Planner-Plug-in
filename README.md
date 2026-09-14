# Space Marine 2 Build Planner v0.5.6


## v0.5.6 — Assault class
- Added **Assault** as a selectable class with its current Starting, Core, Team, Gear, Signature, and seven Prestige perks.
- Uses the current post-Patch-12 class layout, including **Strong Strikes** in the first Gear choice group and **Hammer of Wrath** in the Prestige pool.
- Includes the current perk values introduced by later balance updates, including 15% **Squad Cohesion**, the reworked 25% **Act of Attrition**, and the current **Winged Fury** area-of-effect behavior.
- Added Assault's current weapon availability: Bolt Pistol, Heavy Bolt Pistol, Plasma Pistol, Inferno Pistol, Neo-Volkite Pistol, Bolt Carbine One-Handed, Chainsword, Thunder Hammer, Power Fist, Power Sword, and Power Axe.
- Assault has no Primary slot and defaults to **Bolt Pistol + Chainsword**.
- All Assault weapons reuse the canonical weapon definitions already present in v0.5.5; no weapon perk tree was duplicated or altered.
- No desktop/iOS layout, persistence, build sorting, or existing class/weapon behavior was changed.


## v0.5.5 — Patch 14 Thunder Hammer Heroic + Combat Knife verification
- Added the Patch 14 **Lord Executioner's Axe** as a second Heroic Thunder Hammer variant.
- Added its standalone Heroic perk, **Whirling Strike**, which replaces Aftershock with a spinning attack and grants 1 Adrenaline Surge stack when a single attack hits at least 5 enemies.
- Double-checked the **Combat Knife** graph against the current perk-tree ordering. **Shadow Stab remains the upper Artificer branch and Shoulder Bash remains the lower Artificer branch**, so their v0.5.4 positions were left unchanged.
- No desktop/iOS layout, persistence, class data, or other weapon-tree behavior was changed.


## v0.5.4 — Bulwark melee weapon perk trees
- Populated the **Thunder Hammer**, **Chainsword**, and **Power Fist** perk trees using the existing connection-graph architecture.
- Added the current Standard through Heroic perk nodes, explicit graph connections, and the existing mutually exclusive Standard starting paths for all three weapons.
- Added the **Deathwatch Power Fist** as a second Heroic Power Fist variant and added its standalone Heroic perk, **Burning Impact**, alongside **Follow-Up Shot**.
- Updated **Follow-Up Shot** to its current 200% Light Attack Damage tooltip value.
- Preserved all existing weapon variants other than the explicitly added Deathwatch Power Fist.
- No desktop/iOS layout, persistence, build sorting, class data, or other weapon-tree behavior was changed.


## v0.5.3 — Bolt Carbine One-Handed perk tree
- Populated the **Bolt Carbine One-Handed** weapon perk tree from the supplied screenshot.
- Added all 14 Standard, Master-Crafted, Artificer, and Relic perks using the existing connection-graph architecture.
- Transcribed only the explicit relationships visible in the supplied topology: two horizontal paths plus the vertical **Fast Reload ↔ Cleaving Fire** and **Perpetual Precision ↔ Tactical Precision** links.
- Preserved the two mutually exclusive Standard starting paths.
- Reused the existing seven weapon variants already introduced in v0.5.2.
- Thunder Hammer, Chainsword, and Power Fist perk trees remain intentionally blank pending source data.
- No desktop/iOS layout, persistence, build sorting, class data, or other weapon-tree behavior was changed.


## v0.5.2 — Bulwark class
- Added **Bulwark** as a selectable class with its current Starting, Core, Team, Gear, Signature, and Prestige perks.
- Preserved the established vertical Core/Gear choice-column layout and existing row-based mutual-exclusivity behavior.
- Added Bulwark's current weapon availability: Bolt Pistol, Heavy Bolt Pistol, Plasma Pistol, Neo-Volkite Pistol, Bolt Carbine One-Handed, Thunder Hammer, Chainsword, Power Fist, Power Sword, and Power Axe.
- Existing canonical weapon trees are reused wherever already present.
- Added current weapon-version lists for Bolt Carbine One-Handed, Thunder Hammer, Chainsword, and Power Fist; their **perk trees remain intentionally blank** until authoritative topology data is supplied.
- Bulwark defaults to Bolt Pistol + Chainsword.
- No desktop/iOS layout, persistence, build sorting, or existing class/weapon behavior was changed.


## v0.3.1 — selector scroll regression fix
- Fixed selecting a **weapon** resetting the planner's vertical page position to the top.
- Fixed selecting a **weapon variant** resetting the planner's vertical page position to the top.
- Weapon changes intentionally reset that weapon slot's horizontal perk-tree position to the left because a different tree is being displayed.
- Variant changes preserve the existing weapon-tree horizontal position.
- No perk data, Bolt Pistol topology, Plasma Incinerator topology, variants, or build schema changed.


## What's new
- Added the **Bolt Pistol** as a fully populated graph-based weapon tree using the supplied Wiki topology.
- Added **Bolt Pistol weapon variants**: Standard-Issue, Master-Crafted - Alpha, Master-Crafted - Beta, Salvation of Bakka, Drogos Reclamation, Gathalamor Crusade, Ophelian Liberation - Alpha, Ophelian Liberation - Beta, and Honourific Relic.
- Upgraded the weapon UI to support a **weapon version dropdown** beside the existing weapon selector. The selected version is stored in the current build.
- Upgraded the weapon-tree renderer to support **Wiki-style graph layouts** with per-weapon tier headings and explicit perk positioning.
- Preserved the **Plasma Incinerator** graph layout and added its version dropdown data in the same system.
- Preserved the existing scroll-position fixes so clicking weapon perks no longer jumps the graph left or the page to the top.
- Preserved the class perk layout improvements for Core and Gear (top-down groups).

## Bolt Pistol graph notes
- Solid/red lines from the supplied image were transcribed directly as explicit connections.
- No connection was inferred from proximity.
- The Heroic perk **Burst Fire** is included as a standalone selectable perk card because the current simplified version system does not yet make perk behavior depend on the selected weapon version.

## Current storage
Saved builds are still stored in Obsidian's plugin data for now.

## Install
Copy the `sm2-build-planner` folder into:
`.obsidian/plugins/`

Then enable it under Settings → Community plugins and run:
`Space Marine 2 Build Planner: Open Space Marine 2 Build Planner`


## v0.3.2
- Added the **Omnissian Axe** as a fully populated graph-based melee weapon tree based on the supplied Wiki screenshot.
- Added **Omnissian Axe variants**: Omnissian Axe, Master-Crafted - Alpha, Master-Crafted - Beta, Achortan Oath, Salvation of Bakka - Alpha, Salvation of Bakka - Beta, Ophelian Liberation - Alpha, Ophelian Liberation - Beta, Gathalamor Crusade, and Ultima Ratio.
- Preserved v0.3.1's page-scroll and weapon-tree scroll fixes when clicking perks or changing weapons/variants.
- The Heroic perk **Word Of The Omnissiah** is included as a standalone selectable perk card because the current simplified variant system does not yet make perk behavior depend on the selected weapon version.


## v0.3.3
- Tightened the vertical spacing in the **Bolt Pistol** graph so its two normal perk lanes use the same compact row spacing as the Plasma Incinerator.
- The Bolt Pistol Heroic perk **Burst Fire** now spans those two lanes and is vertically centered in the Heroic column without creating an extra blank row.
- Tightened the **Omnissian Axe** graph to four contiguous perk rows, matching the Plasma Incinerator's row spacing.
- Moved **Executioner** into the contiguous bottom row so it mirrors **Expose** without an extra blank track above it.
- The Omnissian Axe Heroic perk **Word Of The Omnissiah** spans the two main lanes and is vertically centered in its Heroic column.
- No perk connections, selection rules, variants, save behavior, or scroll behavior changed.


## v0.3.4
- Added the **Plasma Pistol** as a fully populated graph-based secondary weapon tree based on the supplied Wiki screenshot.
- Added **Plasma Pistol variants**: Standard-Issue, Master-Crafted - Alpha, Master-Crafted - Beta, Salvation of Bakka, Drogos Reclamation - Alpha, Gathalamor Crusade, Ophelian Liberation - Alpha, Ophelian Liberation - Beta, and Relic Battle-worn.
- Added the Heroic perk **Overcharged Plasma Coils** as a standalone selectable perk card in the current simplified variant system.
- Preserved the existing page-scroll, horizontal graph-scroll, and compact Heroic-row layout fixes.


## v0.3.5
- Added the **Heavy Bolt Pistol** as a fully populated graph-based secondary weapon tree from the supplied red-line Wiki screenshot.
- Added Heavy Bolt Pistol variants from Standard through Heroic, including **Retribution's Bequest**.
- Corrected the **Plasma Pistol** to the user-confirmed post-7.0 / 7.1 perk tree: Standard begins with **Plasma Collection** / **Fast Venting**, the replaced nodes use the current perk names, and the Artificer **Blast Radius / Efficient Charge** positions reflect the 7.1 swap.
- Added migration from the incorrect v0.3.4 Plasma Pistol node IDs so existing Plasma Pistol selections are preserved by node position where possible.
- Preserved the existing compact Heroic layout and page/horizontal-scroll fixes.


## v0.3.6
- Added the **Auto Bolt Rifle** as a fully populated graph-based Primary weapon tree using the supplied red-line Wiki screenshot.
- Added Auto Bolt Rifle variants from Standard through Relic: Standard-Issue, Master-Crafted - Alpha/Beta, Salvation of Bakka, Drogos Reclamation, Gathalamor Crusade, and Ophelian Liberation.
- Fixed the returning horizontal-scroll regression when selecting weapon perks. Graph scroll is now saved per **weapon slot + weapon**, restored only after the new graph has finished layout, and the scroll listener is attached after restoration so initialization cannot overwrite the saved position with zero.
- Preserved the existing vertical page-scroll fix when clicking perks or changing weapons/variants.


## v0.3.7
- Added the **Combat Knife** as a fully populated graph-based melee weapon tree from the supplied Wiki screenshot.
- Added Combat Knife variants from Standard through Heroic, including **Power Gladius** and **Argent Edge**.
- Removed the remaining horizontal-scroll flash when clicking a graph perk: graph perk clicks now update card states in place instead of rebuilding the entire planner view.
- Horizontal scroll is also restored synchronously when a graph is first rendered, before the browser paints, with one animation-frame safeguard.
- Preserved all existing weapon/class data, build storage, weapon-version saving, and page-scroll behavior.


## v0.3.8
- Added the **Occulus Bolt Carbine** as a fully populated graph-based primary weapon tree using the supplied red-line Wiki screenshot.
- Added all current Occulus Bolt Carbine variants from Standard through Relic.
- Uses the post-Update-7.0 perk names shown in the supplied tree, including Remote Threat, Recoupment, Divine Might, Head Hunter, Able Headshot, and Able Damage.
- Preserved v0.3.7's in-place weapon-perk card refresh, so perk clicks do not rebuild the graph or disturb horizontal scroll position.


## v0.3.9
- Added the **Bolt Rifle** and **Heavy Bolt Rifle** as fully populated graph-based primary weapon trees using the supplied red-line screenshots as the topology source.
- Added current weapon variants for both rifles, including the Bolt Rifle's Heroic **Combi-Melta** and the Heavy Bolt Rifle's Heroic **Deathwatch**.
- Preserved the v0.3.8 graph renderer, in-place perk refresh, scroll-position behavior, saved-build schema, and existing weapon data.
- This is the first release to add two complete weapon trees in one content update.


## v0.3.10
- Added the **Neo-Volkite Pistol** and **Inferno Pistol** as fully populated graph-based secondary weapon trees based on the supplied perk-tree screenshots.
- Added current weapon variants for both weapons.
- Neo-Volkite Pistol data uses the current post-8.0 Combustive Momentum duration.
- Preserved the existing in-place weapon-graph refresh behavior and scroll handling.


## v0.4.0 — Techmarine weapon milestone
- Added the **Power Sword** and **Power Axe** as fully populated graph-based melee weapon trees from the supplied perk-tree screenshots.
- Added current variants for both weapons, including Heroic variants.
- Power Sword includes both Heroic perk cards shown in the supplied current tree: **Ancient Technology** and **Nocturne's Retort**.
- Power Axe includes the Heroic **Sanguine Edge** perk.
- With these two additions, every Primary, Secondary, and Melee weapon currently listed for Techmarine now has a populated perk tree and weapon-version list.
- Preserved the existing in-place weapon graph refresh and scrolling behavior.


## v0.4.1 — Heavy class
- Added **Heavy** as the second selectable class.
- Added a class selector in the header; the selected class is stored per build.
- Added the current Heavy Core, Team, Gear, Signature, Starting, and Prestige perks.
- Class perk mutual-exclusivity remains row-based, identical to the Techmarine implementation.
- Added class-specific weapon availability. Techmarine and Heavy now reference the same canonical shared weapon definitions where applicable.
- Heavy exposes Heavy Bolt Rifle, Heavy Bolter, Heavy Plasma Incinerator, Multi-Melta, and Pyrecannon as Primary choices; Bolt Pistol, Heavy Bolt Pistol, Plasma Pistol, and Inferno Pistol as Secondary choices; Heavy has no Melee slot.
- Added current weapon-version lists for Heavy Bolter, Heavy Plasma Incinerator, Multi-Melta, and Pyrecannon. Their perk trees are intentionally left pending until authoritative tree screenshots are supplied.
- Switching a build's class resets class perks, prestige selections, and loadout to that class's defaults so selections cannot leak between classes.
- New builds inherit the currently selected class.


## v0.4.2
- Corrected Heavy **Core** choice columns and mutual exclusivity. The three vertical choice groups are now Restoration / Multi-Kill / Auxiliary Ammunition; Thermal Boost / Fortitude / Strategic Stand; and Enhanced Force / Overwhelming Power / Versatility.
- Corrected Heavy **Gear** choice columns and mutual exclusivity. The three vertical choice groups are now Adamant Will / Consecutive Execution / Emperor's Protection; Obdurate Bastion / Field Adjustment / Power Regulator; and Saving Grace / Brute Force / Wrath of the Imperium.
- Changing the class from the class dropdown now creates and immediately saves a **new build with a new ID**. The build you were previously editing remains preserved under its original class and ID.
- Class switching no longer transforms or overwrites the current saved build.
- No weapon data or weapon perk-tree behavior was changed.


## v0.4.3
- Added the **Heavy Bolter** as a full graph-based Heavy primary weapon tree from the supplied perk-tree screenshot, including the Heroic **Reinforced Guncasing** perk.
- Added the **Pyrecannon** as a full graph-based Heavy primary weapon tree from the supplied perk-tree screenshot.
- Added the **Techmarine starting perk** to the class GUI using the same always-active Starting Perk panel already used by Heavy.
- No changes were made to Heavy class perk grouping/exclusivity or class-switch save behavior from v0.4.2.


## v0.4.4
- Added the **Heavy Plasma Incinerator** as a fully populated graph-based Heavy primary weapon using the supplied perk-tree screenshot as the topology source.
- Added the **Multi-Melta** as a fully populated graph-based Heavy primary weapon using the supplied perk-tree screenshot as the topology source.
- Added the Heavy Plasma Incinerator Heroic perk **Plasma Hail** as a standalone selectable perk under the existing simplified Heroic system.
- Preserved all v0.4.3 class, save, scroll, and weapon-selection behavior.


## v0.4.5
- Added the **Sniper** class: Starting Perk, all Core/Team/Gear/Signature choices, Prestige perks, and class-specific loadout rules.
- Added Sniper loadout entries for Stalker Bolt Rifle, Instigator Bolt Carbine, Bolt Sniper Rifle, Bolt Carbine, and Las Fusil. Their perk trees are intentionally blank until authoritative tree images are supplied.
- Shared Sniper weapons (Bolt Pistol, Heavy Bolt Pistol, Inferno Pistol, and Combat Knife) reuse their existing canonical weapon data.
- Saved builds are now displayed automatically in case-insensitive alphabetical order by build name in both the header dropdown and sidebar. Renaming a build therefore repositions it automatically.
- Class switching keeps the v0.4.2 behavior: choosing another class creates a new saved build instead of converting the current build.


## v0.4.6
- Added the **Las Fusil** as a fully populated graph-based Sniper primary weapon using the supplied perk-tree image as the authoritative topology source.
- Added the current Standard, Master-Crafted, Artificer, and Relic Las Fusil variants.
- No Heroic Las Fusil is included because the current weapon family has no Heroic version.
- Preserved the existing Sniper class data, alphabetical build-list behavior, save isolation, and in-place weapon-tree scroll behavior.


## v0.5.1
- Added iOS/mobile safe-area spacing so the sticky planner header sits below the Dynamic Island/notch area.
- Confined horizontal scrolling on mobile to the weapon perk-tree viewport; the rest of the planner remains fixed to the device width.
- Preserved normal vertical scrolling for the complete planner.
- Constrained weapon/variant selectors and weapon headings to the mobile viewport so they no longer stretch to the graph's full width.
- Desktop layout and behavior are unchanged.

## v0.5.0
- Added the Sniper's final two primary weapon trees: **Instigator Bolt Carbine** and **Bolt Carbine**.
- Added the **Wrapped** Heroic Instigator Bolt Carbine with **Higher-Rate Burst**.
- Added the Patch 14 **Combi-Flamer** Heroic Bolt Carbine.

## v0.4.7
- Added the **Bolt Sniper Rifle** as a complete graph-based Sniper primary, including the Heroic **Wrapped** variant and **Replenishing Hit** perk.
- Added the **Stalker Bolt Rifle** as a complete graph-based Sniper primary using the supplied screenshot for the Standard-to-Relic topology.
- Added the Patch 14 **Deathwatch** Heroic Stalker Bolt Rifle and its **Auspex Shot** perk. The Heroic effect uses the current Hotfix 14.1 trigger/radius: 3 body shots and a 10-metre Auspex Scan area.
- Preserved existing class, save, alphabetical build-list, and in-place weapon-graph scrolling behavior.
