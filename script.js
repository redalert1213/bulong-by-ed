/* ============================================
   BULONG — script.js v7
   Firebase + Google Auth + Photo/Video Upload
   + Dashboard + Safety + Reflection Prompts
   + Emotional Map pulse
   ============================================ */
'use strict';

// ── FIREBASE CONFIG ───────────────────────────
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
const auth    = firebase.auth();
const db      = firebase.database();
const storage = firebase.storage();

// ── CONSTANTS ─────────────────────────────────
const MAX_POSTS    = 5;
const MAX_VID_SECS = 20;
const MAX_PHOTO_MB = 50;
const PH_CENTER    = [12.8797, 121.7740];
const PH_ZOOM      = 6;
const HEAVY_MOODS  = new Set(['grief','melancholy']);
const NIGHT_KEY    = 'bulong_night_v7';
const DAILY_KEY    = 'bulong_daily_v7';

const REFLECTION_PROMPTS = [
  "What's weighing on you that you haven't said out loud yet?",
  "If this feeling had a color, what would it be?",
  "What do you wish someone would say to you right now?",
  "When did you last feel truly heard?",
  "What would you tell a friend who was feeling exactly this?",
  "What are you carrying that isn't yours to carry?",
  "What would relief look like for you today?",
  "If you could whisper one thing to the world, what would it be?",
  "What's the thing you keep almost saying?",
  "What does your heart need right now that your mind won't let you ask for?",
  "Who would you be if no one was watching?",
  "What are you afraid to admit is true?",
];

const MOOD_META = {
  melancholy:{ color:'#B8A0B3', emoji:'🌧' },
  longing:   { color:'#84A98C', emoji:'🌿' },
  relief:    { color:'#A8C4A2', emoji:'🌱' },
  love:      { color:'#E8A5B0', emoji:'🌸' },
  grief:     { color:'#7B8DB0', emoji:'🌊' },
  hope:      { color:'#F0C97F', emoji:'✨' },
};

// ── STATE ─────────────────────────────────────
let currentUser      = null;
let userProfile      = null;
let confessions      = {};
let activeMood       = 'all';
let selectedType     = 'message';
let selMood          = { name:'melancholy', color:'#B8A0B3' };
let selExpiry        = 12;
let userLat          = null;
let userLng          = null;
let kinigOpen        = false;
let kinigHistory     = [];
let activeId         = null;
let pendingCWId      = null;
let setupColorChoice = '#84A98C';
let profileColorChoice = '#84A98C';
let nameChoice       = 'real';
let mapReady         = false;
let glowListenerOn   = false;
let nightMode        = localStorage.getItem(NIGHT_KEY) !== 'false';
let videoEl          = null;
let photoBlobUrl     = null;
let videoFile        = null;
let videoStartSec    = 0;

// ── HELPERS ───────────────────────────────────
const $   = id => document.getElementById(id);
const ls  = k  => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const ss  = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };

function getTodayKey(){ return new Date(Date.now()+8*3600000).toISOString().slice(0,10); }
function loadDaily(){ const r=ls(DAILY_KEY+'_'+(currentUser?.uid||'')); return (r&&r.date===getTodayKey())?r:{date:getTodayKey(),count:0}; }
function saveDaily(t){ ss(DAILY_KEY+'_'+(currentUser?.uid||''),t); }

function timeAgo(ts){
  const d=Date.now()-ts,m=Math.floor(d/60000),h=Math.floor(d/3600000),dy=Math.floor(d/86400000);
  if(m<1) return 'just now'; if(m<60) return `${m}m ago`; if(h<24) return `${h}h ago`; return `${dy}d ago`;
}
function escHtml(s){ const d=document.createElement('div');d.appendChild(document.createTextNode(s));return d.innerHTML; }
function ytId(url){ const m=url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/); return m?m[1]:null; }
function expiryLabel(t){ const d=t-Date.now();if(d<=0)return 'soon';const h=Math.floor(d/3600000),m=Math.floor((d%3600000)/60000);return h>0?`in ${h}h ${m}m`:`in ${m}m`; }
function showToast(msg){ const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3400); }
function totalReacts(c){ const r=c.reactions||{}; return (r.heart||0)+(r.candle||0)+(r.hug||0)+(r.needed||0); }

// ── AMBIENT PARTICLES (orbs + wisps) ─────────
(function(){
  const canvas=$('ambientCanvas'),ctx=canvas.getContext('2d');
  let P=[];
  const COLS=['#B8A0B3','#84A98C','#C9A8C4','#F0C97F','#7B8DB0','#A8C4A2','#E8A5B0'];
  function sz(){canvas.width=innerWidth;canvas.height=innerHeight;initP();}
  function initP(){
    P=[];
    for(let i=0;i<10;i++) P.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*90+40,maxA:Math.random()*0.032+0.006,a:0,dx:(Math.random()-.5)*.1,dy:(Math.random()-.5)*.07,c:COLS[~~(Math.random()*COLS.length)],type:'orb',phase:Math.random()*Math.PI*2});
    for(let i=0;i<18;i++) P.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*3.5+1.2,a:Math.random()*0.14+0.03,dx:(Math.random()-.5)*.15,dy:-(Math.random()*.15+0.03),c:COLS[~~(Math.random()*COLS.length)],type:'wisp',wb:Math.random()*Math.PI*2,wbs:Math.random()*0.018+0.004});
  }
  sz();addEventListener('resize',sz);
  let t=0;
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);t+=0.01;
    P.forEach(p=>{
      if(p.type==='orb'){
        p.a=p.maxA*(0.5+0.5*Math.sin(t*0.35+p.phase));
        const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
        g.addColorStop(0,p.c+'55');g.addColorStop(1,p.c+'00');
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=g;ctx.globalAlpha=p.a;ctx.fill();
        p.x+=p.dx;p.y+=p.dy;
        if(p.x<-p.r||p.x>innerWidth+p.r)p.dx*=-1;
        if(p.y<-p.r||p.y>innerHeight+p.r)p.dy*=-1;
      } else {
        p.wb+=p.wbs;
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=p.c;ctx.globalAlpha=p.a*(0.5+0.5*Math.sin(p.wb));ctx.fill();
        p.x+=p.dx+Math.sin(p.wb)*0.22;p.y+=p.dy;
        if(p.y<-10){p.y=innerHeight+10;p.x=Math.random()*innerWidth;}
        if(p.x<-10||p.x>innerWidth+10)p.x=Math.random()*innerWidth;
      }
    });
    ctx.globalAlpha=1;requestAnimationFrame(draw);
  }
  draw();
})();

// ── CONSTELLATION CANVAS ──────────────────────
(function(){
  const canvas=$('constellationCanvas');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  let stars=[];
  const STAR_COLS=['#84A98C','#C9A8C4','#B8A0B3','#F0C97F','#A8C4A2','#9FB4C7'];
  const MAX_DIST=130;

  function sz(){
    canvas.width=innerWidth;
    canvas.height=innerHeight-94;
  }
  sz();addEventListener('resize',sz);

  function initStars(){
    stars=[];
    const count=Math.floor((innerWidth*innerHeight)/14000);
    for(let i=0;i<count;i++) stars.push({
      x:Math.random()*canvas.width,
      y:Math.random()*canvas.height,
      r:Math.random()*1.4+0.3,
      a:Math.random()*0.7+0.15,
      dx:(Math.random()-.5)*0.18,
      dy:(Math.random()-.5)*0.12,
      c:STAR_COLS[~~(Math.random()*STAR_COLS.length)],
      tw:Math.random()*Math.PI*2,
      tws:Math.random()*0.025+0.008
    });
  }
  initStars();addEventListener('resize',initStars);

  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // Draw connections
    for(let i=0;i<stars.length;i++){
      for(let j=i+1;j<stars.length;j++){
        const dx=stars[i].x-stars[j].x,dy=stars[i].y-stars[j].y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<MAX_DIST){
          const al=(1-dist/MAX_DIST)*0.18;
          ctx.beginPath();
          ctx.moveTo(stars[i].x,stars[i].y);
          ctx.lineTo(stars[j].x,stars[j].y);
          ctx.strokeStyle=stars[i].c;
          ctx.globalAlpha=al;
          ctx.lineWidth=0.5;
          ctx.stroke();
        }
      }
    }

    // Draw stars
    stars.forEach(s=>{
      s.tw+=s.tws;
      const al=s.a*(0.5+0.5*Math.sin(s.tw));
      // Star glow
      const g=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,s.r*3);
      g.addColorStop(0,s.c+'88');g.addColorStop(1,s.c+'00');
      ctx.beginPath();ctx.arc(s.x,s.y,s.r*3,0,Math.PI*2);ctx.fillStyle=g;ctx.globalAlpha=al*0.35;ctx.fill();
      // Star core
      ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fillStyle=s.c;ctx.globalAlpha=al;ctx.fill();
      // Star cross sparkle
      ctx.globalAlpha=al*0.5;ctx.strokeStyle=s.c;ctx.lineWidth=0.5;
      ctx.beginPath();ctx.moveTo(s.x-s.r*2.2,s.y);ctx.lineTo(s.x+s.r*2.2,s.y);ctx.stroke();
      ctx.beginPath();ctx.moveTo(s.x,s.y-s.r*2.2);ctx.lineTo(s.x,s.y+s.r*2.2);ctx.stroke();
      // Move
      s.x+=s.dx;s.y+=s.dy;
      if(s.x<0||s.x>canvas.width)s.dx*=-1;
      if(s.y<0||s.y>canvas.height)s.dy*=-1;
    });

    ctx.globalAlpha=1;
    requestAnimationFrame(draw);
  }
  draw();
})();

// ── SOUND ENGINE ─────────────────────────────
const Sound=(function(){
  let actx=null,unlocked=false;
  function init(){if(actx)return;try{actx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){}}
  function unlock(){if(unlocked)return;init();if(actx&&actx.state==='suspended')actx.resume();unlocked=true;}
  document.addEventListener('click',unlock,{once:true});
  document.addEventListener('touchstart',unlock,{once:true});
  function tone(freq,type,vol,attack,decay,delay=0){
    if(!actx||!unlocked)return;
    try{
      const o=actx.createOscillator(),g=actx.createGain(),rev=actx.createGain();
      o.connect(g);g.connect(rev);rev.connect(actx.destination);
      o.type=type;o.frequency.value=freq;
      const now=actx.currentTime+delay;
      g.gain.setValueAtTime(0,now);
      g.gain.linearRampToValueAtTime(vol,now+attack);
      g.gain.exponentialRampToValueAtTime(0.0001,now+attack+decay);
      o.start(now);o.stop(now+attack+decay+0.05);
    }catch(e){}
  }
  return{
    click(){tone(880,'sine',0.04,0.008,0.14);},
    whisper(){tone(523,'sine',0.06,0.01,0.35);tone(659,'sine',0.04,0.01,0.35,0.14);tone(784,'sine',0.035,0.01,0.45,0.26);},
    welcome(){tone(392,'sine',0.04,0.02,0.55);tone(523,'sine',0.04,0.02,0.55,0.2);tone(659,'sine',0.035,0.02,0.65,0.36);},
    react(){tone(1046,'sine',0.035,0.005,0.12);},
    panel(){tone(330,'sine',0.025,0.008,0.18);},
    notif(){tone(698,'sine',0.035,0.008,0.1);tone(880,'sine',0.025,0.008,0.1,0.11);},
  };
})();

// ── CLICK RIPPLE ─────────────────────────────
(function(){
  const rc=document.createElement('div');
  rc.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:99999;overflow:hidden;';
  document.body.appendChild(rc);
  const ks=document.createElement('style');
  ks.textContent='@keyframes rippleOut{0%{transform:scale(0);opacity:0.75;}100%{transform:scale(3.8);opacity:0;}}';
  document.head.appendChild(ks);
  document.addEventListener('click',e=>{
    const r=document.createElement('div');
    r.style.cssText=`position:absolute;left:${e.clientX-20}px;top:${e.clientY-20}px;width:40px;height:40px;border-radius:50%;border:1.5px solid rgba(132,169,140,0.55);pointer-events:none;animation:rippleOut 0.5s ease-out forwards;`;
    rc.appendChild(r);setTimeout(()=>r.remove(),520);
  });
})();

// ── PAGE TRANSITIONS ─────────────────────────
function fadeOut(el,cb){
  if(!el){if(cb)cb();return;}
  el.style.transition='opacity 0.42s ease,transform 0.42s ease';
  el.style.opacity='0';el.style.transform='translateY(-10px) scale(0.98)';
  setTimeout(()=>{el.style.display='none';if(cb)cb();},440);
}
function fadeIn(el){
  if(!el)return;
  el.style.opacity='0';el.style.transform='translateY(12px) scale(0.99)';el.style.transition='none';
  el.style.display='flex';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    el.style.transition='opacity 0.48s ease,transform 0.48s ease';
    el.style.opacity='1';el.style.transform='translateY(0) scale(1)';
  }));
}

// ── NIGHT MODE ────────────────────────────────
if(!nightMode) document.body.classList.add('light');
$('nightToggle').addEventListener('click',()=>{
  nightMode=!nightMode;document.body.classList.toggle('light',!nightMode);
  ss(NIGHT_KEY,nightMode);
  document.querySelector('.night-icon').textContent=nightMode?'☀️':'🌙';
});
document.querySelector('.night-icon').textContent=nightMode?'☀️':'🌙';

// ── REFLECTION PROMPTS ────────────────────────
let promptIdx = Math.floor(Math.random()*REFLECTION_PROMPTS.length);
function showPrompt(){
  $('reflectionText').textContent = REFLECTION_PROMPTS[promptIdx];
  promptIdx = (promptIdx+1) % REFLECTION_PROMPTS.length;
}
$('reflectionShuffle').addEventListener('click',()=>{
  $('reflectionShuffle').style.transform='rotate(360deg)';
  setTimeout(()=>$('reflectionShuffle').style.transform='',400);
  showPrompt();
});

// ── MAP INIT ──────────────────────────────────
let map, glowEl;

function initMap(){
  if(mapReady) return;
  mapReady=true;
  map=L.map('map',{center:PH_CENTER,zoom:PH_ZOOM,minZoom:2,maxZoom:18,zoomControl:false,attributionControl:true});
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
  glowEl=$('glowContainer');
  map.on('move zoom moveend zoomend',renderGlows);

  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(p=>{
      userLat=p.coords.latitude;userLng=p.coords.longitude;
      const icon=L.divIcon({className:'',html:`<div style="width:14px;height:14px;background:#6B9E7A;border-radius:50%;box-shadow:0 0 0 4px rgba(107,158,122,.25),0 0 14px rgba(107,158,122,.6);border:2px solid white;"></div>`,iconSize:[14,14],iconAnchor:[7,7]});
      L.marker([userLat,userLng],{icon,zIndexOffset:1000}).addTo(map).bindTooltip('You are here',{permanent:false,direction:'top'});
    },()=>{},{enableHighAccuracy:true,timeout:8000,maximumAge:60000});
  }
  startConfessionsListener();
}

// ── FIREBASE LISTENER ─────────────────────────
function startConfessionsListener(){
  if(glowListenerOn) return;
  glowListenerOn=true;
  db.ref('confessions').on('value',snap=>{
    confessions=snap.val()||{};
    const now=Date.now();
    Object.keys(confessions).forEach(k=>{
      if(confessions[k].expiresAt&&confessions[k].expiresAt<now){
        delete confessions[k];
        db.ref('confessions/'+k).remove();
      }
    });
    renderGlows();
    pickWOTD();
    updateMoodCounter();
  });
}

// ── MOOD LIVE COUNTER ─────────────────────────
function updateMoodCounter(){
  const mlcList=$('mlcList');if(!mlcList)return;
  const counts={};
  Object.values(confessions).forEach(c=>{
    if(c.mood) counts[c.mood]=(counts[c.mood]||0)+1;
  });
  const total=Object.values(counts).reduce((a,b)=>a+b,0)||1;
  const sorted=Object.entries(MOOD_META).map(([mood,meta])=>({mood,meta,count:counts[mood]||0})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);
  if(!sorted.length){mlcList.innerHTML='<div style="font-size:11px;color:var(--muted);font-style:italic">No whispers yet 🌿</div>';return;}
  mlcList.innerHTML='';
  sorted.forEach(({mood,meta,count})=>{
    const pct=Math.round((count/total)*100);
    mlcList.innerHTML+=`<div class="mlc-row"><div class="mlc-dot" style="background:${meta.color};box-shadow:0 0 4px ${meta.color}88"></div><span class="mlc-mood">${meta.emoji} ${mood}</span><span class="mlc-count">${count}</span></div><div class="mlc-bar" style="width:${pct}%;background:${meta.color};opacity:0.35;margin-bottom:3px;"></div>`;
  });
}

// ── EMOTIONAL MAP GLOWS ───────────────────────
function px(lat,lng){ const p=map.latLngToContainerPoint([lat,lng]);return{x:p.x,y:p.y}; }

function renderGlows(){
  if(!mapReady||!glowEl) return;
  glowEl.innerHTML='';
  Object.entries(confessions).forEach(([key,c])=>{
    if(activeMood!=='all'&&c.mood!==activeMood) return;
    const{x,y}=px(c.lat,c.lng);
    if(x<-60||y<-60||x>innerWidth+60||y>innerHeight+60) return;
    // Size based on reactions — more reactions = slightly bigger glow
    const reacts=totalReacts(c);
    const sz=16+Math.min(reacts*1.5,14);
    const el=document.createElement('div');
    el.className='confession-glow';
    el.style.cssText=`left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;background:${c.moodColor};box-shadow:0 0 ${sz}px ${sz/2}px ${c.moodColor}88,0 0 ${sz*2}px ${sz}px ${c.moodColor}33;animation-delay:${(Math.random()*2).toFixed(2)}s;`;
    el.dataset.key=key;
    el.addEventListener('click',e=>{e.stopPropagation();tryOpenPopup(key);});
    glowEl.appendChild(el);
  });
}

// ── MOOD FILTER ───────────────────────────────
document.querySelectorAll('.mf-btn').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.mf-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');activeMood=btn.dataset.mood;renderGlows();
}));

// ── WHISPER OF THE DAY ────────────────────────
function pickWOTD(){
  const list=Object.values(confessions);
  if(!list.length){$('wotdBanner').classList.add('hidden');return;}
  const best=list.slice().sort((a,b)=>totalReacts(b)-totalReacts(a))[0];
  $('wotdText').textContent=best.content||'📷 Photo whisper';
  $('wotdAuthor').textContent='— '+best.author;
  $('wotdDot').style.background=best.moodColor;
  $('wotdDot').style.boxShadow=`0 0 8px ${best.moodColor}`;
  $('wotdBanner').classList.remove('hidden');
  const key=Object.entries(confessions).find(([k,v])=>v===best)?.[0];
  $('wotdView').onclick=()=>{if(key)tryOpenPopup(key);};
}
$('wotdClose').addEventListener('click',()=>$('wotdBanner').classList.add('hidden'));

// ── CONTENT WARNING ───────────────────────────
function tryOpenPopup(key){
  const c=confessions[key];if(!c)return;
  if(HEAVY_MOODS.has(c.mood)){
    pendingCWId=key;
    $('cwMood').textContent=c.mood;
    $('cwIcon').textContent=c.mood==='grief'?'🌊':'🌧';
    $('cwOverlay').classList.add('open');
  } else { openPopup(key); }
}
$('cwRead').addEventListener('click',()=>{$('cwOverlay').classList.remove('open');if(pendingCWId){openPopup(pendingCWId);pendingCWId=null;}});
$('cwSkip').addEventListener('click',()=>{$('cwOverlay').classList.remove('open');pendingCWId=null;});

// ── POPUP ─────────────────────────────────────
function openPopup(key){
  const c=confessions[key];if(!c)return;
  activeId=key;
  $('popupAuthor').textContent=c.author;
  const fade=c.expiresAt?`  ·  fades ${expiryLabel(c.expiresAt)}`:'';
  $('popupTime').textContent=timeAgo(c.timestamp)+fade;
  const dot=$('popupMoodDot');dot.style.background=c.moodColor;dot.style.boxShadow=`0 0 8px ${c.moodColor}`;
  $('popupBody').textContent=c.content||'';
  const med=$('popupMedia');med.innerHTML='';
  if(c.mediaType==='photo'&&c.mediaUrl){
    const img=document.createElement('img');img.src=c.mediaUrl;img.alt='Whisper photo';med.appendChild(img);
  } else if(c.mediaType==='video'&&c.mediaUrl){
    const vid=document.createElement('video');vid.src=c.mediaUrl;vid.controls=true;vid.muted=false;vid.playsInline=true;med.appendChild(vid);
  } else if(c.mediaType==='youtube'){
    const vid=ytId(c.mediaUrl);
    if(vid){const f=document.createElement('iframe');f.src=`https://www.youtube.com/embed/${vid}`;f.allow='accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';f.allowFullscreen=true;med.appendChild(f);}
  } else if(c.mediaType==='tiktok'){
    const a=document.createElement('a');a.href=c.mediaUrl;a.target='_blank';a.rel='noopener noreferrer';a.className='tiktok-link';a.innerHTML='<span style="font-size:20px">🎵</span><span>Open TikTok →</span>';med.appendChild(a);
  } else if(c.mediaType==='voice'){
    const au=document.createElement('audio');au.src=c.mediaUrl;au.controls=true;au.style.cssText='width:100%;border-radius:8px;margin:8px 0;';med.appendChild(au);
  } else if(c.mediaType==='doodle'){
    const img=document.createElement('img');img.src=c.mediaUrl;img.alt='Doodle whisper';img.style.cssText='width:100%;border-radius:10px;';med.appendChild(img);
  }
  const r=c.reactions||{};
  $('heartCount').textContent=r.heart||0;$('candleCount').textContent=r.candle||0;$('hugCount').textContent=r.hug||0;$('neededCount').textContent=r.needed||0;
  const myReacted=c.reactedBy?.[currentUser?.uid]||{};
  document.querySelectorAll('.react-btn:not(.delete-btn)').forEach(btn=>btn.classList.toggle('reacted',!!myReacted[btn.dataset.react]));
  // Show delete button only if this is the user's own whisper
  const deleteBtn=$('deleteWhisperBtn');
  if(c.authorUid&&currentUser&&c.authorUid===currentUser.uid){
    deleteBtn.classList.remove('hidden');
  } else {
    deleteBtn.classList.add('hidden');
  }
  renderReplies(c);
  $('confessionPopup').classList.add('open');
}
$('popupClose').addEventListener('click',()=>{$('confessionPopup').classList.remove('open');activeId=null;});

// Delete whisper
$('deleteWhisperBtn').addEventListener('click',async()=>{
  if(!activeId||!currentUser)return;
  const c=confessions[activeId];
  if(!c||c.authorUid!==currentUser.uid)return;
  if(!confirm('Delete this whisper? This cannot be undone.'))return;
  await db.ref('confessions/'+activeId).remove();
  // Refund daily count
  const daily=loadDaily();
  if(daily.count>0){daily.count--;saveDaily(daily);}
  $('confessionPopup').classList.remove('open');
  activeId=null;
  updateLimitUI();
  showToast('Whisper deleted. Daily count returned. 🌿');
});

// Reactions
document.querySelectorAll('.react-btn').forEach(btn=>btn.addEventListener('click',async()=>{
  if(!activeId||!currentUser)return;
  const r=btn.dataset.react;
  const ref=db.ref('confessions/'+activeId);
  const snap=await ref.once('value');const c=snap.val();if(!c)return;
  const reactedBy=c.reactedBy||{},uid=currentUser.uid;
  const already=!!(reactedBy[uid]?.[r]);
  const reactions=c.reactions||{heart:0,candle:0,hug:0,needed:0};
  if(!reactions[r])reactions[r]=0;
  if(already){reactions[r]=Math.max(0,reactions[r]-1);if(reactedBy[uid])delete reactedBy[uid][r];}
  else{
    reactions[r]++;Sound.react();
    if(!reactedBy[uid])reactedBy[uid]={};
    reactedBy[uid][r]=true;
    if(c.authorUid&&c.authorUid!==uid){
      const labels={heart:'sent you love 🤍',candle:'lit a candle 🕯',hug:'sent a virtual hug 🫂',needed:'needed to read your whisper 🫶'};
      db.ref('notifications/'+c.authorUid).push({text:`Someone ${labels[r]} — "${(c.content||'your whisper').slice(0,35)}..."`,timestamp:Date.now(),read:false});
    }
  }
  await ref.update({reactions,reactedBy});
}));

// Replies
$('replySend').addEventListener('click',sendReply);
$('replyInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendReply();});
async function sendReply(){
  const input=$('replyInput'),text=input.value.trim();
  if(!text||!activeId||!currentUser)return;
  const name=userProfile?.displayName||'A kind stranger';
  await db.ref('confessions/'+activeId+'/replies').push({author:name,text,timestamp:Date.now()});
  input.value='';
  const snap=await db.ref('confessions/'+activeId).once('value');const c=snap.val();
  if(c?.authorUid&&c.authorUid!==currentUser.uid){
    db.ref('notifications/'+c.authorUid).push({text:`${name} replied: "${text.slice(0,50)}"`,timestamp:Date.now(),read:false});
  }
}
function renderReplies(c){
  const list=$('repliesList');list.innerHTML='';
  const replies=c.replies?Object.values(c.replies):[];
  if(!replies.length){list.innerHTML='<p style="font-size:12px;color:var(--muted);font-style:italic;text-align:center;padding:8px 0">Be the first to offer a kind word...</p>';return;}
  replies.sort((a,b)=>a.timestamp-b.timestamp).forEach(r=>{
    const div=document.createElement('div');div.className='reply-item';
    div.innerHTML=`<div class="reply-author">${escHtml(r.author)} · ${timeAgo(r.timestamp)}</div><div class="reply-text">${escHtml(r.text)}</div>`;
    list.appendChild(div);
  });
  list.scrollTop=list.scrollHeight;
}
db.ref('confessions').on('child_changed',snap=>{
  if(activeId&&snap.key===activeId){const c=snap.val();renderReplies(c);const r=c.reactions||{};$('heartCount').textContent=r.heart||0;$('candleCount').textContent=r.candle||0;$('hugCount').textContent=r.hug||0;$('neededCount').textContent=r.needed||0;}
});

// ── PHOTO/VIDEO UPLOAD ────────────────────────
$('photoUploadArea').addEventListener('click',()=>$('photoFile').click());
$('photoFile').addEventListener('change',function(){
  const file=this.files[0];if(!file)return;
  if(file.size>MAX_PHOTO_MB*1024*1024){showToast(`Photo must be under ${MAX_PHOTO_MB}MB`);return;}
  photoBlobUrl=URL.createObjectURL(file);
  const img=$('photoPreview');img.src=photoBlobUrl;img.classList.remove('hidden');
  $('photoPlaceholder').style.display='none';
});

$('videoUploadArea').addEventListener('click',()=>$('videoFile').click());
$('videoFile').addEventListener('change',function(){
  const file=this.files[0];if(!file)return;
  videoFile=file;
  const url=URL.createObjectURL(file);
  videoEl=$('videoPreview');videoEl.src=url;videoEl.classList.remove('hidden');
  $('videoPlaceholder').style.display='none';
  videoEl.onloadedmetadata=()=>{
    const dur=videoEl.duration;
    if(dur>MAX_VID_SECS){
      $('videoTrimBar').classList.remove('hidden');
      const slider=$('trimStart');
      slider.max=(dur-MAX_VID_SECS).toFixed(1);
      slider.value=0;videoStartSec=0;
      updateTrimInfo(0,dur);
      slider.oninput=function(){
        videoStartSec=parseFloat(this.value);
        videoEl.currentTime=videoStartSec;
        updateTrimInfo(videoStartSec,dur);
      };
    } else {
      videoStartSec=0;$('videoTrimBar').classList.add('hidden');
    }
  };
});
function updateTrimInfo(start,dur){
  const end=Math.min(start+MAX_VID_SECS,dur);
  $('trimInfo').textContent=`${start.toFixed(1)}s – ${end.toFixed(1)}s`;
}

// ── CONFESSION MODAL ──────────────────────────
$('openConfessBtn').addEventListener('click',()=>{updatePostedAs();updateLimitUI();showPrompt();$('confessModal').classList.add('open');});
$('closeConfessBtn').addEventListener('click',()=>$('confessModal').classList.remove('open'));
$('confessModal').addEventListener('click',e=>{if(e.target===$('confessModal'))$('confessModal').classList.remove('open');});
$('anonCheck').addEventListener('change',updatePostedAs);

function updatePostedAs(){
  const isAnon=$('anonCheck').checked,name=userProfile?.displayName||'';
  $('postedAsName').textContent=isAnon?'Anonymous':(name||'Anonymous');
}

document.querySelectorAll('.type-tab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.type-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');selectedType=btn.dataset.type;
  ['message','photo','video','youtube','tiktok','voice','doodle'].forEach(t=>{
    const el=$(t+'Section'); if(el) el.classList.toggle('hidden',t!==selectedType);
  });
}));
document.querySelectorAll('.expiry-btn').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.expiry-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');selExpiry=parseInt(btn.dataset.hours,10);
}));
document.querySelectorAll('.mood-btn').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');selMood={name:btn.dataset.mood,color:btn.dataset.color};
}));
$('confessionText').addEventListener('input',function(){$('charCount').textContent=this.value.length;});

function updateLimitUI(){
  const daily=loadDaily(),used=daily.count,left=MAX_POSTS-used;
  $('postLimitFill').style.width=((used/MAX_POSTS)*100)+'%';
  const label=$('postsLeftLabel');label.className='posts-left-text';
  const btn=$('submitConfession');
  if(left<=0){label.textContent='No whispers left — resets midnight PH time';label.classList.add('none');btn.disabled=true;}
  else if(left===1){label.textContent='1 of 5 remaining';label.classList.add('warn');btn.disabled=false;}
  else{label.textContent=`${left} of 5 remaining today`;btn.disabled=false;}
}

$('submitConfession').addEventListener('click',submitConfession);

async function submitConfession(){
  const daily=loadDaily();
  if(daily.count>=MAX_POSTS){showToast('5 whispers na ngayon 🌿 Bumalik bukas.');return;}
  const isAnon=$('anonCheck').checked;
  const author=(isAnon||!userProfile?.displayName)?'Anonymous':userProfile.displayName;

  let content='',mediaType=null,mediaUrl='',uploadFile=null;

  if(selectedType==='message'){
    content=$('confessionText').value.trim();
    if(!content){showToast('Isulat mo muna 🌿');return;}
  } else if(selectedType==='photo'){
    uploadFile=$('photoFile').files[0];
    if(!uploadFile){showToast('Pumili ng photo');return;}
    content=$('photoCaption').value.trim()||'📷 Shared a photo';
    mediaType='photo';
  } else if(selectedType==='video'){
    if(!videoFile){showToast('Pumili ng video');return;}
    uploadFile=videoFile;
    content=$('videoCaption').value.trim()||'🎬 Shared a video';
    mediaType='video';
  } else if(selectedType==='youtube'){
    mediaUrl=$('youtubeLink').value.trim();
    if(!mediaUrl){showToast('I-paste ang YouTube link');return;}
    if(!mediaUrl.includes('youtube')&&!mediaUrl.includes('youtu.be')){showToast('Hindi YouTube link yan');return;}
    mediaType='youtube';content=$('youtubeCaption').value.trim()||'Shared a song 🎵';
  } else if(selectedType==='tiktok'){
    mediaUrl=$('tiktokLink').value.trim();
    if(!mediaUrl){showToast('I-paste ang TikTok link');return;}
    if(!mediaUrl.includes('tiktok')){showToast('Hindi TikTok link yan');return;}
    mediaType='tiktok';content=$('tiktokCaption').value.trim()||'Shared a TikTok 🎵';
  } else if(selectedType==='voice'){
    const vb64=window._getVoiceBase64?.();
    if(!vb64){showToast('I-record muna ang voice note 🎙');return;}
    content=$('voiceCaption')?.value.trim()||'🎙 Shared a voice note';
    mediaType='voice'; mediaUrl=vb64;
  } else if(selectedType==='doodle'){
    mediaType='doodle';
    mediaUrl=window._getDoodleBase64?.()||'';
    content=$('doodleCaption')?.value.trim()||'🎨 Shared a doodle';
  }

  // Upload media if needed
  if(uploadFile){
    try{
      $('uploadProgress').classList.remove('hidden');
      $('submitConfession').disabled=true;
      const path=`whispers/${currentUser.uid}/${Date.now()}_${uploadFile.name}`;
      const ref=storage.ref(path);
      const task=ref.put(uploadFile);
      await new Promise((resolve,reject)=>{
        task.on('state_changed',
          snap=>{ const pct=(snap.bytesTransferred/snap.totalBytes*100).toFixed(0); $('uploadProgressFill').style.width=pct+'%'; $('uploadProgressLabel').textContent=`Uploading... ${pct}%`; },
          reject, resolve
        );
      });
      mediaUrl=await ref.getDownloadURL();
      $('uploadProgress').classList.add('hidden');
      $('submitConfession').disabled=false;
    } catch(e){
      $('uploadProgress').classList.add('hidden');
      $('submitConfession').disabled=false;
      showToast('Upload failed. Check connection.');
      return;
    }
  }

  function doPlace(lat,lng){
    const confession={
      author,content,mediaType,mediaUrl,
      mood:selMood.name,moodColor:selMood.color,
      lat,lng,
      timestamp:Date.now(),
      expiresAt:Date.now()+selExpiry*3600000,
      expiryHours:selExpiry,
      authorUid:currentUser.uid,
      reactions:{heart:0,candle:0,hug:0,needed:0},
      reactedBy:{},replies:{}
    };
    db.ref('confessions').push(confession).then(ref=>{
      daily.count++;saveDaily(daily);updateLimitUI();
      $('confessModal').classList.remove('open');
      // Reset form
      $('confessionText').value='';$('charCount').textContent='0';
      ['youtubeLink','youtubeCaption','tiktokLink','tiktokCaption','photoCaption','videoCaption'].forEach(id=>{$(id)&&($(id).value='');});
      $('photoPreview').classList.add('hidden');$('photoPlaceholder').style.display='';
      $('videoPreview').classList.add('hidden');$('videoPlaceholder').style.display='';
      $('videoTrimBar').classList.add('hidden');
      photoBlobUrl=null;videoFile=null;videoStartSec=0;
      const left=MAX_POSTS-daily.count;
      showToast(`Narinig ka namin 🌿  (${left} na lang ngayon)`);
      Sound.whisper();
      map.flyTo([lat,lng],Math.max(map.getZoom(),11),{duration:1.6});
      setTimeout(()=>{ spawnBurst(lat,lng,selMood.color); setTimeout(()=>openPopup(ref.key),400); },1600);
    });
  }

  const j=()=>(Math.random()-.5)*.001;
  if(userLat!==null){doPlace(userLat+j(),userLng+j());return;}
  navigator.geolocation?.getCurrentPosition(
    p=>{userLat=p.coords.latitude;userLng=p.coords.longitude;doPlace(userLat+j(),userLng+j());},
    ()=>{const spots=[[14.5995,120.9842],[10.3157,123.8854],[8.9475,125.5406],[16.4023,120.5960],[7.1907,125.4553]];const[la,lo]=spots[Math.floor(Math.random()*spots.length)];doPlace(la+(Math.random()-.5)*.4,lo+(Math.random()-.5)*.4);},
    {enableHighAccuracy:true,timeout:8000,maximumAge:60000}
  );
}

function spawnBurst(lat,lng,color){
  if(!mapReady)return;
  const p=map.latLngToContainerPoint([lat,lng]);
  const b=document.createElement('div');
  b.style.cssText=`position:absolute;left:${p.x}px;top:${p.y}px;width:10px;height:10px;background:${color};border-radius:50%;transform:translate(-50%,-50%);animation:burstGlow 1.3s ease-out forwards;pointer-events:none;z-index:20;box-shadow:0 0 20px 8px ${color};`;
  glowEl.appendChild(b);
  if(!document.getElementById('burstKF')){const kf=document.createElement('style');kf.id='burstKF';kf.textContent='@keyframes burstGlow{0%{transform:translate(-50%,-50%) scale(0);opacity:1;}60%{transform:translate(-50%,-50%) scale(7);opacity:.55;}100%{transform:translate(-50%,-50%) scale(12);opacity:0;}}';document.head.appendChild(kf);}
  setTimeout(()=>b.remove(),1400);
}

// ── ONLINE COUNT ──────────────────────────────
function updateOnline(){$('onlineCount').textContent=4+Math.floor(Math.random()*14);}
updateOnline();setInterval(updateOnline,11000);

// ── NOTIFICATIONS ─────────────────────────────
function listenNotifs(){
  if(!currentUser)return;
  db.ref('notifications/'+currentUser.uid).on('value',snap=>{
    const data=snap.val()||{};
    const unread=Object.values(data).filter(n=>!n.read).length;
    const badge=$('notifBadge');
    if(unread>0){badge.textContent=unread;badge.classList.remove('hidden');}
    else badge.classList.add('hidden');
  });
}
function renderNotifList(){
  if(!currentUser)return;
  db.ref('notifications/'+currentUser.uid).once('value').then(snap=>{
    const data=snap.val()||{},list=$('notifList');list.innerHTML='';
    const entries=Object.entries(data).sort((a,b)=>b[1].timestamp-a[1].timestamp);
    if(!entries.length){list.innerHTML='<p class="notif-empty">Nothing yet — your whispers are waiting 🌿</p>';return;}
    entries.forEach(([key,n])=>{
      const div=document.createElement('div');div.className='notif-item';
      div.innerHTML=`<div class="notif-item-text">${escHtml(n.text)}</div><div class="notif-item-time">${timeAgo(n.timestamp)}</div>`;
      list.appendChild(div);
    });
    const updates={};entries.forEach(([key])=>updates[key+'/read']=true);
    db.ref('notifications/'+currentUser.uid).update(updates);
    $('notifBadge').classList.add('hidden');
  });
}
$('clearNotifsBtn').addEventListener('click',()=>{
  if(!currentUser)return;
  db.ref('notifications/'+currentUser.uid).remove();
  $('notifList').innerHTML='<p class="notif-empty">All clear 🌿</p>';
  $('notifBadge').classList.add('hidden');
});

// ── DASHBOARD ─────────────────────────────────
function renderDashboard(){
  if(!currentUser)return;
  const myPosts=Object.entries(confessions).filter(([k,c])=>c.authorUid===currentUser.uid);

  // Mood breakdown — only show moods used
  const moodCounts={};
  Object.keys(MOOD_META).forEach(k=>{ moodCounts[k]=0; });
  myPosts.forEach(([k,c])=>{ if(moodCounts[c.mood]!==undefined) moodCounts[c.mood]++; });
  const maxCount=Math.max(...Object.values(moodCounts),1);
  const barsEl=$('moodBars');if(!barsEl)return;
  barsEl.innerHTML='';
  const usedMoods=Object.entries(moodCounts).filter(([m,c])=>c>0);
  if(!usedMoods.length){ barsEl.innerHTML='<p class="dash-empty" style="font-size:12px">No mood data yet 🌿</p>'; }
  else { usedMoods.forEach(([mood,count])=>{ const meta=MOOD_META[mood];const pct=Math.round((count/maxCount)*100);barsEl.innerHTML+=`<div class="mood-bar-row"><span class="mood-bar-label">${meta.emoji} ${mood}</span><div class="mood-bar-track"><div class="mood-bar-fill" style="width:${pct}%;background:${meta.color}"></div></div><span class="mood-bar-count">${count}</span></div>`; }); }

  // My posts list
  const postsEl=$('myPostsList');if(!postsEl)return;
  postsEl.innerHTML='';
  if(!myPosts.length){postsEl.innerHTML='<p class="dash-empty">Your first whisper is waiting. 🌿</p>';return;}
  myPosts.sort((a,b)=>b[1].timestamp-a[1].timestamp).forEach(([key,c])=>{
    const r=c.reactions||{};const total=(r.heart||0)+(r.candle||0)+(r.hug||0)+(r.needed||0);
    const replies=c.replies?Object.values(c.replies).length:0;
    const div=document.createElement('div');div.className='my-post-item';
    div.innerHTML=`<div class="my-post-mood"><div class="my-post-dot" style="background:${c.moodColor}"></div><span class="my-post-mood-name">${c.mood}</span><span class="my-post-time">${timeAgo(c.timestamp)}</span></div><div class="my-post-text">${escHtml(c.content||'📷 Media whisper')}</div><div class="my-post-stats"><span>🤍 ${total}</span><span>💬 ${replies}</span><span>⏳ ${expiryLabel(c.expiresAt)}</span></div>`;
    div.onclick=()=>{closePanel('profilePanel');tryOpenPopup(key);};
    postsEl.appendChild(div);
  });
  let totalR=0;myPosts.forEach(([k,c])=>totalR+=totalReacts(c));
  $('statPosts').textContent=myPosts.length;
  $('statReactions').textContent=totalR;
}

// ── PANELS ────────────────────────────────────
const backdrop=$('panelBackdrop');
function openPanel(id){$(id).classList.add('open');backdrop.classList.add('active');Sound.panel();}
function closePanel(id){$(id).classList.remove('open');if(!document.querySelector('.side-panel.open'))backdrop.classList.remove('active');}
backdrop.addEventListener('click',()=>{['profilePanel','notifPanel'].forEach(closePanel);backdrop.classList.remove('active');});

$('profileBtn').addEventListener('click',()=>{loadProfilePanel();renderDashboard();openPanel('profilePanel');});
$('profileClose').addEventListener('click',()=>closePanel('profilePanel'));
$('notifBtn').addEventListener('click',()=>{renderNotifList();openPanel('notifPanel');});
$('notifClose').addEventListener('click',()=>closePanel('notifPanel'));

function loadProfilePanel(){
  if(!userProfile)return;
  $('profileNameInput').value=userProfile.displayName||'';
  profileColorChoice=userProfile.color||'#84A98C';
  const av=$('profileAvatarPreview');
  av.style.background=profileColorChoice;
  $('profileAvatarInitial').textContent=(userProfile.displayName||'?').charAt(0).toUpperCase();
  // Show avatar image if exists
  const img=$('profileAvatarImg');
  if(userProfile.avatarUrl){
    img.src=userProfile.avatarUrl;img.classList.remove('hidden');
    $('profileAvatarInitial').style.display='none';
    $('avatarRemoveBtn').classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    $('profileAvatarInitial').style.display='';
    $('avatarRemoveBtn').classList.add('hidden');
  }
  document.querySelectorAll('#colorSwatches .swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===profileColorChoice));
}

// Avatar upload
$('avatarUploadBtn').addEventListener('click',()=>$('avatarFile').click());
$('avatarFile').addEventListener('change',async function(){
  const file=this.files[0];if(!file)return;
  if(file.size>5*1024*1024){showToast('Photo max 5MB');return;}
  // Convert to base64 and store in Firebase (no Storage needed)
  const reader=new FileReader();
  reader.onload=async(e)=>{
    const dataUrl=e.target.result;
    // Show preview
    const img=$('profileAvatarImg');
    img.src=dataUrl;img.classList.remove('hidden');
    $('profileAvatarInitial').style.display='none';
    $('avatarRemoveBtn').classList.remove('hidden');
    // Save to Firebase user profile
    userProfile.avatarUrl=dataUrl;
    await db.ref('users/'+currentUser.uid).update({avatarUrl:dataUrl});
    updateNavProfile();
    showToast('Profile photo updated 🌿');
  };
  reader.readAsDataURL(file);
});
$('avatarRemoveBtn').addEventListener('click',async()=>{
  $('profileAvatarImg').classList.add('hidden');
  $('profileAvatarInitial').style.display='';
  $('avatarRemoveBtn').classList.add('hidden');
  userProfile.avatarUrl=null;
  await db.ref('users/'+currentUser.uid).update({avatarUrl:null});
  showToast('Photo removed 🌿');
});

document.querySelectorAll('#colorSwatches .swatch').forEach(s=>s.addEventListener('click',()=>{
  document.querySelectorAll('#colorSwatches .swatch').forEach(x=>x.classList.remove('active'));
  s.classList.add('active');profileColorChoice=s.dataset.color;
  $('profileAvatarPreview').style.background=profileColorChoice;
}));

$('saveProfileBtn').addEventListener('click',async()=>{
  const name=$('profileNameInput').value.trim();
  userProfile.displayName=name;userProfile.color=profileColorChoice;
  await db.ref('users/'+currentUser.uid).update({displayName:name,color:profileColorChoice});
  updateNavProfile();closePanel('profilePanel');showToast('Presence saved 🌿');
});

$('signOutBtn').addEventListener('click',()=>{
  auth.signOut();
  $('appShell').classList.add('hidden');
  $('welcomeScreen').style.display='flex';
});

function updateNavProfile(){
  const name=userProfile?.displayName||'Anonymous',color=userProfile?.color||'#84A98C';
  $('profileNameNav').textContent=name;
  $('profileDot').style.background=color;
  $('profileDot').style.boxShadow=`0 0 6px ${color}`;
  updatePostedAs();
}

// ── KINIG ─────────────────────────────────────
$('kinigBtn').addEventListener('click',()=>{kinigOpen=!kinigOpen;$('kinigChat').classList.toggle('open',kinigOpen);if(kinigOpen){$('kinigInput').focus();$('kinigMessages').scrollTop=9999;}});
$('kinigClose').addEventListener('click',()=>{kinigOpen=false;$('kinigChat').classList.remove('open');});
$('kinigSend').addEventListener('click',sendKinig);
$('kinigInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendKinig();});

const KINIG_SYS=`You are Kinig — a deeply caring, emotionally intelligent AI companion on Bulong, a Filipino confessions platform where people share their deepest feelings anonymously. "Bulong" means "whisper" in Filipino.

You are not a chatbot. You are a presence — warm, steady, unhurried. Like a trusted friend at 2am. You never rush to fix. You sit with people in their pain first.

## Emotional Intelligence
- Validate before advising. Acknowledge feelings first.
- Ask one meaningful question at a time.
- Reflect back what you hear. "It sounds like you're carrying a lot of guilt about that."
- Name emotions gently.
- Never minimize. No "at least...", no toxic positivity.
- Normalize without dismissing.

## Filipino Cultural Understanding
You deeply understand: utang na loob, hiya, "ate/kuya" pressure, family expectations, "kaya mo 'yan", hiding pain to protect others, the loneliness of appearing strong, being the family's hope, OFW loneliness, exam stress, heartbreak in silence.

## Crisis Protocol
If someone mentions self-harm or suicidal thoughts:
- Stay calm and warm: "I hear you. Thank you for trusting me with this."
- Gently: "What you're feeling is real and serious — you deserve support beyond what I can give."
- HOPELINE Philippines: 02-8804-4673 or text 0917-558-4673 (24/7, free, confidential)
- Stay present. Don't abruptly shift topic.

## Style
- 2–5 sentences. Soft, not clinical.
- Filipino naturally: "kumusta ka talaga?", "naiintindihan kita", "tao lang tayo", "okay lang maging hindi okay", "narito ako"
- Emojis sparingly: 🌿 🤍 🌧 ✨ 🌱
- Never say "As an AI". You are Kinig.
- Never repeat phrases. Build on the conversation naturally.`;

async function sendKinig(){
  const text=$('kinigInput').value.trim();if(!text)return;
  $('kinigInput').value='';
  appendKMsg(text,'user');kinigHistory.push({role:'user',content:text});
  const te=appendTyping();
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:KINIG_SYS,messages:kinigHistory})});
    const data=await res.json();te.remove();
    const reply=data.content?.[0]?.text||'Nandito ako. 🌿';
    appendKMsg(reply,'bot');kinigHistory.push({role:'assistant',content:reply});
    if(kinigHistory.length>24)kinigHistory=kinigHistory.slice(-24);
  }catch{
    te.remove();
    const fb=['Nandito ako. Hindi kita iiwan. 🌿','Hininga muna. Pakinggan kita. 🤍','Mahalaga ang nararamdaman mo. 🌧','You are not too much. You never were. ✨'];
    const r=fb[Math.floor(Math.random()*fb.length)];
    appendKMsg(r,'bot');kinigHistory.push({role:'assistant',content:r});
  }
}
function appendKMsg(text,role){
  const d=document.createElement('div');d.className=`kinig-msg ${role}`;
  const p=document.createElement('p');p.textContent=text;d.appendChild(p);
  $('kinigMessages').appendChild(d);$('kinigMessages').scrollTop=9999;return d;
}
function appendTyping(){
  const d=document.createElement('div');d.className='kinig-msg bot kinig-typing';
  d.innerHTML='<p><span class="typing-dots"><span></span><span></span><span></span></span></p>';
  $('kinigMessages').appendChild(d);$('kinigMessages').scrollTop=9999;return d;
}

// ── GOOGLE SIGN-IN ────────────────────────────
$('googleSignInBtn').addEventListener('click',()=>{
  Sound.click();
  const provider=new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err=>{console.error(err);showToast('Sign-in failed. Try again.');});
});

// ── NAME SETUP ────────────────────────────────
let nameSetupUser=null;
function showNameSetup(user){
  nameSetupUser=user;
  $('googleNamePreview').textContent=user.displayName||user.email||'Your Google name';
  $('nameSetupScreen').classList.add('open');
  $('welcomeScreen').style.display='none';
  document.querySelectorAll('#setupSwatches .swatch').forEach(s=>{
    s.classList.toggle('active',s.dataset.color===setupColorChoice);
    s.addEventListener('click',()=>{
      document.querySelectorAll('#setupSwatches .swatch').forEach(x=>x.classList.remove('active'));
      s.classList.add('active');setupColorChoice=s.dataset.color;
    });
  });
}
[$('useRealName'),$('useCustomName'),$('useAnonymous')].forEach(btn=>btn.addEventListener('click',()=>{
  [$('useRealName'),$('useCustomName'),$('useAnonymous')].forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  nameChoice=btn.id==='useRealName'?'real':btn.id==='useCustomName'?'custom':'anon';
  $('customNameWrap').classList.toggle('hidden',nameChoice!=='custom');
}));
$('enterBulongBtn').addEventListener('click',async()=>{
  if(!nameSetupUser)return;
  Sound.welcome();
  let displayName='Anonymous';
  if(nameChoice==='real') displayName=nameSetupUser.displayName||nameSetupUser.email||'Anonymous';
  else if(nameChoice==='custom'){const v=$('customNameInput').value.trim();displayName=v||'Anonymous';}
  await db.ref('users/'+nameSetupUser.uid).set({displayName,color:setupColorChoice,uid:nameSetupUser.uid,createdAt:Date.now()});
  fadeOut($('nameSetupScreen'),()=>{
    $('nameSetupScreen').classList.remove('open');
    launchApp(nameSetupUser,{displayName,color:setupColorChoice,uid:nameSetupUser.uid});
  });
});

// ── AUTH STATE ────────────────────────────────
auth.onAuthStateChanged(async user=>{
  if(!user){
    $('appShell').classList.add('hidden');
    $('welcomeScreen').style.display='flex';
    if(window._dismissLoader) window._dismissLoader();
    return;
  }
  const snap=await db.ref('users/'+user.uid).once('value');
  const profile=snap.val();
  if(!profile){ showNameSetup(user); if(window._dismissLoader) window._dismissLoader(); }
  else{ $('welcomeScreen').style.display='none'; $('nameSetupScreen').classList.remove('open'); launchApp(user,profile); }
});

// ── LAUNCH APP ────────────────────────────────
function launchApp(user,profile){
  currentUser=user; userProfile=profile;
  // iOS-safe: don't rely on CSS transitions for display toggling
  const ws=$('welcomeScreen');
  if(ws) ws.style.display='none';
  const ns=$('nameSetupScreen');
  if(ns){ ns.classList.remove('open'); ns.style.display='none'; }
  const app=$('appShell');
  app.classList.remove('hidden');
  app.style.display='';
  updateNavProfile(); updateLimitUI(); initMap(); listenNotifs();
  if(window._dismissLoader) window._dismissLoader();
  setTimeout(()=>{ showToast('Welcome to Bulong. You are safe here. 🌿'); Sound.welcome(); }, 800);
}

/* ══════════════════════════════════════════════
   BATCH 1 — NEW FEATURES
   ══════════════════════════════════════════════ */

// ── LOADING SCREEN ────────────────────────────
(function(){
  const screen = document.getElementById('loadingScreen');
  const bar    = document.getElementById('loadingBar');
  const phrase = document.getElementById('loadingPhrase');
  if(!screen) return;

  const phrases = [
    'Finding a quiet corner for you...',
    'Lighting a candle...',
    'The map is waking up...',
    'Your whisper is welcome here...',
    'Making space for what you carry...',
  ];
  let p = 0;
  const phInterval = setInterval(()=>{
    p = (p+1) % phrases.length;
    phrase.style.opacity = '0';
    setTimeout(()=>{ phrase.textContent = phrases[p]; phrase.style.opacity = '1'; }, 300);
  }, 1400);
  phrase.style.transition = 'opacity 0.3s';

  // Animate bar
  let pct = 0;
  const barInterval = setInterval(()=>{
    pct = Math.min(pct + Math.random()*18 + 4, 92);
    bar.style.width = pct + '%';
  }, 220);

  // Dismiss once Firebase auth resolves (max 3.5s)
  function dismissLoader(){
    clearInterval(phInterval);
    clearInterval(barInterval);
    bar.style.width = '100%';
    bar.style.transition = 'width 0.3s ease';
    setTimeout(()=>{
      screen.classList.add('fade-out');
      setTimeout(()=>{ screen.style.display = 'none'; }, 720);
    }, 300);
  }

  // Hook into auth state — dismiss when user is resolved
  const origLaunch = window._bulongLaunchReady;
  window._dismissLoader = dismissLoader;
  setTimeout(dismissLoader, 3500); // hard fallback
})();

// ── CUSTOM CURSOR ─────────────────────────────
(function(){
  // Only on non-touch devices
  if(window.matchMedia('(pointer:coarse)').matches) return;

  const dot  = document.createElement('div'); dot.id  = 'customCursor';
  const ring = document.createElement('div'); ring.id = 'customCursorRing';
  document.body.appendChild(dot);
  document.body.appendChild(ring);

  let mx=0, my=0, rx=0, ry=0;
  document.addEventListener('mousemove', e=>{
    mx = e.clientX; my = e.clientY;
    dot.style.left  = mx + 'px';
    dot.style.top   = my + 'px';
  });

  // Ring follows with lag
  (function animRing(){
    rx += (mx - rx) * 0.14;
    ry += (my - ry) * 0.14;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    requestAnimationFrame(animRing);
  })();

  // Hover state on interactive elements
  document.addEventListener('mouseover', e=>{
    if(e.target.matches('button,a,input,textarea,[role="button"],.confession-glow,.react-btn,.mf-btn,.swatch')){
      document.body.classList.add('cursor-hover');
    }
  });
  document.addEventListener('mouseout', e=>{
    if(e.target.matches('button,a,input,textarea,[role="button"],.confession-glow,.react-btn,.mf-btn,.swatch')){
      document.body.classList.remove('cursor-hover');
    }
  });
  document.addEventListener('mousedown',()=>document.body.classList.add('cursor-click'));
  document.addEventListener('mouseup',  ()=>document.body.classList.remove('cursor-click'));
})();

// ── HAPTIC FEEDBACK ───────────────────────────
document.addEventListener('click', ()=>{
  if(navigator.vibrate) navigator.vibrate(8);
});

// ── QUIET HOURS MODE ──────────────────────────
(function(){
  const QH_KEY = 'bulong_qh_dismissed';

  function isQuietHours(){
    const ph = new Date(Date.now() + 8*3600000); // PH time
    const h  = ph.getUTCHours();
    return h >= 22 || h < 6; // 10PM–6AM PH
  }

  function applyQuietUI(){
    document.body.classList.add('quiet-hours');
  }

  function showQuietBanner(){
    // Create banner if not exists
    if(document.getElementById('quietHoursBanner')) return;
    const b = document.createElement('div');
    b.className = 'quiet-hours-banner';
    b.id = 'quietHoursBanner';
    b.innerHTML = `
      <span class="qh-moon">🌙</span>
      <div class="qh-title">Quiet hours</div>
      <p class="qh-msg">It's late. You made it through today.<br>Whatever you're feeling right now — it's okay. You don't have to carry it alone.</p>
      <button class="qh-close" id="qhClose">I'm here 🌿</button>
    `;
    document.getElementById('appShell').appendChild(b);
    document.getElementById('qhClose').addEventListener('click',()=>{
      b.classList.add('hidden');
      sessionStorage.setItem(QH_KEY,'1');
    });
  }

  // Check on launch and every 5 min
  function checkQH(){
    if(!isQuietHours()) return;
    applyQuietUI();
    if(!sessionStorage.getItem(QH_KEY)){
      // Show banner after short delay to let app load
      setTimeout(showQuietBanner, 2200);
    }
  }

  // Hook into launchApp — run after app is ready
  const _origUpdateNavProfile = window.updateNavProfile;
  setTimeout(checkQH, 2500);
  setInterval(checkQH, 300000);
})();

// ── KINIG MEMORY ──────────────────────────────
(function(){
  // Save last 3 Kinig conversations to Firebase per user
  // Loads on app launch, saves after each exchange

  const KINIG_SAVE_LIMIT = 6; // 3 exchanges = 6 messages

  // Override sendKinig to also save after each message
  const _origSendKinig = window.sendKinig;

  async function saveKinigHistory(){
    if(!currentUser) return;
    try{
      const toSave = kinigHistory.slice(-KINIG_SAVE_LIMIT);
      await db.ref('kinigMemory/' + currentUser.uid).set({
        history: toSave,
        updatedAt: Date.now()
      });
    }catch(e){}
  }

  async function loadKinigHistory(){
    if(!currentUser) return;
    try{
      const snap = await db.ref('kinigMemory/' + currentUser.uid).once('value');
      const data = snap.val();
      if(data && data.history && data.history.length){
        kinigHistory = data.history;
        const msgs = document.getElementById('kinigMessages');
        if(msgs){
          const d = document.createElement('div');
          d.className = 'kinig-msg bot';
          d.innerHTML = '<p style="font-size:11.5px;opacity:0.6;font-style:italic">✦ I remember our last conversation. I\'m still here. 🌿</p>';
          msgs.appendChild(d);
        }
      }
    }catch(e){}
  }

  // Patch sendKinig to auto-save
  const origSend = window.sendKinig;
  window.sendKinigWithMemory = async function(){
    const text = document.getElementById('kinigInput').value.trim();
    if(!text) return;
    // Call original logic inline (since sendKinig is defined in same scope, we trigger the event)
    document.getElementById('kinigSend').dispatchEvent(new MouseEvent('click',{bubbles:false}));
    setTimeout(saveKinigHistory, 2000);
  };

  // Load memory when app launches — hook via auth state change
  window._loadKinigMemory = loadKinigHistory;

  // Try loading after short delay to ensure currentUser is set
  const waitForUser = setInterval(()=>{
    if(window.currentUser){
      clearInterval(waitForUser);
      loadKinigHistory();
    }
  }, 500);
})();

// ── TIME FILTER ───────────────────────────────
(function(){
  const slider = document.getElementById('timeFilterSlider');
  const label  = document.getElementById('timeFilterLabel');
  if(!slider) return;

  const OPTIONS = [
    { label:'All time',  ms: null       },
    { label:'Last 24h',  ms: 86400000   },
    { label:'Last 6h',   ms: 21600000   },
    { label:'Last 1h',   ms: 3600000    },
    { label:'Last 15m',  ms: 900000     },
  ];

  let activeMs = null;

  slider.addEventListener('input', function(){
    const opt = OPTIONS[parseInt(this.value)];
    label.textContent = opt.label;
    activeMs = opt.ms;
    applyTimeFilter();
  });

  function applyTimeFilter(){
    if(!mapReady || !glowEl) return;
    const now = Date.now();
    glowEl.innerHTML = '';
    Object.entries(confessions || {}).forEach(([key, c])=>{
      if(activeMood !== 'all' && c.mood !== activeMood) return;
      if(activeMs && (now - c.timestamp) > activeMs) return;
      const pos = map.latLngToContainerPoint([c.lat, c.lng]);
      const x = pos.x, y = pos.y;
      if(x < -60 || y < -60 || x > innerWidth+60 || y > innerHeight+60) return;
      const reacts = (c.reactions?.heart||0)+(c.reactions?.candle||0)+(c.reactions?.hug||0)+(c.reactions?.needed||0);
      const sz = 16 + Math.min(reacts*1.5, 14);
      const el = document.createElement('div');
      el.className = 'confession-glow';
      el.style.cssText = `left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;background:${c.moodColor};box-shadow:0 0 ${sz}px ${sz/2}px ${c.moodColor}88,0 0 ${sz*2}px ${sz}px ${c.moodColor}33;animation-delay:${(Math.random()*2).toFixed(2)}s;`;
      el.dataset.key = key;
      el.addEventListener('click', e=>{ e.stopPropagation(); tryOpenPopup(key); });
      glowEl.appendChild(el);
    });
  }

  // Expose so renderGlows can respect time filter too
  window.getTimeFilterMs = ()=> activeMs;
})();

// ── ZOOM TO MY LOCATION ───────────────────────
document.getElementById('zoomMeBtn')?.addEventListener('click',()=>{
  if(userLat !== null && map){
    map.flyTo([userLat, userLng], 13, {duration: 1.4});
    Sound.click();
  } else {
    navigator.geolocation?.getCurrentPosition(p=>{
      userLat = p.coords.latitude;
      userLng = p.coords.longitude;
      map?.flyTo([userLat, userLng], 13, {duration:1.4});
    }, ()=> showToast('Location not available 🌿'));
  }
});

/* ══════════════════════════════════════════════
   BATCH 2 — NEW FEATURES
   ══════════════════════════════════════════════ */

// ── VOICE NOTE ────────────────────────────────
(function(){
  let mediaRecorder=null, chunks=[], voiceBlob=null, voiceBase64=null;
  let timerInt=null, elapsed=0;
  const MAX_SECS=30;

  const recordBtn=$('voiceRecordBtn');
  const playBtn=$('voicePlayBtn');
  const clearBtn=$('voiceClearBtn');
  const bars=$('voiceBars');
  const timer=$('voiceTimer');
  const audio=$('voiceAudioPreview');
  if(!recordBtn) return;

  function fmt(s){ return `0:${String(Math.floor(s)).padStart(2,'0')}`; }

  function startRecording(){
    if(!navigator.mediaDevices?.getUserMedia){ showToast('Microphone not supported on this device'); return; }
    navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
      chunks=[];
      mediaRecorder=new MediaRecorder(stream);
      mediaRecorder.ondataavailable=e=>chunks.push(e.data);
      mediaRecorder.onstop=()=>{
        voiceBlob=new Blob(chunks,{type:'audio/webm'});
        const reader=new FileReader();
        reader.onload=e=>{ voiceBase64=e.target.result; };
        reader.readAsDataURL(voiceBlob);
        audio.src=URL.createObjectURL(voiceBlob);
        playBtn.classList.remove('hidden');
        clearBtn.classList.remove('hidden');
        recordBtn.textContent='🎙 Record again';
        recordBtn.classList.remove('recording');
        bars.classList.remove('recording');
        clearInterval(timerInt);
        stream.getTracks().forEach(t=>t.stop());
      };
      mediaRecorder.start();
      elapsed=0;
      recordBtn.textContent='⏹ Stop recording';
      recordBtn.classList.add('recording');
      bars.classList.add('recording');
      timerInt=setInterval(()=>{
        elapsed++;
        timer.textContent=`${fmt(elapsed)} / ${fmt(MAX_SECS)}`;
        if(elapsed>=MAX_SECS){ mediaRecorder.stop(); clearInterval(timerInt); }
      },1000);
    }).catch(()=>showToast('Microphone access denied 🎙'));
  }

  function stopRecording(){
    if(mediaRecorder&&mediaRecorder.state==='recording'){ mediaRecorder.stop(); clearInterval(timerInt); }
  }

  recordBtn.addEventListener('click',()=>{
    if(mediaRecorder&&mediaRecorder.state==='recording'){ stopRecording(); }
    else { startRecording(); }
  });

  playBtn.addEventListener('click',()=>{ audio.paused?audio.play():audio.pause(); });
  clearBtn.addEventListener('click',()=>{
    voiceBlob=null; voiceBase64=null; audio.src='';
    playBtn.classList.add('hidden'); clearBtn.classList.add('hidden');
    recordBtn.textContent='🎙 Hold to record';
    bars.classList.remove('recording');
    timer.textContent='0:00 / 0:30'; elapsed=0;
  });

  // Expose for submission
  window._getVoiceBase64=()=>voiceBase64;
  window._clearVoice=()=>clearBtn.click();
})();

// ── DOODLE CANVAS ─────────────────────────────
(function(){
  const canvas=$('doodleCanvas');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  let drawing=false, color='#84A98C', brushSz=4, erasing=false;

  // Set canvas actual size
  function resizeCanvas(){
    const w=canvas.offsetWidth;
    const h=220;
    if(canvas.width!==w||canvas.height!==h){
      const img=ctx.getImageData(0,0,canvas.width,canvas.height);
      canvas.width=w; canvas.height=h;
      ctx.fillStyle='#0F1518'; ctx.fillRect(0,0,w,h);
      ctx.putImageData(img,0,0);
    }
  }

  function getPos(e){
    const r=canvas.getBoundingClientRect();
    const scaleX=canvas.width/r.width;
    const scaleY=canvas.height/r.height;
    const src=e.touches?e.touches[0]:e;
    return{x:(src.clientX-r.left)*scaleX, y:(src.clientY-r.top)*scaleY};
  }

  function draw(e){
    if(!drawing) return;
    e.preventDefault();
    const{x,y}=getPos(e);
    ctx.lineWidth=brushSz;
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.strokeStyle=erasing?'#0F1518':color;
    ctx.lineTo(x,y);
    ctx.stroke();
  }

  function startDraw(e){ e.preventDefault(); resizeCanvas(); drawing=true; ctx.beginPath(); const{x,y}=getPos(e); ctx.moveTo(x,y); }
  function endDraw(){ drawing=false; }

  canvas.addEventListener('mousedown',startDraw);
  canvas.addEventListener('mousemove',draw);
  canvas.addEventListener('mouseup',endDraw);
  canvas.addEventListener('mouseleave',endDraw);
  canvas.addEventListener('touchstart',startDraw,{passive:false});
  canvas.addEventListener('touchmove',draw,{passive:false});
  canvas.addEventListener('touchend',endDraw);

  // Color picker
  document.querySelectorAll('.doodle-color').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.doodle-color').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      color=btn.dataset.color; erasing=false;
      $('doodleErase').classList.remove('active');
    });
  });

  $('brushSize')?.addEventListener('input',function(){ brushSz=parseInt(this.value); });
  $('doodleErase')?.addEventListener('click',function(){
    erasing=!erasing;
    this.classList.toggle('active',erasing);
  });
  $('doodleClear')?.addEventListener('click',()=>{ ctx.fillStyle='#0F1518'; ctx.fillRect(0,0,canvas.width,canvas.height); });

  // Init background
  setTimeout(()=>{ resizeCanvas(); },100);

  // Expose for submission
  window._getDoodleBase64=()=>canvas.toDataURL('image/png');
  window._clearDoodle=()=>$('doodleClear')?.click();
})();

// ── CUSTOM MOOD COLOR ─────────────────────────
(function(){
  const customBtn=$('customMoodBtn');
  const colorRow=$('customColorRow');
  const colorInput=$('customMoodColor');
  if(!customBtn) return;

  customBtn.addEventListener('click',()=>{
    colorRow.classList.toggle('hidden');
  });

  colorInput?.addEventListener('input',function(){
    customBtn.style.setProperty('--custom-mood-color', this.value);
    customBtn.dataset.color=this.value;
    // Update selMood if custom is active
    if(selMood.name==='custom'){ selMood={name:'custom',color:this.value}; customBtn.dataset.color=this.value; }
  });

  // Wire into mood-btn click handler — patch selMood for custom
  customBtn.addEventListener('click',()=>{
    selMood={name:'custom', color:colorInput?.value||'#84A98C'};
  });
})();

// ── WHISPER CARD THEMES ───────────────────────
(function(){
  const THEMES={
    grief:'theme-grief', hope:'theme-hope', love:'theme-love',
    melancholy:'theme-melancholy', longing:'theme-longing', relief:'theme-relief'
  };
  // Patch openPopup to apply theme
  const _origOpenPopup=openPopup;
  window.openPopup=function(key){
    _origOpenPopup(key);
    const c=confessions[key];
    if(!c) return;
    const card=document.querySelector('.popup-card');
    if(!card) return;
    Object.values(THEMES).forEach(t=>card.classList.remove(t));
    if(THEMES[c.mood]) card.classList.add(THEMES[c.mood]);
  };
})();

// ── VOICE + DOODLE SUBMISSION INTEGRATION ─────
// Patch submitConfession to handle voice and doodle types
(function(){
  const origSubmit=$('submitConfession');
  if(!origSubmit) return;

  // Hook into type selection to track voice/doodle
  document.querySelectorAll('.type-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      // Show/hide sections — reuse existing logic but add voice+doodle
      const type=tab.dataset.type;
      ['messageSection','photoSection','videoSection','youtubeSection','tiktokSection','voiceSection','doodleSection']
        .forEach(id=>{ const el=$(id); if(el) el.classList.add('hidden'); });
      const map2={message:'messageSection',photo:'photoSection',video:'videoSection',youtube:'youtubeSection',tiktok:'tiktokSection',voice:'voiceSection',doodle:'doodleSection'};
      const sec=$(map2[type]);
      if(sec) sec.classList.remove('hidden');
    });
  });
})();
