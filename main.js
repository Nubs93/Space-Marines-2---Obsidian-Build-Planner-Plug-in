const { Plugin, Notice, PluginSettingTab, Setting, Modal } = require("obsidian");

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

const WEAPONS = {
  primary: {
    label:"Primary",
    weapons:{
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
            ["br_heroic_combi_weapon","Combi-Weapon","You can use an alternative Melta firing mode, accessed through Augmented Vision scope mode.",{column:9,row:1,rowSpan:2,verticalCenter:true,alwaysAvailable:true}]
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
            ["hbr_heroic_deathwatch","Deathwatch","Toggle to Augmented Vision mode to activate auxiliary grenade launcher.",{column:9,row:1,rowSpan:2,verticalCenter:true,alwaysAvailable:true}]
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
            ["bp_heroic_burst_fire","Burst Fire","You can fire shots in 3-round bursts.",{column:8,row:0,rowSpan:2,verticalCenter:true,alwaysAvailable:true}]
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
            ["hbp_heroic_no_help_is_coming","No Help Is Coming","Shooting an enemy with the status of Elite Scream stops it from calling for reinforcements.",{column:10,row:0,rowSpan:2,verticalCenter:true,alwaysAvailable:true}]
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
            ["pp_heroic_overcharged_plasma_coils","Overcharged Plasma Coils","Only fires Charged Shots with increased damage, but charge time is longer.",{column:8,row:0,rowSpan:2,verticalCenter:true,alwaysAvailable:true}]
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
            ["axe_heroic_word_of_the_omnissiah","Word Of The Omnissiah","The attack after Omnissian Rush deals increased damage based on the duration of the rush.",{column:9,row:1,rowSpan:2,verticalCenter:true,alwaysAvailable:true}]
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
          ["knife_art_shadow_stab","knife_art_tide_of_battle"],
          ["knife_art_tide_of_battle","knife_art_reeling_blow"],
          ["knife_art_reeling_blow","knife_art_shoulder_bash"],
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
            ["knife_art_shadow_stab","Shadow Stab","Replace Heavy Swing with Shadow Stab. Hold the Attack button to charge it. Damage increases by 100% per 1 second of charging.",{column:4,row:0}],
            ["knife_art_tide_of_battle","Tide Of Battle","Power Wave forward distance increases from 4 to 8 metres for Whirlwind Slash.",{column:4,row:1}],
            ["knife_art_reeling_blow","Reeling Blow","Enemies hit by Whirlwind Slash deal 30% less Damage for 4 seconds. Cooldown is 10 seconds.",{column:4,row:2}],
            ["knife_art_shoulder_bash","Shoulder Bash","Replace Distant Stab with Shoulder Bash. While evading or sprinting, tap the Attack button to quickly perform an area-of-effect forward attack.",{column:4,row:3}]
          ]},
          {name:"Relic",perks:[
            ["knife_relic_terminus_slayer","Terminus Slayer","Melee Damage against Terminus-level enemies increases by 20%.",{column:5,row:1}],
            ["knife_relic_extremis_slayer","Extremis Slayer","Melee Damage against Extremis-level enemies increases by 15%.",{column:5,row:2}],
            ["knife_relic_kill_streak","Kill Streak","After killing 7 enemies in rapid succession with a Light Combo, you do not lose control upon taking Heavy Hits and cannot be knocked back for 5 seconds. Cooldown is 10 seconds.",{column:6,row:1}],
            ["knife_relic_hard_target","Hard Target","While performing a Light Combo, you take 15% less Ranged Damage.",{column:6,row:2}]
          ]},
          {name:"Heroic",perks:[
            ["knife_heroic_agile_strike","Agile Strike","After a Perfect Dodge, the next melee strike deals 120% more Damage. Can be stacked up to 3 times.",{column:7,row:1,alwaysAvailable:true}],
            ["knife_heroic_knuckles","Knuckles","Riposte window is shorter, but each riposte deals damage to the attacker.",{column:7,row:2,alwaysAvailable:true}]
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
            ["ps_heroic_ancient_technology","Ancient Technology","Power Rake waves are wider and deal 20% more Damage.",{column:9,row:1,alwaysAvailable:true}],
            ["ps_heroic_nocturnes_retort","Nocturne's Retort","Perfect Parries grant Power stacks that empower the next Speed Style Light Attack; stacks can build up to 6 and the parry window is shorter.",{column:9,row:2,alwaysAvailable:true}]
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
            ["paxe_heroic_sanguine_edge","Sanguine Edge","Power Backstep can still be performed with the next Heavy Attack, even if you move out of Power Stance.",{column:9,row:1,rowSpan:2,verticalCenter:true,alwaysAvailable:true}]
          ]}
        ]
      }
    }
  }
};

const DEFAULT_BUILD = () => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
  name:"Techmarine — New Build",
  className:"Techmarine",
  classActive:[],
  prestige:[],
  weapons:{
    primary:{weapon:"Plasma Incinerator",variant:"standard_issue",active:[]},
    secondary:{weapon:"Bolt Pistol",variant:"standard_issue",active:[]},
    melee:{weapon:"Omnissian Axe",variant:"standard_issue",active:[]}
  },
  createdAt:new Date().toISOString(),
  updatedAt:new Date().toISOString()
});

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
    const classLabel=header.createSpan({cls:"sm2-class-label",text:"Techmarine"});
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
    const data=CLASS_DATA.Techmarine;
    if(!data || !Array.isArray(data.categories)){
      main.createDiv({cls:"sm2-empty-weapon",text:"Techmarine class data could not be loaded."});
      return;
    }
    main.createEl("div",{cls:"sm2-section-note",text:"Click any perk to toggle it. Changes are saved automatically to the current build."});
    const legend=main.createDiv({cls:"sm2-legend"});
    [["on","Selected"],["off","Available"]].forEach(x=>{const s=legend.createSpan();s.innerHTML=`<i class="sm2-dot ${x[0]}"></i>${x[1]}`;});
    data.categories.forEach(cat=>{
      const verticalChoices = cat.name.startsWith("Core") || cat.name === "Gear";
      const sec=main.createDiv({cls:"sm2-category"+(verticalChoices?" sm2-vertical-choice-groups":"")});
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
    const sec=main.createDiv({cls:"sm2-category"});
    sec.createEl("h2",{text:"Prestige — select up to 4"});
    const grid=sec.createDiv({cls:"sm2-freegrid"});
    data.prestige.forEach(p=>grid.appendChild(this.perkCard(p,this.plugin.currentBuild.prestige.includes(p[0]),()=>{
      if(!this.plugin.currentBuild.prestige.includes(p[0])&&this.plugin.currentBuild.prestige.length>=4){new Notice("Techmarine Prestige is limited to 4 selections.");return;}
      this.plugin.togglePrestige(p[0]);this.render();
    })));
  }

  refreshWeaponGraphCards(slot,graph){
    const state=this.plugin.currentBuild.weapons[slot];
    graph.querySelectorAll(".sm2-graph-perk[data-perk-id]").forEach(el=>{
      const id=el.dataset.perkId;
      const isActive=state.active.includes(id);
      const perkState=this.plugin.getWeaponPerkState(slot,id);
      const disabled=!isActive && !perkState.available;
      el.classList.toggle("active",isActive);
      el.classList.toggle("disabled",disabled);
      if(disabled && perkState.reason) el.setAttribute("title",perkState.reason);
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
    main.createEl("div",{cls:"sm2-section-note",text:"Select a weapon and version, then choose perks along the connected tree. Locked perks show the prerequisite or branch that prevents selection. Changes are saved automatically."});
    ["primary","secondary","melee"].forEach((slot)=>{
      const group=main.createDiv({cls:"sm2-weapon-slot"});
      const top=group.createDiv({cls:"sm2-weapon-heading"});
      top.createEl("h2",{text:WEAPONS[slot].label+" Weapon"});
      const controls=top.createDiv({cls:"sm2-weapon-controls"});
      const names=Object.keys(WEAPONS[slot].weapons);
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
          const disabled=!isActive && !perkState.available;
          const reason=disabled ? perkState.reason : "";
          const el=graph.createDiv({cls:"sm2-weapon-perk sm2-graph-perk"+(isActive?" active":"")+(disabled?" disabled":"")});
          el.dataset.perkId=id;
          el.style.gridColumn=String(perkColumn(p)+1);
          const rowStart=perkRow(p)+2;
          el.style.gridRow=meta.rowSpan ? `${rowStart} / span ${meta.rowSpan}` : String(rowStart);
          if(meta.verticalCenter) el.style.alignSelf="center";
          el.createEl("strong",{text:perkName(p)});
          el.createDiv({cls:"sm2-small",text:perkDesc(p)});
          if(disabled) el.setAttr("title",reason);
          el.onclick=()=>{
            const liveActive=this.plugin.currentBuild.weapons[slot].active.includes(id);
            const liveState=this.plugin.getWeaponPerkState(slot,id);
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
            const disabled=!isActive && !perkState.available;
            const reason=disabled ? perkState.reason : "";
            const el=col.createDiv({cls:"sm2-weapon-perk"+(isActive?" active":"")+(disabled?" disabled":"")});
            el.createEl("strong",{text:perkName(p)});
            el.createDiv({cls:"sm2-small",text:perkDesc(p)});
            if(disabled) el.setAttr("title",reason);
            el.onclick=()=>{
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
    side.createDiv({cls:"sm2-small",text:"Current changes are auto-saved locally. Build files will be moved into the Obsidian vault in a later storage milestone."});
    const clear=side.createEl("button",{text:"Clear current selections",cls:"mod-warning"});
    clear.onclick=()=>{this.plugin.clearCurrent();this.render();};
  }
}

module.exports = class SM2BuildPlannerPlugin extends Plugin {
  async onload(){
    this.builds = {};
    this.currentBuild = DEFAULT_BUILD();
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
  getBuilds(){return Object.values(this.builds);}

  repairClassSelections(classActive){
    const selected=new Set(Array.isArray(classActive)?classActive:[]);
    const data=CLASS_DATA.Techmarine;
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

  repairWeaponSelections(slot, build=this.currentBuild){
    const state=build.weapons[slot];
    const weapon=WEAPONS[slot]?.weapons?.[state.weapon];
    const tiers=weapon?.tiers || [];
    const selectedOrder=Array.isArray(state.active) ? state.active.slice() : [];
    const knownIds=new Set(allWeaponPerks(tiers).map(perkId));
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
        if((weapon.roots || []).includes(id) || meta.alwaysAvailable) starters.push(id);
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
  }

  getWeaponPerkState(slot,id){
    const state=this.currentBuild.weapons[slot];
    const weapon=WEAPONS[slot]?.weapons?.[state.weapon];
    const tiers=weapon?.tiers || [];
    const perks=allWeaponPerks(tiers);
    const perk=perks.find(p=>perkId(p)===id);
    if(!perk) return {available:false,reason:"Weapon perk data could not be found."};

    if(weapon?.treeMode === "connectionGraph"){
      const meta=perkMeta(perk);
      if(state.active.includes(id)) return {available:true,reason:""};
      if(meta.alwaysAvailable) return {available:true,reason:""};
      const perkMap=weaponPerkMap(weapon);
      const adj=weaponAdjacency(weapon);
      for(const group of (weapon.exclusiveGroups || [])){
        if(!group.includes(id)) continue;
        const conflict=group.find(other=>other!==id && state.active.includes(other));
        if(conflict){
          const other=perkMap.get(conflict);
          return {available:false,reason:`Unavailable: ${other?perkName(other):conflict} is selected on the alternate starting path.`};
        }
      }
      if(!state.active.length){
        return (weapon.roots || []).includes(id)
          ? {available:true,reason:""}
          : {available:false,reason:"Unavailable: select a Standard starting perk first."};
      }
      const candidateCol=perkColumn(perk);
      const validNeighbor=Array.from(adj.get(id) || []).find(other=>{
        if(!state.active.includes(other)) return false;
        const otherPerk=perkMap.get(other);
        return perkColumn(otherPerk) <= candidateCol;
      });
      if(validNeighbor) return {available:true,reason:""};
      const connectedSelected=Array.from(adj.get(id) || []).filter(other=>state.active.includes(other));
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
    this.currentBuild.classActive=this.repairClassSelections(this.currentBuild.classActive);
    for(const slot of ["primary","secondary","melee"]) this.repairWeaponSelections(slot);
  }

  normalizeBuild(raw){
    const d=DEFAULT_BUILD();
    const b=Object.assign(d, raw || {});
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
    if(!b.weapons || typeof b.weapons!=="object") b.weapons={};
    for(const slot of ["primary","secondary","melee"]){
      const def=DEFAULT_BUILD().weapons[slot];
      if(!b.weapons[slot] || typeof b.weapons[slot]!=="object") b.weapons[slot]=def;
      if(typeof b.weapons[slot].weapon!=="string") b.weapons[slot].weapon=def.weapon;
      const variants=WEAPONS[slot]?.weapons?.[b.weapons[slot].weapon]?.variants || [];
      if(variants.length){
        if(!variants.some(v=>v.id===b.weapons[slot].variant)) b.weapons[slot].variant=variants[0].id;
      } else {
        b.weapons[slot].variant=null;
      }
      if(!Array.isArray(b.weapons[slot].active)) b.weapons[slot].active=[];
      if(slot==="secondary" && b.weapons[slot].weapon==="Plasma Pistol"){
        b.weapons[slot].active=b.weapons[slot].active.map(id=>plasmaPistolV034Migration[id] || id);
        b.weapons[slot].active=Array.from(new Set(b.weapons[slot].active));
      }
    }
    this.currentBuild=b;
    b.classActive=this.repairClassSelections(b.classActive);
    for(const slot of ["primary","secondary","melee"]) this.repairWeaponSelections(slot,b);
    return b;
  }

  async loadStoredState(){
    const st=await this.loadData();
    if(st?.builds && typeof st.builds==="object"){
      for(const [id,raw] of Object.entries(st.builds)){
        const b=this.normalizeBuild(raw);
        b.id=id;
        this.builds[id]=b;
      }
    }
    if(st?.currentId && this.builds[st.currentId]){
      this.currentBuild=this.normalizeBuild(this.builds[st.currentId]);
    } else if(Object.keys(this.builds).length){
      this.currentBuild=this.normalizeBuild(Object.values(this.builds)[0]);
    } else {
      const b=DEFAULT_BUILD();
      this.currentBuild=b;
      this.builds[b.id]=this.normalizeBuild(b);
    }
    await this.saveData({builds:this.builds,currentId:this.currentBuild.id});
  }
  async persist(){
    this.currentBuild.updatedAt=new Date().toISOString();
    this.builds[this.currentBuild.id]=JSON.parse(JSON.stringify(this.currentBuild));
    await this.saveData({builds:this.builds,currentId:this.currentBuild.id});
  }
  async autoSave(){await this.persist();}
  startNewBuild(){this.currentBuild=DEFAULT_BUILD();new Notice("New unsaved build created.");}
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
    if(this.currentBuild.id===id)this.currentBuild=JSON.parse(JSON.stringify(Object.values(this.builds)[0]));
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
  setWeapon(slot,name){
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
    this.autoSave();
  }
  toggleWeaponPerk(slot,id){
    const state=this.currentBuild.weapons[slot];
    const weapon=WEAPONS[slot]?.weapons?.[state.weapon];
    const tiers=weapon?.tiers || [];
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
    this.autoSave();new Notice("Current selections cleared.");
  }
  onunload(){this.app.workspace.detachLeavesOfType("sm2-build-planner-view");}
};