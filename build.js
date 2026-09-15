#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = __dirname;
const sourcePath = path.join(root, "src", "main.js");
const classesPath = path.join(root, "src", "data", "classes.json");
const weaponsPath = path.join(root, "src", "data", "weapons.json");
const outputPath = path.join(root, "main.js");

function fail(message) {
  throw new Error(`[build] ${message}`);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { fail(`Could not read ${path.relative(root, file)}: ${error.message}`); }
}
function assert(condition, message) { if (!condition) fail(message); }
function perkId(perk) { return Array.isArray(perk) ? perk[0] : null; }

const classesData = readJson(classesPath);
const weaponsData = readJson(weaponsPath);
const classes = classesData.classes;
const dropdownOrder = classesData.dropdownOrder;
const weaponSlots = weaponsData.weaponSlots;
const heroicVariantPerks = weaponsData.heroicVariantPerks;

assert(classes && typeof classes === "object" && !Array.isArray(classes), "classes.json must contain a classes object.");
assert(Array.isArray(dropdownOrder), "classes.json must contain dropdownOrder.");
assert(weaponSlots && typeof weaponSlots === "object", "weapons.json must contain weaponSlots.");
assert(heroicVariantPerks && typeof heroicVariantPerks === "object", "weapons.json must contain heroicVariantPerks.");

const classNames = Object.keys(classes);
assert(new Set(dropdownOrder).size === dropdownOrder.length, "dropdownOrder contains duplicate classes.");
assert(dropdownOrder.length === classNames.length, "dropdownOrder must contain every class exactly once.");
for (const name of dropdownOrder) assert(classes[name], `dropdownOrder references unknown class: ${name}`);
for (const name of classNames) assert(dropdownOrder.includes(name), `Class missing from dropdownOrder: ${name}`);

let weaponCount = 0;
let perkCount = 0;
for (const [slot, slotData] of Object.entries(weaponSlots)) {
  assert(slotData && typeof slotData === "object" && slotData.weapons && typeof slotData.weapons === "object", `Invalid weapon slot: ${slot}`);
  for (const [weaponName, weapon] of Object.entries(slotData.weapons)) {
    weaponCount++;
    const variants = Array.isArray(weapon.variants) ? weapon.variants : [];
    const variantIds = variants.map(v => v && v.id).filter(Boolean);
    assert(new Set(variantIds).size === variantIds.length, `${slot}/${weaponName} contains duplicate variant IDs.`);

    const ids = [];
    for (const tier of (weapon.tiers || [])) {
      for (const perk of (tier.perks || [])) {
        const id = perkId(perk);
        assert(id, `${slot}/${weaponName} contains a perk without an ID.`);
        ids.push(id);
        perkCount++;
      }
    }
    const idSet = new Set(ids);
    assert(idSet.size === ids.length, `${slot}/${weaponName} contains duplicate perk IDs.`);
    for (const edge of (weapon.connections || [])) {
      assert(Array.isArray(edge) && edge.length === 2, `${slot}/${weaponName} contains an invalid connection.`);
      assert(idSet.has(edge[0]) && idSet.has(edge[1]), `${slot}/${weaponName} connection references a missing perk: ${edge.join(" -> ")}`);
    }
    for (const group of (weapon.exclusiveGroups || [])) {
      assert(Array.isArray(group), `${slot}/${weaponName} contains an invalid exclusive group.`);
      for (const id of group) assert(idSet.has(id), `${slot}/${weaponName} exclusive group references missing perk: ${id}`);
    }
  }
}

for (const [className, classData] of Object.entries(classes)) {
  const options = classData.weaponOptions || {};
  for (const [slot, names] of Object.entries(options)) {
    assert(weaponSlots[slot], `${className} references unknown weapon slot: ${slot}`);
    assert(Array.isArray(names), `${className}.${slot} weaponOptions must be an array.`);
    for (const name of names) assert(weaponSlots[slot].weapons[name], `${className} references missing ${slot} weapon: ${name}`);
  }
  for (const [slot, loadout] of Object.entries(classData.defaultLoadout || {})) {
    const weapon = loadout && loadout.weapon;
    assert(options[slot] && options[slot].includes(weapon), `${className} default ${slot} weapon is not allowed: ${weapon}`);
    const variants = weaponSlots[slot].weapons[weapon].variants || [];
    assert(variants.some(v => v.id === loadout.variant), `${className} default ${slot} variant does not exist: ${weapon}/${loadout.variant}`);
  }
}

for (const [slot, mappingByWeapon] of Object.entries(heroicVariantPerks)) {
  assert(weaponSlots[slot], `Heroic mapping references unknown slot: ${slot}`);
  for (const [weaponName, mappings] of Object.entries(mappingByWeapon || {})) {
    const weapon = weaponSlots[slot].weapons[weaponName];
    assert(weapon, `Heroic mapping references missing ${slot} weapon: ${weaponName}`);
    const variantIds = new Set((weapon.variants || []).map(v => v.id));
    const perkIds = new Set((weapon.tiers || []).flatMap(t => (t.perks || []).map(perkId)).filter(Boolean));
    for (const [variantId, heroicPerkId] of Object.entries(mappings || {})) {
      assert(variantIds.has(variantId), `Heroic mapping references missing variant: ${slot}/${weaponName}/${variantId}`);
      assert(perkIds.has(heroicPerkId), `Heroic mapping references missing perk: ${slot}/${weaponName}/${heroicPerkId}`);
    }
  }
}

let source = fs.readFileSync(sourcePath, "utf8");
const replacements = [
  ["__BUILD_CLASS_DATA__", JSON.stringify(classes)],
  ["__BUILD_WEAPONS__", JSON.stringify(weaponSlots)],
  ["__BUILD_CLASS_DROPDOWN_ORDER__", JSON.stringify(dropdownOrder)],
  ["__BUILD_HEROIC_VARIANT_PERKS__", JSON.stringify(heroicVariantPerks)]
];
for (const [token, value] of replacements) {
  const occurrences = source.split(token).length - 1;
  assert(occurrences === 1, `Expected exactly one ${token} token in src/main.js; found ${occurrences}.`);
  source = source.replace(token, value);
}
assert(!source.includes("__BUILD_"), "Unresolved build placeholder remains in src/main.js.");

fs.writeFileSync(outputPath, source);
execFileSync(process.execPath, ["--check", outputPath], { stdio: "inherit" });
console.log(`[build] Wrote main.js from separated source data.`);
console.log(`[build] ${classNames.length} classes, ${weaponCount} weapons, ${perkCount} weapon perk nodes validated.`);
