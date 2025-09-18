// ShadowHUD v13.1 (all-in-one, localStorage)
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

// ---- State ----
const state = {
  gold: 0,
  level: 1,
  xp: 0,
  xpToNext: 47, // starter
  attributes: { physical:0, psyche:0, intellect:0, social:0, spiritual:0, financial:0 },
  ap: 0,
  titles: [
    {id:'starter', name:'The One Who Started', req:{completed:1}, owned:false, equipped:false},
    {id:'earlybird', name:'Early Riser', req:{dailyStreak:3}, owned:false, equipped:false},
    {id:'grit', name:'Grit', req:{hardDone:5}, owned:false, equipped:false}
  ],
  journey: { completed:0, streak:0 },
  quests: [],
  store: []
};

// ---- Persistence ----
const KEY = "shadowhud_v13_1";
function save(){ localStorage.setItem(KEY, JSON.stringify(state)); }
function load(){
  const raw = localStorage.getItem(KEY);
  if(raw){
    const data = JSON.parse(raw);
    Object.assign(state, data);
  }
}
load();

// ---- Utility ----
function fmt(n){ return new Intl.NumberFormat().format(n); }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function now(){ return Date.now(); }
function msToMidnight(){
  const d = new Date();
  d.setHours(24,0,0,0);
  return d.getTime() - Date.now();
}
function countdownText(){
  const ms = msToMidnight();
  const h = Math.floor(ms/3_600_000);
  const m = Math.floor((ms%3_600_000)/60_000);
  const s = Math.floor((ms%60_000)/1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function rankForLevel(lv){
  if(lv<=15) return 'E';
  if(lv<=30) return 'D';
  if(lv<=45) return 'C';
  if(lv<=60) return 'B';
  if(lv<=85) return 'A';
  return 'S';
}
function xpNeededFor(level){
  // simple curve
  return Math.floor( 40 + level*7 + Math.pow(level*0.9, 2) );
}

// ---- Tabs ----
$("#tabs").addEventListener("click", (e)=>{
  const b = e.target.closest(".tab-btn");
  if(!b) return;
  $$(".tab-btn").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  const tab = b.dataset.tab;
  $$(".view").forEach(v=>v.classList.remove("active"));
  $("#view-"+tab).classList.add("active");
  if(tab==='character') refreshRadar();
});

// ---- Quests ----
const QUEST_TEMPLATES = [
  { title:"Meditate 10 minutes", type:"timer", minutes:10, difficulty:"Normal", attrs:["spiritual"], xp:10, gold:10, daily:true },
  { title:"Budget review", type:"timer", minutes:20, difficulty:"Normal", attrs:["financial"], xp:20, gold:16, daily:true },
  { title:"Call or text a loved one", type:"counter", target:1, difficulty:"Easy", attrs:["social"], xp:10, gold:10, daily:true },
  { title:"Deep clean a room", type:"counter", target:3, difficulty:"Hard", attrs:["social"], xp:77, gold:22, daily:true },
  { title:"Study/Skill practice 30 min", type:"timer", minutes:30, difficulty:"Hard", attrs:["intellect"], xp:88, gold:22, daily:true },
];

function ensureDailyQuests(){
  const tag = new Date().toDateString();
  if(state._dailyTag === tag) return;
  state._dailyTag = tag;

  // Always strength training
  const st = {
    id: crypto.randomUUID(),
    title:"Strength Training",
    type:"multi",
    multi:[
      {label:"Pushups", target:100, count:0},
      {label:"Sit-ups", target:100, count:0},
      {label:"Squats", target:100, count:0},
      {label:"Run (miles)", target:1, count:0}
    ],
    difficulty:"Elite",
    attrs:["physical"],
    xp:120, gold:30,
    daily:true, created: Date.now(), status:"active"
  };

  // Pick 3 random other dailies
  const picks = [];
  const source = [...QUEST_TEMPLATES];
  while(picks.length<3 && source.length){
    const i = Math.floor(Math.random()*source.length);
    picks.push(source.splice(i,1)[0]);
  }
  const newQs = picks.map(q => ({
    id: crypto.randomUUID(),
    title:q.title, type:q.type,
    minutes:q.minutes||25, target:q.target||1, count:0,
    multi: q.type==='multi'? q.multi: undefined,
    difficulty:q.difficulty, attrs:q.attrs, xp:q.xp, gold:q.gold,
    daily:true, created: Date.now(), status:"active"
  }));

  // Remove old dailies (not penalties or user-created)
  state.quests = state.quests.filter(q => !q.daily);
  // Add strength + 3
  state.quests.unshift(st, ...newQs);
  save();
}

function addQuest(q){
  q.id = crypto.randomUUID();
  q.created = Date.now();
  q.status = "active";
  state.quests.unshift(q);
  save(); renderQuests();
}

function completeQuest(q){
  q.status = "done";
  state.journey.completed += 1;
  // rewards
  state.gold += (q.gold||0);
  // xp
  state.xp += (q.xp||0);
  while(state.xp >= state.xpToNext){
    state.level += 1;
    state.xp -= state.xpToNext;
    state.xpToNext = xpNeededFor(state.level);
  }
  // attributes
  (q.attrs||[]).forEach(a => {
    if(state.attributes[a] != null) state.attributes[a] += 1;
  });
  // titles checks
  checkTitles();
  save();
  renderAll();
}

function deleteQuest(qid){
  state.quests = state.quests.filter(q => q.id!==qid);
  save(); renderQuests();
}

function resetQuestProgress(q){
  if(q.type==='counter'){ q.count = 0; }
  if(q.type==='timer'){ q.progress = 0; q.running = false; }
  if(q.type==='multi'){ q.multi.forEach(m=>m.count=0); }
  q.status="active";
  save(); renderQuests();
}

function renderQuests(filter='all'){
  const host = $("#questList");
  host.innerHTML = '';
  const list = state.quests.filter(q=>{
    if(filter==='daily') return !!q.daily && q.status!=='done';
    if(filter==='penalty') return q.penalty && q.status!=='done';
    if(filter==='active') return q.status==='active';
    if(filter==='done') return q.status==='done';
    return true;
  });
  list.forEach(q=>{
    const card = document.createElement('div');
    card.className = 'card quest-card';

    const cd = `<span class="countdown" data-q="${q.id}">resets in ${countdownText()}</span>`;
    const tags = `<span class="chip${q.daily?' active':''}">${q.daily?'Daily':'One-off'}</span> <span class="chip">${q.difficulty||'Normal'}</span>`;
    const attr = (q.attrs||[]).map(a=>`<span class="chip">${a}</span>`).join(' ');
    const reward = `<div class="muted">+${q.xp||0} XP · <span class="coin">💰</span> ${q.gold||0}</div>`;

    let body = '';
    if(q.type==='counter'){
      body = `<div class="counter-row"><span class="label">Count</span> <span>${q.count||0} / ${q.target||1}</span>
        <div class="row">
          <button class="btn btn-ghost btn-sm" data-act="-1">-1</button>
          <button class="btn btn-ghost btn-sm" data-act="+1">+1</button>
        </div>
      </div>`;
    } else if(q.type==='timer'){
      const pct = Math.min(100, Math.round((q.progress||0)/(q.minutes*60)*100));
      body = `<div class="bar" style="margin:.4rem 0"><div style="width:${pct}%"></div></div>
        <div class="row wrap">
          <button class="btn btn-primary btn-sm" data-act="start">Start</button>
          <button class="btn btn-ghost btn-sm" data-act="pause">Pause</button>
          <button class="btn btn-ghost btn-sm" data-act="resume">Resume</button>
        </div>`;
    } else if(q.type==='multi'){
      body = q.multi.map((m,i)=>`
        <div class="counter-row">
          <span class="label">${m.label}</span> <span>${m.count} / ${m.target}</span>
          <div class="row">
            <button class="btn btn-ghost btn-sm" data-act="-1" data-i="${i}">-1</button>
            <button class="btn btn-ghost btn-sm" data-act="+1" data-i="${i}">+1</button>
            <button class="btn btn-primary btn-sm" data-act="finish" data-i="${i}">Finish</button>
          </div>
        </div>
      `).join('');
    }

    card.innerHTML = `
      <div class="row space-between">
        <div class="title">${q.title}</div>
        <div>${reward}</div>
      </div>
      <div class="row wrap">${tags} ${attr}</div>
      <div class="meta"> ${cd} </div>
      ${body}
      <div class="row wrap">
        <button class="btn btn-success btn-sm" data-act="done">Done</button>
        <button class="btn btn-warning btn-sm" data-act="reset">Reset</button>
        <button class="btn btn-ghost btn-sm" data-act="edit">Edit</button>
        <button class="btn btn-danger btn-sm" data-act="delete">Delete</button>
      </div>
    `;

    card.addEventListener("click",(ev)=>{
      const b = ev.target.closest("button");
      if(!b) return;
      const act = b.dataset.act;
      if(act==='+1'){ if(q.type==='counter'){ q.count = clamp((q.count||0)+1,0,q.target||999); } }
      if(act==='-1'){ if(q.type==='counter'){ q.count = clamp((q.count||0)-1,0,q.target||999); } }
      if(q.type==='multi'){
        const idx = Number(b.dataset.i);
        if(act==='+1'){ q.multi[idx].count = clamp(q.multi[idx].count+1,0,q.multi[idx].target); }
        if(act==='-1'){ q.multi[idx].count = clamp(q.multi[idx].count-1,0,q.multi[idx].target); }
        if(act==='finish'){ q.multi[idx].count = q.multi[idx].target; }
      }
      if(act==='start'){ q.running = true; q._tickStart = Date.now(); }
      if(act==='pause'){ if(q.running){ q.progress = (q.progress||0) + Math.floor((Date.now()-q._tickStart)/1000); q.running=false; } }
      if(act==='resume'){ if(!q.running){ q.running=true; q._tickStart=Date.now(); } }
      if(act==='reset'){ resetQuestProgress(q); return; }
      if(act==='delete'){ deleteQuest(q.id); return; }
      if(act==='done'){ completeQuest(q); return; }
      save(); renderQuests($(".chip.active")?.dataset.filter||'all');
    });

    host.appendChild(card);
  });

  // Style any raw buttons (safety)
  $$("#questList .card button").forEach(b=>{
    if(!b.classList.contains('btn')){
      b.classList.add('btn','btn-ghost','btn-sm');
      const t=(b.textContent||'').trim().toLowerCase();
      if(t==='start'||t==='finish') b.classList.add('btn-primary');
      else if(t==='done') b.classList.add('btn-success');
      else if(t==='reset') b.classList.add('btn-warning');
      else if(t==='delete') b.classList.add('btn-danger');
    }
  });
}

$("#questFilters").addEventListener("click",(e)=>{
  const c = e.target.closest(".chip"); if(!c) return;
  $$("#questFilters .chip").forEach(x=>x.classList.remove("active"));
  c.classList.add("active");
  renderQuests(c.dataset.filter);
});

$("#addQuestFab").addEventListener("click", ()=>{
  $("#questForm").reset();
  $("#questFormTitle").textContent="New Quest";
  $("#questDialog").showModal();
});
$("#questDialog").addEventListener("close", ()=>{
  if($("#questDialog").returnValue!=="default") return;
  const fd = new FormData($("#questForm"));
  const type = fd.get("type");
  const q = {
    title: fd.get("title"),
    desc: fd.get("desc")||"",
    type,
    minutes: Number(fd.get("minutes"))||25,
    target: Number(fd.get("target"))||1,
    difficulty: fd.get("difficulty"),
    daily: fd.get("daily")==="yes",
    attrs: (fd.get("attrs")||"").split(",").map(s=>s.trim()).filter(Boolean),
    xp: Number(fd.get("xp"))||0,
    gold: Number(fd.get("gold"))||0
  };
  if(type==='multi'){
    q.multi = (fd.get("multi")||"").split(",").map(s=>s.trim()).filter(Boolean).map(e=>{
      const [label, tgt] = e.split(":");
      return {label:label||'Item', target:Number(tgt)||1, count:0};
    });
  }
  addQuest(q);
});

// Midnight reset: remove unfinished daily quests -> penalty
function dailyTick(){
  // any daily that is still active becomes a penalty quest
  const still = state.quests.filter(q=>q.daily && q.status!=='done');
  still.forEach(q=>{
    state.quests = state.quests.filter(x=>x.id!==q.id);
    state.quests.unshift({
      id: crypto.randomUUID(),
      title: `Penalty — ${q.title}`,
      type: 'counter', target:1, count:0,
      difficulty:'Normal', attrs: q.attrs||[],
      xp: Math.max(5, Math.floor((q.xp||10)*0.6)),
      gold: 0, penalty:true, daily:false, created: Date.now(), status:'active'
    });
  });
  state.journey.streak = (still.length===0) ? (state.journey.streak+1) : 0;
  ensureDailyQuests();
  save();
  renderAll();
  setCountdown();
}

// Global countdown updater for all cards
let countdownTimer;
function setCountdown(){
  clearInterval(countdownTimer);
  countdownTimer = setInterval(()=>{
    const text = countdownText();
    document.querySelectorAll(".countdown").forEach(el=>{
      el.textContent = `resets in ${text}`;
    });
  },1000);
}

// Focus timer
let focusInt, focusRemain = 0;
function setFocusDisplay(sec){
  const m = Math.floor(sec/60), s=sec%60;
  $("#focusTime").textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
$("#focusStart").addEventListener("click", ()=>{
  const mins = Number($("#focusMinutes").value)||25;
  focusRemain = mins*60;
  clearInterval(focusInt);
  setFocusDisplay(focusRemain);
  focusInt = setInterval(()=>{
    focusRemain--; setFocusDisplay(focusRemain);
    if(focusRemain<=0){ clearInterval(focusInt); }
  },1000);
});
$("#focusPause").addEventListener("click", ()=> clearInterval(focusInt));
$("#focusResume").addEventListener("click", ()=>{
  clearInterval(focusInt);
  focusInt = setInterval(()=>{
    focusRemain--; setFocusDisplay(focusRemain);
    if(focusRemain<=0){ clearInterval(focusInt); }
  },1000);
});
$("#focusCancel").addEventListener("click", ()=>{ clearInterval(focusInt); setFocusDisplay(0); });

// Titles
function checkTitles(){
  state.titles.forEach(t=>{
    if(t.id==='starter' && state.journey.completed>=1) t.owned=true;
    if(t.id==='earlybird' && state.journey.streak>=3) t.owned=true;
    if(t.id==='grit'){
      const hardDone = state.quests.filter(q=>q.difficulty==='Hard' && q.status==='done').length;
      if(hardDone>=5) t.owned=true;
    }
  });
}
function renderTitles(){
  const host = $("#titleList"); host.innerHTML='';
  state.titles.forEach(t=>{
    const row = document.createElement('div');
    row.className = 'card row space-between';
    row.innerHTML = `<div><b>${t.name}</b><div class="muted">${t.owned?'Owned':'Locked'}</div></div>
      <div>
        <button class="btn ${t.equipped?'btn-success':'btn-primary'} btn-sm" ${t.owned?'':'disabled'} data-id="${t.id}">${t.equipped?'Equipped':'Equip'}</button>
      </div>`;
    row.addEventListener("click",(e)=>{
      const b = e.target.closest("button"); if(!b) return;
      const id = b.dataset.id;
      state.titles.forEach(x=>x.equipped=false);
      const tt = state.titles.find(x=>x.id===id); if(tt && tt.owned) tt.equipped=true;
      save(); renderTitles(); renderCharacterHeader();
    });
    host.appendChild(row);
  });
}
function equippedTitle(){ const t = state.titles.find(x=>x.equipped); return t? t.name : 'None'; }

// Character UI
let radar;
function refreshRadar(){
  const data = state.attributes;
  const vals = [data.financial, data.physical, data.psyche, data.social, data.intellect, data.spiritual];
  const labels = ['Financial','Physical','Psyche','Social','Intellect','Spiritual'];
  if(!radar){
    const ctx = document.getElementById('attrRadar');
    radar = new Chart(ctx, {
      type:'radar',
      data:{ labels, datasets:[{ data: vals, borderColor:'#6a5cff', backgroundColor:'rgba(106,92,255,.15)', pointRadius:2 }]},
      options:{
        responsive:true, maintainAspectRatio:false,
        scales:{ r:{ angleLines:{color:'#2e2f47'}, grid:{color:'#2e2f47'}, pointLabels:{color:'#bfc1e8'}, ticks:{display:false, stepSize:1} } },
        plugins:{ legend:{display:false} }
      }
    });
  } else {
    radar.data.datasets[0].data = vals;
    radar.update();
  }
}

function renderCharacterHeader(){
  $("#goldText3").textContent = fmt(state.gold);
  $("#apText").textContent = fmt(state.ap);
  $("#equippedTitle").textContent = equippedTitle();
  $("#levelText2").textContent = state.level;
  $("#xpText2").textContent = `${state.xp}/${state.xpToNext}`;
  $("#xpBar2").style.width = `${Math.min(100, Math.round(state.xp/state.xpToNext*100))}%`;
  Object.entries(state.attributes).forEach(([k,v])=>{
    const el = document.getElementById('attr-'+k);
    if(el) el.textContent = v;
  });
}

$$(".add-attr").forEach(b=>{
  b.addEventListener("click", ()=>{
    const att = b.dataset.attr;
    if(state.ap>0){
      state.ap -= 1;
      state.attributes[att] += 1;
      save(); renderCharacterHeader(); refreshRadar();
    }
  });
});
$("#changeTitleBtn").addEventListener("click", ()=>{
  $$(".tab-btn").forEach(b=>b.classList.remove("active"));
  $$('[data-tab="journey"]')[0].classList.add("active");
  $$(".view").forEach(v=>v.classList.remove("active"));
  $("#view-journey").classList.add("active");
  renderTitles();
});

// Store
function renderStore(){
  $("#goldText4").textContent = fmt(state.gold);
  const host = $("#storeList"); host.innerHTML = '';
  state.store.forEach((item, idx)=>{
    const row = document.createElement('div');
    row.className='card row space-between';
    row.innerHTML = `<div><b>${item.title}</b><div class="muted">${item.cost} gold</div></div>
      <div class="row">
        <button class="btn btn-primary btn-sm" data-act="buy" data-i="${idx}">Buy</button>
        <button class="btn btn-danger btn-sm" data-act="delete" data-i="${idx}">Delete</button>
      </div>`;
    row.addEventListener("click",(e)=>{
      const b = e.target.closest("button"); if(!b) return;
      const i = Number(b.dataset.i);
      if(b.dataset.act==='buy'){
        if(state.gold >= state.store[i].cost){
          state.gold -= state.store[i].cost; save(); renderAll();
        }
      } else {
        state.store.splice(i,1); save(); renderStore();
      }
    });
    host.appendChild(row);
  });
}
$("#saveReward").addEventListener("click", ()=>{
  const title = $("#rewardTitle").value.trim();
  const cost = Number($("#rewardCost").value)||0;
  if(!title) return;
  state.store.push({title, cost});
  $("#rewardTitle").value=''; $("#rewardCost").value=50;
  save(); renderStore();
});

// HUD + Journey
function renderHUD(){
  $("#goldDisplay").textContent = fmt(state.gold);
  $("#goldText2").textContent = fmt(state.gold);
  $("#levelText").textContent = state.level;
  $("#rankText").textContent = rankForLevel(state.level);
  $("#completedCount").textContent = state.journey.completed;
  $("#streakCount").textContent = state.journey.streak;
  $("#goldText2").textContent = fmt(state.gold);
  $("#levelText2").textContent = state.level;
  $("#xpText").textContent = `${state.xp}/${state.xpToNext}`;
  $("#xpBar").style.width = `${Math.min(100, Math.round(state.xp/state.xpToNext*100))}%`;
}
function renderAll(){
  renderHUD();
  renderQuests($(".chip.active")?.dataset.filter||'all');
  renderTitles();
  renderCharacterHeader();
  renderStore();
  refreshRadar();
}

// Midnight scheduler
let midnightTimeout;
function scheduleMidnight(){
  clearTimeout(midnightTimeout);
  midnightTimeout = setTimeout(()=>{
    dailyTick();
    scheduleMidnight();
  }, msToMidnight()+1000);
}

// Boot
ensureDailyQuests();
state.xpToNext = state.xpToNext || xpNeededFor(state.level);
renderAll();
setCountdown();
scheduleMidnight();

// Register SW (optional)
if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js'); }
