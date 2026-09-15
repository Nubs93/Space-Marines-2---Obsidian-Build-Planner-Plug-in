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

// Game reference data is maintained in src/data/classes.json and injected
// into the distributable root main.js by build.js.
const CLASS_DATA = __BUILD_CLASS_DATA__;

// Canonical weapon definitions and Heroic variant mappings are maintained in
// src/data/weapons.json and injected by build.js.
const WEAPONS = __BUILD_WEAPONS__;
const CLASS_DROPDOWN_ORDER = __BUILD_CLASS_DROPDOWN_ORDER__;
const HEROIC_VARIANT_PERKS = __BUILD_HEROIC_VARIANT_PERKS__;

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