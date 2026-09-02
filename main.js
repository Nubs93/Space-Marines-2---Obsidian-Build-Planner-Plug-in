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
        // Graph-based weapon tree. `requiresAny` follows the visible connectors
        // in the in-game tree; `exclusiveWith` represents branch choices.
        treeMode:"graph",
        tiers:[
          {name:"Standard",perks:[
            ["plasma_std_common_cooling","Common Cooling","Common Shots generate 10% less Heat.",{exclusiveWith:["plasma_std_blast_radius"]}],
            ["plasma_std_blast_radius","Blast Radius","Damage radius of a Charged Shot increases by 10%.",{exclusiveWith:["plasma_std_common_cooling"]}]
          ]},
          {name:"Master-Crafted",perks:[
            ["plasma_mc_rapid_cooling","Rapid Cooling","After killing 7 enemies in rapid succession, Weapons do not heat for 10 seconds. Cooldown is 15 seconds.",{requiresAny:["plasma_std_common_cooling"]}],
            ["plasma_mc_fast_venting","Fast Venting","Weapon cools 15% faster.",{requiresAny:["plasma_mc_rapid_cooling"]}],
            ["plasma_mc_rampage","Rampage","After killing 7 enemies in rapid succession, you deal 25% more Damage for 10 seconds. Cooldown is 15 seconds.",{requiresAny:["plasma_std_blast_radius"]}],
            ["plasma_mc_efficient_charge","Efficient Charge","Charged Shots from Plasma Weapons use 2 less energy.",{requiresAny:["plasma_mc_rampage","plasma_mc_fast_venting"]}]
          ]},
          {name:"Artificer",perks:[
            ["plasma_art_common_efficiency","Common Efficiency","Common Shots generate 20% less Heat. Shots charge 20% slower.",{requiresAny:["plasma_art_common_speed"]}],
            ["plasma_art_plasma_collection","Plasma Collection","Energy reserve of Plasma Weapons increases by 20%.",{requiresAny:["plasma_mc_fast_venting"]}],
            ["plasma_art_common_speed","Common Speed","Projectile speed of Common Shots increases by 25%.",{requiresAny:["plasma_art_plasma_collection"]}],
            ["plasma_art_adamant_restoration","Adamant Restoration","When your Health drops below 30%, your Ammo Reserve is restored by 25% of the maximum capacity. Cannot exceed maximum Ammo capacity. Cooldown is 30 seconds.",{requiresAny:["plasma_art_common_speed"]}],
            ["plasma_art_charged_speed","Charged Speed","Projectile speed of Charged Shots increases by 25%.",{requiresAny:["plasma_mc_efficient_charge"]}],
            ["plasma_art_blast_radius","Blast Radius","Damage radius of a Charged Shot increases by 10%.",{requiresAny:["plasma_art_common_speed","plasma_art_charged_speed"]}],
            ["plasma_art_adamant_velocity","Adamant Velocity","When your Health is below 30%, shots Charge 25% faster.",{requiresAny:["plasma_art_adamant_restoration","plasma_art_blast_radius"]}],
            ["plasma_art_balanced_cooling","Balanced Cooling","Weapon cool 20% faster. Charged Shots generate 10% more Heat.",{requiresAny:["plasma_art_blast_radius"]}]
          ]},
          {name:"Relic",perks:[
            ["plasma_relic_honed_precision","Honed Precision","Equipped Weapon's Maximum Spread decreases by 50% when firing without aiming.",{requiresAny:["plasma_relic_fast_venting"]}],
            ["plasma_relic_retaliation","Retaliation","After a perfectly timed Dodge, you deal 25% more Damage for 10 seconds.",{requiresAny:["plasma_art_adamant_restoration"]}],
            ["plasma_relic_fast_venting","Fast Venting","Weapon cools 15% faster.",{requiresAny:["plasma_relic_retaliation"]}],
            ["plasma_relic_common_cooling","Common Cooling","Common Shots generate 10% less Heat.",{requiresAny:["plasma_relic_fast_venting"]}],
            ["plasma_relic_perfect_radius","Perfect Radius","After a perfectly timed Dodge, the Damage radius of a Charged Shot increases by 10% for 10 seconds.",{requiresAny:["plasma_art_adamant_velocity"]}],
            ["plasma_relic_perpetual_velocity","Perpetual Velocity","Shots Charge 20% faster.",{requiresAny:["plasma_relic_fast_venting","plasma_relic_perfect_radius"]}],
            ["plasma_relic_great_might","Great Might","Damage increases by 10% against Terminus-level enemies.",{requiresAny:["plasma_relic_perpetual_velocity"]}],
            ["plasma_relic_efficient_charge","Efficient Charge","Charged Shots from Plasma Weapons use 2 less energy.",{requiresAny:["plasma_relic_perpetual_velocity"]}]
          ]}
        ]
      },
      "Auto Bolt Rifle": {tiers:[]},
      "Bolt Rifle": {tiers:[]},
      "Heavy Bolt Rifle": {tiers:[]},
      "Occulus Bolt Carbine": {tiers:[]}
    }
  },
  secondary: {
    label:"Secondary",
    weapons:{
      "Bolt Pistol": {
        tiers:[
          {name:"Standard",perks:[["bp_standard","Balanced Fire","Improved weapon handling."],["bp_mag","Extended Magazine","Increased magazine capacity."]]},
          {name:"Master-Crafted",perks:[["bp_mc_damage","Firing Power","Increased weapon damage."]]},
          {name:"Artificer",perks:[["bp_art_head","Head Hunter","Improved headshot effectiveness."]]},
          {name:"Relic",perks:[["bp_relic_reload","Fast Reload","Faster reload speed."]]},
          {name:"Heroic",perks:[["bp_heroic","Heroic Pattern","Heroic weapon perk."]]}
        ]
      },
      "Heavy Bolt Pistol": {tiers:[]},
      "Plasma Pistol": {tiers:[]},
      "Inferno Pistol": {tiers:[]},
      "Neo-Volkite Pistol": {tiers:[]}
    }
  },
  melee: {
    label:"Melee",
    weapons:{
      "Omnissian Axe": {
        tiers:[
          {name:"Standard",perks:[["axe_strength","Strength","Increased melee damage."],["axe_impact","Impact","Improved impact."]]},
          {name:"Master-Crafted",perks:[["axe_cleave","Cleave","Improved cleaving attacks."]]},
          {name:"Artificer",perks:[["axe_parry","Parrying Mastery","Improved defensive performance."]]},
          {name:"Relic",perks:[["axe_onslaught","Onslaught","Improved sustained melee output."]]},
          {name:"Heroic",perks:[["axe_execution","Explosive Strike","A heavy hit can trigger an explosive effect."]]}
        ]
      },
      "Combat Knife": {tiers:[]},
      "Power Sword": {tiers:[]},
      "Power Axe": {tiers:[]}
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
    primary:{weapon:"Plasma Incinerator",active:[]},
    secondary:{weapon:"Bolt Pistol",active:[]},
    melee:{weapon:"Omnissian Axe",active:[]}
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
  constructor(leaf, plugin) { super(leaf); this.plugin=plugin; this.activeTab="class"; this.openMenus=new Set(); }
  getViewType(){return "sm2-build-planner-view";}
  getDisplayText(){return "SM2 Build Planner";}
  getIcon(){return "swords";}
  async onOpen(){this.render();}
  async onClose(){this.openMenus.clear();}
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
      const sec=main.createDiv({cls:"sm2-category"});
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

  renderWeapons(main){
    main.createEl("div",{cls:"sm2-section-note",text:"Select perks along the connected weapon tree. Locked perks show the prerequisite or branch that prevents selection. Changes are saved automatically."});
    ["primary","secondary","melee"].forEach((slot)=>{
      const group=main.createDiv({cls:"sm2-weapon-slot"});
      const top=group.createDiv({cls:"sm2-weapon-heading"});
      top.createEl("h2",{text:WEAPONS[slot].label+" Weapon"});
      const names=Object.keys(WEAPONS[slot].weapons);
      const current=this.plugin.currentBuild.weapons[slot].weapon;
      this.makeSelect(top,names.map(x=>({value:x,label:x})),current,w=>{
        this.plugin.setWeapon(slot,w);this.render();
      });
      const tree=group.createDiv({cls:"sm2-weapon-grid"});
      const weapon=WEAPONS[slot].weapons[current];
      const tiers=weapon.tiers || [];
      if(!tiers.length){
        tree.createDiv({cls:"sm2-empty-weapon",text:"Weapon data has not been entered yet."});
      } else {
        const active=this.plugin.currentBuild.weapons[slot].active;
        tiers.forEach((t)=>{
          const col=tree.createDiv({cls:"sm2-tier"});
          col.createEl("h3",{text:t.name});
          (t.perks || []).forEach(p=>{
            const id=perkId(p);
            const isActive=active.includes(id);
            const state=this.plugin.getWeaponPerkState(slot,id);
            const disabled=!isActive && !state.available;
            const reason=disabled ? state.reason : "";
            const el=col.createDiv({cls:"sm2-weapon-perk"+(isActive?" active":"")+(disabled?" disabled":"")});
            el.createEl("strong",{text:perkName(p)});
            el.createDiv({cls:"sm2-small",text:perkDesc(p)});
            if(disabled) el.setAttr("title",reason);
            el.onclick=()=>{
              if(disabled){new Notice(reason);return;}
              this.plugin.toggleWeaponPerk(slot,id);
              this.render();
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
    const selected=new Set(Array.isArray(state.active)?state.active:[]);
    const knownIds=new Set(allWeaponPerks(tiers).map(perkId));
    for(const id of Array.from(selected)) if(!knownIds.has(id)) selected.delete(id);
    if(weapon?.treeMode === "graph"){
      // Resolve invalid/legacy selections until stable. If two mutually
      // exclusive perks are present, keep the earlier selected entry.
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
            // Preserve the first selected item in the stored array.
            const first=state.active.indexOf(id) < state.active.indexOf(conflict) ? id : conflict;
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
    state.active=Array.from(selected);
  }

  getWeaponPerkState(slot,id){
    const state=this.currentBuild.weapons[slot];
    const weapon=WEAPONS[slot]?.weapons?.[state.weapon];
    const tiers=weapon?.tiers || [];
    const perks=allWeaponPerks(tiers);
    const perk=perks.find(p=>perkId(p)===id);
    if(!perk) return {available:false,reason:"Weapon perk data could not be found."};
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
    if(!Array.isArray(b.classActive)) b.classActive=[];
    if(!Array.isArray(b.prestige)) b.prestige=[];
    if(!b.weapons || typeof b.weapons!=="object") b.weapons={};
    for(const slot of ["primary","secondary","melee"]){
      const def=DEFAULT_BUILD().weapons[slot];
      if(!b.weapons[slot] || typeof b.weapons[slot]!=="object") b.weapons[slot]=def;
      if(typeof b.weapons[slot].weapon!=="string") b.weapons[slot].weapon=def.weapon;
      if(!Array.isArray(b.weapons[slot].active)) b.weapons[slot].active=[];
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
  setWeapon(slot,name){this.currentBuild.weapons[slot].weapon=name;this.currentBuild.weapons[slot].active=[];this.autoSave();}
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
    if(weapon?.treeMode !== "graph"){
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