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
const fmtDate = s=>Number.isFinite(Date.parse(s))?new Date(s).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'—';
const duration = sec=>!sec?'—':`${Math.floor(sec/60)}:${String(Math.round(sec%60)).padStart(2,'0')}`;
const statusTitles={discovered:'Inbox',shortlisted:'Shortlisted',rights:'Rights review',approved:'Cleared',editing:'Editing',review:'Final review',scheduled:'Ready',published:'Published',archived:'Archived'};
const stageOrder=['discovered','shortlisted','rights','approved','editing','review','scheduled','published'];
const defaultState=()=>({version:1,performance:[],streamers:[{id:'seed_summit1g',handle:'summit1g',name:'Summit1g',platform:'Twitch',priority:3,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'},{id:'seed_xqc',handle:'xqc',name:'xQc',platform:'Twitch',priority:3,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'},{id:'seed_caseoh_',handle:'caseoh_',name:'CaseOh',platform:'Twitch',priority:3,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'},{id:'seed_kaicenat',handle:'kaicenat',name:'Kai Cenat',platform:'Twitch',priority:3,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'},{id:'seed_jynxzi',handle:'jynxzi',name:'Jynxzi',platform:'Twitch',priority:2,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'},{id:'seed_lord_kebun',handle:'lord_kebun',name:'Lord Kebun',platform:'Twitch',priority:2,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'},{id:'seed_esfandtv',handle:'esfandtv',name:'EsfandTV',platform:'Twitch',priority:2,notes:'Watchlist candidate; GTA VI stream not confirmed. Reuse authorization not granted.'}],clips:[],activity:[],settings:{scanWindow:24,autoScan:false,scanInterval:30,maxClips:60},lastScan:null});
let state=defaultState(),page='overview',filterText='',filterStatus='all',sortMode='score',clipSelected=null,networkMode=false,health={configured:false},busy=false,saveChain=Promise.resolve(),lastPersisted='',feedMeta={status:'loading',generatedAt:null},lastFeedRefresh=null;

function clipRights(c){return c.rights||{status:'unknown',evidence:'',scope:'',note:'',confirmedAt:''}}
function isCleared(c){const r=clipRights(c);return (r.status==='granted'||r.status==='own'||r.status==='other_basis')&&(r.status==='own'||(r.evidence||'').trim().length>3)&&(r.status!=='granted'||(r.scope||'').trim().length>0)&&(r.status!=='other_basis'||(r.note||'').trim().length>5)}
function clipKey(c) {
  const slug=twitchClipSlug(c.url);
  if(slug)return 'twitch:'+slug;
  try {
    const url=new URL(c.url);
    url.hash='';
    for(const name of [...url.searchParams.keys()]){
      if(/^utm_/i.test(name))url.searchParams.delete(name);
    }
    url.searchParams.sort();
    return url.href;
  }catch{return '';}
}
function observedGrowth(c) {
  const hours=(Date.parse(c.lastCheckedAt)-Date.parse(c.priorCheckedAt))/3600000;
  return hours>0&&c.priorViews!=null&&c.views!=null&&c.views>=c.priorViews
    ? (c.views-c.priorViews)/hours : null;
}
function scoreParts(c){
  const age=(Date.now()-Date.parse(c.createdAt))/3600000;
  const views=Math.max(0,Number(c.views)||0);
  const rate=observedGrowth(c);
  const estimate=Number.isFinite(age)&&age>0 ? views/Math.max(.2,age) : 0;
  const velocity=Math.min(35,Math.round(10*Math.log10(1+(rate??estimate))));
  const traction=Math.min(20,Math.round(4*Math.log10(1+views)));
  const fresh=Number.isFinite(age)&&age>=0 ? Math.round(20*Math.exp(-age/42)) : 0;
  const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const creator=normalize(c.broadcasterLogin||c.streamer);
  const streamer=state.streamers.find(s=>creator&&[s.handle,s.name].some(value=>normalize(value)===creator));
  const priority=streamer ? ({3:10,2:7,1:4}[streamer.priority]||0) : 0;
  const topic=clipTopic(c);
  const rating=Number(c.rating)||0;
  const editorial=rating ? Math.min(15,Math.max(0,Math.round(rating*3))) : ({Comparison:12,Reaction:9,Payoff:9}[topic]||3);
  return {velocity,traction,fresh,priority,editorial,total:velocity+traction+fresh+priority+editorial,rate};
}
function clipTopic(c){
  const title=c.title||'';
  if(/compar|framegen|fps| on vs |before and after/i.test(title))return 'Comparison';
  if(/first|reaction|thoughts|review/i.test(title))return 'Reaction';
  if(/surviv|fail|called it|crash| plan/i.test(title))return 'Payoff';
  return 'Other';
}
const score=c=>scoreParts(c).total;
function logActivity(action,detail){state.activity.unshift({id:makeID(),action,detail,when:nowISO()});state.activity=state.activity.slice(0,90)}
const extraCreators=[
  ['sodapoppin','Sodapoppin'],['lirik','LIRIK'],['northernlion','Northernlion'],
  ['cyr','Cyr'],['nmplol','Nmplol'],['extraemily','ExtraEmily']
];
function watchlistSuggestions(){
  return extraCreators.filter(([handle])=>!state.streamers.some(s=>s.handle.toLowerCase()===handle));
}
function normalizeState(obj){let empty=defaultState();return {...empty,...obj,performance:Array.isArray(obj?.performance)?obj.performance:[],clips:Array.isArray(obj?.clips)?obj.clips:[],streamers:Array.isArray(obj?.streamers)?obj.streamers:empty.streamers,activity:Array.isArray(obj?.activity)?obj.activity:[],settings:{...empty.settings,...(obj?.settings||{})}}}
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
  try{localStorage.setItem('leonida-signal-v1',snap);lastPersisted=snap;const label=$('#draftSaveState');if(label)label.textContent='Saved on this device'}
  catch{const label=$('#draftSaveState');if(label)label.textContent='Save failed';toast('Local storage unavailable. Export a JSON backup.',true)}
}
function normalizePublicClip(c,generatedAt){
  if(!c||!c.id||twitchClipSlug(c.url)!==String(c.id))return null;
  return {id:'twitch_'+String(c.id),sourceId:String(c.id),url:safeUrl(c.url),title:String(c.title||'Untitled Twitch clip'),
    streamer:String(c.broadcaster_name||'Unknown'),platform:'Twitch',views:Math.max(0,Number(c.view_count||0)),
    duration:Math.max(0,Number(c.duration||0)),createdAt:c.created_at||'',discoveredAt:c.created_at||'',
    thumbnail:safeUrl(c.thumbnail_url||''),status:'discovered',rating:0,hook:'',valueAdd:'',editor:'',postedUrl:'',checks:{},
    rights:{status:'unknown',evidence:'',scope:'',note:'',confirmedAt:''},sourceType:c.starter?'curated-starter':'twitch-api',
    clipper:String(c.creator_name||''),broadcasterId:c.broadcaster_id||'',broadcasterLogin:c.broadcaster_login||'',
    vodId:c.video_id||'',vodOffset:c.vod_offset??null,discoverySources:Array.isArray(c.discovery_sources)?c.discovery_sources:[],
    lastCheckedAt:c.starter?'':generatedAt||''}
}
async function refreshFeed(silent=false){
  if(busy)return;
  busy=true;
  try{
    const res=await fetch('./data/latest.json?refresh='+Date.now(),{cache:'no-store'});
    if(!res.ok)throw Error('HTTP '+res.status);
    const data=await res.json();
    if(!Array.isArray(data.clips))throw Error('Feed format invalid');
    const incoming=data.clips.map(c=>normalizePublicClip(c,data.generatedAt)).sort((a,b)=>(b?.views||0)-(a?.views||0)).filter(Boolean);
    let added=0,updated=0;
    const seen=new Set();
    for(const clip of incoming){
      const key=clipKey(clip);
      if(seen.has(key))continue;
      seen.add(key);
      const existing=state.clips.find(old=>old.sourceId===clip.sourceId||clipKey(old)===key);
      if(existing){
        const observed=Date.parse(clip.lastCheckedAt);
        const previous=Date.parse(existing.lastCheckedAt);
        if(Number.isFinite(observed)&&Number.isFinite(previous)&&observed>previous&&existing.sourceType==='twitch-api'&&clip.views>=existing.views){
          existing.priorViews=existing.views;
          existing.priorCheckedAt=existing.lastCheckedAt;
        }else if(Number.isFinite(observed)&&observed>previous&&clip.views<existing.views){
          delete existing.priorViews;
          delete existing.priorCheckedAt;
        }
        if(Number.isFinite(observed)&&(!Number.isFinite(previous)||observed>=previous||existing.sourceType!=='twitch-api')){
          for(const key of ['views','title','duration','thumbnail','lastCheckedAt','sourceType','broadcasterId','broadcasterLogin','vodId','vodOffset','clipper','discoverySources','sourceId'])existing[key]=clip[key];
          existing.streamer=clip.streamer;
          if(clip.createdAt)existing.createdAt=clip.createdAt;
        }
        // NEVER overwrite rights, statuses, editorial notes or publication history.
        updated++;
      }else{state.clips.push(clip);added++}
    }
    feedMeta={status:String(data.status||'unknown'),generatedAt:data.generatedAt||null,
      message:String(data.message||''),count:seen.size};
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
function render(){const labels={ideas:'Video Ideas',overview:'Home',discovery:'Discovery',watchlist:'Watchlist',rights:'Rights desk',pipeline:'Edit pipeline',settings:'Settings',record:'Ready to Record',analytics:'Performance'};$('#pageBreadcrumb').textContent=labels[page];$$('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#navStreamerCount').textContent=state.streamers.length;$('#navDiscoveryCount').textContent=state.clips.length;$('#navRightsCount').textContent=state.clips.filter(c=>!isCleared(c)&&c.status!=='published'&&c.status!=='archived').length;const target=$('#mainContent');target.innerHTML=({ideas:renderIdeas,overview:renderOverview,discovery:renderDiscovery,watchlist:renderWatchlist,rights:renderRights,pipeline:renderPipeline,settings:renderSettings,record:renderRecord,analytics:renderAnalytics})[page]();}
function pageTop(kicker,title,sub,buttons=''){return `<div class="page-top"><div><h1>${title}</h1><p>${sub}</p></div>${buttons?`<div class="page-actions">${buttons}</div>`:''}</div>`}
function btn(action,title,variant='ghost',extra=''){return `<button class="btn btn-${variant}" data-action="${action}" ${extra}>${title}</button>`}
function empty(symbol,title,desc,action='',label=''){return `<div class="empty"><div class="empty-symbol">${symbol}</div><strong>${title}</strong><p>${desc}</p>${action?btn(action,label,'soft'):''}</div>`}
function tag(value){const label=statusTitles[value]||value||'Unknown';let t=['approved','published','scheduled'].includes(value)?'accent':value==='rights'?'warn':value==='editing'?'teal':value==='review'?'rose':'';return `<span class="tag ${t}">${esc(label)}</span>`}
function rightsTag(c){const s=clipRights(c).status;const txt={unknown:'Unverified',requested:'Requested',granted:'Granted',denied:'Denied',own:'Owned',other_basis:'Other basis'}[s]||'Unverified';return `<span class="tag ${isCleared(c)?'accent':s==='denied'?'red':'warn'}">${txt}</span>`}
function sortedClips(){let arr=state.clips.slice();if(filterText){let s=filterText.toLowerCase();arr=arr.filter(c=>(c.title+' '+c.streamer+' '+c.platform).toLowerCase().includes(s))}if(filterStatus!=='all')arr=arr.filter(c=>c.status===filterStatus);arr.sort((a,b)=>sortMode==='views'?b.views-a.views:sortMode==='newest'?(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0):score(b)-score(a));return arr}
function clipCard(c){const img=safeUrl(c.thumbnail);return `<article class="clip-card" data-open-clip="${esc(c.id)}" tabindex="0" role="button"><div class="clip-thumb ${img?'has-image':''}" ${img?`style="background-image:url('${esc(img)}')"`:''}><div class="thumb-fallback">VI</div><span class="clip-platform tag">${esc(c.platform||'Twitch')}</span><span class="clip-duration">${duration(c.duration)}</span></div><div class="clip-info"><h3>${esc(c.title)}</h3><div class="clip-byline"><span>@${esc(c.streamer||'unknown')}</span><span>${ago(c.createdAt)}</span></div><div class="clip-card-bottom"><span class="score-pill">${score(c)}<small>/ 100 SIGNAL</small></span>${rightsTag(c)}</div></div></article>`}
function productionQueue() {
  const active = state.clips.filter(c => !['published', 'archived'].includes(c.status) && (c.status!=='discovered'||c.production?.brief||c.production?.script));
  if (!active.length) return '<p class="fineprint">Open a clip and select Add to shortlist to start a project.</p>';
  return active.slice(0, 5).map(c => `<div class="insight-item"><div><strong>${esc(short(c.title, 56))}</strong>${tag(c.status)}</div><button class="table-action" data-open-clip="${esc(c.id)}">Continue</button></div>`).join('');
}

const productionFields = [
  ['filmingNotes','Filming notes','Mark source timecodes, framing, and delivery.'],
  ['brief', 'Factual brief', '5–7 sentences. Record what you can verify and mark what is uncertain.'],
  ['angle1', 'Comedy', 'Three sentences on a distinct story you could tell.'],
  ['angle2', 'Debate', 'Three sentences on a different way into the clip.'],
  ['angle3', 'Philosophy', 'Three sentences on a third approach.'],
  ['permissionChecks', 'Permission checks to verify', 'List the approvals to check before reuse.'],
  ['point', 'Spinoza’s Point', 'Three sentences. Start with the laugh and leave the viewer with something to think about.'],
  ['captionOptions', 'Caption options', 'Draft several publish captions, one per line.'],
  ['script', 'Script draft', 'Write your hook, setup, payoff, and take here.'],
  ['thumbnailHeadline','Thumbnail headline','LOOKS FASTER?'],
  ['chosenCaption', 'Selected caption', 'Paste the caption you chose.'],
  ['thumbnailBrief', 'Thumbnail direction', 'Match the chosen angle and caption. Use one expressive frame, cobalt and cream, and a short readable line if needed.'],
];
function productionField(c, key) {
  const [, label, prompt] = productionFields.find(field => field[0] === key);
  return `<div class="field"><label for="production-${key}">${label}</label><textarea id="production-${key}" data-production-field="${key}" placeholder="${prompt}">${esc(c.production?.[key] || '')}</textarea></div>`;
}
function twitchClipSlug(source) {
  try {
    const url=new URL(source);
    const path=url.pathname.split('/').filter(Boolean);
    let slug;
    if(url.hostname==='clips.twitch.tv'&&path.length===1)slug=path[0];
    if(['twitch.tv','www.twitch.tv','m.twitch.tv'].includes(url.hostname)&&path.length===3&&path[1]==='clip')slug=path[2];
    return slug&&/^[a-zA-Z0-9_-]+$/.test(slug)?slug:'';
  }catch{return '';}
}
function twitchClipEmbed(source) {
  const slug=twitchClipSlug(source);
  if(!slug||!location.hostname)return '';
  return 'https://clips.twitch.tv/embed?'+new URLSearchParams({clip:slug,parent:location.hostname,autoplay:'false'});
}

const researchKeys = ['brief', 'angle1', 'angle2', 'angle3', 'point', 'permissionChecks'];

function parseResearch(raw, clip) {
  const draft = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!draft || draft.clipId !== clip.id ||
      !researchKeys.every(key => typeof draft[key] === 'string' && draft[key].trim())) return null;
  return Object.fromEntries(researchKeys.map(key => [key, draft[key].trim()]));
}

function researchPrompt(c) {
  return [
    'Prepare a Spinoza production brief for this '+c.platform+' clip.',
    'Clip: ' + c.title,
    'Creator: ' + c.streamer,
    'Original source: ' + c.url,
    'Write a 5–7 sentence factual brief. Verify against the original clip and available context. Flag unsupported details.',
    'Give comedy, debate, and philosophy angles in that order, three sentences each, and a three-sentence Spinoza’s Point. Use accessible humor and end with a thought the audience can explore for themselves.',
    'List the permissions and attribution to verify before reuse, including any third-party audio or footage and the intended platforms.',
    'If you cannot watch or verify the clip, say so explicitly. Separate facts, source claims and editorial hypotheses.',
    'Return only valid JSON so Leonida Signal can import it. Each field must be a string. Use these exact keys and preserve the clipId exactly:',
    JSON.stringify({clipId:c.id,...Object.fromEntries(researchKeys.map(key=>[key,'']))})
  ].join('\n');
}

function clipPitch(c) {
  const title=(c.title||'').toLowerCase();
  if (/compar|framegen|fps| on vs | before and after/.test(title)) return 'A comparison you can break down on screen.';
  if (/first|reaction|thoughts|review/.test(title)) return 'A reaction you can use to open a bigger question.';
  if (/surviv|fail|called it|crash| plan/.test(title)) return 'A setup and payoff you can turn into a short story.';
  if (scoreParts(c).velocity >= 20) return 'Early traction makes this worth a quick watch for a distinct moment.';
  return 'Watch for a moment that makes sense without the whole stream.';
}
function renderIdeas(){
  const standalone=[
    ['The scoreboard is lying to you','Ever had the best stats on the team and still been the reason you lost?','Tell one story from your own ranked games. Show the decision the scoreboard missed.'],
    ['Spinoza’s Court: Is save-scumming cheating?','Your honor, my client merely discovered the load button.','Argue both sides, give your ruling, and ask viewers where they draw the line.'],
    ['What makes a game feel faster?','If I hide the FPS counter, can you still tell which one feels better?','Record two versions of the same route in a game you own. Give viewers a blind pick before the reveal.']
  ];
  const clips=state.clips.filter(c=>!['published','archived'].includes(c.status))
    .sort((a,b)=>score(b)-score(a)).slice(0,6);
  return pageTop('','Video Ideas','Pick a hook and decide what you want to say.')+
    '<h2>Record on your own</h2><div class="r2-list">'+standalone.map(([title,hook,beat])=>
      `<article class="r2-section"><h3>${esc(title)}</h3><p>“${esc(hook)}”</p><p>${esc(beat)}</p></article>`).join('')+'</div>'+
    '<h2>From your clip feed</h2><div class="r2-list">'+(clips.length?clips.map((c,i)=>{
      const angle=['angle1','angle2','angle3'][i%3];
      const draft=c.production?.[angle]||buildClipDraft(c)[angle];
      return `<article class="r2-section"><h3>${esc(c.title)}</h3><p class="fineprint">${esc(c.streamer||c.platform)} · ${['Comedy','Debate','Philosophy'][i%3]}</p><p>${esc(draft)}</p><button class="btn btn-soft" data-open-clip="${esc(c.id)}">Review source and develop idea</button></article>`;
    }).join(''):'<p>Clip-based ideas appear here when your feed has clips.</p>')+'</div>';
}
function renderOverview() {
  const picks=state.clips.filter(c=>c.status==='discovered').sort((a,b)=>score(b)-score(a)).slice(0,3);
  return `
    <div class="overview-hero desk-hero"><h1>Production desk</h1><p>Pick up an edit or find your next story.</p></div>
    <section class="panel desk-section"><div class="panel-head"><h3>Continue editing</h3>${btn('nav-pipeline','Open pipeline','ghost')}</div><div class="panel-content">${productionQueue()}</div></section>
    <section class="panel desk-section"><div class="panel-head"><h3>Three clips worth watching</h3>${btn('nav-discovery','Browse all','ghost')}</div>
    <div class="desk-picks">${picks.map(c=>`<div><p class="desk-pitch">${esc(clipPitch(c))}</p>${clipCard(c)}</div>`).join('') || '<p class="fineprint">New clips will appear here when the feed updates.</p>'}</div></section>`;
}
function renderDiscovery(){return `${pageTop('01 / THE RADAR','Discovery','Sort fresh Twitch clips by early traction and editorial signal.',`${btn('add-clip','Add clip','accent')}`)}
  <div class="filterbar"><input class="search-input" id="clipSearch" type="search" placeholder="Search clip title or streamer..." value="${esc(filterText)}"/><select class="select-input" id="statusFilter"><option value="all">All statuses</option>${Object.entries(statusTitles).map(([k,v])=>`<option value="${k}" ${filterStatus===k?'selected':''}>${v}</option>`).join('')}</select><select class="select-input" id="sortFilter"><option value="score" ${sortMode==='score'?'selected':''}>Highest signal</option><option value="views" ${sortMode==='views'?'selected':''}>Most views</option><option value="newest" ${sortMode==='newest'?'selected':''}>Newest</option></select><span class="count">${sortedClips().length} results</span></div>
  ${state.clips.length?`<div class="clips" id="clipsContainer">${sortedClips().map(clipCard).join('')}</div>`: `<section class="panel">${empty('◎','Your discovery feed starts here','The hosted feed is awaiting Twitch setup. You can also add links manually.','add-clip','+ Add clip manually')}</section>`}`}
function renderWatchlist(){return (watchlistSuggestions().length?`<div class="r2-actions">${btn('add-suggested-creators','Add suggested creators','soft')}</div>`:'')+`${pageTop('02 / PEOPLE TO WATCH','Streamer watchlist','Track creator channels, priority and partnerships. Adding a creator does not mean they are confirmed to stream GTA VI.',btn('add-streamer','+ Add streamer','accent'))}
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
function showModal(html){$('#modalContent').innerHTML=html;$('#modalBackdrop').classList.add('on');setTimeout(()=>$('#modalContent input:not([type=hidden]), #researchJson')?.focus(),20)}
function closeModal(){$('#modalBackdrop').classList.remove('on');$('#modalContent').innerHTML=''}
function modalHeader(kicker,title){return `<div class="modal-head"><div><div class="eyebrow">${kicker}</div><h2>${title}</h2></div><button class="icon-button" data-action="close-modal" aria-label="Close">✕</button></div>`}
function modalAddClip(){showModal(`${modalHeader('QUICK INTAKE','Add a source clip')}<form id="clipForm"><div class="modal-body"><div class="field"><label>Original clip URL *</label><input name="url" type="url" placeholder="https://clips.twitch.tv/..." required maxlength="800"/></div><div class="field"><label>Clip title *</label><input name="title" placeholder="What happens in the clip?" required maxlength="220"/></div><div class="form-grid"><div class="field"><label>Streamer handle *</label><input name="streamer" required placeholder="Creator username" maxlength="90"/></div><div class="field"><label>Source platform</label><select name="platform"><option>Twitch</option><option>YouTube</option><option>Kick</option><option>Other</option></select></div><div class="field"><label>Current views</label><input name="views" type="number" min="0" max="999999999" value="0"/></div><div class="field"><label>Duration (seconds)</label><input name="duration" type="number" min="0" max="36000" value="30"/></div></div><div class="field"><label>Clip timestamp (optional)</label><input name="createdAt" type="datetime-local" /></div><p class="help-copy">New clips enter Inbox with rights unverified. You can add the clip to the queue, record permission, and track edit progress later.</p></div><div class="modal-foot"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-accent" type="submit">Add to discovery</button></div></form>`)}
function modalStreamer(s){const isEdit=!!s;showModal(`${modalHeader('CREATOR RADAR',isEdit?'Edit streamer':'Add streamer')}<form id="streamerForm"><input type="hidden" name="id" value="${esc(s?.id||'')}"/><div class="modal-body"><div class="field"><label>Twitch username *</label><input name="handle" required maxlength="90" pattern="[A-Za-z0-9_]{2,90}" placeholder="e.g. summit1g" value="${esc(s?.handle||'')}" /></div><div class="field"><label>Display name</label><input name="name" maxlength="100" placeholder="Optional" value="${esc(s?.name||'')}"/></div><div class="field"><label>Priority</label><select name="priority"><option value="3" ${s?.priority===3?'selected':''}>Priority 1 · Top source</option><option value="2" ${s?.priority===2?'selected':''}>Priority 2 · Strong prospect</option><option value="1" ${!s||s?.priority===1?'selected':''}>Priority 3 · Monitor</option></select></div><div class="field"><label>Partnership / outreach notes</label><textarea name="notes" maxlength="1000" placeholder="Contact status, preferred genres, introductions, submission agreement...">${esc(s?.notes||'')}</textarea></div><p class="help-copy">This adds a creator to your radar only. It does not establish that they stream GTA VI or grant permission to use their footage.</p></div><div class="modal-foot">${isEdit?`<button class="btn btn-danger" type="button" data-remove-streamer="${esc(s.id)}">Remove</button>`:''}<button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-accent" type="submit">${isEdit?'Save creator':'Add to watchlist'}</button></div></form>`)}
function openDrawer(id,step){if(clipSelected&&clipSelected!==id)releaseCoverVideo(clipSelected);copiedThumbnailLink='';clipSelected=id;const clip=findSelected();const saved=clip?.production?.step;clipStep=step??(Number.isInteger(saved)&&saved>=0&&saved<clipStepTitles.length?saved:0);renderDrawer();$('#clipDrawer').classList.add('open');$('#drawerScrim').classList.add('on');document.body.style.overflow='hidden'}
function closeDrawer(){if(clipSelected)releaseCoverVideo(clipSelected);$('#drawerContent .detail-hero iframe')?.remove();clipSelected=null;$('#clipDrawer').classList.remove('open');$('#drawerScrim').classList.remove('on');document.body.style.overflow=''}
function optionList(items,current){return items.map(([k,v])=>`<option value="${esc(k)}" ${String(k)===String(current)?'selected':''}>${esc(v)}</option>`).join('')}
const clipStepTitles=['Watch','Write','Package','Publish','Ready to Record'];
let clipStep=0;
function showClipStep(focus=false){
  const drawer=$('#drawerContent');
  drawer.querySelectorAll('.clip-step').forEach((section,i)=>{section.hidden=i!==clipStep});
  $('#clipStepTitle').textContent=clipStepTitles[clipStep];
  drawer.querySelector('.clip-step-nav').dataset.clipStep=clipStep===1?'research':'';
  $('#clipStepCount').textContent='Step '+(clipStep+1)+' of '+clipStepTitles.length;
  $('#clipStepBack').disabled=clipStep===0;
  if(clipStep===2)paintThumbnail(findSelected());
  if(clipStep===4){
    const c=findSelected(),label=$('#recordCover');
    if(c&&label)getCoverAssets(c.id).then(assets=>{
      if(label.isConnected)label.textContent=coverLayouts[currentCoverLayout(c)]+' · '+(c.production?.thumbnailHeadline||suggestThumbnailHeadline(c))+(assets.main?.time!=null?' · Source '+coverTime(assets.main.time):'');
    });
  }
  $('#clipStepNext').textContent=clipStep===clipStepTitles.length-1?'Done':'Next →';
  if(focus){
    $('#drawerContent .drawer-body').scrollTop=0;
    $('#clipStepTitle').focus({preventScroll:true});
  }
}
function moveClipStep(delta){
  if(delta===1&&clipStep===clipStepTitles.length-1){closeDrawer();return}
  const next=clipStep+delta;
  if(next<0||next>=clipStepTitles.length)return;
  const hero=$('#drawerContent .detail-hero');
  if(hero?.querySelector('iframe')){
    hero.querySelector('iframe').remove();
    hero.classList.remove('playing');
    const play=document.createElement('button');
    play.className='btn btn-accent clip-play';
    play.dataset.action='play-clip';
    play.textContent='▶ Watch clip';
    hero.append(play);
  }
  clipStep=next;
  const c=findSelected();if(c&&(c.status!=='discovered'||c.production?.brief||c.production?.script)){c.production={...c.production,step:next};persist();}
  showClipStep(true);
}
function buildClipDraft(c) {
  const title=c.title||'Untitled clip';
  const topic=clipTopic(c);
  const hooks={
    Comparison:['My eyes would like a recount.','Could you pick a winner with the labels hidden?','When does smoother start to feel better?'],
    Reaction:['That title is doing a lot of cardio.','What would a fair first impression have to show?','How much of a first impression did we bring with us?'],
    Payoff:['I want to speak to whoever wrote the odds.','Was the outcome skill, luck, or a little of both?','Why do we call an outcome obvious after we see it?'],
    Other:['The title has already submitted its closing argument.','What single detail would change your read of this?','How does the setup change what you notice?']
  }[topic];
  return {
    brief:[
      'The source entry labels this clip “'+title+'” and lists '+(c.streamer||'an unlisted creator')+'.',
      'The listed platform is '+(c.platform||'unavailable')+'; the listed duration is '+(c.duration?Math.round(c.duration)+' seconds':'unavailable')+'.',
      c.lastCheckedAt?'The feed recorded '+formatCount(c.views)+' views at '+fmtDate(c.lastCheckedAt)+'.':'There is no dated view snapshot for this lead.',
      'The title is a source claim that needs checking against the recording.',
      'This draft is based on metadata and no footage was independently reviewed.',
      'The exact dialogue, on-screen events, and surrounding context remain unverified.'
    ].join(' '),
    angle1:hooks[0]+' Open on camera with that line, establish the expectation, then show the source moment if cleared. End with a callback to the opening joke.',
    angle2:hooks[1]+' Give both plausible readings before you call it. End by naming one piece of evidence that could settle the disagreement.',
    angle3:hooks[2]+' Use one visible detail to make the question concrete. End by asking where viewers notice the same habit in their own decisions.',
    point:'A clip title can hand us a verdict before the video even starts. That’s a lot of authority for one line of text. What would you notice if you watched the moment without reading its title?',
    filmingNotes:'0–3s: Deliver your opening line to camera.\n3–12s: Explain the setup and mark the original source timecode.\n12–25s: Give your take and end with a question.\nKeep captions clear of the controls and record a clean vertical master.',
    thumbnailBrief:'Thumbnail B: use one clear source frame and your portrait when available. Choose a short line that matches the argument and check readability at phone size.'
  };
}

const portraitKey='leonida-thumbnail-portrait';
function readPortrait(){try{return localStorage.getItem(portraitKey);}catch{return null;}}
function suggestThumbnailHeadline(c) {
  const caption=(c.production?.chosenCaption||'').trim();
  const question=caption.match(/^[^.!?\n]{3,30}\?/u)?.[0];
  const compact=text=>text&&text.length<=30&&text.split(/\s+/u).length<=5;
  if(compact(question))return question.toUpperCase();
  const angle=selectedAngleText(c);
  const chosen=angle.split(/[.!?\n]/u)[0]?.trim();
  if(compact(chosen)&&!chosen.startsWith('Choose an angle'))return chosen.toUpperCase();
  const context=[c.title,caption,angle].join(' ');
  if(/frame\s*gen|\bfps\b|frame rate/i.test(context))return 'LOOKS FASTER?';
  if(/surviv/i.test(context))return 'HOW DID THEY SURVIVE?';
  if(/called it|predict|timing/i.test(context))return 'HE CALLED IT?';
  if(/first time|first gameplay/i.test(context))return 'FIRST IMPRESSIONS';
  const title=(c.title||'').trim();
  if(compact(title))return title.toUpperCase();
  return 'WHAT JUST HAPPENED?';
}
const coverLayouts = {portrait:'Spinoza leads', moment:'The moment leads', comparison:'Comparison leads'};
const coverFilmstrips = new Map();
const coverAssets = new Map();
const coverPreviewTokens = new WeakMap();
let coverDatabase;

function coverStorage(mode, operation) {
  coverDatabase ||= new Promise((resolve, reject)=>{
    const request=indexedDB.open('leonida-covers',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('assets');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  }).catch(error=>{coverDatabase=null;throw error});
  return coverDatabase.then(db=>new Promise((resolve,reject)=>{
    const transaction=db.transaction('assets',mode);
    const request=operation(transaction.objectStore('assets'));
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onabort=()=>reject(transaction.error);
  }));
}
async function getCoverAssets(id) {
  if(!coverAssets.has(id)){
    const stored=await coverStorage('readonly',store=>store.get(id)).catch(()=>null);
    if(!coverAssets.has(id))coverAssets.set(id,stored||{});
  }
  return coverAssets.get(id);
}
async function setCoverAsset(c, slot, image) {
  const assets=await getCoverAssets(c.id);
  preparedCoverShare=null;
  if(image)assets[slot]=image;else delete assets[slot];
  try{
    await coverStorage('readwrite',store=>store.put(assets,c.id));
  }catch{
    toast('Could not save cover artwork on this device. Export a backup before closing.',true);
  }
  if(findSelected()?.id===c.id){
    updateCoverControls(c);
    await paintThumbnail(c);
  }
}
const coverChoice=c=>c.production?.cover||{};
const currentCoverLayout=c=>Object.hasOwn(coverLayouts,coverChoice(c).layout)?coverChoice(c).layout:'portrait';
function saveCoverChoice(c, changes){
  c.production={...c.production,cover:{...coverChoice(c),...changes}};
  persist();
}
function coverTime(seconds){
  if(seconds==null)return '';
  const tenths=Math.round(seconds*10);
  return Math.floor(tenths/600)+':'+(tenths%600/10).toFixed(1).padStart(4,'0');
}
function thumbnailBuilder(c) {
  return `<section class="thumbnail-builder cover-studio" aria-labelledby="coverStudioTitle">
    <h4 id="coverStudioTitle">Cover studio</h4>
    ${twitchClipSlug(c.url)?btn('fetch-clip-art','Get best image from this clip','accent'):''}
    <label class="cover-picker">Choose a photo or video<input id="coverMedia" type="file" accept="image/*,video/*,.mp4,.mov,.webm"></label>
    <details class="production-section"><summary>Use a source link</summary>
      <label for="thumbnailSourceLink">Direct video, image, or original clip URL</label>
      <input id="thumbnailSourceLink" type="url" inputmode="url" placeholder="https://">
      <div class="drawer-actions">${btn('make-thumbnail-from-link','Use link','soft')}${btn('paste-thumbnail-link','Paste link')}${btn('copy-thumbnail-link','Copy original clip URL')}</div>
    </details>
    <p class="fineprint" id="thumbnailStatus" role="status">Loading source…</p>
    <div class="cover-preview-tools">
      <label for="coverRatio">Preview</label><select id="coverRatio">${optionList([['wide','16:9 widescreen'],['vertical','9:16 vertical']],coverChoice(c).ratio||'wide')}</select>
      <label class="check-item"><input id="coverGuides" type="checkbox"> Show vertical crop guide</label>
    </div>
    <div class="cover-large-preview"><canvas id="thumbnailPreview" width="640" height="360" aria-label="Selected cover preview"></canvas><div class="cover-guides" hidden aria-hidden="true"></div></div>
    <div id="coverFilmstrip" class="cover-filmstrip" aria-label="Candidate frames"></div>
    <div id="coverScrub" hidden>
      <label for="coverPosition">Find the exact moment <output id="coverTime"></output></label>
      <input id="coverPosition" type="range" min="0" step="0.1" value="0">
      <canvas id="coverScrubPreview" width="240" height="135" aria-label="Video frame at selected timestamp" hidden></canvas>
      <div class="drawer-actions">${btn('cover-grab','Use as main frame','soft')} ${btn('cover-grab-second','Use as comparison frame')}</div>
    </div>
    <fieldset class="cover-options"><legend>Pick a layout</legend>
      <div class="cover-variants">${Object.entries(coverLayouts).map(([key,label])=>`<button type="button" data-cover-layout="${key}" aria-pressed="${currentCoverLayout(c)===key}"><canvas width="320" height="180" aria-hidden="true"></canvas><span>${label}</span></button>`).join('')}</div>
    </fieldset>
    <div class="field"><label for="production-thumbnailHeadline">Headline</label><input id="production-thumbnailHeadline" data-production-field="thumbnailHeadline" maxlength="48" value="${esc(c.production?.thumbnailHeadline||'')}" placeholder="${esc(suggestThumbnailHeadline(c))}"></div>
    <div class="drawer-actions">${btn('cover-headline','Use suggested headline','soft')}</div>
    <details class="production-section"><summary>Crop, portrait &amp; comparison</summary>
      <label>Your portrait<input id="thumbnailPortrait" type="file" accept="image/*"></label>
      <label for="coverCropX">Horizontal focus</label><input id="coverCropX" type="range" min="0" max="100" value="${esc(coverChoice(c).x??50)}">
      <label for="coverCropY">Vertical focus</label><input id="coverCropY" type="range" min="0" max="100" value="${esc(coverChoice(c).y??50)}">
      <label class="check-item"><input id="coverPortrait" type="checkbox" ${coverChoice(c).portrait!==false?'checked':''}> Use my portrait in Spinoza leads</label>
      <label>Second comparison image<input id="coverComparison" type="file" accept="image/*"></label>
      ${btn('cover-clear-comparison','Remove second frame')}${btn('remove-portrait','Remove saved portrait')}
    </details>
    <div class="drawer-actions">
      ${btn('download-thumbnail','Save PNG','accent')}
      ${btn('share-thumbnail','Share selected format','soft')}
      ${btn('cover-to-kit','Back to recording kit')}
    </div>
  </section>`;
}
function loadThumbnailImage(src, remote=false) {
  return new Promise(resolve=>{
    if(!src){resolve(null);return;}
    const img=new Image();
    if(remote)img.crossOrigin="anonymous";
    img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=src;
  });
}
function drawCover(ctx,img,x,y,w,h,focusX=.5,focusY=.5) {
  const ratio=Math.max(w/img.width,h/img.height);
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  const dw=img.width*ratio,dh=img.height*ratio;
  ctx.drawImage(img,x+(w-dw)*focusX,y+(h-dh)*focusY,dw,dh);
  ctx.restore();
}
const clipArtworkCache=new Map();
function loadClipArtwork(source) {
  if(!source)return Promise.resolve(null);
  if(!clipArtworkCache.has(source)){
    const versions=[loadThumbnailImage(source,true)];
    try{
      const url=new URL(source);
      const twitchCdn=/(^|\.)(jtvnw\.net|twitchcdn\.net|twitch\.tv|ttvnw\.net)$/i.test(url.hostname);
      const sizeSuffix=/-\d+x\d+(?=\.(?:jpe?g|png|webp)$)/i;
      if(twitchCdn&&sizeSuffix.test(url.pathname)){
        const originalPath=url.pathname;
        for(const size of ['1920x1080','1280x720','854x480']){
          url.pathname=originalPath.replace(sizeSuffix,'-'+size);
          if(url.href!==source)versions.push(loadThumbnailImage(url.href,true));
        }
      }
    }catch{}
    clipArtworkCache.set(source,Promise.all(versions).then(images=>images.filter(Boolean)
      .sort((a,b)=>b.naturalWidth*b.naturalHeight-a.naturalWidth*a.naturalHeight)[0]||null));
  }
  return clipArtworkCache.get(source);
}
function coverImage(source) {
  return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z\d+/=]+$/.test(source||'')?source:'';
}
async function loadCoverArtwork(c){
  const assets=await getCoverAssets(c.id);
  const [art,second,portrait]=await Promise.all([
    assets.main?loadThumbnailImage(coverImage(assets.main.image)):loadClipArtwork(safeUrl(c.thumbnail)),
    loadThumbnailImage(coverImage(assets.comparison?.image)),
    loadThumbnailImage(readPortrait())
  ]);
  return {art,second,portrait,source:assets.main};
}
function coverHeadline(ctx,text,width,baseSize){
  let size=baseSize,lines=[];
  for(;size>=12;size-=2){
    ctx.font=`900 ${size}px system-ui, sans-serif`;
    lines=[''];
    for(const word of text.split(/\s+/)){
      const tail=lines.at(-1);
      const combined=tail?tail+' '+word:word;
      if(tail&&ctx.measureText(combined).width>width)lines.push(word);
      else lines[lines.length-1]=combined;
    }
    if(lines.length<=3&&lines.every(line=>ctx.measureText(line).width<=width))break;
  }
  return {lines,size:Math.max(12,size)};
}
function renderCover(canvas,c,media,layout,ratio){
  const {art,second,portrait}=media,choice=coverChoice(c);
  const ctx=canvas.getContext('2d'),vertical=ratio==='vertical';
  const w=vertical?540:640,h=vertical?960:360;
  ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);
  ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#172345';ctx.fillRect(0,0,w,h);
  const focus=choice.crops?.[ratio]||choice;
  const focusX=Math.min(1,Math.max(0,(Number(focus.x??50)||0)/100));
  const focusY=Math.min(1,Math.max(0,(Number(focus.y??50)||0)/100));
  const isSplit=layout==='comparison'&&art&&second;
  if(isSplit){
    const panelWidth=vertical?w:w/2,panelHeight=vertical?h/2:h;
    drawCover(ctx,art,0,0,panelWidth,panelHeight,focusX,focusY);
    drawCover(ctx,second,vertical?0:w/2,vertical?h/2:0,panelWidth,panelHeight);
    ctx.fillStyle='#fff0d6';
    ctx.fillRect(vertical?0:w/2-2,vertical?h/2-2:0,vertical?w:4,vertical?4:h);
  }else if(art){
    drawCover(ctx,art,0,0,w,h,focusX,focusY);
  }
  const showPortrait=layout==='portrait'&&portrait&&choice.portrait!==false;
  if(showPortrait){
    const px=vertical?w*.47:w*.63,py=vertical?h*.44:42,pw=w-px-20,ph=h-py-27;
    ctx.fillStyle='#283e93';ctx.fillRect(px-5,py-5,pw+10,ph+10);
    drawCover(ctx,portrait,px,py,pw,ph);
  }
  const shade=ctx.createLinearGradient(0,0,vertical||!showPortrait?0:w,vertical||!showPortrait?h:0);
  const bottomText=layout==='moment'&&!vertical;
  shade.addColorStop(0,bottomText?'#07112618':'#071126dc');
  shade.addColorStop(bottomText?.42:.56,bottomText?'#07112616':'#07112650');
  shade.addColorStop(1,bottomText?'#071126ef':'#07112600');
  ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
  if(layout==='portrait'){
    ctx.fillStyle='#fff0d61b';
    for(let y=16;y<h-16;y+=7)for(let x=16;x<w*.52;x+=7)ctx.fillRect(x,y,1,1);
  }
  ctx.strokeStyle='#fff0d6';ctx.lineWidth=2.5;ctx.strokeRect(9,9,w-18,h-18);
  ctx.fillStyle='#2547bd';ctx.fillRect(23,23,40,40);
  ctx.fillStyle='#fff0d6';ctx.font='900 29px Georgia, serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('S',43,43);
  const title=(c.production?.thumbnailHeadline||suggestThumbnailHeadline(c)).trim().toUpperCase().slice(0,80);
  const x=32;
  const maxWidth=showPortrait&&!vertical?w*.52:w-64;
  const {lines,size}=coverHeadline(ctx,title,maxWidth,vertical?78:showPortrait?54:61);
  const lineHeight=size*1.04;
  const start=bottomText?h-34-(lines.length-1)*lineHeight:vertical?182:isSplit?104:131;
  ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#fff0d6';
  ctx.shadowColor='#061023';ctx.shadowBlur=8;
  for(const [index,line] of lines.entries())ctx.fillText(line,x,start+index*lineHeight,maxWidth);
  ctx.shadowBlur=0;
}
async function paintThumbnail(c){
  const canvas=$('#thumbnailPreview');
  if(!canvas||!c||clipStep!==2)return;
  const token=Symbol();
  coverPreviewTokens.set(canvas,token);
  const media=await loadCoverArtwork(c);
  if(!canvas.isConnected||findSelected()?.id!==c.id||clipStep!==2||coverPreviewTokens.get(canvas)!==token)return;
  const ratio=coverChoice(c).ratio==='vertical'?'vertical':'wide';
  canvas.width=ratio==='vertical'?360:640;canvas.height=ratio==='vertical'?640:360;
  canvas.parentElement.dataset.ratio=ratio;
  const focus=coverChoice(c).crops?.[ratio]||coverChoice(c);
  $('#coverCropX').value=focus.x??50;
  $('#coverCropY').value=focus.y??50;
  const layout=currentCoverLayout(c);
  renderCover(canvas,c,media,layout,ratio);
  for(const button of $$('[data-cover-layout]')){
    button.setAttribute('aria-pressed',String(button.dataset.coverLayout===layout));
    renderCover($('canvas',button),c,media,button.dataset.coverLayout,'wide');
  }
  const status=$('#thumbnailStatus');
  const type=media.source?.kind||'Twitch preview';
  if(status)status.textContent=media.art
    ? `${type} · ${media.source?.width||media.art.naturalWidth} × ${media.source?.height||media.art.naturalHeight}${media.source?.time!=null?' · '+coverTime(media.source.time):''}.${Math.min(media.art.naturalWidth,media.art.naturalHeight)<720?' Small source. Try a sharper still or video.':''}${layout==='comparison'&&!media.second?' Add a second frame for the split view.':''}`
    :'No source image available. Choose a photo or video to build the cover.';
  updateCoverControls(c);
}
function canvasBlob(canvas,type='image/png',quality){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not encode image')),type,quality));
}
async function prepareCoverFile(c,ratio){
  const artwork=await loadCoverArtwork(c);
  if(!artwork.art)throw Error('Choose a source image before exporting.');
  if(currentCoverLayout(c)==='comparison'&&!artwork.second)throw Error('Add a second frame or switch layouts before exporting.');
  const canvas=document.createElement('canvas');
  canvas.width=ratio==='vertical'?1080:1280;canvas.height=ratio==='vertical'?1920:720;
  renderCover(canvas,c,artwork,currentCoverLayout(c),ratio);
  const name=String(c.title||'clip').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55)||'clip';
  return new File([await canvasBlob(canvas)],`spinoza-${name}-${ratio==='vertical'?'9x16':'16x9'}.png`,{type:'image/png'});
}
let preparedCoverShare;
async function exportCover(c,ratio,share=false){
  if(!c)return;
  try{
    const snapshot=JSON.stringify(c.production||{});
    const cached=preparedCoverShare;
    const ready=share&&cached?.id===c.id&&cached.ratio===ratio&&cached.snapshot===snapshot;
    const file=ready?cached.file:await prepareCoverFile(c,ratio);
    if(findSelected()?.id!==c.id)return;
    if(share&&navigator.canShare?.({files:[file]})){
      // iOS requires transient activation after asynchronous image encoding.
      if(!ready&&!navigator.userActivation?.isActive){
        preparedCoverShare={id:c.id,ratio,snapshot,file};
        toast('Image ready. Tap Share selected format again.');
        return;
      }
      await navigator.share({files:[file],title:'Spinoza cover'});
    }else{
      const url=URL.createObjectURL(file),link=document.createElement('a');
      link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),10000);
    }
  }catch(error){if(error.name!=='AbortError')toast(error.message||'Cover export failed.',true)}
}
const pendingFrames=new Map();
let copiedThumbnailLink='';
function waitForVideo(video,event,act) {
  return new Promise((resolve,reject)=>{
    function finish(error){
      clearTimeout(timer);
      video.removeEventListener(event,success);
      video.removeEventListener('error',failure);
      if(error)reject(error);else resolve();
    }
    const success=()=>finish();
    const failure=()=>finish(new Error('Video could not load'));
    const timer=setTimeout(failure,12000);
    video.addEventListener(event,success);
    video.addEventListener('error',failure);
    try{act();}catch(error){finish(error);}
  });
}
function frameScore(ctx,w,h) {
  const pixels=ctx.getImageData(0,0,w,h).data;
  let light=0,detail=0;
  const gray=index=>.2126*pixels[index]+.7152*pixels[index+1]+.0722*pixels[index+2];
  for(let y=0;y<h;y++)for(let x=1;x<w;x++){
    const index=(y*w+x)*4,value=gray(index);
    light+=value;
    detail+=Math.abs(value-gray(index-4));
  }
  const average=light/((w-1)*h);
  return detail/((w-1)*h)*Math.min(1,average/50,(255-average)/50);
}
function updateCoverControls(c){
  const panel=$('#coverFilmstrip'),scrub=$('#coverScrub');
  if(!panel||!scrub)return;
  const film=coverFilmstrips.get(c.id),assets=coverAssets.get(c.id)||{};
  panel.replaceChildren();
  if(!film?.frames?.length){scrub.hidden=true;return}
  for(const [index,frame] of film.frames.entries()){
    const button=document.createElement('button');
    const preview=document.createElement('img');
    preview.src=frame.preview;preview.alt='';
    button.type='button';button.dataset.coverFrame=String(index);
    button.setAttribute('aria-pressed',String(assets.main?.time===frame.time&&assets.main?.session===film.session));
    button.append(preview,document.createTextNode(coverTime(frame.time)+(index===film.best?' · Suggested':'')));
    panel.append(button);
  }
  if(scrub.hidden){
    const position=$('#coverPosition');
    position.max=String(Math.max(0,film.duration-.05));
    position.value=String(film.frames[film.best].time);
    $('#coverTime').textContent=coverTime(Number(position.value));
  }
  scrub.hidden=false;
}
function releaseCoverVideo(cId){
  pendingFrames.delete(cId);
  const film=coverFilmstrips.get(cId);
  if(!film)return;
  film.video.removeAttribute('src');film.video.load();
  if(film.local)URL.revokeObjectURL(film.source);
  coverFilmstrips.delete(cId);
}
async function seekCoverVideo(video,time){
  const target=Math.max(0,Math.min(video.duration-.01,time));
  if(Math.abs(video.currentTime-target)>.005||video.seeking){
    await waitForVideo(video,'seeked',()=>{video.currentTime=target});
  }
}
function captureCoverImage(img,width,height,maxWidth,maxHeight){
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,maxWidth/width,maxHeight/height);
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  return canvas;
}
async function previewCoverTime(c,time){
  const film=coverFilmstrips.get(c?.id),canvas=$('#coverScrubPreview');
  if(!film||!canvas||film.busy)return;
  film.busy=true;
  try{
    await seekCoverVideo(film.video,time);
    if(coverFilmstrips.get(c.id)!==film||!canvas.isConnected)return;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#172345';ctx.fillRect(0,0,canvas.width,canvas.height);
    const factor=Math.min(canvas.width/film.video.videoWidth,canvas.height/film.video.videoHeight);
    const w=film.video.videoWidth*factor,h=film.video.videoHeight*factor;
    ctx.drawImage(film.video,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
    canvas.hidden=false;
  }catch{canvas.hidden=true}
  finally{film.busy=false}
}
async function chooseCoverFrame(c,time,slot='main'){
  const film=coverFilmstrips.get(c?.id);
  if(!film||film.busy)return;
  film.busy=true;
  try{
    await seekCoverVideo(film.video,time);
    if(coverFilmstrips.get(c.id)!==film)return;
    const video=film.video,w=video.videoWidth,h=video.videoHeight;
    const canvas=captureCoverImage(video,w,h,1920,1920);
    await setCoverAsset(c,slot,{image:canvas.toDataURL('image/jpeg',.93),kind:'Video frame',width:w,height:h,time:Number(video.currentTime.toFixed(3)),session:film.session,clipUrl:c.url,...(!film.local?{mediaUrl:film.source}:{})});
  }catch{if(coverFilmstrips.get(c.id)===film)toast('Could not capture that frame. Try a different timestamp.',true)}
  finally{film.busy=false}
}
async function fetchThumbnailFrame(c,source,local=false) {
  if(!c||!source)return;
  releaseCoverVideo(c.id);
  const request=Symbol();
  pendingFrames.set(c.id,request);
  const status=$('#thumbnailStatus');
  if(status)status.textContent='Sampling the video for usable frames…';
  const video=document.createElement('video');
  video.muted=true;video.playsInline=true;video.preload='auto';
  if(!local)video.crossOrigin='anonymous';
  let retained=false;
  try{
    await waitForVideo(video,'loadeddata',()=>{video.src=source;video.load()});
    if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth)throw Error('Video has no frames');
    const sample=document.createElement('canvas');
    sample.width=96;sample.height=54;
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    const frames=[], signatures=[];
    const fractions=[.07,.19,.31,.43,.56,.69,.81,.93,.13,.37,.63,.87];
    for(const fraction of fractions){
      if(frames.length===8)break;
      if(pendingFrames.get(c.id)!==request)return;
      await seekCoverVideo(video,video.duration*fraction);
      ctx.drawImage(video,0,0,96,54);
      const rgba=ctx.getImageData(0,0,96,54).data;
      const signature=[];
      for(let p=0;p<rgba.length;p+=64)signature.push((rgba[p]+rgba[p+1]+rgba[p+2])/3);
      if(signatures.some(prior=>prior.reduce((sum,value,index)=>sum+Math.abs(value-signature[index]),0)/prior.length<5))continue;
      const clarity=frameScore(ctx,96,54);
      if(clarity<1&&frames.length)continue;
      signatures.push(signature);
      const preview=captureCoverImage(video,video.videoWidth,video.videoHeight,240,135).toDataURL('image/jpeg',.75);
      frames.push({time:Number(video.currentTime.toFixed(3)),preview,clarity});
    }
    if(pendingFrames.get(c.id)!==request||!frames.length)return;
    frames.sort((a,b)=>a.time-b.time);
    const direction=selectedAngleText(c);
    const payoff=/payoff|surviv|reveal|result/i.test(direction+' '+c.title);
    const interest=frame=>frame.clarity*(payoff?1+frame.time/video.duration*.28:1);
    const best=frames.reduce((winner,frame,index)=>interest(frame)>interest(frames[winner])?index:winner,0);
    const film={video,source,local,duration:video.duration,frames,best,session:makeID()};
    coverFilmstrips.set(c.id,film);
    retained=true;
    updateCoverControls(c);
    const assets=await getCoverAssets(c.id);
    if(coverFilmstrips.get(c.id)!==film)return;
    if(assets.comparison?.session)await setCoverAsset(c,'comparison',null);
    await chooseCoverFrame(c,frames[best].time);
  }catch{
    if(pendingFrames.get(c.id)===request&&findSelected()?.id===c.id){
      const current=$('#thumbnailStatus');
      if(current)current.textContent=local?'Could not read this video. Try an MP4 or upload a still.':'This link does not provide browser-readable video. Choose a video or still from Photos or Files.';
    }
  }finally{
    if(pendingFrames.get(c.id)===request)pendingFrames.delete(c.id);
    if(!retained){
      video.removeAttribute('src');video.load();
      if(local)URL.revokeObjectURL(source);
    }
  }
}
function applySuggestedHeadline(c) {
  if(c.production?.thumbnailHeadline?.trim())return;
  c.production={...c.production,thumbnailHeadline:suggestThumbnailHeadline(c),step:clipStep};
  persist();
  const field=$('#production-thumbnailHeadline');
  if(field)field.value=c.production.thumbnailHeadline;
}

async function makeThumbnailFromLink(c,value) {
  const source=value||c.url;
  let url;
  try{url=new URL(source);}catch{}
  if(url?.protocol!=='https:'||url.username||url.password){toast('Enter an HTTPS clip, video, or image link.',true);return;}
  const slug=twitchClipSlug(url.href);
  if(slug&&slug!==twitchClipSlug(c.url)){
    toast('Open the clip that matches this Twitch link, then make its thumbnail.',true);
    return;
  }
  if(slug){
    const status=$('#thumbnailStatus');
    const active=()=>findSelected()?.id===c.id&&status?.isConnected;
    if(status)status.textContent='Checking Twitch image sizes…';
    try{
      let thumbnail=safeUrl(c.thumbnail);
      if(!thumbnail){
        const response=await fetch('./data/latest.json',{cache:'no-cache'});
        if(response.ok){
          const feed=await response.json();
          thumbnail=safeUrl(feed.clips?.find(item=>item.id===slug)?.thumbnail_url);
        }
      }
      if(!thumbnail)throw Error('This clip has no image in the discovery feed. Choose its saved video to extract a frame.');
      clipArtworkCache.delete(thumbnail);
      const image=await loadClipArtwork(thumbnail);
      if(!image)throw Error('Twitch artwork could not be loaded. Choose the saved video to extract a frame.');
      if(!active())return;
      const width=image.naturalWidth,height=image.naturalHeight;
      const old=(await getCoverAssets(c.id)).main;
      if(!active())return;
      if(old&&old.width*old.height>width*height){
        status.textContent='Best available Twitch image is '+width+' × '+height+'. Your sharper saved frame is still selected.';
        return;
      }
      const canvas=captureCoverImage(image,width,height,1920,1920);
      const artwork=canvas.toDataURL('image/jpeg',.95);
      releaseCoverVideo(c.id);
      applySuggestedHeadline(c);
      await setCoverAsset(c,'main',{image:artwork,kind:'Twitch image',width,height,clipUrl:c.url,mediaUrl:image.src});
      if(active())toast('Selected Twitch image · '+width+' × '+height);
    }catch(error){if(active())status.textContent=error.message}
    return;
  }
  if(/\.(png|jpe?g|webp|avif)$/i.test(url.pathname)){
    const status=$('#thumbnailStatus');
    if(status)status.textContent='Loading linked image…';
    const image=await loadThumbnailImage(url.href,true);
    if(findSelected()?.id!==c.id)return;
    if(!image){if(status?.isConnected)status.textContent='This image link does not allow browser access. Choose an episode image instead.';return;}
    releaseCoverVideo(c.id);
    applySuggestedHeadline(c);
    const canvas=captureCoverImage(image,image.naturalWidth,image.naturalHeight,1920,1920);
    await setCoverAsset(c,'main',{image:canvas.toDataURL('image/jpeg',.93),kind:'Linked image',width:image.naturalWidth,height:image.naturalHeight,clipUrl:c.url,mediaUrl:url.href});
    return;
  }
  applySuggestedHeadline(c);
  await fetchThumbnailFrame(c,url.href);
}

async function setThumbnailImage(input,c) {
  const file=input.files?.[0];if(!file||!c)return;
  const url=URL.createObjectURL(file);
  try{
    const img=await loadThumbnailImage(url);
    if(!img){toast('Choose a supported image.',true);return;}
    const portrait=input.id==='thumbnailPortrait';
    const limit=portrait?768:1920;
    const width=img.naturalWidth,height=img.naturalHeight;
    const canvas=captureCoverImage(img,width,height,limit,limit);
    const image=portrait?canvas.toDataURL('image/webp',.88):canvas.toDataURL('image/jpeg',.91);
    if(portrait){
      localStorage.setItem(portraitKey,image);
      preparedCoverShare=null;
      saveCoverChoice(c,{portrait:true});
      await paintThumbnail(c);
    }else{
      const slot=input.id==='coverComparison'?'comparison':'main';
      if(slot==='main')releaseCoverVideo(c.id);
      await setCoverAsset(c,slot,{image,kind:'Uploaded still',width,height,clipUrl:c.url});
    }
  }catch{toast('Could not load or save that image.',true);}
  finally{URL.revokeObjectURL(url);}
}

function selectedAngleText(c) {
  const key=c.production?.selectedAngle;
  return (key && c.production?.[key]) || c.hook || 'Choose an angle to guide your script, caption, and thumbnail.';
}
function renderDrawer(){if(!clipSelected)return;const c=state.clips.find(x=>x.id===clipSelected);if(!c){closeDrawer();return}const r=clipRights(c),part=scoreParts(c),img=safeUrl(c.thumbnail);const check=c.checks||{};const pass=isCleared(c);const stages=stageOrder.map(k=>[k,statusTitles[k]]);const source=safeUrl(c.url);const embed=twitchClipEmbed(source);const drawer=$('#drawerContent');
 drawer.innerHTML=`<div class="drawer-top"><div><span class="eyebrow">CLIP DOSSIER / ${esc(c.platform)}</span><h2>${esc(c.title)}</h2><span class="fineprint">@${esc(c.streamer||'unknown')} · ${ago(c.createdAt)} · ${formatCount(c.views)} views</span></div><button class="icon-button" data-action="close-drawer" aria-label="Close editor">✕</button></div><div class="drawer-body">
  <div class="clip-step-nav"><div><span id="clipStepCount" class="eyebrow"></span><h3 id="clipStepTitle" tabindex="-1"></h3></div></div>
  <section class="clip-step"><div class="detail-hero" ${img?`style="background-image:url('${esc(img)}')"`:''}><div class="detail-gradient"></div>${embed?`<button class="btn btn-accent clip-play" data-action="play-clip">▶ Watch clip</button>`:''}<div class="detail-footer"><span class="tag accent">${part.total}/100 OPPORTUNITY</span>${rightsTag(c)}</div></div>
  <div class="drawer-actions">${source?`<a class="btn btn-soft btn-sm" target="_blank" rel="noopener noreferrer" href="${esc(source)}">↗ Original clip</a>`:''}<button class="btn btn-ghost btn-sm" data-action="copy-clip-url">⧉ Copy link</button>${c.status==='discovered'?btn('shortlist-clip','Add to shortlist','accent'):tag(c.status)}</div>
    ${sourceReview(c,part)}
  </section><section class="clip-step production-section"><div class="production-fields">
    <button class="btn btn-accent" data-action="draft-brief">Draft brief</button><p class="fineprint">Starts from clip metadata. Watch the source to verify the details.</p>
    <div class="angle-grid">${['angle1','angle2','angle3'].map(key=>`<article class="angle-card">${productionField(c,key)}<button type="button" class="btn btn-soft" data-use-angle="${key}" aria-pressed="${c.production?.selectedAngle===key}">${c.production?.selectedAngle===key?'Selected':'Use this angle'}</button></article>`).join('')}</div>
    <p class="fineprint" data-angle-context>${esc(selectedAngleText(c))}</p>
    ${productionField(c,'script')}
    <details class="production-section"><summary>Research &amp; Spinoza’s Point</summary>
      <button class="btn btn-soft" data-action="copy-research-prompt">Copy research prompt</button>
      <button class="btn btn-ghost" data-action="import-research">Import research</button>
      ${['brief','point','permissionChecks'].map(key=>productionField(c,key)).join('')}
    </details>
    <details class="production-section"><summary>Editing notes</summary>
      <div class="field"><label>Angle / video hook</label><textarea data-clip-field="hook">${esc(c.hook||'')}</textarea></div>
      <div class="field"><label>Human rating (0–5)</label><select data-clip-field="rating">${[0,1,2,3,4,5].map(v=>`<option value="${v}" ${Number(c.rating||0)===v?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Editor</label><input data-clip-field="editor" value="${esc(c.editor||'')}"/></div>
      <div class="field"><label>Original commentary</label><textarea data-clip-field="valueAdd">${esc(c.valueAdd||'')}</textarea></div>
      <div class="check-row">${[['hook','Hook written'],['captions','Captions checked'],['vertical','9:16 composition'],['commentary','Original value added'],['credit','Creator credited'],['quality','Final QC complete']].map(([k,t])=>`<label class="check-item"><input type="checkbox" data-check-field="${k}" ${check[k]?'checked':''}/> ${t}</label>`).join('')}</div>
    </details>
  </div></section><section class="clip-step production-section"><div class="production-fields">
    <p class="fineprint" data-angle-context>${esc(selectedAngleText(c))}</p>
    ${thumbnailBuilder(c)}
    <details class="production-section"><summary>Captions and creative brief</summary>
    <button class="btn btn-soft" data-action="copy-caption-brief">Copy caption prompt</button>
    ${['captionOptions','chosenCaption','thumbnailBrief'].map(key=>productionField(c,key)).join('')}
    <button class="btn btn-soft" data-action="copy-thumbnail-brief">Copy thumbnail brief</button>
    </details>
  </div></section><section class="clip-step production-section"><div class="field"><label>Current production stage</label><select data-clip-field="status">${optionList([...stages,['archived','Archived']],c.status||'discovered')}</select></div>${!pass?`<p class="fineprint">Record permissions in the rights section before advancing into production.</p>`:''}<details class="production-section"><summary>Rights record</summary><div class="field"><label>Authorization status</label><select id="rightStatus">${optionList([['unknown','Unknown / unverified'],['requested','Permission requested'],['granted','Creator granted permission'],['denied','Denied / do not use'],['own','Owned footage'],['other_basis','Other documented legal basis']],r.status||'unknown')}</select></div><div class="field"><label>Evidence / approval reference</label><input id="rightEvidence" value="${esc(r.evidence||'')}" placeholder="Link to agreement, DM record, email reference..."/></div><div class="field"><label>Scope / allowed platforms</label><input id="rightScope" value="${esc(r.scope||'')}" placeholder="e.g. TikTok, YouTube Shorts, Instagram; non-exclusive" /></div><div class="field"><label>Permission notes / rationale</label><textarea id="rightNote" placeholder="Terms, limitations, expiry, or reasoning for other legal basis...">${esc(r.note||'')}</textarea></div><button class="btn btn-soft" data-action="save-rights">Save rights record</button><div class="fineprint" style="margin-top:10px">${r.confirmedAt?'Last documented: '+esc(fmtDate(r.confirmedAt)):'No clearance documented yet.'}</div></details><div class="field"><label>Published URL(s)</label><textarea data-clip-field="postedUrl" placeholder="One platform URL per line">${esc(c.postedUrl||'')}</textarea></div><div class="drawer-actions"><button class="btn btn-accent" data-action="advance-clip">Advance pipeline status</button><button class="btn btn-ghost" data-action="archive-clip">Archive</button></div><div class="fineprint" style="margin-top:15px">Status is saved after each change. Publication itself remains a manual action on the destination platform.</div><button class="btn btn-danger btn-sm" data-action="delete-clip">Delete clip record</button></section>
  <section class="clip-step production-section">${recordKit(c)}</section>
  </div><footer class="clip-step-footer"><span id="draftSaveState" class="fineprint" role="status">Drafts stay on this device</span><div class="clip-step-buttons"><button id="clipStepBack" class="btn btn-ghost" data-action="clip-step-back">Back</button><button id="clipStepNext" class="btn btn-accent" data-action="clip-step-next">Next →</button></div></footer>`;
 showClipStep();
}
function findSelected(){return state.clips.find(c=>c.id===clipSelected)}
function requireClearance(target,c){if(['approved','editing','review','scheduled','published'].includes(target)){if(!isCleared(c)){toast('Document rights clearance before moving into production.',true);return false}if(target==='published'&&(!(c.postedUrl||'').trim())){toast('Add the live published URL before marking Published.',true);return false}}return true}
function statusAdvance(){let c=findSelected();if(!c)return;let idx=stageOrder.indexOf(c.status);let next=stageOrder[Math.min(stageOrder.length-1,idx+1)];if(idx<0||idx===stageOrder.length-1){toast('No later pipeline stage');return}if(!requireClearance(next,c))return;c.status=next;changed('Pipeline advanced',c.title+' → '+statusTitles[next]);toast('Moved to '+statusTitles[next])}
function saveRights(){const c=findSelected();if(!c)return;const status=$('#rightStatus').value,evidence=$('#rightEvidence').value.trim(),scope=$('#rightScope').value.trim(),note=$('#rightNote').value.trim();if(['granted','other_basis'].includes(status)&&evidence.length<4){toast('Add a meaningful evidence or authorization reference.',true);return}if(status==='granted'&&!scope){toast('Specify where reuse was authorized.',true);return}if(status==='other_basis'&&note.length<6){toast('Document the basis and your reasoning.',true);return}c.rights={status,evidence,scope,note,confirmedAt:nowISO()};if(!isCleared(c)&&['approved','editing','review','scheduled','published'].includes(c.status)){c.status='rights'}changed('Rights status updated',c.title+' · '+status);toast('Rights record saved')}
function addManualClip(form){const fd=new FormData(form),url=safeUrl(fd.get('url'));if(!url){toast('Enter a valid http(s) source URL.',true);return}if(state.clips.some(c=>clipKey(c)===clipKey({url}))){toast('This source URL is already tracked.',true);return}const c={id:makeID(),sourceId:'',url,title:String(fd.get('title')).trim(),streamer:String(fd.get('streamer')).trim().replace(/^@/,''),platform:String(fd.get('platform')),views:Math.max(0,Number(fd.get('views')||0)),duration:Number(fd.get('duration')||0),createdAt:fd.get('createdAt')?new Date(fd.get('createdAt')).toISOString():'',discoveredAt:nowISO(),thumbnail:'',status:'discovered',rating:0,hook:'',valueAdd:'',editor:'',postedUrl:'',checks:{},rights:{status:'unknown',evidence:'',scope:'',note:'',confirmedAt:''}};state.clips.push(c);closeModal();page='discovery';changed('Clip added',c.title);toast('Clip added to Discovery')}
function upsertStreamer(form){const fd=new FormData(form),handle=String(fd.get('handle')||'').trim().replace(/^@/,'').toLowerCase();if(!/^[a-z0-9_]{2,90}$/.test(handle)){toast('Use a valid Twitch username.',true);return}const id=String(fd.get('id')||''),existing=state.streamers.find(s=>s.id===id);if(state.streamers.some(s=>s.handle.toLowerCase()===handle&&s.id!==id)){toast('This streamer is already on your watchlist.',true);return}const data={id:existing?.id||makeID(),handle,name:String(fd.get('name')||'').trim(),platform:'Twitch',priority:Number(fd.get('priority')),notes:String(fd.get('notes')||'').trim()};if(existing)Object.assign(existing,data);else state.streamers.push(data);closeModal();changed(existing?'Creator updated':'Creator added',handle);toast(existing?'Creator updated':'Added to radar')}
async function scan(){await refreshFeed(false)}
async function exportJSON(){
  try{
    const records=await Promise.all(state.clips.map(async c=>[c.id,await getCoverAssets(c.id)]));
    const covers=Object.fromEntries(records.filter(([,assets])=>Object.keys(assets).length));
    const raw=JSON.stringify({...state,coverBackup:{covers,portrait:readPortrait()},exportedAt:nowISO()},null,2);
    const blob=new Blob([raw],{type:'application/json'});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download='leonida-signal-backup-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Backup exported');
  }catch{toast('Could not export backup.',true)}
}
async function importJSON(file){
  if(!file)return;
  try{
    const {coverBackup,...incoming}=JSON.parse(await file.text());
    if(!Array.isArray(incoming.clips)||!Array.isArray(incoming.streamers))throw Error('Not a valid LEONIDA SIGNAL backup.');
    if(!confirm(`Replace your workspace with ${incoming.clips.length} clips and ${incoming.streamers.length} creators from this backup?`))return;
    if(coverBackup){
      const records=incoming.clips.flatMap(c=>{
        const stored=coverBackup.covers?.[c.id];
        if(!stored)return [];
        const assets=Object.fromEntries(['main','comparison'].filter(slot=>coverImage(stored[slot]?.image)).map(slot=>[slot,stored[slot]]));
        return [[c.id,assets]];
      });
      await coverStorage('readwrite',store=>{
        const clear=store.clear();
        for(const [id,assets] of records)store.put(assets,id);
        return clear;
      });
      coverAssets.clear();
      preparedCoverShare=null;
      const portrait=coverImage(coverBackup.portrait);
      if(portrait)localStorage.setItem(portraitKey,portrait);
      else localStorage.removeItem(portraitKey);
    }
    closeDrawer();
    state=normalizeState(incoming);
    changed('Backup restored',file.name);toast('Backup imported');
  }catch(err){toast('Import failed: '+err.message,true)}
}
async function copyToClipboard(text){try{await navigator.clipboard.writeText(text);toast('Copied')}catch{toast('Copy is unavailable in this context.',true)}}
function route(name){page=name;closeDrawer();$('#sidebar').classList.remove('mobile-open');render();window.scrollTo(0,0)}

// Event delegation: supports dynamically rendered views, touch controls, and accessible buttons.
document.addEventListener('click',async e=>{
  const coverButton=e.target.closest('[data-cover-layout],[data-cover-frame]');
  if(coverButton){
    const c=findSelected();
    if(!c)return;
    if(coverButton.dataset.coverLayout){
      saveCoverChoice(c,{layout:coverButton.dataset.coverLayout});
      paintThumbnail(c);
    }else{
      const frame=coverFilmstrips.get(c.id)?.frames[Number(coverButton.dataset.coverFrame)];
      if(frame){
        $('#coverPosition').value=String(frame.time);
        $('#coverTime').textContent=coverTime(frame.time);
        await chooseCoverFrame(c,frame.time);
      }
    }
    return;
  }
  const angleButton=e.target.closest('[data-use-angle]');
  if(angleButton){
    const c=findSelected(), key=angleButton.dataset.useAngle;
    if(!c || !['angle1','angle2','angle3'].includes(key))return;
    if(!c.production?.[key]?.trim()){toast('Add or import this angle first.',true);return;}
    c.production={...c.production,selectedAngle:key};
    changed('Angle selected',c.title);
    return;
  }

 const coverClip=e.target.closest('[data-cover-clip]');
 if(coverClip){openDrawer(coverClip.dataset.coverClip,2);return}
 const recordButton=e.target.closest('[data-record-clip]');
 if(recordButton){openDrawer(recordButton.dataset.recordClip,4);return}
 const packageButton=e.target.closest('[data-copy-package]');
 if(packageButton){const c=findSelected();if(c){await getCoverAssets(c.id);await copyToClipboard(platformPackage(c,packageButton.dataset.copyPackage))}return}
 const removeResult=e.target.closest('[data-remove-result]');
 if(removeResult&&confirm('Delete this performance entry?')){
   state.performance=state.performance.filter(row=>row.id!==removeResult.dataset.removeResult);
   changed();
   return;
 }
 const nav=e.target.closest('[data-page]');if(nav){route(nav.dataset.page);return}
 const open=e.target.closest('[data-open-clip]');if(open){openDrawer(open.dataset.openClip);return}
 const edit=e.target.closest('[data-edit-streamer]');if(edit){modalStreamer(state.streamers.find(s=>s.id===edit.dataset.editStreamer));return}
 const visit=e.target.closest('[data-open-streamer]');if(visit){const s=state.streamers.find(x=>x.id===visit.dataset.openStreamer);if(s)window.open('https://www.twitch.tv/'+encodeURIComponent(s.handle),'_blank','noopener,noreferrer');return}
 const remove=e.target.closest('[data-remove-streamer]');if(remove){const s=state.streamers.find(x=>x.id===remove.dataset.removeStreamer);if(s&&confirm('Remove @'+s.handle+' from the watchlist? Existing clips remain.')){state.streamers=state.streamers.filter(x=>x.id!==s.id);closeModal();changed('Creator removed',s.handle)}return}
 const action=e.target.closest('[data-action]')?.dataset.action;if(action){switch(action){case 'clip-step-back':moveClipStep(-1);break;case 'clip-step-next':moveClipStep(1);break;case 'add-clip':modalAddClip();break;case 'add-streamer':modalStreamer();break;case 'scan':await scan();break;case 'close-modal':closeModal();break;case 'close-drawer':closeDrawer();break;case 'nav-discovery':route('discovery');break;case 'nav-pipeline':route('pipeline');break;
 case 'mark-record':{
   const c=findSelected();
   if(!c)break;
   if(!c.production?.ready&&!c.production?.script?.trim()){toast('Write a script before marking Ready to Record.',true);break}
   c.production={...c.production,ready:!c.production.ready};
   changed('Recording readiness updated',c.title);break;
 }
 case 'add-suggested-creators':{
   for(const [handle,name] of watchlistSuggestions())state.streamers.push({id:makeID(),handle,name,platform:'Twitch',priority:1,notes:'Discovery candidate'});
   changed('Creator suggestions added','Watchlist');break;
 }
 case 'shortlist-clip':{const c=findSelected();if(c?.status==='discovered'){c.status='shortlisted';changed('Clip shortlisted',c.title);toast('Added to the pipeline')}break}
 case 'play-clip':{
   const c=findSelected(), embed=c&&twitchClipEmbed(c.url), hero=$('#drawerContent .detail-hero');
   if(embed&&hero){
     const frame=document.createElement('iframe');
     frame.src=embed;
     frame.title='Twitch clip: '+c.title;
     frame.allowFullscreen=true;
     hero.classList.add('playing');
     hero.replaceChildren(frame);
   }
   break;
 }
 case 'import-research':{
   if(findSelected())showModal(`${modalHeader('RESEARCH','Import research')}
     <form id="researchImportForm"><div class="modal-body"><div class="field">
     <label for="researchJson">Paste the JSON reply from ChatGPT</label>
     <textarea required id="researchJson" rows="7"></textarea>
     </div><p class="fineprint">Existing research fields on this clip will be replaced. Rights records and production notes are kept.</p></div>
     <div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-accent">Import research</button></div></form>`);
   break;
 }
 case 'copy-research-prompt':{const c=findSelected();if(c)await copyToClipboard(researchPrompt(c));break}
 case 'draft-brief':{
   const c=findSelected();if(!c)break;
   const draft=buildClipDraft(c);const existing=c.production||{};
   const missing=Object.fromEntries(Object.entries(draft).filter(([key])=>!String(existing[key]||'').trim()));
   if(!Object.keys(missing).length){toast('This clip already has a draft. Edit it in Write.');break;}
   c.production={...existing,...missing,step:clipStep};changed('Brief drafted from clip metadata',c.title);break;
 }
 case 'fetch-clip-art':{const c=findSelected();if(c)await makeThumbnailFromLink(c,c.url);break}
 case 'copy-thumbnail-link':{
   const c=findSelected(),input=$('#thumbnailSourceLink');
   if(!c||!input)break;
   const source=safeUrl(c.url);
   if(!source){toast('This clip has no source URL.',true);break;}
   copiedThumbnailLink=source;
   try{
     await navigator.clipboard.writeText(source);
     toast('Original clip URL copied. Paste it into ChatGPT.');
   }catch{
     if(input.isConnected){input.value=source;input.focus();input.select();}
     toast('Copy the selected original clip URL and paste it into ChatGPT.');
   }
   break;
 }
 case 'paste-thumbnail-link':{
   const c=findSelected(),input=$('#thumbnailSourceLink');if(!c||!input)break;
   try{
     const value=input.value.trim()||copiedThumbnailLink||await navigator.clipboard.readText();
     if(!value?.trim()){input.focus();toast('Paste an image or video link into the field.');break;}
     if(findSelected()?.id!==c.id||!input.isConnected)break;
     input.value=value.trim();
     await makeThumbnailFromLink(c,input.value);
   }catch{
     if(input.isConnected){input.focus();toast('Paste your link into the field, then select Make thumbnail.');}
   }
   break;
 }
 case 'make-thumbnail-from-link':{
   const c=findSelected();if(c)await makeThumbnailFromLink(c,$('#thumbnailSourceLink').value.trim());
   break;
 }
 case 'download-thumbnail':await exportCover(findSelected(),$('#coverRatio').value);break;
 case 'share-thumbnail':{const c=findSelected();if(c)await exportCover(c,coverChoice(c).ratio||'wide',true);break}
 case 'cover-open':case 'cover-to-kit':{
   const c=findSelected();
   if(c){clipStep=action==='cover-open'?2:4;c.production={...c.production,step:clipStep};persist();renderDrawer();showClipStep(true)}
   break;
 }
 case 'cover-headline':{
   const c=findSelected();if(c){const field=$('#production-thumbnailHeadline');field.value=suggestThumbnailHeadline(c);field.dispatchEvent(new Event('input',{bubbles:true}));}
   break;
 }
 case 'cover-grab':case 'cover-grab-second':{
   const c=findSelected(),position=$('#coverPosition');
   if(c&&position)await chooseCoverFrame(c,Number(position.value),action==='cover-grab-second'?'comparison':'main');
   break;
 }
 case 'cover-clear-comparison':{const c=findSelected();if(c)await setCoverAsset(c,'comparison',null);break}
 case 'remove-portrait':{localStorage.removeItem(portraitKey);preparedCoverShare=null;paintThumbnail(findSelected());break;}
 case 'copy-caption-brief':{const c=findSelected();if(c)await copyToClipboard([
   'Write three short caption options in Spinoza’s voice for this video.',
   'Source: '+c.title+' — '+c.url,
   'Angle: '+selectedAngleText(c),
   c.production?.script&&'Script: '+c.production.script,
   'Use plain language and a little humor. Avoid claiming facts the script does not establish.'
 ].filter(Boolean).join('\n'));break}
 case 'copy-thumbnail-brief':{const c=findSelected();if(c){const draft=c.production||{};await copyToClipboard([
   'Create a thumbnail for Spinoza’s GTA VI coverage.',
   'Source: '+c.title+' — '+c.url,
   (draft.selectedAngle || c.hook)&&'Selected angle: '+selectedAngleText(c),
   draft.chosenCaption&&'Selected caption: '+draft.chosenCaption,
   'Headline: '+(draft.thumbnailHeadline||suggestThumbnailHeadline(c)),
   draft.thumbnailBrief&&'Direction: '+draft.thumbnailBrief,
   'Use Thumbnail B: thin cream border, upright cream headline on the left, subtle print texture, small cobalt S in the upper-left, and Jack’s likeness on the right for most episodes. One clear focal point, readable at phone size.'
 ].filter(Boolean).join('\n'));}break}case 'export':exportJSON();break;case 'import':$('#importFile')?.click();break;case 'copy-clip-url':if(findSelected())copyToClipboard(findSelected().url);break;case 'save-rights':saveRights();break;case 'advance-clip':statusAdvance();break;case 'archive-clip':{let c=findSelected();if(c){c.status='archived';changed('Clip archived',c.title);toast('Archived')}}break;case 'delete-clip':{let c=findSelected();if(c&&confirm('Permanently remove this clip record?')){state.clips=state.clips.filter(x=>x.id!==c.id);closeDrawer();changed('Clip deleted',c.title);toast('Clip removed')}}break}}
});
document.addEventListener('submit',e=>{
 if(e.target.id==='verificationForm'){e.preventDefault();saveVerification(e.target);return}
 if(e.target.id==='performanceForm'){e.preventDefault();savePerformance(e.target);return}
 if(e.target.id==='researchImportForm'){
   e.preventDefault();
   const c=findSelected();
   if(!c)return;
   let draft;
   try{draft=parseResearch($('#researchJson').value,c)}catch{}
   if(!draft){toast('Paste the full research JSON generated for this clip.',true);return;}
   c.production={...c.production,...draft};
   closeModal();
   changed('Research imported',c.title);
   toast('Research saved');
   return;
 }
 if(e.target.getAttribute('id')==='clipForm'){e.preventDefault();addManualClip(e.target)}if(e.target.getAttribute('id')==='streamerForm'){e.preventDefault();upsertStreamer(e.target)}});
document.addEventListener('change',e=>{const t=e.target;
 if(t.id==='coverPosition'){previewCoverTime(findSelected(),Number(t.value));return}
 if(t.id==='coverGuides'){
   const guides=$('.cover-guides');
   if(guides)guides.hidden=!t.checked;
   return;
 }
 if(['coverRatio','coverPortrait'].includes(t.id)){
   const c=findSelected();
   if(c){saveCoverChoice(c,t.id==='coverRatio'?{ratio:t.value}:{portrait:t.checked});paintThumbnail(c)}
   return;
 }
 if(t.id==='coverMedia'&&t.files?.[0]&&findSelected()){
   const file=t.files[0],c=findSelected();
   if(file.type.startsWith('video/')||/\.(mov|mp4|webm|m4v)$/i.test(file.name))fetchThumbnailFrame(c,URL.createObjectURL(file),true);
   else setThumbnailImage(t,c);
   t.value='';
   return;
 }
 if(['thumbnailArtwork','thumbnailPortrait','coverComparison'].includes(e.target.id)&&e.target.type==='file'){setThumbnailImage(e.target,findSelected());return;}
 if(t.id==='statusFilter'){filterStatus=t.value;render();return}if(t.id==='sortFilter'){sortMode=t.value;render();return}
 if(t.id==='settingWindow'){state.settings.scanWindow=Number(t.value);changed();return}if(t.id==='settingMax'){state.settings.maxClips=Number(t.value);changed();return}if(t.id==='settingAuto'){state.settings.autoScan=t.value==='on';changed();return}
 if(t.id==='importFile'){importJSON(t.files[0]);t.value='';return}
 if(t.dataset.clipField){const c=findSelected();if(!c)return;const field=t.dataset.clipField;let val=field==='rating'?Number(t.value):t.value;if(field==='status'&&!requireClearance(val,c)){renderDrawer();return}c[field]=val;changed('Clip updated',c.title+' · '+field);return}
 if(t.dataset.checkField){const c=findSelected();if(!c)return;c.checks={...(c.checks||{}),[t.dataset.checkField]:t.checked};changed();return}
});
document.addEventListener('input',e=>{
 const t=e.target;
 if(t.id==='coverPosition'){$('#coverTime').textContent=coverTime(Number(t.value));return}
 if(['coverCropX','coverCropY'].includes(t.id)){
   const c=findSelected();
   if(c){
     const choice=coverChoice(c),ratio=choice.ratio||'wide';
     const focus={x:Number($('#coverCropX').value),y:Number($('#coverCropY').value)};
     saveCoverChoice(c,{crops:{...choice.crops,[ratio]:focus}});
     paintThumbnail(c);
   }
   return;
 }
 const key=e.target.dataset.productionField;
 if(key&&productionFields.some(([field])=>field===key)){
   const c=findSelected();
   if(c){c.production={...c.production,[key]:e.target.value,step:clipStep};persist();if(key==='thumbnailHeadline')paintThumbnail(c);}
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




const verificationLabels={unverified:'Unverified',partial:'Partially Verified',verified:'Verified'};
function sourceReview(c,parts){
  const v=c.verification||{};
  const status=v.status||'unverified';
  const hours=parts.rate==null?'Needs two dated feed snapshots':parts.rate.toFixed(1)+' views/hour';
  const vod=/^\d+$/.test(c.vodId||'')?'https://www.twitch.tv/videos/'+c.vodId+
    (Number.isInteger(c.vodOffset)&&c.vodOffset>=0?'?t='+c.vodOffset+'s':''):'';
  return `<div class="r2-section">
    <h3>Source and verification</h3>
    <p class="fineprint">${esc(c.sourceType==='twitch-api'?'Twitch Helix metadata':c.sourceType==='curated-starter'?'Curated lead':'Manually entered source')} · Clip timestamp ${esc(fmtDate(c.createdAt))} · ${esc(hours)}</p>
    ${c.discoverySources?.length?`<p class="fineprint">Found via ${esc(c.discoverySources.join(', '))}</p>`:''}
    ${c.clipper?`<p class="fineprint">Clipped by ${esc(c.clipper)}</p>`:''}
    ${vod?`<a class="btn btn-soft" href="${esc(vod)}" target="_blank" rel="noopener noreferrer">Original stream</a>`:''}
    <p class="fineprint">Ranking · Velocity ${parts.velocity}/35 · Views ${parts.traction}/20 · Freshness ${parts.fresh}/20 · Creator ${parts.priority}/10 · Commentary ${parts.editorial}/15</p>
    <p class="fineprint">${esc(verificationLabels[status]||verificationLabels.unverified)} · ${v.reviewed?'Footage review reported by workspace owner':'No independent footage review recorded'}${v.checkedAt?' · '+esc(fmtDate(v.checkedAt)):''}</p>
    <form id="verificationForm" class="production-fields">
      <label>Verification status<select name="status">${optionList(Object.entries(verificationLabels),status)}</select></label>
      <label class="check-item"><input type="checkbox" name="reviewed" ${v.reviewed?'checked':''}> I reviewed the original footage</label>
      <label>Evidence or notes<textarea name="notes" maxlength="3000" placeholder="What you confirmed, at what timecode, and what remains uncertain">${esc(v.notes||'')}</textarea></label>
      <label>Attribution<textarea name="credit" maxlength="1200" placeholder="Streamer, clipper, original link, third-party material and required credits">${esc(v.credit||'')}</textarea></label>
      <div class="r2-actions"><button class="btn btn-soft">Save source review</button></div>
    </form>
  </div>`;
}
function saveVerification(form){
  const clip=findSelected();
  if(!clip)return;
  const data=new FormData(form),status=data.get('status'),reviewed=data.has('reviewed');
  const notes=String(data.get('notes')||'').trim();
  if(!Object.hasOwn(verificationLabels,status))return;
  if((status==='verified'&&!reviewed)||(status!=='unverified'&&!notes)){
    toast('Verified requires original footage review. Add supporting evidence for Verified or Partially Verified.',true);
    return;
  }
  clip.verification={status,reviewed,notes,credit:String(data.get('credit')||'').trim(),checkedAt:nowISO()};
  changed('Source review saved',clip.title);
  toast('Source review saved');
}
const publishingPlatforms=['YouTube Shorts','TikTok','X'];
function platformPackage(clip,platform){
  const p=clip.production||{};
  const headline=p.thumbnailHeadline||suggestThumbnailHeadline(clip);
  const creator=clip.streamer||'original streamer';
  const hook=(clip.hook||p[p.selectedAngle]||'What stood out to you?').split(/(?<=[.!?])\s/)[0];
  const caption=p.chosenCaption?.trim();
  let copy;
  if(platform==='YouTube Shorts')copy=['Title: '+headline,'Description: '+(caption||hook),'Pinned comment: What detail changed your read?'];
  if(platform==='TikTok')copy=['Caption: '+(caption||hook)+' What did you notice first?','Cover: '+headline];
  if(platform==='X')copy=['Post: '+short(caption||hook,220),'Add the source in the post or a reply.'];
  return [
    ...(copy||[]),
    'Credit: '+(clip.verification?.credit||creator),
    'Original source: '+clip.url,
    'Cover layout: '+coverLayouts[currentCoverLayout(clip)]+' · '+headline,
    ...(coverAssets.get(clip.id)?.main?.time!=null?['Cover source time: '+coverTime(coverAssets.get(clip.id).main.time)]:[]),
    'Export: Clean vertical master (9:16) with readable captions. Check the cover and credits on the destination before uploading manually.',
    'After posting: Save the live URL and log results at a consistent post age.'
  ].join('\n');
}
function recordKit(c){
  const p=c.production||{},source=safeUrl(c.url);
  return `<div class="production-fields">
    <div class="r2-actions">${btn('mark-record',p.ready?'Return to drafts':'Mark ready to record','accent')}${source?`<a class="btn btn-soft" href="${esc(source)}" target="_blank" rel="noopener noreferrer">Open original source</a>`:''}</div>
    <p class="fineprint">${esc(verificationLabels[c.verification?.status]||verificationLabels.unverified)} · Reuse ${rightsTag(c)}</p>
    <p class="fineprint">${esc(selectedAngleText(c))}</p>
    <h3>Script</h3><p class="r2-copy">${esc(p.script||'Write the script in the Write step.')}</p>
    ${productionField(c,'filmingNotes')}
    <h3>Cover</h3>
    <div class="r2-actions">${btn('cover-open','Make a cover','accent')}</div>
    <p class="fineprint" id="recordCover">${esc(coverLayouts[currentCoverLayout(c)])} · ${esc(p.thumbnailHeadline||suggestThumbnailHeadline(c))}</p>
    <h3>Thumbnail concept</h3><p class="r2-copy">${esc(p.thumbnailBrief||'Choose one clear source frame and use the Thumbnail B layout in Package.')}</p>
    <h3>Publishing packages</h3>
    ${publishingPlatforms.map((platform)=>`<details class="production-section"><summary>${platform}</summary><p class="r2-copy">${esc(platformPackage(c,platform))}</p><button class="btn btn-soft" data-copy-package="${platform}" aria-label="Copy ${platform} package">Copy package</button></details>`).join('')}
  </div>`;
}
function renderRecord(){
  const clips=state.clips.filter(c=>!['archived','published'].includes(c.status)&&(c.status!=='discovered'||c.production?.script?.trim()))
    .sort((a,b)=>Number(!!(b.production?.ready&&b.production?.script?.trim()))-Number(!!(a.production?.ready&&a.production?.script?.trim()))||score(b)-score(a));
  return pageTop('','Ready to Record','Open your script, filming notes, source and publishing packages from one place.')+
    (clips.length?`<div class="r2-list">${clips.map(c=>`<article class="r2-section"><strong>${esc(c.title)}</strong><p class="fineprint">${esc(c.streamer)} · ${c.production?.ready&&c.production?.script?.trim()?'Ready to record':'Draft'}</p><div class="r2-actions"><button class="btn btn-soft" data-record-clip="${esc(c.id)}">Open recording kit</button><button class="btn btn-ghost" data-cover-clip="${esc(c.id)}">Make a cover</button></div></article>`).join('')}</div>`:empty('▶','No recording drafts','Shortlist a clip in Discovery to start.', 'nav-discovery','Open Discovery'));
}
const resultMetrics=[
  ['views','Views'],['reach','Reach'],['retention','Average viewed (%)'],['shares','Shares'],
  ['engagement','Interactions'],['subscribers','Subscribers gained'],
  ['impressions','Cover impressions'],['coverCtr','Cover click-through (%)']
];
const durationBucket=seconds=>seconds<=15?'Up to 15s':seconds<=30?'16–30s':seconds<=60?'31–60s':'Over 60s';
function savePerformance(form){
  const data=new FormData(form);
  const url=safeUrl(data.get('url')),platform=data.get('platform'),clip=state.clips.find(c=>c.id===data.get('clip'));
  if(!url||!publishingPlatforms.includes(platform)){toast('Enter a published URL and choose a platform.',true);return}
  const stats=Object.fromEntries(resultMetrics.map(([key])=>[key,data.get(key)===''?null:Number(data.get(key))]));
  if(Object.values(stats).every(value=>value===null)){toast('Enter at least one measured result.',true);return}
  const row={
    id:makeID(),clipId:clip?.id||'',url,platform,window:Number(data.get('window')),stats,
    cover:clip?.production?.cover?.layout?{
      layout:currentCoverLayout(clip),
      headline:clip.production.thumbnailHeadline||suggestThumbnailHeadline(clip),
      headlineStyle:(clip.production.thumbnailHeadline||suggestThumbnailHeadline(clip)).trim().endsWith('?')?'Question':'Statement',
      portrait:currentCoverLayout(clip)==='portrait'&&coverChoice(clip).portrait!==false&&!!readPortrait()
    }:null,
    topic:String(data.get('topic')).trim(),format:String(data.get('format')).trim(),
    hook:String(data.get('hook')).trim(),duration:Number(data.get('duration')),loggedAt:nowISO()
  };
  const matching=state.performance.find(r=>r.platform===platform&&r.window===row.window&&clipKey(r)===clipKey(row));
  if(matching){row.id=matching.id;Object.assign(matching,row)}else state.performance.unshift(row);
  changed('Performance saved',platform);
  toast(matching?'Performance entry updated':'Performance entry saved');
}
function analyticsBreakdown(platform,window,metric){
  const rows=state.performance.filter(r=>r.platform===platform&&r.window===window&&Number.isFinite(r.stats[metric]));
  const dimensions=['impressions','coverCtr'].includes(metric)
    ? [['topic','Topic'],['coverLayout','Cover layout'],['coverHeadline','Headline style'],['coverPortrait','Portrait']]
    : [['topic','Topic'],['format','Format'],['hook','Hook'],['duration','Duration']];
  return dimensions.map(([key,label])=>{
    const groups=new Map();
    for(const row of rows){
      const names={
        duration:durationBucket(row.duration),coverLayout:coverLayouts[row.cover?.layout],
        coverHeadline:row.cover?.headlineStyle,coverPortrait:row.cover?(row.cover.portrait?'Included':'Hidden'):null
      };
      const name=names[key]??row[key];
      if(!name)continue;
      const groupKey=name.toLowerCase();
      const group=groups.get(groupKey)||{name,count:0,total:0};
      group.count++;group.total+=row.stats[metric];groups.set(groupKey,group);
    }
    const ranking=[...groups.values()].sort((a,b)=>b.total/b.count-a.total/a.count);
    return `<div><h4>${label}</h4>${ranking.length?`<ul>${ranking.map(g=>`<li>${esc(g.name)} · ${(g.total/g.count).toLocaleString(undefined,{maximumFractionDigits:1})} average · n=${g.count}</li>`).join('')}</ul>`:'<p class="fineprint">No measured results.</p>'}</div>`;
  }).join('');
}
let analyticsFilter={platform:publishingPlatforms[0],window:7,metric:'views'};
function renderAnalytics(){
  return pageTop('','Performance','Log one snapshot per platform, post and measurement window. Leave unavailable metrics blank.')+`
    <div class="r2-section"><h3>Log a published video</h3>
      <form id="performanceForm" class="production-fields">
        <div class="form-grid">
          <label>Published URL<input type="url" name="url" required></label>
          <label>Linked clip<select name="clip"><option value="">Optional</option>${optionList(state.clips.map(c=>[c.id,c.title]),'')}</select></label>
          <label>Platform<select name="platform">${optionList(publishingPlatforms.map(p=>[p,p]),analyticsFilter.platform)}</select></label>
          <label>Post age<select name="window">${optionList([[1,'1 day'],[7,'7 days'],[30,'30 days']],analyticsFilter.window)}</select></label>
          <label>Topic<input name="topic" required maxlength="100" placeholder="e.g. GTA performance"></label>
          <label>Format<input name="format" required maxlength="100" placeholder="e.g. comparison"></label>
          <label>Hook type<input name="hook" required maxlength="100" placeholder="e.g. blind test"></label>
          <label>Video seconds<input name="duration" type="number" min="1" max="36000" required></label>
          ${resultMetrics.map(([key,label])=>`<label>${label}<input name="${key}" type="number" min="0" step="${['retention','coverCtr'].includes(key)?'0.01':'1'}" ${key==='coverCtr'?'max="100"':''}></label>`).join('')}
        </div>
        <div class="r2-actions"><button class="btn btn-accent">Save results</button></div>
      </form>
    </div>
    <div class="r2-section"><h3>What’s performing</h3>
      <p class="fineprint">Averages compare a single platform and post age. Cover metrics come from platform analytics. Small samples are directional.</p>
      <div class="form-grid">
        <label>Platform<select data-analytics-filter="platform">${optionList(publishingPlatforms.map(p=>[p,p]),analyticsFilter.platform)}</select></label>
        <label>Post age<select data-analytics-filter="window">${optionList([[1,'1 day'],[7,'7 days'],[30,'30 days']],analyticsFilter.window)}</select></label>
        <label>Metric<select data-analytics-filter="metric">${optionList(resultMetrics,analyticsFilter.metric)}</select></label>
      </div>
      <div id="analyticsBreakdown" class="form-grid">${analyticsBreakdown(analyticsFilter.platform,analyticsFilter.window,analyticsFilter.metric)}</div>
    </div>
    <div class="r2-section"><h3>Saved results</h3>
      ${state.performance.map(r=>`<article class="r2-result">
        <a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.topic)} · ${esc(r.platform)} · Day ${esc(r.window)}</a>
        <p class="fineprint">${resultMetrics.filter(([k])=>r.stats[k]!=null).map(([k,label])=>esc(label)+' '+num(r.stats[k])).join(' · ')}</p>
        <button class="btn btn-ghost btn-sm" data-remove-result="${esc(r.id)}">Delete entry</button>
      </article>`).join('')||'<p class="fineprint">No published performance logged yet.</p>'}
    </div>`;
}
document.addEventListener('change',e=>{
  const key=e.target.dataset.analyticsFilter;
  if(!key)return;
  analyticsFilter[key]=key==='window'?Number(e.target.value):e.target.value;
  $('#analyticsBreakdown').innerHTML=analyticsBreakdown(analyticsFilter.platform,analyticsFilter.window,analyticsFilter.metric);
});

load();
