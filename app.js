
const LS_KEY = 'shadowhud_v13_state';
const defaultState = () => ({
  xp: 0, level: 1, ap: 0, gold: 0,
  attributes: { physical:0, psyche:0, intellect:0, social:0, spiritual:0, financial:0 },
  quests: [], store: [], filter: 'all'
});
let state = loadState();
let radarChart;

function loadState(){ try { return JSON.parse(localStorage.getItem(LS_KEY)) || defaultState(); } catch { return defaultState(); } }
function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function $(q){ return document.querySelector(q); }
function $el(html){ const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

document.querySelectorAll('.tabbar .tab').forEach(btn=>{
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabbar .tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const id = btn.dataset.tab;
    document.querySelectorAll('.tabpage').forEach(p=>p.classList.remove('active'));
    document.getElementById('tab-'+id).classList.add('active');
    if(id==='character') drawRadar();
  });
});

document.querySelectorAll('#filters .chip').forEach(ch=>{
  ch.addEventListener('click',() => {
    document.querySelectorAll('#filters .chip').forEach(c=>c.classList.remove('chip-on'));
    ch.classList.add('chip-on');
    state.filter = ch.dataset.filter;
    renderQuests();
  });
});

const modal = $('#questModal');
$('#addQuest').onclick = () => { openQuestModal(); };
$('#qCancel').onclick = () => modal.classList.add('hidden');
$('#qSave').onclick = () => {
  const q = readQuestForm();
  q.id = 'q_' + Math.random().toString(36).slice(2);
  q.status = 'active';
  q.createdAt = Date.now();
  if (q.daily) q.resetAt = nextMidnight();
  state.quests.push(q);
  saveState();
  modal.classList.add('hidden');
  render();
};
function openQuestModal(){
  ['qTitle','qDesc','qTags','qChecklist','qMulti'].forEach(id=>document.getElementById(id).value='');
  $('#qType').value = 'timer'; $('#qXP').value=20; $('#qGold').value=10; $('#qDaily').checked=true;
  modal.classList.remove('hidden');
}
function readQuestForm(){
  const title = $('#qTitle').value.trim() || 'Untitled';
  const desc  = $('#qDesc').value.trim();
  const type  = $('#qType').value;
  const tags  = ($('#qTags').value||'').split(',').map(s=>s.trim()).filter(Boolean);
  const xp    = Number($('#qXP').value||0);
  const gold  = Number($('#qGold').value||0);
  const daily = $('#qDaily').checked;
  const checklistStr = $('#qChecklist').value.trim();
  const multiStr = $('#qMulti').value.trim();
  const checklist = checklistStr ? checklistStr.split(',').map(s=>({label:s.trim(),done:false})) : [];
  const counters = multiStr ? multiStr.split(',').map(p=>{
    const [label,target] = p.split(':').map(s=>s.trim());
    return {label,target: Number(target||1), value:0};
  }):[];
  return { title, desc, type, tags, xp, gold, daily, checklist, counters };
}
function nextMidnight(){ const d = new Date(); d.setHours(24,0,0,0); return d.getTime(); }
function pad(n){ return n.toString().padStart(2,'0'); }
function fmtCountdown(ms){ const s = Math.max(0, Math.floor(ms/1000)); const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60; return `${pad(h)}:${pad(m)}:${pad(sec)}`; }
function awardRewards(q){ state.xp += q.xp||0; state.gold += q.gold||0; $('#gold').textContent = state.gold; }

function getVisibleQuests(){
  const f = state.filter || 'all';
  let qs = [...state.quests];
  if (f==='done') qs = qs.filter(q=>q.status==='done');
  else if (f==='daily') qs = qs.filter(q=>q.daily && q.status!=='done');
  else if (f==='active') qs = qs.filter(q=>q.status!=='done');
  return qs;
}
function renderQuests(){
  const list = $('#questList');
  const qs = getVisibleQuests();
  list.innerHTML = '';
  qs.forEach(q => {
    let countdown = '';
    if (q.daily){
      if (!q.resetAt) q.resetAt = nextMidnight();
      const ms = q.resetAt - Date.now();
      countdown = `<div class="muted">resets in ${fmtCountdown(ms)}</div>`;
      if (ms<=0){
        q.resetAt = nextMidnight();
        q.status = 'active';
        q.counters?.forEach(c=>c.value=0);
        q.checklist?.forEach(i=>i.done=false);
        saveState();
      }
    }
    const countersHtml = (q.counters||[]).map(c => `
      <div class="row between">
        <div>${c.label}</div>
        <div class="btnrow">
          <button class="chip" onclick="bump('${q.id}','${c.label}',-1)">-1</button>
          <button class="chip" onclick="bump('${q.id}','${c.label}',+1)">+1</button>
          <button class="chip chip-primary" onclick="finishCounter('${q.id}','${c.label}')">Finish</button>
          <span class="muted">${c.value} / ${c.target}</span>
        </div>
      </div>
    `).join('');
    const checklistHtml = (q.checklist||[]).map((i,idx)=>`
      <label class="todo">
        <input type="checkbox" ${i.done?'checked':''}
          onchange="toggleChecklist('${q.id}',${idx},this.checked)">
        <span>${i.label}</span>
      </label>`).join('');
    const card = $el(`
      <div class="quest">
        <div class="title">${q.title}</div>
        <div class="meta">${(q.daily?'<span class="chip">Daily</span>':'')}
          ${q.tags?.map(t=>`<span class="chip">${t}</span>`).join('')||''}</div>
        ${countdown}
        ${countersHtml}
        ${checklistHtml ? `<div class="panel">${checklistHtml}</div>`:''}
        <div class="btnrow">
          <button class="chip" onclick="completeQuest('${q.id}')">Done</button>
          <button class="chip" onclick="resetQuest('${q.id}')">Reset</button>
          <button class="chip" onclick="editQuest('${q.id}')">Edit</button>
          <button class="chip" onclick="deleteQuest('${q.id}')">Delete</button>
        </div>
      </div>
    `);
    list.appendChild(card);
  });
}
function bump(qid, label, d){ const q = state.quests.find(x=>x.id===qid); const c = q?.counters?.find(x=>x.label===label); if (!c) return; c.value = Math.max(0, Math.min(c.target, c.value + d)); saveState(); renderQuests(); }
function finishCounter(qid,label){ const q = state.quests.find(x=>x.id===qid); const c = q?.counters?.find(x=>x.label===label); if (!c) return; c.value=c.target; saveState(); renderQuests(); }
function toggleChecklist(qid,idx,checked){ const q = state.quests.find(x=>x.id===qid); if (!q?.checklist[idx]) return; q.checklist[idx].done = checked; saveState(); }
function completeQuest(id){ const q = state.quests.find(q=>q.id===id); if (!q) return; q.status = 'done'; q.doneAt = Date.now(); awardRewards(q); saveState(); render(); }
function resetQuest(id){ const q = state.quests.find(q=>q.id===id); if (!q) return; q.status = 'active'; q.counters?.forEach(c=>c.value=0); q.checklist?.forEach(i=>i.done=false); saveState(); render(); }
function editQuest(id){
  const q = state.quests.find(q=>q.id===id); if (!q) return;
  $('#qTitle').value = q.title; $('#qDesc').value=q.desc||''; $('#qType').value=q.type||'timer';
  $('#qTags').value = (q.tags||[]).join(','); $('#qXP').value=q.xp||0; $('#qGold').value=q.gold||0;
  $('#qDaily').checked=!!q.daily;
  $('#qChecklist').value = (q.checklist||[]).map(i=>i.label).join(', ');
  $('#qMulti').value = (q.counters||[]).map(c=>`${c.label}:${c.target}`).join(', ');
  modal.classList.remove('hidden');
  $('#qSave').onclick = () => {
    const n = readQuestForm();
    Object.assign(q, n);
    q.status = 'active'; if(q.daily) q.resetAt = nextMidnight();
    saveState(); modal.classList.add('hidden'); render();
  };
}
function deleteQuest(id){ state.quests = state.quests.filter(q=>q.id!==id); saveState(); render(); }

function drawRadar(){
  const s = state.attributes;
  const data = [s.physical,s.psyche,s.intellect,s.social,s.spiritual,s.financial];
  const ctx = document.getElementById('attributeChart');
  if (radarChart) radarChart.destroy();
  radarChart = new Chart(ctx, {
    type:'radar',
    data:{ labels:['Physical','Psyche','Intellect','Social','Spiritual','Financial'],
      datasets:[{ data, fill:true, backgroundColor:'rgba(123,97,255,0.10)', borderColor:'rgba(123,97,255,0.75)', pointBackgroundColor:'#a899ff', pointBorderColor:'transparent'}]},
    options:{
      plugins:{ legend:{display:false} },
      scales:{ r:{ beginAtZero:true, min:0, max:10, ticks:{display:false}, grid:{color:'rgba(255,255,255,.08)'}, angleLines:{color:'rgba(255,255,255,.08)'}, pointLabels:{color:'#bfc2d6',font:{size:12}} } }
    }
  });
  renderAttrStats();
}
function renderAttrStats(){
  const s = state.attributes;
  const map = [['PHYSICAL','physical'],['PSYCHE','psyche'],['INTELLECT','intellect'],['SOCIAL','social'],['SPIRITUAL','spiritual'],['FINANCIAL','financial']];
  const box = $('#attrStats');
  box.innerHTML = '';
  map.forEach(([label,key])=>{
    const el = $el(`<div class="panel"><div style="font-size:32px;font-weight:800;text-align:center">${s[key]}</div><div style="text-align:center;color:#bfc2d6">${label}</div></div>`);
    box.appendChild(el);
  });
  $('#ap').textContent = state.ap;
  $('#gold').textContent = state.gold;
}
function renderJourney(){ $('#journeyStats').innerHTML = `Level ${state.level} • XP ${state.xp} • Gold ${state.gold}`; }

let focusInterval=null, focusEndAt=null;
function startFocus(){ const mins = Math.max(1, Number($('#focusMinutes').value||25)); focusEndAt = Date.now()+mins*60000; tickFocus(); focusInterval=setInterval(tickFocus,500); }
function pauseFocus(){ clearInterval(focusInterval); focusInterval=null; }
function resumeFocus(){ if(focusEndAt && !focusInterval) focusInterval=setInterval(tickFocus,500); }
function cancelFocus(){ pauseFocus(); focusEndAt=null; $('#focusTimer').textContent='00:00'; }
function tickFocus(){ const ms = Math.max(0, focusEndAt-Date.now()); $('#focusTimer').textContent = fmtCountdown(ms); if(ms===0) pauseFocus(); }
$('#focusStart').onclick=startFocus; $('#focusPause').onclick=pauseFocus; $('#focusResume').onclick=resumeFocus; $('#focusCancel').onclick=cancelFocus;

function render(){ renderQuests(); renderJourney(); drawRadar(); $('#goldStore').textContent = state.gold; const need = 47 + 7*state.level; const have = state.xp % need; $('#xpbarInner').style.width = Math.min(100, Math.round(have/need*100))+'%'; }
render();
setInterval(renderQuests, 1000);
