/* LEONIDA SIGNAL — GitHub Pages public discovery + private local editorial workspace.
   No third-party scripts or browser-side credentials. Six curated source leads are seeded, not represented as a live scan. */
'use strict';
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short = (s,n=100)=>String(s??'').length>n?String(s).slice(0,n-1)+'…':String(s??'');
const num = n=>Number(n||0).toLocaleString();
const formatCount = n=>n>=1000000?(n/1e6).toFixed(1)+'M':n>=1000?(n/1000).toFixed(1)+'K':num(n);
const nowISO = ()=>new Date().toISOString();
const makeID = ()=>globalThis.crypto?.randomUUID?.()||'item_'+Date.now()+'_'+Math.random().toString(36).slice(2);
const safeUrl = u=>{try{let a=new URL(u);return ['https:','http:'].includes(a.protocol)?a.href:''}catch{return ''}};
const ago = when=>{if(!when)return 'Unknown date';let delta=Math.max(0,Date.now()-new Date(when).getTime())/3600000;if(!Number.isFinite(delta))return 'Unknown date';return delta<1?Math.round(delta*60)+'m ago':delta<24?Math.round(delta)+'h ago':Math.floor(delta/24)+'d ago'};
const fmtDate = s=>s?new Date(s).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'—';
const duration = sec=>!sec?'—':`${Math.floor(sec/60)}:${String(Math.round(sec%60)).padStart(2,'0')}`;
const statusTitles={discovered:'Inbox',shortlisted:'Shortlisted',rights:'Rights review',approved:'Cleared',editing:'Editing',review:'Final review',scheduled:'Ready',published:'Published',archived:'Archived'};
const stageOrder=['discovered','shortlisted','rights','approved','editing','review','scheduled','published'];
const defaultState=()=>({version:1,streamers:[{id:'seed_summit1g',handle:'summit1g',name:'Summit1g',platform:'Twitch',priority:3,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'},{id:'seed_xqc',handle:'xqc',name:'xQc',platform:'Twitch',priority:3,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'},{id:'seed_caseoh_',handle:'caseoh_',name:'CaseOh',platform:'Twitch',priority:3,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'},{id:'seed_kaicenat',handle:'kaicenat',name:'Kai Cenat',platform:'Twitch',priority:3,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'},{id:'seed_jynxzi',handle:'jynxzi',name:'Jynxzi',platform:'Twitch',priority:2,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'},{id:'seed_lord_kebun',handle:'lord_kebun',name:'Lord Kebun',platform:'Twitch',priority:2,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'},{id:'seed_esfandtv',handle:'esfandtv',name:'EsfandTV',platform:'Twitch',priority:2,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'}],clips:[],activity:[],settings:{scanWindow:24,autoScan:false,scanInterval:30,maxClips:60},lastScan:null});
let state=defaultState(),page='overview',filterText='',filterStatus='all',sortMode='score',clipSelected=null,networkMode=false,health={configured:false},busy=false,saveChain=Promise.resolve(),lastPersisted='',feedMeta={status:'loading',generatedAt:null},lastFeedRefresh=null;

function clipRights(c){return c.rights||{status:'unknown',evidence:'',scope:'',note:'',confirmedAt:''}}
function isCleared(c){const r=clipRights(c);return (r.status==='granted'||r.status==='own'||r.status==='other_basis')&&(r.status==='own'||(r.evidence||'').trim().length>3)&&(r.status!=='granted'||(r.scope||'').trim().length>0)&&(r.status!=='other_basis'||(r.note||'').trim().length>5)}
function scoreParts(c){let t=c.createdAt||c.discoveredAt?new Date(c.createdAt||c.discoveredAt).getTime():0;let hours=t?Math.max(.2,(Date.now()-t)/3600000):1000000;let v=Number(c.views||0);let rate=v/hours;
  let velocity=Math.min(35,Math.round(35*Math.log10(1+rate)/3.5));
  if(c.priorViews!=null&&c.priorCheckedAt){const age=(Date.now()-new Date(c.priorCheckedAt).getTime())/3600000;if(age>.01&&v>=c.priorViews){rate=(v-c.priorViews)/age;velocity=Math.min(35,Math.round(35*Math.log10(1+rate)/3.5))}}
  const traction=Math.min(20,Math.round(20*Math.log10(1+v)/5));
  const fresh=Math.max(0,Math.round(20*Math.exp(-hours/42)));
  const streamer=state.streamers.find(s=>s.handle.toLowerCase().replace(/[^a-z0-9]/g,'')===String(c.streamer||'').toLowerCase().replace(/[^a-z0-9]/g,''));
  const priority=streamer?(streamer.priority===3?10:streamer.priority===2?7:4):0;
  const editorial=Math.min(15,Math.max(0,Math.round(Number(c.rating||0)*3)));
  return {velocity,traction,fresh,priority,editorial,total:velocity+traction+fresh+priority+editorial,rate};
}
const score=c=>scoreParts(c).total;
function logActivity(action,detail){state.activity.unshift({id:makeID(),action,detail,when:nowISO()});state.activity=state.activity.slice(0,90)}
function normalizeState(obj){let empty=defaultState();return {...empty,...obj,clips:Array.isArray(obj?.clips)?obj.clips:[],streamers:Array.isArray(obj?.streamers)?obj.streamers:empty.streamers,activity:Array.isArray(obj?.activity)?obj.activity:[],settings:{...empty.settings,...(obj?.settings||{})}}}
function toast(message,error=false){const el=document.createElement('div');el.className='toast'+(error?' error':'');el.textContent=message;$('#toastStack').append(el);setTimeout(()=>el.remove(),4400)}
async function load(){
  try{state=normalizeState(JSON.parse(localStorage.getItem('leonida-signal-v1')||'{}'))}
  catch{state=defaultState()}
  updateConnection();render();
  await refreshFeed(true);
}
function persist(){
  const snap=JSON.stringify(state);
  if(snap===lastPersisted)return;
  try{localStorage.setItem('leonida-signal-v1',snap);lastPersisted=snap}
  catch{toast('Local storage unavailable. Export a JSON backup.',true)}
}
function normalizePublicClip(c){
  if(!c||!c.id||!safeUrl(c.url))return null;
  return {id:'twitch_'+String(c.id),sourceId:String(c.id),url:safeUrl(c.url),title:String(c.title||'Untitled Twitch clip'),
    streamer:String(c.broadcaster_name||'Unknown'),platform:'Twitch',views:Math.max(0,Number(c.view_count||0)),
    duration:Math.max(0,Number(c.duration||0)),createdAt:c.created_at||'',discoveredAt:c.created_at||'',
    thumbnail:safeUrl(c.thumbnail_url||''),status:'discovered',rating:0,hook:'',valueAdd:'',editor:'',postedUrl:'',checks:{},
    rights:{status:'unknown',evidence:'',scope:'',note:'',confirmedAt:''},sourceType:c.starter?'curated-starter':'twitch-api',
    clipper:String(c.creator_name||''),lastCheckedAt:nowISO()}
}
async function refreshFeed(silent=false){
  if(busy)return;
  busy=true;
  try{
    const res=await fetch('./data/latest.json?refresh='+Date.now(),{cache:'no-store'});
    if(!res.ok)throw Error('HTTP '+res.status);
    const data=await res.json();
    if(!Array.isArray(data.clips))throw Error('Feed format invalid');
    const incoming=data.clips.map(normalizePublicClip).filter(Boolean);
    let added=0,updated=0;
    for(const clip of incoming){
      const existing=state.clips.find(old=>old.sourceId===clip.sourceId||old.url===clip.url);
      if(existing){
        if(existing.views!==clip.views){existing.priorViews=existing.views;existing.priorCheckedAt=existing.lastCheckedAt||nowISO()}
        for(const key of ['views','title','duration','thumbnail','lastCheckedAt']) existing[key]=clip[key];
        if(clip.createdAt)existing.createdAt=clip.createdAt;
        // NEVER overwrite rights, statuses, editorial notes or publication history.
        updated++;
      }else{state.clips.push(clip);added++}
    }
    feedMeta={status:String(data.status||'unknown'),generatedAt:data.generatedAt||null,
      message:String(data.message||''),count:incoming.length};
    lastFeedRefresh=nowISO();
    if(data.generatedAt)state.lastScan=data.generatedAt;
    health.configured=feedMeta.status==='ok';
    persist();updateConnection();render();
    if(!silent)toast(`Feed refreshed: ${added} new · ${updated} existing · ${feedMeta.status==='ok'?'Twitch live feed':'starter leads'}`);
    return {added,updated,status:feedMeta.status};
  }catch(e){
    feedMeta={status:'unavailable',generatedAt:null,message:e.message};
    updateConnection();render();
    if(!silent)toast('Could not refresh public feed: '+e.message,true);
  }finally{busy=false}
}
function changed(action,detail){if(action)logActivity(action,detail);persist();render();if(clipSelected)renderDrawer()}
function updateConnection(){
  const live=feedMeta.status==='ok';
  $('#connectionText').textContent=live?'Public Twitch feed active':feedMeta.status==='setup_required'?'Twitch connection pending':'Public clip feed';
  $('#statusSub').textContent=live?`Updated ${ago(feedMeta.generatedAt)}`:'Personal edits stay in this browser';
  $('#connectionPulse').classList.toggle('connected',live);
}
function render(){const labels={overview:'Overview',discovery:'Discovery',watchlist:'Watchlist',rights:'Rights desk',pipeline:'Edit pipeline',settings:'Settings'};$('#pageBreadcrumb').textContent=labels[page];$$('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#navStreamerCount').textContent=state.streamers.length;$('#navDiscoveryCount').textContent=state.clips.length;$('#navRightsCount').textContent=state.clips.filter(c=>!isCleared(c)&&c.status!=='published'&&c.status!=='archived').length;const target=$('#mainContent');target.innerHTML=({overview:renderOverview,discovery:renderDiscovery,watchlist:renderWatchlist,rights:renderRights,pipeline:renderPipeline,settings:renderSettings})[page]();}
function pageTop(kicker,title,sub,buttons=''){return `<div class="page-top"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${sub}</p></div>${buttons?`<div class="page-actions">${buttons}</div>`:''}</div>`}
function btn(action,title,variant='ghost',extra=''){return `<button class="btn btn-${variant}" data-action="${action}" ${extra}>${title}</button>`}
function empty(symbol,title,desc,action='',label=''){return `<div class="empty"><div class="empty-symbol">${symbol}</div><strong>${title}</strong><p>${desc}</p>${action?btn(action,label,'soft'):''}</div>`}
function tag(value){const label=statusTitles[value]||value||'Unknown';let t=['approved','published','scheduled'].includes(value)?'accent':value==='rights'?'warn':value==='editing'?'teal':value==='review'?'rose':'';return `<span class="tag ${t}">${esc(label)}</span>`}
function rightsTag(c){const s=clipRights(c).status;const txt={unknown:'Unverified',requested:'Requested',granted:'Granted',denied:'Denied',own:'Owned',other_basis:'Other basis'}[s]||'Unverified';return `<span class="tag ${isCleared(c)?'accent':s==='denied'?'red':'warn'}">${txt}</span>`}
function sortedClips(){let arr=state.clips.slice();if(filterText){let s=filterText.toLowerCase();arr=arr.filter(c=>(c.title+' '+c.streamer+' '+c.platform).toLowerCase().includes(s))}if(filterStatus!=='all')arr=arr.filter(c=>c.status===filterStatus);arr.sort((a,b)=>sortMode==='views'?b.views-a.views:sortMode==='newest'?new Date(b.createdAt)-new Date(a.createdAt):score(b)-score(a));return arr}
function clipCard(c){const img=safeUrl(c.thumbnail);return `<article class="clip-card" data-open-clip="${esc(c.id)}" tabindex="0" role="button"><div class="clip-thumb ${img?'has-image':''}" ${img?`style="background-image:url('${esc(img)}')"`:''}><div class="thumb-fallback">VI</div><span class="clip-platform tag">${esc(c.platform||'Twitch')}</span><span class="clip-duration">${duration(c.duration)}</span></div><div class="clip-info"><h3>${esc(c.title)}</h3><div class="clip-byline"><span>@${esc(c.streamer||'unknown')}</span><span>${ago(c.createdAt)}</span></div><div class="clip-card-bottom"><span class="score-pill">${score(c)}<small>/ 100 SIGNAL</small></span>${rightsTag(c)}</div></div></article>`}
function productionQueue() {
  const active = state.clips.filter(c => !['discovered', 'published', 'archived'].includes(c.status));
  if (!active.length) return '<p class="fineprint">Open a clip and select Add to shortlist to start a project.</p>';
  return active.slice(0, 5).map(c => `<div class="insight-item"><div><strong>${esc(short(c.title, 56))}</strong>${tag(c.status)}</div><button class="table-action" data-open-clip="${esc(c.id)}">Continue</button></div>`).join('');
}

const productionFields = [
  ['brief', 'Factual brief', '5–7 sentences. Record what you can verify and mark what is uncertain.'],
  ['angle1', 'Editorial angle 1', 'Three sentences on a distinct story you could tell.'],
  ['angle2', 'Editorial angle 2', 'Three sentences on a different way into the clip.'],
  ['angle3', 'Editorial angle 3', 'Three sentences on a third approach.'],
  ['point', 'Spinoza’s Point', 'Three sentences. Start with the laugh and leave the viewer with something to think about.'],
  ['captionOptions', 'Caption options', 'Draft several publish captions, one per line.'],
  ['chosenCaption', 'Selected caption', 'Paste the caption you chose.'],
  ['thumbnailBrief', 'Thumbnail direction', 'Match the chosen angle and caption. Use one expressive frame, cobalt and cream, and a short readable line if needed.'],
];
function productionField(c, key) {
  const [, label, prompt] = productionFields.find(field => field[0] === key);
  return `<div class="field"><label for="production-${key}">${label}</label><textarea id="production-${key}" data-production-field="${key}" placeholder="${prompt}">${esc(c.production?.[key] || '')}</textarea></div>`;
}
function researchPrompt(c) {
  return [
    'Prepare a Spinoza production brief for this Twitch clip.',
    'Clip: ' + c.title,
    'Creator: ' + c.streamer,
    'Original source: ' + c.url,
    'Write a 5–7 sentence factual brief. Verify against the original clip and available context. Flag unsupported details.',
    'Give three distinct editorial angles, three sentences each, and a three-sentence Spinoza’s Point. Use accessible humor and end with a thought the audience can explore for themselves.',
    'List the permissions and attribution to verify before reuse, including any third-party audio or footage and the intended platforms.'
  ].join('\n');
}

function renderOverview(){let ready=state.clips.filter(isCleared).length;let candidates=state.clips.filter(c=>score(c)>=50).length;const top=state.clips.slice().sort((a,b)=>score(b)-score(a)).slice(0,5);return `
  <div class="overview-hero"><span class="tag accent">◉ &nbsp; GTA VI / LAUNCH OPERATIONS</span><h2>Find the moment<br/>before it trends.</h2><p>Find a clip, shortlist it, and take it from source research through your final edit.</p>${btn('nav-discovery','Browse clips →','accent')}${btn('add-clip','+ &nbsp; Add a clip','ghost')}</div>
  <div class="metrics"><div class="metric"><div class="label">CLIPS DISCOVERED</div><div class="number">${num(state.clips.length)}</div><div class="description">Sources cataloged</div><div class="metric-glyph">◎</div></div><div class="metric"><div class="label">HIGH SIGNAL</div><div class="number">${num(candidates)}</div><div class="description">Scoring 50 or more</div><div class="metric-glyph">⌁</div></div><div class="metric"><div class="label">RIGHTS CLEARED</div><div class="number">${num(ready)}</div><div class="description">Documented per clip</div><div class="metric-glyph">◇</div></div><div class="metric"><div class="label">PUBLISHED</div><div class="number">${num(state.clips.filter(c=>c.status==='published').length)}</div><div class="description">Completed posts</div><div class="metric-glyph">↗</div></div></div>
  <div class="section-grid"><section class="panel"><div class="panel-head"><h3>◈ &nbsp; Highest signal clips</h3><button class="table-action" data-action="nav-discovery">View all →</button></div>${top.length?`<div class="insight-list">${top.map(c=>`<div class="insight-item"><div><strong>${esc(short(c.title,60))}</strong><small>@${esc(c.streamer)} · ${formatCount(c.views)} views · ${ago(c.createdAt)}</small></div><div style="display:flex;gap:8px;align-items:center"><span class="score-bubble">${score(c)}</span><button class="table-action" data-open-clip="${esc(c.id)}">Open</button></div></div>`).join('')}</div>`:empty('◎','No clips in your radar','Refresh the public clip feed or paste a source URL worth tracking.','add-clip','+ Add your first clip')}</section>
  <section class="panel"><div class="panel-head"><h3>In production</h3>${btn('nav-pipeline','Open pipeline','ghost')}</div><div class="panel-content">${productionQueue()}</div></section></div><p class="fineprint" style="margin-top:16px">Feed generated: ${esc(fmtDate(feedMeta.generatedAt))} · Private notes are stored on this browser only · Scores are editorial estimates, not predicted views.</p>`}
function renderDiscovery(){return `${pageTop('01 / THE RADAR','Discovery','Sort fresh Twitch clips by early traction and editorial signal.',`${btn('add-clip','+ Add clip','ghost')}${btn('scan','↻ Refresh feed','accent')}`)}
  <div class="filterbar"><input class="search-input" id="clipSearch" type="search" placeholder="Search clip title or streamer..." value="${esc(filterText)}"/><select class="select-input" id="statusFilter"><option value="all">All statuses</option>${Object.entries(statusTitles).map(([k,v])=>`<option value="${k}" ${filterStatus===k?'selected':''}>${v}</option>`).join('')}</select><select class="select-input" id="sortFilter"><option value="score" ${sortMode==='score'?'selected':''}>Highest signal</option><option value="views" ${sortMode==='views'?'selected':''}>Most views</option><option value="newest" ${sortMode==='newest'?'selected':''}>Newest</option></select><span class="count">${sortedClips().length} results</span></div>
  ${state.clips.length?`<div class="clips" id="clipsContainer">${sortedClips().map(clipCard).join('')}</div>`: `<section class="panel">${empty('◎','Your discovery feed starts here','The hosted feed is awaiting Twitch setup. You can also add links manually.','add-clip','+ Add clip manually')}</section>`}`}
function renderWatchlist(){return `${pageTop('02 / PEOPLE TO WATCH','Streamer watchlist','Track creator channels, priority and partnerships. Adding a creator does not mean they are confirmed to stream GTA VI.',btn('add-streamer','+ Add streamer','accent'))}
  <div class="info-ribbon cool">◈ &nbsp; The scheduled scanner reads config/watchlist.json from your GitHub repository. Changes you make to this private browser list do not change the scheduled cloud scanner. Rights are recorded per clip.</div>
  <div class="table-scroll"><table class="data-table"><thead><tr><th>Creator / Channel</th><th>Platform</th><th>Priority</th><th>Contact / partnership notes</th><th>Actions</th></tr></thead><tbody>${state.streamers.length?state.streamers.map(s=>`<tr><td><strong>@${esc(s.handle)}</strong><div class="table-muted">${esc(s.name||'No display name')}</div></td><td>${esc(s.platform||'Twitch')}</td><td><span class="priority-pill p${Number(s.priority||1)}">${s.priority===3?'Priority 1 · Top':s.priority===2?'Priority 2 · Medium':'Priority 3 · Low'}</span></td><td>${esc(short(s.notes||'No notes yet',75))}</td><td><button class="table-action" data-edit-streamer="${esc(s.id)}">Edit</button> <button class="table-action" data-open-streamer="${esc(s.id)}">Visit ↗</button></td></tr>`).join(''):`<tr><td colspan="5">${empty('♙','No creators tracked yet','Add Twitch streamer handles to scan their clips and maintain a creator outreach list.','add-streamer','+ Add streamer')}</td></tr>`}</tbody></table></div>`}
function renderRights(){const pending=state.clips.filter(c=>!isCleared(c)&&!['archived','published'].includes(c.status));const cleared=state.clips.filter(isCleared);const denied=state.clips.filter(c=>clipRights(c).status==='denied');return `${pageTop('03 / COMPLIANCE','Rights desk','No direct publishing from unverified clips. Record authorization, permitted use and supporting evidence.',btn('add-clip','+ Add a source','ghost'))}
  <div class="rights-grid"><div class="rights-mini"><small>NEEDS REVIEW</small><div class="count-big">${pending.length}</div></div><div class="rights-mini"><small>DOCUMENTED CLEARANCE</small><div class="count-big" style="color:var(--accent)">${cleared.length}</div></div><div class="rights-mini"><small>DENIED / BLOCKED</small><div class="count-big" style="color:var(--red)">${denied.length}</div></div></div>
  <div class="info-ribbon">◉ &nbsp; Creator attribution alone is not a reuse license. Grant/ownership records require evidence, and a distinct legal basis requires a written rationale. Rights clearance does not guarantee platform monetization eligibility.</div>
  <div class="table-scroll"><table class="data-table"><thead><tr><th>Clip</th><th>Streamer</th><th>Permission</th><th>Source</th><th>Action</th></tr></thead><tbody>${state.clips.length?state.clips.slice().sort((a,b)=>Number(isCleared(a))-Number(isCleared(b))).map(c=>`<tr><td><strong>${esc(short(c.title,55))}</strong><div class="table-muted">${ago(c.createdAt)}</div></td><td>@${esc(c.streamer)}</td><td>${rightsTag(c)}</td><td>${esc(c.platform)}</td><td><button class="table-action" data-open-clip="${esc(c.id)}">Review →</button></td></tr>`).join(''):`<tr><td colspan="5">${empty('◇','No rights records yet','Clips added to discovery will automatically appear here.','add-clip','+ Add a clip')}</td></tr>`}</tbody></table></div>`}
function renderPipeline(){const columns=[{key:'shortlisted',label:'01 · Shortlist'},{key:'rights',label:'02 · Rights'},{key:'approved',label:'03 · Cleared'},{key:'editing',label:'04 · Editing'},{key:'review',label:'05 · Review'},{key:'scheduled',label:'06 · Ready'},{key:'published',label:'07 · Published'}];return `${pageTop('04 / CONTENT OPERATIONS','Edit pipeline','Only shortlisted clips and later stages appear here. Open any clip to continue working on it.',btn('add-clip','+ Add clip','accent'))}<div class="workflow">${columns.map(g=>{let cards=state.clips.filter(c=>c.status===g.key).sort((a,b)=>score(b)-score(a));return `<div class="workflow-col"><div class="workflow-head"><span>${g.label}</span><span class="workflow-counter">${cards.length}</span></div><div class="workflow-cards">${cards.length?cards.map(c=>`<div class="workflow-card" data-open-clip="${esc(c.id)}"><span class="tag">${esc(c.platform)}</span><span class="score-pill">${score(c)}</span><strong>${esc(short(c.title,85))}</strong><small>@${esc(c.streamer)} · ${ago(c.createdAt)}</small><div style="margin-top:11px">${rightsTag(c)}</div></div>`).join(''):'<div class="hint">No clips in this stage</div>'}</div></div>`}).join('')}</div>`}
function renderSettings(){return `${pageTop('05 / OPERATIONS','Settings','Public Twitch feed, private browser edits, and backup options.')}
 <section class="setting-section"><span class="tag ${feedMeta.status==='ok'?'accent':'warn'}">${feedMeta.status==='ok'?'● TWITCH FEED ACTIVE':'● SETUP / FEED STATUS: '+esc(feedMeta.status.toUpperCase())}</span><h3 style="margin-top:14px">GitHub Actions scanner</h3><p>${feedMeta.status==='ok'?'The scheduled workflow generates this public Twitch clip feed.':'To activate automatic updates, save your Twitch client ID and client secret as GitHub Actions repository secrets, then run the Scan Twitch and publish workflow.'}</p><p class="fineprint">Most recent generated feed: ${esc(fmtDate(feedMeta.generatedAt))} · Status detail: ${esc(feedMeta.message)}. GitHub Actions runs periodically even when this browser is closed. The Refresh button fetches the last published snapshot; it does not launch a new Twitch scan.</p><div class="setting-flex"><div class="field"><label>Browser auto-refresh</label><select id="settingAuto"><option value="off" ${!state.settings.autoScan?'selected':''}>Off</option><option value="on" ${state.settings.autoScan?'selected':''}>Every 30 minutes</option></select></div></div>${btn('scan','↻ Fetch latest public feed','accent')}<p class="fineprint" style="margin-top:13px">The watchlist used by the scheduled scanner is in the repository file config/watchlist.json. This site's personal watchlist is local to this browser.</p></section>
 <section class="setting-section"><h3>Private browser records</h3><p>Your permissions, notes, edit stages and watchlist changes are stored only in this browser using localStorage; they are NOT saved to GitHub or synced to another device. Export a JSON backup before switching phones or clearing browser data. This site has no accounts.</p><div style="display:flex;gap:8px;flex-wrap:wrap">${btn('export','⇩ Export JSON','ghost')}${btn('import','⇧ Import JSON','ghost')}</div><input id="importFile" type="file" accept=".json,application/json" style="display:none"/></section>
 <section class="setting-section"><h3>Scoring model · 100 points</h3><p>Estimated clip discovery signal, not a prediction of virality. Based on source view counts, age, streamer priority and your editorial review. Missing timestamps produce no freshness boost.</p><div class="quick-steps">${[['35','Early views per hour'],['20','Total traction'],['20','Freshness'],['10','Creator priority'],['15','Editorial assessment']].map(([a,b])=>`<div class="step"><span class="step-num">${a}</span><div><strong>${b}</strong></div></div>`).join('')}</div></section>
 <section class="setting-section"><h3>Publication safety</h3><p>Public clips do not automatically grant reposting rights. The pipeline blocks moving clips into production until the editor records a permission basis. GitHub Pages is a public static website, not a secure rights-record database.</p></section>`}
function showModal(html){$('#modalContent').innerHTML=html;$('#modalBackdrop').classList.add('on');setTimeout(()=>$('#modalContent input:not([type=hidden])')?.focus(),20)}
function closeModal(){$('#modalBackdrop').classList.remove('on');$('#modalContent').innerHTML=''}
function modalHeader(kicker,title){return `<div class="modal-head"><div><div class="eyebrow">${kicker}</div><h2>${title}</h2></div><button class="icon-button" data-action="close-modal" aria-label="Close">✕</button></div>`}
function modalAddClip(){showModal(`${modalHeader('QUICK INTAKE','Add a source clip')}<form id="clipForm"><div class="modal-body"><div class="field"><label>Original clip URL *</label><input name="url" type="url" placeholder="https://clips.twitch.tv/..." required maxlength="800"/></div><div class="field"><label>Clip title *</label><input name="title" placeholder="What happens in the clip?" required maxlength="220"/></div><div class="form-grid"><div class="field"><label>Streamer handle *</label><input name="streamer" required placeholder="Creator username" maxlength="90"/></div><div class="field"><label>Source platform</label><select name="platform"><option>Twitch</option><option>YouTube</option><option>Kick</option><option>Other</option></select></div><div class="field"><label>Current views</label><input name="views" type="number" min="0" max="999999999" value="0"/></div><div class="field"><label>Duration (seconds)</label><input name="duration" type="number" min="0" max="36000" value="30"/></div></div><div class="field"><label>Clip timestamp (optional)</label><input name="createdAt" type="datetime-local" /></div><p class="help-copy">New clips enter Inbox with rights unverified. You can add the clip to the queue, record permission, and track edit progress later.</p></div><div class="modal-foot"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-accent" type="submit">Add to discovery</button></div></form>`)}
function modalStreamer(s){const isEdit=!!s;showModal(`${modalHeader('CREATOR RADAR',isEdit?'Edit streamer':'Add streamer')}<form id="streamerForm"><input type="hidden" name="id" value="${esc(s?.id||'')}"/><div class="modal-body"><div class="field"><label>Twitch username *</label><input name="handle" required maxlength="90" pattern="[A-Za-z0-9_]{2,90}" placeholder="e.g. summit1g" value="${esc(s?.handle||'')}" /></div><div class="field"><label>Display name</label><input name="name" maxlength="100" placeholder="Optional" value="${esc(s?.name||'')}"/></div><div class="field"><label>Priority</label><select name="priority"><option value="3" ${s?.priority===3?'selected':''}>Priority 1 · Top source</option><option value="2" ${s?.priority===2?'selected':''}>Priority 2 · Strong prospect</option><option value="1" ${!s||s?.priority===1?'selected':''}>Priority 3 · Monitor</option></select></div><div class="field"><label>Partnership / outreach notes</label><textarea name="notes" maxlength="1000" placeholder="Contact status, preferred genres, introductions, submission agreement...">${esc(s?.notes||'')}</textarea></div><p class="help-copy">This adds a creator to your radar only. It does not establish that they stream GTA VI or grant permission to use their footage.</p></div><div class="modal-foot">${isEdit?`<button class="btn btn-danger" type="button" data-remove-streamer="${esc(s.id)}">Remove</button>`:''}<button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-accent" type="submit">${isEdit?'Save creator':'Add to watchlist'}</button></div></form>`)}
function openDrawer(id){clipSelected=id;renderDrawer();$('#clipDrawer').classList.add('open');$('#drawerScrim').classList.add('on');document.body.style.overflow='hidden'}
function closeDrawer(){clipSelected=null;$('#clipDrawer').classList.remove('open');$('#drawerScrim').classList.remove('on');document.body.style.overflow=''}
function optionList(items,current){return items.map(([k,v])=>`<option value="${esc(k)}" ${k===current?'selected':''}>${esc(v)}</option>`).join('')}
function renderDrawer(){if(!clipSelected)return;const c=state.clips.find(x=>x.id===clipSelected);if(!c){closeDrawer();return}const r=clipRights(c),part=scoreParts(c),img=safeUrl(c.thumbnail);const check=c.checks||{};const pass=isCleared(c);const stages=stageOrder.map(k=>[k,statusTitles[k]]);const source=safeUrl(c.url);const drawer=$('#drawerContent');
 const expanded=drawer.dataset.clipId===c.id?[...drawer.querySelectorAll('.production-section')].map(section=>section.open):null;
 drawer.dataset.clipId=c.id;
 drawer.innerHTML=`<div class="drawer-top"><div><span class="eyebrow">CLIP DOSSIER / ${esc(c.platform)}</span><h2>${esc(c.title)}</h2><span class="fineprint">@${esc(c.streamer||'unknown')} · ${ago(c.createdAt)} · ${formatCount(c.views)} views</span></div><button class="icon-button" data-action="close-drawer" aria-label="Close editor">✕</button></div><div class="drawer-body">
  <div class="detail-hero" ${img?`style="background-image:url('${esc(img)}')"`:''}><div class="detail-gradient"></div><div class="detail-footer"><span class="tag accent">${part.total}/100 SIGNAL</span>${rightsTag(c)}</div></div>
  <div class="drawer-actions">${source?`<a class="btn btn-soft btn-sm" target="_blank" rel="noopener noreferrer" href="${esc(source)}">↗ Original clip</a>`:''}<button class="btn btn-ghost btn-sm" data-action="copy-clip-url">⧉ Copy link</button>${c.status==='discovered'?btn('shortlist-clip','Add to shortlist','accent'):tag(c.status)}</div>
  <details class="production-section" open><summary>Research &amp; angles</summary><div class="production-fields">
    <button class="btn btn-soft" data-action="copy-research-prompt">Copy research prompt</button>
    <p class="fineprint">Use the original clip to verify the story. Paste your research here to keep it with the source.</p>
    ${['brief','angle1','angle2','angle3','point'].map(key=>productionField(c,key)).join('')}
  </div></details>
  <details class="production-section"><summary>Signal &amp; editorial rating</summary>
  <div class="divider"></div><div class="subhead">Signal breakdown</div><div class="quick-steps">${Object.entries({velocity:'Early velocity',traction:'Total views',fresh:'Freshness',priority:'Creator priority',editorial:'Human rating'}).map(([k,v])=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:var(--dim)"><span>${v}</span><strong style="color:var(--ink)">+${part[k]}</strong></div>`).join('')}</div>
  <div class="divider"></div><div class="subhead">Editorial evaluation</div><div class="field"><label>Human rating (0–5) — creativity, surprise, watchability</label><select data-clip-field="rating">${[0,1,2,3,4,5].map(i=>`<option value="${i}" ${Number(c.rating||0)===i?'selected':''}>${i} ${['· Not reviewed','· Weak','· Below average','· Solid','· Strong','· Exceptional'][i]}</option>`).join('')}</select></div><div class="field"><label>Angle / video hook</label><textarea data-clip-field="hook" placeholder="What makes this compelling, in one sentence?">${esc(c.hook||'')}</textarea></div>
  </details><details class="production-section"><summary>Rights &amp; provenance</summary><div class="field"><label>Authorization status</label><select id="rightStatus">${optionList([['unknown','Unknown / unverified'],['requested','Permission requested'],['granted','Creator granted permission'],['denied','Denied / do not use'],['own','Owned footage'],['other_basis','Other documented legal basis']],r.status||'unknown')}</select></div><div class="field"><label>Evidence / approval reference</label><input id="rightEvidence" value="${esc(r.evidence||'')}" placeholder="Link to agreement, DM record, email reference..."/></div><div class="field"><label>Scope / allowed platforms</label><input id="rightScope" value="${esc(r.scope||'')}" placeholder="e.g. TikTok, YouTube Shorts, Instagram; non-exclusive" /></div><div class="field"><label>Permission notes / rationale</label><textarea id="rightNote" placeholder="Terms, limitations, expiry, or reasoning for other legal basis...">${esc(r.note||'')}</textarea></div><button class="btn btn-soft" data-action="save-rights">Save rights record</button><div class="fineprint" style="margin-top:10px">${r.confirmedAt?'Last documented: '+esc(fmtDate(r.confirmedAt)):'No clearance documented yet.'}</div>
  </details><details class="production-section"><summary>Record &amp; edit</summary><div class="field"><label>Current production stage</label><select data-clip-field="status">${optionList([...stages,['archived','Archived']],c.status||'discovered')}</select></div>${!pass?`<div class="info-ribbon">Publishing and production approval are blocked until this clip has adequate permission evidence or a documented legal basis.</div>`:''}<div class="field"><label>Editor / assigned person</label><input data-clip-field="editor" value="${esc(c.editor||'')}" placeholder="Editor name"/></div><div class="field"><label>Original commentary or transformative value</label><textarea data-clip-field="valueAdd" placeholder="Explain the context, analysis, storytelling or original contribution.">${esc(c.valueAdd||'')}</textarea></div>
  <div class="check-row">${[['hook','Hook written'],['captions','Captions checked'],['vertical','9:16 composition'],['commentary','Original value added'],['credit','Creator credited'],['quality','Final QC complete']].map(([k,t])=>`<label class="check-item"><input type="checkbox" data-check-field="${k}" ${check[k]?'checked':''}/> ${t}</label>`).join('')}</div>
  </details><details class="production-section"><summary>Caption &amp; thumbnail</summary><div class="production-fields">
    ${['captionOptions','chosenCaption','thumbnailBrief'].map(key=>productionField(c,key)).join('')}
    <button class="btn btn-soft" data-action="copy-thumbnail-brief">Copy thumbnail brief</button>
  </div></details><details class="production-section"><summary>Publish &amp; archive</summary><div class="field"><label>Published URL(s)</label><textarea data-clip-field="postedUrl" placeholder="One platform URL per line">${esc(c.postedUrl||'')}</textarea></div><div class="drawer-actions"><button class="btn btn-accent" data-action="advance-clip">Advance to next stage →</button><button class="btn btn-ghost" data-action="archive-clip">Archive</button></div><div class="fineprint" style="margin-top:15px">Status is saved after each change. Publication itself remains a manual action on the destination platform.</div><button class="btn btn-danger btn-sm" data-action="delete-clip">Delete clip record</button></details>
  </div>`;
 if(expanded)drawer.querySelectorAll('.production-section').forEach((section,i)=>{section.open=expanded[i]??section.open});
}
function findSelected(){return state.clips.find(c=>c.id===clipSelected)}
function requireClearance(target,c){if(['approved','editing','review','scheduled','published'].includes(target)){if(!isCleared(c)){toast('Document rights clearance before moving into production.',true);return false}if(target==='published'&&(!(c.postedUrl||'').trim())){toast('Add the live published URL before marking Published.',true);return false}}return true}
function statusAdvance(){let c=findSelected();if(!c)return;let idx=stageOrder.indexOf(c.status);let next=stageOrder[Math.min(stageOrder.length-1,idx+1)];if(idx<0||idx===stageOrder.length-1){toast('No later pipeline stage');return}if(!requireClearance(next,c))return;c.status=next;changed('Pipeline advanced',c.title+' → '+statusTitles[next]);toast('Moved to '+statusTitles[next])}
function saveRights(){const c=findSelected();if(!c)return;const status=$('#rightStatus').value,evidence=$('#rightEvidence').value.trim(),scope=$('#rightScope').value.trim(),note=$('#rightNote').value.trim();if(['granted','other_basis'].includes(status)&&evidence.length<4){toast('Add a meaningful evidence or authorization reference.',true);return}if(status==='granted'&&!scope){toast('Specify where reuse was authorized.',true);return}if(status==='other_basis'&&note.length<6){toast('Document the basis and your reasoning.',true);return}c.rights={status,evidence,scope,note,confirmedAt:nowISO()};if(!isCleared(c)&&['approved','editing','review','scheduled','published'].includes(c.status)){c.status='rights'}changed('Rights status updated',c.title+' · '+status);toast('Rights record saved')}
function addManualClip(form){const fd=new FormData(form),url=safeUrl(fd.get('url'));if(!url){toast('Enter a valid http(s) source URL.',true);return}if(state.clips.some(c=>c.url===url)){toast('This source URL is already tracked.',true);return}const c={id:makeID(),sourceId:'',url,title:String(fd.get('title')).trim(),streamer:String(fd.get('streamer')).trim().replace(/^@/,''),platform:String(fd.get('platform')),views:Math.max(0,Number(fd.get('views')||0)),duration:Number(fd.get('duration')||0),createdAt:fd.get('createdAt')?new Date(fd.get('createdAt')).toISOString():nowISO(),discoveredAt:nowISO(),thumbnail:'',status:'discovered',rating:0,hook:'',valueAdd:'',editor:'',postedUrl:'',checks:{},rights:{status:'unknown',evidence:'',scope:'',note:'',confirmedAt:''}};state.clips.push(c);closeModal();page='discovery';changed('Clip added',c.title);toast('Clip added to Discovery')}
function upsertStreamer(form){const fd=new FormData(form),handle=String(fd.get('handle')||'').trim().replace(/^@/,'').toLowerCase();if(!/^[a-z0-9_]{2,90}$/.test(handle)){toast('Use a valid Twitch username.',true);return}const id=String(fd.get('id')||''),existing=state.streamers.find(s=>s.id===id);if(state.streamers.some(s=>s.handle.toLowerCase()===handle&&s.id!==id)){toast('This streamer is already on your watchlist.',true);return}const data={id:existing?.id||makeID(),handle,name:String(fd.get('name')||'').trim(),platform:'Twitch',priority:Number(fd.get('priority')),notes:String(fd.get('notes')||'').trim()};if(existing)Object.assign(existing,data);else state.streamers.push(data);closeModal();changed(existing?'Creator updated':'Creator added',handle);toast(existing?'Creator updated':'Added to radar')}
async function scan(){await refreshFeed(false)}
function exportJSON(){const raw=JSON.stringify({...state,exportedAt:nowISO()},null,2);const blob=new Blob([raw],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='leonida-signal-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1200);toast('Backup exported')}
async function importJSON(file){if(!file)return;try{const s=JSON.parse(await file.text());if(!Array.isArray(s.clips)||!Array.isArray(s.streamers))throw Error('Not a valid LEONIDA SIGNAL backup.');if(!confirm(`Replace your workspace with ${s.clips.length} clips and ${s.streamers.length} creators from this backup?`))return;state=normalizeState(s);clipSelected=null;closeDrawer();changed('Backup restored',file.name);toast('Backup imported')}catch(err){toast('Import failed: '+err.message,true)}}
async function copyToClipboard(text){try{await navigator.clipboard.writeText(text);toast('Copied')}catch{toast('Copy is unavailable in this context.',true)}}
function route(name){page=name;closeDrawer();$('#sidebar').classList.remove('mobile-open');render();window.scrollTo(0,0)}

// Event delegation: supports dynamically rendered views, touch controls, and accessible buttons.
document.addEventListener('click',async e=>{
 const nav=e.target.closest('[data-page]');if(nav){route(nav.dataset.page);return}
 const open=e.target.closest('[data-open-clip]');if(open){openDrawer(open.dataset.openClip);return}
 const edit=e.target.closest('[data-edit-streamer]');if(edit){modalStreamer(state.streamers.find(s=>s.id===edit.dataset.editStreamer));return}
 const visit=e.target.closest('[data-open-streamer]');if(visit){const s=state.streamers.find(x=>x.id===visit.dataset.openStreamer);if(s)window.open('https://www.twitch.tv/'+encodeURIComponent(s.handle),'_blank','noopener,noreferrer');return}
 const remove=e.target.closest('[data-remove-streamer]');if(remove){const s=state.streamers.find(x=>x.id===remove.dataset.removeStreamer);if(s&&confirm('Remove @'+s.handle+' from the watchlist? Existing clips remain.')){state.streamers=state.streamers.filter(x=>x.id!==s.id);closeModal();changed('Creator removed',s.handle)}return}
 const action=e.target.closest('[data-action]')?.dataset.action;if(action){switch(action){case 'add-clip':modalAddClip();break;case 'add-streamer':modalStreamer();break;case 'scan':await scan();break;case 'close-modal':closeModal();break;case 'close-drawer':closeDrawer();break;case 'nav-discovery':route('discovery');break;case 'nav-pipeline':route('pipeline');break;
 case 'shortlist-clip':{const c=findSelected();if(c?.status==='discovered'){c.status='shortlisted';changed('Clip shortlisted',c.title);toast('Added to the pipeline')}break}
 case 'copy-research-prompt':{const c=findSelected();if(c)await copyToClipboard(researchPrompt(c));break}
 case 'copy-thumbnail-brief':{const c=findSelected();if(c){const draft=c.production||{};await copyToClipboard([
   'Create a thumbnail for Spinoza’s GTA VI coverage.',
   'Source: '+c.title+' — '+c.url,
   c.hook&&'Selected angle: '+c.hook,
   draft.chosenCaption&&'Selected caption: '+draft.chosenCaption,
   draft.thumbnailBrief&&'Direction: '+draft.thumbnailBrief,
   'Brand: cobalt and cream, one clear focal point, readable at phone size. Avoid red arrows and exaggerated clickbait.'
 ].filter(Boolean).join('\n'));}break}case 'export':exportJSON();break;case 'import':$('#importFile')?.click();break;case 'copy-clip-url':if(findSelected())copyToClipboard(findSelected().url);break;case 'save-rights':saveRights();break;case 'advance-clip':statusAdvance();break;case 'archive-clip':{let c=findSelected();if(c){c.status='archived';changed('Clip archived',c.title);toast('Archived')}}break;case 'delete-clip':{let c=findSelected();if(c&&confirm('Permanently remove this clip record?')){state.clips=state.clips.filter(x=>x.id!==c.id);closeDrawer();changed('Clip deleted',c.title);toast('Clip removed')}}break}}
});
document.addEventListener('submit',e=>{if(e.target.getAttribute('id')==='clipForm'){e.preventDefault();addManualClip(e.target)}if(e.target.getAttribute('id')==='streamerForm'){e.preventDefault();upsertStreamer(e.target)}});
document.addEventListener('change',e=>{const t=e.target;
 if(t.id==='statusFilter'){filterStatus=t.value;render();return}if(t.id==='sortFilter'){sortMode=t.value;render();return}
 if(t.id==='settingWindow'){state.settings.scanWindow=Number(t.value);changed();return}if(t.id==='settingMax'){state.settings.maxClips=Number(t.value);changed();return}if(t.id==='settingAuto'){state.settings.autoScan=t.value==='on';changed();return}
 if(t.id==='importFile'){importJSON(t.files[0]);t.value='';return}
 if(t.dataset.clipField){const c=findSelected();if(!c)return;const field=t.dataset.clipField;let val=field==='rating'?Number(t.value):t.value;if(field==='status'&&!requireClearance(val,c)){renderDrawer();return}c[field]=val;changed('Clip updated',c.title+' · '+field);return}
 if(t.dataset.checkField){const c=findSelected();if(!c)return;c.checks={...(c.checks||{}),[t.dataset.checkField]:t.checked};changed();return}
});
document.addEventListener('input',e=>{
 const key=e.target.dataset.productionField;
 if(key&&productionFields.some(([field])=>field===key)){
   const c=findSelected();
   if(c){c.production={...c.production,[key]:e.target.value};persist();}
   return;
 }
 if(e.target.id==='clipSearch'){filterText=e.target.value;const container=$('#clipsContainer');if(container){container.innerHTML=sortedClips().map(clipCard).join('');$('.filterbar .count').textContent=sortedClips().length+' results'}}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeDrawer();$('#sidebar').classList.remove('mobile-open')}if((e.key==='Enter'||e.key===' ')&&e.target.matches('.clip-card')){e.preventDefault();openDrawer(e.target.dataset.openClip)}});
$('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('mobile-open'));
$('#drawerScrim').addEventListener('click',closeDrawer);
$('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()});
$('#exportBtn').addEventListener('click',exportJSON);
$('#quickScan').addEventListener('click',scan);
const tick=()=>{$('#timeDisplay').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};tick();setInterval(tick,30000);
setInterval(()=>{if(state.settings.autoScan&&!busy&&(!lastFeedRefresh||Date.now()-new Date(lastFeedRefresh).getTime()>30*60000))scan()},60000);
load();

