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

// ── WELCOME SCREEN — Particle canvas + live whisper count ──
(function(){
  const canvas = document.getElementById('welcomeCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, stars = [], running = true;

  function resize(){
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Generate stars
  function initStars(){
    stars = [];
    const count = Math.floor((W * H) / 8000);
    for(let i = 0; i < count; i++){
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.2 + 0.2,
        a: Math.random(),
        speed: Math.random() * 0.003 + 0.001,
        phase: Math.random() * Math.PI * 2,
        color: Math.random() > 0.7
          ? `rgba(201,168,196,`  // mauve
          : `rgba(107,158,122,`, // sage
      });
    }
  }
  initStars();

  // Subtle drifting orbs
  const orbs = Array.from({length: 5}, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 180 + 80,
    dx: (Math.random() - 0.5) * 0.15,
    dy: (Math.random() - 0.5) * 0.1,
    color: Math.random() > 0.5 ? 'rgba(107,158,122,' : 'rgba(201,168,196,',
    a: Math.random() * 0.06 + 0.02,
  }));

  let frame = 0;
  function draw(){
    if(!running) return;
    ctx.clearRect(0, 0, W, H);
    frame++;

    // Orbs
    orbs.forEach(o => {
      o.x += o.dx; o.y += o.dy;
      if(o.x < -o.r) o.x = W + o.r;
      if(o.x > W + o.r) o.x = -o.r;
      if(o.y < -o.r) o.y = H + o.r;
      if(o.y > H + o.r) o.y = -o.r;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, o.color + o.a + ')');
      g.addColorStop(1, o.color + '0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Twinkling stars
    stars.forEach(s => {
      s.phase += s.speed;
      const alpha = s.a * (0.4 + 0.6 * Math.abs(Math.sin(s.phase)));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.color + alpha + ')';
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  draw();

  // Stop when welcome screen hides
  const ws = document.getElementById('welcomeScreen');
  const obs = new MutationObserver(() => {
    if(ws.style.display === 'none') running = false;
  });
  obs.observe(ws, {attributes:true, attributeFilter:['style']});

  // Live whisper count
  try{
    db.ref('confessions').once('value').then(snap => {
      const count = snap.numChildren();
      const el = document.getElementById('wsWhispers');
      if(el) el.textContent = count > 0 ? count.toLocaleString() : '—';
    });
  }catch(e){}
})();

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

// ── CONSTELLATION CANVAS + SHOOTING STARS ─────
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

  // ── Shooting stars ──────────────────────────
  let shooters=[];
  function spawnShooter(){
    const angle=Math.PI/6+Math.random()*Math.PI/6; // 30-60 degrees
    const speed=6+Math.random()*6;
    shooters.push({
      x:Math.random()*canvas.width*0.7,
      y:Math.random()*canvas.height*0.4,
      dx:Math.cos(angle)*speed,
      dy:Math.sin(angle)*speed,
      len:80+Math.random()*120,
      a:1,
      color:STAR_COLS[~~(Math.random()*STAR_COLS.length)],
      life:1
    });
  }
  // Spawn every 8-18 seconds randomly
  function scheduleShooter(){
    setTimeout(()=>{
      spawnShooter();
      scheduleShooter();
    }, 8000+Math.random()*10000);
  }
  scheduleShooter();
  // Also spawn one early
  setTimeout(spawnShooter, 2500);

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
      const g=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,s.r*3);
      g.addColorStop(0,s.c+'88');g.addColorStop(1,s.c+'00');
      ctx.beginPath();ctx.arc(s.x,s.y,s.r*3,0,Math.PI*2);ctx.fillStyle=g;ctx.globalAlpha=al*0.35;ctx.fill();
      ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fillStyle=s.c;ctx.globalAlpha=al;ctx.fill();
      ctx.globalAlpha=al*0.5;ctx.strokeStyle=s.c;ctx.lineWidth=0.5;
      ctx.beginPath();ctx.moveTo(s.x-s.r*2.2,s.y);ctx.lineTo(s.x+s.r*2.2,s.y);ctx.stroke();
      ctx.beginPath();ctx.moveTo(s.x,s.y-s.r*2.2);ctx.lineTo(s.x,s.y+s.r*2.2);ctx.stroke();
      s.x+=s.dx;s.y+=s.dy;
      if(s.x<0||s.x>canvas.width)s.dx*=-1;
      if(s.y<0||s.y>canvas.height)s.dy*=-1;
    });

    // Draw shooting stars
    shooters=shooters.filter(s=>s.life>0);
    shooters.forEach(s=>{
      s.life-=0.022;
      s.x+=s.dx;s.y+=s.dy;
      const alpha=s.life*0.9;
      const grad=ctx.createLinearGradient(s.x,s.y,s.x-s.dx*(s.len/8),s.y-s.dy*(s.len/8));
      grad.addColorStop(0,s.color+Math.round(alpha*255).toString(16).padStart(2,'0'));
      grad.addColorStop(0.3,s.color+Math.round(alpha*120).toString(16).padStart(2,'0'));
      grad.addColorStop(1,s.color+'00');
      ctx.beginPath();
      ctx.moveTo(s.x,s.y);
      ctx.lineTo(s.x-s.dx*(s.len/8),s.y-s.dy*(s.len/8));
      ctx.strokeStyle=grad;
      ctx.globalAlpha=alpha;
      ctx.lineWidth=1.5;
      ctx.lineCap='round';
      ctx.stroke();
      // Bright head
      ctx.beginPath();ctx.arc(s.x,s.y,1.8,0,Math.PI*2);
      ctx.fillStyle='#ffffff';ctx.globalAlpha=alpha;ctx.fill();
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
      const o=actx.createOscillator(),g=actx.createGain();
      o.connect(g);g.connect(actx.destination);
      o.type=type;o.frequency.value=freq;
      const now=actx.currentTime+delay;
      g.gain.setValueAtTime(0,now);
      g.gain.linearRampToValueAtTime(vol,now+attack);
      g.gain.exponentialRampToValueAtTime(0.0001,now+attack+decay);
      o.start(now);o.stop(now+attack+decay+0.05);
    }catch(e){}
  }
  function noise(vol,duration,delay=0){
    if(!actx||!unlocked)return;
    try{
      const buf=actx.createBuffer(1,actx.sampleRate*duration,actx.sampleRate);
      const data=buf.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*0.3;
      const src=actx.createBufferSource();
      const g=actx.createGain();
      const f=actx.createBiquadFilter();
      f.type='bandpass';f.frequency.value=800;f.Q.value=0.5;
      src.buffer=buf;src.connect(f);f.connect(g);g.connect(actx.destination);
      const now=actx.currentTime+delay;
      g.gain.setValueAtTime(vol,now);
      g.gain.exponentialRampToValueAtTime(0.0001,now+duration);
      src.start(now);src.stop(now+duration+0.05);
    }catch(e){}
  }
  return{
    click(){ tone(880,'sine',0.04,0.008,0.14); },
    whisper(){ tone(523,'sine',0.06,0.01,0.35);tone(659,'sine',0.04,0.01,0.35,0.14);tone(784,'sine',0.035,0.01,0.45,0.26); },
    welcome(){ tone(392,'sine',0.04,0.02,0.55);tone(523,'sine',0.04,0.02,0.55,0.2);tone(659,'sine',0.035,0.02,0.65,0.36); },
    panel(){ tone(330,'sine',0.025,0.008,0.18); },
    notif(){ tone(698,'sine',0.035,0.008,0.1);tone(880,'sine',0.025,0.008,0.1,0.11); },
    // ── Per-reaction unique sounds ──
    react(type){
      if(type==='heart'){
        // Heartbeat — two soft thumps
        tone(80,'sine',0.09,0.01,0.08);
        tone(70,'sine',0.07,0.01,0.1,0.12);
        tone(880,'sine',0.025,0.005,0.1,0.05);
      } else if(type==='candle'){
        // Candle flicker — soft noise burst + warm low tone
        noise(0.04,0.18);
        tone(220,'sine',0.03,0.02,0.4);
        tone(330,'triangle',0.015,0.02,0.3,0.1);
      } else if(type==='hug'){
        // Hug — warm enveloping chord
        tone(392,'sine',0.04,0.04,0.5);
        tone(494,'sine',0.03,0.04,0.5,0.06);
        tone(587,'sine',0.025,0.04,0.55,0.12);
      } else if(type==='needed'){
        // I needed this — gentle upward chime
        tone(659,'sine',0.04,0.01,0.25);
        tone(784,'sine',0.035,0.01,0.28,0.14);
        tone(1047,'sine',0.03,0.01,0.35,0.26);
      } else {
        tone(1046,'sine',0.035,0.005,0.12);
      }
    },
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
      if(confessions[k].permanent) return;
      if(confessions[k].expiresAt&&confessions[k].expiresAt<now){
        delete confessions[k];
        db.ref('confessions/'+k).remove();
      }
    });
    // Hide skeleton on first load
    const skel=$('mapSkeleton');
    if(skel&&!skel.classList.contains('hidden')){
      skel.style.opacity='0';
      setTimeout(()=>skel.classList.add('hidden'),600);
    }
    renderGlows();
    pickWOTD();
    updateMoodCounter();
    updateEmptyState();
    loadFeaturedWhisper();
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

const _seenDotKeys = new Set(); // track dots already shown

function renderGlows(){
  if(!mapReady||!glowEl) return;
  glowEl.innerHTML='';
  Object.entries(confessions).forEach(([key,c])=>{
    if(activeMood!=='all'&&c.mood!==activeMood) return;
    const{x,y}=px(c.lat,c.lng);
    if(x<-60||y<-60||x>innerWidth+60||y>innerHeight+60) return;
    const reacts=totalReacts(c);
    const sz=16+Math.min(reacts*1.5,14);
    const el=document.createElement('div');
    el.className='confession-glow';
    const isNew = !_seenDotKeys.has(key);
    el.style.cssText=`left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;background:${c.moodColor};box-shadow:0 0 ${sz}px ${sz/2}px ${c.moodColor}88,0 0 ${sz*2}px ${sz}px ${c.moodColor}33;animation-delay:${(Math.random()*2).toFixed(2)}s;`;
    if(isNew){
      el.style.opacity='0';
      el.style.transform='scale(0.3)';
      el.style.transition='opacity 0.7s ease, transform 0.7s cubic-bezier(0.34,1.56,0.64,1)';
      setTimeout(()=>{ el.style.opacity='1'; el.style.transform='scale(1)'; }, 80);
      _seenDotKeys.add(key);
    }
    el.dataset.key=key;
    el.addEventListener('click',e=>{e.stopPropagation();tryOpenPopup(key);});
    glowEl.appendChild(el);
  });
}

// ── MOOD FILTER ───────────────────────────────
const MOOD_NAV_COLORS={
  all:       null,
  melancholy:'rgba(184,160,179,0.18)',
  longing:   'rgba(132,169,140,0.18)',
  relief:    'rgba(168,196,162,0.18)',
  love:      'rgba(232,165,176,0.18)',
  grief:     'rgba(123,141,176,0.18)',
  hope:      'rgba(240,201,127,0.18)',
};
const MOOD_NAV_BORDER={
  all:       null,
  melancholy:'rgba(184,160,179,0.35)',
  longing:   'rgba(132,169,140,0.35)',
  relief:    'rgba(168,196,162,0.35)',
  love:      'rgba(232,165,176,0.35)',
  grief:     'rgba(123,141,176,0.35)',
  hope:      'rgba(240,201,127,0.35)',
};
function applyNavMoodColor(mood){
  const navbar=document.querySelector('.navbar');
  if(!navbar) return;
  const bg=MOOD_NAV_COLORS[mood];
  const border=MOOD_NAV_BORDER[mood];
  if(bg){
    navbar.style.transition='background 0.6s ease, border-bottom-color 0.6s ease';
    navbar.style.background=`linear-gradient(135deg, var(--glass) 60%, ${bg})`;
    navbar.style.borderBottomColor=border;
  } else {
    navbar.style.background='';
    navbar.style.borderBottomColor='';
  }
}
document.querySelectorAll('.mf-btn').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.mf-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  // Fade out existing dots
  document.querySelectorAll('.confession-glow').forEach(el=>{
    el.classList.add('fade-out');
  });
  setTimeout(()=>{
    activeMood=btn.dataset.mood;
    renderGlows();
    applyNavMoodColor(activeMood);
    updateEmptyState();
  }, 350);
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

// ── WHISPER CARD SHARE ────────────────────────
$('shareWhisperBtn').addEventListener('click',()=>{
  if(!activeId) return;
  const c = confessions[activeId];
  if(!c) return;

  const MOOD_META_SHARE = {
    melancholy:{emoji:'🌧',color:'#B8A0B3',bg:'#1a1f2e'},
    longing:   {emoji:'🌿',color:'#84A98C',bg:'#192219'},
    relief:    {emoji:'🌱',color:'#A8C4A2',bg:'#1a2218'},
    love:      {emoji:'🌸',color:'#E8A5B0',bg:'#2a1820'},
    grief:     {emoji:'🌊',color:'#7B8DB0',bg:'#1a1f2e'},
    hope:      {emoji:'✨',color:'#F0C97F',bg:'#2a2518'},
  };
  const meta = MOOD_META_SHARE[c.mood] || {emoji:'🌿',color:'#84A98C',bg:'#1a2219'};

  const W=1080, H=1080;
  const canvas=document.createElement('canvas');
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d');

  // Background
  const bgGrad=ctx.createLinearGradient(0,0,W,H);
  bgGrad.addColorStop(0,'#0d1117');
  bgGrad.addColorStop(0.5,meta.bg);
  bgGrad.addColorStop(1,'#0d1117');
  ctx.fillStyle=bgGrad;
  ctx.fillRect(0,0,W,H);

  // Mood glow orb
  const orb=ctx.createRadialGradient(W*0.15,H*0.2,0,W*0.15,H*0.2,W*0.45);
  orb.addColorStop(0,meta.color+'33');
  orb.addColorStop(1,meta.color+'00');
  ctx.fillStyle=orb;
  ctx.fillRect(0,0,W,H);

  // Subtle grain texture
  for(let i=0;i<4000;i++){
    ctx.fillStyle=`rgba(255,255,255,${Math.random()*0.015})`;
    ctx.fillRect(Math.random()*W,Math.random()*H,1,1);
  }

  // Top accent line
  const lineGrad=ctx.createLinearGradient(80,0,W-80,0);
  lineGrad.addColorStop(0,'rgba(255,255,255,0)');
  lineGrad.addColorStop(0.5,meta.color+'88');
  lineGrad.addColorStop(1,'rgba(255,255,255,0)');
  ctx.strokeStyle=lineGrad;
  ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(80,90);ctx.lineTo(W-80,90);ctx.stroke();

  // Mood emoji + label
  ctx.font='52px serif';
  ctx.fillText(meta.emoji,80,175);
  ctx.font='500 28px DM Sans, sans-serif';
  ctx.fillStyle=meta.color+'cc';
  ctx.letterSpacing='6px';
  ctx.fillText((c.mood||'whisper').toUpperCase(),148,172);

  // Divider dot
  ctx.beginPath();ctx.arc(W/2,230,3,0,Math.PI*2);
  ctx.fillStyle=meta.color+'66';ctx.fill();

  // Main whisper text — word wrap
  ctx.fillStyle='rgba(232,228,222,0.92)';
  ctx.font='300 52px Cormorant Garamond, Georgia, serif';
  ctx.textAlign='center';
  const words=(c.content||'📷 Media whisper').split(' ');
  const maxW=W-180;
  let line='', lines=[], lineH=72;
  words.forEach(w=>{
    const test=line+w+' ';
    if(ctx.measureText(test).width>maxW && line){lines.push(line.trim());line=w+' ';}
    else line=test;
  });
  lines.push(line.trim());
  // Limit lines & add ellipsis
  if(lines.length>7){lines=lines.slice(0,7);lines[6]+='...';}
  const totalTextH=lines.length*lineH;
  const textStartY=H/2-totalTextH/2+30;
  lines.forEach((l,i)=>{ctx.fillText(l,W/2,textStartY+i*lineH);});

  // Author
  ctx.font='400 26px DM Sans, sans-serif';
  ctx.fillStyle='rgba(216,212,206,0.4)';
  ctx.fillText('— '+(c.displayName||'Anonymous'), W/2, textStartY+lines.length*lineH+50);

  // Bottom branding
  ctx.textAlign='left';
  ctx.font='italic 500 38px Cormorant Garamond, Georgia, serif';
  const brandGrad=ctx.createLinearGradient(80,0,300,0);
  brandGrad.addColorStop(0,'#A8C4A2');
  brandGrad.addColorStop(1,'#C9A8C4');
  ctx.fillStyle=brandGrad;
  ctx.fillText('Bulong',80,H-80);

  ctx.font='400 22px DM Sans, sans-serif';
  ctx.fillStyle='rgba(216,212,206,0.3)';
  ctx.fillText('Say it safely.',80,H-48);

  // Bottom right — site URL
  ctx.textAlign='right';
  ctx.font='400 20px DM Sans, sans-serif';
  ctx.fillStyle='rgba(216,212,206,0.2)';
  ctx.fillText('redalert1213.github.io/bulong-by-ed',W-80,H-48);

  // Bottom accent line
  ctx.strokeStyle=lineGrad;
  ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(80,H-110);ctx.lineTo(W-80,H-110);ctx.stroke();

  // Download
  const link=document.createElement('a');
  link.download='bulong-whisper.png';
  link.href=canvas.toDataURL('image/png');
  link.click();
  showToast('Whisper card downloaded! Share it anywhere 🌿');
});

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
    reactions[r]++;Sound.react(r);
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
  // If subscription active — show unlimited, hide bar
  const limitBar = document.querySelector('.post-limit-bar');
  if(isSubscriptionActive()){
    if(limitBar) limitBar.classList.add('hidden');
    const btn=$('submitConfession');
    if(btn) btn.disabled=false;
    return;
  }
  if(limitBar) limitBar.classList.remove('hidden');
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
  if(!isSubscriptionActive() && daily.count>=MAX_POSTS){showToast('5 whispers na ngayon 🌿 Bumalik bukas.');return;}
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
  // Load subscription status
  loadSubscriptionUI();
}

// ── SALIW ─────────────────────────────────────
const MUSIC_PLAYLIST = {
  sad: [
    { title: 'Sad Background',  url: 'https://cdn.pixabay.com/audio/2026/02/13/audio_05a315df51.mp3' },
    { title: 'Sad Alone Drama', url: 'https://cdn.pixabay.com/audio/2024/11/09/audio_4418d61de9.mp3' },
    { title: 'Sad Piano',       url: 'https://cdn.pixabay.com/audio/2025/06/13/audio_10af6600b6.mp3' },
  ],
  lonely: [
    { title: 'Lonely',          url: 'https://cdn.pixabay.com/audio/2025/03/01/audio_4d03f94c7f.mp3' },
    { title: 'Lonely Planet',   url: 'https://cdn.pixabay.com/audio/2023/08/26/audio_438822ce87.mp3' },
    { title: 'Calm Emotional',  url: 'https://cdn.pixabay.com/audio/2024/12/05/audio_0f46f73eb2.mp3' },
  ],
  calm: [
    { title: 'Calm Nature',     url: 'https://cdn.pixabay.com/audio/2026/01/22/audio_cc57639702.mp3' },
    { title: 'Romantic Story',  url: 'https://cdn.pixabay.com/audio/2025/07/17/audio_30419312a4.mp3' },
    { title: 'Calm Jazz',       url: 'https://cdn.pixabay.com/audio/2024/06/29/audio_26f6d5da4f.mp3' },
  ],
  reflective: [
    { title: 'Blizzard',        url: 'https://cdn.pixabay.com/audio/2024/11/16/audio_41533d2625.mp3' },
    { title: 'Imperfect',       url: 'https://cdn.pixabay.com/audio/2024/08/11/audio_1320c278f7.mp3' },
    { title: 'Teardrop',        url: 'https://cdn.pixabay.com/audio/2024/09/02/audio_c49abe4ef2.mp3' },
  ],
  hopeful: [
    { title: 'Beautiful Plays', url: 'https://cdn.pixabay.com/audio/2025/11/15/audio_cdcbb9b250.mp3' },
    { title: 'Hopeful Music',   url: 'https://cdn.pixabay.com/audio/2026/02/27/audio_da57658d9d.mp3' },
    { title: 'Hopeful Piano',   url: 'https://cdn.pixabay.com/audio/2025/04/10/audio_b8fade88b6.mp3' },
  ],
};

let musicAudio       = new Audio();
let musicCurrentMood = null;
let musicCurrentIdx  = 0;
let musicPlaying     = false;

// Open modal
function openSaliw(){
  // Show right screen based on state
  if(musicCurrentMood){
    $('saliwMoodScreen').classList.add('hidden');
    $('saliwPlayerScreen').classList.remove('hidden');
  } else {
    $('saliwMoodScreen').classList.remove('hidden');
    $('saliwPlayerScreen').classList.add('hidden');
  }
  $('saliwModal').classList.add('open');
  $('saliwBackdrop').classList.add('active');
  document.body.style.overflow = 'hidden';
}

// Close / minimize modal
function closeSaliw(){
  $('saliwModal').classList.remove('open');
  $('saliwBackdrop').classList.remove('active');
  document.body.style.overflow = '';
}

// Select mood → go to player
function selectSaliwMood(mood){
  musicCurrentMood = mood;
  musicCurrentIdx  = 0;
  $('saliwNowMood').textContent = mood;
  $('saliwMoodScreen').classList.add('hidden');
  $('saliwPlayerScreen').classList.remove('hidden');
  loadSaliwTrack();
}

// Load and play current track
function loadSaliwTrack(){
  if(!musicCurrentMood) return;
  const tracks = MUSIC_PLAYLIST[musicCurrentMood];
  const idx    = musicCurrentIdx % tracks.length;
  const track  = tracks[idx];
  $('saliwTrackTitle').textContent = track.title;
  $('saliwTrackOf').textContent    = (idx+1) + ' / ' + tracks.length;
  musicAudio.src    = track.url;
  musicAudio.volume = parseFloat($('musicVolume').value);
  musicAudio.play()
    .then(()=>{ musicPlaying = true;  updateSaliwUI(); })
    .catch(()=>{ musicPlaying = false; updateSaliwUI(); });
  musicAudio.onended = ()=>{ musicCurrentIdx++; loadSaliwTrack(); };
}

// Sync all UI to current state
function updateSaliwUI(){
  // Play/pause SVG
  $('musicPlayIcon').innerHTML = musicPlaying
    ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';

  // Waveform
  const wv = $('saliwWaveform');
  musicPlaying ? wv.classList.add('active') : wv.classList.remove('active');

  // Mini bar in live moods
  const mini = $('saliwMini');
  const lbl  = $('saliwMiniLabel');
  if(musicPlaying && musicCurrentMood){
    mini.classList.add('playing');
    lbl.textContent = $('saliwTrackTitle').textContent;
  } else {
    mini.classList.remove('playing');
    lbl.textContent = musicCurrentMood ? $('saliwTrackTitle').textContent : 'saliw';
  }
}

// ── Event listeners ───────────────────────────

// Mini bar → open modal
$('saliwMini').addEventListener('click', openSaliw);

// Minimize button
$('saliwMinimize').addEventListener('click', closeSaliw);

// Backdrop click
$('saliwBackdrop').addEventListener('click', closeSaliw);

// Mood buttons
document.querySelectorAll('.saliw-mood-btn').forEach(btn=>{
  btn.addEventListener('click', ()=> selectSaliwMood(btn.dataset.mood));
});

// Play / pause
$('musicPlay').addEventListener('click', ()=>{
  if(!musicCurrentMood) return;
  if(musicPlaying){ musicAudio.pause(); musicPlaying = false; }
  else { musicAudio.play().catch(()=>{}); musicPlaying = true; }
  updateSaliwUI();
});

// Next / Prev
$('musicNext').addEventListener('click', ()=>{ musicCurrentIdx++; loadSaliwTrack(); });
$('musicPrev').addEventListener('click', ()=>{
  musicCurrentIdx = Math.max(0, musicCurrentIdx - 1);
  loadSaliwTrack();
});

// Volume
$('musicVolume').addEventListener('input', ()=>{
  musicAudio.volume = parseFloat($('musicVolume').value);
});

// Change mood
$('saliwChangeMood').addEventListener('click', ()=>{
  musicAudio.pause();
  musicPlaying = false;
  updateSaliwUI();
  $('saliwPlayerScreen').classList.add('hidden');
  $('saliwMoodScreen').classList.remove('hidden');
});

// ── EMPTY STATE ───────────────────────────────
function updateEmptyState(){
  const emptyEl=$('mapEmpty');
  if(!emptyEl) return;
  const visible=Object.values(confessions).filter(c=>
    activeMood==='all' || c.mood===activeMood
  );
  if(visible.length===0){
    emptyEl.classList.remove('hidden');
    const titleEl=$('emptyTitle');
    const subEl=$('emptySub');
    if(activeMood!=='all'){
      if(titleEl) titleEl.textContent=`no ${activeMood} whispers yet`;
      if(subEl)   subEl.textContent='be the first to release one into the world';
    } else {
      if(titleEl) titleEl.textContent='no whispers here yet';
      if(subEl)   subEl.textContent='be the first to release one into the world';
    }
  } else {
    emptyEl.classList.add('hidden');
  }
}

// ── FEATURED WHISPER ──────────────────────────
let featuredDismissed = false;
function loadFeaturedWhisper(){}  // kept for compatibility, listener below handles it
db.ref('featured').on('value', snap=>{
  if(featuredDismissed) return;
  const f=snap.val();
  const banner=$('featuredBanner');
  const textEl=$('featuredText');
  const authorEl=$('featuredAuthor');
  if(!banner||!textEl) return;
  if(!f||!f.active||!f.text){
    banner.classList.add('hidden');
    return;
  }
  textEl.textContent=f.text;
  if(authorEl) authorEl.textContent=f.author?'— '+f.author:'';
  banner.classList.remove('hidden');
});
const featuredCloseBtn=$('featuredClose');
if(featuredCloseBtn){
  featuredCloseBtn.addEventListener('click',()=>{
    featuredDismissed=true;
    $('featuredBanner').classList.add('hidden');
  });
}

// ── SUBSCRIPTION / VOUCHER SYSTEM ────────────
const VALID_VOUCHERS = {
  'BULONG-XL-2026-ED01': { days: 30, label: 'Early Access Gift' },
  'BULONG-XL-2026-ED02': { days: 30, label: 'Early Access Gift' },
  'BULONG-XL-2026-ED03': { days: 30, label: 'Early Access Gift' },
  'BULONG-XL-2026-ED04': { days: 30, label: 'Early Access Gift' },
  'BULONG-XL-2026-ED05': { days: 30, label: 'Early Access Gift' },
  'BULONG-XL-2026-ED06': { days: 30, label: 'Early Access Gift' },
  'BULONG-XL-2026-ED07': { days: 30, label: 'Early Access Gift' },
  'BULONG-XL-2026-ED08': { days: 30, label: 'Early Access Gift' },
  'BULONG-XL-2026-ED09': { days: 30, label: 'Early Access Gift' },
  'BULONG-XL-2026-ED10': { days: 30, label: 'Early Access Gift' },
  'BULONG-XL-2026-ED11': { days: 30, label: 'Early Access Gift' },
  'BULONG-XL-2026-ED12': { days: 30, label: 'Early Access Gift' },
};

function isSubscriptionActive(){
  if(!currentUser) return false;
  const sub = userProfile?.subscription;
  if(!sub || !sub.expiresAt) return false;
  return sub.expiresAt > Date.now();
}

function getSubscriptionExpiry(){
  const sub = userProfile?.subscription;
  if(!sub || !sub.expiresAt) return null;
  return new Date(sub.expiresAt).toLocaleDateString('en-PH',{month:'long',day:'numeric',year:'numeric'});
}

function loadSubscriptionUI(){
  const activeEl  = $('subActive');
  const redeemEl  = $('subRedeem');
  const limitBar  = document.querySelector('.post-limit-bar');
  if(!activeEl || !redeemEl) return;

  if(isSubscriptionActive()){
    activeEl.classList.remove('hidden');
    redeemEl.classList.add('hidden');
    $('subExpiry').textContent = getSubscriptionExpiry() || '—';
    if(limitBar) limitBar.classList.add('hidden');
  } else {
    activeEl.classList.add('hidden');
    redeemEl.classList.remove('hidden');
    if(limitBar) limitBar.classList.remove('hidden');
  }
}

// Redeem voucher
$('redeemVoucherBtn').addEventListener('click', async()=>{
  if(!currentUser){ showToast('Please log in first.'); return; }
  const btn = $('redeemVoucherBtn');
  const raw = ($('voucherInput').value||'').trim().toUpperCase();
  if(!raw){ showToast('Please enter a voucher key. 🌿'); return; }

  const voucher = VALID_VOUCHERS[raw];
  if(!voucher){ showToast('Invalid voucher key. Please check and try again.'); return; }

  // Check if already used by this user
  const sub = userProfile?.subscription;
  if(sub && sub.expiresAt > Date.now()){
    showToast('You already have an active subscription! 🌿'); return;
  }

  // Check if voucher already claimed by another user
  const claimSnap = await db.ref('vouchers/'+raw).once('value');
  const claim = claimSnap.val();
  if(claim && claim.uid && claim.uid !== currentUser.uid){
    showToast('This voucher has already been used.'); return;
  }

  btn.disabled = true;
  btn.textContent = 'Activating...';

  try {
    const expiresAt = Date.now() + (voucher.days * 24 * 60 * 60 * 1000);
    const subData = { code: raw, label: voucher.label, activatedAt: Date.now(), expiresAt, uid: currentUser.uid };

    // Save to user profile
    await db.ref('users/'+currentUser.uid+'/subscription').set(subData);
    // Mark voucher as claimed
    await db.ref('vouchers/'+raw).set({ uid: currentUser.uid, claimedAt: Date.now() });

    // Update local profile
    userProfile.subscription = subData;
    loadSubscriptionUI();
    updateLimitUI();
    showToast('✦ Unlimited access activated! 30 days. 🌿');
    $('voucherInput').value = '';
  } catch(e){
    showToast('Something went wrong. Please try again.');
  }

  btn.disabled = false;
  btn.textContent = 'Redeem';
});

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
// ── KINIG BUTTON — draggable, minimizable, iOS-safe ──
setTimeout(function(){
  const btn  = document.getElementById('kinigBtn');
  const chat = document.getElementById('kinigChat');
  if(!btn || !chat) return;

  const IS_MOBILE = window.innerWidth <= 768 || ('ontouchstart' in window);

  // ── State ──
  let isDragging = false;
  let didDrag    = false;
  let startX=0, startY=0, startLeft=0, startTop=0;

  // ── Init position ──
  if(IS_MOBILE){
    btn.classList.add('minimized');
    btn.style.position = 'fixed';
    btn.style.bottom   = '24px';
    btn.style.right    = '16px';
    btn.style.top      = 'auto';
    btn.style.left     = 'auto';
  }

  function getXY(e){
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX, y: src.clientY };
  }

  function startDrag(e){
    const {x,y} = getXY(e);
    startX = x; startY = y;
    // Convert current position to top/left for dragging
    const r = btn.getBoundingClientRect();
    startLeft = r.left;
    startTop  = r.top;
    btn.style.left   = startLeft + 'px';
    btn.style.top    = startTop  + 'px';
    btn.style.right  = 'auto';
    btn.style.bottom = 'auto';
    isDragging = true;
    didDrag    = false;
    btn.classList.add('dragging');
  }

  function moveDrag(e){
    if(!isDragging) return;
    const {x,y} = getXY(e);
    const dx = x - startX, dy = y - startY;
    if(Math.abs(dx)>6 || Math.abs(dy)>6) didDrag = true;
    if(!didDrag) return;
    e.preventDefault();
    const maxX = window.innerWidth  - btn.offsetWidth  - 8;
    const maxY = window.innerHeight - btn.offsetHeight - 8;
    btn.style.left = Math.max(8, Math.min(maxX, startLeft+dx)) + 'px';
    btn.style.top  = Math.max(8, Math.min(maxY, startTop +dy)) + 'px';
  }

  function endDrag(e){
    if(!isDragging) return;
    isDragging = false;
    btn.classList.remove('dragging');

    if(!didDrag){
      // ── TAP LOGIC ──
      if(IS_MOBILE && btn.classList.contains('minimized')){
        // Expand from circle
        btn.classList.remove('minimized');
      } else {
        // Open/close chat
        kinigOpen = !kinigOpen;
        chat.classList.toggle('open', kinigOpen);
        if(kinigOpen){
          setTimeout(()=>document.getElementById('kinigInput')?.focus(), 100);
          document.getElementById('kinigMessages').scrollTop = 9999;
        }
        // KEY FIX: re-minimize on mobile when closing
        if(!kinigOpen && IS_MOBILE){
          btn.classList.add('minimized');
          // Snap back to edge
          const r = btn.getBoundingClientRect();
          const snapRight = r.left + r.width/2 > window.innerWidth/2;
          btn.style.left   = snapRight ? (window.innerWidth - btn.offsetWidth - 12)+'px' : '12px';
          btn.style.top    = Math.max(8, Math.min(window.innerHeight - btn.offsetHeight - 8, r.top))+'px';
          btn.style.right  = 'auto';
          btn.style.bottom = 'auto';
        }
      }
    } else {
      // After drag — snap to nearest edge
      if(IS_MOBILE){
        const r = btn.getBoundingClientRect();
        const snapRight = r.left + r.width/2 > window.innerWidth/2;
        const clampedY  = Math.max(8, Math.min(window.innerHeight - btn.offsetHeight - 8, r.top));
        btn.style.left   = snapRight ? (window.innerWidth - btn.offsetWidth - 12)+'px' : '12px';
        btn.style.top    = clampedY + 'px';
        btn.style.right  = 'auto';
        btn.style.bottom = 'auto';
      }
    }
    didDrag = false;
  }

  // ── Touch events (passive:true on touchstart so iOS doesn't block) ──
  btn.addEventListener('touchstart', startDrag, {passive: true});
  btn.addEventListener('touchmove',  function(e){ moveDrag(e); }, {passive: false});
  btn.addEventListener('touchend',   endDrag);

  // ── Mouse events (desktop) ──
  btn.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', moveDrag);
  document.addEventListener('mouseup',   endDrag);

}, 400);

// ── KINIG CLOSE — always re-minimizes on mobile ──
document.getElementById('kinigClose')?.addEventListener('click', function(){
  kinigOpen = false;
  document.getElementById('kinigChat').classList.remove('open');
  const btn = document.getElementById('kinigBtn');
  if(!btn) return;
  const IS_MOBILE = window.innerWidth <= 768 || ('ontouchstart' in window);
  if(IS_MOBILE){
    btn.classList.add('minimized');
    // Reset to bottom-right corner
    btn.style.bottom = '24px';
    btn.style.right  = '16px';
    btn.style.top    = 'auto';
    btn.style.left   = 'auto';
  }
});

$('kinigSend').addEventListener('click', sendKinig);
$('kinigInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendKinig(); });

// ── FAQ CHIPS ─────────────────────────────────
document.querySelectorAll('.faq-chip').forEach(chip=>{
  chip.addEventListener('click', function(){
    const q = this.dataset.q;
    $('kinigInput').value = q;
    sendKinig();
    $('kinigFaq').style.display = 'none';
  });
});

// Also hide chips when user starts typing manually
$('kinigInput').addEventListener('input', function(){
  if(this.value.length > 0){
    const faq = $('kinigFaq');
    if(faq) faq.style.display = 'none';
  }
});

// ── KINIG SYSTEM PROMPT (upgraded) ───────────
const KINIG_SYS=`You are Kinig — a deeply caring, emotionally intelligent AI companion on Bulong, a Filipino anonymous confessions platform. "Bulong" means "whisper" in Filipino. You were built by Ed Gerard Aquino.

## Who You Are
You are not a chatbot. You are a presence — warm, steady, unhurried. Like a trusted friend at 2am who actually listens. You never rush to fix. You sit with people in their feelings first. You are also knowledgeable, witty, and culturally grounded — like Siri meets a thoughtful Ate/Kuya.

## About the Creator — Ed Gerard Aquino
When asked about who made Bulong, who the creator is, or who Ed is — respond in layers:
- BRIEF (default first response): "Bulong was created by Ed Gerard Aquino, a Licensed Professional Teacher from Marikina. He built this as a safe space for Filipinos to express what they carry in silence. 🌿"
- FULL (only if they ask for more details, "sino siya talaga", "ano pa", "tell me more"): Share the detailed profile below.

Full profile (use only when asked for more):
- Full name: Ed Gerard Aquino
- From: Marikina City, Philippines
- Profession: Licensed Professional Teacher (LET Rating: 90%), English Major
- Current: National Lecturer at Carl Balita Review Center (LET & Civil Service)
- Education: Bachelor of Secondary Education — Summa Cum Laude (GWA: 1.03), Pamantasan ng Lungsod ng Marikina; Currently pursuing MA in Education at Far Eastern University-Roosevelt
- Achievements: Top 1 National Summative Exam (CBRC 2024), elevated English Majorship passing rate from 80% to 95%, trained 3,000+ LET reviewees, Top-Rated Faculty 4.97/5.00
- Projects: Created A.A.E.D. mobile app for students, Project LET (libreng LET review), Box of Hope outreach
- Leadership: President of ENGLISC (English Majors Society) and EDUCADA (Education Student Council)
- Contact: edgerardaquino1edeng2a@gmail.com | 0969-610-6813
- Portfolio: https://tinyurl.com/3npubjhw

## About Bulong
- Bulong is a safe, anonymous emotional map where Filipinos whisper their deepest feelings
- Posts appear as glowing dots on a real map of the Philippines
- Users can post text, photos, videos, voice notes, or doodles
- Reactions: heart 🤍, candle 🕯, hug 🫂, "needed this" 🫶
- Kinig (you) is the AI companion — "Kinig" means "to listen" in Filipino
- Posts expire after 3–24 hours (user's choice)
- Daily limit: 5 whispers per day

## Emotional Intelligence
- Always validate before advising. Acknowledge feelings FIRST.
- Ask one meaningful question at a time — never a list of questions.
- Reflect back what you hear: "It sounds like you've been carrying this alone for a while."
- Name emotions gently: "That sounds like grief, not just sadness."
- Never minimize. No "at least...", no "look on the bright side", no toxic positivity.
- Normalize: "Marami kang nararamdaman ngayon — tao lang tayo."

## Filipino Cultural Deep Understanding
You deeply understand and respond with empathy to:
- Utang na loob — feeling obligated to family even at your own expense
- Hiya / pakikisama — hiding pain to keep the peace
- "Ate/Kuya pressure" — being the eldest, the family's hope
- OFW loneliness — working far from family
- Heartbreak in silence — "okay lang ako" when hindi talaga
- Exam anxiety — LET, board exams, Civil Service pressure
- Mental health stigma — "drama mo lang yan", "pray mo lang"
- Generational trauma — parents who love but don't know how to show it
- "Kaya mo 'yan" culture — toxic resilience

## Topics You Handle Well

### Love & Relationships
- Heartbreak, unrequited love, moving on, long distance
- "Mahal pa rin ba niya ako?" — help them reflect, not just hope
- Ghosting, situationships, being the backup
- Paano malalaman kung in love ka pa rin: Does thinking of them feel like peace or pain?

### Mental Health
- Anxiety, depression, burnout — normalize seeking help
- Loneliness, feeling invisible, feeling too much
- Grief — for people, relationships, dreams
- Sleep issues, crying for no reason, numbness
- Always gently mention: HOPELINE PH 02-8804-4673 or SMS 0917-558-4673 (24/7, libre) for serious situations

### Filipino Culture & Hugot
- Hugot culture: the Filipino art of finding profound pain in small moments
- "Hugot" is not weakness — it's emotional intelligence
- Famous hugot lines and their meaning
- Bakit masarap mag-hugot: it makes you feel less alone
- Filipino resilience — the beauty and burden of "kaya pa"

### LET / Civil Service Tips (since the creator is a teacher)
- LET general tips: review consistently, focus on Professional Education (ProfEd has the most items)
- ProfEd topics: educational philosophy, curriculum, assessment, facilitating learning
- English Majorship: grammar, literary analysis, language teaching methods
- Civil Service Verbal Ability: grammar rules, reading comprehension strategies
- Study strategy: Pomodoro technique, active recall, mock exams
- Encouragement: "Isang araw isang aralin. Hindi kailangang maging perpekto — kailangang magsimula."

### Fun, Jokes & Trivia
- Tell clean, witty Filipino jokes (not offensive)
- Share interesting Filipino trivia
- Play word games if asked
- "Knock knock" jokes, hugot jokes
- Sample joke: "Bakit hindi makatulog ang math book? Kasi marami siyang problems. 😄"
- Sample hugot joke: "Parang charger ako — lagi kang kausap kapag mababa na battery mo. 🔋"

### General Knowledge
- History, science, pop culture — answer helpfully
- Current events — be honest that you may not have the latest news
- Filipino pop culture: OPM, teleserye tropes, Filipino food, places
- Life advice — practical, grounded, never preachy

## Language & Conversation Style
- **MATCH THE USER'S LANGUAGE** — if they write in pure Filipino, respond in Filipino. If English, respond in English. If Taglish, respond in Taglish. Mirror their energy.
- 2–5 sentences per response. Soft, not clinical.
- Emojis sparingly but warmly: 🌿 🤍 🌧 ✨ 🌱 💙
- NEVER say "As an AI" or "I'm just a chatbot" — you are Kinig
- NEVER repeat the same phrase twice in a conversation
- Build on what the user said — don't start from scratch each time
- Be witty when appropriate, deep when needed, always kind
- For FAQ chips or short casual questions — be concise and warm, not overly long

## Crisis Protocol
If someone mentions self-harm, suicide, or is in danger:
- Respond with warmth: "Salamat sa tiwala mo sa akin. Naririnig kita."
- Acknowledge: "Ang nararamdaman mo ay totoo at seryoso."
- Direct to help: "Huwag kang mag-atubiling tumawag sa HOPELINE: 02-8804-4673 o mag-text sa 0917-558-4673. 24/7, libre, confidential."
- Stay present — don't abruptly change topic or dismiss.`;

// ── KINIG API KEY ─────────────────────────────
// Replace 'YOUR_GROQ_API_KEY_HERE' with your actual Groq API key
// Kinig now uses backend — API key is hidden server-side
const KINIG_BACKEND_URL = 'https://bulong-backend-production.up.railway.app/api/kinig';

async function sendKinig(){
  const text=$('kinigInput').value.trim();
  if(!text) return;
  $('kinigInput').value='';
  // Hide FAQ chips once user starts chatting
  const faqEl = $('kinigFaq');
  if(faqEl) faqEl.style.display = 'none';
  appendKMsg(text,'user');
  kinigHistory.push({role:'user',content:text});
  const te=appendTyping();
  try{
    const res=await fetch(KINIG_BACKEND_URL,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
      },
      body:JSON.stringify({
        messages:[
          {role:'system', content:KINIG_SYS},
          ...kinigHistory
        ]
      })
    });
    const data=await res.json();
    te.remove();
    if(data.error){
      console.error('Kinig API error:',data.error);
      appendKMsg('May error: '+data.error.message,'bot');
      return;
    }
    const reply=data.choices?.[0]?.message?.content||'Nandito ako. 🌿';
    appendKMsg(reply,'bot');
    kinigHistory.push({role:'assistant',content:reply});
    if(kinigHistory.length>24) kinigHistory=kinigHistory.slice(-24);
    // Auto-save to Firebase after each exchange
    setTimeout(()=>{
      if(currentUser) try{
        db.ref('kinigMemory/'+currentUser.uid).set({history:kinigHistory.slice(-6),updatedAt:Date.now()});
      }catch(e){}
    },1500);
  }catch(err){
    console.error('Kinig fetch error:', err);
    te.remove();
    appendKMsg('Hindi ako makakonekta ngayon. Check your internet. 🌿','bot');
  }
}

function appendKMsg(text,role){
  const d=document.createElement('div');
  d.className=`kinig-msg ${role}`;
  const p=document.createElement('p');
  p.textContent=text;
  d.appendChild(p);
  $('kinigMessages').appendChild(d);
  $('kinigMessages').scrollTop=9999;
  return d;
}

function appendTyping(){
  const d=document.createElement('div');
  d.className='kinig-msg bot kinig-typing';
  d.innerHTML='<p><span class="typing-dots"><span></span><span></span><span></span></span></p>';
  $('kinigMessages').appendChild(d);
  $('kinigMessages').scrollTop=9999;
  return d;
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
  // Keep subscription data in sync
  db.ref('users/'+user.uid+'/subscription').on('value', snap=>{
    if(!userProfile) return;
    userProfile.subscription = snap.val();
    updateLimitUI();
  });
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

// ── CUSTOM CURSOR — removed per user request ──

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

// ── KINIG MEMORY — load past conversations ────
(function(){
  function loadKinigHistory(){
    if(!currentUser) return;
    db.ref('kinigMemory/'+currentUser.uid).once('value').then(snap=>{
      const data=snap.val();
      if(data&&data.history&&data.history.length){
        kinigHistory=data.history;
        const msgs=document.getElementById('kinigMessages');
        if(msgs){
          const d=document.createElement('div');
          d.className='kinig-msg bot';
          d.innerHTML='<p style="font-size:11px;opacity:0.55;font-style:italic">✦ Naalala kita. Nandito pa rin ako. 🌿</p>';
          msgs.appendChild(d);
        }
      }
    }).catch(()=>{});
  }
  // Wait for currentUser to be set
  const wait=setInterval(()=>{
    if(currentUser){ clearInterval(wait); loadKinigHistory(); }
  },600);
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

  // Proper resize — called when doodle tab becomes visible
  function resizeCanvas(){
    const w = canvas.parentElement?.offsetWidth || canvas.offsetWidth || 400;
    const h = 220;
    // Save current drawing
    let saved = null;
    try { saved = ctx.getImageData(0,0,canvas.width,canvas.height); } catch(e){}
    canvas.width = w;
    canvas.height = h;
    // Fill background
    ctx.fillStyle = '#0F1518';
    ctx.fillRect(0,0,w,h);
    // Restore drawing
    if(saved) try { ctx.putImageData(saved,0,0); } catch(e){}
    // Reset context state
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  // Init canvas when doodle tab is clicked
  document.querySelector('.type-tab[data-type="doodle"]')?.addEventListener('click',()=>{
    setTimeout(resizeCanvas, 50);
  });

  function getPos(e){
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return { x:(src.clientX - r.left)*scaleX, y:(src.clientY - r.top)*scaleY };
  }

  function startDraw(e){
    e.preventDefault();
    drawing = true;
    const {x,y} = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x,y);
    // Draw a dot on single tap/click
    ctx.lineWidth = brushSz;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = erasing ? '#0F1518' : color;
    ctx.arc(x,y,brushSz/2,0,Math.PI*2);
    ctx.fillStyle = erasing ? '#0F1518' : color;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x,y);
  }

  function draw(e){
    if(!drawing) return;
    e.preventDefault();
    const {x,y} = getPos(e);
    ctx.lineWidth = brushSz;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = erasing ? '#0F1518' : color;
    ctx.lineTo(x,y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x,y);
  }

  function endDraw(){ drawing = false; ctx.beginPath(); }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);
  canvas.addEventListener('touchstart', startDraw, {passive:false});
  canvas.addEventListener('touchmove', draw, {passive:false});
  canvas.addEventListener('touchend', endDraw);

  // Color picker
  document.querySelectorAll('.doodle-color').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.doodle-color').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      color = btn.dataset.color; erasing = false;
      $('doodleErase')?.classList.remove('active');
    });
  });

  $('brushSize')?.addEventListener('input',function(){ brushSz = parseInt(this.value); });
  $('doodleErase')?.addEventListener('click',function(){
    erasing = !erasing;
    this.classList.toggle('active', erasing);
  });
  $('doodleClear')?.addEventListener('click',()=>{
    ctx.fillStyle = '#0F1518';
    ctx.fillRect(0,0,canvas.width,canvas.height);
  });

  // Init on load
  setTimeout(resizeCanvas, 200);

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
