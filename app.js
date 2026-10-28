'use strict';
const K='pickleMix.v1',$=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fresh=()=>({players:[],settings:{courts:1,points:7,cycles:3,mode:'rot',pairing:'random'},matches:[],started:false,nid:1,teams:[],draft:[]});
function valid(d){return d&&Array.isArray(d.players)&&Array.isArray(d.matches)&&d.settings&&d.players.every(p=>p&&typeof p.id=='number'&&typeof p.name=='string')&&d.matches.every(m=>m&&Array.isArray(m.a)&&Array.isArray(m.b)&&m.a.length==2&&m.b.length==2&&['pending','done','skipped'].includes(m.status))&&(d.settings.mode!=='fixed'||Array.isArray(d.teams))&&['courts','points','cycles'].every(k=>Number.isInteger(d.settings[k])&&d.settings[k]>0)}
let S=fresh();try{const d=JSON.parse(localStorage.getItem(K));if(valid(d))S=d}catch(e){}
const save=()=>{try{localStorage.setItem(K,JSON.stringify(S))}catch(e){}};
let view=S.started?'game':'home',tmp=null,msg='',err='',ed=null,ct=1,SC={};

/* ---------- Algoritmo de rotación ---------- */
const key=(x,y)=>x<y?x+'-'+y:y+'-'+x;
function trial(ids,count,done,courts,base){
  const g={},pt={},op={},qd={},sets=[];let s=0;const m=[];
  ids.forEach(i=>g[i]=0);
  const reg=(a,b)=>{const all=[...a,...b];pt[key(...a)]=(pt[key(...a)]||0)+1;pt[key(...b)]=(pt[key(...b)]||0)+1;
    a.forEach(x=>b.forEach(y=>op[key(x,y)]=(op[key(x,y)]||0)+1));
    const q=all.slice().sort((x,y)=>x-y).join();qd[q]=(qd[q]||0)+1;all.forEach(x=>{if(x in g)g[x]++});sets.push(new Set(all))};
  done.forEach(x=>reg(x.a,x.b));
  const per=Math.max(1,Math.floor(ids.length/4));
  for(let i=0;i<count;i++){
    const rec=new Set();sets.slice(-courts).forEach(st=>st.forEach(x=>rec.add(x)));
    const pool=ids.map(id=>({id,k:g[id]*100+(rec.has(id)?60:0)+Math.random()*30})).sort((x,y)=>x.k-y.k).slice(0,10).map(x=>x.id);
    const minSum=pool.map(x=>g[x]).sort((x,y)=>x-y).slice(0,4).reduce((x,y)=>x+y,0);
    let bc=null,bs=1e9;
    for(let a=0;a<pool.length;a++)for(let b=a+1;b<pool.length;b++)for(let c=b+1;c<pool.length;c++)for(let d=c+1;d<pool.length;d++){
      const q=[pool[a],pool[b],pool[c],pool[d]],extra=q.reduce((x,y)=>x+g[y],0)-minSum;
      const rc=q.filter(x=>rec.has(x)).length*60,qk=q.slice().sort((x,y)=>x-y).join();
      for(const [p1,p2] of [[[q[0],q[1]],[q[2],q[3]]],[[q[0],q[2]],[q[1],q[3]]],[[q[0],q[3]],[q[1],q[2]]]]){
        let sc=extra*1000+rc+(pt[key(...p1)]||0)*100+(pt[key(...p2)]||0)*100+(qd[qk]||0)*40+Math.random()*3;
        p1.forEach(x=>p2.forEach(y=>sc+=(op[key(x,y)]||0)*10));
        if(sc<bs){bs=sc;bc=[p1,p2]}}}
    s+=bs;reg(bc[0],bc[1]);
    m.push({id:0,cycle:Math.floor((base+i)/per)+1,court:(base+i)%courts+1,a:bc[0],b:bc[1],status:'pending',sa:null,sb:null});
  }
  return{m,s};
}
function gen(ids,count,done,courts,base){
  let best=null,bs=1e18;
  for(let t=0;t<40;t++){const r=trial(ids,count,done,courts,base);if(r.s<bs){bs=r.s;best=r.m}}
  return best;
}
const active=()=>S.players.filter(p=>p.status!=='rest'&&p.status!=='out');
function rebuild(count){
  const keep=S.matches.filter(m=>m.status!=='pending'),ids=active().map(p=>p.id);
  if(ids.length<4){S.matches=keep;return false}
  const nm=gen(ids,count,keep.filter(m=>m.status==='done'),S.settings.courts,keep.length);
  nm.forEach(m=>m.id=S.nid++);S.matches=keep.concat(nm);return true;
}
const pending=()=>S.matches.filter(m=>m.status==='pending');
/* Partidos que se juegan a la vez: los primeros pendientes (hasta nº de pistas) sin jugadores repetidos. Cuando una pista queda libre, entra el siguiente. */
function live(){
  const C=S.settings.courts,out=[],busy=new Set(),used=new Set();
  for(const m of pending()){if(out.length>=C)break;const ps=[...m.a,...m.b];if(ps.some(i=>busy.has(i)))continue;out.push(m);ps.forEach(i=>busy.add(i))}
  out.forEach(m=>{if(m.court>=1&&m.court<=C&&!used.has(m.court))used.add(m.court);else m.court=0});
  out.forEach(m=>{if(!m.court){let c=1;while(used.has(c))c++;m.court=c;used.add(c)}});
  return out.sort((a,b)=>a.court-b.court)}
const nameOf=id=>{const p=S.players.find(p=>p.id===id);return p?p.name:'?'};
const FX=()=>S.settings.mode==='fixed';
/* ---------- Parejas fijas ---------- */
/* Torneo: fase de grupos (todos contra todos dentro de cada grupo) + eliminatorias */
const fxPlan=T=>({G:T<=4?1:Math.ceil(T/4),Q:T<=2?0:T<=3?2:T<=11?4:8});
const KOL={1:'Final',2:'Semifinal',4:'Cuartos'},grpL=g=>'Grupo '+String.fromCharCode(65+(g||0));
const fxMk=(x,y,extra)=>{const T=id=>S.teams.find(t=>t.id===id);S.matches.push(Object.assign({id:S.nid++,cycle:1,court:S.matches.length%S.settings.courts+1,a:T(x).p.slice(),b:T(y).p.slice(),ta:x,tb:y,status:'pending',sa:null,sb:null},extra))};
function fxBuild(){
  const{G}=fxPlan(S.teams.length),R=[];
  S.teams.forEach((t,i)=>t.g=i%G);
  for(let g=0;g<G;g++){const ids=S.teams.filter(t=>t.g===g).map(t=>t.id);if(ids.length%2)ids.push(0);
    const n=ids.length;let a=ids.slice();
    for(let r=0;r<n-1;r++){(R[r]=R[r]||[]);for(let i=0;i<n/2;i++){const x=a[i],y=a[n-1-i];if(x&&y)R[r].push([x,y,g])}
      a=[a[0],a[n-1],...a.slice(1,n-1)]}}
  R.forEach(r=>r.forEach(([x,y,g])=>fxMk(x,y,{ph:'g',lbl:grpL(g)})));
}
function fxAdvance(){
  if(!FX()||pending().length)return;
  const T=S.teams.length,Q=fxPlan(T).Q;if(!Q)return;
  const ko=S.matches.filter(m=>m.ph==='ko');let pairs=[],n;
  if(!ko.length){
    const st=stats(),by=id=>st.find(s=>s.p.id===id),cmp=(x,y)=>rate(y)-rate(x)||dif(y)-dif(x)||y.pf-y.pa-(x.pf-x.pa),gp={};
    S.teams.forEach(t=>(gp[t.g||0]=gp[t.g||0]||[]).push(by(t.id)));
    const seeds=[];Object.values(gp).forEach(l=>l.sort(cmp).forEach((s,i)=>{s.gp=i;seeds.push(s)}));
    seeds.sort((x,y)=>x.gp-y.gp||cmp(x,y));const q=seeds.slice(0,Q).map(s=>s.p.id);
    const ord={2:[[0,1]],4:[[0,3],[1,2]],8:[[0,7],[3,4],[1,6],[2,5]]}[Q];
    pairs=ord.map(([i,j])=>[q[i],q[j]]);n=Q/2;
  }else{
    const last=ko[ko.length-1].ko;if(last<2)return;
    const w=ko.filter(m=>m.ko===last).map(m=>m.sa>m.sb?m.ta:m.tb);
    for(let i=0;i<w.length;i+=2)pairs.push([w[i],w[i+1]]);n=last/2;
  }
  pairs.forEach(([x,y])=>fxMk(x,y,{ph:'ko',ko:n,lbl:KOL[n]}));
}
/* Gráfico del torneo: grupos → eliminatorias */
function fxFlow(){
  const real=S.started&&S.teams.length,T=real?S.teams.length:Math.floor(S.players.length/2);if(T<2)return'';
  const{G,Q}=fxPlan(T),nm=t=>t.p.map(nameOf).join(' / ');let gr='';
  if(real){const st=stats();gr=Array.from({length:G},(_,g)=>{const l=st.filter(s=>(S.teams.find(t=>t.id===s.p.id).g||0)===g).sort((x,y)=>rate(y)-rate(x)||dif(y)-dif(x));
    return`<div class="grp"><h4>${grpL(g)}</h4>${l.map(s=>`<div class="ln"><span>${esc(s.p.name.replace(/ y /g,' / '))}</span><b>${s.w}-${s.l}</b></div>`).join('')}</div>`}).join('')}
  else gr=Array.from({length:G},(_,g)=>{const z=Math.floor(T/G)+(g<T%G?1:0);return`<div class="grp"><h4>${grpL(g)}</h4><div class="ln"><span>${z} parejas · todas contra todas</span></div></div>`}).join('');
  let cols='';
  for(let n=Q/2;n>=1;n/=2){const ms=S.matches.filter(m=>m.ph==='ko'&&m.ko===n),sh=t=>esc(nm(S.teams.find(x=>x.id===t)).slice(0,40));
    cols+=`<div class="kc"><h4>${KOL[n]}${n>1?'s':''}</h4>${ms.length?ms.map(m=>`<div class="bm">${[[m.ta,m.sa,m.sa>m.sb],[m.tb,m.sb,m.sb>m.sa]].map(([t,s,w])=>`<div${m.status==='done'&&w?' class="w"':''}><span>${sh(t)}</span><b>${m.status==='done'?s:''}</b></div>`).join('')}</div>`).join(''):Array.from({length:n},()=>'<div class="bm ph"><div><span>por definir</span></div><div><span>por definir</span></div></div>').join('')}</div>`}
  const e=Q?`<div class="fl">▶</div><div class="kc"><h4>Campeón</h4><div class="bm ph" style="text-align:center">🏆</div></div>`:'';
  return`<div class="card"><h3>Cómo se juega el torneo</h3><p class="mut">1) Fase de grupos: cada pareja juega contra las de su grupo. ${Q?`2) Pasan las ${Q} mejores a eliminatorias directas (el que pierde, fuera).`:''}</p>
  <div class="flow"><div class="kc"><h4>Grupos</h4>${gr}</div>${Q?`<div class="fl">▶</div>${cols}${e}`:''}</div></div>`}
const fxTotal=T=>{const{G,Q}=fxPlan(T);let t=Q?Q-1:0;for(let g=0;g<G;g++){const z=Math.floor(T/G)+(g<T%G?1:0);t+=z*(z-1)/2}return t};
function ensureDraft(){const T=Math.floor(S.players.length/2),ids=new Set(S.players.map(p=>p.id));
  S.draft=(S.draft||[]).slice(0,T).map(r=>r.map(i=>ids.has(i)?i:0));while(S.draft.length<T)S.draft.push([0,0])}
const modeSel=()=>{const m=S.settings,b=(k,cur,v,t,sub)=>`<button data-${k}="${v}" aria-selected="${cur===v}"><b>${t}</b><small>${sub}</small></button>`;
  return`<div class="ctabs" role="tablist" aria-label="Tipo de juego">${b('mode',m.mode||'rot','rot','Rotatorio','individual')}${b('mode',m.mode||'rot','fixed','Parejas fijas','por pareja')}</div>`
  +(FX()?`<div class="ctabs" role="tablist" aria-label="Formación de parejas">${b('pm',m.pairing||'random','random','Aleatorias','sorteo')}${b('pm',m.pairing||'random','manual','Manuales','las eliges tú')}</div>`:'')};
const pairsCard=()=>{if(!FX()||S.settings.pairing!=='manual')return'';ensureDraft();const used=new Set(S.draft.flat());
  const sel=(i,j)=>`<select data-dr="${i}-${j}" aria-label="Pareja ${i+1}, jugador ${j+1}"><option value="0">—</option>${S.players.filter(p=>p.id===S.draft[i][j]||!used.has(p.id)).map(p=>`<option value="${p.id}"${p.id===S.draft[i][j]?' selected':''}>${esc(p.name)}</option>`).join('')}</select>`;
  return`<div class="card"><h3>Parejas</h3>${S.draft.length?S.draft.map((r,i)=>`<div class="row" style="margin:8px 0"><b class="fix">${i+1}</b>${sel(i,0)}${sel(i,1)}</div>`).join(''):'<p class="mut">Añade jugadores para formar parejas.</p>'}${S.players.length%2?'<p class="err">Hace falta un número par de jugadores.</p>':''}</div>`};
const fxMore=()=>`<div class="card">${S.teams.map(t=>`<div style="margin:10px 0"><span class="tag">Pareja ${t.id}</span><div class="row" style="margin-top:6px">${t.p.map(i=>`<input value="${esc(nameOf(i))}" data-ren="${i}" aria-label="Nombre">`).join('')}</div></div>`).join('')}</div>`;
function stats(){
  if(FX()){const st={};(S.teams||[]).forEach(t=>st[t.id]={p:{id:t.id,name:t.p.map(nameOf).join(' y ')},g:0,w:0,l:0,pf:0,pa:0,pt:new Set()});
    S.matches.filter(m=>m.status==='done').forEach(m=>[[m.ta,m.sa,m.sb],[m.tb,m.sb,m.sa]].forEach(([t,f,c])=>{const s=st[t];if(!s)return;s.g++;s.pf+=f;s.pa+=c;f>c?s.w++:s.l++}));
    const ko=S.matches.filter(m=>m.ph==='ko');Object.values(st).forEach(s=>s.lv=5);
    ko.forEach(m=>[m.ta,m.tb].forEach(t=>{if(st[t]&&st[t].lv>4)st[t].lv=4}));
    ko.filter(m=>m.status==='done').forEach(m=>{const w=m.sa>m.sb?m.ta:m.tb,l=m.sa>m.sb?m.tb:m.ta;if(st[l])st[l].lv=m.ko===1?1:m.ko===2?2:3;if(m.ko===1&&st[w])st[w].lv=0});
    return Object.values(st)}
  const st={};S.players.forEach(p=>st[p.id]={p,g:0,w:0,l:0,pf:0,pa:0,pt:new Set()});
  S.matches.filter(m=>m.status==='done').forEach(m=>{
    [[m.a,m.sa,m.sb],[m.b,m.sb,m.sa]].forEach(([t,f,c])=>t.forEach(id=>{const s=st[id];if(!s)return;s.g++;s.pf+=f;s.pa+=c;f>c?s.w++:s.l++;s.pt.add(t[0]===id?t[1]:t[0])}));});
  return Object.values(st);
}
const rate=s=>s.g?s.w/s.g:0,dif=s=>s.g?(s.pf-s.pa)/s.g:0;
const rk=s=>s.lv<=3?'L'+s.lv:(s.lv||0)+'|'+rate(s).toFixed(3)+'|'+dif(s).toFixed(3);
function ranking(){return stats().sort((x,y)=>(x.lv||0)-(y.lv||0)||rate(y)-rate(x)||dif(y)-dif(x)||y.pf-x.pf)}

/* ---------- Vistas ---------- */
const bar=()=>{const t=S.matches.length,d=S.matches.filter(m=>m.status!=='pending').length;return`<div class="bar"><i style="width:${t?d/t*100:0}%"></i></div><span class="mut">${d} de ${t} partidos resueltos</span>`};
function render(){
  const f={home:vHome,setup:vSetup,game:vGame,more:vMore,final:vFinal}[view];
  $('#app').innerHTML=header()+f()+(err?`<div class="err">${esc(err)}</div>`:'');err='';if(view==='home')initPong('pong',null,true);
  if(msg){toast(msg);msg=''}
}
let PG={u:0,c:0};
function initPong(cid,hid,pre){
  const c=document.getElementById(cid);if(!c)return;const x=c.getContext('2d'),d=window.devicePixelRatio||1,hint=hid&&document.getElementById(hid);
  let W=0,H=0,k=1,PW,PH,UY,CY,NY,RI,RP;if(!pre)PG.u=PG.c=0;const WIN=7,HIT=()=>PW/2+s.r*.7,s={m:'idle',bx:0,by:0,vx:0,vy:0,r:0,a:0,sp:300,ux:0,cx:0,t:0,dir:-1,err:0};
  const V=()=>Math.min(2.2,Math.max(1,H/300)),say=t=>{if(hint)hint.textContent=t},idle=()=>{s.bx=W/2;s.by=H*.64};
  function fit(){const w=c.clientWidth,h=c.clientHeight;if(!w||!h||(w===W&&h===H))return;const first=!W;W=w;H=h;c.width=W*d;c.height=H*d;x.setTransform(d,0,0,d,0,0);
    k=Math.max(1,Math.min(1.8,H/380));PW=Math.max(44,Math.min(58*k,W*.17));PH=12*k;UY=H-26*k;CY=26*k;NY=H/2;RI=34*k;RP=14*k;
    if(first){s.ux=s.cx=W/2;s.r=RI}if(first||s.m==='idle'||s.m==='over')idle();s.ux=Math.min(Math.max(s.ux,PW/2),W-PW/2)}
  say('Toca la pelota para jugar contra el ordenador (a 7 puntos)');
  const ptr=e=>{const q=c.getBoundingClientRect();s.ux=Math.max(PW/2,Math.min(W-PW/2,e.clientX-q.left));return[e.clientX-q.left,e.clientY-q.top]};
  if(!pre){c.addEventListener('pointermove',ptr);
    c.addEventListener('pointerdown',e=>{const[px,py]=ptr(e);if((s.m==='idle'||s.m==='over')&&Math.hypot(px-s.bx,py-s.by)<s.r+24*k){if(s.m==='over')PG.u=PG.c=0;start(-1)}})}
  function start(dir){s.m='play';s.sp=300;const n=Math.random()-.5,v=s.sp*V();s.vx=n*v;s.vy=dir*Math.sqrt(v*v-s.vx*s.vx);s.err=0;say('Mueve tu pala (la de abajo) con el dedo o el ratón')}
  function point(u){u?PG.u++:PG.c++;
    if(PG.u>=WIN||PG.c>=WIN){s.m='over';idle();s.vx=s.vy=0;say(PG.u>PG.c?`¡Ganaste ${PG.u}-${PG.c}! Toca la pelota para jugar otra vez`:`Gana el ordenador ${PG.c}-${PG.u}. Toca la pelota para la revancha`);return}
    s.m='wait';s.t=.8;s.bx=W/2;s.by=H/2;s.vx=s.vy=0;s.dir=u?-1:1}
  function step(dt){
    s.a+=dt*(s.m==='play'?4:.3);
    s.r+=((s.m==='idle'||s.m==='over'?RI:RP)-s.r)*Math.min(1,dt*8);
    if(s.m==='wait'){s.t-=dt;if(s.t<=0)start(s.dir);return}
    const tx=s.m==='play'&&s.vy<0?s.bx+s.err:W/2,mv=(90+s.sp*.6)*V()*dt;s.cx+=Math.max(-mv,Math.min(mv,tx-s.cx));s.cx=Math.max(PW/2,Math.min(W-PW/2,s.cx));
    if(s.m!=='play')return;
    s.bx+=s.vx*dt;s.by+=s.vy*dt;
    if(s.bx<s.r){s.bx=s.r;s.vx=Math.abs(s.vx)}if(s.bx>W-s.r){s.bx=W-s.r;s.vx=-Math.abs(s.vx)}
    const bounce=(px,dir)=>{const n=Math.max(-1,Math.min(1,(s.bx-px)/(PW/2)));s.sp=Math.min(640,s.sp+22);const v=s.sp*V();s.vx=n*v*.75;s.vy=dir*Math.sqrt(v*v-s.vx*s.vx);if(dir<0){const f=1.24+.2*Math.min(1,Math.max(0,(s.sp-300)/340));s.err=(Math.random()-.5)*2*HIT()*f}};
    if(s.vy>0&&s.by+s.r>=UY-PH/2&&s.by<UY+PH&&Math.abs(s.bx-s.ux)<HIT())bounce(s.ux,-1);
    if(s.vy<0&&s.by-s.r<=CY+PH/2&&s.by>CY-PH&&Math.abs(s.bx-s.cx)<HIT())bounce(s.cx,1);
    if(s.by>H+s.r)point(0);else if(s.by<-s.r)point(1)}
  const pad=(px,py)=>{x.beginPath();x.roundRect?x.roundRect(px-PW/2,py-PH/2,PW,PH,7):x.rect(px-PW/2,py-PH/2,PW,PH);x.fillStyle='#ff5fa2';x.fill();x.lineWidth=3;x.strokeStyle='#f8e81c';x.stroke()};
  function ball(){const r=s.r,g=x.createRadialGradient(s.bx-r*.3,s.by-r*.3,r*.1,s.bx,s.by,r);g.addColorStop(0,'#e8ff7a');g.addColorStop(1,'#a9c81d');
    x.fillStyle=g;x.beginPath();x.arc(s.bx,s.by,r,0,7);x.save();x.translate(s.bx,s.by);x.rotate(s.a);const u=r/50;
    const h=(px,py,rx,ry,a)=>{x.moveTo((px+rx*Math.cos(a))*u,(py+rx*Math.sin(a))*u);x.ellipse(px*u,py*u,rx*u,ry*u,a,0,7)};
    h(0,0,7,9,0);for(let i=0;i<6;i++){const a=i/6*6.2832;h(23*Math.cos(a),23*Math.sin(a),6,9,a)}
    for(let i=0;i<10;i++){const a=(i+.5)/10*6.2832;h(38*Math.cos(a),38*Math.sin(a),4,7,a)}x.restore();x.fill('evenodd')}
  function draw(){
    x.clearRect(0,0,W,H);x.fillStyle='#2a62ad';x.fillRect(0,0,W,NY);x.fillStyle='#2f6fbd';x.fillRect(0,NY,W,H-NY);
    x.fillStyle='rgba(255,255,255,.8)';x.fillRect(W*.08,H*.06,W*.84,3);x.fillRect(W*.08,H*.94-3,W*.84,3);
    const g=12*k;x.fillStyle='rgba(14,28,51,.18)';x.fillRect(0,NY-g,W,g*2.8);x.strokeStyle='rgba(14,28,51,.55)';x.lineWidth=1.5;x.beginPath();
    for(let i=0;i<W;i+=g){x.moveTo(i,NY-g*.7);x.lineTo(i,NY+g*1.8)}for(let j=NY-g*.7;j<=NY+g*1.8;j+=g){x.moveTo(0,j);x.lineTo(W,j)}x.stroke();
    x.fillStyle='#fff';x.fillRect(0,NY-g,W,g/2);pad(s.cx,CY);pad(s.ux,UY);
    x.font=`900 ${22*k}px "Arial Black",sans-serif`;x.textAlign='left';x.fillStyle='rgba(255,255,255,.9)';x.fillText('PC '+PG.c,12,NY-g*1.8);x.fillText('TÚ '+PG.u,12,NY+g*4.2);
    if(s.m==='over'){const w=PG.u>PG.c;x.fillStyle='rgba(14,28,51,.78)';x.fillRect(0,0,W,H);x.textAlign='center';
      x.fillStyle='#d4f53c';x.font=`900 ${34*k}px "Arial Black",sans-serif`;x.fillText(w?'¡GANASTE!':'GANA EL PC',W/2,H*.26);
      x.fillStyle='#fff';x.font=`900 ${64*k}px "Arial Black",sans-serif`;x.fillText(PG.u+' - '+PG.c,W/2,H*.26+72*k);
      x.font=`700 ${Math.min(15*k,W/20)}px "Trebuchet MS",sans-serif`;x.fillText('Toca la pelota para jugar otra vez',W/2,H*.26+104*k);x.textAlign='left'}
    ball()}
  let last=performance.now();
  (function f(now){if(!document.body.contains(c))return;fit();if(W){const dt=Math.min(.033,(now-last)/1000);step(dt);draw()}last=now;requestAnimationFrame(f)})(last);
}
function header(){
  const t=S.started?[['home','Inicio'],['go','Partido'],['more','Jugadores'],['final','Resumen']]:[['home','Inicio'],['setup','Preparar'],['final','Resumen']];
  const cur={home:'home',game:'go',more:'more',final:'final',setup:'setup'}[view];
  return`<header class="top"><div class="mark">PICKLE<b>&amp;MIX</b></div><nav class="tabs" aria-label="Acceso rápido">${t.map(x=>`<button data-a="${x[0]}"${x[0]===cur?' aria-current="page"':''}>${x[1]}</button>`).join('')}</nav></header>`}
function vHome(){const n=S.players.length,c=S.settings;
  return`<div class="banner"><canvas id="pong" aria-hidden="true"></canvas></div><button class="btn ball" data-a="play">JUGAR</button><p class="sub">${FX()?'Parejas fijas, grupos y eliminatorias, muchas risas.':'Parejas rotatorias, cero eliminatorias, muchas risas.'}</p>
  <div class="card"><div class="big">${n}</div><div>jugadores inscritos</div><div class="chips" style="margin-top:12px"><span class="chip">${c.courts} pista${c.courts>1?'s':''}</span><span class="chip">a ${c.points} puntos</span>${FX()?'':`<span class="chip">${c.cycles} ciclos</span>`}<span class="chip">${FX()?'grupos + eliminatorias':'parejas rotatorias'}</span></div></div>
  ${S.started?'<button class="btn ball" data-a="go">Continuar la quedada</button>':''}
  <button class="btn ghost" data-a="${S.started?'more':'setup'}">Gestionar participantes</button><p class="mut foot">Plataforma para pickleballers creada por <a href="https://kikebarcelodg.github.io/" target="_blank" rel="noopener">Kike Barceló</a></p>`}
function vSetup(){const c=S.settings,n=S.players.length,per=Math.floor(n/4)||0,T=Math.floor(n/2),tot=FX()?fxTotal(T):per*c.cycles;
  return`<h2>Prepara la quedada</h2>${modeSel()}
  <form class="card" data-f="add"><label class="mut">Añadir jugadores (uno o varios separados por comas o líneas)</label><div class="row"><input name="n" autocomplete="off" placeholder="Nombre"><button class="btn sm fix">Añadir</button></div></form>
  <div class="card">${n?S.players.map(p=>`<div class="row" style="margin:6px 0"><input value="${esc(p.name)}" data-ren="${p.id}" aria-label="Nombre"><button class="btn sm red fix" data-del="${p.id}" aria-label="Eliminar ${esc(p.name)}">✕</button></div>`).join(''):'<p class="mut">Aún no hay jugadores. Añade al menos 4 para empezar.</p>'}</div>
  ${pairsCard()}
  <div class="card"><div class="row"><label>Pistas<input type="number" min="1" max="4" value="${c.courts}" data-set="courts"></label><label>Puntos<input type="number" min="3" max="21" value="${c.points}" data-set="points"></label>${FX()?'':`<label>Ciclos<input type="number" min="1" max="10" value="${c.cycles}" data-set="cycles"></label>`}</div></div>
  ${FX()?fxFlow():''}
  <div class="ok"><b>${n} jugadores</b> · ${FX()?'':c.cycles+' ciclos · '}<b>${tot} partidos previstos</b><br><span class="mut">Planificación orientativa: no garantiza el mismo descanso para todos.</span></div>
  <button class="btn ball" data-a="start" ${n<4?'disabled':''}>Generar calendario</button>
  <button class="btn ghost" data-a="home">Volver</button>`}
function vGame(){
  const lv=live(),em=ed&&S.matches.find(x=>x.id===ed),m=em||lv.find(x=>x.court===ct)||lv[0];if(m&&!em)ct=m.court;
  if(!m)return`<div class="logo">¡FIN!</div><p class="sub">No quedan partidos pendientes.</p><button class="btn ball" data-a="final">Ver resumen final</button>${FX()?'':'<button class="btn ghost" data-a="extra">Añadir otro ciclo</button>'}<nav><button class="btn ghost sm" data-a="more">Jugadores y copia</button></nav>`;
  tmp=SC[m.id]||(SC[m.id]={id:m.id,a:m.sa??0,b:m.sb??0});
  const idx=S.matches.indexOf(m)+1,nx=pending().find(x=>x!==m&&!lv.includes(x)),
  ctabs=!em&&lv.length>1?`<div class="ctabs" role="tablist" aria-label="Pistas en juego">${lv.map(x=>{const t=SC[x.id];return`<button role="tab" data-ct="${x.court}" aria-selected="${x===m}"><b>Pista ${x.court}</b><small>${t&&(t.a||t.b)?t.a+' - '+t.b:'en juego'}</small></button>`}).join('')}</div>`:'',tm=(t,c,l)=>`<div class="team ${c}"><div class="mut" style="color:#fff">${l}</div><div class="n">${t.map(i=>esc(nameOf(i))).join('<br>')}</div><div class="sc"><button data-sc="${c}-1" aria-label="Restar">−</button><output>${tmp[c]}</output><button data-sc="${c}1" aria-label="Sumar">+</button></div></div>`;
  return`${ctabs}<div class="head"><h2>Partido ${idx}</h2><span class="chip">${FX()?(m.lbl||'Grupo A'):'Ciclo '+m.cycle} · Pista ${m.court}</span></div>${bar()}
  ${tm(m.a,'a','Pareja A')}<div class="vs">contra</div>${tm(m.b,'b','Pareja B')}
  <button class="btn ball" data-a="ok">${m.status==='done'?'Guardar corrección':'Confirmar resultado'}</button>
  <div class="row">${m.ph==='ko'?'':'<button class="btn ghost" data-a="skip">Saltar partido</button>'}${m.status==='done'?'<button class="btn ghost" data-a="cancel">Cancelar</button>':''}</div>
  ${nx?`<div class="card pend"><span class="mut">${lv.length>1?'En cola:':'Después:'}</span><br><b>${nx.a.map(nameOf).map(esc).join(' y ')}</b> vs <b>${nx.b.map(nameOf).map(esc).join(' y ')}</b></div>`:''}
  ${!em&&nx&&lv.length<S.settings.courts?'<p class="mut">Hay una pista libre: el siguiente partido necesita a jugadores que todavía están en pista. Empezará cuando terminen.</p>':''}
  ${FX()?fxFlow():''}
  <nav><button class="btn ghost sm" data-a="more">Jugadores y copia</button></nav>`}
function vMore(){
  const done=S.matches.filter(m=>m.status!=='pending');
  return`<h2>Jugadores y copia</h2><p class="mut">${FX()?'Parejas fijas: aquí puedes corregir nombres y resultados.':'Cualquier cambio recalcula solo los partidos pendientes.'}</p>
  ${FX()?fxMore():`<div class="card">${S.players.map(p=>`<div style="margin:10px 0"><div class="row"><input value="${esc(p.name)}" data-ren="${p.id}" aria-label="Nombre"><span class="tag fix">${{rest:'Descansa',out:'Se marcha'}[p.status]||'Juega'}</span></div>
  <button class="btn sm ghost" data-st="${p.id}-rest">${p.status==='rest'?'Vuelve':'Descansa'}</button><button class="btn sm ghost" data-st="${p.id}-out">${p.status==='out'?'Ha vuelto / llega':'Se marcha'}</button><button class="btn sm red" data-pd="${p.id}">Quitar</button></div>`).join('')}
  <form data-f="addlive" class="row"><input name="n" placeholder="Nueva persona" autocomplete="off"><button class="btn sm fix">Añadir</button></form></div>`}
  <div class="card"><h3>Resultados</h3>${done.length?done.map(m=>`<div class="row" style="margin:6px 0"><span>${S.matches.indexOf(m)+1}. ${m.a.map(nameOf).map(esc).join('/')} <b>${m.status==='done'?m.sa+'-'+m.sb:''}</b> ${m.b.map(nameOf).map(esc).join('/')} ${m.status==='skipped'?'<span class="tag s">no disputado</span>':''}</span><button class="btn sm ghost fix" data-edit="${m.id}">Editar</button></div>`).join(''):'<p class="mut">Todavía no hay partidos resueltos.</p>'}</div>
  <button class="btn ghost" data-a="backup">Descargar copia (JSON)</button>
  <label class="btn ghost" style="text-align:center">Recuperar copia<input type="file" accept=".json,application/json" data-imp hidden></label>
  <button class="btn ball" data-a="final">Ver resumen final</button>
  <button class="btn red" data-a="reset">Nueva quedada (borra todo)</button>
  <button class="btn ghost" data-a="${S.started?'go':'home'}">Volver</button>`}
function summary(){
  const r=ranking(),dn=S.matches.filter(m=>m.status==='done'),aw=[];let pos=0;
  const rows=r.map((s,i)=>{if(i===0||rk(s)!==rk(r[i-1]))pos=i+1;s.pos=pos;return s});
  const open=FX()&&S.teams.length>2&&!S.matches.some(m=>m.ko===1&&m.status==='done'),top=open?[]:rows.filter(s=>s.pos===1&&s.g>0),names=a=>a.map(s=>s.p.name).join(FX()?' · ':' y ');
  if(dn.length){
    const mx=Math.max(...rows.map(s=>s.pt.size)),mn=Math.min(...rows.map(s=>s.pt.size)),u=rows.filter(s=>s.pt.size===mx);
    if(!FX()&&mx>mn)aw.push(['Compañero universal',`${names(u)}: ${mx} compañeros distintos`]);
    const t=dn.reduce((a,b)=>Math.abs(b.sa-b.sb)<Math.abs(a.sa-a.sb)?b:a);
    aw.push(['Partido más ajustado',`${t.a.map(nameOf).join('/')} ${t.sa}-${t.sb} ${t.b.map(nameOf).join('/')}`]);}
  return{rows,dn,top,aw,names};
}
const sg=n=>(n>0?'+':'')+n;
function podium(rows){
  const slots=[[2,'silver','🥈'],[1,'gold','🥇'],[3,'bronze','🥉']].map(([p,c,m])=>[p,c,m,rows.filter(s=>s.pos===p&&s.g>0)]).filter(x=>x[3].length);
  if(!slots.length)return'';
  return`<div class="podium" role="group" aria-label="Podio">${slots.map(([p,c,m,l])=>`<div class="pod ${c}"><div class="nm">${l.map(s=>esc(s.p.name)).join('<br>')}</div><div class="rec">${l[0].w}-${l[0].l} · ${sg(l[0].pf-l[0].pa)}</div><div class="blk"><span>${m}</span><b>${p}</b></div></div>`).join('')}</div>`}
function vFinal(){
  const{rows,dn,top,aw,names}=summary(),share=!!(navigator.canShare&&typeof File==='function'&&navigator.canShare({files:[new File([''],'a.jpg',{type:'image/jpeg'})]}));
  return`<h2>Resumen</h2>
  ${top.length?`<div class="card" style="background:var(--ball)"><div class="mut" style="color:var(--ink)">${top.length>1?'Ganadores (empate)':'Ganador/a'}</div><div class="big">🏆 ${esc(names(top))}</div><div>${top[0].w} victorias · diferencia de puntos ${sg(top[0].pf-top[0].pa)}</div></div>`:'<p class="mut">El ganador aparecerá cuando haya resultados.</p>'}
  ${podium(rows)}
  <div class="card"><b>${dn.length}</b> partidos disputados<table><tr><th>#</th><th>${FX()?'Pareja':'Jugador'}</th><th>V-D</th><th>Dif.</th><th>${FX()?'PJ':'Compañeros'}</th></tr>${rows.map(s=>`<tr><td>${s.pos}</td><td>${esc(s.p.name)}</td><td>${s.w}-${s.l}</td><td>${sg(s.pf-s.pa)}</td><td>${FX()?s.g:s.pt.size}</td></tr>`).join('')}</table>
  <p class="mut">${FX()?'Parejas fijas: fase de grupos y eliminatorias. El orden final lo decide la eliminatoria; el resto, por victorias y diferencia de puntos.':'Todos juegan los mismos partidos con parejas distintas. Gana quien más victorias suma; si hay empate, decide la diferencia de puntos (puntos a favor menos en contra).'}</p></div>
  ${aw.map(a=>`<div class="ok"><b>🏅 ${a[0]}</b><br>${esc(a[1])}</div>`).join('')}
  ${dn.length?`<button class="btn ball" data-a="story">Descargar imagen para Stories (JPG)</button>${share?'<button class="btn ghost" data-a="storyshare">Compartir imagen…</button>':''}`:''}
  <button class="btn ghost" data-a="${S.started?'go':'home'}">Volver</button>`}

/* ---------- Imagen para Instagram Stories (1080x1920) ---------- */
function storyCanvas(){
  const W=1080,H=1920,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const{rows,dn,top,aw,names}=summary(),HF='"Arial Black",Impact,sans-serif',BF='"Trebuchet MS",system-ui,sans-serif',INK='#0e1c33',NAVY='#12325e',LIME='#d4f53c',MUT='#5b6b82';
  const rr=(a,b,w,h,r,f)=>{x.beginPath();x.roundRect?x.roundRect(a,b,w,h,r):x.rect(a,b,w,h);x.fillStyle=f;x.fill()};
  const card=(a,b,w,h,f)=>{rr(a,b+8,w,h,44,'#d5deea');rr(a,b,w,h,44,f)};
  const fit=(t,max,font,size,min)=>{let z=size;do{x.font=font.replace('#',z);if(x.measureText(t).width<=max)return t;z-=2}while(z>=min);
    x.font=font.replace('#',min);while(t.length>1&&x.measureText(t+'…').width>max)t=t.slice(0,-1);return t+'…'};
  x.fillStyle='#eef3f8';x.fillRect(0,0,W,H);
  /* cabecera como la barra superior de la app */
  rr(0,-60,W,440,60,NAVY);
  x.save();x.translate(64,232);x.textBaseline='alphabetic';x.font=`900 92px ${HF}`;x.fillStyle='#fff';x.fillText('PICKLE',0,0);
  const w1=x.measureText('PICKLE').width;x.font=`900 92px ${HF}`;const w2=x.measureText('&MIX').width;
  x.save();x.translate(w1+10+w2/2,-32);x.rotate(.05);rr(-w2/2-14,-70,w2+28,104,24,LIME);x.fillStyle=INK;x.textAlign='center';x.fillText('&MIX',0,0);x.restore();x.restore();
  x.textAlign='left';x.fillStyle='rgba(255,255,255,.85)';x.font=`700 34px ${BF}`;
  x.fillText('RESUMEN FINAL · '+new Date().toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'}).toUpperCase(),64,306);
  let y=420;
  /* ganador */
  if(top.length){
    card(48,y,W-96,236,LIME);x.fillStyle=INK;x.font=`800 30px ${BF}`;x.fillText(top.length>1?'GANADORES (EMPATE)':'GANADOR/A',92,y+54);
    const t=fit(names(top),W-96-44-240,`900 #px ${HF}`,84,40);x.fillText(t,92,y+138);
    x.font=`700 32px ${BF}`;x.fillText(`${top[0].w} victorias · diferencia ${sg(top[0].pf-top[0].pa)}`,92,y+194);
    /* pelota */
    const bx=W-48-110,by=y+118,r=70,g=x.createRadialGradient(bx-r*.3,by-r*.3,r*.1,bx,by,r);g.addColorStop(0,'#f2ff9a');g.addColorStop(1,'#a9c81d');
    x.fillStyle=g;x.beginPath();x.arc(bx,by,r,0,7);x.fill();x.lineWidth=5;x.strokeStyle=NAVY;x.stroke();x.fillStyle=NAVY;
    [[0,0],[-32,-8],[32,-8],[-16,30],[16,30],[0,-40],[-46,22],[46,22]].forEach(([a,b])=>{x.beginPath();x.arc(bx+a,by+b,6,0,7);x.fill()});
    y+=236+26;}
  /* podio (igual que en la pantalla de Resumen: 2º · 1º · 3º, con empates apilados) */
  const slots=[[2,'#cfd8e3','🥈',130],[1,LIME,'🥇',172],[3,'#f0b88c','🥉',96]].map(([p,f,m,bh])=>({p,f,m,bh,l:rows.filter(s=>s.pos===p&&s.g>0)})).filter(o=>o.l.length);
  if(slots.length){
    const gap=16,k=slots.length,cw=(W-96-gap*(k-1))/k,NL=40,RC=34,ph=Math.max(...slots.map(o=>o.l.length*NL+RC+8+o.bh)),yb=y+ph;
    slots.forEach((o,i)=>{
      const x0=48+i*(cw+gap),mx=x0+cw/2;
      x.fillStyle='#d5deea';x.beginPath();x.roundRect?x.roundRect(x0,yb-o.bh+4,cw,o.bh,[28,28,0,0]):x.rect(x0,yb-o.bh+4,cw,o.bh);x.fill();
      x.fillStyle=o.f;x.beginPath();x.roundRect?x.roundRect(x0,yb-o.bh,cw,o.bh,[28,28,0,0]):x.rect(x0,yb-o.bh,cw,o.bh);x.fill();
      x.textAlign='center';x.textBaseline='alphabetic';x.fillStyle=INK;
      x.font=`400 34px ${BF}`;x.fillText(o.m,mx,yb-o.bh+46);
      x.font=`900 38px ${HF}`;x.fillText(o.p,mx,yb-o.bh+86);
      x.fillStyle=MUT;x.font=`700 24px ${BF}`;x.fillText(`${o.l[0].w}-${o.l[0].l} · ${sg(o.l[0].pf-o.l[0].pa)}`,mx,yb-o.bh-12);
      x.fillStyle=INK;
      o.l.forEach((s,j)=>{const t=fit(s.p.name,cw-16,`900 #px ${HF}`,32,16);x.fillText(t,mx,yb-o.bh-12-RC+4-(o.l.length-1-j)*NL)});
    });
    y+=ph+24;}
  x.textAlign='left';
  /* tabla: altura de fila adaptada al nº de jugadores */
  const LIM=1740,FOOT=70,n=rows.length;let awH=aw.length?28+aw.length*50+22:0,rh=(LIM-y-awH-FOOT-90-44)/n;
  if(rh<38)rh=(1830-y-awH-FOOT-90-44)/n; /* primero se aprovecha el margen inferior para conservar los premios */
  if(rh<30){awH=0;rh=(LIM-y-FOOT-90-44)/n;if(rh<30)rh=Math.max(26,(1860-y-FOOT-90-44)/n)}rh=Math.min(86,rh);
  const th=90+n*rh+44,fs=Math.max(22,Math.min(38,rh*.56));
  card(48,y,W-96,th,'#fff');
  const cx={p:96,n:176,vd:700,df:830,cp:980};
  x.fillStyle=MUT;x.font=`800 26px ${BF}`;x.textAlign='left';x.fillText('#',cx.p,y+62);x.fillText(FX()?'PAREJA':'JUGADOR',cx.n,y+62);
  x.textAlign='right';x.fillText('V-D',cx.vd,y+62);x.fillText('DIF.',cx.df,y+62);x.fillText(FX()?'PJ':'COMP.',cx.cp,y+62);
  rows.forEach((s,i)=>{
    const ry=y+90+i*rh,mid=ry+rh/2;
    x.fillStyle='#e1e8f1';x.fillRect(80,ry,W-160,2);
    if(s.pos===1&&s.g>0)rr(84,ry+4,W-168,rh-6,18,'#f3fcd0');
    x.textBaseline='middle';
    if(s.pos===1&&s.g>0){const d=Math.min(rh-12,56);rr(cx.p+14-d/2,mid-d/2,d,d,d/2,LIME)}
    x.fillStyle=INK;x.textAlign='center';x.font=`900 ${fs}px ${HF}`;x.fillText(s.pos,cx.p+14,mid);x.textAlign='left';
    x.font=`700 ${fs}px ${BF}`;x.fillText(fit(s.p.name,cx.vd-cx.n-150,`700 #px ${BF}`,fs,18),cx.n,mid);
    x.textAlign='right';x.font=`800 ${fs}px ${BF}`;x.fillText(`${s.w}-${s.l}`,cx.vd,mid);x.fillText(sg(s.pf-s.pa),cx.df,mid);x.fillText(FX()?s.g:s.pt.size,cx.cp,mid);
    x.textBaseline='alphabetic'});
  y+=th+20;
  /* premios */
  if(awH){rr(48,y,W-96,awH-6,28,'#e6f9b8');x.textBaseline='middle';x.textAlign='left';x.fillStyle=INK;
    aw.forEach((a,i)=>{const ly=y+14+25+i*50,h=a[0]+' · ';x.font=`800 28px ${BF}`;x.fillText(h,84,ly);const hw=x.measureText(h).width;
      x.font=`700 28px ${BF}`;x.fillText(fit(a[1],W-96-72-hw,`700 #px ${BF}`,28,18),84+hw,ly)});x.textBaseline='alphabetic';y+=awH}
  x.textAlign='center';x.fillStyle=MUT;x.font=`700 30px ${BF}`;x.fillText(`${dn.length} partidos disputados · ${FX()?'parejas fijas':'parejas rotatorias'}`,W/2,Math.min(H-50,y+44));
  return c;
}
function storyBlob(){return new Promise(res=>storyCanvas().toBlob(res,'image/jpeg',.92))}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');setTimeout(()=>e.classList.remove('on'),3200)}

/* ---------- Acciones ---------- */
function addNames(txt){const names=txt.split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean);
  names.forEach(n=>S.players.push({id:S.nid++,name:n.slice(0,24),status:'active'}));return names.length}
function replan(why){const n=pending().length;rebuild(n);save();msg=why+' Planificación de partidos pendientes actualizada.'}
const A={
  play(){if($('#ov'))return;const o=document.createElement('div');o.id='ov';o.className='ov';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');
    o.innerHTML='<div class="ovh"><span>Pong de PICKLE&amp;MIX</span><button class="btn sm red" data-a="closeg">Cerrar ✕</button></div><canvas id="pong2"></canvas><p id="phint2"></p>';
    document.body.appendChild(o);document.body.style.overflow='hidden';initPong('pong2','phint2')},
  closeg(){const o=$('#ov');if(o)o.remove();document.body.style.overflow=''},
  setup(){view='setup'},home(){view='home'},go(){view='game';ed=null},more(){view='more'},final(){view='final'},
  start(){const c=S.settings;if(S.players.length<4){err='Necesitas al menos 4 jugadores.';return}
    if(S.players.length<4*c.courts){err=`Con ${c.courts} pistas necesitas al menos ${4*c.courts} jugadores.`;return}
    if(FX()&&S.players.length%2){err='Con parejas fijas necesitas un número par de jugadores.';return}
    if(FX()&&c.pairing==='manual'){ensureDraft();if(S.draft.some(r=>!r[0]||!r[1])){err='Completa todas las parejas.';return}}
    S.players.forEach(p=>p.status='active');S.matches=[];
    if(FX()){const ids=S.players.map(p=>p.id);let pr=[];
      if(c.pairing==='manual')pr=S.draft.map(r=>r.slice());
      else{for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]]}for(let i=0;i<ids.length;i+=2)pr.push([ids[i],ids[i+1]])}
      S.teams=pr.map((p,i)=>({id:i+1,p}));fxBuild()}
    else rebuild(Math.floor(S.players.length/4)*c.cycles);
    S.started=true;SC={};ed=null;ct=1;view='game'},
  extra(){if(FX())return;rebuild(pending().length+Math.floor(active().length/4));ed=null;view='game'},
  ok(){const m=S.matches.find(x=>x.id===tmp.id),p=S.settings.points,{a,b}=tmp;
    if(a===b||Math.max(a,b)<p){err=`El ganador debe llegar al menos a ${p} puntos y no puede haber empate.`;return}
    m.sa=a;m.sb=b;m.status='done';delete SC[m.id];ed=null;tmp=null;view='game';fxAdvance()},
  skip(){if(!confirm('¿Marcar este partido como no disputado?'))return;const m=S.matches.find(x=>x.id===tmp.id);m.status='skipped';m.sa=m.sb=null;delete SC[m.id];ed=null;tmp=null;fxAdvance()},
  cancel(){if(tmp)delete SC[tmp.id];ed=null;tmp=null},
  story(){storyBlob().then(b=>{if(!b){toast('No se pudo crear la imagen.');return}const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='pickle-and-mix-resumen-stories.jpg';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);toast('Imagen descargada.')})},
  storyshare(){storyBlob().then(b=>{const f=new File([b],'pickle-and-mix-resumen-stories.jpg',{type:'image/jpeg'});navigator.share({files:[f],title:'PICKLE & MIX'}).catch(()=>{})})},
  backup(){const u=URL.createObjectURL(new Blob([JSON.stringify(S)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='pickle-and-mix-copia.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)},
  reset(){if(confirm('Se borrarán jugadores, partidos y resultados. ¿Seguro?')&&confirm('Última comprobación: ¿empezar una quedada nueva?')){S=fresh();SC={};ed=null;ct=1;tmp=null;view='home'}}
};
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-a],[data-sc],[data-ct],[data-del],[data-st],[data-pd],[data-edit],[data-mode],[data-pm]');if(!t)return;const d=t.dataset;
  if(d.a)A[d.a]();
  else if(d.sc){const c=d.sc[0],v=+d.sc.slice(1);tmp[c]=Math.max(0,Math.min(99,tmp[c]+v));$('#app').innerHTML=header()+vGame();return}
  else if(d.ct){ct=+d.ct;ed=null}
  else if(d.mode)S.settings.mode=d.mode;
  else if(d.pm)S.settings.pairing=d.pm;
  else if(d.del)S.players=S.players.filter(p=>p.id!==+d.del);
  else if(d.edit){const m=S.matches.find(x=>x.id===+d.edit);if(m.status==='skipped')m.status='pending';delete SC[m.id];ed=m.id;view='game'}
  else if(d.st){const[i,s]=d.st.split('-'),p=S.players.find(x=>x.id==i);p.status=p.status===s?'active':s;replan(p.name+(p.status==='active'?' vuelve a jugar.':p.status==='rest'?' descansa.':' se marcha.'))}
  else if(d.pd){const p=S.players.find(x=>x.id==d.pd);if(!confirm(`¿Quitar a ${p.name}? Sus partidos jugados se conservan.`))return;p.status='out';p.removed=true;S.players=S.players.filter(x=>x!==p||S.matches.some(m=>m.status==='done'&&[...m.a,...m.b].includes(p.id)));replan('Jugador quitado.')}
  save();render();
});
document.addEventListener('submit',e=>{e.preventDefault();const f=e.target.dataset.f,v=e.target.n.value;if(!v.trim())return;
  addNames(v);if(f==='addlive')replan('Jugador añadido.');save();render()});
document.addEventListener('change',e=>{const t=e.target;
  if(t.dataset.dr){const[i,j]=t.dataset.dr.split('-').map(Number);S.draft[i][j]=+t.value;save();render();return}
  if(t.dataset.ren){const p=S.players.find(x=>x.id==t.dataset.ren);if(t.value.trim())p.name=t.value.trim().slice(0,24);save();return}
  if(t.dataset.set){const k=t.dataset.set,v=Math.max(1,Math.min(+t.max,parseInt(t.value)||1));S.settings[k]=v;save();render();return}
  if('imp' in t.dataset){const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!valid(d))throw 0;if(!confirm('Se sustituirán los datos actuales. ¿Continuar?'))return;S=d;SC={};ed=null;ct=1;tmp=null;save();msg='Copia recuperada.';view=S.started?'game':'home'}catch(x){err='El archivo no es una copia válida de PICKLE & MIX.'}render()};r.readAsText(t.files[0])}
});
if(typeof document!=='undefined'&&document.getElementById('app'))render();
if(typeof module!=='undefined')module.exports={gen,trial};

document.addEventListener('keydown',e=>{if(e.key==='Escape')A.closeg()});
