/* ShadowHUD v13.4 – single file app logic */
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

const state = {
  version: '13.4',
  gold: 0,
  xp: 0,
  level: 1,
  xpToLevel: 47,
  completedToday: 0,
  streak: 0,
  attributes: {physical:0, psyche:0, intellect:0, social:0, spiritual:0, financial:0},
  equippedTitle: null,
  titles: {
    // id: {name, desc, unlocked:bool, requires:{completed?:n}}
    started: { name: "The One Who Started", desc:"Complete 1 quest", unlocked:false },
    earlybird: { name: "Early Riser", desc:"Complete a quest before 9am", unlocked:false },
    grinder: { name: "The Grinder", desc:"Complete 5 daily quests in a day", unlocked:false }
  },
  store: [],
  quests: [],
  lastDailyDate: null
};

// ---------- Storage ----------
function load(){
  const s = localStorage.getItem('shadowhud_v13');
  if(!s){ bootstrap(); save(); return; }
  try{
    const obj = JSON.parse(s);
    Object.assign(state, obj);
  }catch(e){ console.error(e); bootstrap(); }
}
function save(){
  localStorage.setItem('shadowhud_v13', JSON.stringify(state));
}
function midnightISO(){
  const n = new Date();
  const m = new Date(n.getFullYear(), n.getMonth(), n.getDate()+1, 0,0,0,0);
  return m.toISOString();
}
function secondsToHMS(sec){
  const h = Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':');
}

// ---------- Bootstrap + Daily generation ----------
function bootstrap(){
  state.gold=0; state.xp=0; state.level=1; state.xpToLevel=47;
  state.attributes={physical:0, psyche:0, intellect:0, social:0, spiritual:0, financial:0};
  state.equippedTitle=null;
  state.store=[];
  state.titles=state.titles||{}; // keep default
  state.quests = [];
  state.lastDailyDate = null;
  ensureDailies();
}
const dailyPool = [
  {title:"Meditate 10 minutes", type:"timer", minutes:10, xp:10, gold:10, attrs:["spiritual"], tags:["daily","normal"]},
  {title:"Budget review", type:"count", target:1, xp:20, gold:16, attrs:["financial"], tags:["daily","normal"]},
  {title:"Call or text a loved one", type:"count", target:1, xp:10, gold:10, attrs:["social"], tags:["daily","easy"]},
  {title:"Deep clean a room", type:"count", target:3, xp:77, gold:22, attrs:["social"], tags:["daily","hard"]},
  {title:"Study/Skill practice 30 min", type:"timer", minutes:30, xp:88, gold:22, attrs:["intellect"], tags:["daily","hard"]},
];
function ensureDailies(){
  const today = new Date().toDateString();
  if(state.lastDailyDate===today && state.quests.some(q=>q.daily)){ return; }
  // reset today's non-permanent dailies
  state.quests = state.quests.filter(q => q.permanent);
  // Strength training permanent
  if(!state.quests.some(q=>q.id==="strength")){
    state.quests.unshift(strengthQuest());
  }
  // pick 3 random
  const pool = dailyPool.slice().sort(()=>Math.random()-.5).slice(0,3);
  pool.forEach((p,i)=>{
    state.quests.push(makeQuestFromPool(p));
  });
  state.lastDailyDate=today;
  save();
}
function makeQuestFromPool(p){
  const id = 'd'+Math.random().toString(36).slice(2,8);
  const q = {
    id, title:p.title, desc:"", type:p.type, daily:true, permanent:false,
    xp:p.xp, gold:p.gold, attrs:p.attrs||[],
    created: Date.now(), status:"not-started", deadline: midnightISO(),
    progress:0, target: p.type==='timer'? (p.minutes*60) : (p.target||1),
    counters: p.type==='multi'? []:null, checklist: p.type==='checklist'? []:null,
    tags:p.tags||[]
  };
  return q;
}
function strengthQuest(){
  return {
    id:"strength",
    title:"Strength Training",
    desc:"",
    type:"multi",
    daily:true, permanent:true,
    xp:120, gold:30, attrs:["physical"],
    created:Date.now(), status:"not-started", deadline:midnightISO(),
    progress:0, target:0,
    counters:[
      {label:"Pushups", value:0, target:100},
      {label:"Sit-ups", value:0, target:100},
      {label:"Squats", value:0, target:100},
      {label:"Run (miles)", value:0, target:1}
    ],
    tags:["daily","elite","physical"]
  };
}

// ---------- Rendering ----------
let chart;
function render(){
  // header
  $('#goldDisplay').textContent = state.gold;
  // tabs
  $$('#tabs .tab').forEach(btn=>{
    btn.onclick = () => switchTab(btn.dataset.tab);
  });
  // filters
  $$('#questFilters .chip').forEach(ch=>{
    ch.onclick = ()=>{
      $$('#questFilters .chip').forEach(c=>c.classList.remove('on'));
      ch.classList.add('on'); renderQuests();
    };
  });
  $('#addQuestBtn').onclick = openQuestEditor;

  renderJourney();
  renderCharacter();
  renderStore();
  renderQuests();
  wireFocus();
  wireTitles();
}
function switchTab(id){
  $$('#tabs .tab').forEach(t=>t.classList.remove('active'));
  $(`#tabs .tab[data-tab="${id}"]`).classList.add('active');
  $$('.view').forEach(v=>v.classList.remove('active'));
  $(`#view-${id}`).classList.add('active');
}
function renderJourney(){
  $('#levelLabel').textContent = state.level;
  $('#levelLabel2').textContent = state.level;
  $('#rankLabel').textContent = rankForLevel(state.level);
  $('#xpLabel').textContent = state.xp; $('#xpLabel2').textContent = state.xp;
  $('#xpToLevel').textContent = state.xpToLevel; $('#xpToLevel2').textContent=state.xpToLevel;
  const pct = Math.min(100, Math.round(100*state.xp/state.xpToLevel));
  $('#xpBar').style.width = pct + '%'; $('#xpBar2').style.width = pct+'%';
  $('#statCompleted').textContent = state.completedToday||0;
  $('#statStreak').textContent = state.streak||0;
  $('#statGold').textContent = state.gold;
  // Titles
  const tWrap = $('#titles'); tWrap.innerHTML='';
  Object.entries(state.titles).forEach(([id,t])=>{
    const card = document.createElement('div'); card.className='titleCard';
    card.innerHTML = `<div class="name">${t.name}</div><small>${t.desc}</small><div>${t.unlocked?'✅ Unlocked':'🔒 Locked'}</div>`;
    tWrap.appendChild(card);
  });
  // Achievements placeholder
  $('#achievements').innerHTML = '<small>More coming soon ✨</small>';
}
function renderCharacter(){
  $('#equippedTitle').textContent = state.equippedTitle? state.titles[state.equippedTitle]?.name || 'None' : 'None';
  // attr tiles
  const grid = $('#attrGrid'); grid.innerHTML='';
  for(const [key,val] of Object.entries(state.attributes)){
    const name = key.toUpperCase();
    const tile = document.createElement('div'); tile.className='attr';
    tile.innerHTML = `<div class="n">${val}</div><div class="lbl">${name}</div>`;
    grid.appendChild(tile);
  }
  // chart
  const labels = ["Financial","Physical","Psyche","Social","Intellect","Spiritual"];
  const vals = [state.attributes.financial, state.attributes.physical, state.attributes.psyche, state.attributes.social, state.attributes.intellect, state.attributes.spiritual];
  const ctx = $('#attrChart').getContext('2d');
  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type:'radar',
    data: { labels, datasets:[{label:'Attributes', data: vals, pointRadius:2, borderWidth:2, fill:true}]},
    options:{
      plugins:{legend:{display:false}},
      scales:{ r:{ angleLines:{color:'#2a2d49'}, grid:{color:'#2a2d49'}, pointLabels:{color:'#c9c9df'}, suggestedMin:0, suggestedMax:10}},
    }
  });
}
function renderStore(){
  $('#storeList').innerHTML = state.store.length? '' : '<div class="card"><small>No rewards yet.</small></div>';
  state.store.forEach((item, idx)=>{
    const card = document.createElement('div'); card.className='card row space';
    card.innerHTML = `<div>${item.title}</div><div class="row">
      <div class="pill dark">🪙 ${item.cost}</div>
      <button class="btn danger" data-idx="${idx}">Delete</button>
    </div>`;
    card.querySelector('button').onclick = () => { state.store.splice(idx,1); save(); renderStore(); };
    $('#storeList').appendChild(card);
  });
  $('#saveReward').onclick = () => {
    const title = $('#newRewardTitle').value.trim();
    const cost = parseInt($('#newRewardCost').value||'0',10);
    if(!title || cost<=0) return;
    state.store.push({title, cost}); save(); $('#newRewardTitle').value=''; renderStore();
  };
}
function renderQuests(){
  ensureDailies();
  const filter = $('#questFilters .chip.on')?.dataset.filter || 'all';
  const list = $('#quests'); list.innerHTML='';
  const now = Date.now();
  state.quests.forEach(q => {
    if(filter==='daily' && !q.daily) return;
    if(filter==='active' && q.status!=='active') return;
    if(filter==='done' && q.status!=='done') return;
    if(filter==='penalty' && !q.tags?.includes('penalty')) return;

    const card = document.createElement('div'); card.className='quest';
    const metaChips = [];
    if(q.daily) metaChips.push(`<span class="chip">Daily</span>`);
    if(q.tags) q.tags.slice(0,3).forEach(t=>metaChips.push(`<span class="chip">${t}</span>`));
    const countdown = Math.max(0, Math.floor((new Date(q.deadline)-now)/1000));
    card.innerHTML = `
      <div class="row space"><div class="title">${q.title}</div><div class="row"><div class="pill dark">+${q.xp} XP</div><div class="pill dark">🪙 ${q.gold}</div></div></div>
      <div class="meta">${metaChips.join(' ')}</div>
      <div class="row"><small>resets in </small><small id="cd-${q.id}">${secondsToHMS(countdown)}</small></div>
      <div class="content"></div>
      <div class="row btnrow">
        <button class="btn good">Done</button>
        <button class="btn warn">Reset</button>
        <button class="btn">Edit</button>
        <button class="btn danger">Delete</button>
      </div>
    `;
    // content depending on type
    const cont = card.querySelector('.content');
    if(q.type==='multi'){
      q.counters.forEach((c, i)=>{
        const r = document.createElement('div'); r.className='ctrRow';
        r.innerHTML = `<div style="width:120px">${c.label}</div>
          <button class="sbtn minus">-1</button>
          <button class="sbtn plus">+1</button>
          <button class="pillbtn finish">Finish</button>
          <div style="margin-left:auto"><small>${c.value} / ${c.target}</small></div>`;
        r.querySelector('.minus').onclick = ()=>{ c.value=Math.max(0, c.value-1); save(); renderQuests(); };
        r.querySelector('.plus').onclick = ()=>{ c.value=Math.min(c.target, c.value+1); save(); renderQuests(); };
        r.querySelector('.finish').onclick = ()=>{ c.value=c.target; save(); renderQuests(); };
        cont.appendChild(r);
      });
    }else if(q.type==='count'){
      const r = document.createElement('div'); r.className='ctrRow';
      r.innerHTML = `<div style="width:120px">Count</div>
        <button class="sbtn minus">-1</button>
        <button class="sbtn plus">+1</button>
        <button class="pillbtn finish">Finish</button>
        <div style="margin-left:auto"><small>${q.progress} / ${q.target}</small></div>`;
      r.querySelector('.minus').onclick = ()=>{ q.progress=Math.max(0, q.progress-1); save(); renderQuests(); };
      r.querySelector('.plus').onclick = ()=>{ q.progress=Math.min(q.target, q.progress+1); save(); renderQuests(); };
      r.querySelector('.finish').onclick = ()=>{ q.progress=q.target; save(); renderQuests(); };
      cont.appendChild(r);
    }else if(q.type==='timer'){
      const r = document.createElement('div'); r.className='ctrRow';
      if(!q._remain) q._remain = q.target;
      r.innerHTML = `<div class="pill dark" id="tm-${q.id}">${formatMMSS(q._remain)}</div>
        <button class="btn primary" id="st-${q.id}">Start</button>
        <button class="btn" id="ps-${q.id}">Pause</button>`;
      cont.appendChild(r);
      // timer wiring
      let timer = null;
      const update = ()=> { $(`#tm-${q.id}`).textContent = formatMMSS(q._remain); };
      $(`#st-${q.id}`).onclick = ()=>{
        if(timer) return;
        timer = setInterval(()=>{
          q._remain = Math.max(0, q._remain-1);
          update();
          if(q._remain===0){ clearInterval(timer); timer=null; }
          save();
        },1000);
      };
      $(`#ps-${q.id}`).onclick = ()=>{ if(timer){ clearInterval(timer); timer=null; save(); } };
    }

    // buttons
    const [btnDone, btnReset, btnEdit, btnDelete] = card.querySelectorAll('.btnrow .btn');
    btnDone.onclick = ()=> completeQuest(q.id);
    btnReset.onclick = ()=> resetQuest(q.id);
    btnEdit.onclick = ()=> editQuest(q.id);
    btnDelete.onclick = ()=> deleteQuest(q.id);
    list.appendChild(card);
  });
  // countdown tick
  if(window._cdTick) clearInterval(window._cdTick);
  window._cdTick = setInterval(()=>{
    state.quests.forEach(q=>{
      const el = document.getElementById(`cd-${q.id}`);
      if(!el) return;
      const sec = Math.max(0, Math.floor((new Date(q.deadline)-Date.now())/1000));
      el.textContent = secondsToHMS(sec);
      if(sec<=0){ // midnight reset
        ensureDailies(); renderQuests();
      }
    });
  },1000);
}
function formatMMSS(s){ const m=Math.floor(s/60), ss=s%60; return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; }

function completeQuest(id){
  const idx = state.quests.findIndex(q=>q.id===id);
  if(idx<0) return;
  const q = state.quests[idx];
  award(q);
  // remove from screen
  state.quests.splice(idx,1);
  // keep permanent daily (like strength) – re-add fresh instance so it persists
  if(q.permanent){
    state.quests.unshift(strengthQuest());
  }
  save(); render(); // re-render to update everything
}
function award(q){
  state.gold += q.gold||0;
  addXP(q.xp||0);
  (q.attrs||[]).forEach(a=>{ if(state.attributes[a]!=null) state.attributes[a]+=1; });
  state.completedToday = (state.completedToday||0)+1;
  state.titles.started.unlocked = true;
  if(new Date().getHours()<9) state.titles.earlybird.unlocked = true;
  if(state.completedToday>=5) state.titles.grinder.unlocked = true;
}
function addXP(v){
  state.xp += v;
  while(state.xp >= state.xpToLevel){
    state.level += 1;
    state.xp -= state.xpToLevel;
    state.xpToLevel = Math.floor(state.xpToLevel*1.15+7);
  }
}
function resetQuest(id){
  const q = state.quests.find(x=>x.id===id); if(!q) return;
  if(q.type==='multi'){ q.counters.forEach(c=>c.value=0); }
  if(q.type==='count'){ q.progress=0; }
  if(q.type==='timer'){ q._remain=q.target; }
  save(); renderQuests();
}
function editQuest(id){
  const q = state.quests.find(x=>x.id===id);
  openQuestEditor(q);
}
function deleteQuest(id){
  const i = state.quests.findIndex(x=>x.id===id); if(i<0) return;
  state.quests.splice(i,1); save(); renderQuests();
}

// ---------- Editor ----------
function openQuestEditor(existing=null){
  const dlg = $('#questEditor');
  $('#qeTitle').value = existing?.title || '';
  $('#qeDesc').value = existing?.desc || '';
  $('#qeType').value = existing?.type || 'timer';
  $('#qeAttrs').value = existing?.attrs?.join(',') || 'physical';
  $('#qeXP').value = existing?.xp ?? 20;
  $('#qeGold').value = existing?.gold ?? 10;
  $('#qeDaily').checked = existing?.daily ?? true;
  dlg.returnValue='';
  dlg.showModal();
  $('#qeSave').onclick = (e)=>{
    e.preventDefault();
    const obj = existing || { id: 'q'+Math.random().toString(36).slice(2,8), created:Date.now() };
    obj.title = $('#qeTitle').value.trim() || 'New Quest';
    obj.desc = $('#qeDesc').value.trim();
    obj.type = $('#qeType').value;
    obj.attrs = $('#qeAttrs').value.split(',').map(s=>s.trim()).filter(Boolean);
    obj.xp = parseInt($('#qeXP').value||'0',10);
    obj.gold = parseInt($('#qeGold').value||'0',10);
    obj.daily = $('#qeDaily').checked;
    obj.deadline = midnightISO();
    obj.status = 'not-started';
    obj.permanent = existing?.permanent || false;
    if(obj.type==='timer'){ obj.target = 60*25; obj._remain = obj.target; }
    if(obj.type==='count'){ obj.target = obj.target||1; obj.progress = obj.progress||0; }
    if(obj.type==='multi' && !obj.counters){ obj.counters=[]; }
    if(!existing) state.quests.push(obj);
    save(); dlg.close(); renderQuests();
  };
}

// ---------- Titles ----------
function wireTitles(){
  $('#changeTitleBtn').onclick = ()=>{
    const dlg = $('#titlePicker');
    const list = $('#titleChoices'); list.innerHTML='';
    Object.entries(state.titles).forEach(([id,t])=>{
      const div = document.createElement('div'); div.className='titleCard';
      div.innerHTML = `<div class="name">${t.name}</div><small>${t.desc}</small><div>${t.unlocked?'✅':'🔒'}</div>`;
      if(t.unlocked){ div.onclick = ()=>{ state.equippedTitle=id; save(); renderCharacter(); dlg.close(); }; }
      list.appendChild(div);
    });
    dlg.showModal();
  };
}

// ---------- Focus ----------
let focusTimer=null, focusRemain=0;
function wireFocus(){
  $('#startFocus').onclick = ()=>{ focusRemain = parseInt($('#focusMinutes').value,10)*60; tickFocus(); if(focusTimer)clearInterval(focusTimer); focusTimer=setInterval(tickFocus,1000); };
  $('#pauseFocus').onclick = ()=>{ if(focusTimer){ clearInterval(focusTimer); focusTimer=null; } };
  $('#resumeFocus').onclick = ()=>{ if(!focusTimer && focusRemain>0){ focusTimer=setInterval(tickFocus,1000); } };
  $('#cancelFocus').onclick = ()=>{ if(focusTimer)clearInterval(focusTimer); focusTimer=null; focusRemain=0; updateFocus(); };
  updateFocus();
}
function tickFocus(){ focusRemain=Math.max(0,focusRemain-1); updateFocus(); if(focusRemain===0&&focusTimer){clearInterval(focusTimer); focusTimer=null;} }
function updateFocus(){ const m=Math.floor(focusRemain/60), s=focusRemain%60; $('#focusTimer').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }

// ---------- Init ----------
window.addEventListener('DOMContentLoaded', ()=>{
  try{ navigator.serviceWorker?.register('./sw.js'); }catch{}
  load();
  ensureDailies();
  render();
  // center tabs on load
  // (CSS already centers; keeping JS hook for future behavior)
});
function rankForLevel(l){ return ['E','D','C','B','A','S'][Math.min(5, Math.floor((l-1)/5))]; }
