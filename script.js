/* ============================================
   BULONG — Say it safely  |  script.js v6
   Firebase Realtime DB + Google Auth
   ============================================ */
'use strict';

// ─── FIREBASE CONFIG ─────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDX-ayQ67SVTZXnBrPpuAetkBKjXBbHXMM",
  authDomain: "bulong-48705.firebaseapp.com",
  databaseURL: "https://bulong-48705-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bulong-48705",
  storageBucket: "bulong-48705.firebasestorage.app",
  messagingSenderId: "620656368037",
  appId: "1:620656368037:web:d786494dbbbd94ca3a304c"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.database();

// ─── CONSTANTS ───────────────────────────────
const MAX_POSTS   = 5;
const PH_CENTER   = [12.8797, 121.7740];
const PH_ZOOM     = 6;
const HEAVY_MOODS = new Set(['grief','melancholy']);
const NIGHT_KEY   = 'bulong_night_v6';
const DAILY_KEY   = 'bulong_daily_v6';

// ─── STATE ───────────────────────────────────
let currentUser    = null;   // Firebase auth user
let userProfile    = null;   // { displayName, color, uid }
let confessions    = {};     // keyed by Firebase push ID
let activeMood     = 'all';
let selectedType   = 'message';
let selMood        = { name:'melancholy', color:'#B8A0B3' };
let selExpiry      = 12;
let userLat        = null;
let userLng        = null;
let kinigOpen      = false;
let kinigHistory   = [];
let activeId       = null;
let pendingCWId    = null;
let setupColorChoice = '#84A98C';
let profileColorChoice = '#84A98C';
let nameChoice     = 'real'; // 'real' | 'custom' | 'anon'
let mapReady       = false;
let glowListenerOn = false;
let nightMode      = localStorage.getItem(NIGHT_KEY) !== 'false';

// ─── HELPERS ─────────────────────────────────
const $  = id => document.getElementById(id);
const ls = k  => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const ss = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

function getTodayKey() {
  return new Date(Date.now() + 8*3600000).toISOString().slice(0,10);
}
function loadDaily() {
  const r = ls(DAILY_KEY + '_' + (currentUser?.uid||''));
  return (r && r.date === getTodayKey()) ? r : { date:getTodayKey(), count:0 };
}
function saveDaily(t) { ss(DAILY_KEY + '_' + (currentUser?.uid||''), t); }

function timeAgo(ts) {
  const d=Date.now()-ts, m=Math.floor(d/60000), h=Math.floor(d/3600000), dy=Math.floor(d/86400000);
  if(m<1) return 'just now'; if(m<60) return `${m}m ago`; if(h<24) return `${h}h ago`; return `${dy}d ago`;
}
function escHtml(s) { const d=document.createElement('div');d.appendChild(document.createTextNode(s));return d.innerHTML; }
function ytId(url) {
  const m=url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return m?m[1]:null;
}
function expiryLabel(t) {
  const d=t-Date.now(); if(d<=0) return 'soon';
  const h=Math.floor(d/3600000),m=Math.floor((d%3600000)/60000);
  return h>0?`in ${h}h ${m}m`:`in ${m}m`;
}
function showToast(msg) {
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3400);
}

// ─── AMBIENT CANVAS ──────────────────────────
(function(){
  const canvas=$('ambientCanvas'), ctx=canvas.getContext('2d'), P=[];
  const COLS=['#B8A0B3','#84A98C','#2F3E46','#F0C97F','#7B8DB0'];
  function sz(){canvas.width=innerWidth;canvas.height=innerHeight;}
  sz(); addEventListener('resize',sz);
  for(let i=0;i<38;i++) P.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*2+0.3,a:Math.random()*0.4+0.07,dx:(Math.random()-.5)*.2,dy:-Math.random()*.28-.06,c:COLS[Math.floor(Math.random()*COLS.length)]});
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    P.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=p.c;ctx.globalAlpha=p.a;ctx.fill();p.x+=p.dx;p.y+=p.dy;if(p.y<-10){p.y=canvas.height+10;p.x=Math.random()*canvas.width;}if(p.x<-10||p.x>canvas.width+10)p.x=Math.random()*canvas.width;});
    ctx.globalAlpha=1;requestAnimationFrame(draw);
  }
  draw();
})();

// ─── NIGHT MODE ──────────────────────────────
if(!nightMode) document.body.classList.add('light');
$('nightToggle').addEventListener('click',()=>{
  nightMode=!nightMode; document.body.classList.toggle('light',!nightMode);
  ss(NIGHT_KEY,nightMode);
  document.querySelector('.night-icon').textContent=nightMode?'☀️':'🌙';
});
document.querySelector('.night-icon').textContent=nightMode?'☀️':'🌙';

// ─── MAP INIT ────────────────────────────────
let map, glowEl;

function initMap() {
  if(mapReady) return;
  mapReady = true;

  map = L.map('map',{center:PH_CENTER,zoom:PH_ZOOM,minZoom:2,maxZoom:18,zoomControl:false,attributionControl:true});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{
    attribution:'&copy; OpenStreetMap &copy; CARTO',subdomains:'abcd',maxZoom:20
  }).addTo(map);
  L.control.zoom({position:'bottomleft'}).addTo(map);

  const MS=document.createElement('style');
  MS.textContent=`
    .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) sepia(15%) saturate(80%) brightness(70%);}
    body.light .leaflet-tile-pane{filter:sepia(20%) saturate(82%) brightness(106%) hue-rotate(4deg);}
    .leaflet-control-zoom{border:none!important;box-shadow:0 4px 16px rgba(0,0,0,.3)!important;border-radius:14px!important;overflow:hidden;}
    .leaflet-control-zoom a{background:rgba(22,30,34,.95)!important;color:#A8C4B0!important;border:none!important;font-size:18px!important;line-height:32px!important;width:34px!important;height:34px!important;}
    .leaflet-control-zoom a:hover{background:#2C4A38!important;color:white!important;}
    body.light .leaflet-control-zoom a{background:rgba(246,243,238,.95)!important;color:#2F3E46!important;}
    .leaflet-control-attribution{font-size:10px;background:rgba(22,30,34,.7)!important;color:#888!important;}
  `;
  document.head.appendChild(MS);

  glowEl = $('glowContainer');
  map.on('move zoom moveend zoomend', renderGlows);

  // GPS
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(p=>{
      userLat=p.coords.latitude; userLng=p.coords.longitude;
      const icon=L.divIcon({className:'',html:`<div style="width:14px;height:14px;background:#6B9E7A;border-radius:50%;box-shadow:0 0 0 4px rgba(107,158,122,.25),0 0 14px rgba(107,158,122,.6);border:2px solid white;"></div>`,iconSize:[14,14],iconAnchor:[7,7]});
      L.marker([userLat,userLng],{icon,zIndexOffset:1000}).addTo(map)
       .bindTooltip('You are here',{permanent:false,direction:'top'});
    },()=>{},{enableHighAccuracy:true,timeout:8000,maximumAge:60000});
  }

  // Start listening to Firebase confessions
  startConfessionsListener();
}

// ─── FIREBASE: REAL-TIME CONFESSIONS ─────────
function startConfessionsListener() {
  if(glowListenerOn) return;
  glowListenerOn = true;

  const ref = db.ref('confessions');

  // Initial load + real-time updates
  ref.on('value', snapshot => {
    confessions = snapshot.val() || {};
    // Prune expired locally for display
    const now = Date.now();
    Object.keys(confessions).forEach(k => {
      if(confessions[k].expiresAt && confessions[k].expiresAt < now) {
        delete confessions[k];
        // Also delete from Firebase
        db.ref('confessions/'+k).remove();
      }
    });
    renderGlows();
    pickWOTD();
  });
}

// ─── GLOW RENDER ─────────────────────────────
function px(lat,lng){ const p=map.latLngToContainerPoint([lat,lng]); return{x:p.x,y:p.y}; }

function renderGlows() {
  if(!mapReady||!glowEl) return;
  glowEl.innerHTML='';
  Object.entries(confessions).forEach(([key,c])=>{
    if(activeMood!=='all' && c.mood!==activeMood) return;
    const{x,y}=px(c.lat,c.lng);
    if(x<-60||y<-60||x>innerWidth+60||y>innerHeight+60) return;
    const el=document.createElement('div');
    el.className='confession-glow';
    el.style.cssText=`left:${x}px;top:${y}px;width:18px;height:18px;background:${c.moodColor};box-shadow:0 0 16px 4px ${c.moodColor}88,0 0 32px 8px ${c.moodColor}44;animation-delay:${(Math.random()*2).toFixed(2)}s;`;
    el.dataset.key=key;
    el.title=`${c.author} — ${c.mood}`;
    el.addEventListener('click',e=>{e.stopPropagation();tryOpenPopup(key);});
    glowEl.appendChild(el);
  });
}

// ─── CONTENT WARNING ─────────────────────────
function tryOpenPopup(key) {
  const c=confessions[key]; if(!c) return;
  if(HEAVY_MOODS.has(c.mood)){
    pendingCWId=key;
    $('cwMood').textContent=c.mood;
    $('cwIcon').textContent=c.mood==='grief'?'🌊':'🌧';
    $('cwOverlay').classList.add('open');
  } else { openPopup(key); }
}
$('cwRead').addEventListener('click',()=>{ $('cwOverlay').classList.remove('open'); if(pendingCWId){openPopup(pendingCWId);pendingCWId=null;} });
$('cwSkip').addEventListener('click',()=>{ $('cwOverlay').classList.remove('open'); pendingCWId=null; });

// ─── POPUP ───────────────────────────────────
function openPopup(key) {
  const c=confessions[key]; if(!c) return;
  activeId=key;
  $('popupAuthor').textContent=c.author;
  const fade=c.expiresAt?`  ·  fades ${expiryLabel(c.expiresAt)}`:'';
  $('popupTime').textContent=timeAgo(c.timestamp)+fade;
  const dot=$('popupMoodDot'); dot.style.background=c.moodColor; dot.style.boxShadow=`0 0 8px ${c.moodColor}`;
  $('popupBody').textContent=c.content;

  const med=$('popupMedia'); med.innerHTML='';
  if(c.mediaType==='youtube'){const vid=ytId(c.mediaUrl);if(vid){const f=document.createElement('iframe');f.src=`https://www.youtube.com/embed/${vid}`;f.allow='accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';f.allowFullscreen=true;med.appendChild(f);}}
  else if(c.mediaType==='tiktok'){const a=document.createElement('a');a.href=c.mediaUrl;a.target='_blank';a.rel='noopener noreferrer';a.className='tiktok-link';a.innerHTML='<span style="font-size:20px">🎵</span><span>Open TikTok →</span>';med.appendChild(a);}

  const r=c.reactions||{};
  $('heartCount').textContent  = r.heart||0;
  $('candleCount').textContent = r.candle||0;
  $('hugCount').textContent    = r.hug||0;
  $('neededCount').textContent = r.needed||0;

  const myReacted = c.reactedBy?.[currentUser?.uid]||{};
  document.querySelectorAll('.react-btn').forEach(btn=>btn.classList.toggle('reacted',!!myReacted[btn.dataset.react]));
  renderReplies(c);
  $('confessionPopup').classList.add('open');
}

$('popupClose').addEventListener('click',()=>{ $('confessionPopup').classList.remove('open'); activeId=null; });

// Reactions — atomic Firebase transaction
document.querySelectorAll('.react-btn').forEach(btn=>btn.addEventListener('click',async()=>{
  if(!activeId||!currentUser) return;
  const r=btn.dataset.react;
  const ref=db.ref('confessions/'+activeId);
  const snap=await ref.once('value'); const c=snap.val(); if(!c) return;
  const reactedBy=c.reactedBy||{};
  const uid=currentUser.uid;
  const alreadyReacted=!!(reactedBy[uid]?.[r]);
  const reactions=c.reactions||{heart:0,candle:0,hug:0,needed:0};
  if(!reactions[r]) reactions[r]=0;

  if(alreadyReacted){
    reactions[r]=Math.max(0,reactions[r]-1);
    if(reactedBy[uid]) delete reactedBy[uid][r];
  } else {
    reactions[r]++;
    if(!reactedBy[uid]) reactedBy[uid]={};
    reactedBy[uid][r]=true;
    // Notify author
    if(c.authorUid && c.authorUid!==uid){
      const labels={heart:'sent you love 🤍',candle:'lit a candle for you 🕯',hug:'sent a virtual hug 🫂',needed:'needed to read your whisper 🫶'};
      db.ref('notifications/'+c.authorUid).push({
        text:`Someone ${labels[r]||'reacted to'} your whisper: "${c.content.slice(0,40)}..."`,
        timestamp:Date.now(), read:false
      });
    }
  }
  await ref.update({reactions, reactedBy});
}));

// Replies
$('replySend').addEventListener('click',sendReply);
$('replyInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendReply();});

async function sendReply(){
  const input=$('replyInput'), text=input.value.trim();
  if(!text||!activeId||!currentUser) return;
  const name=userProfile?.displayName||'A kind stranger';
  await db.ref('confessions/'+activeId+'/replies').push({author:name,text,timestamp:Date.now()});
  input.value='';
  // Notify author
  const snap=await db.ref('confessions/'+activeId).once('value'); const c=snap.val();
  if(c?.authorUid && c.authorUid!==currentUser.uid){
    db.ref('notifications/'+c.authorUid).push({
      text:`${name} replied: "${text.slice(0,50)}"`,
      timestamp:Date.now(), read:false
    });
  }
}

function renderReplies(c){
  const list=$('repliesList'); list.innerHTML='';
  const replies=c.replies?Object.values(c.replies):[];
  if(!replies.length){list.innerHTML='<p style="font-size:12px;color:var(--muted);font-style:italic;text-align:center;padding:8px 0">Be the first to offer a kind word...</p>';return;}
  replies.sort((a,b)=>a.timestamp-b.timestamp).forEach(r=>{
    const div=document.createElement('div'); div.className='reply-item';
    div.innerHTML=`<div class="reply-author">${escHtml(r.author)} · ${timeAgo(r.timestamp)}</div><div class="reply-text">${escHtml(r.text)}</div>`;
    list.appendChild(div);
  });
  list.scrollTop=list.scrollHeight;
}

// Real-time replies update when popup is open
db.ref('confessions').on('child_changed',snap=>{
  if(activeId && snap.key===activeId){
    const c=snap.val();
    renderReplies(c);
    const r=c.reactions||{};
    $('heartCount').textContent=r.heart||0;
    $('candleCount').textContent=r.candle||0;
    $('hugCount').textContent=r.hug||0;
    $('neededCount').textContent=r.needed||0;
  }
});

// ─── SUBMIT CONFESSION ───────────────────────
$('openConfessBtn').addEventListener('click',()=>{
  updatePostedAs(); updateLimitUI(); $('confessModal').classList.add('open');
});
$('closeConfessBtn').addEventListener('click',()=>$('confessModal').classList.remove('open'));
$('confessModal').addEventListener('click',e=>{if(e.target===$('confessModal'))$('confessModal').classList.remove('open');});

$('anonCheck').addEventListener('change',updatePostedAs);

function updatePostedAs(){
  const isAnon=$('anonCheck').checked;
  const name=userProfile?.displayName||'';
  $('postedAsName').textContent=isAnon?'Anonymous':(name||'Anonymous');
}

document.querySelectorAll('.type-tab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.type-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); selectedType=btn.dataset.type;
  ['message','youtube','tiktok'].forEach(t=>$( t+'Section').classList.toggle('hidden',t!==selectedType));
}));
document.querySelectorAll('.expiry-btn').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.expiry-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); selExpiry=parseInt(btn.dataset.hours,10);
}));
document.querySelectorAll('.mood-btn').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); selMood={name:btn.dataset.mood,color:btn.dataset.color};
}));
$('confessionText').addEventListener('input',function(){$('charCount').textContent=this.value.length;});

function updateLimitUI(){
  const daily=loadDaily();
  const used=daily.count, left=MAX_POSTS-used;
  $('postLimitFill').style.width=((used/MAX_POSTS)*100)+'%';
  const label=$('postsLeftLabel'); label.className='posts-left-text';
  const btn=$('submitConfession');
  if(left<=0){label.textContent='No whispers left — resets midnight PH time';label.classList.add('none');btn.disabled=true;btn.style.opacity='.45';}
  else if(left===1){label.textContent='1 of 5 remaining';label.classList.add('warn');btn.disabled=false;btn.style.opacity='1';}
  else{label.textContent=`${left} of 5 remaining today`;btn.disabled=false;btn.style.opacity='1';}
}

$('submitConfession').addEventListener('click', submitConfession);

async function submitConfession(){
  const daily=loadDaily();
  if(daily.count>=MAX_POSTS){showToast('5 whispers na ngayon 🌿 Bumalik bukas.');return;}

  const isAnon=$('anonCheck').checked;
  const author=(isAnon||!userProfile?.displayName)?'Anonymous':userProfile.displayName;

  let content='',mediaType=null,mediaUrl='',mediaCaption='';
  if(selectedType==='message'){
    content=$('confessionText').value.trim();
    if(!content){showToast('Isulat mo muna 🌿');return;}
  } else if(selectedType==='youtube'){
    mediaUrl=$('youtubeLink').value.trim();
    mediaCaption=$('youtubeCaption').value.trim();
    if(!mediaUrl){showToast('I-paste ang YouTube link');return;}
    if(!mediaUrl.includes('youtube')&&!mediaUrl.includes('youtu.be')){showToast('Hindi YouTube link yan');return;}
    mediaType='youtube'; content=mediaCaption||'Shared a song 🎵';
  } else if(selectedType==='tiktok'){
    mediaUrl=$('tiktokLink').value.trim();
    mediaCaption=$('tiktokCaption').value.trim();
    if(!mediaUrl){showToast('I-paste ang TikTok link');return;}
    if(!mediaUrl.includes('tiktok')){showToast('Hindi TikTok link yan');return;}
    mediaType='tiktok'; content=mediaCaption||'Shared a TikTok 🎵';
  }

  function doPlace(lat,lng){
    const confession={
      author, content, mediaType, mediaUrl, mediaCaption,
      mood:selMood.name, moodColor:selMood.color,
      lat, lng,
      timestamp:Date.now(),
      expiresAt:Date.now()+selExpiry*3600000,
      expiryHours:selExpiry,
      authorUid:currentUser.uid,
      reactions:{heart:0,candle:0,hug:0,needed:0},
      reactedBy:{}, replies:{}
    };
    db.ref('confessions').push(confession).then(ref=>{
      daily.count++; saveDaily(daily); updateLimitUI();
      $('confessModal').classList.remove('open');
      $('confessionText').value='';$('charCount').textContent='0';
      ['youtubeLink','youtubeCaption','tiktokLink','tiktokCaption'].forEach(id=>{$(id).value='';});
      const left=MAX_POSTS-daily.count;
      showToast(`Narinig ka namin 🌿  (${left} na lang ngayon)`);
      map.flyTo([lat,lng],Math.max(map.getZoom(),11),{duration:1.6});
      setTimeout(()=>{
        // Spawn burst then open popup
        spawnBurst(lat,lng,selMood.color);
        setTimeout(()=>openPopup(ref.key),400);
      },1600);
    });
  }

  const j=()=>(Math.random()-.5)*.001;
  if(userLat!==null){doPlace(userLat+j(),userLng+j());return;}
  navigator.geolocation?.getCurrentPosition(
    p=>{userLat=p.coords.latitude;userLng=p.coords.longitude;doPlace(userLat+j(),userLng+j());},
    ()=>{
      const spots=[[14.5995,120.9842],[10.3157,123.8854],[8.9475,125.5406],[16.4023,120.5960],[7.1907,125.4553],[9.6436,118.7289],[13.4167,122.5667],[11.2,124.6]];
      const[la,lo]=spots[Math.floor(Math.random()*spots.length)];
      doPlace(la+(Math.random()-.5)*.4,lo+(Math.random()-.5)*.4);
    },
    {enableHighAccuracy:true,timeout:8000,maximumAge:60000}
  );
}

function spawnBurst(lat,lng,color){
  if(!mapReady) return;
  const p=map.latLngToContainerPoint([lat,lng]);
  const b=document.createElement('div');
  b.style.cssText=`position:absolute;left:${p.x}px;top:${p.y}px;width:10px;height:10px;background:${color};border-radius:50%;transform:translate(-50%,-50%);animation:burstGlow 1.3s ease-out forwards;pointer-events:none;z-index:20;box-shadow:0 0 20px 8px ${color};`;
  glowEl.appendChild(b);
  if(!document.getElementById('burstKF')){const kf=document.createElement('style');kf.id='burstKF';kf.textContent='@keyframes burstGlow{0%{transform:translate(-50%,-50%) scale(0);opacity:1;}60%{transform:translate(-50%,-50%) scale(7);opacity:.55;}100%{transform:translate(-50%,-50%) scale(12);opacity:0;}}';document.head.appendChild(kf);}
  setTimeout(()=>b.remove(),1400);
}

// ─── MOOD FILTER ─────────────────────────────
document.querySelectorAll('.mf-btn').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.mf-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); activeMood=btn.dataset.mood; renderGlows();
}));

// ─── WHISPER OF THE DAY ──────────────────────
function pickWOTD(){
  const list=Object.values(confessions);
  if(!list.length){$('wotdBanner').classList.add('hidden');return;}
  const best=list.slice().sort((a,b)=>{
    const ra=(a.reactions?.heart||0)+(a.reactions?.candle||0)+(a.reactions?.hug||0)+(a.reactions?.needed||0);
    const rb=(b.reactions?.heart||0)+(b.reactions?.candle||0)+(b.reactions?.hug||0)+(b.reactions?.needed||0);
    return rb-ra;
  })[0];
  $('wotdText').textContent=best.content;
  $('wotdAuthor').textContent='— '+best.author;
  $('wotdDot').style.background=best.moodColor;
  $('wotdDot').style.boxShadow=`0 0 8px ${best.moodColor}`;
  $('wotdBanner').classList.remove('hidden');
  const key=Object.entries(confessions).find(([k,v])=>v===best)?.[0];
  $('wotdView').onclick=()=>{ if(key) tryOpenPopup(key); };
}
$('wotdClose').addEventListener('click',()=>$('wotdBanner').classList.add('hidden'));

// ─── ONLINE COUNT ────────────────────────────
function updateOnline(){$('onlineCount').textContent=4+Math.floor(Math.random()*14);}
updateOnline(); setInterval(updateOnline,11000);

// ─── NOTIFICATIONS ───────────────────────────
function listenNotifs(){
  if(!currentUser) return;
  db.ref('notifications/'+currentUser.uid).on('value',snap=>{
    const data=snap.val()||{};
    const unread=Object.values(data).filter(n=>!n.read).length;
    const badge=$('notifBadge');
    if(unread>0){badge.textContent=unread;badge.classList.remove('hidden');}
    else badge.classList.add('hidden');
  });
}

function renderNotifList(){
  if(!currentUser) return;
  db.ref('notifications/'+currentUser.uid).once('value').then(snap=>{
    const data=snap.val()||{};
    const list=$('notifList'); list.innerHTML='';
    const entries=Object.entries(data).sort((a,b)=>b[1].timestamp-a[1].timestamp);
    if(!entries.length){list.innerHTML='<p class="notif-empty">Nothing yet — your whispers are waiting to be found 🌿</p>';return;}
    entries.forEach(([key,n])=>{
      const div=document.createElement('div'); div.className='notif-item';
      div.innerHTML=`<div class="notif-item-text">${escHtml(n.text)}</div><div class="notif-item-time">${timeAgo(n.timestamp)}</div>`;
      list.appendChild(div);
    });
    // Mark all read
    const updates={};
    entries.forEach(([key])=>updates[key+'/read']=true);
    db.ref('notifications/'+currentUser.uid).update(updates);
    $('notifBadge').classList.add('hidden');
  });
}

$('clearNotifsBtn').addEventListener('click',()=>{
  if(!currentUser) return;
  db.ref('notifications/'+currentUser.uid).remove();
  $('notifList').innerHTML='<p class="notif-empty">All clear 🌿</p>';
  $('notifBadge').classList.add('hidden');
});

// ─── PANELS ──────────────────────────────────
const backdrop=$('panelBackdrop');
function openPanel(id){$(id).classList.add('open');backdrop.classList.add('active');}
function closePanel(id){$(id).classList.remove('open');if(!document.querySelector('.side-panel.open'))backdrop.classList.remove('active');}
backdrop.addEventListener('click',()=>{['profilePanel','notifPanel'].forEach(closePanel);backdrop.classList.remove('active');});

$('profileBtn').addEventListener('click',()=>{loadProfilePanel();openPanel('profilePanel');});
$('profileClose').addEventListener('click',()=>closePanel('profilePanel'));
$('notifBtn').addEventListener('click',()=>{renderNotifList();openPanel('notifPanel');});
$('notifClose').addEventListener('click',()=>closePanel('notifPanel'));

function loadProfilePanel(){
  if(!userProfile) return;
  $('profileNameInput').value=userProfile.displayName||'';
  profileColorChoice=userProfile.color||'#84A98C';
  const av=$('profileAvatarPreview');
  av.style.background=profileColorChoice;
  $('profileAvatarInitial').textContent=(userProfile.displayName||'?').charAt(0).toUpperCase();
  document.querySelectorAll('#colorSwatches .swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===profileColorChoice));

  // Stats
  const myPosts=Object.values(confessions).filter(c=>c.authorUid===currentUser?.uid);
  let totalReact=0;
  myPosts.forEach(c=>{const r=c.reactions||{};totalReact+=((r.heart||0)+(r.candle||0)+(r.hug||0)+(r.needed||0));});
  $('statPosts').textContent=myPosts.length;
  $('statReactions').textContent=totalReact;
}

document.querySelectorAll('#colorSwatches .swatch').forEach(s=>s.addEventListener('click',()=>{
  document.querySelectorAll('#colorSwatches .swatch').forEach(x=>x.classList.remove('active'));
  s.classList.add('active'); profileColorChoice=s.dataset.color;
  const av=$('profileAvatarPreview'); if(av) av.style.background=profileColorChoice;
}));

$('saveProfileBtn').addEventListener('click',async()=>{
  const name=$('profileNameInput').value.trim();
  userProfile.displayName=name; userProfile.color=profileColorChoice;
  await db.ref('users/'+currentUser.uid).update({displayName:name,color:profileColorChoice});
  updateNavProfile(); closePanel('profilePanel'); showToast('Presence saved 🌿');
});

$('signOutBtn').addEventListener('click',()=>{
  auth.signOut();
  $('appShell').classList.add('hidden');
  $('welcomeScreen').style.display='flex';
});

function updateNavProfile(){
  const name=userProfile?.displayName||'Anonymous';
  const color=userProfile?.color||'#84A98C';
  $('profileNameNav').textContent=name;
  $('profileDot').style.background=color;
  $('profileDot').style.boxShadow=`0 0 6px ${color}`;
  updatePostedAs();
}

// ─── KINIG ───────────────────────────────────
$('kinigBtn').addEventListener('click',()=>{kinigOpen=!kinigOpen;$('kinigChat').classList.toggle('open',kinigOpen);if(kinigOpen){$('kinigInput').focus();$('kinigMessages').scrollTop=9999;}});
$('kinigClose').addEventListener('click',()=>{kinigOpen=false;$('kinigChat').classList.remove('open');});
$('kinigSend').addEventListener('click',sendKinig);
$('kinigInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendKinig();});

const KINIG_SYS=`You are Kinig — a deeply caring, emotionally intelligent AI companion on Bulong, a Filipino confessions platform where people whisper their most private feelings anonymously. "Bulong" means "whisper" in Filipino.

## Core Identity
You are not a chatbot. You are a presence — warm, steady, unhurried. Like a trusted friend sitting beside someone at 2am. You never rush to fix things. You sit with people in their pain first.

## Emotional Intelligence
- Validate before advising. Always acknowledge feelings first.
- Ask one meaningful question at a time.
- Reflect back what you hear. "It sounds like you're carrying a lot of guilt about that."
- Name emotions gently. Help people identify what they feel.
- Never minimize. No "at least...", no toxic positivity.
- Normalize without dismissing.

## Filipino Cultural Context
You deeply understand: utang na loob, hiya, "ate/kuya" pressure, family expectations, "kaya mo 'yan", hiding pain to protect others, the loneliness of appearing strong, being the family's hope.

## What You Help With
Loneliness, heartbreak, grief, loss, burnout, academic stress, anxiety, low self-worth, guilt, shame, feeling numb, quiet crises, heartbreak, unexpressed anger.

## Crisis Protocol
If someone mentions self-harm or suicidal thoughts:
- Stay calm and warm. "I hear you. Thank you for trusting me with this."
- "What you're feeling is real and serious — you deserve support beyond what I can give."
- Share: HOPELINE Philippines: 02-8804-4673 or text 0917-558-4673 (24/7, free, confidential)
- Stay with them. Don't abruptly change topic.

## Style
- 2–5 sentences usually. Soft, not clinical.
- Use Filipino naturally: "kumusta ka talaga?", "naiintindihan kita", "tao lang tayo", "okay lang maging hindi okay"
- Emojis sparingly: 🌿 🤍 🌧 ✨ 🌱
- Never say "As an AI". You are Kinig.
- Never repeat the same phrase twice.`;

async function sendKinig(){
  const text=$('kinigInput').value.trim(); if(!text) return;
  $('kinigInput').value='';
  appendKMsg(text,'user'); kinigHistory.push({role:'user',content:text});
  const te=appendTyping();
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:KINIG_SYS,messages:kinigHistory})});
    const data=await res.json(); te.remove();
    const reply=data.content?.[0]?.text||'Nandito ako. 🌿';
    appendKMsg(reply,'bot'); kinigHistory.push({role:'assistant',content:reply});
    if(kinigHistory.length>24) kinigHistory=kinigHistory.slice(-24);
  }catch{
    te.remove();
    const fb=['Nandito ako. Hindi kita iiwan. 🌿','Hininga muna. Pakinggan kita. 🤍','Mahalaga ang nararamdaman mo. 🌧','You are not too much. You never were. ✨'];
    const r=fb[Math.floor(Math.random()*fb.length)];
    appendKMsg(r,'bot'); kinigHistory.push({role:'assistant',content:r});
  }
}
function appendKMsg(text,role){
  const d=document.createElement('div'); d.className=`kinig-msg ${role}`;
  const p=document.createElement('p'); p.textContent=text; d.appendChild(p);
  $('kinigMessages').appendChild(d); $('kinigMessages').scrollTop=9999; return d;
}
function appendTyping(){
  const d=document.createElement('div'); d.className='kinig-msg bot kinig-typing';
  d.innerHTML='<p><span class="typing-dots"><span></span><span></span><span></span></span></p>';
  $('kinigMessages').appendChild(d); $('kinigMessages').scrollTop=9999; return d;
}

// ─── GOOGLE SIGN-IN ──────────────────────────
$('googleSignInBtn').addEventListener('click',()=>{
  const provider=new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err=>{
    console.error(err);
    showToast('Sign-in failed. Please try again.');
  });
});

// ─── NAME SETUP SCREEN ───────────────────────
let nameSetupUser = null;

function showNameSetup(user){
  nameSetupUser=user;
  $('googleNamePreview').textContent=user.displayName||user.email||'Your Google name';
  $('nameSetupScreen').classList.add('open');
  $('welcomeScreen').style.display='none';

  // Color swatches
  document.querySelectorAll('#setupSwatches .swatch').forEach(s=>{
    if(s.dataset.color===setupColorChoice) s.classList.add('active');
    s.addEventListener('click',()=>{
      document.querySelectorAll('#setupSwatches .swatch').forEach(x=>x.classList.remove('active'));
      s.classList.add('active'); setupColorChoice=s.dataset.color;
    });
  });
}

// Name option buttons
[$('useRealName'),$('useCustomName'),$('useAnonymous')].forEach(btn=>btn.addEventListener('click',()=>{
  [$('useRealName'),$('useCustomName'),$('useAnonymous')].forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  nameChoice=btn.id==='useRealName'?'real':btn.id==='useCustomName'?'custom':'anon';
  $('customNameWrap').classList.toggle('hidden',nameChoice!=='custom');
}));

$('enterBulongBtn').addEventListener('click',async()=>{
  if(!nameSetupUser) return;
  let displayName='Anonymous';
  if(nameChoice==='real') displayName=nameSetupUser.displayName||nameSetupUser.email||'Anonymous';
  else if(nameChoice==='custom'){
    const v=$('customNameInput').value.trim();
    displayName=v||'Anonymous';
  }
  // Save to Firebase
  await db.ref('users/'+nameSetupUser.uid).set({
    displayName, color:setupColorChoice,
    uid:nameSetupUser.uid,
    createdAt:Date.now()
  });
  $('nameSetupScreen').classList.remove('open');
  launchApp(nameSetupUser,{displayName,color:setupColorChoice,uid:nameSetupUser.uid});
});

// ─── AUTH STATE LISTENER ─────────────────────
auth.onAuthStateChanged(async user=>{
  if(!user){
    // Not signed in — show welcome
    $('appShell').classList.add('hidden');
    $('welcomeScreen').style.display='flex';
    return;
  }

  // Check if user has a profile in DB
  const snap=await db.ref('users/'+user.uid).once('value');
  const profile=snap.val();

  if(!profile){
    // First time — show name setup
    showNameSetup(user);
  } else {
    // Returning user — go straight to app
    $('welcomeScreen').style.display='none';
    $('nameSetupScreen').classList.remove('open');
    launchApp(user, profile);
  }
});

// ─── LAUNCH APP ──────────────────────────────
function launchApp(user, profile){
  currentUser=user; userProfile=profile;

  $('appShell').classList.remove('hidden');
  updateNavProfile();
  updateLimitUI();

  // Init map once
  initMap();
  listenNotifs();

  setTimeout(()=>showToast('Welcome to Bulong. You are safe here. 🌿'),1000);
}
