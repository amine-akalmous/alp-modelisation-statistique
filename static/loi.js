/* ALP — page d'une loi : trois modes distincts
   Propriétés : définition + moments (aucune simulation)
   Simulation : tirage seulement au clic sur « Simuler »
   Application : vos données, ajustement */
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const tcache={};
const T=s=>s.startsWith("§")?`<span class="txt">${s.slice(1)}</span>`:(tcache[s]??=katex.renderToString(s,{throwOnError:false,displayMode:false}));

const LI=bySlug(window.ALP_LAW||"normale");
/* Appel à l'API Python (simulation, estimation) */
async function api(path,body){
  const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error(j&&j.error||"Le serveur n'a pas pu faire le calcul. Réessayez.");
  return j;
}
const st={law:LI,tab:"props",p:LAWS[LI].P.map(q=>q.v),sp:LAWS[LI].P.map(q=>q.v),simP:null,sample:null,n:500,seed:null,
  dirty:false,res:null,dres:null,data:null,dataText:"",col:0,reveal:1,grow:1,hx:null,model:null};
const L=()=>LAWS[st.law],D=()=>DOC[st.law];

/* ====== En-tête de la loi ====== */
function buildSwitch(){
  const a=(l,i)=>`<a href="/loi/${l.slug}" class="${i===st.law?"on":""}">${l.name}</a>`;
  $("#switch").innerHTML=LAWS.map((l,i)=>l.disc?a(l,i):"").join("")+`<span class="sep"></span>`+LAWS.map((l,i)=>l.disc?"":a(l,i)).join("");
  $("#switch .on")?.scrollIntoView({inline:"center",block:"nearest"});
}
function head(){
  $("#kind").textContent=L().disc?"Loi discrète":"Loi continue";
  $("#lawName").textContent=L().name;$("#lbName").textContent=L().name;
  $("#nt").innerHTML=T(D().nt);$("#lbNt").innerHTML=T(D().nt);
  $("#lede").innerHTML=`${D().desc} <a class="lnk" href="/guide#lire">Comment lire ces grandeurs ?</a>`;
  document.title=`${L().name} — ALP · Modélisation statistique`;
}
/* La barre des modes affiche le nom de la loi une fois le titre sorti de l'écran */
new IntersectionObserver(([e])=>$("#lawbar").classList.toggle("stuck",!e.isIntersecting),{rootMargin:"-70px 0px 0px 0px"}).observe($("#ltitle"));

$("#tabs").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b||b.dataset.t===st.tab)return;
  st.tab=b.dataset.t;document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("on",x===b));
  render(true);
  const top=$("#lawbar").getBoundingClientRect().top+scrollY-70;if(scrollY>top)scrollTo({top,behavior:reduce?"auto":"smooth"});
});

/* ====== Briques communes ====== */
const comma=v=>String(+(+v).toPrecision(6)).replace(".",",");
const fields=arr=>L().P.map((q,i)=>`<div class="field" id="f${i}"><label for="p${i}">${q.s}</label><input id="p${i}" data-i="${i}" inputmode="decimal" autocomplete="off" spellcheck="false" value="${comma(arr[i])}"><span class="rng">${q.d}</span></div>`).join("");
const cell=(c,h)=>`<div class="${c}">${h}</div>`;
/* Chaque cellule porte le nom de sa colonne (affiché quand le tableau s'empile sur petit écran) */
const table=(cols,head,rows,cls="")=>`<div class="def ${cls}">${head?`<div class="r h" style="--cols:${cols}">${head.map(h=>`<div>${h}</div>`).join("")}</div>`:""}${rows.map(r=>`<div class="r" style="--cols:${cols}">${r.map((c,i)=>head&&i>0?c.replace("<div ",`<div data-l="${head[i]}" `):c).join("")}</div>`).join("")}</div>`;
const kpi=(label,val,cls="",sub="")=>`<div class="kpi ${cls}"><small>${label}</small><strong>${val}</strong>${sub?`<span class="sub">${sub}</span>`:""}</div>`;
const plotCard=title=>`<div class="card plotcard"><div class="plothead"><span class="cardh">${title}</span></div><div class="plotbox"><canvas id="plot"></canvas><div class="tip" id="tip"></div></div><div class="legend" id="legend"></div></div>`;
function showErr(msg,bad){
  const e=$("#err");if(e){e.textContent=msg||"";e.classList.toggle("show",!!msg)}
  document.querySelectorAll(".field").forEach(f=>f.classList.remove("bad"));
  (bad||[]).forEach(id=>$("#"+id)?.classList.add("bad"));
}
/* Lit et valide les paramètres tapés ; renvoie le tableau ou null */
function readParams(){
  const raw=L().P.map((_,i)=>num($("#p"+i).value));
  const badNum=raw.map((v,i)=>Number.isFinite(v)?null:"f"+i).filter(Boolean);
  if(badNum.length){showErr("Saisissez un nombre valide (par exemple 2,5).",badNum);return null}
  if(!fin(raw)){showErr("Valeur trop grande (maximum 1 000 000 en valeur absolue).",L().P.map((_,i)=>"f"+i));return null}
  const msg=L().check(raw);if(msg){showErr(msg,L().P.map((_,i)=>"f"+i));return null}
  showErr("");return raw;
}

/* ====== Rendu d'un mode ====== */
function render(fresh){
  const v=$("#view");v.classList.toggle("anim",!!fresh);
  if(st.tab==="props")v.innerHTML=viewProps();
  else if(st.tab==="sim")v.innerHTML=viewSim();
  else v.innerHTML=viewData();
  if(st.tab==="props")propsResults();
  if(st.tab==="sim")simResults();
  if(st.tab==="data")parseData($("#ta").value);
  bindPlot();refresh();if(fresh)animate();
}

/* ---- Propriétés ---- */
function viewProps(){
  return`<section class="dsec"><h4><b>01</b>Définition</h4>${table("230px 1fr",null,[...D().rows,["Espérance",D().E],["Variance",D().V]].map(([k,f])=>[cell("k",k),cell("f",T(f))]),"defc")}</section>
  <section class="dsec"><h4><b>02</b>Moments pour des paramètres donnés</h4>
    <div class="work2">
      <div class="card box"><h5>Paramètres <em>tapez vos valeurs</em></h5>${fields(st.p)}<div class="err" id="err"></div><div class="kpis" id="kp" style="margin-top:6px"></div></div>
      ${plotCard(L().disc?"Fonction de masse":"Densité de probabilité")}
    </div>
    <div id="restab" style="margin-top:16px"></div>
  </section>`;
}
function propsResults(){
  const p=st.p,v=L().v(p);
  $("#kp").innerHTML=kpi("E[X] · ESPÉRANCE",fmt(L().m(p)),"hot wide")+kpi("Var(X) · VARIANCE",fmt(v),"hot")+kpi("σ · ÉCART-TYPE",fmt(Math.sqrt(v)),"hot");
  $("#restab").innerHTML=table("160px 1fr auto",["Grandeur","Relation","Valeur"],[
    [cell("k","Espérance"),cell("f",T(D().E)),cell("v",fmt(L().m(p)))],
    [cell("k","Variance"),cell("f",T(D().V)),cell("v",fmt(v))],
    [cell("k","Écart-type"),cell("f",T(String.raw`\sigma=\sqrt{\mathrm{Var}(X)}`)),cell("v",fmt(Math.sqrt(v)))]]);
}

/* ---- Simulation ---- */
function viewSim(){
  return`<section class="dsec"><h4><b>01</b>Échantillon</h4>
    <div class="work2">
      <div class="card box"><h5>Paramètres <em>tapez vos valeurs</em></h5>${fields(st.sp)}
        <div class="field" id="fn"><label for="nn">n</label><input id="nn" inputmode="numeric" autocomplete="off" value="${st.n}"><span class="rng">taille de l'échantillon, 2 à 100 000</span></div>
        <div class="field" id="fsd"><label for="sd" class="sm">graine</label><input id="sd" inputmode="numeric" autocomplete="off" placeholder="aucune" value="${st.seed??""}"><span class="rng">facultatif : la même graine redonne le même échantillon</span></div>
        <div class="err" id="err"></div>
        <button class="btn primary block" id="go">Simuler</button>
        <p class="hint" id="dirty"></p></div>
      ${plotCard("Distribution empirique")}
    </div></section>
  <div id="simres"></div>`;
}
function simResults(){
  $("#dirty").textContent=st.dirty?"Paramètres modifiés : cliquez sur « Simuler » pour tirer un nouvel échantillon.":"";
  $("#simres").innerHTML=st.res?statsSection(st.res.stats,"02")+estSection(st.res,st.simP,"03"):
    `<section class="dsec"><div class="empty">Aucun échantillon pour l'instant. Choisissez les paramètres et la taille n, puis cliquez sur « Simuler ».</div></section>`;
  if(st.res)drawConv(true);
}
async function simulate(){
  const p=readParams();if(!p)return;
  const n=num($("#nn").value);
  if(!(isInt(n)&&n>=2&&n<=100000))return showErr("n doit être un entier compris entre 2 et 100 000.",["fn"]);
  const sv=$("#sd").value.trim(),sd=sv===""?null:num(sv);
  if(sd!==null&&!(isInt(sd)&&sd>=0&&sd<2**32))return showErr("La graine doit être un entier positif (ou laissée vide).",["fsd"]);
  const go=$("#go");go.disabled=true;go.textContent="Calcul en cours…";
  try{
    const res=await api("/api/simulate",{law:L().slug,params:p,n,seed:sd});
    st.sp=p;st.simP=res.params;st.n=n;st.seed=sd;st.dirty=false;st.sample=res.sample;st.res=res;
    if(st.tab!=="sim")return;
    $("#view").classList.add("anim");simResults();refresh();animate(true);
  }catch(err){showErr(err.message)}
  finally{const b=$("#go");if(b){b.disabled=false;b.textContent="Simuler"}}
}

/* ---- Application ---- */
function viewData(){
  return`<section class="dsec"><h4><b>01</b>Vos données</h4>
    <div class="work2">
      <div class="card box"><h5>Valeurs <em id="cnt"></em></h5>
        <textarea class="ta" id="ta" spellcheck="false" placeholder="Tapez ou collez vos valeurs ici…&#10;une par ligne, ou séparées par des espaces ou des points-virgules">${st.dataText.replace(/</g,"&lt;")}</textarea>
        <div id="colbox"></div><div class="err" id="err"></div>
        <div class="row"><button class="btn ghost sm" id="pick">Ouvrir un fichier</button><button class="btn ghost sm" id="demo">Exemple</button></div>
        <p class="hint">Virgule ou point pour les décimales ; fichier .txt ou .csv, à ouvrir ou à déposer ici. <a href="/guide#donnees">Formats acceptés</a></p>
        <div id="fitbox"></div></div>
      ${plotCard("Vos données et loi ajustée")}
    </div></section>
  <div id="datares"></div>`;
}
/* Les données sont envoyées au serveur (après une courte pause de frappe), qui renvoie l'analyse */
let dataSeq=0,dataTimer=null;
function requestEstimate(){
  clearTimeout(dataTimer);const id=++dataSeq;
  if(!st.data){st.dres=null;dataResults();refresh();return}
  $("#datares").innerHTML=`<section class="dsec"><div class="empty">Calcul en cours…</div></section>`;
  dataTimer=setTimeout(async()=>{
    try{const res=await api("/api/estimate",{law:L().slug,data:st.data});if(id!==dataSeq||st.tab!=="data")return;st.dres=res}
    catch(err){if(id!==dataSeq)return;st.dres=null;showErr(err.message)}
    dataResults();refresh();
  },350);
}
function fitOk(e){return e&&e.every(v=>v!==null&&Number.isFinite(v))&&!L().check(e)}
function dataResults(){
  const r=st.dres,fb=$("#fitbox");if(!fb)return;
  if(!st.data||!r){$("#datares").innerHTML=`<section class="dsec"><div class="empty">Tapez, collez ou importez des valeurs pour obtenir les statistiques descriptives et les paramètres estimés de la loi ${L().name}.</div></section>`;fb.innerHTML="";return}
  $("#datares").innerHTML=statsSection(r.stats,"02")+estSection(r,null,"03");drawConv(true);
  fb.innerHTML=fitOk(r.moments)?`<button class="btn ghost block sm" id="fit" style="margin-top:12px">Simuler à partir de cet ajustement →</button>`:`<p class="hint">Ces données ne permettent pas d'ajuster la loi ${L().name} (paramètres hors domaine).</p>`;
}
/* Tableau à plusieurs colonnes ? (séparateur ; ou tabulation, ou virgule avec décimales en point) */
function asTable(text){
  const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(lines.length<2)return null;
  let sep=null;
  if(lines.some(l=>l.includes(";")))sep=";";
  else if(lines.some(l=>l.includes("\t")))sep="\t";
  else{const k=lines[0].split(",").length,same=lines.every(l=>l.split(",").length===k);
    const hd=lines[0].split(",").some(c=>c.trim()!==""&&!Number.isFinite(num(c)));
    if(k>1&&same&&(/\d\.\d/.test(text)||hd))sep=","}
  if(!sep)return null;
  const rows=lines.map(l=>l.split(sep).map(c=>c.trim()));
  const nc=Math.max(...rows.map(r=>r.length));if(nc<2)return null;
  const header=rows[0].some(c=>c!==""&&!Number.isFinite(num(c)));
  return{names:Array.from({length:nc},(_,j)=>header&&rows[0][j]?rows[0][j]:`Colonne ${j+1}`),rows:header?rows.slice(1):rows};
}
function parseData(text){
  st.dataText=text;
  const tb=asTable(text),cb=$("#colbox");let tok;
  if(tb){
    if(st.col>=tb.names.length)st.col=0;
    tok=tb.rows.map(r=>r[st.col]??"").filter(c=>c!=="");
    cb.innerHTML=`<select class="sel" id="col" aria-label="Colonne à analyser">${tb.names.map((n,j)=>`<option value="${j}"${j===st.col?" selected":""}>Analyser : ${n.replace(/</g,"&lt;")}</option>`).join("")}</select>`;
  }else{
    cb.innerHTML="";tok=text.split(/[\s;]+/).filter(Boolean);
    if(tok.length===1&&tok[0].includes(","))tok=tok[0].split(",").filter(Boolean);
  }
  const v=tok.map(num),bad=v.filter(x=>!Number.isFinite(x)).length,ok=v.filter(Number.isFinite);let msg="";
  if(bad)msg=`${bad} valeur${bad>1?"s":""} non numérique${bad>1?"s":""} ignorée${bad>1?"s":""}.`;
  else if(ok.length&&ok.length<2)msg="Il faut au moins 2 valeurs.";
  else if(L().disc&&ok.some(x=>!isInt(x)))msg="Cette loi est discrète : les valeurs devraient être entières.";
  else if(["exponentielle","gamma","weibull"].includes(L().slug)&&ok.some(x=>x<0))msg="Cette loi n'est définie que pour des valeurs positives.";
  else if(["gamma","weibull"].includes(L().slug)&&ok.some(x=>x===0)){
    const z=ok.filter(x=>x===0).length,zz=`${z} valeur${z>1?"s":""} nulle${z>1?"s":""}`;
    msg=L().slug==="gamma"?`${zz} : la montée de gradient demande des valeurs strictement positives (ln 0 n'existe pas). Seule la formule explicite est calculée.`
      :`${zz} : la loi de Weibull demande des valeurs strictement positives (ln 0 n'existe pas). Ni la formule explicite ni la montée de gradient ne peuvent être calculées.`}
  st.data=ok.length>=2?ok:null;
  $("#cnt").textContent=ok.length?ok.length.toLocaleString("fr-FR")+" valeurs":"";
  showErr(msg);requestEstimate();
}
function readFile(f){if(!f)return;const r=new FileReader();r.onload=()=>{$("#ta").value=String(r.result);st.col=0;parseData(r.result)};r.readAsText(f)}
$("#file").addEventListener("change",e=>readFile(e.target.files[0]));

/* ---- Tableaux de résultats (avec les relations) ---- */
/* Statistiques calculées par le serveur (Python) */
const STATKEYS=["n","min","max","mean","var","skew","kurt"];
function statsSection(s,n){
  return`<section class="dsec"><h4><b>${n}</b>Statistiques descriptives<small>n = ${s.n.toLocaleString("fr-FR")}</small></h4>${table("170px 1fr auto",["Statistique","Formule","Valeur"],STATS.map(([k,f],i)=>[cell("k",k),cell("f",T(f)),cell("v",fmt(s[STATKEYS[i]]??NaN,4))]))}</section>`;
}
function estSection(r,truth,n){
  const g=r.gradient,gp=g.applicable?g.params:null;
  const cols=truth?"100px 1fr auto auto auto":"100px 1fr auto auto";
  const head=truth?["Paramètre","Formule explicite","Vrai","Formule","Gradient"]:["Paramètre","Formule explicite","Formule","Gradient"];
  const rows=L().P.map((q,i)=>[cell("k",q.s),cell("f",T(D().ef[i])),...(truth?[cell("v",fmt(truth[i],4))]:[]),cell("v est",fmt(r.moments[i]??NaN,4)),cell("v",gp?fmt(gp[i]??NaN,4):"—")]);
  const conv=g.applicable?`<div class="card conv"><div class="convtxt"><span class="label">Montée de gradient</span>
      <p>Départ : ${L().P.map((q,i)=>`${q.s}₀ = ${fmt(g.start[i],3)}`).join(", ")}. ${g.converged?`Convergence en <b>${g.iterations}</b> itération${g.iterations>1?"s":""}.`:`Arrêt après ${g.iterations} itérations.`}</p>
      <p>Log-vraisemblance moyenne finale : <b>${fmt(g.loglik,5)}</b>${g.note?`<br><span class="muted">${g.note}</span>`:""}</p></div>
      <canvas id="conv" aria-label="Convergence de la log-vraisemblance au fil des itérations"></canvas></div>`
    :`<div class="card conv"><div class="convtxt"><span class="label">Montée de gradient</span><p class="muted">${g.reason}</p></div></div>`;
  return`<section class="dsec"><h4><b>${n}</b>Estimation des paramètres</h4>${table(cols,head,rows)}${conv}</section>`;
}
/* Courbe de convergence : log-vraisemblance moyenne en fonction de l'itération (axe logarithmique) */
function drawConv(anim){
  const c=$("#conv"),r=(st.tab==="sim"?st.res:st.dres);if(!c||!r||!r.gradient.applicable)return;
  const tr=r.gradient.trace,x=c.getContext("2d"),d=devicePixelRatio||1,b=c.getBoundingClientRect();
  c.width=b.width*d;c.height=b.height*d;x.setTransform(d,0,0,d,0,0);
  const W=b.width,H=b.height,L0=8,R0=8,T0=10,B0=22,xs=tr.map(p=>Math.log10(p[0]+1)),ys=tr.map(p=>p[1]).filter(v=>v!==null);
  if(ys.length<2)return;
  const xm=Math.max(...xs,1e-9),y0=Math.min(...ys),y1=Math.max(...ys),sx=v=>L0+v/xm*(W-L0-R0),sy=v=>H-B0-(v-y0)/((y1-y0)||1)*(H-B0-T0);
  const a1=cssv("--a1"),t0=performance.now();
  function frame(now){
    const k=anim&&!reduce&&!document.hidden?Math.min(1,(now-t0)/900):1,m=Math.max(2,Math.ceil(tr.length*k));
    x.clearRect(0,0,W,H);
    x.strokeStyle="rgba(10,15,30,.4)";x.lineWidth=1;x.beginPath();x.moveTo(L0,H-B0);x.lineTo(W-R0,H-B0);x.stroke();
    x.fillStyle="#6b7385";x.font="10.5px 'JetBrains Mono',monospace";x.textAlign="left";x.fillText("itération 0",L0,H-6);x.textAlign="right";x.fillText(`itération ${tr[tr.length-1][0]} (échelle log.)`,W-R0,H-6);
    x.strokeStyle=a1;x.lineWidth=2.4;x.beginPath();
    tr.slice(0,m).forEach((p,i)=>{if(p[1]===null)return;const px=sx(Math.log10(p[0]+1)),py=sy(p[1]);i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke();
    const last=tr[m-1];if(last[1]!==null){x.fillStyle=a1;x.beginPath();x.arc(sx(Math.log10(last[0]+1)),sy(last[1]),4,0,7);x.fill()}
    if(k<1)requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);if(!anim||reduce)frame(t0+1e4);
}

/* ====== Événements des formulaires ====== */
$("#view").addEventListener("input",e=>{
  const t=e.target;
  if(st.tab==="props"&&t.dataset.i!==undefined){const p=readParams();if(p){st.p=p;propsResults();refresh()}}
  else if(st.tab==="sim"&&(t.dataset.i!==undefined||t.id==="nn"||t.id==="sd")){
    const p=readParams();if(p){st.sp=p;if(st.sample){st.dirty=true;$("#dirty").textContent="Paramètres modifiés : cliquez sur « Simuler » pour tirer un nouvel échantillon."}}}
  else if(t.id==="ta"){st.col=0;parseData(t.value)}
  else if(t.id==="col"){st.col=+t.value;parseData($("#ta").value)}
});
$("#view").addEventListener("keydown",e=>{if(st.tab==="sim"&&e.key==="Enter"&&e.target.tagName==="INPUT")simulate()});
$("#view").addEventListener("click",e=>{
  if(e.target.closest("#go"))simulate();
  if(e.target.closest("#pick"))$("#file").click();
  if(e.target.closest("#demo")){const s=Array.from({length:300},()=>L().draw(L().P.map(q=>q.v)));
    $("#ta").value=s.map(v=>L().disc?v:+v.toFixed(4)).join("\n").replace(/\./g,",");st.col=0;parseData($("#ta").value)}
  if(e.target.closest("#fit")){
    const p=L().disc&&L().slug==="binomiale"?[Math.max(1,Math.round(st.dres.moments[0])),st.dres.moments[1]]:st.dres.moments.slice();st.sp=p.slice();st.n=Math.min(100000,Math.max(st.n,st.data.length));
    st.tab="sim";document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("on",x.dataset.t==="sim"));
    render(true);simulate();scrollTo({top:$("#lawbar").getBoundingClientRect().top+scrollY-70,behavior:reduce?"auto":"smooth"});
  }
});
$("#view").addEventListener("dragover",e=>{if(e.target.id==="ta")e.preventDefault()});
$("#view").addEventListener("drop",e=>{if(e.target.id==="ta"){e.preventDefault();readFile(e.dataTransfer.files[0])}});

/* ====== Graphique ====== */
let cv=null,ctx=null;const geo={};
function bindPlot(){
  cv=$("#plot");ctx=cv.getContext("2d");
  cv.addEventListener("mousemove",e=>{const r=cv.getBoundingClientRect();st.hx=geo.x0+(e.clientX-r.left-geo.Lm)/(geo.W-geo.Lm-geo.Rm)*(geo.x1-geo.x0);draw()});
  cv.addEventListener("mouseleave",()=>{st.hx=null;draw()});
}
/* Graduations de l'axe des abscisses, adaptées à chaque graphe :
   loi continue → comme matplotlib (Lib_Plot_densite.py) : au plus 9 intervalles, pas « rond »
   choisi parmi 1, 2, 2,5, 5, 10 × 10^k (ex. 0, 2, 4 … 16 ou 0, 0,25 … 1,75) ;
   loi discrète → les valeurs entières, en sautant des valeurs seulement s'il y en a beaucoup. */
function xTicks(a,b,disc){
  if(disc){const lo=Math.ceil(a)+0,hi=Math.floor(b),step=Math.max(1,Math.ceil((hi-lo+1)/25)),t=[];for(let k=lo;k<=hi;k+=step)t.push(k+0);t.step=step;return t}
  const raw=(b-a)/9,mag=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].map(s=>s*mag).find(s=>s>=raw*(1-1e-9)),t=[];
  for(let k=Math.ceil(a/step-1e-9);k*step<=b+step*1e-9;k++)t.push(+(k*step).toFixed(12)+0);
  t.step=step;return t;
}
/* Décimales affichées : juste ce qu'il faut pour écrire le pas (2 → 0, 0,2 → 1, 0,25 → 2) */
const xDecimals=t=>{let d=0;while(d<8&&Math.abs(t.step*10**d-Math.round(t.step*10**d))>1e-6)d++;return d};
function niceTicks(a,b,disc){
  const raw=(b-a)/6,mag=10**Math.floor(Math.log10(raw));let step=[1,2,5,10].map(m=>m*mag).find(s=>s>=raw);if(disc)step=Math.max(1,Math.round(step));
  const t=[];for(let x=Math.ceil(a/step-1e-9)*step;x<=b+1e-9;x+=step)t.push(+x.toFixed(10));return t;
}
function curveOf(l,p,x0,x1){
  if(l.disc){const pts=[];for(let k=Math.ceil(x0);k<=Math.floor(x1);k++)pts.push([k,l.f(k,p)]);return pts}
  const N=200,pts=[];for(let i=0;i<N;i++){const x=x0+(x1-x0)*i/(N-1);pts.push([x,l.f(x,p)])}return pts;   // 200 points, comme Lib_Plot_densite.py
}
/* Lois à support positif : graphe sur [0, F⁻¹(0,999)] des paramètres tracés */
const POS=["exponentielle","gamma","weibull"];
function buildModel(){
  const l=L(),m={main:[],hist:[],bw:1,estCurve:null,empty:null};
  let par=st.p,ext=[];
  if(st.tab==="sim"){if(!st.sample){m.empty="Aucun échantillon : cliquez sur « Simuler »."}else{ext=st.sample;par=st.simP}}
  if(st.tab==="data"){if(!st.data){m.empty="Saisissez ou importez des valeurs pour voir l'histogramme et la loi ajustée."}else{ext=st.data;const e=st.dres&&st.dres.moments;par=fitOk(e)?e:null}}
  m.par=par;
  let[x0,x1]=par?l.rg(par):[mn(ext),mx(ext)];
  const pos=POS.includes(l.slug)&&par;
  if(st.tab==="data"&&ext.length&&!pos){x0=Math.min(x0,mn(ext));x1=Math.max(x1,mx(ext))}
  if(l.disc){x0-=.7;x1+=.7}
  m.x0=x0;m.x1=x1;
  /* Fenêtre affichée : la courbe va de x0 à x1, l'axe ajoute 5 % de marge de chaque côté (comme matplotlib) */
  const mg=l.disc?0:(x1-x0)*.05||1;m.v0=x0-mg;m.v1=x1+mg;
  if(par&&!m.empty)m.main=curveOf(l,par,x0,x1);
  if(st.tab==="sim"&&ext.length&&st.res&&fitOk(st.res.moments))m.estCurve=curveOf(l,st.res.moments,x0,x1);
  if(ext.length){
    if(l.disc){const c={};ext.forEach(v=>c[v]=(c[v]||0)+1);m.hist=Object.entries(c).map(([k,n])=>[+k,n/ext.length])}
    else{
      /* Histogramme en densité (effectif / (n × largeur)) : même échelle que la courbe.
         Pour les lois à support positif, les classes couvrent [0, F⁻¹(0,999)] et les rares
         valeurs au-delà sont comptées dans n mais non dessinées. */
      const a=pos?0:mn(ext),b=pos?x1:mx(ext),nb=Math.max(8,Math.min(60,Math.round(Math.sqrt(ext.length)*1.3)));
      m.bw=(b-a)/nb||1;const c=new Array(nb).fill(0);let out=0;
      ext.forEach(v=>{if(v<a||v>b){out++;return}c[Math.min(nb-1,Math.floor((v-a)/m.bw))]++});
      m.hist=c.map((n,i)=>[a+i*m.bw,n/ext.length/m.bw]);m.beyond=out;
    }
  }
  const skip=l.disc?0:Math.floor(m.main.length*.02);
  m.ymax=Math.max(...m.main.slice(skip).map(q=>q[1]).filter(Number.isFinite),...m.hist.map(q=>q[1]),1e-9)*1.12;
  st.model=m;
}
function legend(){
  const s=(c,t)=>`<span><b style="background:${c==="dash"?"repeating-linear-gradient(90deg,var(--ink) 0 5px,transparent 5px 8px)":c}"></b>${t}</span>`;
  $("#legend").innerHTML=st.tab==="props"?s("var(--a1)",L().disc?"P(X = k)":"f(x)"):
    st.tab==="sim"?(st.sample?s("var(--a1)","Loi théorique")+s("rgba(10,15,30,.35)","Échantillon simulé")+s("dash","Loi estimée"):""):
    (st.data?s("rgba(10,15,30,.35)","Vos données")+s("var(--a1)","Loi ajustée (paramètres estimés)"):"");
}
function refresh(){buildModel();legend();draw()}   // legend() lit st.model : construit juste avant
function draw(){
  const l=L(),m=st.model;if(!m||!cv)return;
  const r=cv.getBoundingClientRect(),d=devicePixelRatio||1;
  cv.width=r.width*d;cv.height=r.height*d;ctx.setTransform(d,0,0,d,0,0);
  const W=r.width,H=r.height,Lm=52,Rm=18,Tm=22,Bm=36,{x0,x1,v0,v1,ymax,main,hist,bw}=m;
  ctx.clearRect(0,0,W,H);
  if(m.empty){ctx.fillStyle="#6b7385";ctx.font="15px Inter,sans-serif";ctx.textAlign="center";ctx.fillText(m.empty,W/2,H/2);$("#tip").classList.remove("show");return}
  const sx=x=>Lm+(x-v0)/(v1-v0)*(W-Lm-Rm),sy=y=>H-Bm-y/ymax*(H-Bm-Tm);
  Object.assign(geo,{x0:v0,x1:v1,Lm,Rm,W});
  ctx.font="11px 'JetBrains Mono',monospace";ctx.lineWidth=1;
  const xt=xTicks(v0,v1,l.disc),xd=xDecimals(xt);
  xt.forEach(x=>{ctx.strokeStyle="#f0f2f6";ctx.beginPath();ctx.moveTo(sx(x),Tm);ctx.lineTo(sx(x),H-Bm);ctx.stroke();ctx.fillStyle="#6b7385";
    ctx.textAlign="center";ctx.fillText(fmt(x,xd),sx(x),H-Bm+17)});
  niceTicks(0,ymax,0).forEach(y=>{ctx.strokeStyle="#f0f2f6";ctx.beginPath();ctx.moveTo(Lm,sy(y));ctx.lineTo(W-Rm,sy(y));ctx.stroke();ctx.fillStyle="#6b7385";ctx.textAlign="right";ctx.fillText(fmt(y,3),Lm-8,sy(y)+4)});
  ctx.strokeStyle="#0a0f1e";ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(Lm,H-Bm);ctx.lineTo(W-Rm,H-Bm);ctx.moveTo(Lm,Tm);ctx.lineTo(Lm,H-Bm);ctx.stroke();
  ctx.save();ctx.beginPath();ctx.rect(Lm,Tm-4,(W-Lm-Rm)*st.reveal+2,H-Tm-Bm+8);ctx.clip();
  const dense=l.disc&&(main.length>60||hist.length>60),a1=cssv("--a1"),a1r=cssv("--a1-rgb"),a2r=cssv("--a2-rgb");
  ctx.fillStyle="rgba(10,15,30,.10)";ctx.strokeStyle="rgba(10,15,30,.42)";ctx.lineWidth=dense?.8:1.2;
  const nh=hist.length;
  hist.forEach(([x,y0],i)=>{const g=Math.min(1,Math.max(0,st.grow*1.6-.6*i/Math.max(1,nh-1))),y=y0*(1-(1-g)**3);if(y<=0)return;const xa=l.disc?sx(x-.35):sx(x),w=l.disc?Math.max(1,sx(x+.35)-xa):sx(x+bw)-sx(x);ctx.fillRect(xa,sy(y),w,H-Bm-sy(y));if(!dense||w>3)ctx.strokeRect(xa,sy(y),w,H-Bm-sy(y))});
  const trace=(pts,color,w,dash,fill)=>{
    if(!pts.length)return;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=w;ctx.setLineDash(dash||[]);
    if(l.disc){pts.forEach(([x,y])=>{ctx.beginPath();ctx.moveTo(sx(x),H-Bm);ctx.lineTo(sx(x),sy(y));ctx.stroke();if(!dense){ctx.beginPath();ctx.arc(sx(x),sy(y),4.5,0,7);ctx.fill()}})}
    else{ctx.beginPath();let first=true;pts.forEach(([x,y])=>{if(!Number.isFinite(y))return;first?ctx.moveTo(sx(x),sy(y)):ctx.lineTo(sx(x),sy(y));first=false});ctx.stroke();
      if(fill){ctx.lineTo(sx(pts[pts.length-1][0]),H-Bm);ctx.lineTo(sx(pts[0][0]),H-Bm);ctx.closePath();ctx.fillStyle=`rgba(${a1r},.10)`;ctx.fill()}}
    ctx.setLineDash([]);
  };
  trace(main,a1,2.8,null,!l.disc&&st.tab==="props");
  if(m.estCurve)trace(m.estCurve,"#0a0f1e",1.8,[6,5]);
  ctx.restore();
  const tp=$("#tip");
  if(st.hx!==null&&m.par){
    let x=st.hx;if(l.disc)x=Math.round(x);
    if(x>=x0&&x<=x1){const v=l.f(x,m.par);
      ctx.strokeStyle="#0a0f1e";ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(sx(x),Tm);ctx.lineTo(sx(x),H-Bm);ctx.stroke();ctx.setLineDash([]);
      if(Number.isFinite(v)&&v<=ymax){ctx.fillStyle="#fff";ctx.strokeStyle="#0a0f1e";ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx(x),sy(v),5,0,7);ctx.fill();ctx.stroke()}
      tp.textContent=`x = ${fmt(x,3)}   ${l.disc?"P":"f"}(x) = ${fmt(v,5)}`;tp.classList.add("show");return}
  }
  tp.classList.remove("show");
}
/* Apparition : courbe tracée de gauche à droite ; avec grow, les barres de l'histogramme montent */
function animate(grow){
  if(reduce||document.hidden){st.reveal=1;st.grow=1;draw();return}
  st.reveal=grow?1:0;st.grow=grow?0:1;const t0=performance.now(),dur=grow?900:650;
  setTimeout(()=>{if(st.grow<1||st.reveal<1){st.grow=1;st.reveal=1;draw()}},dur+250); // filet si l'animation est suspendue
  (function step(now){const k=Math.min(1,(now-t0)/dur);
    if(grow)st.grow=k;else st.reveal=1-(1-k)**3;draw();if(k<1)requestAnimationFrame(step)})(t0);
}
addEventListener("resize",()=>{draw();drawConv(false)});addEventListener("themechange",()=>{legend();draw();drawConv(false)});

/* ====== Démarrage ====== */
buildSwitch();head();render(true);
document.fonts.ready.then(draw);
