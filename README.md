# Space Marine 2 Build Planner v0.4.0


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
