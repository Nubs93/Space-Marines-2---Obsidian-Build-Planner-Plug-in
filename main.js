const { Plugin, Notice, PluginSettingTab, Setting, Modal } = require("obsidian");

const BUILD_STORAGE_FOLDER = "SM2 Build Planner";
const BUILD_STORAGE_FILE = `${BUILD_STORAGE_FOLDER}/builds.json`;
const BUILD_STORAGE_SCHEMA_VERSION = 1;

function perkId(perk){ return Array.isArray(perk) ? perk[0] : null; }
function perkName(perk){ return Array.isArray(perk) ? (perk[1] || "Unnamed Perk") : "Unnamed Perk"; }
function perkDesc(perk){ return Array.isArray(perk) ? (perk[2] || "") : ""; }
function perkMeta(perk){ return Array.isArray(perk) && perk[3] && typeof perk[3] === "object" ? perk[3] : {}; }
function allWeaponPerks(tiers){
  const result=[];
  for(const tier of (tiers || [])) for(const perk of (tier?.perks || [])) if(Array.isArray(perk)) result.push(perk);
  return result;
}
function perkColumn(perk){ const c=Number(perkMeta(perk).column); return Number.isFinite(c) ? c : 0; }
function perkRow(perk){ const r=Number(perkMeta(perk).row); return Number.isFinite(r) ? r : 0; }
function weaponPerkMap(weapon){ return new Map(allWeaponPerks(weapon?.tiers || []).map(p=>[perkId(p),p])); }
function weaponAdjacency(weapon){
  const adj=new Map();
  for(const id of weaponPerkMap(weapon).keys()) adj.set(id,new Set());
  for(const edge of (weapon?.connections || [])){
    if(!Array.isArray(edge) || edge.length!==2) continue;
    const [a,b]=edge; if(!adj.has(a) || !adj.has(b)) continue;
    adj.get(a).add(b); adj.get(b).add(a);
  }
  return adj;
}

const CLASS_DATA = {
  Techmarine: {
    startingPerk:["techmarine_tarantula_sentry","Tarantula Sentry Gun","You can detect and activate Tarantula Sentry Guns. They automatically attack nearby enemies until they run out of ammunition or are destroyed."],
    categories: [
      {
        name: "Core — Combat",
        rows: [
          [
            ["explosive_enfilade","Explosive Enfilade","After using Equipment, ranged damage increases by 15% for 10 seconds."],
            ["precision_enhancement","Precision Enhancement","Servo-Gun locks onto a single target and fires powerful precision shots."],
            ["plasma_enhancement","Plasma Enhancement","Servo-Gun fires exploding Plasma projectiles."]
          ],
          [
            ["arc_cleave","Arc Cleave","Charged melee attacks deal increased damage."],
            ["methodical_destruction","Methodical Destruction","Enemies damaged by Equipment take increased damage for 10 seconds."],
            ["omnissian_axe_deflection","Omnissian Axe Deflection","After a Perfect Parry or Perfect Block, ranged damage taken is reduced for a duration."]
          ],
          [
            ["explosives_adept","Explosives Adept","Equipment damage is increased."],
            ["push_the_advantage","Push the Advantage","After a Finisher, your melee weapon deals increased damage for 15 seconds."],
            ["long_range_barrage","Long-Range Barrage","Ranged damage at ranges greater than 20 metres increases."]
          ]
        ]
      },
      {
        name: "Team",
        rows: [
          [
            ["reinforced_position","Reinforced Position","Squad members near an active Tarantula Sentry Gun take less damage and deal more damage."],
            ["battlefield_repairs","Battlefield Repairs","Medicae Stimms fully regenerate squad Armour and grant an additional Armour Segment."],
            ["combat_squad_resupply","Combat Squad Resupply","Squad members gain 1 additional Equipment, except Melta Bomb."]
          ]
        ]
      },
      {
        name: "Gear",
        rows: [
          [
            ["designated_target","Designated Target","Enemies hit by the Servo-Gun take increased damage for 10 seconds."],
            ["inexorable_salvo","Inexorable Salvo","While Servo-Gun is active, Heavy Hits do not make you lose control and you cannot be knocked back."],
            ["synergistic_arsenal","Synergistic Arsenal","Servo-Gun recharge rate increases when near a Tarantula Sentry Gun."]
          ],
          [
            ["augmented_ammunition_feed","Augmented Ammunition Feed","Servo-Gun recharges faster."],
            ["augmented_tarantula","Augmented Tarantula","Tarantula Sentry Gun damage and ammunition increase."],
            ["replenishing_salvo","Replenishing Salvo","Servo-Gun kills can restore Equipment, with a cooldown."]
          ],
          [
            ["counteroffensive_protocols","Counteroffensive Protocols","After using the Servo-Gun, melee damage increases for 10 seconds."],
            ["fortifying_salvo","Fortifying Salvo","Servo-Gun kills restore 1 Armour Segment, with a cooldown."],
            ["strategic_gun_strike","Strategic Gun Strike","Servo-Gun targets Majoris-level or higher enemies and deals more damage beyond 20 metres."]
          ]
        ]
      },
      {
        name: "Signature — Ability",
        rows: [
          [
            ["decapitating_stratagem","Decapitating Stratagem","Killing or incapacitating Majoris-level or higher enemies with the Servo-Gun regenerates its Ability Charge, with a cooldown."],
            ["lethal_perimeter","Lethal Perimeter","Servo-Gun marks a zone and automatically attacks enemies entering it using less energy per shot."],
            ["omnissiahs_fury","Omnissiah's Fury","Servo-Gun shots set enemies on fire."]
          ]
        ]
      }
    ],
    prestige: [
      ["chained_headshots","Chained Headshots","Headshot damage increases with consecutive headshots."],
      ["indomitable","Indomitable","Become invulnerable while activating the Tarantula Sentry Gun."],
      ["stimm_boost","Stimm Boost","Medicae Stimms restore more Health."],
      ["volatile_sentry","Volatile Sentry","Tarantula Sentry Gun explosion damage and radius increase."],
      ["blast_radius","Blast Radius","Equipment Damage Radius increases."],
      ["defensive_stance","Defensive Stance","If surrounded by 5+ enemies, ranged damage taken is reduced."],
      ["furious_gun_strike","Furious Gun Strike","After Gun Strike, melee damage increases briefly."]
    ]
  }
};

// Class definitions reference canonical shared weapon names. Weapon perk trees
// remain global in WEAPONS and selected weapon/perk state remains build-local.
CLASS_DATA.Techmarine.weaponOptions={
  primary:["Plasma Incinerator","Auto Bolt Rifle","Bolt Rifle","Heavy Bolt Rifle","Occulus Bolt Carbine"],
  secondary:["Bolt Pistol","Heavy Bolt Pistol","Plasma Pistol","Inferno Pistol","Neo-Volkite Pistol"],
  melee:["Omnissian Axe","Combat Knife","Power Sword","Power Axe"]
};
CLASS_DATA.Techmarine.defaultLoadout={
  primary:{weapon:"Plasma Incinerator",variant:"standard_issue"},
  secondary:{weapon:"Bolt Pistol",variant:"standard_issue"},
  melee:{weapon:"Omnissian Axe",variant:"standard_issue"}
};

CLASS_DATA.Heavy={
  startingPerk:["heavy_iron_halo","Iron Halo","When Iron Halo is active, all Squad Members within 50 metres take 10% less Damage from Ranged Attacks."],
  categories:[
    {name:"Core",rows:[
      [
        ["heavy_restoration","Restoration","Killing 10 enemies within 5 seconds restores 1 Armour Segment. Cooldown is 15 seconds."],
        ["heavy_multi_kill","Multi-Kill","Killing 5 or more enemies with one shot from a Multi-Melta restores Ammo by 1."],
        ["heavy_auxiliary_ammunition","Auxiliary Ammunition","When your Primary Weapon is out of Ammo, killing 7 enemies within 6 seconds restores Ammo Reserve by 20%. Cooldown is 30 seconds."]
      ],
      [
        ["heavy_thermal_boost","Thermal Boost","When a Ranged Weapon is 50% Overheated or has 50% ammo remaining in its Magazine, Ranged Damage increases by 15%."],
        ["heavy_fortitude","Fortitude","Health increases by 30%."],
        ["heavy_strategic_stand","Strategic Stand","While in Heavy Stance, dealing Damage restores 15% more Contested Health; you do not lose control upon taking Heavy Hits and cannot be knocked back, but you cannot move."]
      ],
      [
        ["heavy_enhanced_force","Enhanced Force","Melee Damage increases by 30%."],
        ["heavy_overwhelming_power","Overwhelming Power","When Iron Halo is active, all Squad Members within 10 metres deal 10% more Ranged Damage."],
        ["heavy_versatility","Versatility","After switching Weapons, your Secondary Weapon deals 20% more Damage. The effect lasts until reloading or switching back to your Primary Weapon."]
      ]
    ]},
    {name:"Team",rows:[[
      ["heavy_encompassing_aegis","Encompassing Aegis","All Squad Members take 25% less Damage from Ranged Attacks."],
      ["heavy_additional_supplies","Additional Supplies","Ammo Capacity for all Squad Members' Weapons increases by 25%."],
      ["heavy_bonds_of_brotherhood","Bonds of Brotherhood","Reviving a Squad Member restores them to full Health."]
    ]]},
    {name:"Gear",rows:[
      [
        ["heavy_adamant_will","Adamant Will","After Iron Halo deactivates, you take 20% less Health Damage for 10 seconds."],
        ["heavy_consecutive_execution","Consecutive Execution","Killing 7 enemies within 5 seconds restores Equipment Charge. Cooldown is 90 seconds."],
        ["heavy_emperors_protection","Emperor's Protection","When Iron Halo expends all its energy, 1 Armour Segment is restored for all Squad Members."]
      ],
      [
        ["heavy_obdurate_bastion","Obdurate Bastion","Iron Halo's Durability increases by 20%."],
        ["heavy_field_adjustment","Field Adjustment","Iron Halo recharges 20% faster, but its Durability is reduced by 25%."],
        ["heavy_power_regulator","Power Regulator","Iron Halo loses energy 20% more slowly."]
      ],
      [
        ["heavy_saving_grace","Saving Grace","Reviving a Squad Member fully restores Iron Halo's Charge and all Armour Segments."],
        ["heavy_brute_force","Brute Force","When Iron Halo is in cooldown, Ranged Damage increases by 15%."],
        ["heavy_wrath_of_the_imperium","Wrath of the Imperium","When Iron Halo expends all its energy, enemies in a 10-metre radius take significant Damage that scales with difficulty."]
      ]
    ]},
    {name:"Signature — Ability",rows:[[
      ["heavy_offensive_capability","Offensive Capability","When active, Iron Halo deals Damage over time that scales with difficulty to all enemies within 5 metres."],
      ["heavy_coolant_reserve","Coolant Reserve","If both Squad Members are Incapacitated or grabbed, your Primary Weapon will not Overheat and you deal 15% more Damage."],
      ["heavy_conversion_field","Conversion Field","When Iron Halo is active, all Squad Members within 20 metres regenerate Ability Charge 50% faster."]
    ]]}
  ],
  prestige:[
    ["heavy_reverberating_impact","Reverberating Impact","Stomp area-of-effect radius increases by 50%."],
    ["heavy_auxiliary_reload","Auxiliary Reload","Melee kills of Extremis-level or higher enemies restore your Primary Weapon's Ammo by 1 Magazine."],
    ["heavy_conviction","Conviction","When your Armour is fully depleted, you take 25% less Health Damage for 10 seconds."],
    ["heavy_exponential_force","Exponential Force","Melee Damage increases by 100%."],
    ["heavy_indomitable_spirit","Indomitable Spirit","While performing a Gun Strike, you do not lose control upon taking Heavy Hits and cannot be knocked back."],
    ["heavy_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 25% when firing without aiming."],
    ["heavy_duellist","Duellist","Perfect Parry and Perfect Block windows increase by 25%."]
  ],
  weaponOptions:{
    primary:["Heavy Bolter","Heavy Plasma Incinerator","Multi-Melta","Pyrecannon","Heavy Bolt Rifle"],
    secondary:["Bolt Pistol","Heavy Bolt Pistol","Plasma Pistol","Inferno Pistol"],
    melee:[]
  },
  defaultLoadout:{
    primary:{weapon:"Heavy Bolter",variant:"standard_issue"},
    secondary:{weapon:"Bolt Pistol",variant:"standard_issue"}
  }
};

CLASS_DATA.Sniper={
  startingPerk:["sniper_camo_cloak","Camo Cloak","Headshot Damage increases by 10%."],
  categories:[
    {name:"Core",rows:[
      [
        ["sniper_block_break","Block Break","Shots penetrate enemy Block Stances, dealing 50% of the usual Damage."],
        ["sniper_melee_mastery","Melee Mastery","Melee Damage increases by 20% against Majoris-level and higher enemies."],
        ["sniper_medicae_adept","Medicae Adept","You revive Squad Members 30% faster."]
      ],
      [
        ["sniper_high_capacity","High Capacity","The maximum amount of Ammo you can carry increases by 10%."],
        ["sniper_vantage_point","Vantage Point","Remaining stationary for 2 seconds increases your Ranged Weapons' Damage by 20%."],
        ["sniper_adaptability","Adaptability","Reloading while having Low Ammo or manually activating Camo Cloak increases Melee Damage by 25% for 10 seconds."]
      ],
      [
        ["sniper_iron_grip","Iron Grip","Weapon Spread and Recoil are reduced by 20%, and Ranged Damage against Terminus-level enemies is increased by 15% for Bolt Sniper Rifles and Stalker Bolt Rifles."],
        ["sniper_dexterous_hands","Dexterous Hands","Bolt Carbines reload 20% faster, and their Weapon Spread and Recoil are reduced by 15%."],
        ["sniper_lethal_efficiency","Lethal Efficiency","Killing more than 1 enemy with one shot from a Las Fusil restores its charge by 1."]
      ]
    ]},
    {name:"Team",rows:[[
      ["sniper_marksmanship","Marksmanship","Headshot Damage increases by 10% for all Squad Members."],
      ["sniper_precision_targeting","Precision Targeting","Weapon Spread is reduced by 25%, and Ranged Damage against Extremis- and Terminus-level enemies is increased by 15% for all Squad Members."],
      ["sniper_squad_renewal","Squad Renewal","A Headshot kill restores Ability Charge by 10% for any Squad Member."]
    ]]},
    {name:"Gear",rows:[
      [
        ["sniper_purification","Purification","Manually activating Camo Cloak removes negative Status Effects and restores all Contested Health."],
        ["sniper_efficient_readiness","Efficient Readiness","Camo Cloak increases movement speed by 20%, and manually activating Camo Cloak automatically reloads Ranged Weapons. This effect lasts 5 seconds after deactivation."],
        ["sniper_renewal","Renewal","A Headshot kill restores Camo Cloak's Charge by 5%."]
      ],
      [
        ["sniper_guardian_protocol","Guardian Protocol","When you are reviving a Squad Member, Camo Cloak hides you and the Squad Member for 5 seconds without spending Charge."],
        ["sniper_targeted_shot","Targeted Shot","The first Ranged Attack that breaks Camo Cloak deals 75% more Damage."],
        ["sniper_tactical_ambush","Tactical Ambush","The first Melee Attack that breaks Camo Cloak deals 150% more Damage."]
      ],
      [
        ["sniper_persistence","Persistence","When Camo Cloak deactivates, you take 20% less Health Damage, do not lose control upon taking Heavy Hits, and cannot be knocked back for 10 seconds."],
        ["sniper_lingering_concealment","Lingering Concealment","After performing an attack that breaks Camo Cloak, you remain hidden for 2 seconds."],
        ["sniper_ambush","Ambush","When Camo Cloak deactivates, it startles and slows nearby enemies for 10 seconds. They temporarily lose control or are knocked back. Cooldown is 15 seconds."]
      ]
    ]},
    {name:"Signature — Ability",rows:[[
      ["sniper_evasion","Evasion","After a perfectly timed Dodge, Camo Cloak automatically activates without spending Charge for 5 seconds. Cooldown is 30 seconds."],
      ["sniper_emergency_override","Emergency Override","When you receive Lethal Damage, Camo Cloak automatically activates without spending Charge and you become Invulnerable for 5 seconds. Cooldown is 180 seconds."],
      ["sniper_pattern_of_excellence","Pattern of Excellence","Performing 3 consecutive Headshots restores Equipment Charge by 1. Cooldown is 30 seconds."]
    ]]}
  ],
  prestige:[
    ["sniper_emperors_grace","Emperor's Grace","When Camo Cloak activates, you become Invulnerable to Damage for 2 seconds."],
    ["sniper_versatile_precision","Versatile Precision","Performing a kill with your Secondary Weapon restores 15% of your Primary Weapon's Ammo. Cooldown is 15 seconds."],
    ["sniper_material_upgrade","Material Upgrade","Equipment Damage radius increases by 15%."],
    ["sniper_versatility","Versatility","After switching Weapons, your Secondary Weapon deals 20% more Damage. The effect lasts until reloading or switching back to your Primary Weapon."],
    ["sniper_indomitable_spirit","Indomitable Spirit","While performing a Gun Strike, you do not lose control upon taking Heavy Hits and cannot be knocked back."],
    ["sniper_conviction","Conviction","When your Armour is fully depleted, you take 25% less Health Damage for 15 seconds."],
    ["sniper_exacting_focus","Exacting Focus","After a Gun Strike, you deal 20% more Ranged Damage for 10 seconds."]
  ],
  weaponOptions:{
    primary:["Stalker Bolt Rifle","Instigator Bolt Carbine","Bolt Sniper Rifle","Bolt Carbine","Las Fusil"],
    secondary:["Bolt Pistol","Heavy Bolt Pistol","Inferno Pistol"],
    melee:["Combat Knife"]
  },
  defaultLoadout:{
    primary:{weapon:"Stalker Bolt Rifle",variant:"standard_issue"},
    secondary:{weapon:"Bolt Pistol",variant:"standard_issue"},
    melee:{weapon:"Combat Knife",variant:"standard_issue"}
  }
};


CLASS_DATA.Bulwark={
  startingPerk:["bulwark_chapter_banner","Chapter Banner","Health increases by 30%."],
  categories:[
    {name:"Core",rows:[
      [
        ["bulwark_conviction","Conviction","When your Armour is fully depleted, you take 25% less Health Damage for 10 seconds."],
        ["bulwark_intimidating_aura","Intimidating Aura","A perfectly timed Parry deals area-of-effect Damage that scales with difficulty within a 5-metre radius."],
        ["bulwark_forward_momentum","Forward Momentum","After a Shield Bash or Thunder Hammer Pommel Smash, Melee Damage increases by 30% for 10 seconds."]
      ],
      [
        ["bulwark_armour_of_contempt","Armour of Contempt","When you Block a Ranged Attack, enemies within a 10-metre radius take the Damage instead."],
        ["bulwark_shock_and_awe","Shock and Awe","Enemies in a Shock area take 25% more Damage."],
        ["bulwark_scrambled_targeting","Scrambled Targeting","If you are surrounded by 5 or more enemies, you take 25% less Damage from Ranged Attacks."]
      ],
      [
        ["bulwark_defensive_advantage","Defensive Advantage","A perfectly timed Parry or Block creates a Shock area for 5 seconds. Cooldown is 30 seconds."],
        ["bulwark_steel_within","Steel Within","When your Health is less than 50%, you take 30% less Health Damage."],
        ["bulwark_armour_reinforcement","Armour Reinforcement","Non-Finisher Gun Strikes restore 1 Armour Segment."]
      ]
    ]},
    {name:"Team",rows:[[
      ["bulwark_focused_restoration","Focused Restoration","Every 30 seconds, all Squad Members automatically restore 1 Armour Segment."],
      ["bulwark_advanced_conditioning","Advanced Conditioning","Contested Health fades 50% more slowly for all Squad Members."],
      ["bulwark_effective_formation","Effective Formation","All Squad Members take 20% less Health Damage from Extremis- and Terminus-level enemies."]
    ]]},
    {name:"Gear",rows:[
      [
        ["bulwark_purity_of_purpose","Purity of Purpose","The banner deals Damage that scales with difficulty over time to enemies within its area of effect."],
        ["bulwark_rapid_regeneration","Rapid Regeneration","The banner restores Armour 300% faster, but its Duration is reduced to 10 seconds."],
        ["bulwark_focused_strength","Focused Strength","Shield Bash knocks enemies back and makes them lose control for a longer period of time."]
      ],
      [
        ["bulwark_concussive_force","Concussive Force","Shield Bash deals 200% more Damage. Thunder Hammer Pommel Smash deals 100% more Damage and deals area-of-effect Damage within a 7-metre radius. Cooldown is 5 seconds."],
        ["bulwark_glorys_shield","Glory's Shield","All Squad Members within the banner's area of effect take 20% less Damage, and the banner lasts 20% longer."],
        ["bulwark_invigorating_icon","Invigorating Icon","When the banner is activated, all Squad Members regain maximum Contested Health, but Chapter Banner recharges 50% slower."]
      ],
      [
        ["bulwark_rejuvenating_effect","Rejuvenating Effect","When the banner is activated, it revives Incapacitated Squad Members within its area of effect."],
        ["bulwark_merciless_resolve","Merciless Resolve","After a Shield Bash or Thunder Hammer Pommel Smash, Melee Damage increases by 15%, you do not lose control upon taking Heavy Hits and you cannot be knocked back for 10 seconds."],
        ["bulwark_inspiration","Inspiration","All Squad Members within the banner's area of effect deal 20% more Damage."]
      ]
    ]},
    {name:"Signature — Ability",rows:[[
      ["bulwark_emergency_countermeasure","Emergency Countermeasure","When your Armour is depleted, a reserve Shock Grenade automatically detonates at your position. Cooldown is 45 seconds."],
      ["bulwark_defensive_mastery","Defensive Mastery","A perfectly timed Parry instantly Incapacitates a Majoris- or Extremis-level enemy. Cooldown is 90 seconds."],
      ["bulwark_armoured_advance","Armoured Advance","If you have Armour remaining, you do not lose control upon taking Heavy Hits and you cannot be knocked back."]
    ]]}
  ],
  prestige:[
    ["bulwark_auxiliary_reload","Auxiliary Reload","Melee kills of Extremis-level or higher enemies restore your Primary Weapon's Ammo by 1 Magazine."],
    ["bulwark_resilience","Resilience","Medicae Stimms restore 40% more Health."],
    ["bulwark_overcharge","Overcharge","Charged Attack Damage increases by 20%."],
    ["bulwark_powerful_shot","Powerful Shot","Ranged Damage increases by 20%."],
    ["bulwark_masterful_defence","Masterful Defence","Ability Charge is restored by 1% for every blocked Ranged Attack."],
    ["bulwark_standard_bearer","Standard Bearer","When Chapter Banner activates, you become Invulnerable to Damage for 2 seconds."],
    ["bulwark_emboldened_stand","Emboldened Stand","When the Chapter Banner is active, all Squad Members do not lose control upon taking Heavy Hits and cannot be knocked back within its zone."]
  ],
  weaponOptions:{
    primary:[],
    secondary:["Bolt Pistol","Heavy Bolt Pistol","Plasma Pistol","Neo-Volkite Pistol","Bolt Carbine One-Handed"],
    melee:["Thunder Hammer","Chainsword","Power Fist","Power Sword","Power Axe"]
  },
  defaultLoadout:{
    secondary:{weapon:"Bolt Pistol",variant:"standard_issue"},
    melee:{weapon:"Chainsword",variant:"standard_issue"}
  }
};


CLASS_DATA.Assault={
  startingPerk:["assault_jump_pack","Jump Pack","Perfect Dodge timing increases by 50%."],
  categories:[
    {name:"Core",rows:[
      [
        ["assault_winged_fury","Winged Fury","Damage from Melee Attacks executed while sprinting or dashing increases by 100%. Deals area-of-effect Damage within a 7-metre radius. Cooldown is 5 seconds."],
        ["assault_overcharge","Overcharge","Damage of Charged Attacks increases by 25%."],
        ["assault_armour_reinforcement","Armour Reinforcement","Non-Finisher Gun Strikes also restore 1 Armour Segment."]
      ],
      [
        ["assault_auxiliary_arsenal","Auxiliary Arsenal","Secondary Weapon's Damage increases by 20%."],
        ["assault_defense_mechanism","Defense Mechanism","Contested Health fades 50% more slowly."],
        ["assault_consecutive_execution","Consecutive Execution","Killing 7 enemies within 6 seconds restores Equipment Charge by 1. Cooldown is 90 seconds."]
      ],
      [
        ["assault_perseverance","Perseverance","While performing Charged Attacks, you take 25% less Health Damage, do not lose control upon taking Heavy Hits, and cannot be knocked back."],
        ["assault_knowledge_of_the_enemy","Knowledge of the Enemy","Melee Damage increases by 15% against Majoris- or Extremis-level enemies."],
        ["assault_act_of_attrition","Act of Attrition","Enemies hit by Damage from Melee Attacks executed while sprinting or dashing take 25% more Damage for 5 seconds."]
      ]
    ]},
    {name:"Team",rows:[[
      ["assault_squad_cohesion","Squad Cohesion","All Squad Members' Abilities recharge 15% faster."],
      ["assault_strategic_strikes","Strategic Strikes","All Squad Members deal 20% more Melee Damage against Extremis- and Terminus-level enemies."],
      ["assault_proven_efficiency","Proven Efficiency","All Squad Members deal 30% more Gun Strike Damage."]
    ]]},
    {name:"Gear",rows:[
      [
        ["assault_smiting_angel","Smiting Angel","Ground Pound's Damage increases by 25%."],
        ["assault_strong_strikes","Strong Strikes","Hitting an enemy with an attack after a Jump Pack Dash restores Jump Pack Ability Charge by 1. Cooldown is 10 seconds."],
        ["assault_precision_strike","Precision Strike","Ground Pound deals 100% more Damage, but its radius is reduced by 50%."]
      ],
      [
        ["assault_wings_of_flame","Wings of Flame","Jump Pack Dash deals Damage that scales with difficulty to enemies along its trajectory and always works as a Perfect Dodge when dodging an attack."],
        ["assault_manoeuvrability","Manoeuvrability","Jump Pack recharges 20% faster."],
        ["assault_zealous_blow","Zealous Blow","A Ground Pound kill restores Jump Pack's Charge by 10%."]
      ],
      [
        ["assault_pride_in_duty","Pride in Duty","After a Finisher, Ground Pound deals 25% more Damage for 10 seconds."],
        ["assault_diligence","Diligence","A fully prepared Ground Pound deals 20% more Damage, but preparation time increases by 25%."],
        ["assault_aerial_grace","Aerial Grace","After a perfectly timed Dodge using a Jump Pack Dash, you deal 30% more Damage for 10 seconds."]
      ]
    ]},
    {name:"Signature — Ability",rows:[[
      ["assault_ample_ammunition","Ample Ammunition","Any use of Jump Pack reloads the equipped Ranged Weapon and increases Ranged Damage by 50% for 10 seconds."],
      ["assault_ascension","Ascension","Jump Pack Leap deals Damage to enemies near the takeoff area. Damage is strongest within 1 metre, drops off to zero at 5 metres, and can hit up to 20 enemies."],
      ["assault_commitment","Commitment","A perfectly timed Dodge using a Jump Pack Dash restores Jump Pack's Ability Charge."]
    ]]}
  ],
  prestige:[
    ["assault_unyielding_oath","Unyielding Oath","When charging a Ground Pound, you become Invulnerable for 3 seconds."],
    ["assault_adrenaline_boost","Adrenaline Boost","After a perfectly timed Parry, Block, or Dodge, you do not lose control upon taking Heavy Hits and cannot be knocked back for 10 seconds."],
    ["assault_duellist","Duellist","Perfect Parry and Perfect Block windows increase by 25%."],
    ["assault_fortitude","Fortitude","Health increases by 15%."],
    ["assault_scrambled_targeting","Scrambled Targeting","If you are surrounded by 5 or more enemies, you take 20% less Damage from Ranged Attacks."],
    ["assault_practiced_aim","Practiced Aim","Ranged Damage increases by 15%."],
    ["assault_hammer_of_wrath","Hammer of Wrath","After using Jump Pack, you take 30% less Ranged Damage, do not lose control upon taking Heavy Hits, and cannot be knocked back for 15 seconds."]
  ],
  weaponOptions:{
    primary:[],
    secondary:["Bolt Pistol","Heavy Bolt Pistol","Plasma Pistol","Inferno Pistol","Neo-Volkite Pistol","Bolt Carbine One-Handed"],
    melee:["Chainsword","Thunder Hammer","Power Fist","Power Sword","Power Axe"]
  },
  defaultLoadout:{
    secondary:{weapon:"Bolt Pistol",variant:"standard_issue"},
    melee:{weapon:"Chainsword",variant:"standard_issue"}
  }
};


CLASS_DATA.Vanguard={
  startingPerk:["vanguard_grapnel_launcher","Grapnel Launcher","Melee Attacks restore 50% more Contested Health."],
  categories:[
    {name:"Core",rows:[
      [
        ["vanguard_moving_target","Moving Target","Killing an enemy at a range of more than 30 metres restores Ability Charge by 10%."],
        ["vanguard_melee_mastery","Melee Mastery","Melee Damage increases by 10% against Majoris-level and higher enemies."],
        ["vanguard_upper_hand","Upper Hand","After a perfectly timed Parry, Block, or Dodge, you do not lose control upon taking Heavy Hits and you cannot be knocked back for 10 seconds."]
      ],
      [
        ["vanguard_duellist","Duellist","Perfect Parry and Perfect Block windows increase by 50%."],
        ["vanguard_close_combat_focus","Close-Combat Focus","You take 20% less Ranged Damage."],
        ["vanguard_conviction","Conviction","When your Armour is fully depleted, you take 25% less Health Damage for 10 seconds."]
      ],
      [
        ["vanguard_retribution","Retribution","When your Ranged Weapon's magazine is empty, Melee Damage increases by 30%."],
        ["vanguard_consecutive_execution","Consecutive Execution","Killing 7 enemies within 5 seconds restores Equipment Charge by 1. Cooldown is 90 seconds."],
        ["vanguard_honed_reactions","Honed Reactions","When your Health is less than 50%, your Perfect Dodge window is doubled."]
      ]
    ]},
    {name:"Team",rows:[[
      ["vanguard_melee_champion","Melee Champion","All Squad Members deal 15% more Melee Damage."],
      ["vanguard_unmatched_zeal","Unmatched Zeal","Melee Finishers of Extremis- or Terminus-level enemies additionally restore Health by 30% for any Squad Member."],
      ["vanguard_inner_fire","Inner Fire","All Squad Members can restore Ability Charge by 15% by performing Finishers on Majoris-level or higher enemies."]
    ]]},
    {name:"Gear",rows:[
      [
        ["vanguard_restless_fortitude","Restless Fortitude","After a Diving Kick, you take 40% less Ranged Damage for 10 seconds."],
        ["vanguard_shock_wave","Shock Wave","Diving Kick additionally deals 50% of its main Damage in a 5-metre radius."],
        ["vanguard_collateral_damage","Collateral Damage","Diving Kick deals 50% more Damage and additionally deals Damage that scales with difficulty to enemies on the way to the Grapnel Launcher's target."]
      ],
      [
        ["vanguard_zone_of_impact","Zone of Impact","Performing a Finisher with the Grapnel Launcher deals Damage that scales with difficulty to enemies within 10 metres."],
        ["vanguard_tenacity","Tenacity","After a Ranged kill of a Majoris-level or higher enemy, Diving Kick's Damage increases by 130%. Cooldown is 15 seconds."],
        ["vanguard_tip_of_the_spear","Tip of the Spear","Enemies hit by Diving Kick take 15% more Ranged Damage for 10 seconds."]
      ],
      [
        ["vanguard_thrill_of_the_fight","Thrill of the Fight","After a perfectly timed Parry, Block, or Dodge, you take 20% less Health Damage for 5 seconds."],
        ["vanguard_grim_determination","Grim Determination","When Grapnel Launcher is in cooldown, Weapon Damage increases by 15%."],
        ["vanguard_combat_readiness","Combat Readiness","Grapnel Launcher recharges 20% faster."]
      ]
    ]},
    {name:"Signature — Ability",rows:[[
      ["vanguard_tactical_prowess","Tactical Prowess","Grapnel Launcher can activate a Finisher on Incapacitated enemies and on non-Terminus enemies below 33% Health. Performing a Finisher with the Grapnel Launcher fully restores its Ability Charge."],
      ["vanguard_emperors_blessing","Emperor's Blessing","Taking Lethal Damage restores all Armour instead of Incapacitating you. Cooldown is 120 seconds."],
      ["vanguard_adrenaline_rush","Adrenaline Rush","Melee kills of Majoris-level or higher enemies restore Health by 5%."]
    ]]}
  ],
  prestige:[
    ["vanguard_battlefield_awareness","Battlefield Awareness","If a target is within 8 metres, you deal 10% more Ranged Damage."],
    ["vanguard_exigency_charge","Exigency Charge","When your Health is less than 25%, Ability Charge regenerates 15% faster."],
    ["vanguard_indomitable_spirit","Indomitable Spirit","While performing a Gun Strike, you do not lose control upon taking Heavy Hits and you cannot be knocked back."],
    ["vanguard_fortitude","Fortitude","Health increases by 15%."],
    ["vanguard_launch_restoration","Launch Restoration","Using the Grapnel Launcher restores 1 Armour Segment."],
    ["vanguard_restoration","Restoration","Killing 7 enemies in rapid succession restores 1 Armour Segment. Cooldown is 15 seconds."],
    ["vanguard_well_equipped","Well Equipped","Equipment Damage increases by 20%."]
  ],
  weaponOptions:{
    primary:["Instigator Bolt Carbine","Bolt Carbine","Occulus Bolt Carbine","Melta Rifle"],
    secondary:["Bolt Pistol","Heavy Bolt Pistol","Inferno Pistol","Neo-Volkite Pistol"],
    melee:["Combat Knife","Chainsword","Power Axe"]
  },
  defaultLoadout:{
    primary:{weapon:"Instigator Bolt Carbine",variant:"standard_issue"},
    secondary:{weapon:"Bolt Pistol",variant:"standard_issue"},
    melee:{weapon:"Combat Knife",variant:"standard_issue"}
  }
};


CLASS_DATA.Tactical={
  startingPerk:["tactical_auspex_scan","Auspex Scan","Any unequipped Ranged Weapon reloads automatically after 10 seconds."],
  categories:[
    {name:"Core",rows:[
      [
        ["tactical_balanced_distribution","Balanced Distribution","Your Primary Weapon deals 15% more Damage, but your Secondary Weapon deals 15% less Damage."],
        ["tactical_plasma_boost","Plasma Boost","When the Plasma Incinerator is 30% Overheated, its Damage increases by 40% and Charged Shots use 1 less energy."],
        ["tactical_kraken_penetrator_rounds","Kraken Penetrator Rounds","Bolter rounds penetrate 1 more enemy, and body shots with bolter weapons deal 50% more Damage."]
      ],
      [
        ["tactical_heightened_vigour","Heightened Vigour","After a perfectly timed Parry or Dodge, you deal 10% more Melee and Gun Strike Damage, do not lose control upon taking Heavy Hits, and cannot be knocked back for 10 seconds."],
        ["tactical_relentless_pursuit","Relentless Pursuit","After a Gun Strike, Ranged Damage increases by 25% for 5 seconds."],
        ["tactical_versatility","Versatility","After switching Weapons, your Secondary Weapon deals 25% more Damage. The effect lasts until reloading or switching back to your Primary Weapon."]
      ],
      [
        ["tactical_emperors_judgement","Emperor's Judgement","After a Finisher, the equipped Ranged Weapon reloads automatically, and your Primary Weapon deals 20% more Damage for 10 seconds."],
        ["tactical_steady_aim","Steady Aim","Weapon Spread and Recoil are reduced by 20%, and Ranged Damage against Terminus-level enemies increases by 20%."],
        ["tactical_emperors_vengeance","Emperor's Vengeance","Killing a Majoris-level or higher enemy restores your Primary Weapon's Ammo by 1 magazine. For Primary Weapons that do not reload, 20% of maximum Ammo capacity is restored instead. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds."]
      ]
    ]},
    {name:"Team",rows:[[
      ["tactical_secure_stockpile","Secure Stockpile","Equipment Charge is restored by 1 for all Squad Members. Cooldown is 60 seconds."],
      ["tactical_aligned_aim","Aligned Aim","Ranged Damage increases by 15% for all Squad Members."],
      ["tactical_transhuman_physiology","Transhuman Physiology","All Squad Members restore 30% more Contested Health from Ranged Damage."]
    ]]},
    {name:"Gear",rows:[
      [
        ["tactical_vital_data","Vital Data","Scanning an Extremis- or Terminus-level enemy restores Auspex Scan's Charge by 50%."],
        ["tactical_priority_targeting","Priority Targeting","The mark from Auspex Scan lasts 8 seconds longer (base: 8), but Auspex Scan ignores Minoris-level enemies."],
        ["tactical_target_lock","Target Lock","Enemies marked by Auspex Scan take 75% more Equipment Damage."]
      ],
      [
        ["tactical_battle_focus","Battle Focus","A perfectly timed Parry or Block gives the parried enemy a mark from Auspex Scan."],
        ["tactical_improved_efficiency","Improved Efficiency","Scanning any 10 enemies or 3 Majoris-level or higher enemies with one Auspex Scan restores Equipment Charge by 1."],
        ["tactical_precise_calibration","Precise Calibration","Enemies marked by Auspex Scan take an additional 75% Damage, but Auspex Scan's radius is reduced by 25%."]
      ],
      [
        ["tactical_close_targeting","Close Targeting","When Auspex Scan is in cooldown, Melee Damage increases by 25%."],
        ["tactical_expert_timing","Expert Timing","Enemies marked by Auspex Scan take an additional 75% Damage, but the mark's Duration is reduced by 4 seconds (base: 8)."],
        ["tactical_concentrated_fire","Concentrated Fire","Auspex Scan's zone lasts 60% longer, and enemies marked by Auspex Scan take an additional 120% Damage, but they lose the mark when they leave the scanned area."]
      ]
    ]},
    {name:"Signature — Ability",rows:[[
      ["tactical_signal_jammer","Signal Jammer","Enemies marked by Auspex Scan cannot call for reinforcements and automatically explode upon attempting to do so."],
      ["tactical_radiating_impact","Radiating Impact","A Melee Finisher additionally deals area-of-effect Damage that scales with difficulty in a 10-metre radius. Cooldown is 90 seconds."],
      ["tactical_marked_for_death","Marked for Death","A Headshot will instantly kill a Majoris- or Extremis-level enemy marked by Auspex Scan. Cooldown is 120 seconds."]
    ]]}
  ],
  prestige:[
    ["tactical_acuity","Acuity","Each consecutive Headshot increases Headshot Damage by 3%, up to 15%. The bonus lasts 5 seconds without a Headshot."],
    ["tactical_skilled_supplier","Skilled Supplier","Ammo Reserve increases by 15%."],
    ["tactical_second_look","Second Look","If no enemy has been scanned by the time the Auspex Scan zone disappears, Auspex Scan's Charge is restored."],
    ["tactical_spare_power","Spare Power","Collecting an Ammo box restores Ability Charge by 25%."],
    ["tactical_resilience","Resilience","Medicae Stimms restore 40% more Health."],
    ["tactical_fortitude","Fortitude","Health increases by 15%."],
    ["tactical_exigency_charge","Exigency Charge","When your Health is less than 25%, Ability Charge regenerates 15% faster."]
  ],
  weaponOptions:{
    primary:["Auto Bolt Rifle","Bolt Rifle","Heavy Bolt Rifle","Stalker Bolt Rifle","Bolt Carbine","Plasma Incinerator","Melta Rifle","Pyreblaster"],
    secondary:["Bolt Pistol","Heavy Bolt Pistol","Plasma Pistol"],
    melee:["Combat Knife","Chainsword"]
  },
  defaultLoadout:{
    primary:{weapon:"Auto Bolt Rifle",variant:"standard_issue"},
    secondary:{weapon:"Bolt Pistol",variant:"standard_issue"},
    melee:{weapon:"Chainsword",variant:"standard_issue"}
  }
};

const WEAPONS = {
  primary: {
    label:"Primary",
    weapons:{
      "Stalker Bolt Rifle": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"},
          {id:"deathwatch",tier:"Heroic",name:"Deathwatch"}
        ],
        layout:{columnCount:9,rowCount:2,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:2},
          {name:"Relic",start:6,span:3},
          {name:"Heroic",start:9,span:1}
        ]},
        roots:["sbr_std_unwavering_resolve","sbr_std_divine_might"],
        exclusiveGroups:[["sbr_std_unwavering_resolve","sbr_std_divine_might"]],
        connections:[
          ["sbr_std_unwavering_resolve","sbr_mc_adamant_hunter"],
          ["sbr_std_divine_might","sbr_mc_survival_instinct"],
          ["sbr_mc_adamant_hunter","sbr_mc_head_hunter"],
          ["sbr_mc_survival_instinct","sbr_mc_adamantine_grip"],
          ["sbr_mc_head_hunter","sbr_mc_adamantine_grip"],
          ["sbr_mc_head_hunter","sbr_art_cleaving_fire"],
          ["sbr_mc_adamantine_grip","sbr_art_extended_magazine"],
          ["sbr_art_cleaving_fire","sbr_art_head_hunter"],
          ["sbr_art_extended_magazine","sbr_art_increased_capacity"],
          ["sbr_art_head_hunter","sbr_art_increased_capacity"],
          ["sbr_art_head_hunter","sbr_relic_agile_hunter"],
          ["sbr_art_increased_capacity","sbr_relic_reloaded_restoration"],
          ["sbr_relic_agile_hunter","sbr_relic_fast_reload"],
          ["sbr_relic_reloaded_restoration","sbr_relic_great_might"],
          ["sbr_relic_fast_reload","sbr_relic_great_might"],
          ["sbr_relic_fast_reload","sbr_relic_recoupment"],
          ["sbr_relic_great_might","sbr_relic_remote_threat"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["sbr_std_unwavering_resolve","Unwavering Resolve","After reloading while having Low Ammo, Damage increases by 25% for 5 seconds.",{column:0,row:0}],
            ["sbr_std_divine_might","Divine Might","Damage increases by 10%.",{column:0,row:1}]
          ]},
          {name:"Master-Crafted",perks:[
            ["sbr_mc_adamant_hunter","Adamant Hunter","When your Health is below 30%, Headshots deal 25% more Damage.",{column:1,row:0}],
            ["sbr_mc_survival_instinct","Survival Instinct","When your Health is below 30%, you deal 25% more Damage.",{column:1,row:1}],
            ["sbr_mc_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:2,row:0}],
            ["sbr_mc_adamantine_grip","Adamantine Grip","Recoil is reduced by 25%.",{column:2,row:1}]
          ]},
          {name:"Artificer",perks:[
            ["sbr_art_cleaving_fire","Cleaving Fire","Shots will penetrate enemy Block Stances, dealing 25% of the usual Damage.",{column:3,row:0}],
            ["sbr_art_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:3,row:1}],
            ["sbr_art_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:4,row:0}],
            ["sbr_art_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:4,row:1}]
          ]},
          {name:"Relic",perks:[
            ["sbr_relic_agile_hunter","Agile Hunter","After a perfectly timed Dodge, Headshots deal 35% more Damage for 10 seconds.",{column:5,row:0}],
            ["sbr_relic_reloaded_restoration","Reloaded Restoration","After reloading, your Ammo Reserve is restored by 50% of the number of enemies hit. Cannot exceed maximum Ammo capacity.",{column:5,row:1}],
            ["sbr_relic_fast_reload","Fast Reload","Reload all Weapons 10% faster.",{column:6,row:0}],
            ["sbr_relic_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:6,row:1}],
            ["sbr_relic_recoupment","Recoupment","Killing a Majoris-level or higher enemy with a headshot with this Weapon restores 1 Armour Segment. Cooldown is 15 seconds.",{column:7,row:0}],
            ["sbr_relic_remote_threat","Remote Threat","Enemies at a distance of more than 25 metres take 20% more Damage.",{column:7,row:1}]
          ]},
          {name:"Heroic",perks:[
            ["sbr_heroic_auspex_shot","Auspex Shot","Landing 3 body shots in short succession creates a 10-metre Auspex Scan area.",{column:8,row:0,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      },
      "Instigator Bolt Carbine": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_of_bakka_alpha",tier:"Artificer",name:"Salvation of Bakka - Alpha"},
          {id:"salvation_of_bakka_beta",tier:"Artificer",name:"Salvation of Bakka - Beta"},
          {id:"drogos_reclamation_alpha",tier:"Artificer",name:"Drogos Reclamation - Alpha"},
          {id:"gathalamor_crusade_alpha",tier:"Relic",name:"Gathalamor Crusade - Alpha"},
          {id:"gathalamor_crusade_beta",tier:"Relic",name:"Gathalamor Crusade - Beta"},
          {id:"ophelian_liberation",tier:"Relic",name:"Ophelian Liberation"},
          {id:"wrapped",tier:"Heroic",name:"Wrapped"}
        ],
        layout:{columnCount:10,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:3},
          {name:"Relic",start:7,span:3},
          {name:"Heroic",start:10,span:1}
        ]},
        roots:["ibc_std_head_hunter","ibc_std_extended_magazine"],
        exclusiveGroups:[["ibc_std_head_hunter","ibc_std_extended_magazine"]],
        connections:[
          ["ibc_std_head_hunter","ibc_mc_efficient_hunter"],
          ["ibc_std_extended_magazine","ibc_mc_reloaded_restoration"],
          ["ibc_mc_efficient_hunter","ibc_mc_fast_reload"],
          ["ibc_mc_reloaded_restoration","ibc_mc_divine_might"],
          ["ibc_mc_fast_reload","ibc_mc_divine_might"],
          ["ibc_mc_fast_reload","ibc_art_finisher_reload"],
          ["ibc_mc_divine_might","ibc_art_increased_capacity"],
          ["ibc_art_tactical_precision","ibc_art_recoupment"],
          ["ibc_art_finisher_reload","ibc_art_recoupment"],
          ["ibc_art_increased_capacity","ibc_art_great_might"],
          ["ibc_art_recoupment","ibc_art_great_might"],
          ["ibc_art_recoupment","ibc_art_head_hunter"],
          ["ibc_art_great_might","ibc_art_honed_precision"],
          ["ibc_art_great_might","ibc_art_cleaving_fire"],
          ["ibc_art_head_hunter","ibc_relic_rapid_health"],
          ["ibc_art_cleaving_fire","ibc_relic_rampage"],
          ["ibc_relic_rapid_health","ibc_relic_perpetual_penetration"],
          ["ibc_relic_rampage","ibc_relic_reloading_immunity"],
          ["ibc_relic_perpetual_penetration","ibc_relic_reloading_immunity"],
          ["ibc_relic_perpetual_penetration","ibc_relic_inspired_aim"],
          ["ibc_relic_reloading_immunity","ibc_relic_death_strike"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["ibc_std_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:0,row:1}],
            ["ibc_std_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["ibc_mc_efficient_hunter","Efficient Hunter","After reloading while having Low Ammo, Headshots deal 35% more Damage for 5 seconds.",{column:1,row:1}],
            ["ibc_mc_reloaded_restoration","Reloaded Restoration","After reloading, your Ammo Reserve is restored by 50% of the number of enemies hit. Cannot exceed maximum Ammo capacity.",{column:1,row:2}],
            ["ibc_mc_fast_reload","Fast Reload","Reload all Weapons 10% faster.",{column:2,row:1}],
            ["ibc_mc_divine_might","Divine Might","Damage increases by 10%.",{column:2,row:2}]
          ]},
          {name:"Artificer",perks:[
            ["ibc_art_tactical_precision","Tactical Precision","Headshots deal 20% more Damage. Non-Headshot Damage decreases by 10%.",{column:4,row:0}],
            ["ibc_art_finisher_reload","Finisher Reload","After a Finisher, the equipped Weapon instantly reloads.",{column:3,row:1}],
            ["ibc_art_recoupment","Recoupment","Killing a Majoris-level or higher enemy with a headshot with this Weapon restores 1 Armour Segment. Cooldown is 15 seconds.",{column:4,row:1}],
            ["ibc_art_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:5,row:1}],
            ["ibc_art_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:3,row:2}],
            ["ibc_art_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:4,row:2}],
            ["ibc_art_cleaving_fire","Cleaving Fire","Shots will penetrate enemy Block Stances, dealing 25% of the usual Damage.",{column:5,row:2}],
            ["ibc_art_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{column:4,row:3}]
          ]},
          {name:"Relic",perks:[
            ["ibc_relic_rapid_health","Rapid Health","When your Health is below 30%, killing 7 enemies in rapid succession restores Health by 10%. Cooldown is 0 seconds.",{column:6,row:1}],
            ["ibc_relic_perpetual_penetration","Perpetual Penetration","Each shot penetrates 1 additional target.",{column:7,row:1}],
            ["ibc_relic_inspired_aim","Inspired Aim","After killing a Majoris-level or higher enemy with a Melee Weapon, headshots deal 20% more Damage for 10 seconds.",{column:8,row:1}],
            ["ibc_relic_rampage","Rampage","After killing 7 enemies in rapid succession, you deal 25% more Damage for 10 seconds. Cooldown is 15 seconds.",{column:6,row:2}],
            ["ibc_relic_reloading_immunity","Reloading Immunity","While reloading, you do not lose control from Heavy Hits.",{column:7,row:2}],
            ["ibc_relic_death_strike","Death Strike","After killing a Majoris-level or higher enemy with a Melee Weapon, you deal 25% more Damage for 10 seconds.",{column:8,row:2}]
          ]},
          {name:"Heroic",perks:[
            ["ibc_heroic_higher_rate_burst","Higher-Rate Burst","Fire rounds in higher-rate bursts.",{column:9,row:1,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      },
      "Bolt Sniper Rifle": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"drogos_reclamation_alpha",tier:"Artificer",name:"Drogos Reclamation - Alpha"},
          {id:"drogos_reclamation_beta",tier:"Artificer",name:"Drogos Reclamation - Beta"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"},
          {id:"wrapped",tier:"Heroic",name:"Wrapped"}
        ],
        layout:{columnCount:9,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:2},
          {name:"Relic",start:6,span:3},
          {name:"Heroic",start:9,span:1}
        ]},
        roots:["bsr_std_extended_magazine","bsr_std_remote_threat"],
        exclusiveGroups:[["bsr_std_extended_magazine","bsr_std_remote_threat"]],
        connections:[
          ["bsr_std_extended_magazine","bsr_mc_divine_might"],
          ["bsr_std_remote_threat","bsr_mc_survival_instinct"],
          ["bsr_mc_divine_might","bsr_mc_finisher_reload"],
          ["bsr_mc_survival_instinct","bsr_mc_adamantine_grip"],
          ["bsr_mc_finisher_reload","bsr_mc_adamantine_grip"],
          ["bsr_mc_finisher_reload","bsr_art_unwavering_resolve"],
          ["bsr_mc_adamantine_grip","bsr_art_fast_reload"],
          ["bsr_art_unwavering_resolve","bsr_art_head_hunter"],
          ["bsr_art_fast_reload","bsr_art_increased_capacity"],
          ["bsr_art_honed_precision","bsr_art_head_hunter"],
          ["bsr_art_head_hunter","bsr_art_increased_capacity"],
          ["bsr_art_increased_capacity","bsr_art_reloading_immunity"],
          ["bsr_art_head_hunter","bsr_relic_strong_start"],
          ["bsr_art_increased_capacity","bsr_relic_strong_finish"],
          ["bsr_relic_strong_start","bsr_relic_cleaving_fire"],
          ["bsr_relic_strong_finish","bsr_relic_reloaded_restoration"],
          ["bsr_relic_cleaving_fire","bsr_relic_reloaded_restoration"],
          ["bsr_relic_cleaving_fire","bsr_relic_recoupment"],
          ["bsr_relic_reloaded_restoration","bsr_relic_great_might"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["bsr_std_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:0,row:1}],
            ["bsr_std_remote_threat","Remote Threat","Enemies at a distance of more than 25 metres take 20% more Damage.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["bsr_mc_divine_might","Divine Might","Damage increases by 10%.",{column:1,row:1}],
            ["bsr_mc_survival_instinct","Survival Instinct","When your Health is below 30%, you deal 25% more Damage.",{column:1,row:2}],
            ["bsr_mc_finisher_reload","Finisher Reload","After a Finisher, the equipped Weapon instantly reloads.",{column:2,row:1}],
            ["bsr_mc_adamantine_grip","Adamantine Grip","Recoil is reduced by 25%.",{column:2,row:2}]
          ]},
          {name:"Artificer",perks:[
            ["bsr_art_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{column:4,row:0}],
            ["bsr_art_unwavering_resolve","Unwavering Resolve","After reloading while having Low Ammo, Damage increases by 25% for 5 seconds.",{column:3,row:1}],
            ["bsr_art_fast_reload","Fast Reload","Reload all Weapons 10% faster.",{column:3,row:2}],
            ["bsr_art_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:4,row:1}],
            ["bsr_art_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:4,row:2}],
            ["bsr_art_reloading_immunity","Reloading Immunity","While reloading, you do not lose control from Heavy Hits.",{column:4,row:3}]
          ]},
          {name:"Relic",perks:[
            ["bsr_relic_strong_start","Strong Start","First round in a magazine deals 25% more Damage.",{column:5,row:1}],
            ["bsr_relic_strong_finish","Strong Finish","Last round in a magazine deals 50% more Damage.",{column:5,row:2}],
            ["bsr_relic_cleaving_fire","Cleaving Fire","Shots will penetrate enemy Block Stances, dealing 25% of the usual Damage.",{column:6,row:1}],
            ["bsr_relic_reloaded_restoration","Reloaded Restoration","After reloading, your Ammo Reserve is restored by 50% of the number of enemies hit. Cannot exceed maximum Ammo capacity.",{column:6,row:2}],
            ["bsr_relic_recoupment","Recoupment","Killing a Majoris-level or higher enemy with a headshot with this Weapon restores 1 Armour Segment. Cooldown is 15 seconds.",{column:7,row:1}],
            ["bsr_relic_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:7,row:2}]
          ]},
          {name:"Heroic",perks:[
            ["bsr_heroic_replenishing_hit","Replenishing Hit","After performing a Headshot, one round is automatically reloaded into the Weapon.",{column:8,row:1,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      },
      "Bolt Carbine": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted",tier:"Master-Crafted",name:"Master-Crafted"},
          {id:"master_crafted_marksman",tier:"Master-Crafted",name:"Master-Crafted Marksman"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"salvation_of_bakka_marksman",tier:"Artificer",name:"Salvation of Bakka Marksman"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"drogos_reclamation_marksman",tier:"Artificer",name:"Drogos Reclamation Marksman"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"gathalamor_crusade_marksman",tier:"Relic",name:"Gathalamor Crusade Marksman"},
          {id:"ophelian_liberation",tier:"Relic",name:"Ophelian Liberation"},
          {id:"ophelian_liberation_marksman",tier:"Relic",name:"Ophelian Liberation Marksman"},
          {id:"combi_flamer",tier:"Heroic",name:"Combi-Flamer"}
        ],
        layout:{columnCount:10,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:3},
          {name:"Relic",start:7,span:3},
          {name:"Heroic",start:10,span:1}
        ]},
        roots:["bc_std_head_hunter","bc_std_great_might"],
        exclusiveGroups:[["bc_std_head_hunter","bc_std_great_might"]],
        connections:[
          ["bc_std_head_hunter","bc_mc_rapid_health"],
          ["bc_std_great_might","bc_mc_retaliation"],
          ["bc_mc_rapid_health","bc_mc_honed_precision"],
          ["bc_mc_retaliation","bc_mc_adamantine_grip"],
          ["bc_mc_honed_precision","bc_mc_adamantine_grip"],
          ["bc_mc_honed_precision","bc_art_divine_might_a"],
          ["bc_mc_adamantine_grip","bc_art_unwavering_resolve"],
          ["bc_art_divine_might_a","bc_art_head_hunter_b"],
          ["bc_art_head_hunter_a","bc_art_head_hunter_b"],
          ["bc_art_unwavering_resolve","bc_art_extended_magazine"],
          ["bc_art_head_hunter_b","bc_art_extended_magazine"],
          ["bc_art_head_hunter_b","bc_art_cleaving_fire"],
          ["bc_art_extended_magazine","bc_art_increased_capacity"],
          ["bc_art_extended_magazine","bc_art_divine_might_b"],
          ["bc_art_cleaving_fire","bc_relic_adamant_hunter"],
          ["bc_art_increased_capacity","bc_relic_magazine_restoration"],
          ["bc_relic_gun_strike_reload","bc_relic_perpetual_precision"],
          ["bc_relic_adamant_hunter","bc_relic_perpetual_precision"],
          ["bc_relic_magazine_restoration","bc_relic_adamantine_grip"],
          ["bc_relic_perpetual_precision","bc_relic_adamantine_grip"],
          ["bc_relic_perpetual_precision","bc_relic_recoupment"],
          ["bc_relic_adamantine_grip","bc_relic_divine_might"],
          ["bc_relic_adamantine_grip","bc_relic_reloading_immunity"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["bc_std_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:0,row:1}],
            ["bc_std_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["bc_mc_rapid_health","Rapid Health","When your Health is below 30%, killing 7 enemies in rapid succession restores Health by 10%. Cooldown is 0 seconds.",{column:1,row:1}],
            ["bc_mc_retaliation","Retaliation","After a perfectly timed Dodge, you deal 25% more Damage for 10 seconds.",{column:1,row:2}],
            ["bc_mc_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{column:2,row:1}],
            ["bc_mc_adamantine_grip","Adamantine Grip","Recoil is reduced by 25%.",{column:2,row:2}]
          ]},
          {name:"Artificer",perks:[
            ["bc_art_head_hunter_a","Head Hunter","Headshots deal 10% more Damage.",{column:4,row:0}],
            ["bc_art_divine_might_a","Divine Might","Damage increases by 10%.",{column:3,row:1}],
            ["bc_art_head_hunter_b","Head Hunter","Headshots deal 10% more Damage.",{column:4,row:1}],
            ["bc_art_cleaving_fire","Cleaving Fire","Shots will penetrate enemy Block Stances, dealing 25% of the usual Damage.",{column:5,row:1}],
            ["bc_art_unwavering_resolve","Unwavering Resolve","After reloading while having Low Ammo, Damage increases by 25% for 5 seconds.",{column:3,row:2}],
            ["bc_art_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:4,row:2}],
            ["bc_art_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:5,row:2}],
            ["bc_art_divine_might_b","Divine Might","Damage increases by 10%.",{column:4,row:3}]
          ]},
          {name:"Relic",perks:[
            ["bc_relic_gun_strike_reload","Gun Strike Reload","After a Gun Strike, the equipped Weapon instantly reloads.",{column:7,row:0}],
            ["bc_relic_adamant_hunter","Adamant Hunter","When your Health is below 30%, Headshots deal 25% more Damage.",{column:6,row:1}],
            ["bc_relic_perpetual_precision","Perpetual Precision","Maximum Spread decreases by 10%.",{column:7,row:1}],
            ["bc_relic_recoupment","Recoupment","Killing a Majoris-level or higher enemy with a headshot with this Weapon restores 1 Armour Segment. Cooldown is 15 seconds.",{column:8,row:1}],
            ["bc_relic_magazine_restoration","Magazine Restoration","When your Health drops below 30%, your Ammo Reserve is restored by a full Magazine. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{column:6,row:2}],
            ["bc_relic_adamantine_grip","Adamantine Grip","Recoil is reduced by 25%.",{column:7,row:2}],
            ["bc_relic_divine_might","Divine Might","Damage increases by 10%.",{column:8,row:2}],
            ["bc_relic_reloading_immunity","Reloading Immunity","While reloading, you do not lose control from Heavy Hits.",{column:7,row:3}]
          ]},
          {name:"Heroic",perks:[
            ["bc_heroic_combi_flamer","Combi-Flamer","Augmented Vision switches the weapon to an under-barrel Pyreblaster firing mode.",{column:9,row:1,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      },
      "Las Fusil": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_of_bakka_alpha",tier:"Artificer",name:"Salvation of Bakka - Alpha"},
          {id:"salvation_of_bakka_beta",tier:"Artificer",name:"Salvation of Bakka - Beta"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"}
        ],
        layout:{columnCount:8,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:2},
          {name:"Relic",start:6,span:3}
        ]},
        roots:["lf_std_perpetual_velocity","lf_std_increased_capacity"],
        exclusiveGroups:[["lf_std_perpetual_velocity","lf_std_increased_capacity"]],
        connections:[
          ["lf_std_perpetual_velocity","lf_mc_adamant_velocity"],
          ["lf_std_increased_capacity","lf_mc_adamant_restoration"],
          ["lf_mc_adamant_velocity","lf_mc_head_hunter"],
          ["lf_mc_adamant_restoration","lf_mc_amplification"],
          ["lf_mc_head_hunter","lf_mc_amplification"],
          ["lf_mc_head_hunter","lf_art_perpetual_velocity"],
          ["lf_mc_amplification","lf_art_amplification"],
          ["lf_art_perpetual_velocity","lf_art_amplification"],
          ["lf_art_perpetual_velocity","lf_art_charging_immunity"],
          ["lf_art_amplification","lf_art_great_might"],
          ["lf_art_head_hunter","lf_art_charging_immunity"],
          ["lf_art_great_might","lf_art_divine_might"],
          ["lf_art_charging_immunity","lf_relic_instant_health"],
          ["lf_art_great_might","lf_relic_brutal_rampage"],
          ["lf_relic_instant_health","lf_relic_head_hunter"],
          ["lf_relic_brutal_rampage","lf_relic_increased_capacity_a"],
          ["lf_relic_head_hunter","lf_relic_increased_capacity_a"],
          ["lf_relic_head_hunter","lf_relic_recoupment"],
          ["lf_relic_increased_capacity_a","lf_relic_increased_capacity_b"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["lf_std_perpetual_velocity","Perpetual Velocity","Shots Charge 20% faster.",{column:0,row:1}],
            ["lf_std_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["lf_mc_adamant_velocity","Adamant Velocity","When your Health is below 30%, shots Charge 25% faster.",{column:1,row:1}],
            ["lf_mc_adamant_restoration","Adamant Restoration","When your Health drops below 30%, your Ammo Reserve is restored by 25% of the maximum capacity. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{column:1,row:2}],
            ["lf_mc_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:2,row:1}],
            ["lf_mc_amplification","Amplification","Radius of Beam Weapons increases by 15%.",{column:2,row:2}]
          ]},
          {name:"Artificer",perks:[
            ["lf_art_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:4,row:0}],
            ["lf_art_perpetual_velocity","Perpetual Velocity","Shots Charge 20% faster.",{column:3,row:1}],
            ["lf_art_charging_immunity","Charging Immunity","While Charging a shot, you do not lose control from Heavy Hits.",{column:4,row:1}],
            ["lf_art_amplification","Amplification","Radius of Beam Weapons increases by 15%.",{column:3,row:2}],
            ["lf_art_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:4,row:2}],
            ["lf_art_divine_might","Divine Might","Damage increases by 10%.",{column:4,row:3}]
          ]},
          {name:"Relic",perks:[
            ["lf_relic_instant_health","Instant Health","When your Health is below 30%, killing 3 enemies or more with one shot restores Health by 5%.",{column:5,row:1}],
            ["lf_relic_brutal_rampage","Brutal Rampage","After killing 3 enemies or more with one shot, you deal 25% more Damage for 5 seconds.",{column:5,row:2}],
            ["lf_relic_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:6,row:1}],
            ["lf_relic_increased_capacity_a","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:6,row:2}],
            ["lf_relic_recoupment","Recoupment","Killing a Majoris-level or higher enemy with a headshot with this Weapon restores 1 Armour Segment. Cooldown is 15 seconds.",{column:7,row:1}],
            ["lf_relic_increased_capacity_b","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:7,row:2}]
          ]}
        ]
      },
      "Heavy Bolter": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"master_crafted_gamma",tier:"Master-Crafted",name:"Master-Crafted - Gamma"},
          {id:"salvation_of_bakka_alpha",tier:"Artificer",name:"Salvation of Bakka - Alpha"},
          {id:"salvation_of_bakka_beta",tier:"Artificer",name:"Salvation of Bakka - Beta"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"gathalamor_crusade_alpha",tier:"Relic",name:"Gathalamor Crusade - Alpha"},
          {id:"gathalamor_crusade_beta",tier:"Relic",name:"Gathalamor Crusade - Beta"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"},
          {id:"chains_of_duty",tier:"Heroic",name:"Chains of Duty"}
        ],
        layout:{columnCount:9,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:2},
          {name:"Relic",start:6,span:3},
          {name:"Heroic",start:9,span:1}
        ]},
        roots:["hb_std_fast_venting","hb_std_perpetual_cooling"],
        exclusiveGroups:[["hb_std_fast_venting","hb_std_perpetual_cooling"]],
        connections:[
          ["hb_std_fast_venting","hb_mc_perfect_cooling"],
          ["hb_std_perpetual_cooling","hb_mc_contingency_plan"],
          ["hb_mc_perfect_cooling","hb_mc_increased_capacity"],
          ["hb_mc_contingency_plan","hb_mc_head_hunter"],
          ["hb_mc_heavy_immunity","hb_mc_increased_capacity"],
          ["hb_mc_increased_capacity","hb_mc_head_hunter"],
          ["hb_mc_head_hunter","hb_mc_perpetual_penetration"],
          ["hb_mc_increased_capacity","hb_art_adamant_restoration"],
          ["hb_mc_head_hunter","hb_art_adamant_hunter"],
          ["hb_art_heavy_might_top","hb_art_heavy_might"],
          ["hb_art_heavy_might","hb_art_heavy_precision"],
          ["hb_art_heavy_precision","hb_art_honed_precision"],
          ["hb_art_adamant_restoration","hb_art_heavy_might"],
          ["hb_art_adamant_hunter","hb_art_heavy_precision"],
          ["hb_art_heavy_might","hb_relic_discipline"],
          ["hb_art_heavy_precision","hb_relic_efficient_precision"],
          ["hb_relic_increased_capacity","hb_relic_fast_venting"],
          ["hb_relic_fast_venting","hb_relic_perpetual_cooling"],
          ["hb_relic_perpetual_cooling","hb_relic_weapon_strike"],
          ["hb_relic_discipline","hb_relic_fast_venting"],
          ["hb_relic_fast_venting","hb_relic_great_might"],
          ["hb_relic_efficient_precision","hb_relic_perpetual_cooling"],
          ["hb_relic_perpetual_cooling","hb_relic_divine_might"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["hb_std_fast_venting","Fast Venting","Weapon cools 15% faster.",{column:0,row:1}],
            ["hb_std_perpetual_cooling","Perpetual Cooling","Weapon Heating decreases by 10%.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["hb_mc_perfect_cooling","Perfect Cooling","After a perfectly timed Dodge, the equipped Weapon is completely cooled.",{column:1,row:1}],
            ["hb_mc_contingency_plan","Contingency Plan","When your Ammo Reserve is less than 25% of your Ammo capacity, Melee Damage increases by 20%.",{column:1,row:2}],
            ["hb_mc_heavy_immunity","Heavy Immunity","While in Heavy Stance, you do not lose control from Heavy Hits.",{column:2,row:0}],
            ["hb_mc_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:2,row:1}],
            ["hb_mc_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:2,row:2}],
            ["hb_mc_perpetual_penetration","Perpetual Penetration","Each shot penetrates 1 additional target.",{column:2,row:3}]
          ]},
          {name:"Artificer",perks:[
            ["hb_art_adamant_restoration","Adamant Restoration","When your Health drops below 30%, your Ammo Reserve is restored by 25% of the maximum capacity. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{column:3,row:1}],
            ["hb_art_adamant_hunter","Adamant Hunter","When your Health is below 30%, Headshots deal 25% more Damage.",{column:3,row:2}],
            ["hb_art_heavy_might_top","Heavy Might","While in Heavy Stance, you deal 15% more Damage.",{column:4,row:0}],
            ["hb_art_heavy_might","Heavy Might","While in Heavy Stance, you deal 15% more Damage.",{column:4,row:1}],
            ["hb_art_heavy_precision","Heavy Precision","While in Heavy Stance, Maximum Spread decreases by 10%.",{column:4,row:2}],
            ["hb_art_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{column:4,row:3}]
          ]},
          {name:"Relic",perks:[
            ["hb_relic_discipline","Discipline","When you have Low Ammo, you deal 25% more Damage.",{column:5,row:1}],
            ["hb_relic_efficient_precision","Efficient Precision","When you have Low Ammo, Maximum Spread decreases by 25%.",{column:5,row:2}],
            ["hb_relic_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:6,row:0}],
            ["hb_relic_fast_venting","Fast Venting","Weapon cools 15% faster.",{column:6,row:1}],
            ["hb_relic_perpetual_cooling","Perpetual Cooling","Weapon Heating decreases by 10%.",{column:6,row:2}],
            ["hb_relic_weapon_strike","Weapon Strike","Melee Damage increases by 50%.",{column:6,row:3}],
            ["hb_relic_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:7,row:1}],
            ["hb_relic_divine_might","Divine Might","Damage increases by 10%.",{column:7,row:2}]
          ]},
          {name:"Heroic",perks:[
            ["hb_heroic_reinforced_guncasing","Reinforced Guncasing","Perfect Parry window increases by 50%. After a Gun Strike, the Weapon is completely cooled.",{column:8,row:1,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      },
      "Heavy Plasma Incinerator": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"master_crafted_gamma",tier:"Master-Crafted",name:"Master-Crafted - Gamma"},
          {id:"salvation_of_bakka_alpha",tier:"Artificer",name:"Salvation of Bakka - Alpha"},
          {id:"salvation_of_bakka_beta",tier:"Artificer",name:"Salvation of Bakka - Beta"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"gathalamor_crusade_alpha",tier:"Relic",name:"Gathalamor Crusade - Alpha"},
          {id:"gathalamor_crusade_beta",tier:"Relic",name:"Gathalamor Crusade - Beta"},
          {id:"ophelian_liberation",tier:"Relic",name:"Ophelian Liberation"},
          {id:"relic_battle_worn",tier:"Heroic",name:"Relic Battle-Worn"}
        ],
        layout:{columnCount:11,rowCount:2,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:3},
          {name:"Artificer",start:5,span:3},
          {name:"Relic",start:8,span:3},
          {name:"Heroic",start:11,span:1}
        ]},
        roots:["hpi_std_common_cooling","hpi_std_fast_venting"],
        exclusiveGroups:[["hpi_std_common_cooling","hpi_std_fast_venting"]],
        connections:[
          ["hpi_std_common_cooling","hpi_mc_rapid_cooling"],
          ["hpi_std_fast_venting","hpi_mc_contingency_plan"],
          ["hpi_mc_rapid_cooling","hpi_mc_heavy_velocity"],
          ["hpi_mc_contingency_plan","hpi_mc_plasma_collection"],
          ["hpi_mc_heavy_velocity","hpi_mc_plasma_collection"],
          ["hpi_mc_heavy_velocity","hpi_mc_supercharged_shot"],
          ["hpi_mc_plasma_collection","hpi_mc_efficient_charge"],
          ["hpi_mc_supercharged_shot","hpi_art_adamant_velocity"],
          ["hpi_mc_efficient_charge","hpi_art_adamant_restoration"],
          ["hpi_art_adamant_velocity","hpi_art_supercharged_shot"],
          ["hpi_art_adamant_restoration","hpi_art_heavy_fire"],
          ["hpi_art_supercharged_shot","hpi_art_heavy_fire"],
          ["hpi_art_supercharged_shot","hpi_art_heavy_immunity"],
          ["hpi_art_heavy_fire","hpi_art_weapon_strike"],
          ["hpi_art_heavy_immunity","hpi_relic_retaliation"],
          ["hpi_art_weapon_strike","hpi_relic_elusive_fire"],
          ["hpi_relic_retaliation","hpi_relic_charged_cooling"],
          ["hpi_relic_elusive_fire","hpi_relic_fast_venting"],
          ["hpi_relic_charged_cooling","hpi_relic_fast_venting"],
          ["hpi_relic_charged_cooling","hpi_relic_brutal_rampage"],
          ["hpi_relic_fast_venting","hpi_relic_plasma_collection"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["hpi_std_common_cooling","Common Cooling","Common Shots generate 10% less Heat.",{column:0,row:0}],
            ["hpi_std_fast_venting","Fast Venting","Weapon cools 15% faster.",{column:0,row:1}]
          ]},
          {name:"Master-Crafted",perks:[
            ["hpi_mc_rapid_cooling","Rapid Cooling","After killing 7 enemies in rapid succession, Weapons do not heat for 10 seconds. Cooldown is 15 seconds.",{column:1,row:0}],
            ["hpi_mc_contingency_plan","Contingency Plan","When your Ammo Reserve is less than 25% of your Ammo capacity, Melee Damage increases by 20%.",{column:1,row:1}],
            ["hpi_mc_heavy_velocity","Heavy Velocity","When in Heavy Stance, shots Charge 15% faster.",{column:2,row:0}],
            ["hpi_mc_plasma_collection","Plasma Collection","Energy reserve of Plasma Weapons increases by 20%.",{column:2,row:1}],
            ["hpi_mc_supercharged_shot","Supercharged Shot","Damage from a Charged Shot increases by 10%.",{column:3,row:0}],
            ["hpi_mc_efficient_charge","Efficient Charge","Charged Shots from Plasma Weapons use 2 less energy.",{column:3,row:1}]
          ]},
          {name:"Artificer",perks:[
            ["hpi_art_adamant_velocity","Adamant Velocity","When your Health is below 30%, shots Charge 25% faster.",{column:4,row:0}],
            ["hpi_art_adamant_restoration","Adamant Restoration","When your Health drops below 30%, your Ammo Reserve is restored by 25% of the maximum capacity. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{column:4,row:1}],
            ["hpi_art_supercharged_shot","Supercharged Shot","Damage from a Charged Shot increases by 10%.",{column:5,row:0}],
            ["hpi_art_heavy_fire","Heavy Fire","While in Heavy Stance, Fire Rate increases by 15%.",{column:5,row:1}],
            ["hpi_art_heavy_immunity","Heavy Immunity","While in Heavy Stance, you do not lose control from Heavy Hits.",{column:6,row:0}],
            ["hpi_art_weapon_strike","Weapon Strike","Melee Damage increases by 50%.",{column:6,row:1}]
          ]},
          {name:"Relic",perks:[
            ["hpi_relic_retaliation","Retaliation","After a perfectly timed Dodge, you deal 25% more Damage for 10 seconds.",{column:7,row:0}],
            ["hpi_relic_elusive_fire","Elusive Fire","After a perfectly timed Dodge, Fire Rate increases by 25% for 10 seconds.",{column:7,row:1}],
            ["hpi_relic_charged_cooling","Charged Cooling","Charged Shots generate 10% less Heat.",{column:8,row:0}],
            ["hpi_relic_fast_venting","Fast Venting","Weapon cools 15% faster.",{column:8,row:1}],
            ["hpi_relic_brutal_rampage","Brutal Rampage","After killing 3 enemies or more with one shot, you deal 25% more Damage for 5 seconds.",{column:9,row:0}],
            ["hpi_relic_plasma_collection","Plasma Collection","Energy reserve of Plasma Weapons increases by 20%.",{column:9,row:1}]
          ]},
          {name:"Heroic",perks:[
            ["hpi_heroic_plasma_hail","Plasma Hail","In Heavy Stance, get an increase in Fire Rate instead of Charged Shots.",{column:10,row:0,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      },
      "Multi-Melta": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"master_crafted_gamma",tier:"Master-Crafted",name:"Master-Crafted - Gamma"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"drogos_reclamation_alpha",tier:"Artificer",name:"Drogos Reclamation - Alpha"},
          {id:"drogos_reclamation_beta",tier:"Artificer",name:"Drogos Reclamation - Beta"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"}
        ],
        layout:{columnCount:10,rowCount:2,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:3},
          {name:"Artificer",start:5,span:3},
          {name:"Relic",start:8,span:3}
        ]},
        roots:["mm_std_increased_capacity","mm_std_weapon_strike"],
        exclusiveGroups:[["mm_std_increased_capacity","mm_std_weapon_strike"]],
        connections:[
          ["mm_std_increased_capacity","mm_mc_elite_restoration"],
          ["mm_std_weapon_strike","mm_mc_decisive_reload"],
          ["mm_mc_elite_restoration","mm_mc_heavy_fire"],
          ["mm_mc_decisive_reload","mm_mc_perpetual_range_a"],
          ["mm_mc_heavy_fire","mm_mc_perpetual_range_a"],
          ["mm_mc_heavy_fire","mm_mc_heavy_immunity"],
          ["mm_mc_perpetual_range_a","mm_mc_perpetual_range_b"],
          ["mm_mc_heavy_immunity","mm_art_executioners_fire"],
          ["mm_mc_perpetual_range_b","mm_art_executioners_range"],
          ["mm_art_executioners_fire","mm_art_heavy_might_a"],
          ["mm_art_executioners_range","mm_art_trick_shot"],
          ["mm_art_heavy_might_a","mm_art_trick_shot"],
          ["mm_art_heavy_might_a","mm_art_heavy_might_b"],
          ["mm_art_trick_shot","mm_art_divine_might"],
          ["mm_art_heavy_might_b","mm_relic_death_strike"],
          ["mm_art_divine_might","mm_relic_elite_health"],
          ["mm_relic_death_strike","mm_relic_increased_capacity"],
          ["mm_relic_elite_health","mm_relic_discipline"],
          ["mm_relic_increased_capacity","mm_relic_discipline"],
          ["mm_relic_increased_capacity","mm_relic_divine_might"],
          ["mm_relic_discipline","mm_relic_expedient_barrage"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["mm_std_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:0,row:0}],
            ["mm_std_weapon_strike","Weapon Strike","Melee Damage increases by 50%.",{column:0,row:1}]
          ]},
          {name:"Master-Crafted",perks:[
            ["mm_mc_elite_restoration","Elite Restoration","Killing a Majoris-level or higher enemy restores 10% of your maximum Ammo Reserve. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{column:1,row:0}],
            ["mm_mc_decisive_reload","Decisive Reload","Performing a Finisher on a Majoris-level or higher enemy restores Melta ammo by 1.",{column:1,row:1}],
            ["mm_mc_heavy_fire","Heavy Fire","While in Heavy Stance, Fire Rate increases by 15%.",{column:2,row:0}],
            ["mm_mc_perpetual_range_a","Perpetual Range","Effective Range increases by 1 metre.",{column:2,row:1}],
            ["mm_mc_heavy_immunity","Heavy Immunity","While in Heavy Stance, you do not lose control from Heavy Hits.",{column:3,row:0}],
            ["mm_mc_perpetual_range_b","Perpetual Range","Effective Range increases by 1 metre.",{column:3,row:1}]
          ]},
          {name:"Artificer",perks:[
            ["mm_art_executioners_fire","Executioner's Fire","After a Finisher, Fire Rate increases by 25% for 10 seconds.",{column:4,row:0}],
            ["mm_art_executioners_range","Executioner's Range","After a Finisher, Effective Range increases by 3 metres for 10 seconds.",{column:4,row:1}],
            ["mm_art_heavy_might_a","Heavy Might","While in Heavy Stance, you deal 15% more Damage.",{column:5,row:0}],
            ["mm_art_trick_shot","Trick Shot","Killing 5 enemies with one shot restores 1 Armour Segment. Cooldown is 30 seconds.",{column:5,row:1}],
            ["mm_art_heavy_might_b","Heavy Might","While in Heavy Stance, you deal 15% more Damage.",{column:6,row:0}],
            ["mm_art_divine_might","Divine Might","Damage increases by 10%.",{column:6,row:1}]
          ]},
          {name:"Relic",perks:[
            ["mm_relic_death_strike","Death Strike","After killing a Majoris-level or higher enemy with a Melee Weapon, you deal 25% more Damage for 10 seconds.",{column:7,row:0}],
            ["mm_relic_elite_health","Elite Health","When your Health is below 30%, killing a Majoris-level or higher enemy with Melee Damage restores Health by 10%.",{column:7,row:1}],
            ["mm_relic_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:8,row:0}],
            ["mm_relic_discipline","Discipline","When you have Low Ammo, you deal 25% more Damage.",{column:8,row:1}],
            ["mm_relic_divine_might","Divine Might","Damage increases by 10%.",{column:9,row:0}],
            ["mm_relic_expedient_barrage","Expedient Barrage","Fire Rate increases by 33% when firing without aiming.",{column:9,row:1}]
          ]}
        ]
      },
      "Pyrecannon": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"ophelian_liberation",tier:"Relic",name:"Ophelian Liberation"}
        ],
        layout:{columnCount:7,rowCount:2,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:2},
          {name:"Relic",start:6,span:2}
        ]},
        roots:["pyre_std_improved_fast_venting","pyre_std_perpetual_cooling"],
        exclusiveGroups:[["pyre_std_improved_fast_venting","pyre_std_perpetual_cooling"]],
        connections:[
          ["pyre_std_improved_fast_venting","pyre_mc_eternal_flame"],
          ["pyre_std_perpetual_cooling","pyre_mc_flame_of_protection"],
          ["pyre_mc_eternal_flame","pyre_mc_increased_capacity"],
          ["pyre_mc_flame_of_protection","pyre_mc_contingency_plan"],
          ["pyre_mc_increased_capacity","pyre_mc_contingency_plan"],
          ["pyre_mc_increased_capacity","pyre_art_flame_of_ascension"],
          ["pyre_mc_contingency_plan","pyre_art_rapid_health"],
          ["pyre_art_flame_of_ascension","pyre_art_potent_flame"],
          ["pyre_art_rapid_health","pyre_art_divine_might"],
          ["pyre_art_potent_flame","pyre_art_divine_might"],
          ["pyre_art_potent_flame","pyre_relic_resilient_flame"],
          ["pyre_art_divine_might","pyre_relic_heavy_immunity"],
          ["pyre_relic_resilient_flame","pyre_relic_pure_flame"],
          ["pyre_relic_heavy_immunity","pyre_relic_flash_burn"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["pyre_std_improved_fast_venting","Improved Fast Venting","Weapon cools 20% faster.",{column:0,row:0}],
            ["pyre_std_perpetual_cooling","Perpetual Cooling","Weapon Heating decreases by 20%.",{column:0,row:1}]
          ]},
          {name:"Master-Crafted",perks:[
            ["pyre_mc_eternal_flame","Eternal Flame","Burning time increases by 20%.",{column:1,row:0}],
            ["pyre_mc_flame_of_protection","Flame of Protection","Burning enemies deal 20% less Melee Damage.",{column:1,row:1}],
            ["pyre_mc_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:2,row:0}],
            ["pyre_mc_contingency_plan","Contingency Plan","When your Ammo Reserve is less than 25% of your Ammo capacity, Melee Damage increases by 20%.",{column:2,row:1}]
          ]},
          {name:"Artificer",perks:[
            ["pyre_art_flame_of_ascension","Flame of Ascension","Burning 5 enemies restores 1 Armour Segment. Cooldown is 30 seconds.",{column:3,row:0}],
            ["pyre_art_rapid_health","Rapid Health","When your Health is below 30%, killing 7 enemies in rapid succession restores Health by 10%. Cooldown is 0 seconds.",{column:3,row:1}],
            ["pyre_art_potent_flame","Potent Flame","Burning Damage increases by 15%.",{column:4,row:0}],
            ["pyre_art_divine_might","Divine Might","Damage increases by 10%.",{column:4,row:1}]
          ]},
          {name:"Relic",perks:[
            ["pyre_relic_resilient_flame","Resilient Flame","Charging time decreases by 75%.",{column:5,row:0}],
            ["pyre_relic_heavy_immunity","Heavy Immunity","While in Heavy Stance, you do not lose control from Heavy Hits.",{column:5,row:1}],
            ["pyre_relic_pure_flame","Pure Flame","Burning Damage increases by 15%. Direct Damage decreases by 50%.",{column:6,row:0}],
            ["pyre_relic_flash_burn","Flash Burn","Enemies at a distance of less than 10 metres take 20% more Damage.",{column:6,row:1}]
          ]}
        ]
      },
      "Plasma Incinerator": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_bakka_alpha",tier:"Artificer",name:"Salvation of Bakka - Alpha"},
          {id:"salvation_bakka_beta",tier:"Artificer",name:"Salvation of Bakka - Beta"},
          {id:"drogos_reclamation_alpha",tier:"Artificer",name:"Drogos Reclamation - Alpha"},
          {id:"drogos_reclamation_beta",tier:"Artificer",name:"Drogos Reclamation - Beta"},
          {id:"gathalamor_crusade_alpha",tier:"Relic",name:"Gathalamor Crusade - Alpha"},
          {id:"gathalamor_crusade_beta",tier:"Relic",name:"Gathalamor Crusade - Beta"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"}
        ],
        layout:{columnCount:9,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:3},
          {name:"Relic",start:7,span:3}
        ]},
        roots:["plasma_std_common_cooling","plasma_std_blast_radius"],
        exclusiveGroups:[["plasma_std_common_cooling","plasma_std_blast_radius"]],
        connections:[
          ["plasma_std_common_cooling","plasma_mc_rapid_cooling"],
          ["plasma_std_blast_radius","plasma_mc_rampage"],
          ["plasma_mc_rapid_cooling","plasma_mc_fast_venting"],
          ["plasma_mc_rampage","plasma_mc_efficient_charge"],
          ["plasma_mc_fast_venting","plasma_mc_efficient_charge"],
          ["plasma_mc_fast_venting","plasma_art_plasma_collection"],
          ["plasma_mc_efficient_charge","plasma_art_charged_speed"],
          ["plasma_art_plasma_collection","plasma_art_common_speed"],
          ["plasma_art_charged_speed","plasma_art_blast_radius"],
          ["plasma_art_common_efficiency","plasma_art_common_speed"],
          ["plasma_art_common_speed","plasma_art_blast_radius"],
          ["plasma_art_common_speed","plasma_art_adamant_restoration"],
          ["plasma_art_blast_radius","plasma_art_adamant_velocity"],
          ["plasma_art_blast_radius","plasma_art_balanced_cooling"],
          ["plasma_art_adamant_restoration","plasma_relic_retaliation"],
          ["plasma_art_adamant_velocity","plasma_relic_perfect_radius"],
          ["plasma_relic_retaliation","plasma_relic_fast_venting"],
          ["plasma_relic_perfect_radius","plasma_relic_perpetual_velocity"],
          ["plasma_relic_honed_precision","plasma_relic_fast_venting"],
          ["plasma_relic_fast_venting","plasma_relic_perpetual_velocity"],
          ["plasma_relic_fast_venting","plasma_relic_common_cooling"],
          ["plasma_relic_perpetual_velocity","plasma_relic_efficient_charge"],
          ["plasma_relic_perpetual_velocity","plasma_relic_great_might"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["plasma_std_common_cooling","Common Cooling","Common Shots generate 10% less Heat.",{column:0,row:1}],
            ["plasma_std_blast_radius","Blast Radius","Damage radius of a Charged Shot increases by 10%.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["plasma_mc_rapid_cooling","Rapid Cooling","After killing 7 enemies in rapid succession, Weapons do not heat for 10 seconds. Cooldown is 15 seconds.",{column:1,row:1}],
            ["plasma_mc_fast_venting","Fast Venting","Weapon cools 15% faster.",{column:2,row:1}],
            ["plasma_mc_rampage","Rampage","After killing 7 enemies in rapid succession, you deal 25% more Damage for 10 seconds. Cooldown is 15 seconds.",{column:1,row:2}],
            ["plasma_mc_efficient_charge","Efficient Charge","Charged Shots from Plasma Weapons use 2 less energy.",{column:2,row:2}]
          ]},
          {name:"Artificer",perks:[
            ["plasma_art_common_efficiency","Common Efficiency","Common Shots generate 20% less Heat. Shots charge 20% slower.",{column:4,row:0}],
            ["plasma_art_plasma_collection","Plasma Collection","Energy reserve of Plasma Weapons increases by 20%.",{column:3,row:1}],
            ["plasma_art_common_speed","Common Speed","Projectile speed of Common Shots increases by 25%.",{column:4,row:1}],
            ["plasma_art_adamant_restoration","Adamant Restoration","When your Health drops below 30%, your Ammo Reserve is restored by 25% of the maximum capacity. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{column:5,row:1}],
            ["plasma_art_charged_speed","Charged Speed","Projectile speed of Charged Shots increases by 25%.",{column:3,row:2}],
            ["plasma_art_blast_radius","Blast Radius","Damage radius of a Charged Shot increases by 10%.",{column:4,row:2}],
            ["plasma_art_adamant_velocity","Adamant Velocity","When your Health is below 30%, shots Charge 25% faster.",{column:5,row:2}],
            ["plasma_art_balanced_cooling","Balanced Cooling","Weapon cools 20% faster. Charged Shots generate 10% more Heat.",{column:4,row:3}]
          ]},
          {name:"Relic",perks:[
            ["plasma_relic_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{column:7,row:0}],
            ["plasma_relic_retaliation","Retaliation","After a perfectly timed Dodge, you deal 25% more Damage for 10 seconds.",{column:6,row:1}],
            ["plasma_relic_fast_venting","Fast Venting","Weapon cools 15% faster.",{column:7,row:1}],
            ["plasma_relic_common_cooling","Common Cooling","Common Shots generate 10% less Heat.",{column:8,row:1}],
            ["plasma_relic_perfect_radius","Perfect Radius","After a perfectly timed Dodge, the Damage radius of a Charged Shot increases by 10% for 10 seconds.",{column:6,row:2}],
            ["plasma_relic_perpetual_velocity","Perpetual Velocity","Shots Charge 20% faster.",{column:7,row:2}],
            ["plasma_relic_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:8,row:2}],
            ["plasma_relic_efficient_charge","Efficient Charge","Charged Shots from Plasma Weapons use 2 less energy.",{column:7,row:3}]
          ]}
        ]
      },
      "Auto Bolt Rifle": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"ophelian_liberation",tier:"Relic",name:"Ophelian Liberation"}
        ],
        layout:{columnCount:7,rowCount:2,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:2},
          {name:"Relic",start:6,span:2}
        ]},
        roots:["abr_std_honed_precision","abr_std_extended_magazine"],
        exclusiveGroups:[["abr_std_honed_precision","abr_std_extended_magazine"]],
        connections:[
          ["abr_std_honed_precision","abr_mc_close_combat"],
          ["abr_std_extended_magazine","abr_mc_magazine_restoration"],
          ["abr_mc_close_combat","abr_mc_fast_reload"],
          ["abr_mc_magazine_restoration","abr_mc_perpetual_penetration"],
          ["abr_mc_fast_reload","abr_mc_perpetual_penetration"],
          ["abr_mc_fast_reload","abr_art_head_hunter"],
          ["abr_mc_perpetual_penetration","abr_art_divine_might"],
          ["abr_art_head_hunter","abr_art_elite_hunter"],
          ["abr_art_divine_might","abr_art_great_might"],
          ["abr_art_elite_hunter","abr_art_great_might"],
          ["abr_art_elite_hunter","abr_relic_rapid_health"],
          ["abr_art_great_might","abr_relic_rampage"],
          ["abr_relic_rapid_health","abr_relic_recoupment"],
          ["abr_relic_rampage","abr_relic_increased_capacity"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["abr_std_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{column:0,row:0}],
            ["abr_std_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:0,row:1}]
          ]},
          {name:"Master-Crafted",perks:[
            ["abr_mc_close_combat","Close Combat","Enemies at a distance of no more than 15 metres take 15% more Damage.",{column:1,row:0}],
            ["abr_mc_magazine_restoration","Magazine Restoration","When your Health drops below 30%, your Ammo Reserve is restored by a full Magazine. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{column:1,row:1}],
            ["abr_mc_fast_reload","Fast Reload","Reload all Weapons 10% faster.",{column:2,row:0}],
            ["abr_mc_perpetual_penetration","Perpetual Penetration","Each shot penetrates 1 additional target.",{column:2,row:1}]
          ]},
          {name:"Artificer",perks:[
            ["abr_art_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:3,row:0}],
            ["abr_art_divine_might","Divine Might","Damage increases by 10%.",{column:3,row:1}],
            ["abr_art_elite_hunter","Elite Hunter","After killing a Majoris-level or higher enemy with a Melee Weapon, Headshots deal 50% more Damage for 10 seconds.",{column:4,row:0}],
            ["abr_art_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:4,row:1}]
          ]},
          {name:"Relic",perks:[
            ["abr_relic_rapid_health","Rapid Health","When your Health is below 30%, killing 7 enemies in rapid succession restores Health by 10%. Cooldown is 0 seconds.",{column:5,row:0}],
            ["abr_relic_rampage","Rampage","After killing 7 enemies in rapid succession, you deal 25% more Damage for 10 seconds. Cooldown is 15 seconds.",{column:5,row:1}],
            ["abr_relic_recoupment","Recoupment","Killing a Majoris-level or higher enemy with a headshot with this weapon restores 1 Armour Segment. Cooldown is 15 seconds.",{column:6,row:0}],
            ["abr_relic_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:6,row:1}]
          ]}
        ]
      },
      "Bolt Rifle": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted",tier:"Master-Crafted",name:"Master-Crafted"},
          {id:"master_crafted_grenade_launcher",tier:"Master-Crafted",name:"Master-Crafted with Grenade Launcher"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"salvation_of_bakka_grenade_launcher",tier:"Artificer",name:"Salvation of Bakka with Grenade Launcher"},
          {id:"drogos_reclamation_alpha",tier:"Artificer",name:"Drogos Reclamation - Alpha"},
          {id:"drogos_reclamation_beta",tier:"Artificer",name:"Drogos Reclamation - Beta"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"gathalamor_crusade_grenade_launcher",tier:"Relic",name:"Gathalamor Crusade with Grenade Launcher"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"},
          {id:"combi_melta",tier:"Heroic",name:"Combi-Melta"}
        ],
        layout:{columnCount:10,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:3},
          {name:"Relic",start:7,span:3},
          {name:"Heroic",start:10,span:1}
        ]},
        roots:["br_std_head_hunter","br_std_extended_magazine"],
        exclusiveGroups:[["br_std_head_hunter","br_std_extended_magazine"]],
        connections:[
          ["br_std_head_hunter","br_mc_adamant_hunter"],
          ["br_std_extended_magazine","br_mc_magazine_restoration"],
          ["br_mc_adamant_hunter","br_mc_fast_reload"],
          ["br_mc_magazine_restoration","br_mc_perpetual_precision"],
          ["br_mc_fast_reload","br_mc_perpetual_precision"],
          ["br_mc_fast_reload","br_art_able_reload"],
          ["br_mc_perpetual_precision","br_art_able_precision"],
          ["br_art_able_reload","br_art_recoupment"],
          ["br_art_able_precision","br_art_great_might"],
          ["br_art_head_hunter","br_art_recoupment"],
          ["br_art_recoupment","br_art_great_might"],
          ["br_art_recoupment","br_art_adamantine_grip"],
          ["br_art_great_might","br_art_cleaving_fire"],
          ["br_art_great_might","br_art_increased_capacity"],
          ["br_art_adamantine_grip","br_relic_rapid_health"],
          ["br_art_cleaving_fire","br_relic_rampage"],
          ["br_relic_rapid_health","br_relic_head_hunter"],
          ["br_relic_rampage","br_relic_extended_magazine"],
          ["br_relic_reloading_immunity","br_relic_head_hunter"],
          ["br_relic_head_hunter","br_relic_extended_magazine"],
          ["br_relic_head_hunter","br_relic_perpetual_penetration"],
          ["br_relic_extended_magazine","br_relic_divine_might"],
          ["br_relic_extended_magazine","br_relic_honed_precision"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["br_std_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:0,row:1}],
            ["br_std_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["br_mc_adamant_hunter","Adamant Hunter","When your Health is below 30%, Headshots deal 25% more Damage.",{column:1,row:1}],
            ["br_mc_magazine_restoration","Magazine Restoration","When your Health drops below 30%, your Ammo Reserve is restored by a full Magazine. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{column:1,row:2}],
            ["br_mc_fast_reload","Fast Reload","Reload all Weapons 10% faster.",{column:2,row:1}],
            ["br_mc_perpetual_precision","Perpetual Precision","Maximum Spread decreases by 10%.",{column:2,row:2}]
          ]},
          {name:"Artificer",perks:[
            ["br_art_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:4,row:0}],
            ["br_art_able_reload","Able Reload","After using a Class Ability, the equipped Weapon instantly reloads.",{column:3,row:1}],
            ["br_art_recoupment","Recoupment","Killing a Majoris-level or higher enemy with a headshot with this Weapon restores 1 Armour Segment. Cooldown is 15 seconds.",{column:4,row:1}],
            ["br_art_adamantine_grip","Adamantine Grip","Recoil is reduced by 25%.",{column:5,row:1}],
            ["br_art_able_precision","Able Precision","After using a Class Ability, Maximum Spread decreases by 25% for 5 seconds.",{column:3,row:2}],
            ["br_art_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:4,row:2}],
            ["br_art_cleaving_fire","Cleaving Fire","Shots will penetrate enemy Block Stances, dealing 25% of the usual Damage.",{column:5,row:2}],
            ["br_art_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:4,row:3}]
          ]},
          {name:"Relic",perks:[
            ["br_relic_reloading_immunity","Reloading Immunity","While reloading, you do not lose control from Heavy Hits.",{column:7,row:0}],
            ["br_relic_rapid_health","Rapid Health","When your Health is below 30%, killing 7 enemies in rapid succession restores Health by 10%. Cooldown is 0 seconds.",{column:6,row:1}],
            ["br_relic_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:7,row:1}],
            ["br_relic_perpetual_penetration","Perpetual Penetration","Each shot penetrates 1 additional target.",{column:8,row:1}],
            ["br_relic_rampage","Rampage","After killing 7 enemies in rapid succession, you deal 25% more Damage for 10 seconds. Cooldown is 15 seconds.",{column:6,row:2}],
            ["br_relic_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:7,row:2}],
            ["br_relic_divine_might","Divine Might","Damage increases by 10%.",{column:8,row:2}],
            ["br_relic_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{column:7,row:3}]
          ]},
          {name:"Heroic",perks:[
            ["br_heroic_combi_weapon","Combi-Weapon","You can use an alternative Melta firing mode, accessed through Augmented Vision scope mode.",{column:9,row:1,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      },
      "Heavy Bolt Rifle": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_of_bakka_alpha",tier:"Artificer",name:"Salvation of Bakka - Alpha"},
          {id:"salvation_of_bakka_beta",tier:"Artificer",name:"Salvation of Bakka - Beta"},
          {id:"drogos_reclamation_alpha",tier:"Artificer",name:"Drogos Reclamation - Alpha"},
          {id:"drogos_reclamation_beta",tier:"Artificer",name:"Drogos Reclamation - Beta"},
          {id:"gathalamor_crusade_alpha",tier:"Relic",name:"Gathalamor Crusade - Alpha"},
          {id:"gathalamor_crusade_beta",tier:"Relic",name:"Gathalamor Crusade - Beta"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"},
          {id:"deathwatch",tier:"Heroic",name:"Deathwatch"}
        ],
        layout:{columnCount:10,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:3},
          {name:"Relic",start:7,span:3},
          {name:"Heroic",start:10,span:1}
        ]},
        roots:["hbr_std_head_hunter","hbr_std_extended_magazine"],
        exclusiveGroups:[["hbr_std_head_hunter","hbr_std_extended_magazine"]],
        connections:[
          ["hbr_std_head_hunter","hbr_mc_adamant_hunter"],
          ["hbr_std_extended_magazine","hbr_mc_magazine_restoration"],
          ["hbr_mc_adamant_hunter","hbr_mc_fast_reload"],
          ["hbr_mc_magazine_restoration","hbr_mc_cleaving_fire"],
          ["hbr_mc_fast_reload","hbr_mc_cleaving_fire"],
          ["hbr_mc_fast_reload","hbr_art_able_reload"],
          ["hbr_mc_cleaving_fire","hbr_art_remote_threat"],
          ["hbr_art_able_reload","hbr_art_head_hunter"],
          ["hbr_art_remote_threat","hbr_art_great_might"],
          ["hbr_art_tactical_precision","hbr_art_head_hunter"],
          ["hbr_art_head_hunter","hbr_art_great_might"],
          ["hbr_art_head_hunter","hbr_art_adamantine_grip"],
          ["hbr_art_great_might","hbr_art_cleaving_fire"],
          ["hbr_art_great_might","hbr_art_increased_capacity"],
          ["hbr_art_adamantine_grip","hbr_relic_rapid_health"],
          ["hbr_art_cleaving_fire","hbr_relic_rampage"],
          ["hbr_relic_rapid_health","hbr_relic_perpetual_penetration"],
          ["hbr_relic_rampage","hbr_relic_extended_magazine"],
          ["hbr_relic_reloading_immunity","hbr_relic_perpetual_penetration"],
          ["hbr_relic_perpetual_penetration","hbr_relic_extended_magazine"],
          ["hbr_relic_perpetual_penetration","hbr_relic_divine_might"],
          ["hbr_relic_extended_magazine","hbr_relic_remote_threat"],
          ["hbr_relic_extended_magazine","hbr_relic_honed_precision"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["hbr_std_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:0,row:1}],
            ["hbr_std_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["hbr_mc_adamant_hunter","Adamant Hunter","When your Health is below 30%, Headshots deal 25% more Damage.",{column:1,row:1}],
            ["hbr_mc_magazine_restoration","Magazine Restoration","When your Health drops below 30%, your Ammo Reserve is restored by a full Magazine. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{column:1,row:2}],
            ["hbr_mc_fast_reload","Fast Reload","Reload all Weapons 10% faster.",{column:2,row:1}],
            ["hbr_mc_cleaving_fire","Cleaving Fire","Shots will penetrate enemy Block Stances, dealing 25% of the usual Damage.",{column:2,row:2}]
          ]},
          {name:"Artificer",perks:[
            ["hbr_art_tactical_precision","Tactical Precision","Headshots deal 30% more Damage. Ranged Damage decreases by 10%.",{column:4,row:0}],
            ["hbr_art_able_reload","Able Reload","After using a Class Ability, the equipped Weapon instantly reloads.",{column:3,row:1}],
            ["hbr_art_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:4,row:1}],
            ["hbr_art_adamantine_grip","Adamantine Grip","Recoil is reduced by 25%.",{column:5,row:1}],
            ["hbr_art_remote_threat","Remote Threat","Enemies at a distance of more than 25 metres take 20% more Damage.",{column:3,row:2}],
            ["hbr_art_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:4,row:2}],
            ["hbr_art_cleaving_fire","Cleaving Fire","Shots will penetrate enemy Block Stances, dealing 25% of the usual Damage.",{column:5,row:2}],
            ["hbr_art_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:4,row:3}]
          ]},
          {name:"Relic",perks:[
            ["hbr_relic_reloading_immunity","Reloading Immunity","While reloading, you do not lose control from Heavy Hits.",{column:7,row:0}],
            ["hbr_relic_rapid_health","Rapid Health","When your Health is below 30%, killing 7 enemies in rapid succession restores Health by 10%. Cooldown is 0 seconds.",{column:6,row:1}],
            ["hbr_relic_perpetual_penetration","Perpetual Penetration","Each shot penetrates 1 additional target.",{column:7,row:1}],
            ["hbr_relic_divine_might","Divine Might","Damage increases by 10%.",{column:8,row:1}],
            ["hbr_relic_rampage","Rampage","After killing 7 enemies in rapid succession, you deal 25% more Damage for 10 seconds. Cooldown is 15 seconds.",{column:6,row:2}],
            ["hbr_relic_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:7,row:2}],
            ["hbr_relic_remote_threat","Remote Threat","Enemies at a distance of more than 25 metres take 20% more Damage.",{column:8,row:2}],
            ["hbr_relic_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{column:7,row:3}]
          ]},
          {name:"Heroic",perks:[
            ["hbr_heroic_deathwatch","Deathwatch","Toggle to Augmented Vision mode to activate auxiliary grenade launcher.",{column:9,row:1,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      },
      "Occulus Bolt Carbine": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_of_bakka_alpha",tier:"Artificer",name:"Salvation of Bakka - Alpha"},
          {id:"salvation_of_bakka_beta",tier:"Artificer",name:"Salvation of Bakka - Beta"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"gathalamor_crusade_alpha",tier:"Relic",name:"Gathalamor Crusade - Alpha"},
          {id:"gathalamor_crusade_beta",tier:"Relic",name:"Gathalamor Crusade - Beta"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"}
        ],
        layout:{columnCount:8,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:2},
          {name:"Relic",start:6,span:3}
        ]},
        roots:["oc_std_remote_threat","oc_std_great_might"],
        exclusiveGroups:[["oc_std_remote_threat","oc_std_great_might"]],
        connections:[
          ["oc_std_remote_threat","oc_mc_elusive_precision"],
          ["oc_std_great_might","oc_mc_retaliation"],
          ["oc_mc_elusive_precision","oc_mc_fast_reload"],
          ["oc_mc_retaliation","oc_mc_perpetual_penetration"],
          ["oc_mc_fast_reload","oc_mc_perpetual_penetration"],
          ["oc_mc_fast_reload","oc_art_finisher_reload"],
          ["oc_mc_perpetual_penetration","oc_art_reloading_immunity"],
          ["oc_art_finisher_reload","oc_art_recoupment"],
          ["oc_art_reloading_immunity","oc_art_extended_magazine"],
          ["oc_art_honed_precision","oc_art_recoupment"],
          ["oc_art_recoupment","oc_art_extended_magazine"],
          ["oc_art_extended_magazine","oc_art_divine_might"],
          ["oc_art_recoupment","oc_relic_rapid_health"],
          ["oc_art_extended_magazine","oc_relic_magazine_restoration"],
          ["oc_relic_rapid_health","oc_relic_divine_might"],
          ["oc_relic_magazine_restoration","oc_relic_increased_capacity"],
          ["oc_relic_head_hunter","oc_relic_divine_might"],
          ["oc_relic_divine_might","oc_relic_increased_capacity"],
          ["oc_relic_increased_capacity","oc_relic_great_might"],
          ["oc_relic_divine_might","oc_relic_able_headshot"],
          ["oc_relic_increased_capacity","oc_relic_able_damage"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["oc_std_remote_threat","Remote Threat","Enemies at a distance of more than 25 metres take 20% more Damage.",{column:0,row:1}],
            ["oc_std_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["oc_mc_elusive_precision","Elusive Precision","After a perfectly timed Dodge, Maximum Spread decreases by 25% for 10 seconds.",{column:1,row:1}],
            ["oc_mc_fast_reload","Fast Reload","Reload all Weapons 10% faster.",{column:2,row:1}],
            ["oc_mc_retaliation","Retaliation","After a perfectly timed Dodge, you deal 25% more Damage for 10 seconds.",{column:1,row:2}],
            ["oc_mc_perpetual_penetration","Perpetual Penetration","Each shot penetrates 1 additional target.",{column:2,row:2}]
          ]},
          {name:"Artificer",perks:[
            ["oc_art_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{column:4,row:0}],
            ["oc_art_finisher_reload","Finisher Reload","After a Finisher, the equipped Weapon instantly reloads.",{column:3,row:1}],
            ["oc_art_recoupment","Recoupment","Killing a Majoris-level or higher enemy with a headshot with this Weapon restores 1 Armour Segment. Cooldown is 15 seconds.",{column:4,row:1}],
            ["oc_art_reloading_immunity","Reloading Immunity","While reloading, you do not lose control from Heavy Hits.",{column:3,row:2}],
            ["oc_art_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:4,row:2}],
            ["oc_art_divine_might","Divine Might","Damage increases by 10%.",{column:4,row:3}]
          ]},
          {name:"Relic",perks:[
            ["oc_relic_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:6,row:0}],
            ["oc_relic_rapid_health","Rapid Health","When your Health is below 30%, killing 7 enemies in rapid succession restores Health by 10%. Cooldown is 0 seconds.",{column:5,row:1}],
            ["oc_relic_divine_might","Divine Might","Damage increases by 10%.",{column:6,row:1}],
            ["oc_relic_able_headshot","Able Headshot","After using a Class Ability, Headshot Damage increases by 20% for 10 seconds.",{column:7,row:1}],
            ["oc_relic_magazine_restoration","Magazine Restoration","When your Health drops below 30%, your Ammo Reserve is restored by a full Magazine. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{column:5,row:2}],
            ["oc_relic_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:6,row:2}],
            ["oc_relic_able_damage","Able Damage","After using a Class Ability, Damage increases by 20% for 10 seconds.",{column:7,row:2}],
            ["oc_relic_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:6,row:3}]
          ]}
        ]
      }
    }
  },
  secondary: {
    label:"Secondary",
    weapons:{
      "Bolt Pistol": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"},
          {id:"honourific_relic",tier:"Heroic",name:"Honourific Relic"}
        ],
        layout:{columnCount:9,rowCount:2,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:2},
          {name:"Relic",start:6,span:3},
          {name:"Heroic",start:9,span:1}
        ]},
        roots:["bp_std_perpetual_precision","bp_std_great_might"],
        exclusiveGroups:[["bp_std_perpetual_precision","bp_std_great_might"]],
        connections:[
          ["bp_std_perpetual_precision","bp_mc_head_hunter"],
          ["bp_std_great_might","bp_mc_retaliation"],
          ["bp_mc_head_hunter","bp_mc_gun_strike_reload"],
          ["bp_mc_retaliation","bp_mc_iron_grip"],
          ["bp_mc_gun_strike_reload","bp_mc_iron_grip"],
          ["bp_mc_gun_strike_reload","bp_art_increased_capacity"],
          ["bp_mc_iron_grip","bp_art_divine_might"],
          ["bp_art_increased_capacity","bp_art_head_hunter"],
          ["bp_art_divine_might","bp_art_extended_magazine"],
          ["bp_art_head_hunter","bp_art_extended_magazine"],
          ["bp_art_head_hunter","bp_relic_elite_hunter"],
          ["bp_art_extended_magazine","bp_relic_rapid_health"],
          ["bp_relic_elite_hunter","bp_relic_head_hunter"],
          ["bp_relic_rapid_health","bp_relic_extended_magazine"],
          ["bp_relic_head_hunter","bp_relic_extended_magazine"],
          ["bp_relic_head_hunter","bp_relic_honed_precision"],
          ["bp_relic_extended_magazine","bp_relic_divine_might"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["bp_std_perpetual_precision","Perpetual Precision","Maximum Spread decreases by 10%.",{column:0,row:0}],
            ["bp_std_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:0,row:1}]
          ]},
          {name:"Master-Crafted",perks:[
            ["bp_mc_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:1,row:0}],
            ["bp_mc_gun_strike_reload","Gun Strike Reload","After a Gun Strike, the equipped Weapon instantly reloads.",{column:2,row:0}],
            ["bp_mc_retaliation","Retaliation","After a perfectly timed Dodge, you deal 25% more Damage for 10 seconds.",{column:1,row:1}],
            ["bp_mc_iron_grip","Iron Grip","After a Gun Strike, Recoil is reduced by 35% for 10 seconds.",{column:2,row:1}]
          ]},
          {name:"Artificer",perks:[
            ["bp_art_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:3,row:0}],
            ["bp_art_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:4,row:0}],
            ["bp_art_divine_might","Divine Might","Damage increases by 10%.",{column:3,row:1}],
            ["bp_art_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:4,row:1}]
          ]},
          {name:"Relic",perks:[
            ["bp_relic_elite_hunter","Elite Hunter","After killing a Majoris-level or higher enemy with a Melee Weapon, Headshots deal 50% more Damage for 10 seconds.",{column:5,row:0}],
            ["bp_relic_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:6,row:0}],
            ["bp_relic_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{column:7,row:0}],
            ["bp_relic_rapid_health","Rapid Health","When your Health is below 30%, killing 7 enemies in rapid succession restores Health by 10%. Cooldown is 0 seconds.",{column:5,row:1}],
            ["bp_relic_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:6,row:1}],
            ["bp_relic_divine_might","Divine Might","Damage increases by 10%.",{column:7,row:1}]
          ]},
          {name:"Heroic",perks:[
            ["bp_heroic_burst_fire","Burst Fire","You can fire shots in 3-round bursts.",{column:8,row:0,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      },
      "Heavy Bolt Pistol": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"master_crafted_gamma",tier:"Master-Crafted",name:"Master-Crafted - Gamma"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"drogos_reclamation_alpha",tier:"Artificer",name:"Drogos Reclamation - Alpha"},
          {id:"drogos_reclamation_beta",tier:"Artificer",name:"Drogos Reclamation - Beta"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"},
          {id:"retributions_bequest",tier:"Heroic",name:"Retribution's Bequest"}
        ],
        layout:{columnCount:11,rowCount:2,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:3},
          {name:"Artificer",start:5,span:3},
          {name:"Relic",start:8,span:3},
          {name:"Heroic",start:11,span:1}
        ]},
        roots:["hbp_std_head_hunter","hbp_std_divine_might"],
        exclusiveGroups:[["hbp_std_head_hunter","hbp_std_divine_might"]],
        connections:[
          ["hbp_std_head_hunter","hbp_mc_adamantine_grip"],
          ["hbp_std_divine_might","hbp_mc_perpetual_penetration"],
          ["hbp_mc_adamantine_grip","hbp_mc_rapid_health"],
          ["hbp_mc_perpetual_penetration","hbp_mc_increased_capacity"],
          ["hbp_mc_rapid_health","hbp_mc_increased_capacity"],
          ["hbp_mc_rapid_health","hbp_mc_remote_threat"],
          ["hbp_mc_increased_capacity","hbp_mc_extended_magazine"],
          ["hbp_mc_remote_threat","hbp_art_perpetual_precision"],
          ["hbp_mc_extended_magazine","hbp_art_death_strike"],
          ["hbp_art_perpetual_precision","hbp_art_discipline"],
          ["hbp_art_death_strike","hbp_art_great_might"],
          ["hbp_art_discipline","hbp_art_great_might"],
          ["hbp_art_discipline","hbp_art_strong_finish"],
          ["hbp_art_great_might","hbp_art_strong_start"],
          ["hbp_art_strong_finish","hbp_relic_adamant_hunter"],
          ["hbp_art_strong_start","hbp_relic_able_damage"],
          ["hbp_relic_adamant_hunter","hbp_relic_gun_strike_reload"],
          ["hbp_relic_able_damage","hbp_relic_honed_precision"],
          ["hbp_relic_gun_strike_reload","hbp_relic_honed_precision"],
          ["hbp_relic_gun_strike_reload","hbp_relic_head_hunter"],
          ["hbp_relic_honed_precision","hbp_relic_divine_might"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["hbp_std_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:0,row:0}],
            ["hbp_std_divine_might","Divine Might","Damage increases by 10%.",{column:0,row:1}]
          ]},
          {name:"Master-Crafted",perks:[
            ["hbp_mc_adamantine_grip","Adamantine Grip","Recoil is reduced by 25%.",{column:1,row:0}],
            ["hbp_mc_rapid_health","Rapid Health","When your Health is below 30%, killing 7 enemies in rapid succession restores Health by 10%. Cooldown is 0 seconds.",{column:2,row:0}],
            ["hbp_mc_remote_threat","Remote Threat","Enemies at a distance of more than 25 metres take 20% more Damage.",{column:3,row:0}],
            ["hbp_mc_perpetual_penetration","Perpetual Penetration","Each shot penetrates 1 additional target.",{column:1,row:1}],
            ["hbp_mc_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:2,row:1}],
            ["hbp_mc_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:3,row:1}]
          ]},
          {name:"Artificer",perks:[
            ["hbp_art_perpetual_precision","Perpetual Precision","Maximum Spread decreases by 10%.",{column:4,row:0}],
            ["hbp_art_discipline","Discipline","When you have Low Ammo, you deal 25% more Damage.",{column:5,row:0}],
            ["hbp_art_strong_finish","Strong Finish","Last round in a magazine deals 50% more Damage.",{column:6,row:0}],
            ["hbp_art_death_strike","Death Strike","After killing a Majoris-level or higher enemy with a Melee Weapon, you deal 25% more Damage for 10 seconds.",{column:4,row:1}],
            ["hbp_art_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:5,row:1}],
            ["hbp_art_strong_start","Strong Start","First round in a magazine deals 25% more Damage.",{column:6,row:1}]
          ]},
          {name:"Relic",perks:[
            ["hbp_relic_adamant_hunter","Adamant Hunter","When your Health is below 30%, Headshots deal 25% more Damage.",{column:7,row:0}],
            ["hbp_relic_gun_strike_reload","Gun Strike Reload","After a Gun Strike, the equipped Weapon instantly reloads.",{column:8,row:0}],
            ["hbp_relic_head_hunter","Head Hunter","Headshots deal 10% more Damage.",{column:9,row:0}],
            ["hbp_relic_able_damage","Able Damage","After using a Class Ability, Damage increases by 20% for 10 seconds.",{column:7,row:1}],
            ["hbp_relic_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{column:8,row:1}],
            ["hbp_relic_divine_might","Divine Might","Damage increases by 10%.",{column:9,row:1}]
          ]},
          {name:"Heroic",perks:[
            ["hbp_heroic_no_help_is_coming","No Help Is Coming","Shooting an enemy with the status of Elite Scream stops it from calling for reinforcements.",{column:10,row:0,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      },
      "Plasma Pistol": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"drogos_reclamation_alpha",tier:"Artificer",name:"Drogos Reclamation - Alpha"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"},
          {id:"relic_battle_worn",tier:"Heroic",name:"Relic Battle-worn"}
        ],
        layout:{columnCount:9,rowCount:2,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:3},
          {name:"Relic",start:7,span:2},
          {name:"Heroic",start:9,span:1}
        ]},
        roots:["pp_std_plasma_collection","pp_std_fast_venting"],
        exclusiveGroups:[["pp_std_plasma_collection","pp_std_fast_venting"]],
        connections:[
          ["pp_std_plasma_collection","pp_mc_rapid_cooling"],
          ["pp_std_fast_venting","pp_mc_rampage"],
          ["pp_mc_rapid_cooling","pp_mc_plasma_collection"],
          ["pp_mc_rampage","pp_mc_divine_might"],
          ["pp_mc_plasma_collection","pp_mc_divine_might"],
          ["pp_mc_plasma_collection","pp_art_blast_radius_a"],
          ["pp_mc_divine_might","pp_art_great_might"],
          ["pp_art_blast_radius_a","pp_art_perpetual_velocity"],
          ["pp_art_great_might","pp_art_plasma_collection"],
          ["pp_art_perpetual_velocity","pp_art_plasma_collection"],
          ["pp_art_perpetual_velocity","pp_art_efficient_charge"],
          ["pp_art_plasma_collection","pp_art_blast_radius_b"],
          ["pp_art_efficient_charge","pp_relic_perfect_cooling"],
          ["pp_art_blast_radius_b","pp_relic_retaliation"],
          ["pp_relic_perfect_cooling","pp_relic_charged_cooling"],
          ["pp_relic_retaliation","pp_relic_divine_might"],
          ["pp_relic_charged_cooling","pp_relic_divine_might"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["pp_std_plasma_collection","Plasma Collection","Energy reserve of Plasma Weapons increases by 20%.",{column:0,row:0}],
            ["pp_std_fast_venting","Fast Venting","Weapon cools 15% faster.",{column:0,row:1}]
          ]},
          {name:"Master-Crafted",perks:[
            ["pp_mc_rapid_cooling","Rapid Cooling","After killing 7 enemies in rapid succession, Weapons do not heat for 10 seconds. Cooldown is 15 seconds.",{column:1,row:0}],
            ["pp_mc_plasma_collection","Plasma Collection","Energy reserve of Plasma Weapons increases by 20%.",{column:2,row:0}],
            ["pp_mc_rampage","Rampage","After killing 7 enemies in rapid succession, you deal 25% more Damage for 10 seconds. Cooldown is 15 seconds.",{column:1,row:1}],
            ["pp_mc_divine_might","Divine Might","Damage increases by 10%.",{column:2,row:1}]
          ]},
          {name:"Artificer",perks:[
            ["pp_art_blast_radius_a","Blast Radius","Damage radius of a Charged Shot increases by 10%.",{column:3,row:0}],
            ["pp_art_perpetual_velocity","Perpetual Velocity","Shots Charge 20% faster.",{column:4,row:0}],
            ["pp_art_efficient_charge","Efficient Charge","Charged Shots from Plasma Weapons use 2 less energy.",{column:5,row:0}],
            ["pp_art_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:3,row:1}],
            ["pp_art_plasma_collection","Plasma Collection","Energy reserve of Plasma Weapons increases by 20%.",{column:4,row:1}],
            ["pp_art_blast_radius_b","Blast Radius","Damage radius of a Charged Shot increases by 10%.",{column:5,row:1}]
          ]},
          {name:"Relic",perks:[
            ["pp_relic_perfect_cooling","Perfect Cooling","After a perfectly timed Dodge, the equipped Weapon is completely cooled.",{column:6,row:0}],
            ["pp_relic_charged_cooling","Charged Cooling","Charged Shots generate 10% less Heat.",{column:7,row:0}],
            ["pp_relic_retaliation","Retaliation","After a perfectly timed Dodge, you deal 25% more Damage for 10 seconds.",{column:6,row:1}],
            ["pp_relic_divine_might","Divine Might","Damage increases by 10%.",{column:7,row:1}]
          ]},
          {name:"Heroic",perks:[
            ["pp_heroic_overcharged_plasma_coils","Overcharged Plasma Coils","Only fires Charged Shots with increased damage, but charge time is longer.",{column:8,row:0,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      },
      "Inferno Pistol": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"ophelian_liberation",tier:"Relic",name:"Ophelian Liberation"}
        ],
        layout:{columnCount:7,rowCount:2,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:2},
          {name:"Relic",start:6,span:2}
        ]},
        roots:["ip_std_divine_might","ip_std_perpetual_range"],
        exclusiveGroups:[["ip_std_divine_might","ip_std_perpetual_range"]],
        connections:[
          ["ip_std_divine_might","ip_mc_motivated_melee"],
          ["ip_std_perpetual_range","ip_mc_braced_reload"],
          ["ip_mc_motivated_melee","ip_mc_great_might"],
          ["ip_mc_braced_reload","ip_mc_perpetual_range"],
          ["ip_mc_great_might","ip_mc_perpetual_range"],
          ["ip_mc_great_might","ip_art_fast_reload"],
          ["ip_mc_perpetual_range","ip_art_increased_capacity"],
          ["ip_art_fast_reload","ip_art_motivated_melee"],
          ["ip_art_increased_capacity","ip_art_adamant_restoration"],
          ["ip_art_motivated_melee","ip_art_adamant_restoration"],
          ["ip_art_motivated_melee","ip_relic_one_shot"],
          ["ip_art_adamant_restoration","ip_relic_extra_shot"],
          ["ip_relic_one_shot","ip_relic_rapid_health"],
          ["ip_relic_extra_shot","ip_relic_trick_shot"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["ip_std_divine_might","Divine Might","Damage increases by 10%.",{column:0,row:0}],
            ["ip_std_perpetual_range","Perpetual Range","Effective Range increases by 1 metre.",{column:0,row:1}]
          ]},
          {name:"Master-Crafted",perks:[
            ["ip_mc_motivated_melee","Motivated Melee","Melee Damage increases by 20% if this Weapon has no Ammo in its Magazine.",{column:1,row:0}],
            ["ip_mc_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:2,row:0}],
            ["ip_mc_braced_reload","Braced Reload","You are immune to Heavy Hits while reloading. Cooldown is 15 seconds.",{column:1,row:1}],
            ["ip_mc_perpetual_range","Perpetual Range","Effective Range increases by 1 metre.",{column:2,row:1}]
          ]},
          {name:"Artificer",perks:[
            ["ip_art_fast_reload","Fast Reload","Reload all Weapons 10% faster.",{column:3,row:0}],
            ["ip_art_motivated_melee","Motivated Melee","If your Armour is fully depleted, Reload Speed increases by 20%.",{column:4,row:0}],
            ["ip_art_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:3,row:1}],
            ["ip_art_adamant_restoration","Adamant Restoration","When your Health drops below 30%, your Ammo Reserve is restored by 25% of the maximum capacity. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{column:4,row:1}]
          ]},
          {name:"Relic",perks:[
            ["ip_relic_one_shot","One Shot","Damage increases by 50%, but this Weapon's Magazine holds only one cartridge.",{column:5,row:0}],
            ["ip_relic_rapid_health","Rapid Health","When your Health is below 30%, killing 7 enemies in rapid succession restores Health by 10%. Cooldown is 0 seconds.",{column:6,row:0}],
            ["ip_relic_extra_shot","Extra Shot","Magazine size increases by an additional cartridge.",{column:5,row:1}],
            ["ip_relic_trick_shot","Trick Shot","Killing 5 enemies with one shot restores 1 Armour Segment. Cooldown is 30 seconds.",{column:6,row:1}]
          ]}
        ]
      },
      "Neo-Volkite Pistol": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"}
        ],
        layout:{columnCount:7,rowCount:2,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:2},
          {name:"Relic",start:6,span:2}
        ]},
        roots:["nvp_std_divine_might","nvp_std_extended_magazine"],
        exclusiveGroups:[["nvp_std_divine_might","nvp_std_extended_magazine"]],
        connections:[
          ["nvp_std_divine_might","nvp_mc_gun_strike_reload"],
          ["nvp_std_extended_magazine","nvp_mc_combustive_momentum"],
          ["nvp_mc_gun_strike_reload","nvp_mc_great_might"],
          ["nvp_mc_combustive_momentum","nvp_mc_increased_capacity"],
          ["nvp_mc_great_might","nvp_mc_increased_capacity"],
          ["nvp_mc_great_might","nvp_art_volkite_discharge_area_a"],
          ["nvp_mc_increased_capacity","nvp_art_volkite_discharge_area_b"],
          ["nvp_art_volkite_discharge_area_a","nvp_art_heat_retention"],
          ["nvp_art_volkite_discharge_area_b","nvp_art_accelerated_combustion"],
          ["nvp_art_heat_retention","nvp_art_accelerated_combustion"],
          ["nvp_art_heat_retention","nvp_relic_volkite_discharge"],
          ["nvp_art_accelerated_combustion","nvp_relic_violent_deflagration"],
          ["nvp_relic_volkite_discharge","nvp_relic_volkite_blitz"],
          ["nvp_relic_violent_deflagration","nvp_relic_distributed_deflagration"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["nvp_std_divine_might","Divine Might","Damage increases by 10%.",{column:0,row:0}],
            ["nvp_std_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:0,row:1}]
          ]},
          {name:"Master-Crafted",perks:[
            ["nvp_mc_gun_strike_reload","Gun Strike Reload","After a Gun Strike, the equipped Weapon instantly reloads.",{column:1,row:0}],
            ["nvp_mc_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:2,row:0}],
            ["nvp_mc_combustive_momentum","Combustive Momentum","After a Gun Strike, rate of thermal Damage increases by 30% for 6 seconds.",{column:1,row:1}],
            ["nvp_mc_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:2,row:1}]
          ]},
          {name:"Artificer",perks:[
            ["nvp_art_volkite_discharge_area_a","Volkite Discharge Area","Volkite discharge area expands by 20%.",{column:3,row:0}],
            ["nvp_art_heat_retention","Heat Retention","Heated enemies cool down 25% slower.",{column:4,row:0}],
            ["nvp_art_volkite_discharge_area_b","Volkite Discharge Area","Volkite discharge area expands by 20%.",{column:3,row:1}],
            ["nvp_art_accelerated_combustion","Accelerated Combustion","Rate of thermal Damage increases by 20%.",{column:4,row:1}]
          ]},
          {name:"Relic",perks:[
            ["nvp_relic_volkite_discharge","Volkite Discharge","After killing a Majoris-level or higher enemy with a Melee Weapon, Damage of volkite discharge increases by 30% for 10 seconds.",{column:5,row:0}],
            ["nvp_relic_volkite_blitz","Volkite Blitz","Volkite discharge Damage increases by 25% and discharge area increases by 25%.",{column:6,row:0}],
            ["nvp_relic_violent_deflagration","Violent Deflagration","After killing a Majoris-level or higher enemy with a Melee Weapon, rate of thermal Damage increases by 30% for 2 seconds.",{column:5,row:1}],
            ["nvp_relic_distributed_deflagration","Distributed Deflagration","Volkite Discharge, in addition to dealing normal Damage, also deals 25% thermal Damage.",{column:6,row:1}]
          ]}
        ]
      }
    }
  },
  melee: {
    label:"Melee",
    weapons:{
      "Omnissian Axe": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Omnissian Axe"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"achortan_oath",tier:"Artificer",name:"Achortan Oath"},
          {id:"salvation_of_bakka_alpha",tier:"Artificer",name:"Salvation of Bakka - Alpha"},
          {id:"salvation_of_bakka_beta",tier:"Artificer",name:"Salvation of Bakka - Beta"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"ultima_ratio",tier:"Heroic",name:"Ultima Ratio"}
        ],
        layout:{columnCount:10,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:3},
          {name:"Artificer",start:5,span:3},
          {name:"Relic",start:8,span:2},
          {name:"Heroic",start:10,span:1}
        ]},
        roots:["axe_std_perpetual_strength","axe_std_perpetual_speed"],
        exclusiveGroups:[["axe_std_perpetual_strength","axe_std_perpetual_speed"]],
        connections:[
          ["axe_std_perpetual_strength","axe_mc_armour_siphon"],
          ["axe_std_perpetual_speed","axe_mc_cleaving_strike"],
          ["axe_mc_armour_siphon","axe_mc_perpetual_strength"],
          ["axe_mc_cleaving_strike","axe_mc_perpetual_speed"],
          ["axe_mc_perpetual_strength","axe_mc_static_charge"],
          ["axe_mc_perpetual_speed","axe_mc_kill_streak"],
          ["axe_mc_static_charge","axe_art_iron_rush"],
          ["axe_mc_kill_streak","axe_art_supercharged_follow_up"],
          ["axe_art_iron_rush","axe_art_armoured_strength"],
          ["axe_art_supercharged_follow_up","axe_art_perpetual_strength"],
          ["axe_art_expose","axe_art_armoured_strength"],
          ["axe_art_armoured_strength","axe_art_perpetual_strength"],
          ["axe_art_perpetual_strength","axe_art_executioner"],
          ["axe_art_armoured_strength","axe_art_rampage"],
          ["axe_art_perpetual_strength","axe_art_energised"],
          ["axe_art_rampage","axe_relic_restorative_takedown"],
          ["axe_art_energised","axe_relic_rapid_charge"],
          ["axe_relic_restorative_takedown","axe_relic_explosive_strike"],
          ["axe_relic_rapid_charge","axe_relic_mighty_blast"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["axe_std_perpetual_strength","Perpetual Strength","Melee Damage increases by 5%.",{column:0,row:1}],
            ["axe_std_perpetual_speed","Perpetual Speed","Melee Attack Speed increases by 5%.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["axe_mc_armour_siphon","Armour Siphon","Killing a foe with Omnissian Strike restores 1 Armour segment. Cooldown is 60 seconds.",{column:1,row:1}],
            ["axe_mc_cleaving_strike","Cleaving Strike","Light Combo attacks with this weapon deal damage to nearby foes around the target.",{column:1,row:2}],
            ["axe_mc_perpetual_strength","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:1}],
            ["axe_mc_perpetual_speed","Perpetual Speed","Melee Attack Speed increases by 5%.",{column:2,row:2}],
            ["axe_mc_static_charge","Static Charge","Each foe hit during Omnissian Rush increases Damage by 10% for 4 seconds.",{column:3,row:1}],
            ["axe_mc_kill_streak","Kill Streak","After killing 7 enemies in rapid succession with a Light Combo, you do not lose control upon taking Heavy Hits and cannot be knocked back for 5 seconds. Cooldown is 10 seconds.",{column:3,row:2}]
          ]},
          {name:"Artificer",perks:[
            ["axe_art_expose","Expose","Foes hit by Omnissian Rush or Omnissian Strike take 15% increased damage for 5 seconds.",{column:5,row:0}],
            ["axe_art_iron_rush","Iron Rush","Incoming ranged damage is reduced by 50% while using Omnissian Rush.",{column:4,row:1}],
            ["axe_art_armoured_strength","Armoured Strength","If you have Armour remaining, Melee Damage increases by 10%.",{column:5,row:1}],
            ["axe_art_rampage","Rampage","If Omnissian Rush hits 5 or more foes, the Damage of all Melee attacks is increased by 20% for 10 seconds.",{column:6,row:1}],
            ["axe_art_supercharged_follow_up","Supercharged Follow-up","After Power Discharge, the next Light Attack is a powerful Sweeping Whirl.",{column:4,row:2}],
            ["axe_art_perpetual_strength","Perpetual Strength","Melee Damage increases by 5%.",{column:5,row:2}],
            ["axe_art_energised","Energised","While charging and releasing Electric Discharge, you do not lose control upon taking Heavy Hits and cannot be knocked back.",{column:6,row:2}],
            ["axe_art_executioner","Executioner","Electric Discharge damage is increased by 25% against foes hit by your Light Combo within the last 5 seconds.",{column:5,row:3}]
          ]},
          {name:"Relic",perks:[
            ["axe_relic_restorative_takedown","Restorative Takedown","Killing a Majoris-level or higher foe with Sweeping Whirl restores 1 Armour segment if HP is below 30%.",{column:7,row:1}],
            ["axe_relic_explosive_strike","Explosive Strike","Omnissian Strike damage is increased by 40%. On hit, it creates a small energy explosion around the target. Cooldown is 15 seconds.",{column:8,row:1}],
            ["axe_relic_rapid_charge","Rapid Charge","Electric Discharge charges 40% faster.",{column:7,row:2}],
            ["axe_relic_mighty_blast","Mighty Blast","Power Discharge can hit twice. Keep holding to release a second shockwave.",{column:8,row:2}]
          ]},
          {name:"Heroic",perks:[
            ["axe_heroic_word_of_the_omnissiah","Word Of The Omnissiah","The attack after Omnissian Rush deals increased damage based on the duration of the rush.",{column:9,row:1,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      },
      "Combat Knife": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"blood_of_vossus",tier:"Relic",name:"Blood of Vossus"},
          {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
          {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"},
          {id:"power_gladius",tier:"Heroic",name:"Power Gladius"},
          {id:"argent_edge",tier:"Heroic",name:"Argent Edge"}
        ],
        layout:{columnCount:8,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:2},
          {name:"Artificer",start:4,span:2},
          {name:"Relic",start:6,span:2},
          {name:"Heroic",start:8,span:1}
        ]},
        roots:["knife_std_armoured_strength","knife_std_perpetual_strength"],
        exclusiveGroups:[["knife_std_armoured_strength","knife_std_perpetual_strength"]],
        connections:[
          ["knife_std_armoured_strength","knife_mc_sharp_impact"],
          ["knife_std_perpetual_strength","knife_mc_kinetic_energy"],
          ["knife_mc_sharp_impact","knife_mc_perpetual_strength_top"],
          ["knife_mc_kinetic_energy","knife_mc_perpetual_strength_bottom"],
          ["knife_mc_perpetual_strength_top","knife_mc_perpetual_strength_bottom"],
          ["knife_mc_perpetual_strength_top","knife_art_combined_onslaught"],
          ["knife_mc_perpetual_strength_bottom","knife_art_heavy_onslaught"],
          ["knife_art_combined_onslaught","knife_art_tide_of_battle"],
          ["knife_art_heavy_onslaught","knife_art_reeling_blow"],
          ["knife_art_shoulder_bash","knife_art_tide_of_battle"],
          ["knife_art_tide_of_battle","knife_art_reeling_blow"],
          ["knife_art_reeling_blow","knife_art_shadow_stab"],
          ["knife_art_tide_of_battle","knife_relic_terminus_slayer"],
          ["knife_art_reeling_blow","knife_relic_extremis_slayer"],
          ["knife_relic_terminus_slayer","knife_relic_kill_streak"],
          ["knife_relic_extremis_slayer","knife_relic_hard_target"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["knife_std_armoured_strength","Armoured Strength","If you have Armour remaining, Melee Damage increases by 10%.",{column:0,row:1}],
            ["knife_std_perpetual_strength","Perpetual Strength","Melee Damage increases by 5%.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["knife_mc_sharp_impact","Sharp Impact","Right and Left Skull Crusher area-of-effect radius increases by 50%.",{column:1,row:1}],
            ["knife_mc_kinetic_energy","Kinetic Energy","Each consecutive Heavy Attack increases Heavy Attack Melee Damage by 3% (up to 30%) for 3 seconds.",{column:1,row:2}],
            ["knife_mc_perpetual_strength_top","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:1}],
            ["knife_mc_perpetual_strength_bottom","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:2}]
          ]},
          {name:"Artificer",perks:[
            ["knife_art_combined_onslaught","Combined Onslaught","Light Combo attacks with this weapon deal 10% more Melee Damage.",{column:3,row:1}],
            ["knife_art_heavy_onslaught","Heavy Onslaught","Heavy Attacks with this weapon deal 15% more Melee Damage.",{column:3,row:2}],
            ["knife_art_shadow_stab","Shadow Stab","Replace Heavy Swing with Shadow Stab. Hold the Attack button to charge it. Damage increases by 100% per 1 second of charging.",{column:4,row:3}],
            ["knife_art_tide_of_battle","Tide Of Battle","Power Wave forward distance increases from 4 to 8 metres for Whirlwind Slash.",{column:4,row:1}],
            ["knife_art_reeling_blow","Reeling Blow","Enemies hit by Whirlwind Slash deal 30% less Damage for 4 seconds. Cooldown is 10 seconds.",{column:4,row:2}],
            ["knife_art_shoulder_bash","Shoulder Bash","Replace Distant Stab with Shoulder Bash. While evading or sprinting, tap the Attack button to quickly perform an area-of-effect forward attack.",{column:4,row:0}]
          ]},
          {name:"Relic",perks:[
            ["knife_relic_terminus_slayer","Terminus Slayer","Melee Damage against Terminus-level enemies increases by 20%.",{column:5,row:1}],
            ["knife_relic_extremis_slayer","Extremis Slayer","Melee Damage against Extremis-level enemies increases by 15%.",{column:5,row:2}],
            ["knife_relic_kill_streak","Kill Streak","After killing 7 enemies in rapid succession with a Light Combo, you do not lose control upon taking Heavy Hits and cannot be knocked back for 5 seconds. Cooldown is 10 seconds.",{column:6,row:1}],
            ["knife_relic_hard_target","Hard Target","While performing a Light Combo, you take 15% less Ranged Damage.",{column:6,row:2}]
          ]},
          {name:"Heroic",perks:[
            ["knife_heroic_agile_strike","Agile Strike","After a Perfect Dodge, the next melee strike deals 120% more Damage. Can be stacked up to 3 times.",{column:7,row:1}],
            ["knife_heroic_knuckles","Knuckles","Riposte window is shorter, but each riposte deals damage to the attacker.",{column:7,row:2}]
          ]}
        ]
      },
      "Power Sword": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"master_crafted_gamma",tier:"Master-Crafted",name:"Master-Crafted - Gamma"},
          {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
          {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
          {id:"achortan_oath",tier:"Artificer",name:"Achortan Oath"},
          {id:"imperator_blade",tier:"Relic",name:"Imperator Blade"},
          {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
          {id:"warden_blade_alpha",tier:"Relic",name:"Warden Blade - Alpha"},
          {id:"warden_blade_beta",tier:"Relic",name:"Warden Blade - Beta"},
          {id:"xenophase_blade",tier:"Heroic",name:"Xenophase Blade"},
          {id:"salamanders_power_sword",tier:"Heroic",name:"Salamanders Power Sword"}
        ],
        layout:{columnCount:10,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:3},
          {name:"Artificer",start:5,span:2},
          {name:"Relic",start:7,span:3},
          {name:"Heroic",start:10,span:1}
        ]},
        roots:["ps_std_armoured_strength","ps_std_perpetual_strength"],
        exclusiveGroups:[["ps_std_armoured_strength","ps_std_perpetual_strength"]],
        connections:[
          ["ps_std_armoured_strength","ps_mc_master_of_offence"],
          ["ps_std_perpetual_strength","ps_mc_master_of_defence"],
          ["ps_mc_master_of_offence","ps_mc_perpetual_strength_top"],
          ["ps_mc_master_of_defence","ps_mc_perpetual_strength_bottom"],
          ["ps_mc_perpetual_strength_top","ps_mc_perpetual_strength_bottom"],
          ["ps_mc_perpetual_strength_top","ps_mc_momentum_gain"],
          ["ps_mc_perpetual_strength_bottom","ps_mc_tranquility"],
          ["ps_mc_momentum_gain","ps_art_skilled_restoration"],
          ["ps_mc_tranquility","ps_art_melee_onslaught"],
          ["ps_art_skilled_restoration","ps_art_kill_streak"],
          ["ps_art_melee_onslaught","ps_art_hard_target"],
          ["ps_art_slashing_blade","ps_art_kill_streak"],
          ["ps_art_kill_streak","ps_art_hard_target"],
          ["ps_art_hard_target","ps_art_fencing_blade"],
          ["ps_art_kill_streak","ps_relic_reeling_blow"],
          ["ps_art_hard_target","ps_relic_cutting_edge"],
          ["ps_relic_reeling_blow","ps_relic_majoris_slayer"],
          ["ps_relic_cutting_edge","ps_relic_extremis_slayer"],
          ["ps_relic_terminus_slayer","ps_relic_majoris_slayer"],
          ["ps_relic_majoris_slayer","ps_relic_extremis_slayer"],
          ["ps_relic_extremis_slayer","ps_relic_minoris_slayer"],
          ["ps_relic_majoris_slayer","ps_relic_speed_restoration"],
          ["ps_relic_extremis_slayer","ps_relic_power_restoration"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["ps_std_armoured_strength","Armoured Strength","If you have Armour remaining, Melee Damage increases by 10%.",{column:0,row:1}],
            ["ps_std_perpetual_strength","Perpetual Strength","Melee Damage increases by 5%.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["ps_mc_master_of_offence","Master of Offence","After switching sword-combo Style, you deal 20% more Melee Damage for 5 seconds. Cooldown is 10 seconds.",{column:1,row:1}],
            ["ps_mc_master_of_defence","Master of Defence","After switching sword-combo Style, you take 20% less Ranged Damage for 5 seconds. Cooldown is 10 seconds.",{column:1,row:2}],
            ["ps_mc_perpetual_strength_top","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:1}],
            ["ps_mc_perpetual_strength_bottom","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:2}],
            ["ps_mc_momentum_gain","Momentum Gain","Each consecutive Light Attack increases Light Attack Melee Damage by 3% (up to 30%) for 3 seconds.",{column:3,row:1}],
            ["ps_mc_tranquility","Tranquility","While in Power Whirl Stance, you do not lose control upon taking Heavy Hits and you cannot be knocked back.",{column:3,row:2}]
          ]},
          {name:"Artificer",perks:[
            ["ps_art_skilled_restoration","Skilled Restoration","When your Health is below 30%, a Power Whirl hit restores 1 Armour Segment.",{column:4,row:1}],
            ["ps_art_melee_onslaught","Melee Onslaught","This Weapon deals 20% more Melee Damage for 5 seconds. Cooldown is 10 seconds.",{column:4,row:2}],
            ["ps_art_slashing_blade","Slashing Blade","Power Style combo length increases from 3 to 4 strikes.",{column:5,row:0}],
            ["ps_art_kill_streak","Kill Streak","After killing 7 enemies in rapid succession with a Light Combo, you do not lose control upon taking Heavy Hits and cannot be knocked back for 5 seconds. Cooldown is 10 seconds.",{column:5,row:1}],
            ["ps_art_hard_target","Hard Target","While performing a Light Combo, you take 15% less Ranged Damage.",{column:5,row:2}],
            ["ps_art_fencing_blade","Fencing Blade","Speed Style combo length increases from 4 to 5 strikes.",{column:5,row:3}]
          ]},
          {name:"Relic",perks:[
            ["ps_relic_reeling_blow","Reeling Blow","Enemies hit by Power Rake deal 40% less Damage for 8 seconds. Cooldown is 15 seconds.",{column:6,row:1}],
            ["ps_relic_cutting_edge","Cutting Edge","Power Rake deals 50% more Melee Damage.",{column:6,row:2}],
            ["ps_relic_terminus_slayer","Terminus Slayer","Melee Damage against Terminus-level enemies increases by 20%.",{column:7,row:0}],
            ["ps_relic_majoris_slayer","Majoris Slayer","Melee Damage against Majoris-level enemies increases by 10%.",{column:7,row:1}],
            ["ps_relic_extremis_slayer","Extremis Slayer","Melee Damage against Extremis-level enemies increases by 15%.",{column:7,row:2}],
            ["ps_relic_minoris_slayer","Minoris Slayer","Melee Damage against Minoris-level enemies increases by 20%.",{column:7,row:3}],
            ["ps_relic_speed_restoration","Speed Restoration","Speed Style attacks restore 100% more Contested Health.",{column:8,row:1}],
            ["ps_relic_power_restoration","Power Restoration","Power Style attacks restore 100% more Contested Health.",{column:8,row:2}]
          ]},
          {name:"Heroic",perks:[
            ["ps_heroic_ancient_technology","Ancient Technology","Power Rake waves are wider and deal 20% more Damage.",{column:9,row:1}],
            ["ps_heroic_nocturnes_retort","Nocturne's Retort","Perfect Parries grant Power stacks that empower the next Speed Style Light Attack; stacks can build up to 6 and the parry window is shorter.",{column:9,row:2}]
          ]}
        ]
      },
      "Power Axe": {
        treeMode:"connectionGraph",
        variants:[
          {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
          {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
          {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
          {id:"artificer_alpha",tier:"Artificer",name:"Artificer - Alpha"},
          {id:"artificer_beta",tier:"Artificer",name:"Artificer - Beta"},
          {id:"artificer_gamma",tier:"Artificer",name:"Artificer - Gamma"},
          {id:"relic_alpha",tier:"Relic",name:"Relic - Alpha"},
          {id:"relic_beta",tier:"Relic",name:"Relic - Beta"},
          {id:"relic_gamma",tier:"Relic",name:"Relic - Gamma"},
          {id:"encarmine_axe",tier:"Heroic",name:"Encarmine Axe"}
        ],
        layout:{columnCount:10,rowCount:4,tierHeadings:[
          {name:"Standard",start:1,span:1},
          {name:"Master-Crafted",start:2,span:3},
          {name:"Artificer",start:5,span:3},
          {name:"Relic",start:8,span:2},
          {name:"Heroic",start:10,span:1}
        ]},
        roots:["paxe_std_perpetual_speed","paxe_std_perpetual_strength"],
        exclusiveGroups:[["paxe_std_perpetual_speed","paxe_std_perpetual_strength"]],
        connections:[
          ["paxe_std_perpetual_speed","paxe_mc_confident_stance"],
          ["paxe_std_perpetual_strength","paxe_mc_coup_de_grace"],
          ["paxe_mc_confident_stance","paxe_mc_perpetual_strength_top"],
          ["paxe_mc_coup_de_grace","paxe_mc_perpetual_strength_bottom"],
          ["paxe_mc_perpetual_strength_top","paxe_mc_perpetual_strength_bottom"],
          ["paxe_mc_perpetual_strength_top","paxe_mc_patient_stance"],
          ["paxe_mc_perpetual_strength_bottom","paxe_mc_counterattack"],
          ["paxe_mc_endless_slash","paxe_mc_patient_stance"],
          ["paxe_mc_counterattack","paxe_mc_riposte"],
          ["paxe_mc_patient_stance","paxe_art_power_strike"],
          ["paxe_mc_counterattack","paxe_art_hard_target"],
          ["paxe_art_power_strike","paxe_art_power_wave"],
          ["paxe_art_hard_target","paxe_art_tactical_retreat"],
          ["paxe_art_power_wave","paxe_art_minoris_slayer"],
          ["paxe_art_tactical_retreat","paxe_art_cleaver"],
          ["paxe_art_minoris_slayer","paxe_relic_restoration"],
          ["paxe_art_cleaver","paxe_relic_rebound"],
          ["paxe_relic_restoration","paxe_relic_slash_momentum"],
          ["paxe_relic_rebound","paxe_relic_discharge"]
        ],
        tiers:[
          {name:"Standard",perks:[
            ["paxe_std_perpetual_speed","Perpetual Speed","Melee Attack Speed increases by 5%.",{column:0,row:1}],
            ["paxe_std_perpetual_strength","Perpetual Strength","Melee Damage increases by 5%.",{column:0,row:2}]
          ]},
          {name:"Master-Crafted",perks:[
            ["paxe_mc_confident_stance","Confident Stance","While in Power Stance, you do not lose control upon taking Heavy Hits and cannot be knocked back.",{column:1,row:1}],
            ["paxe_mc_coup_de_grace","Coup de Grâce","The last strike of a Light Combo deals 25% more Damage.",{column:1,row:2}],
            ["paxe_mc_perpetual_strength_top","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:1}],
            ["paxe_mc_perpetual_strength_bottom","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:2}],
            ["paxe_mc_endless_slash","Endless Slash","You can endlessly chain Whirl Slash attacks.",{column:3,row:0}],
            ["paxe_mc_patient_stance","Patient Stance","While in Power Stance, you do not lose Contested Health.",{column:3,row:1}],
            ["paxe_mc_counterattack","Counterattack","The first Light Attack within 5 seconds after a Perfect Parry or Perfect Block deals 25% more Damage.",{column:3,row:2}],
            ["paxe_mc_riposte","Riposte","Overhead Strike after performing Power Backstep deals double Damage.",{column:3,row:3}]
          ]},
          {name:"Artificer",perks:[
            ["paxe_art_power_strike","Power Strike","Gun Strike from Power Stance deals 20% more Damage.",{column:4,row:1}],
            ["paxe_art_hard_target","Hard Target","While performing a Light Combo, you take 15% less Ranged Damage.",{column:4,row:2}],
            ["paxe_art_power_wave","Power Wave","Power Backstep wave damages more enemies.",{column:5,row:1}],
            ["paxe_art_tactical_retreat","Tactical Retreat","Power Backstep deals 25% more Damage.",{column:5,row:2}],
            ["paxe_art_minoris_slayer","Minoris Slayer","Melee Damage against Minoris-level enemies increases by 20%.",{column:6,row:1}],
            ["paxe_art_cleaver","Cleaver","Damage increases by 10% against Majoris-level and higher enemies.",{column:6,row:2}]
          ]},
          {name:"Relic",perks:[
            ["paxe_relic_restoration","Restoration","Killing 7 enemies in rapid succession restores 1 Armour Segment. Cooldown is 15 seconds.",{column:7,row:1}],
            ["paxe_relic_rebound","Rebound","Speed Style attacks restore 100% more Contested Health.",{column:7,row:2}],
            ["paxe_relic_slash_momentum","Slash Momentum","Each consecutive Whirl Slash increases its Damage by 3% (up to 30%) for 1 second.",{column:8,row:1}],
            ["paxe_relic_discharge","Discharge","Overhead Strike deals Damage around the target. Cooldown is 15 seconds.",{column:8,row:2}]
          ]},
          {name:"Heroic",perks:[
            ["paxe_heroic_sanguine_edge","Sanguine Edge","Power Backstep can still be performed with the next Heavy Attack, even if you move out of Power Stance.",{column:9,row:1,rowSpan:2,verticalCenter:true}]
          ]}
        ]
      }
    }
  }
};


// Melta Rifle — topology transcribed from the supplied v0.6.2 perk-tree
// screenshot. Explicit horizontal and vertical links mirror the in-game tree.
WEAPONS.primary.weapons["Melta Rifle"]={
  treeMode:"connectionGraph",
  variants:[
    {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
    {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
    {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
    {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
    {id:"drogos_reclamation_alpha",tier:"Artificer",name:"Drogos Reclamation - Alpha"},
    {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
    {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
    {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"},
    {id:"salamanders_melta_rifle",tier:"Heroic",name:"Salamanders Melta Rifle"}
  ],
  layout:{columnCount:9,rowCount:2,tierHeadings:[
    {name:"Standard",start:1,span:1},
    {name:"Master-Crafted",start:2,span:2},
    {name:"Artificer",start:4,span:3},
    {name:"Relic",start:7,span:2},
    {name:"Heroic",start:9,span:1}
  ]},
  roots:["mr_std_extended_magazine","mr_std_decisive_reload"],
  exclusiveGroups:[["mr_std_extended_magazine","mr_std_decisive_reload"]],
  connections:[
    ["mr_std_extended_magazine","mr_mc_magazine_restoration"],
    ["mr_std_decisive_reload","mr_mc_rapid_health"],
    ["mr_mc_magazine_restoration","mr_mc_great_might"],
    ["mr_mc_rapid_health","mr_mc_trick_shot"],
    ["mr_mc_great_might","mr_mc_trick_shot"],
    ["mr_mc_great_might","mr_art_divine_might"],
    ["mr_mc_trick_shot","mr_art_fast_reload_a"],
    ["mr_art_divine_might","mr_art_extended_magazine"],
    ["mr_art_fast_reload_a","mr_art_fast_reload_b"],
    ["mr_art_extended_magazine","mr_art_fast_reload_b"],
    ["mr_art_extended_magazine","mr_art_first_shot"],
    ["mr_art_fast_reload_b","mr_art_reloading_immunity"],
    ["mr_art_first_shot","mr_relic_retaliation"],
    ["mr_art_reloading_immunity","mr_relic_elusive_fire"],
    ["mr_relic_retaliation","mr_relic_perpetual_fire"],
    ["mr_relic_elusive_fire","mr_relic_perpetual_range"]
  ],
  tiers:[
    {name:"Standard",perks:[
      ["mr_std_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:0,row:0}],
      ["mr_std_decisive_reload","Decisive Reload","Performing a Finisher on a Majoris-level or higher enemy restores Melta ammo by 1.",{column:0,row:1}]
    ]},
    {name:"Master-Crafted",perks:[
      ["mr_mc_magazine_restoration","Magazine Restoration","When your Health drops below 30%, your Ammo Reserve is restored by a full Magazine. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{column:1,row:0}],
      ["mr_mc_rapid_health","Rapid Health","When your Health is below 30%, killing 7 enemies in rapid succession restores Health by 10%. Cooldown is 0 seconds.",{column:1,row:1}],
      ["mr_mc_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{column:2,row:0}],
      ["mr_mc_trick_shot","Trick Shot","Killing 5 enemies with one shot restores 1 Armour Segment. Cooldown is 30 seconds.",{column:2,row:1}]
    ]},
    {name:"Artificer",perks:[
      ["mr_art_divine_might","Divine Might","Damage increases by 10%.",{column:3,row:0}],
      ["mr_art_fast_reload_a","Fast Reload","Reload all Weapons 10% faster.",{column:3,row:1}],
      ["mr_art_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:4,row:0}],
      ["mr_art_fast_reload_b","Fast Reload","Reload all Weapons 10% faster.",{column:4,row:1}],
      ["mr_art_first_shot","First Shot","The first shot after a Reload deals 10% more Damage.",{column:5,row:0}],
      ["mr_art_reloading_immunity","Reloading Immunity","While reloading, you do not lose control from Heavy Hits.",{column:5,row:1}]
    ]},
    {name:"Relic",perks:[
      ["mr_relic_retaliation","Retaliation","After a perfectly timed Dodge, you deal 25% more Damage for 10 seconds.",{column:6,row:0}],
      ["mr_relic_elusive_fire","Elusive Fire","After a perfectly timed Dodge, Fire Rate increases by 25% for 10 seconds.",{column:6,row:1}],
      ["mr_relic_perpetual_fire","Perpetual Fire","Fire Rate increases by 10%.",{column:7,row:0}],
      ["mr_relic_perpetual_range","Perpetual Range","Effective Range increases by 1 metre.",{column:7,row:1}]
    ]},
    {name:"Heroic",perks:[
      ["mr_heroic_focused_fusion_beam","Focused Fusion Beam","Shots have increased range and a narrow spread, but must charge before firing.",{column:8,row:0,rowSpan:2,verticalCenter:true}]
    ]}
  ]
};


// Pyreblaster — topology transcribed from the supplied v0.6.4 perk-tree
// screenshot. Only explicit horizontal and vertical links are represented.
WEAPONS.primary.weapons["Pyreblaster"]={
  treeMode:"connectionGraph",
  variants:[
    {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
    {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
    {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
    {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
    {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
    {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
    {id:"ophelian_liberation",tier:"Relic",name:"Ophelian Liberation"}
  ],
  layout:{columnCount:7,rowCount:2,tierHeadings:[
    {name:"Standard",start:1,span:1},
    {name:"Master-Crafted",start:2,span:2},
    {name:"Artificer",start:4,span:2},
    {name:"Relic",start:6,span:2}
  ]},
  roots:["pyreb_std_improved_fast_venting","pyreb_std_perpetual_cooling"],
  exclusiveGroups:[["pyreb_std_improved_fast_venting","pyreb_std_perpetual_cooling"]],
  connections:[
    ["pyreb_std_improved_fast_venting","pyreb_mc_eternal_flame"],
    ["pyreb_std_perpetual_cooling","pyreb_mc_divine_might"],
    ["pyreb_mc_eternal_flame","pyreb_mc_potent_flame"],
    ["pyreb_mc_divine_might","pyreb_mc_contingency_plan"],
    ["pyreb_mc_potent_flame","pyreb_mc_contingency_plan"],
    ["pyreb_mc_potent_flame","pyreb_art_flame_of_ascension"],
    ["pyreb_mc_contingency_plan","pyreb_art_rapid_health"],
    ["pyreb_art_flame_of_ascension","pyreb_art_potent_flame"],
    ["pyreb_art_rapid_health","pyreb_art_flash_burn"],
    ["pyreb_art_potent_flame","pyreb_art_flash_burn"],
    ["pyreb_art_potent_flame","pyreb_relic_resilient_flame"],
    ["pyreb_art_flash_burn","pyreb_relic_increased_capacity"],
    ["pyreb_relic_resilient_flame","pyreb_relic_pure_flame"],
    ["pyreb_relic_increased_capacity","pyreb_relic_flame_of_purification"]
  ],
  tiers:[
    {name:"Standard",perks:[
      ["pyreb_std_improved_fast_venting","Improved Fast Venting","Weapon cools 20% faster.",{column:0,row:0}],
      ["pyreb_std_perpetual_cooling","Perpetual Cooling","Weapon Heating decreases by 20%.",{column:0,row:1}]
    ]},
    {name:"Master-Crafted",perks:[
      ["pyreb_mc_eternal_flame","Eternal Flame","Burning time increases by 20%.",{column:1,row:0}],
      ["pyreb_mc_divine_might","Divine Might","Damage increases by 10%.",{column:1,row:1}],
      ["pyreb_mc_potent_flame","Potent Flame","Burning Damage increases by 15%.",{column:2,row:0}],
      ["pyreb_mc_contingency_plan","Contingency Plan","When your Ammo Reserve is less than 25% of your Ammo capacity, Melee Damage increases by 20%.",{column:2,row:1}]
    ]},
    {name:"Artificer",perks:[
      ["pyreb_art_flame_of_ascension","Flame of Ascension","Burning 5 enemies restores 1 Armour Segment. Cooldown is 30 seconds.",{column:3,row:0}],
      ["pyreb_art_rapid_health","Rapid Health","When your Health is below 30%, killing 7 enemies in rapid succession restores Health by 10%. Cooldown is 0 seconds.",{column:3,row:1}],
      ["pyreb_art_potent_flame","Potent Flame","Burning Damage increases by 15%.",{column:4,row:0}],
      ["pyreb_art_flash_burn","Flash Burn","Enemies at a distance of less than 10 metres take 20% more Damage.",{column:4,row:1}]
    ]},
    {name:"Relic",perks:[
      ["pyreb_relic_resilient_flame","Resilient Flame","Charging time decreases by 75%.",{column:5,row:0}],
      ["pyreb_relic_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:5,row:1}],
      ["pyreb_relic_pure_flame","Pure Flame","Burning Damage increases by 15%. Direct Damage decreases by 50%.",{column:6,row:0}],
      ["pyreb_relic_flame_of_purification","Flame of Purification","Burning enemies take 20% more Melee Damage.",{column:6,row:1}]
    ]}
  ]
};


// Bolt Carbine One-Handed — topology transcribed from the supplied perk-tree
// screenshot. Only explicit horizontal/vertical connections are represented.
WEAPONS.secondary.weapons["Bolt Carbine One-Handed"]={
  treeMode:"connectionGraph",
  variants:[
    {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
    {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
    {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
    {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
    {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
    {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
    {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"}
  ],
  layout:{columnCount:7,rowCount:2,tierHeadings:[
    {name:"Standard",start:1,span:1},
    {name:"Master-Crafted",start:2,span:2},
    {name:"Artificer",start:4,span:2},
    {name:"Relic",start:6,span:2}
  ]},
  roots:["bcoh_std_increased_capacity","bcoh_std_divine_might"],
  exclusiveGroups:[["bcoh_std_increased_capacity","bcoh_std_divine_might"]],
  connections:[
    ["bcoh_std_increased_capacity","bcoh_mc_extended_magazine"],
    ["bcoh_std_divine_might","bcoh_mc_adamant_hunter"],
    ["bcoh_mc_extended_magazine","bcoh_mc_fast_reload"],
    ["bcoh_mc_adamant_hunter","bcoh_mc_cleaving_fire"],
    ["bcoh_mc_fast_reload","bcoh_mc_cleaving_fire"],
    ["bcoh_mc_fast_reload","bcoh_art_remote_threat"],
    ["bcoh_mc_cleaving_fire","bcoh_art_retaliation"],
    ["bcoh_art_remote_threat","bcoh_art_perpetual_precision"],
    ["bcoh_art_retaliation","bcoh_art_tactical_precision"],
    ["bcoh_art_perpetual_precision","bcoh_art_tactical_precision"],
    ["bcoh_art_perpetual_precision","bcoh_relic_victorious_restoration"],
    ["bcoh_art_tactical_precision","bcoh_relic_gun_strike_reload"],
    ["bcoh_relic_victorious_restoration","bcoh_relic_honed_precision"],
    ["bcoh_relic_gun_strike_reload","bcoh_relic_elite_hunter"]
  ],
  tiers:[
    {name:"Standard",perks:[
      ["bcoh_std_increased_capacity","Increased Capacity","The maximum Ammo Reserve of this Weapon increases by 20%.",{column:0,row:0}],
      ["bcoh_std_divine_might","Divine Might","Damage increases by 10%.",{column:0,row:1}]
    ]},
    {name:"Master-Crafted",perks:[
      ["bcoh_mc_extended_magazine","Extended Magazine","Magazine size increases by 15% of the maximum.",{column:1,row:0}],
      ["bcoh_mc_adamant_hunter","Adamant Hunter","When your Health is below 30%, Headshots deal 25% more Damage.",{column:1,row:1}],
      ["bcoh_mc_fast_reload","Fast Reload","Reload all Weapons 10% faster.",{column:2,row:0}],
      ["bcoh_mc_cleaving_fire","Cleaving Fire","Shots will penetrate enemy Block Stances, dealing 25% of the usual Damage.",{column:2,row:1}]
    ]},
    {name:"Artificer",perks:[
      ["bcoh_art_remote_threat","Remote Threat","Enemies at a distance of more than 25 metres take 20% more Damage.",{column:3,row:0}],
      ["bcoh_art_retaliation","Retaliation","After a perfectly timed Dodge, you deal 25% more Damage for 10 seconds.",{column:3,row:1}],
      ["bcoh_art_perpetual_precision","Perpetual Precision","Maximum Spread decreases by 10%.",{column:4,row:0}],
      ["bcoh_art_tactical_precision","Tactical Precision","Headshots deal 30% more Damage. Ranged Damage decreases by 10%.",{column:4,row:1}]
    ]},
    {name:"Relic",perks:[
      ["bcoh_relic_victorious_restoration","Victorious Restoration","Killing 10 enemies in rapid succession restores 1 Armour Segment. Cooldown is 30 seconds.",{column:5,row:0}],
      ["bcoh_relic_gun_strike_reload","Gun Strike Reload","After a Gun Strike, the equipped Weapon instantly reloads.",{column:5,row:1}],
      ["bcoh_relic_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{column:6,row:0}],
      ["bcoh_relic_elite_hunter","Elite Hunter","After killing a Majoris-level or higher enemy with a Melee Weapon, Headshots deal 50% more Damage for 10 seconds.",{column:6,row:1}]
    ]}
  ]
};

// Bulwark melee weapons populated from the current perk-tree architecture.
WEAPONS.melee.weapons["Thunder Hammer"]={
  treeMode:"connectionGraph",
  variants:[
    {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
    {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
    {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
    {id:"master_crafted_gamma",tier:"Master-Crafted",name:"Master-Crafted - Gamma"},
    {id:"salvation_of_bakka_alpha",tier:"Artificer",name:"Salvation of Bakka - Alpha"},
    {id:"salvation_of_bakka_beta",tier:"Artificer",name:"Salvation of Bakka - Beta"},
    {id:"salvation_of_bakka_gamma",tier:"Artificer",name:"Salvation of Bakka - Gamma"},
    {id:"salvation_of_bakka_delta",tier:"Artificer",name:"Salvation of Bakka - Delta"},
    {id:"ophelian_liberation_alpha",tier:"Relic",name:"Ophelian Liberation - Alpha"},
    {id:"ophelian_liberation_beta",tier:"Relic",name:"Ophelian Liberation - Beta"},
    {id:"ophelian_liberation_gamma",tier:"Relic",name:"Ophelian Liberation - Gamma"},
    {id:"storms_dominion",tier:"Heroic",name:"Storm's Dominion"},
    {id:"lord_executioners_axe",tier:"Heroic",name:"Lord Executioner's Axe"}
  ],
  layout:{columnCount:11,rowCount:4,tierHeadings:[
    {name:"Standard",start:1,span:1},
    {name:"Master-Crafted",start:2,span:3},
    {name:"Artificer",start:5,span:3},
    {name:"Relic",start:8,span:3},
    {name:"Heroic",start:11,span:1}
  ]},
  roots:["th_std_armoured_strength","th_std_perpetual_strength"],
  exclusiveGroups:[["th_std_armoured_strength","th_std_perpetual_strength"]],
  connections:[
    ["th_std_armoured_strength","th_mc_calm_before_the_storm"],
    ["th_std_perpetual_strength","th_mc_fast_preparation"],
    ["th_mc_calm_before_the_storm","th_mc_perpetual_strength_top"],
    ["th_mc_fast_preparation","th_mc_perpetual_strength_bottom"],
    ["th_mc_perpetual_strength_top","th_mc_perpetual_strength_bottom"],
    ["th_mc_perpetual_strength_top","th_mc_extremis_slayer"],
    ["th_mc_perpetual_strength_bottom","th_mc_shattering_impact"],
    ["th_mc_extremis_slayer","th_art_reclamation"],
    ["th_mc_shattering_impact","th_art_seismic_chain"],
    ["th_art_reclamation","th_art_offense_initiated"],
    ["th_art_seismic_chain","th_art_perpetual_strength"],
    ["th_art_braced_preparation","th_art_offense_initiated"],
    ["th_art_offense_initiated","th_art_perpetual_strength"],
    ["th_art_perpetual_strength","th_art_after_aftershock"],
    ["th_art_offense_initiated","th_art_hard_target"],
    ["th_art_perpetual_strength","th_art_kill_streak"],
    ["th_art_hard_target","th_relic_patience_rewarded"],
    ["th_art_kill_streak","th_relic_aftershock_improved"],
    ["th_relic_patience_rewarded","th_relic_majoris_slayer"],
    ["th_relic_aftershock_improved","th_relic_minoris_slayer"],
    ["th_relic_majoris_slayer","th_relic_minoris_slayer"],
    ["th_relic_majoris_slayer","th_relic_reeling_blow"],
    ["th_relic_minoris_slayer","th_relic_dead_end"]
  ],
  tiers:[
    {name:"Standard",perks:[
      ["th_std_armoured_strength","Armoured Strength","If you have Armour remaining, Melee Damage increases by 10%.",{column:0,row:1}],
      ["th_std_perpetual_strength","Perpetual Strength","Melee Damage increases by 5%.",{column:0,row:2}]
    ]},
    {name:"Master-Crafted",perks:[
      ["th_mc_calm_before_the_storm","Calm Before The Storm","When preparing Aftershock, you take 10% less Ranged Damage.",{column:1,row:1}],
      ["th_mc_fast_preparation","Fast Preparation","Aftershock preparation time is reduced by 30%.",{column:1,row:2}],
      ["th_mc_perpetual_strength_top","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:1}],
      ["th_mc_perpetual_strength_bottom","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:2}],
      ["th_mc_extremis_slayer","Extremis Slayer","Melee Damage against Extremis-level enemies increases by 15%.",{column:3,row:1}],
      ["th_mc_shattering_impact","Shattering Impact","Ground Slam area-of-effect radius increases by 50%.",{column:3,row:2}]
    ]},
    {name:"Artificer",perks:[
      ["th_art_reclamation","Reclamation","Aftershock and Ground Slam restore 100% more Contested Health.",{column:4,row:1}],
      ["th_art_seismic_chain","Seismic Chain","After performing a Ground Slam, hold the Attack button to perform an additional Ground Slam.",{column:4,row:2}],
      ["th_art_braced_preparation","Braced Preparation","While preparing Aftershock, you do not lose control upon taking Heavy Hits and cannot be knocked back.",{column:5,row:0}],
      ["th_art_offense_initiated","Offense Initiated","If your Armour is fully depleted, this Weapon deals 10% more Melee Damage.",{column:5,row:1}],
      ["th_art_perpetual_strength","Perpetual Strength","Melee Damage increases by 5%.",{column:5,row:2}],
      ["th_art_after_aftershock","After Aftershock","After hitting an enemy with Aftershock, you deal 10% more Melee Damage for 10 seconds.",{column:5,row:3}],
      ["th_art_hard_target","Hard Target","While performing a Light Combo, you take 15% less Ranged Damage.",{column:6,row:1}],
      ["th_art_kill_streak","Kill Streak","After killing 7 enemies in rapid succession with a Light Combo, you do not lose control upon taking Heavy Hits and cannot be knocked back for 5 seconds. Cooldown is 10 seconds.",{column:6,row:2}]
    ]},
    {name:"Relic",perks:[
      ["th_relic_patience_rewarded","Patience Rewarded","Aftershock hit restores 1 Armour Segment.",{column:7,row:1}],
      ["th_relic_aftershock_improved","Aftershock Improved","Aftershock gains an additional spin.",{column:7,row:2}],
      ["th_relic_majoris_slayer","Majoris Slayer","Melee Damage against Majoris-level enemies increases by 10%.",{column:8,row:1}],
      ["th_relic_minoris_slayer","Minoris Slayer","Melee Damage against Minoris-level enemies increases by 20%.",{column:8,row:2}],
      ["th_relic_reeling_blow","Reeling Blow","Enemies hit by Pommel Smash deal 30% less Damage for 4 seconds. Cooldown is 10 seconds.",{column:9,row:1}],
      ["th_relic_dead_end","Dead End","Pommel Smash deals 50% more Damage.",{column:9,row:2}]
    ]},
    {name:"Heroic",perks:[
      ["th_heroic_electrified_thunderclap","Electrified Thunderclap","Fully Charged Attacks leave behind a Shock Grenade effect.",{column:10,row:1}],
      ["th_heroic_whirling_strike","Whirling Strike","Replaces Aftershock with a spinning attack. Hitting at least 5 enemies in one attack grants 1 Adrenaline Surge stack.",{column:10,row:2}]
    ]}
  ]
};

WEAPONS.melee.weapons["Chainsword"]={
  treeMode:"connectionGraph",
  variants:[
    {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
    {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
    {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
    {id:"salvation_of_bakka",tier:"Artificer",name:"Salvation of Bakka"},
    {id:"drogos_reclamation",tier:"Artificer",name:"Drogos Reclamation"},
    {id:"achortan_oath",tier:"Artificer",name:"Achortan Oath"},
    {id:"cholers_teeth",tier:"Relic",name:"Choler's Teeth"},
    {id:"aquilan_dedication",tier:"Relic",name:"Aquilan Dedication"},
    {id:"gathalamor_crusade",tier:"Relic",name:"Gathalamor Crusade"},
    {id:"double_edged_relic",tier:"Heroic",name:"Double-Edged Relic"},
    {id:"white_scars",tier:"Heroic",name:"White Scars"}
  ],
  layout:{columnCount:9,rowCount:4,tierHeadings:[
    {name:"Standard",start:1,span:1},
    {name:"Master-Crafted",start:2,span:2},
    {name:"Artificer",start:4,span:3},
    {name:"Relic",start:7,span:2},
    {name:"Heroic",start:9,span:1}
  ]},
  roots:["cs_std_armoured_strength","cs_std_perpetual_strength"],
  exclusiveGroups:[["cs_std_armoured_strength","cs_std_perpetual_strength"]],
  connections:[
    ["cs_std_armoured_strength","cs_mc_crushing_heel"],
    ["cs_std_perpetual_strength","cs_mc_swift_recovery"],
    ["cs_mc_crushing_heel","cs_mc_perpetual_strength_top"],
    ["cs_mc_swift_recovery","cs_mc_perpetual_strength_bottom"],
    ["cs_mc_perpetual_strength_top","cs_mc_perpetual_strength_bottom"],
    ["cs_mc_perpetual_strength_top","cs_art_reverberating_impact"],
    ["cs_mc_perpetual_strength_bottom","cs_art_saw_blade"],
    ["cs_art_reverberating_impact","cs_art_combined_onslaught"],
    ["cs_art_saw_blade","cs_art_heavy_onslaught"],
    ["cs_art_trampling_stride","cs_art_combined_onslaught"],
    ["cs_art_combined_onslaught","cs_art_heavy_onslaught"],
    ["cs_art_heavy_onslaught","cs_art_full_throttle"],
    ["cs_art_combined_onslaught","cs_art_hard_target"],
    ["cs_art_heavy_onslaught","cs_art_minoris_slayer"],
    ["cs_art_hard_target","cs_relic_majoris_slayer"],
    ["cs_art_minoris_slayer","cs_relic_extremis_slayer"],
    ["cs_relic_majoris_slayer","cs_relic_extremis_slayer"],
    ["cs_relic_majoris_slayer","cs_relic_kill_streak"],
    ["cs_relic_extremis_slayer","cs_relic_momentum_gain"]
  ],
  tiers:[
    {name:"Standard",perks:[
      ["cs_std_armoured_strength","Armoured Strength","If you have Armour remaining, Melee Damage increases by 10%.",{column:0,row:1}],
      ["cs_std_perpetual_strength","Perpetual Strength","Melee Damage increases by 5%.",{column:0,row:2}]
    ]},
    {name:"Master-Crafted",perks:[
      ["cs_mc_crushing_heel","Crushing Heel","Enemies hit by Stomp deal 30% less Damage for 4 seconds. Cooldown is 10 seconds.",{column:1,row:1}],
      ["cs_mc_swift_recovery","Swift Recovery","Heavy Attacks restore 100% more Contested Health. Applies to Quick Punch, Front Kick, Shoulder Bash, and Stomp.",{column:1,row:2}],
      ["cs_mc_perpetual_strength_top","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:1}],
      ["cs_mc_perpetual_strength_bottom","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:2}]
    ]},
    {name:"Artificer",perks:[
      ["cs_art_reverberating_impact","Reverberating Impact","Stomp area-of-effect radius increases by 50%.",{column:3,row:1}],
      ["cs_art_saw_blade","Saw Blade","Light Combo length increases from 4 to 5 strikes.",{column:3,row:2}],
      ["cs_art_trampling_stride","Trampling Stride","After performing a Stomp, hold the Attack button to perform an additional Stomp.",{column:4,row:0}],
      ["cs_art_combined_onslaught","Combined Onslaught","Light Combo Attacks with this Weapon deal 10% more Melee Damage.",{column:4,row:1}],
      ["cs_art_heavy_onslaught","Heavy Onslaught","Heavy Attacks with this Weapon deal 15% more Melee Damage.",{column:4,row:2}],
      ["cs_art_full_throttle","Full Throttle","Switches Punch with Full Throttle. Hold the Attack button to prepare the attack. Damage increases by 100% per 1 second while preparing.",{column:4,row:3}],
      ["cs_art_hard_target","Hard Target","While performing a Light Combo, you take 15% less Ranged Damage.",{column:5,row:1}],
      ["cs_art_minoris_slayer","Minoris Slayer","Melee Damage against Minoris-level enemies increases by 20%.",{column:5,row:2}]
    ]},
    {name:"Relic",perks:[
      ["cs_relic_majoris_slayer","Majoris Slayer","Melee Damage against Majoris-level enemies increases by 10%.",{column:6,row:1}],
      ["cs_relic_extremis_slayer","Extremis Slayer","Melee Damage against Extremis-level enemies increases by 15%.",{column:6,row:2}],
      ["cs_relic_kill_streak","Kill Streak","After killing 7 enemies in rapid succession with a Light Combo, you do not lose control upon taking Heavy Hits and cannot be knocked back for 5 seconds. Cooldown is 10 seconds.",{column:7,row:1}],
      ["cs_relic_momentum_gain","Momentum Gain","Each consecutive Light Attack increases Light Attack Melee Damage by 3% (up to 30%) for 3 seconds.",{column:7,row:2}]
    ]},
    {name:"Heroic",perks:[
      ["cs_heroic_fistfight","Fistfight","You can perform an additional Heavy Attack after a Quick Punch. Front Kick is replaced with Quick Punch, and all Heavy Attacks deal 15% more Damage.",{column:8,row:1}],
      ["cs_heroic_fury_of_chogoris","Fury of Chogoris","Adrenaline Surge stacks are increased to 3. The third stack has a higher Damage bonus, while the bonus for the second stack is reduced.",{column:8,row:2}]
    ]}
  ]
};

WEAPONS.melee.weapons["Power Fist"]={
  treeMode:"connectionGraph",
  variants:[
    {id:"standard_issue",tier:"Standard",name:"Standard-Issue"},
    {id:"master_crafted_alpha",tier:"Master-Crafted",name:"Master-Crafted - Alpha"},
    {id:"master_crafted_beta",tier:"Master-Crafted",name:"Master-Crafted - Beta"},
    {id:"achortan_oath_alpha",tier:"Artificer",name:"Achortan Oath - Alpha"},
    {id:"achortan_oath_beta",tier:"Artificer",name:"Achortan Oath - Beta"},
    {id:"achortan_oath_gamma",tier:"Artificer",name:"Achortan Oath - Gamma"},
    {id:"aggamedes_gift_alpha",tier:"Relic",name:"Aggamedes's Gift - Alpha"},
    {id:"aggamedes_gift_beta",tier:"Relic",name:"Aggamedes's Gift - Beta"},
    {id:"aggamedes_gift_gamma",tier:"Relic",name:"Aggamedes's Gift - Gamma"},
    {id:"deaths_grasp",tier:"Heroic",name:"Death's Grasp"},
    {id:"deathwatch_power_fist",tier:"Heroic",name:"Deathwatch Power Fist"}
  ],
  layout:{columnCount:9,rowCount:4,tierHeadings:[
    {name:"Standard",start:1,span:1},
    {name:"Master-Crafted",start:2,span:2},
    {name:"Artificer",start:4,span:3},
    {name:"Relic",start:7,span:2},
    {name:"Heroic",start:9,span:1}
  ]},
  roots:["pf_std_armoured_strength","pf_std_perpetual_strength"],
  exclusiveGroups:[["pf_std_armoured_strength","pf_std_perpetual_strength"]],
  connections:[
    ["pf_std_armoured_strength","pf_mc_swift_recovery"],
    ["pf_std_perpetual_strength","pf_mc_heavy_penetration"],
    ["pf_mc_swift_recovery","pf_mc_perpetual_strength_top"],
    ["pf_mc_heavy_penetration","pf_mc_perpetual_strength_bottom"],
    ["pf_mc_perpetual_strength_top","pf_mc_perpetual_strength_bottom"],
    ["pf_mc_perpetual_strength_top","pf_art_focused_intention"],
    ["pf_mc_perpetual_strength_bottom","pf_art_rally"],
    ["pf_art_focused_intention","pf_art_tide_of_battle"],
    ["pf_art_rally","pf_art_strength_of_will"],
    ["pf_art_following_blow","pf_art_tide_of_battle"],
    ["pf_art_tide_of_battle","pf_art_strength_of_will"],
    ["pf_art_strength_of_will","pf_art_ground_shake"],
    ["pf_art_tide_of_battle","pf_art_combo"],
    ["pf_art_strength_of_will","pf_art_concussive_impact"],
    ["pf_art_combo","pf_relic_majoris_slayer"],
    ["pf_art_concussive_impact","pf_relic_minoris_slayer"],
    ["pf_relic_majoris_slayer","pf_relic_minoris_slayer"],
    ["pf_relic_majoris_slayer","pf_relic_heavy_armament"],
    ["pf_relic_minoris_slayer","pf_relic_reeling_blow"]
  ],
  tiers:[
    {name:"Standard",perks:[
      ["pf_std_armoured_strength","Armoured Strength","If you have Armour remaining, Melee Damage increases by 10%.",{column:0,row:1}],
      ["pf_std_perpetual_strength","Perpetual Strength","Melee Damage increases by 5%.",{column:0,row:2}]
    ]},
    {name:"Master-Crafted",perks:[
      ["pf_mc_swift_recovery","Swift Recovery","Heavy Attacks restore 100% more Contested Health. Applies to Thrust Jab, Backfist, Hammer Hook, Backfist 2, and Thrust Jab 2.",{column:1,row:1}],
      ["pf_mc_heavy_penetration","Heavy Penetration","Heavy Attack preparation time is reduced by 30%. Applies to Thrust Jab, Backfist, Hammer Hook, Backfist 2, and Thrust Jab 2.",{column:1,row:2}],
      ["pf_mc_perpetual_strength_top","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:1}],
      ["pf_mc_perpetual_strength_bottom","Perpetual Strength","Melee Damage increases by 5%.",{column:2,row:2}]
    ]},
    {name:"Artificer",perks:[
      ["pf_art_focused_intention","Focused Intention","When your Health is below 30%, you take 50% less Health Damage while preparing Heavy Attacks.",{column:3,row:1}],
      ["pf_art_rally","Rally","When your Health is below 30%, a successful Backfist 2 or Thrust Jab 2 restores 1 Armour Segment.",{column:3,row:2}],
      ["pf_art_following_blow","Following Blow","Backfist and Backfist 2 can be performed instantly after a charged Thrust Jab or Hammer Hook.",{column:4,row:0}],
      ["pf_art_tide_of_battle","Tide Of Battle","Power Wave forward distance increases by 100% to 8 metres. Applies to Thrust Jab, Backfist, Hammer Hook, Backfist 2, and Thrust Jab 2.",{column:4,row:1}],
      ["pf_art_strength_of_will","Strength of Will","While performing a Heavy Attack, you take 20% less Ranged Damage.",{column:4,row:2}],
      ["pf_art_ground_shake","Ground Shake","Switches Thrust Jab with Ground Shake. Slam the ground to deal area-of-effect Damage in a 10-metre radius.",{column:4,row:3}],
      ["pf_art_combo","Combo","After a successful Heavy Attack, the next Light Attack deals 10% more Melee Damage.",{column:5,row:1}],
      ["pf_art_concussive_impact","Concussive Impact","Backfist 2 and Thrust Jab 2 area-of-effect radius increases by 50%.",{column:5,row:2}]
    ]},
    {name:"Relic",perks:[
      ["pf_relic_majoris_slayer","Majoris Slayer","Melee Damage against Majoris-level enemies increases by 10%.",{column:6,row:1}],
      ["pf_relic_minoris_slayer","Minoris Slayer","Melee Damage against Minoris-level enemies increases by 20%.",{column:6,row:2}],
      ["pf_relic_heavy_armament","Heavy Armament","Cannon Punch deals 50% more Damage.",{column:7,row:1}],
      ["pf_relic_reeling_blow","Reeling Blow","Enemies hit by Cannon Punch deal 30% less Damage for 4 seconds. Cooldown is 10 seconds.",{column:7,row:2}]
    ]},
    {name:"Heroic",perks:[
      ["pf_heroic_follow_up_shot","Follow-Up Shot","Performing a Finisher marks a nearby Majoris-level or higher enemy for a Gun Strike. Light Attack Damage increases by 200%, but Charged Attack Damage decreases by 50%.",{column:8,row:1}],
      ["pf_heroic_burning_impact","Burning Impact","After a Light Attack, pause to enter a stance, then follow with another Light Attack to fire a Melta Blast that inflicts Burn. A Melta Blast can also be fired after a single charge in hold stance.",{column:8,row:2}]
    ]}
  ]
};

const CLASS_DROPDOWN_ORDER = ["Tactical","Vanguard","Assault","Bulwark","Sniper","Heavy","Techmarine"];

// Heroic perks are properties of specific Heroic weapon variants, not nodes in
// the selectable prerequisite graph. Keep that relationship explicit and
// separate from the perk-tree connections so a Heroic perk can never block a
// Standard starting path.
const HEROIC_VARIANT_PERKS = {
  primary:{
    "Stalker Bolt Rifle":{deathwatch:"sbr_heroic_auspex_shot"},
    "Instigator Bolt Carbine":{wrapped:"ibc_heroic_higher_rate_burst"},
    "Bolt Sniper Rifle":{wrapped:"bsr_heroic_replenishing_hit"},
    "Bolt Carbine":{combi_flamer:"bc_heroic_combi_flamer"},
    "Heavy Bolter":{chains_of_duty:"hb_heroic_reinforced_guncasing"},
    "Heavy Plasma Incinerator":{relic_battle_worn:"hpi_heroic_plasma_hail"},
    "Bolt Rifle":{combi_melta:"br_heroic_combi_weapon"},
    "Heavy Bolt Rifle":{deathwatch:"hbr_heroic_deathwatch"},
    "Melta Rifle":{salamanders_melta_rifle:"mr_heroic_focused_fusion_beam"}
  },
  secondary:{
    "Bolt Pistol":{honourific_relic:"bp_heroic_burst_fire"},
    "Heavy Bolt Pistol":{retributions_bequest:"hbp_heroic_no_help_is_coming"},
    "Plasma Pistol":{relic_battle_worn:"pp_heroic_overcharged_plasma_coils"}
  },
  melee:{
    "Omnissian Axe":{ultima_ratio:"axe_heroic_word_of_the_omnissiah"},
    "Combat Knife":{power_gladius:"knife_heroic_agile_strike",argent_edge:"knife_heroic_knuckles"},
    "Power Sword":{xenophase_blade:"ps_heroic_ancient_technology",salamanders_power_sword:"ps_heroic_nocturnes_retort"},
    "Power Axe":{encarmine_axe:"paxe_heroic_sanguine_edge"},
    "Thunder Hammer":{storms_dominion:"th_heroic_electrified_thunderclap",lord_executioners_axe:"th_heroic_whirling_strike"},
    "Chainsword":{double_edged_relic:"cs_heroic_fistfight",white_scars:"cs_heroic_fury_of_chogoris"},
    "Power Fist":{deaths_grasp:"pf_heroic_follow_up_shot",deathwatch_power_fist:"pf_heroic_burning_impact"}
  }
};

function getHeroicVariantMap(slot,weaponName){
  return HEROIC_VARIANT_PERKS[slot]?.[weaponName] || {};
}
function getHeroicPerkIds(slot,weaponName){
  return Object.values(getHeroicVariantMap(slot,weaponName));
}
function getHeroicPerkForVariant(slot,weaponName,variantId){
  return getHeroicVariantMap(slot,weaponName)[variantId] || null;
}
function syncHeroicVariantPerk(slot,state){
  if(!state) return;
  const heroicIds=new Set(getHeroicPerkIds(slot,state.weapon));
  const active=Array.isArray(state.active) ? state.active.filter(id=>!heroicIds.has(id)) : [];
  const heroicId=getHeroicPerkForVariant(slot,state.weapon,state.variant);
  if(heroicId) active.push(heroicId);
  state.active=active;
}

function getClassData(className){
  return CLASS_DATA[className] || CLASS_DATA.Techmarine;
}
function getClassWeaponSlots(className){
  const options=getClassData(className)?.weaponOptions || {};
  return ["primary","secondary","melee"].filter(slot=>Array.isArray(options[slot]) && options[slot].length>0);
}
function getAllowedClassWeapons(className,slot){
  const options=getClassData(className)?.weaponOptions?.[slot];
  return Array.isArray(options)
    ? options.filter(name=>WEAPONS[slot]?.weapons?.[name]).slice().sort((a,b)=>String(a).localeCompare(String(b),undefined,{sensitivity:"base",numeric:true}))
    : [];
}
function getDefaultWeaponState(className,slot){
  const allowed=getAllowedClassWeapons(className,slot);
  const requested=getClassData(className)?.defaultLoadout?.[slot] || {};
  const weapon=allowed.includes(requested.weapon) ? requested.weapon : (allowed[0] || "");
  const variants=WEAPONS[slot]?.weapons?.[weapon]?.variants || [];
  const variant=variants.length
    ? (variants.some(v=>v.id===requested.variant) ? requested.variant : variants[0].id)
    : null;
  const state={weapon,variant,active:[]};
  syncHeroicVariantPerk(slot,state);
  return state;
}
const DEFAULT_BUILD = (className="Techmarine") => {
  const resolved=CLASS_DATA[className] ? className : "Techmarine";
  const weapons={};
  for(const slot of getClassWeaponSlots(resolved)) weapons[slot]=getDefaultWeaponState(resolved,slot);
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
    name:`${resolved} — New Build`,
    className:resolved,
    classActive:[],
    prestige:[],
    weapons,
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
};

class BuildNameModal extends Modal {
  constructor(app, initial, onSubmit) { super(app); this.initial=initial; this.onSubmit=onSubmit; }
  onOpen() {
    const {contentEl}=this; contentEl.empty();
    contentEl.createEl("h2",{text:"Save build"});
    const input=contentEl.createEl("input",{type:"text",value:this.initial,attr:{style:"width:100%;margin-bottom:12px;"}});
    input.focus(); input.select();
    const row=contentEl.createDiv({cls:"sm2-modal-buttons"});
    const save=row.createEl("button",{text:"Save",cls:"mod-cta"});
    const cancel=row.createEl("button",{text:"Cancel"});
    const go=()=>{const v=input.value.trim();if(v)this.onSubmit(v);this.close();};
    save.onclick=go; cancel.onclick=()=>this.close(); input.addEventListener("keydown",e=>{if(e.key==="Enter")go();if(e.key==="Escape")this.close();});
  }
}

class SM2View extends require("obsidian").ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin=plugin; this.activeTab="class"; this.openMenus=new Set(); this.weaponGraphScroll=new Map(); }
  getViewType(){return "sm2-build-planner-view";}
  getDisplayText(){return "SM2 Build Planner";}
  getIcon(){return "swords";}
  async onOpen(){this.render();}
  async onClose(){this.openMenus.clear();}
  renderPreservingPageScroll(){
    const root=this.containerEl;
    const savedScrollTop=root?.scrollTop || 0;
    this.render();
    const restore=()=>{ if(root?.isConnected) root.scrollTop=savedScrollTop; };
    restore();
    if(typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
  }
  render(){
    const root=this.containerEl; root.empty(); root.addClass("sm2-root");
    const build=this.plugin.currentBuild;
    const header=root.createDiv({cls:"sm2-header"});
    const title=header.createEl("h1",{text:"⚙ Space Marine 2 Build Planner"});
    const classWrap=header.createDiv({cls:"sm2-class-wrap"});
    classWrap.createSpan({text:"Class:"});
    const classNames=CLASS_DROPDOWN_ORDER.filter(name=>CLASS_DATA[name]);
    this.makeSelect(classWrap,classNames.map(name=>({value:name,label:name})),build.className,name=>{
      this.plugin.setClass(name).then(changed=>{
        if(!changed) return;
        this.weaponGraphScroll.clear();
        this.render();
      });
    });
    const buildWrap=header.createDiv({cls:"sm2-build-wrap"});
    buildWrap.createSpan({text:"Build:"});
    const buildSelect=this.makeSelect(buildWrap, this.plugin.getBuilds().map(b=>({value:b.id,label:b.name})), build.id, id=>{
      this.plugin.loadBuild(id); this.render();
    });
    const newBtn=header.createEl("button",{text:"New"});
    newBtn.onclick=()=>{this.plugin.startNewBuild();this.render();};
    const saveBtn=header.createEl("button",{text:"Save",cls:"mod-cta"});
    saveBtn.onclick=()=>this.plugin.saveCurrentBuild();
    const autosave=header.createSpan({cls:"sm2-autosave",text:"Auto-save: ON"});
    root.appendChild(header);

    const tabs=root.createDiv({cls:"sm2-tabs"});
    const classTab=tabs.createEl("button",{text:"Class Perks",cls:this.activeTab==="class"?"active":""});
    const weaponTab=tabs.createEl("button",{text:"Weapons",cls:this.activeTab==="weapons"?"active":""});
    classTab.onclick=()=>{this.activeTab="class";this.render();};
    weaponTab.onclick=()=>{this.activeTab="weapons";this.render();};

    const body=root.createDiv({cls:"sm2-body"});
    const main=body.createDiv({cls:"sm2-main"});
    const side=body.createDiv({cls:"sm2-side"});

    if(this.activeTab==="class") this.renderClass(main); else this.renderWeapons(main);
    this.renderSidebar(side);
  }

  makeSelect(parent, items, selected, onChange){
    const wrap=parent.createDiv({cls:"sm2-select-wrap"});
    const btn=wrap.createEl("button",{cls:"sm2-select-btn"});
    const found=items.find(x=>x.value===selected);
    btn.setText((found?found.label:"Select")+" ▾");
    const menu=wrap.createDiv({cls:"sm2-menu"});
    menu.hide();
    items.forEach(item=>{
      const option=menu.createEl("button",{text:item.label,cls:item.value===selected?"selected":""});
      option.onclick=()=>{menu.hide();this.openMenus.delete(menu);onChange(item.value);};
    });
    btn.onclick=e=>{
      e.stopPropagation();
      const open=!menu.isShown();
      document.querySelectorAll(".sm2-menu").forEach(m=>m.hide());
      if(open){menu.show();this.openMenus.add(menu);wrap.addClass("open");}
      else {menu.hide();this.openMenus.delete(menu);wrap.removeClass("open");}
    };
    wrap.addEventListener("click",e=>e.stopPropagation());
    return wrap;
  }

  renderClass(main){
    const className=this.plugin.currentBuild.className;
    const data=CLASS_DATA[className];
    if(!data || !Array.isArray(data.categories)){
      main.createDiv({cls:"sm2-empty-weapon",text:`${className} class data could not be loaded.`});
      return;
    }
    main.createEl("div",{cls:"sm2-section-note",text:"Click any perk to toggle it. Changes are saved automatically to the current build."});
    if(Array.isArray(data.startingPerk)){
      const starting=main.createDiv({cls:"sm2-starting-perk"});
      starting.createEl("strong",{text:`Starting Perk — ${data.startingPerk[1]}`});
      starting.createDiv({cls:"sm2-small",text:data.startingPerk[2]});
    }
    const legend=main.createDiv({cls:"sm2-legend"});
    [["blue","Core / Gear / Prestige"],["yellow","Team / Signature"],["off","Available"]].forEach(x=>{const s=legend.createSpan();s.innerHTML=`<i class="sm2-dot ${x[0]}"></i>${x[1]}`;});
    data.categories.forEach(cat=>{
      const verticalChoices = cat.name.startsWith("Core") || cat.name === "Gear";
      const selectionTone = verticalChoices ? " sm2-selection-blue" : ((cat.name === "Team" || cat.name.startsWith("Signature")) ? " sm2-selection-yellow" : "");
      const sec=main.createDiv({cls:"sm2-category"+(verticalChoices?" sm2-vertical-choice-groups":"")+selectionTone});
      sec.createEl("h2",{text:cat.name});
      const tree=sec.createDiv({cls:"sm2-tree"});
      (cat.rows || []).forEach(row=>{
        const r=tree.createDiv({cls:"sm2-row"});
        const rowPerks = Array.isArray(row) ? row : [];
        (rowPerks || []).forEach(p=>{
          if(Array.isArray(p) && p.length >= 3){
            const active=this.plugin.currentBuild.classActive.includes(p[0]);
            const lockedBy=rowPerks.some(other=>Array.isArray(other) && other[0]!==p[0] && this.plugin.currentBuild.classActive.includes(other[0]));
            const disabled=!active && lockedBy;
            const reason=disabled ? "Unavailable: another perk in this row is selected." : "";
            r.appendChild(this.perkCard(p,active,()=>{
              if(disabled){new Notice(reason);return;}
              this.plugin.toggleClassPerk(p[0],rowPerks);
              this.render();
            },disabled,reason));
          }
        });
      });
    });
    const sec=main.createDiv({cls:"sm2-category sm2-selection-blue"});
    sec.createEl("h2",{text:"Prestige — select up to 4"});
    const grid=sec.createDiv({cls:"sm2-freegrid"});
    data.prestige.forEach(p=>grid.appendChild(this.perkCard(p,this.plugin.currentBuild.prestige.includes(p[0]),()=>{
      if(!this.plugin.currentBuild.prestige.includes(p[0])&&this.plugin.currentBuild.prestige.length>=4){new Notice(`${className} Prestige is limited to 4 selections.`);return;}
      this.plugin.togglePrestige(p[0]);this.render();
    })));
  }

  refreshWeaponGraphCards(slot,graph){
    const state=this.plugin.currentBuild.weapons[slot];
    graph.querySelectorAll(".sm2-graph-perk[data-perk-id]").forEach(el=>{
      const id=el.dataset.perkId;
      const isActive=state.active.includes(id);
      const perkState=this.plugin.getWeaponPerkState(slot,id);
      const variantControlled=this.plugin.isHeroicWeaponPerk(slot,id);
      const disabled=!isActive && !perkState.available;
      el.classList.toggle("active",isActive);
      el.classList.toggle("disabled",disabled);
      el.classList.toggle("variant-controlled",variantControlled);
      if((disabled || variantControlled) && perkState.reason) el.setAttribute("title",perkState.reason);
      else el.removeAttribute("title");
    });
  }

  refreshWeaponPerkCount(){
    const count=Object.values(this.plugin.currentBuild.weapons).reduce((n,w)=>n+w.active.length,0);
    this.containerEl.querySelectorAll(".sm2-stat").forEach(row=>{
      const label=row.querySelector("span");
      const value=row.querySelector("strong");
      if(label?.textContent==="Weapon perks" && value) value.textContent=String(count);
    });
  }

  renderWeapons(main){
    main.createEl("div",{cls:"sm2-section-note",text:"Select a weapon and version, then choose perks along the connected tree. Heroic perks are controlled automatically by their matching Heroic weapon variants and cannot be clicked directly. Changes are saved automatically."});
    this.plugin.getClassWeaponSlots().forEach((slot)=>{
      const group=main.createDiv({cls:"sm2-weapon-slot"});
      const top=group.createDiv({cls:"sm2-weapon-heading"});
      top.createEl("h2",{text:WEAPONS[slot].label+" Weapon"});
      const controls=top.createDiv({cls:"sm2-weapon-controls"});
      const names=this.plugin.getAllowedWeapons(slot);
      const state=this.plugin.currentBuild.weapons[slot];
      const current=state.weapon;
      this.makeSelect(controls,names.map(x=>({value:x,label:x})),current,w=>{
        this.plugin.setWeapon(slot,w);
        this.weaponGraphScroll.set(`${slot}:${w}`,0);
        this.renderPreservingPageScroll();
      });
      const weapon=WEAPONS[slot].weapons[current] || {tiers:[]};
      const variants=Array.isArray(weapon.variants) ? weapon.variants : [];
      if(variants.length){
        const selectedVariant=variants.some(v=>v.id===state.variant) ? state.variant : variants[0].id;
        this.makeSelect(controls,variants.map(v=>({value:v.id,label:`${v.tier} — ${v.name}`})),selectedVariant,id=>{
          this.plugin.setWeaponVariant(slot,id);
          this.renderPreservingPageScroll();
        });
      } else {
        controls.createDiv({cls:"sm2-variant-pending",text:"Version data pending"});
      }

      const tiers=weapon.tiers || [];
      if(!tiers.length){
        group.createDiv({cls:"sm2-empty-weapon",text:"Weapon data has not been entered yet."});
        return;
      }

      const active=state.active;
      if(weapon?.treeMode === "connectionGraph"){
        const scroll=group.createDiv({cls:"sm2-weapon-graph-scroll"});
        const scrollKey=`${slot}:${current}`;
        const savedScrollLeft=this.weaponGraphScroll.get(scrollKey) || 0;
        const layout=weapon.layout || {};
        const columnCount=Number(layout.columnCount) || 9;
        const rowCount=Number(layout.rowCount) || 4;
        const graph=scroll.createDiv({cls:"sm2-weapon-graph"});
        graph.style.gridTemplateColumns=`repeat(${columnCount}, minmax(145px, 1fr))`;
        graph.style.gridTemplateRows=`auto repeat(${rowCount}, minmax(92px, auto))`;
        graph.style.minWidth=`${columnCount * 150}px`;
        const headings=Array.isArray(layout.tierHeadings) ? layout.tierHeadings : [];
        headings.forEach(t=>{
          const h=graph.createDiv({cls:"sm2-graph-tier-heading",text:t.name});
          h.style.gridColumn=`${t.start} / span ${t.span}`;
          h.style.gridRow="1";
        });
        allWeaponPerks(tiers).forEach(p=>{
          const id=perkId(p);
          const meta=perkMeta(p);
          const isActive=active.includes(id);
          const perkState=this.plugin.getWeaponPerkState(slot,id);
          const variantControlled=this.plugin.isHeroicWeaponPerk(slot,id);
          const disabled=!isActive && !perkState.available;
          const reason=perkState.reason || "";
          const el=graph.createDiv({cls:"sm2-weapon-perk sm2-graph-perk"+(isActive?" active":"")+(disabled?" disabled":"")+(variantControlled?" variant-controlled":"")});
          el.dataset.perkId=id;
          el.style.gridColumn=String(perkColumn(p)+1);
          const rowStart=perkRow(p)+2;
          el.style.gridRow=meta.rowSpan ? `${rowStart} / span ${meta.rowSpan}` : String(rowStart);
          if(meta.verticalCenter) el.style.alignSelf="center";
          el.createEl("strong",{text:perkName(p)});
          el.createDiv({cls:"sm2-small",text:perkDesc(p)});
          if((disabled || variantControlled) && reason) el.setAttr("title",reason);
          el.onclick=()=>{
            const liveActive=this.plugin.currentBuild.weapons[slot].active.includes(id);
            const liveState=this.plugin.getWeaponPerkState(slot,id);
            if(this.plugin.isHeroicWeaponPerk(slot,id)){new Notice(liveState.reason || "Heroic perks are controlled by the selected Heroic weapon variant.");return;}
            if(!liveActive && !liveState.available){new Notice(liveState.reason);return;}
            this.weaponGraphScroll.set(scrollKey,scroll.scrollLeft);
            this.plugin.toggleWeaponPerk(slot,id);
            this.refreshWeaponGraphCards(slot,graph);
            this.refreshWeaponPerkCount();
          };
        });
        const restoreGraphScroll=()=>{
          if(!scroll.isConnected) return;
          scroll.scrollLeft=this.weaponGraphScroll.get(scrollKey) ?? savedScrollLeft;
        };
        // The graph is fully constructed now, so restore before the first paint.
        // This prevents the one-frame flash at the far-left position.
        restoreGraphScroll();
        scroll.addEventListener("scroll",()=>{ this.weaponGraphScroll.set(scrollKey,scroll.scrollLeft); },{passive:true});
        if(typeof requestAnimationFrame === "function") requestAnimationFrame(restoreGraphScroll);
      } else {
        const tree=group.createDiv({cls:"sm2-weapon-grid"});
        tiers.forEach((t)=>{
          const col=tree.createDiv({cls:"sm2-tier"});
          col.createEl("h3",{text:t.name});
          (t.perks || []).forEach(p=>{
            const id=perkId(p);
            const isActive=active.includes(id);
            const perkState=this.plugin.getWeaponPerkState(slot,id);
            const variantControlled=this.plugin.isHeroicWeaponPerk(slot,id);
            const disabled=!isActive && !perkState.available;
            const reason=perkState.reason || "";
            const el=col.createDiv({cls:"sm2-weapon-perk"+(isActive?" active":"")+(disabled?" disabled":"")+(variantControlled?" variant-controlled":"")});
            el.createEl("strong",{text:perkName(p)});
            el.createDiv({cls:"sm2-small",text:perkDesc(p)});
            if((disabled || variantControlled) && reason) el.setAttr("title",reason);
            el.onclick=()=>{
              if(variantControlled){new Notice(reason || "Heroic perks are controlled by the selected Heroic weapon variant.");return;}
              if(disabled){new Notice(reason);return;}
              this.plugin.toggleWeaponPerk(slot,id);
              this.renderPreservingPageScroll();
            };
          });
        });
      }
    });
  }

  perkCard(p,active,fn,disabled=false,reason=""){
    const el=document.createElement("div");
    el.className="sm2-perk"+(active?" active":"")+(disabled?" disabled":"");
    el.createDiv({cls:"sm2-perk-meta",text:disabled?"LOCKED":"PERK"});
    el.createDiv({cls:"sm2-perk-name",text:p[1]});
    el.createDiv({cls:"sm2-perk-desc",text:p[2]});
    if(disabled) el.setAttr("title",reason);
    el.onclick=fn;
    return el;
  }

  renderSidebar(side){
    side.createEl("h3",{text:"Current build"});
    const b=this.plugin.currentBuild;
    [["Class perks",b.classActive.length],["Prestige",`${b.prestige.length} / 4`],["Weapon perks",Object.values(b.weapons).reduce((n,w)=>n+w.active.length,0)]].forEach(x=>{
      const row=side.createDiv({cls:"sm2-stat"});row.createSpan({text:x[0]});row.createEl("strong",{text:String(x[1])});
    });
    side.createEl("h3",{text:"Saved builds"});
    const builds=this.plugin.getBuilds();
    if(!builds.length) side.createDiv({cls:"sm2-small",text:"No saved builds yet."});
    builds.forEach(x=>{
      const row=side.createDiv({cls:"sm2-build-row"+(x.id===b.id?" current":"")});
      const btn=row.createEl("button",{text:x.name});btn.onclick=()=>{this.plugin.loadBuild(x.id);this.render();};
      const del=row.createEl("button",{text:"×",attr:{ariaLabel:"Delete build"}});del.onclick=()=>this.plugin.deleteBuild(x.id);
    });
    side.createEl("h3",{text:"Status"});
    side.createDiv({cls:"sm2-small",text:`Current changes are auto-saved to ${BUILD_STORAGE_FILE} in this Obsidian vault.`});
    const clear=side.createEl("button",{text:"Clear current selections",cls:"mod-warning"});
    clear.onclick=()=>{this.plugin.clearCurrent();this.render();};
  }
}

module.exports = class SM2BuildPlannerPlugin extends Plugin {
  async onload(){
    this.builds = {};
    this.currentBuild = DEFAULT_BUILD();
    this._vaultWriteQueue = Promise.resolve();
    this._storageErrorNotified = false;
    await this.loadStoredState();
    this.registerView("sm2-build-planner-view",leaf=>new SM2View(leaf,this));
    this.addCommand({id:"open-planner",name:"Open Space Marine 2 Build Planner",callback:()=>this.activateView()});
    this.addRibbonIcon("swords","Open Space Marine 2 Build Planner",()=>this.activateView());
  }
  async activateView(){
    const leaf=this.app.workspace.getLeaf(true);
    await leaf.setViewState({type:"sm2-build-planner-view",active:true});
    this.app.workspace.revealLeaf(leaf);
  }
  getBuilds(){
    return Object.values(this.builds).slice().sort((a,b)=>{
      const byName=String(a?.name || "").localeCompare(String(b?.name || ""),undefined,{sensitivity:"base",numeric:true});
      if(byName) return byName;
      const byClass=String(a?.className || "").localeCompare(String(b?.className || ""),undefined,{sensitivity:"base"});
      if(byClass) return byClass;
      return String(a?.id || "").localeCompare(String(b?.id || ""));
    });
  }
  getClassWeaponSlots(className=this.currentBuild?.className || "Techmarine"){return getClassWeaponSlots(className);}
  getAllowedWeapons(slot,className=this.currentBuild?.className || "Techmarine"){return getAllowedClassWeapons(className,slot);}
  isHeroicWeaponPerk(slot,id,build=this.currentBuild){
    const state=build?.weapons?.[slot];
    return !!state && getHeroicPerkIds(slot,state.weapon).includes(id);
  }

  repairClassSelections(classActive,className=this.currentBuild?.className || "Techmarine"){
    const data=getClassData(className);
    const validIds=new Set();
    for(const cat of (data?.categories || [])) for(const row of (cat.rows || [])) for(const p of (row || [])) if(Array.isArray(p)) validIds.add(p[0]);
    const selected=new Set((Array.isArray(classActive)?classActive:[]).filter(id=>validIds.has(id)));
    for(const cat of (data?.categories || [])){
      for(const row of (cat.rows || [])){
        const chosen=(row || []).filter(p=>Array.isArray(p) && selected.has(p[0]));
        // A class tree row is a mutually-exclusive choice: keep the first
        // selected perk if an older build contains more than one.
        chosen.slice(1).forEach(p=>selected.delete(p[0]));
      }
    }
    return Array.from(selected);
  }
  repairPrestigeSelections(prestige,className=this.currentBuild?.className || "Techmarine"){
    const valid=new Set((getClassData(className)?.prestige || []).filter(Array.isArray).map(p=>p[0]));
    return Array.from(new Set((Array.isArray(prestige)?prestige:[]).filter(id=>valid.has(id)))).slice(0,4);
  }

  repairWeaponSelections(slot, build=this.currentBuild){
    const state=build.weapons?.[slot];
    if(!state) return;
    const weapon=WEAPONS[slot]?.weapons?.[state.weapon];
    const tiers=weapon?.tiers || [];
    const knownIds=new Set(allWeaponPerks(tiers).map(perkId));
    const heroicIds=new Set(getHeroicPerkIds(slot,state.weapon));
    const selectedOrder=(Array.isArray(state.active) ? state.active.slice() : []).filter(id=>!heroicIds.has(id));
    let selected=new Set(selectedOrder.filter(id=>knownIds.has(id)));

    if(weapon?.treeMode === "connectionGraph"){
      const perkMap=weaponPerkMap(weapon);
      const adj=weaponAdjacency(weapon);
      for(const group of (weapon.exclusiveGroups || [])){
        const chosen=selectedOrder.filter(id=>selected.has(id) && group.includes(id));
        for(const id of chosen.slice(1)) selected.delete(id);
      }
      const starters=[];
      for(const id of selectedOrder){
        if(!selected.has(id)) continue;
        const perk=perkMap.get(id);
        const meta=perkMeta(perk);
        if((weapon.roots || []).includes(id)) starters.push(id);
      }
      const reachable=new Set(starters);
      const queue=starters.slice();
      while(queue.length){
        const current=queue.shift();
        const currentPerk=perkMap.get(current);
        const currentCol=perkColumn(currentPerk);
        for(const next of (adj.get(current) || [])){
          if(!selected.has(next) || reachable.has(next)) continue;
          const nextPerk=perkMap.get(next);
          if(perkColumn(nextPerk) < currentCol) continue;
          reachable.add(next);
          queue.push(next);
        }
      }
      selected=reachable;
    } else if(weapon?.treeMode === "graph"){
      let changed=true;
      while(changed){
        changed=false;
        const perks=allWeaponPerks(tiers);
        for(const p of perks){
          const id=perkId(p), meta=perkMeta(p);
          if(!selected.has(id)) continue;
          const req=meta.requiresAny || [];
          if(req.length && !req.some(x=>selected.has(x))){selected.delete(id);changed=true;continue;}
          const conflict=(meta.exclusiveWith || []).find(x=>selected.has(x));
          if(conflict){
            const first=selectedOrder.indexOf(id) < selectedOrder.indexOf(conflict) ? id : conflict;
            const remove=first===id ? conflict : id;
            if(selected.delete(remove)) changed=true;
          }
        }
      }
    } else {
      for(let i=0;i<tiers.length;i++){
        const tier=tiers[i];
        const chosen=(tier.perks || []).filter(p=>selected.has(perkId(p)));
        chosen.slice(1).forEach(p=>selected.delete(perkId(p)));
        if(i>0){
          const previous=tiers[i-1];
          const hasPrevious=(previous.perks || []).some(p=>selected.has(perkId(p)));
          if(!hasPrevious) (tier.perks || []).forEach(p=>selected.delete(perkId(p)));
        }
      }
    }
    state.active=selectedOrder.filter(id=>selected.has(id));
    const heroicId=getHeroicPerkForVariant(slot,state.weapon,state.variant);
    if(heroicId && knownIds.has(heroicId)) state.active.push(heroicId);
  }

  getWeaponPerkState(slot,id){
    const state=this.currentBuild.weapons?.[slot];
    if(!state) return {available:false,reason:"This weapon slot is not available to the selected class."};
    const weapon=WEAPONS[slot]?.weapons?.[state.weapon];
    const tiers=weapon?.tiers || [];
    const perks=allWeaponPerks(tiers);
    const perk=perks.find(p=>perkId(p)===id);
    if(!perk) return {available:false,reason:"Weapon perk data could not be found."};

    const heroicIds=new Set(getHeroicPerkIds(slot,state.weapon));
    if(heroicIds.has(id)){
      const mapped=getHeroicPerkForVariant(slot,state.weapon,state.variant);
      const variant=(weapon?.variants || []).find(v=>v.id===state.variant);
      return mapped===id
        ? {available:false,variantControlled:true,reason:`Selected automatically by ${variant?.name || "the equipped Heroic variant"}.`}
        : {available:false,variantControlled:true,reason:"Heroic perks are selected automatically by equipping their matching Heroic weapon variant."};
    }

    if(weapon?.treeMode === "connectionGraph"){
      const meta=perkMeta(perk);
      const relationalActive=state.active.filter(activeId=>!heroicIds.has(activeId));
      if(relationalActive.includes(id)) return {available:true,reason:""};
      const perkMap=weaponPerkMap(weapon);
      const adj=weaponAdjacency(weapon);
      for(const group of (weapon.exclusiveGroups || [])){
        if(!group.includes(id)) continue;
        const conflict=group.find(other=>other!==id && relationalActive.includes(other));
        if(conflict){
          const other=perkMap.get(conflict);
          return {available:false,reason:`Unavailable: ${other?perkName(other):conflict} is selected on the alternate starting path.`};
        }
      }
      if(!relationalActive.length){
        return (weapon.roots || []).includes(id)
          ? {available:true,reason:""}
          : {available:false,reason:"Unavailable: select a Standard starting perk first."};
      }
      const candidateCol=perkColumn(perk);
      const validNeighbor=Array.from(adj.get(id) || []).find(other=>{
        if(!relationalActive.includes(other)) return false;
        const otherPerk=perkMap.get(other);
        return perkColumn(otherPerk) <= candidateCol;
      });
      if(validNeighbor) return {available:true,reason:""};
      const connectedSelected=Array.from(adj.get(id) || []).filter(other=>relationalActive.includes(other));
      if(connectedSelected.length){
        return {available:false,reason:"Unavailable: this connection would move backwards through the perk tree."};
      }
      return {available:false,reason:"Unavailable: this perk is not connected to your current selected path."};
    }

    if(weapon?.treeMode !== "graph"){
      const index=tiers.findIndex(t=>(t.perks||[]).some(p=>perkId(p)===id));
      if(index<=0) return {available:true,reason:""};
      const previous=tiers[index-1];
      const hasPrevious=(previous.perks||[]).some(p=>state.active.includes(perkId(p)));
      return hasPrevious ? {available:true,reason:""} : {available:false,reason:`Unavailable: select a perk from ${previous.name} first.`};
    }
    const meta=perkMeta(perk);
    const req=meta.requiresAny || [];
    if(req.length && !req.some(x=>state.active.includes(x))){
      const labels=req.map(x=>{const p=perks.find(q=>perkId(q)===x);return p?perkName(p):x;});
      return {available:false,reason:`Unavailable: requires ${labels.join(" or ")}.`};
    }
    const conflict=(meta.exclusiveWith || []).find(x=>state.active.includes(x));
    if(conflict){
      const p=perks.find(q=>perkId(q)===conflict);
      return {available:false,reason:`Unavailable: ${p?perkName(p):conflict} is selected on the opposing branch.`};
    }
    return {available:true,reason:""};
  }


  normalizeSelections(){
    this.currentBuild.classActive=this.repairClassSelections(this.currentBuild.classActive,this.currentBuild.className);
    this.currentBuild.prestige=this.repairPrestigeSelections(this.currentBuild.prestige,this.currentBuild.className);
    for(const slot of this.getClassWeaponSlots()) this.repairWeaponSelections(slot);
  }

  normalizeBuild(raw){
    const resolvedClass=CLASS_DATA[raw?.className] ? raw.className : "Techmarine";
    const d=DEFAULT_BUILD(resolvedClass);
    const b=Object.assign(d, raw || {});
    b.className=resolvedClass;
    const plasmaPistolV034Migration={
      pp_std_common_cooling:"pp_std_plasma_collection",
      pp_mc_blast_radius:"pp_mc_plasma_collection",
      pp_mc_supercharged_shot:"pp_mc_divine_might",
      pp_art_perpetual_velocity_a:"pp_art_perpetual_velocity",
      pp_art_perpetual_velocity_b:"pp_art_efficient_charge",
      pp_art_blast_radius:"pp_art_blast_radius_a",
      pp_art_efficient_charge:"pp_art_blast_radius_b",
      pp_relic_perfect_radius:"pp_relic_perfect_cooling",
      pp_relic_fast_venting:"pp_relic_divine_might"
    };
    if(!Array.isArray(b.classActive)) b.classActive=[];
    if(!Array.isArray(b.prestige)) b.prestige=[];
    const rawWeapons=raw?.weapons && typeof raw.weapons==="object" ? raw.weapons : {};
    const normalizedWeapons={};
    for(const slot of getClassWeaponSlots(resolvedClass)){
      const def=getDefaultWeaponState(resolvedClass,slot);
      const source=rawWeapons[slot] && typeof rawWeapons[slot]==="object" ? rawWeapons[slot] : {};
      const state=Object.assign({},def,source);
      const allowed=getAllowedClassWeapons(resolvedClass,slot);
      if(!allowed.includes(state.weapon)){
        state.weapon=def.weapon;
        state.variant=def.variant;
        state.active=[];
      }
      const variants=WEAPONS[slot]?.weapons?.[state.weapon]?.variants || [];
      if(variants.length){
        if(!variants.some(v=>v.id===state.variant)) state.variant=variants[0].id;
      } else state.variant=null;
      if(!Array.isArray(state.active)) state.active=[];
      if(slot==="secondary" && state.weapon==="Plasma Pistol"){
        state.active=state.active.map(id=>plasmaPistolV034Migration[id] || id);
        state.active=Array.from(new Set(state.active));
      }
      normalizedWeapons[slot]=state;
    }
    b.weapons=normalizedWeapons;
    this.currentBuild=b;
    b.classActive=this.repairClassSelections(b.classActive,b.className);
    b.prestige=this.repairPrestigeSelections(b.prestige,b.className);
    for(const slot of getClassWeaponSlots(b.className)) this.repairWeaponSelections(slot,b);
    return b;
  }

  async ensureVaultStorage(){
    const adapter=this.app.vault.adapter;
    if(!(await adapter.exists(BUILD_STORAGE_FOLDER))) await adapter.mkdir(BUILD_STORAGE_FOLDER);
  }

  async readVaultState(){
    const adapter=this.app.vault.adapter;
    if(!(await adapter.exists(BUILD_STORAGE_FILE))) return null;
    const raw=await adapter.read(BUILD_STORAGE_FILE);
    if(!String(raw || "").trim()) return null;
    const parsed=JSON.parse(raw);
    if(!parsed || typeof parsed!=="object" || !parsed.builds || typeof parsed.builds!=="object"){
      throw new Error(`Invalid build storage format in ${BUILD_STORAGE_FILE}.`);
    }
    return parsed;
  }

  makeVaultState(){
    return {
      schemaVersion:BUILD_STORAGE_SCHEMA_VERSION,
      currentId:this.currentBuild?.id || null,
      builds:JSON.parse(JSON.stringify(this.builds))
    };
  }

  async writeVaultStateNow(){
    await this.ensureVaultStorage();
    const payload=JSON.stringify(this.makeVaultState(),null,2)+"\n";
    await this.app.vault.adapter.write(BUILD_STORAGE_FILE,payload);
    this._storageErrorNotified=false;
  }

  queueVaultWrite(){
    const task=this._vaultWriteQueue.then(()=>this.writeVaultStateNow());
    this._vaultWriteQueue=task.catch(err=>{
      console.error("SM2 Build Planner: failed to write vault build storage",err);
      if(!this._storageErrorNotified){
        this._storageErrorNotified=true;
        new Notice(`SM2 Build Planner could not save ${BUILD_STORAGE_FILE}. Check the console for details.`);
      }
    });
    return task;
  }

  async archiveUnreadableVaultFile(){
    const adapter=this.app.vault.adapter;
    if(!(await adapter.exists(BUILD_STORAGE_FILE))) return null;
    const stamp=new Date().toISOString().replace(/[:.]/g,"-");
    const backup=`${BUILD_STORAGE_FOLDER}/builds.unreadable-${stamp}.json`;
    await adapter.rename(BUILD_STORAGE_FILE,backup);
    return backup;
  }

  loadBuildCollection(st){
    this.builds={};
    if(st?.builds && typeof st.builds==="object"){
      const entries=Array.isArray(st.builds)
        ? st.builds.filter(x=>x && typeof x==="object" && x.id).map(x=>[x.id,x])
        : Object.entries(st.builds);
      for(const [id,raw] of entries){
        const b=this.normalizeBuild(raw);
        b.id=id;
        this.builds[id]=b;
      }
    }
    if(st?.currentId && this.builds[st.currentId]){
      this.currentBuild=this.normalizeBuild(this.builds[st.currentId]);
    } else if(Object.keys(this.builds).length){
      this.currentBuild=this.normalizeBuild(this.getBuilds()[0]);
    } else {
      const b=DEFAULT_BUILD();
      this.currentBuild=b;
      this.builds[b.id]=this.normalizeBuild(b);
    }
  }

  async loadStoredState(){
    let st=null;
    let migratedLegacy=false;
    let vaultReadFailed=false;
    try{
      st=await this.readVaultState();
    }catch(err){
      vaultReadFailed=true;
      console.error("SM2 Build Planner: could not read vault build storage",err);
      try{
        const backup=await this.archiveUnreadableVaultFile();
        if(backup) new Notice(`SM2 Build Planner archived an unreadable build file as ${backup}.`);
      }catch(archiveErr){
        console.error("SM2 Build Planner: could not archive unreadable vault build storage",archiveErr);
      }
    }

    if(!st){
      const legacy=await this.loadData();
      if(legacy?.builds && typeof legacy.builds==="object"){
        st=legacy;
        migratedLegacy=true;
      }
    }

    this.loadBuildCollection(st);
    await this.writeVaultStateNow();

    // Plugin data is retained only as a migration marker. The vault JSON file
    // is the source of truth from v0.8.0 onward.
    await this.saveData({
      storage:"vault",
      schemaVersion:BUILD_STORAGE_SCHEMA_VERSION,
      path:BUILD_STORAGE_FILE,
      migratedAt:migratedLegacy ? new Date().toISOString() : undefined
    });

    if(migratedLegacy){
      new Notice(`SM2 Build Planner moved your saved builds to ${BUILD_STORAGE_FILE}.`);
    }else if(vaultReadFailed){
      new Notice(`SM2 Build Planner created a fresh ${BUILD_STORAGE_FILE} after archiving the unreadable file.`);
    }
  }

  async persist(){
    this.currentBuild.updatedAt=new Date().toISOString();
    this.builds[this.currentBuild.id]=JSON.parse(JSON.stringify(this.currentBuild));
    await this.queueVaultWrite();
  }
  async autoSave(){await this.persist();}
  startNewBuild(){this.currentBuild=DEFAULT_BUILD(this.currentBuild?.className || "Techmarine");new Notice("New unsaved build created.");}
  async saveCurrentBuild(){
    new BuildNameModal(this.app,this.currentBuild.name,name=>{
      this.currentBuild.name=name;this.persist().then(()=>new Notice(`Saved "${name}".`));
    }).open();
  }
  loadBuild(id){
    if(this.builds[id]){
      this.currentBuild=this.normalizeBuild(JSON.parse(JSON.stringify(this.builds[id])));
      this.persist();
      new Notice(`Loaded "${this.currentBuild.name}".`);
    }
  }
  async deleteBuild(id){
    const b=this.builds[id];if(!b)return;
    if(Object.keys(this.builds).length<=1){new Notice("Keep at least one build.");return;}
    delete this.builds[id];
    if(this.currentBuild.id===id)this.currentBuild=JSON.parse(JSON.stringify(this.getBuilds()[0]));
    await this.persist();new Notice(`Deleted "${b.name}".`);
    const leaves=this.app.workspace.getLeavesOfType("sm2-build-planner-view");leaves.forEach(l=>l.view.render());
  }
  toggleClassPerk(id,rowPerks=[]){
    const a=this.currentBuild.classActive;
    const i=a.indexOf(id);
    if(i>=0){
      a.splice(i,1);
    } else {
      // Selecting a class perk locks the other choices in its row.
      const rowIds=new Set((rowPerks || []).filter(p=>Array.isArray(p)).map(p=>p[0]));
      for(let n=a.length-1;n>=0;n--) if(rowIds.has(a[n])) a.splice(n,1);
      a.push(id);
    }
    this.autoSave();
  }
  togglePrestige(id){const a=this.currentBuild.prestige;const i=a.indexOf(id);if(i>=0)a.splice(i,1);else a.push(id);this.autoSave();}
  async setClass(name){
    if(!CLASS_DATA[name] || this.currentBuild.className===name) return false;

    // Preserve the current build under its existing ID before changing class.
    // Class changes intentionally create a new build so a Techmarine build can
    // never be silently transformed into (and overwrite) a Heavy build, or vice versa.
    const old=JSON.parse(JSON.stringify(this.currentBuild));
    old.updatedAt=new Date().toISOString();
    this.builds[old.id]=old;

    const fresh=DEFAULT_BUILD(name);
    this.currentBuild=fresh;
    this.builds[fresh.id]=JSON.parse(JSON.stringify(fresh));
    await this.persist();
    new Notice(`Created new ${name} build.`);
    return true;
  }
  setWeapon(slot,name){
    if(!this.getAllowedWeapons(slot).includes(name)) return;
    const state=this.currentBuild.weapons[slot];
    state.weapon=name;
    state.active=[];
    const variants=WEAPONS[slot]?.weapons?.[name]?.variants || [];
    state.variant=variants.length ? variants[0].id : null;
    this.autoSave();
  }
  setWeaponVariant(slot,id){
    const state=this.currentBuild.weapons[slot];
    const variants=WEAPONS[slot]?.weapons?.[state.weapon]?.variants || [];
    if(!variants.some(v=>v.id===id)) return;
    state.variant=id;
    this.repairWeaponSelections(slot);
    this.autoSave();
  }
  toggleWeaponPerk(slot,id){
    const state=this.currentBuild.weapons[slot];
    const weapon=WEAPONS[slot]?.weapons?.[state.weapon];
    const tiers=weapon?.tiers || [];
    if(this.isHeroicWeaponPerk(slot,id)){
      const info=this.getWeaponPerkState(slot,id);
      new Notice(info.reason || "Heroic perks are controlled by the selected Heroic weapon variant.");
      return;
    }
    const a=state.active;
    const i=a.indexOf(id);
    if(i>=0){
      a.splice(i,1);
      this.repairWeaponSelections(slot);
      this.autoSave();
      return;
    }
    const check=this.getWeaponPerkState(slot,id);
    if(!check.available){new Notice(check.reason);return;}
    if(weapon?.treeMode === "connectionGraph"){
      for(const group of (weapon.exclusiveGroups || [])){
        if(!group.includes(id)) continue;
        for(const other of group){
          if(other===id) continue;
          const j=a.indexOf(other); if(j>=0) a.splice(j,1);
        }
      }
    } else if(weapon?.treeMode !== "graph"){
      const index=tiers.findIndex(t=>(t.perks||[]).some(p=>perkId(p)===id));
      if(index>0){
        const hasPrevious=(tiers[index-1].perks||[]).some(p=>a.includes(perkId(p)));
        if(!hasPrevious){new Notice(`Select a perk from ${tiers[index-1].name} first.`);return;}
      }
      if(index>=0) (tiers[index].perks||[]).forEach(p=>{const j=a.indexOf(perkId(p));if(j>=0)a.splice(j,1);});
    } else {
      const perk=allWeaponPerks(tiers).find(p=>perkId(p)===id);
      for(const conflict of (perkMeta(perk).exclusiveWith || [])){
        const j=a.indexOf(conflict); if(j>=0)a.splice(j,1);
      }
    }
    a.push(id);
    this.repairWeaponSelections(slot);
    this.autoSave();
  }

  clearCurrent(){
    this.currentBuild.classActive=[];this.currentBuild.prestige=[];
    Object.values(this.currentBuild.weapons).forEach(w=>w.active=[]);
    for(const slot of this.getClassWeaponSlots()) this.repairWeaponSelections(slot);
    this.autoSave();new Notice("Current selections cleared.");
  }
  onunload(){this.app.workspace.detachLeavesOfType("sm2-build-planner-view");}
};