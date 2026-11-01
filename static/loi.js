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
  const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json","X-ALP-Lang":LANG},body:JSON.stringify(body)});
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error(j&&j.error||tx("Le serveur n'a pas pu faire le calcul. Réessayez."));
  return j;
}
const st={law:LI,tab:"props",p:LAWS[LI].P.map(q=>q.v),sp:LAWS[LI].P.map(q=>q.v),simP:null,sample:null,n:500,seed:null,
  dirty:false,res:null,dres:null,data:null,dataText:"",col:null,restored:false,fromDemo:false,reveal:1,grow:1,hx:null,model:null};
const L=()=>LAWS[st.law],D=()=>DOC[st.law],EN=LANG==="en";
/* Vos valeurs vous suivent d'une loi à l'autre : gardées dans cet onglet du navigateur uniquement */
const STORE="alp-donnees";
try{const s=JSON.parse(sessionStorage.getItem(STORE)||"null");if(s&&s.t){st.dataText=s.t;st.col=s.c??null;st.restored=true}}catch(e){}
addEventListener("pagehide",()=>{try{if(st.dataText.trim()&&!st.fromDemo)sessionStorage.setItem(STORE,JSON.stringify({t:st.dataText,c:st.col}));else sessionStorage.removeItem(STORE)}catch(e){}});
/* Nom de la loi dans une phrase (« the gamma distribution », mais « the Poisson distribution ») */
const lname=()=>EN&&!["bernoulli","poisson","weibull"].includes(L().slug)?L().name.toLowerCase():L().name;

/* ====== En-tête de la loi ====== */
function buildSwitch(){
  const a=(l,i)=>`<a href="${lawUrl(l.slug)}" class="${i===st.law?"on":""}"${i===st.law?' aria-current="page"':""}>${l.name}</a>`;
  $("#switch").innerHTML=LAWS.map((l,i)=>l.disc?a(l,i):"").join("")+`<span class="sep"></span>`+LAWS.map((l,i)=>l.disc?"":a(l,i)).join("");
  const on=$("#switch .on");if(on){const n=$("#switch");n.scrollLeft=on.offsetLeft-(n.clientWidth-on.offsetWidth)/2}   // pastille active centrée si la rangée défile
  syncTab();
}
/* Le mode ouvert (#props, #sim, #data) reste dans l'adresse : changer de loi ou de langue garde le même mode */
function syncTab(){
  history.replaceState(null,"",st.tab==="props"?location.pathname:"#"+st.tab);
  document.querySelectorAll("#switch a,.lang a").forEach(a=>{a.hash=st.tab==="props"?"":st.tab});
}
function setTab(t){st.tab=t;document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("on",x.dataset.t===t));syncTab()}
{const h=location.hash.slice(1);if(["props","sim","data"].includes(h))setTab(h)}
function head(){
  $("#kind").textContent=tx(L().disc?"Loi discrète":"Loi continue");
  $("#lawName").textContent=L().name;$("#lbName").textContent=L().name;
  $("#nt").innerHTML=T(D().nt);$("#lbNt").innerHTML=T(D().nt);
  $("#lede").innerHTML=`${D().desc} <a class="lnk" href="${guideUrl}#lire">${tx("Comment lire ces grandeurs ?")}</a>`;
  document.title=`${L().name} — ALP · ${EN?"Statistical modeling":"Modélisation statistique"}`;
}
/* La barre des modes affiche le nom de la loi une fois le titre sorti de l'écran */
new IntersectionObserver(([e])=>$("#lawbar").classList.toggle("stuck",!e.isIntersecting),{rootMargin:"-70px 0px 0px 0px"}).observe($("#ltitle"));

$("#tabs").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b||b.dataset.t===st.tab)return;
  setTab(b.dataset.t);
  render(true);
  const top=$("#lawbar").getBoundingClientRect().top+scrollY-70;if(scrollY>top)scrollTo({top,behavior:reduce?"auto":"smooth"});
});

/* ====== Briques communes ====== */
/* Valeur affichée dans un champ : virgule décimale en français, point en anglais */
const comma=v=>{const s=String(+(+v).toPrecision(6));return EN?s:s.replace(".",",")};
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
  if(badNum.length){showErr(tx("Saisissez un nombre valide (par exemple 2,5)."),badNum);return null}
  if(!fin(raw)){showErr(tx("Valeur trop grande (maximum 1 000 000 en valeur absolue)."),L().P.map((_,i)=>"f"+i));return null}
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
  return`<section class="dsec"><h4><b>01</b>${tx("Définition")}</h4>${table("230px 1fr",null,[...D().rows,[tx("Espérance"),D().E],[tx("Variance"),D().V]].map(([k,f])=>[cell("k",k),cell("f",T(f))]),"defc")}</section>
  <section class="dsec"><h4><b>02</b>${tx("Moments pour des paramètres donnés")}</h4>
    <div class="work2">
      <div class="card box"><h5>${tx("Paramètres")} <em>${tx("tapez vos valeurs")}</em></h5>${fields(st.p)}<div class="err" id="err"></div><div class="kpis" id="kp" style="margin-top:6px"></div></div>
      ${plotCard(tx(L().disc?"Fonction de masse":"Densité de probabilité"))}
    </div>
    <div id="restab" style="margin-top:16px"></div>
  </section>`;
}
function propsResults(){
  const p=st.p,v=L().v(p);
  $("#kp").innerHTML=kpi(tx("E[X] · ESPÉRANCE"),fmtS(L().m(p)),"hot wide")+kpi(tx("Var(X) · VARIANCE"),fmtS(v),"hot")+kpi(tx("σ · ÉCART-TYPE"),fmtS(Math.sqrt(v)),"hot");
  $("#restab").innerHTML=table("160px 1fr auto",["Grandeur","Relation","Valeur"].map(tx),[
    [cell("k",tx("Espérance")),cell("f",T(D().E)),cell("v",fmtS(L().m(p)))],
    [cell("k",tx("Variance")),cell("f",T(D().V)),cell("v",fmtS(v))],
    [cell("k",tx("Écart-type")),cell("f",T(String.raw`\sigma=\sqrt{\mathrm{Var}(X)}`)),cell("v",fmtS(Math.sqrt(v)))]]);
}

/* ---- Simulation ---- */
function viewSim(){
  return`<section class="dsec"><h4><b>01</b>${tx("Échantillon")}</h4>
    <div class="work2">
      <div class="card box"><h5>${tx("Paramètres")} <em>${tx("tapez vos valeurs")}</em></h5>${fields(st.sp)}
        <div class="field" id="fn"><label for="nn">n</label><input id="nn" inputmode="numeric" autocomplete="off" value="${st.n}"><span class="rng">${tx("taille de l'échantillon, 2 à 100 000")}</span></div>
        <div class="field" id="fsd"><label for="sd" class="sm">${tx("graine")}</label><input id="sd" inputmode="numeric" autocomplete="off" placeholder="${tx("aucune")}" value="${st.seed??""}"><span class="rng">${tx("facultatif : la même graine redonne le même échantillon")}</span></div>
        <div class="err" id="err"></div>
        <button class="btn primary block" id="go">${tx("Simuler")}</button>
        <p class="hint" id="dirty"></p></div>
      ${plotCard(tx("Distribution empirique"))}
    </div></section>
  <div id="simres"></div>`;
}
function simResults(){
  $("#dirty").textContent=st.dirty?tx("Paramètres modifiés : cliquez sur « Simuler » pour tirer un nouvel échantillon."):"";
  $("#simres").innerHTML=st.res?statsSection(st.res.stats,"02")+estSection(st.res,st.simP,"03"):
    `<section class="dsec"><div class="empty">${tx("Aucun échantillon pour l'instant. Choisissez les paramètres et la taille n, puis cliquez sur « Simuler ».")}</div></section>`;
  if(st.res)drawConv(true);
}
async function simulate(){
  const p=readParams();if(!p)return;
  const n=num($("#nn").value);
  if(!(isInt(n)&&n>=2&&n<=100000))return showErr(tx("n doit être un entier compris entre 2 et 100 000."),["fn"]);
  const sv=$("#sd").value.trim(),sd=sv===""?null:num(sv);
  if(sd!==null&&!(isInt(sd)&&sd>=0&&sd<2**32))return showErr(tx("La graine doit être un entier positif (ou laissée vide)."),["fsd"]);
  const go=$("#go");clearTimeout(st.btnT);go.classList.remove("ok","bad");go.classList.add("busy");go.disabled=true;go.textContent=tx("Calcul en cours…");
  let ok=false;
  try{
    const res=await api("/api/simulate",{law:L().slug,params:p,n,seed:sd});
    st.sp=p;st.simP=res.params;st.n=n;st.seed=sd;st.dirty=false;st.sample=res.sample;st.res=res;ok=true;
    if(st.tab!=="sim")return;
    $("#view").classList.add("anim");simResults();refresh();animate(true);
  }catch(err){showErr(err.message)}
  finally{
    /* Retour visuel : vert + coche si la simulation a réussi, rouge si elle a échoué, puis retour à « Simuler » */
    const b=$("#go");
    if(b){b.disabled=false;b.classList.remove("busy");b.classList.add(ok?"ok":"bad");
      b.innerHTML=ok?`<span class="tick">✓</span>${tx("Simulation réussie")}`:tx("Échec de la simulation");
      st.btnT=setTimeout(()=>{const c=$("#go");if(c){c.classList.remove("ok","bad");c.textContent=tx("Simuler")}},ok?2200:1600)}
  }
}

/* ---- Application ---- */
function viewData(){
  return`<section class="dsec"><h4><b>01</b>${tx("Vos données")}</h4>
    <div class="work2">
      <div class="card box"><h5>${tx("Valeurs")} <em id="cnt"></em></h5>
        <textarea class="ta" id="ta" spellcheck="false" placeholder="${tx("Tapez ou collez vos valeurs ici…&#10;une par ligne, ou séparées par des espaces ou des points-virgules")}">${st.dataText.replace(/</g,"&lt;")}</textarea>
        <div id="colbox"></div><div id="parsed"></div><div class="err" id="err"></div>
        <div class="row"><button class="btn ghost sm" id="pick">${tx("Ouvrir un fichier")}</button><button class="btn ghost sm" id="demo">${tx("Exemple")}</button><button class="btn ghost sm" id="clr">${tx("Effacer")}</button></div>
        <button class="btn primary block" id="est" style="margin-top:12px" disabled>${tx("Lancer l'estimation")}</button>
        <p class="hint">${tx("Virgule ou point pour les décimales ; fichier .txt, .csv ou .dat, à ouvrir ou à déposer ici.")} <a href="${guideUrl}#donnees">${tx("Formats acceptés")}</a></p>
        <div id="fitbox"></div></div>
      ${plotCard(tx("Vos données et loi ajustée"))}
    </div></section>
  <div id="datares"></div>`;
}
/* Les données ne sont envoyées au serveur qu'au clic sur « Lancer l'estimation » */
let dataSeq=0;
async function estimate(){
  if(!st.data)return;
  const id=++dataSeq,b=$("#est");clearTimeout(st.btnT);
  b.classList.remove("ok","bad");b.classList.add("busy");b.disabled=true;b.textContent=tx("Calcul en cours…");
  $("#datares").innerHTML=`<section class="dsec"><div class="empty">${tx("Calcul en cours…")}</div></section>`;
  let ok=false;
  try{const res=await api("/api/estimate",{law:L().slug,data:st.data});if(id!==dataSeq||st.tab!=="data")return;st.dres=res;ok=true}
  catch(err){if(id!==dataSeq)return;st.dres=null;showErr(err.message)}
  finally{
    /* Même retour visuel que « Simuler » : vert si l'estimation a réussi, rouge sinon */
    const c=$("#est");
    if(c&&id===dataSeq){c.disabled=false;c.classList.remove("busy");c.classList.add(ok?"ok":"bad");
      c.innerHTML=ok?`<span class="tick">✓</span>${tx("Estimation réussie")}`:tx("Échec de l'estimation");
      st.btnT=setTimeout(()=>{const e=$("#est");if(e){e.classList.remove("ok","bad");e.textContent=tx("Lancer l'estimation")}},ok?2200:1600)}
  }
  if(id===dataSeq&&st.tab==="data"){dataResults();refresh();animate(true)}
}
function fitOk(e){return e&&e.every(v=>v!==null&&Number.isFinite(v))&&!L().check(e)}
function dataResults(){
  const r=st.dres,fb=$("#fitbox");if(!fb)return;fb.innerHTML="";
  if(!st.data){$("#datares").innerHTML=`<section class="dsec"><div class="empty">${EN?`Type, paste or import values, then click “Run the estimation” to obtain the descriptive statistics and the estimated parameters of the ${lname()} distribution.`:`Tapez, collez ou importez des valeurs, puis cliquez sur « Lancer l'estimation » pour obtenir les statistiques descriptives et les paramètres estimés de la loi ${L().name}.`}</div></section>`;return}
  if(!r){$("#datares").innerHTML=`<section class="dsec"><div class="empty">${st.data.length.toLocaleString(LOC)} ${EN?"values ready. Click “Run the estimation” to obtain the descriptive statistics and the estimated parameters.":"valeurs prêtes. Cliquez sur « Lancer l'estimation » pour obtenir les statistiques descriptives et les paramètres estimés."}</div></section>`;return}
  $("#datares").innerHTML=statsSection(r.stats,"02")+estSection(r,null,"03");drawConv(true);
  if(!fitOk(r.moments))fb.innerHTML=`<div class="alert">${EN?`These data cannot be fitted with the ${lname()} distribution by the closed-form estimator (parameters outside the domain).`:`Ces données ne permettent pas d'ajuster la loi ${L().name} par la formule explicite (paramètres hors domaine).`}</div>`;
}
/* ====== Lecture des valeurs tapées, collées ou importées ======
   Reconnaît la forme du texte : liste ou tableau, séparateur, lignes d'en-tête, unité, milliers.
   Tout ce qui est interprété ou écarté est signalé sous la zone de saisie : rien n'est décidé en silence. */
const NUM_RE=/^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/,MISS_RE=/^(na|n\/a|n\/d|nd|nan|null|none|-+|\?+|#n\/a|#n\/d)$/i,
  UNIT_RE=/^(.*?[\d.,])\s*([%‰°µμΩa-zA-ZÀ-ÿ][%‰°µμΩa-zA-ZÀ-ÿ/²³·]{0,7})$/,TIME_RE=/^(t|temps|time|date|heure|hour|index|indice|id|n°|no|num|numero|numéro)\b/i;
function toNumber(s){
  if(NUM_RE.test(s))return{v:+s.replace(",",".")};
  const m=s.match(/^([+-]?\d{1,3})((?:[    ]\d{3})+)([.,]\d+)?$/);
  if(m)return{v:+(m[1]+m[2].replace(/\D/g,"")+(m[3]||"").replace(",",".")),th:true,plain:m[2].includes(" "),frac:!!m[3],head:+m[1]};
  if(/^[+-]?\d{1,3}(\.\d{3})+,\d+$/.test(s)||/^[+-]?\d{1,3}(\.\d{3}){2,}$/.test(s))return{v:+s.replace(/\./g,"").replace(",","."),th:true};
  if(/^[+-]?\d{1,3}(,\d{3})+\.\d+$/.test(s)||/^[+-]?\d{1,3}(,\d{3}){2,}$/.test(s))return{v:+s.replace(/,/g,""),th:true};
  return null;
}
/* Une cellule : v (nombre, ou NaN), s (texte d'origine), u (unité), miss (valeur manquante) */
function parseCell(raw){
  const s=raw.trim().replace(/^"(.*)"$/,"$1").replace(/^'(.*)'$/,"$1").trim();
  if(s===""||MISS_RE.test(s))return{v:NaN,miss:true,s};
  let n=toNumber(s);if(n&&Number.isFinite(n.v))return{...n,s};
  const m=s.match(UNIT_RE);
  if(m&&(n=toNumber(m[1]))&&Number.isFinite(n.v))return{...n,u:m[2],s};
  return{v:NaN,s};
}
const isNum=c=>Number.isFinite(c.v);
function splitLine(l,sep){
  if(sep==="line")return[l];
  if(sep==="ws")return l.trim().split(/[ \t]+/);
  if(!l.includes('"'))return l.split(sep);
  const out=[];let cur="",q=false;
  for(const ch of l){if(ch==='"'){q=!q;cur+=ch}else if(ch===sep&&!q){out.push(cur);cur=""}else cur+=ch}
  out.push(cur);return out;
}
/* Une unité n'est retenue que si elle est la même partout et sur au moins la moitié de la colonne */
function settleUnit(cells){
  const wu=cells.filter(c=>c.u);if(!wu.length)return"";
  if(wu.every(c=>c.u===wu[0].u)&&wu.length*2>=cells.filter(isNum).length)return wu[0].u;
  wu.forEach(c=>{c.v=NaN;delete c.u});return"";
}
const isArith=a=>a.length>1&&a[1]!==a[0]&&a.every((v,i)=>i<2||Math.abs((v-a[i-1])-(a[1]-a[0]))<1e-9*Math.max(1,Math.abs(v)));
/* Forme du texte pour un séparateur donné : nombre de colonnes, première et dernière ligne de données */
function shapeOf(lines,sep){
  const rows=lines.map(l=>splitLine(l,sep).map(parseCell));
  if(sep==="line"){      // « 1 234 » ou « 1 234,5 » avec une espace ordinaire : milliers, sauf si cela ressemble à une colonne d'index + une valeur
    const pl=rows.map(r=>r[0]).filter(c=>c.plain);
    if(pl.length&&(!pl.some(c=>c.frac)||isArith(pl.map(c=>c.head))))pl.forEach(c=>{c.v=NaN;delete c.plain});
  }
  const tally={};rows.forEach(r=>{if(r.some(isNum))tally[r.length]=(tally[r.length]||0)+1});
  const ks=Object.keys(tally).map(Number);if(!ks.length)return null;
  const k=ks.reduce((a,b)=>tally[b]>tally[a]||(tally[b]===tally[a]&&b>a)?b:a);
  if(k<2&&sep!=="line")return null;
  const units=[];for(let j=0;j<k;j++)units.push(settleUnit(rows.filter(r=>r[j]).map(r=>r[j])));
  const fits=r=>sep==="ws"||sep==="line"?r.length===k:r.length<=k;
  const isData=r=>fits(r)&&(r.some(isNum)||r.every(c=>c.miss));
  const d=rows.map(isData);
  /* Début et fin des données : un nombre isolé au milieu d'un en-tête ou d'un pied de page n'en fait pas partie */
  let a=d[0]?0:d.findIndex((x,i)=>x&&d[i+1]);if(a<0)a=d.indexOf(true);if(a<0)return null;
  let b=d.length-1;if(!d[b]){while(b>a&&!(d[b]&&d[b-1]))b--;if(!d[b])b=d.lastIndexOf(true)}
  let nData=0,cells=0,nums=0;for(let i=a;i<=b;i++)if(d[i]){nData++;cells+=k;nums+=rows[i].filter(isNum).length}
  return{sep,k,a,b,rows,d,units,nData,full:cells?nums/cells:0};
}
function readTable(text){
  const all=text.replace(/^﻿/,"").split(/\r\n|\n|\r/).filter(l=>l.trim()!=="");
  const lines=all.filter(l=>!/^\s*(#|%|\/\/|!|\*)/.test(l)),comments=all.length-lines.length;
  if(!lines.length)return null;
  const sample=lines.length>300?lines.slice(0,300):lines,joined=sample.join("\n");
  const first=lines[0].split(",").map(c=>c.trim());
  const commaHead=first.length>1&&first.every(c=>c!==""&&!isNum(parseCell(c)));
  const seps=[];
  if(joined.includes(";"))seps.push(";");
  if(joined.includes("\t"))seps.push("\t");
  if(commaHead)seps.push(",");
  seps.push("line");
  if(!commaHead&&(/,\s/.test(joined)||/\d\.\d/.test(joined)&&joined.includes(",")||/,.*,/.test(joined)))seps.push(",");
  if(/ /.test(joined))seps.push("ws");
  const cand=seps.map((s,i)=>{const r=shapeOf(sample,s);return r&&{...r,order:i}}).filter(Boolean);
  /* Liste libre mêlant espaces et points-virgules : « 1 2 3;4 5 » */
  const best=cand.sort((p,q)=>q.nData-p.nData||q.full-p.full||p.order-q.order)[0];
  if(!best||best.full<1){
    const free=lines.join(" ").split(/[\s;]+/).filter(Boolean).map(parseCell);
    if(free.length>1&&free.every(isNum))return{list:true,cols:[{name:"",cells:free,unit:""}],before:comments,after:0,inside:0,skipped:[]};
  }
  if(!best)return{cols:[],before:comments,after:0,inside:0,skipped:[]};
  const S=sample===lines?best:shapeOf(lines,best.sep);
  const{rows,a,b,k,d,units}=S;
  const prev=a>0?rows[a-1]:null,hasHead=!!(prev&&(k>1||a===1)&&(S.sep==="ws"||S.sep==="line"?prev.length===k:prev.length<=k)&&prev.some(c=>!isNum(c)&&!c.miss));
  const body=rows.slice(a,b+1).filter((r,i)=>d[a+i]);
  const before=a-(hasHead?1:0)+comments,after=rows.length-1-b,inside=(b-a+1)-body.length;
  const skippedLines=lines.slice(0,a-(hasHead?1:0));
  const base={before,after,inside,skipped:skippedLines};
  /* Une seule ligne de données sans titres, ou des valeurs à la suite coupées sur plusieurs lignes : c'est une liste */
  const flat=()=>({...base,list:true,cols:[{name:"",cells:rows.slice(a).flat(),unit:units[0]||""}],after:0,inside:0});
  if(k>1&&!hasHead&&body.length===1&&after===0)return flat();
  const last=rows[rows.length-1];
  if(k>=3&&!hasHead&&(S.sep==="ws"||S.sep===",")&&last.length<k&&last.every(isNum)&&rows.slice(a).every((r,i,l)=>r.every(isNum)&&(i===l.length-1||r.length===k)))return flat();
  const cols=[];
  for(let j=0;j<k;j++){
    const cells=body.map(r=>r[j]||{v:NaN,miss:true,s:""});
    if(cells.every(c=>c.miss))continue;       // colonne vide (séparateur en fin de ligne)
    const nm=hasHead&&prev[j]&&prev[j].s?prev[j].s:"";
    cols.push({name:nm,cells,unit:units[j]||"",idx:j});
  }
  return{...base,cols,hasHead};
}
/* Colonnes analysables, et celle proposée par défaut : pas un index ni un temps, dont les valeurs ne font que croître */
function chooseColumn(T,col){
  const named=T.cols.map((c,j)=>({...c,j,label:c.name||(T.cols.length>1?`${tx("Colonne ")}${c.idx+1}`:""),vals:c.cells.filter(isNum).map(c=>c.v)}));
  const usable=named.filter(c=>c.vals.length&&c.vals.length*2>=c.cells.filter(x=>!x.miss).length);
  if(!usable.length)return{usable,cur:null,auto:[]};
  /* Index ou temps : son nom le dit, ou un pas constant, ou une longue suite qui ne fait que croître (ou décroître) */
  const isIndex=c=>{if(TIME_RE.test(c.name||""))return true;const v=c.vals;if(v.length<3)return false;if(isArith(v))return true;if(v.length<8)return false;
    let up=true,dn=true;for(let i=1;i<v.length&&(up||dn);i++){if(v[i]<=v[i-1])up=false;if(v[i]>=v[i-1])dn=false}return up||dn};
  if(col!==null&&col!==undefined){
    if(col===-1)return{usable,all:true,cur:null,auto:[]};
    const c=usable.find(c=>c.j===col);if(c)return{usable,cur:c,auto:[]};
  }
  const cur=usable.find(c=>!isIndex(c))||usable.find(c=>!TIME_RE.test(c.name||"")&&c.j>0)||usable[usable.length-1];   // sinon les mesures sont le plus souvent à droite
  return{usable,cur,auto:usable.filter(c=>c.j<cur.j&&isIndex(c))};
}
const previewNum=v=>Math.abs(v)>=1e15||(v!==0&&Math.abs(v)<1e-4)?sciF(v):v.toLocaleString(LOC,{maximumSignificantDigits:8});
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");
function supportWarnings(ok){
  const s=L().slug,out=[];
  if(L().disc&&ok.some(x=>!isInt(x)))out.push(tx("Cette loi est discrète : les valeurs devraient être entières."));
  if(s==="bernoulli"&&ok.some(x=>x!==0&&x!==1))out.push(tx("La loi de Bernoulli n'accepte que les valeurs 0 et 1."));
  if(s==="geometrique"&&ok.some(x=>x<1))out.push(tx("La loi géométrique commence à 1 : toutes les valeurs doivent être supérieures ou égales à 1."));
  if(["exponentielle","gamma","weibull","poisson","binomiale"].includes(s)&&ok.some(x=>x<0))out.push(tx("Cette loi n'est définie que pour des valeurs positives."));
  else if(["gamma","weibull"].includes(s)&&ok.some(x=>x===0)){
    const z=ok.filter(x=>x===0).length,zz=EN?`${z} zero value${z>1?"s":""}`:`${z} valeur${z>1?"s":""} nulle${z>1?"s":""}`;
    if(EN)out.push(s==="gamma"?`${zz}: gradient ascent requires strictly positive values (ln 0 is undefined). Only the closed-form formula is computed.`
      :`${zz}: the Weibull distribution requires strictly positive values (ln 0 is undefined). Neither the closed-form formula nor gradient ascent can be computed.`);
    else out.push(s==="gamma"?`${zz} : la montée de gradient demande des valeurs strictement positives (ln 0 n'existe pas). Seule la formule explicite est calculée.`
      :`${zz} : la loi de Weibull demande des valeurs strictement positives (ln 0 n'existe pas). Ni la formule explicite ni la montée de gradient ne peuvent être calculées.`)}
  if(ok.length>=2&&ok.every(x=>x===ok[0]))out.push(tx("Toutes les valeurs sont identiques : la dispersion est nulle, certains paramètres ne pourront pas être estimés."));
  return out;
}
function parseData(text){
  st.dataText=text;
  const cb=$("#colbox"),pv=$("#parsed"),T=text.trim()?readTable(text):null;
  const P=T?chooseColumn(T,st.col):{usable:[],cur:null,auto:[]};
  const cells=P.all?T.cols.flatMap(c=>c.cells):P.cur?P.cur.cells:[];
  const ok=cells.filter(isNum).map(c=>c.v),badC=cells.filter(c=>!isNum(c)&&!c.miss),miss=cells.filter(c=>c.miss&&!P.all).length;
  /* Menu des colonnes : seulement s'il y a un vrai choix */
  if(P.usable.length>1){
    const opts=P.usable.map(c=>`<option value="${c.j}"${!P.all&&P.cur&&c.j===P.cur.j?" selected":""}>${tx("Analyser : ")}${esc(c.label)}</option>`).join("");
    const allOpt=T.hasHead?"":`<option value="-1"${P.all?" selected":""}>${tx("Analyser : ")}${tx("toutes les valeurs, à la suite")}</option>`;
    cb.innerHTML=`<select class="sel" id="col" aria-label="${tx("Colonne à analyser")}">${opts}${allOpt}</select>`;
  }else cb.innerHTML="";
  /* Notes : tout ce qui a été interprété ou écarté (rien à signaler : pas d'encadré) */
  const notes=[];
  if(T){
    if(st.restored)notes.push(tx("Données reprises de la page précédente : elles restent dans cet onglet et ne sont envoyées qu'au clic sur le bouton."));
    if(P.usable.length===1&&T.cols.length>1&&P.cur&&P.cur.label)notes.push(EN?`Column analyzed: “${esc(P.cur.label)}”; the others contain no numbers.`:`Colonne analysée : « ${esc(P.cur.label)} » ; les autres ne contiennent pas de nombres.`);
    if(P.usable.length===1&&T.cols.length===1&&P.cur&&P.cur.name)notes.push(EN?`Title “${esc(P.cur.name)}” recognized and not counted.`:`Titre « ${esc(P.cur.name)} » reconnu et non compté.`);
    if(P.auto.length){const w=P.auto.map(c=>`« ${esc(c.label)} »`).join(", "),wE=P.auto.map(c=>`“${esc(c.label)}”`).join(", ");
      notes.push(EN?`${wE} set aside by default: it looks like a time or an index. Change the column in the menu if needed.`:`${w} écartée par défaut : elle ressemble à un temps ou à un index. Changez de colonne dans le menu si besoin.`)}
    if(T.before){const ex=T.skipped&&T.skipped[0]?` (« ${esc(T.skipped[0].trim().slice(0,30))} »)`:"";notes.push(EN?`${T.before} line${T.before>1?"s":""} before the data ignored${ex.replace("« ","“").replace(" »","”")}.`:`${T.before} ligne${T.before>1?"s":""} avant les données ignorée${T.before>1?"s":""}${ex}.`)}
    if(T.after)notes.push(EN?`${T.after} line${T.after>1?"s":""} after the data ignored.`:`${T.after} ligne${T.after>1?"s":""} après les données ignorée${T.after>1?"s":""}.`);
    if(T.inside)notes.push(EN?`${T.inside} line${T.inside>1?"s":""} with a different layout ignored.`:`${T.inside} ligne${T.inside>1?"s":""} de forme différente ignorée${T.inside>1?"s":""}.`);
    const unit=P.cur&&P.cur.unit;if(unit)notes.push(EN?`Unit “${esc(unit)}” removed.`:`Unité « ${esc(unit)} » retirée.`);
    if(cells.some(c=>c.th&&isNum(c))){const c=cells.find(c=>c.th&&isNum(c));notes.push(EN?`Thousands separators recognized: “${esc(c.s)}” is read as ${previewNum(c.v)}.`:`Séparateurs de milliers reconnus : « ${esc(c.s)} » est lu ${previewNum(c.v)}.`)}
    if(T.list&&T.cols[0].cells.length>1&&text.trim().split(/\r?\n/).length>1&&/\d\s+\d/.test(text)&&!cells.some(c=>c.th))notes.push(tx("Plusieurs valeurs par ligne : elles sont lues à la suite, comme une seule liste."));
    if(miss)notes.push(EN?`${miss} missing value${miss>1?"s":""} ignored.`:`${miss} valeur${miss>1?"s":""} manquante${miss>1?"s":""} ignorée${miss>1?"s":""}.`);
  }
  pv.innerHTML=notes.length?`<div class="parsed"><ul>${notes.map(n=>`<li>${n}</li>`).join("")}</ul></div>`:"";
  /* Messages : ce qui empêche l'analyse, ou ce qui ne convient pas à cette loi */
  const msgs=[];
  if(T&&!ok.length)msgs.push(tx("Aucune valeur numérique trouvée. Vérifiez le contenu, ou enregistrez votre fichier au format texte ou CSV."));
  else{
    if(badC.length){const ex=esc(badC[0].s.slice(0,24));msgs.push(EN?`${badC.length} non-numeric value${badC.length>1?"s":""} ignored (for example “${ex}”).`:`${badC.length} valeur${badC.length>1?"s":""} non numérique${badC.length>1?"s":""} ignorée${badC.length>1?"s":""} (par exemple « ${ex} »).`)}
    if(ok.length===1)msgs.push(tx("Il faut au moins 2 valeurs."));
    msgs.push(...supportWarnings(ok));
  }
  /* Nouvelles valeurs : on efface l'ancienne analyse, sans relancer de calcul (il faut cliquer sur le bouton) */
  const prev=st.data;st.data=ok.length>=2?ok:null;
  const same=!!(prev&&st.data&&prev.length===st.data.length&&prev.every((x,i)=>x===st.data[i]));
  if(!same){dataSeq++;st.dres=null}
  $("#cnt").textContent=ok.length?ok.length.toLocaleString(LOC)+(EN?" values":" valeurs"):"";
  const b=$("#est");if(b){b.disabled=!st.data;if(!same){clearTimeout(st.btnT);b.classList.remove("ok","bad","busy");b.textContent=tx("Lancer l'estimation")}}
  showErr(msgs.join(" "));dataResults();refresh();
}
/* Fichier : encodage détecté (UTF-8, UTF-16 d'Excel, ou Latin-1) ; un fichier non textuel est refusé avec une explication */
function decodeFile(buf){
  const b=new Uint8Array(buf);
  if(b[0]===0xFF&&b[1]===0xFE)return new TextDecoder("utf-16le").decode(b);
  if(b[0]===0xFE&&b[1]===0xFF)return new TextDecoder("utf-16be").decode(b);
  if((b[0]===0x50&&b[1]===0x4B)||(b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46)||(b[0]===0xD0&&b[1]===0xCF)||b.subarray(0,4096).includes(0))return null;
  try{return new TextDecoder("utf-8",{fatal:true}).decode(b)}catch(e){return new TextDecoder("windows-1252").decode(b)}
}
function readFile(f){
  if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    const t=decodeFile(r.result);
    if(t===null){showErr(tx("Ce fichier n'est pas un fichier texte (Excel, PDF…). Enregistrez-le au format CSV ou texte, ou copiez-collez la colonne de valeurs."));return}
    $("#ta").value=t;st.col=null;st.restored=false;st.fromDemo=false;parseData(t);
  };
  r.readAsArrayBuffer(f);
}
$("#file").addEventListener("change",e=>{readFile(e.target.files[0]);e.target.value=""});

/* ---- Téléchargement des résultats : rapport PDF ou classeur Excel, fabriqués par le serveur ---- */
const DL_LABEL=`<span class="ico" aria-hidden="true">↓</span>${tx("Télécharger les résultats")}<span class="car">▾</span>`;
const dlCtl=()=>`<div class="dl" id="dl">
  <button class="btn sm dlb" id="dlbtn" aria-haspopup="menu" aria-expanded="false">${DL_LABEL}</button>
  <div class="dlmenu" role="menu">
    <button role="menuitem" data-f="pdf"><i class="ft pdf">PDF</i><span><b>${tx("Rapport PDF")}</b></span></button>
    <button role="menuitem" data-f="xlsx"><i class="ft xls">XLS</i><span><b>${tx("Classeur Excel")}</b></span></button>
  </div></div>`;
function dlMenu(open){const d=$("#dl");if(!d)return;d.classList.toggle("open",open);$("#dlbtn").setAttribute("aria-expanded",open)}
document.addEventListener("click",e=>{if(!e.target.closest("#dl"))dlMenu(false)});
document.addEventListener("keydown",e=>{if(e.key==="Escape")dlMenu(false)});
async function exportFile(format){
  dlMenu(false);
  const kind=st.tab==="sim"?"sim":"data",b=$("#dlbtn");
  const body=kind==="sim"?{law:L().slug,kind,format,data:st.sample,params:st.simP,seed:st.seed}:{law:L().slug,kind,format,data:st.data};
  clearTimeout(st.dlT);b.classList.remove("ok","bad");b.classList.add("busy");b.disabled=true;b.textContent=tx("Préparation du fichier…");
  let ok=false;
  try{
    const r=await fetch("/api/export",{method:"POST",headers:{"Content-Type":"application/json","X-ALP-Lang":LANG},body:JSON.stringify(body)});
    if(!r.ok){let j=null;try{j=await r.json()}catch(e){}throw new Error(j&&j.error||tx("Le fichier n'a pas pu être créé. Réessayez."))}
    const name=((r.headers.get("Content-Disposition")||"").match(/filename="([^"]+)"/)||[])[1]||`ALP.${format}`;
    const a=document.createElement("a");a.href=URL.createObjectURL(await r.blob());a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);ok=true;
  }catch(err){showErr(err.message)}
  finally{
    const c=$("#dlbtn");
    if(c){c.disabled=false;c.classList.remove("busy");c.classList.add(ok?"ok":"bad");
      c.innerHTML=ok?`<span class="tick">✓</span>${tx("Fichier téléchargé")}`:tx("Échec du téléchargement");
      st.dlT=setTimeout(()=>{const e=$("#dlbtn");if(e){e.classList.remove("ok","bad");e.innerHTML=DL_LABEL}},2200)}
  }
}

/* ---- Tableaux de résultats (avec les relations) ---- */
/* Nombre très petit mais non nul (ex. 0,00009384) : chiffres significatifs plutôt qu'un « 0 » trompeur */
const sciF=(v,d=3)=>{const s=v.toExponential(d).replace("e+","e");return EN?s:s.replace(".",",")};
const fmtS=v=>{
  if(!Number.isFinite(v)||v===0)return fmt(v,4);
  const a=Math.abs(v);
  return a>=1e15||a<1e-6?sciF(v):a<5e-4?v.toLocaleString(LOC,{maximumSignificantDigits:4}):fmt(v,4);
};
/* Statistiques calculées par le serveur (Python) */
const STATKEYS=["n","min","max","mean","var","skew","kurt"];
/* Sous le tableau des statistiques descriptives (donc au-dessus de l'estimation) : définition des moments m_r
   et des moments centrés μ_r (texte de D. Ghorbanzadeh) */
const MOMENTS=`<div class="moments"><p>${tx("On obtient les résultats du tableau ci-dessus en utilisant les fonctions des moments et des moments centrés définies par :")}</p>
  <p class="mrow">${katex.renderToString(String.raw`\displaystyle m_{r}=\frac{1}{n}\,\sum\limits_{i=1}^{n}x_{i}^{r}`,{throwOnError:false})}<span class="et">${tx("et")}</span>${katex.renderToString(String.raw`\displaystyle \mu_{r}=\frac{1}{n}\,\sum\limits_{i=1}^{n}\big(x_{i}-m_{1}\big)^{r}`,{throwOnError:false})}</p></div>`;
function statsSection(s,n){   /* le bouton de téléchargement occupe la droite du titre */
  return`<section class="dsec"><h4 class="withdl"><b>${n}</b>${tx("Statistiques descriptives")}${dlCtl()}</h4>${table("170px 1fr auto",["Statistique","Formule","Valeur"].map(tx),STATS.map(([k,f],i)=>[cell("k",k),cell("f",T(f)),cell("v",fmtS(s[STATKEYS[i]]??NaN))]))}${MOMENTS}</section>`;
}
function estSection(r,truth,n){
  const g=r.gradient,gp=g.applicable?g.params:null;
  const cols=truth?"100px 1fr auto auto auto":"100px 1fr auto auto";
  const head=(truth?["Paramètre","Formule explicite","Vrai","Valeur estimée","Gradient"]:["Paramètre","Formule explicite","Valeur estimée","Gradient"]).map(tx);
  const lost=g.applicable&&!g.converged,momOk=fitOk(r.moments),its=g.iterations;
  const rows=L().P.map((q,i)=>[cell("k",q.s),cell("f",T(D().ef[i])),...(truth?[cell("v",fmtS(truth[i]))]:[]),cell(momOk?"v est":"v nc",fmtS(r.moments[i]??NaN)),cell(lost?"v nc":"v",gp?fmtS(gp[i]??NaN):"—")]);
  const warn=lost?`<div class="alert">${EN?`Gradient ascent did not converge (stopped after ${its} iteration${its>1?"s":""}): its values, in red, are unreliable.${momOk?" Use the closed-form values.":""}`:`La montée de gradient n'a pas convergé (arrêt après ${its} itération${its>1?"s":""}) : ses valeurs, en rouge, ne sont pas fiables.${momOk?" Utilisez celles de la formule explicite.":""}`}</div>`:"";
  const conv=g.applicable?`<div class="card conv"><div class="convtxt"><span class="label">${tx("Montée de gradient")}</span>
      <p>${EN?"Starting point:":"Départ :"} ${L().P.map((q,i)=>`${q.s}₀ = ${fmtS(g.start[i])}`).join(EN?"; ":", ")}. ${EN?(g.converged?`Converged in <b>${its}</b> iteration${its>1?"s":""}.`:`<b class="nc">No convergence</b> after ${its} iteration${its>1?"s":""}.`):(g.converged?`Convergence en <b>${its}</b> itération${its>1?"s":""}.`:`<b class="nc">Pas de convergence</b> après ${its} itération${its>1?"s":""}.`)}</p>
      <p>${EN?"Final mean log-likelihood:":"Log-vraisemblance moyenne finale :"} <b>${fmt(g.loglik,5)}</b>${g.note?`<br><span class="muted">${g.note}</span>`:""}</p></div>
      <canvas id="conv" aria-label="${tx("Convergence de la log-vraisemblance au fil des itérations")}"></canvas></div>`
    :`<div class="card conv"><div class="convtxt"><span class="label">${tx("Montée de gradient")}</span><p class="muted">${g.reason}</p></div></div>`;
  return`<section class="dsec"><h4><b>${n}</b>${tx("Estimation des paramètres")}</h4>${warn}${table(cols,head,rows)}${conv}</section>`;
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
    x.fillStyle="#6b7385";x.font="10.5px 'JetBrains Mono',monospace";x.textAlign="left";x.fillText(`${tx("itération")} 0`,L0,H-6);x.textAlign="right";x.fillText(`${tx("itération")} ${tr[tr.length-1][0]} ${tx("(échelle log.)")}`,W-R0,H-6);
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
    const p=readParams();if(p){st.sp=p;if(st.sample){st.dirty=true;$("#dirty").textContent=tx("Paramètres modifiés : cliquez sur « Simuler » pour tirer un nouvel échantillon.")}}}
  else if(t.id==="ta"){st.col=null;st.restored=false;st.fromDemo=false;parseData(t.value)}
  else if(t.id==="col"){st.col=+t.value;parseData($("#ta").value)}
});
$("#view").addEventListener("keydown",e=>{if(st.tab==="sim"&&e.key==="Enter"&&e.target.tagName==="INPUT")simulate()});
$("#view").addEventListener("click",e=>{
  if(e.target.closest("#go"))simulate();
  if(e.target.closest("#pick"))$("#file").click();
  if(e.target.closest("#demo")){const s=Array.from({length:300},()=>L().draw(L().P.map(q=>q.v)));
    $("#ta").value=s.map(v=>L().disc?v:comma(+v.toFixed(4))).join("\n");st.col=null;st.restored=false;st.fromDemo=true;parseData($("#ta").value)}
  if(e.target.closest("#clr")){$("#ta").value="";st.col=null;st.restored=false;st.fromDemo=false;parseData("");$("#ta").focus()}
  if(e.target.closest("#est"))estimate();
  if(e.target.closest("#dlbtn"))dlMenu(!$("#dl").classList.contains("open"));
  const f=e.target.closest(".dlmenu [data-f]");if(f)exportFile(f.dataset.f);
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
  for(let k=Math.ceil(a/step-1e-9);k*step<=b+step*1e-9;k++)t.push(+(k*step).toPrecision(12)+0);
  t.step=step;return t;
}
/* Décimales affichées : juste ce qu'il faut pour écrire le pas (2 → 0, 0,2 → 1, 0,25 → 2) */
const xDecimals=t=>{let d=0;while(d<8&&Math.abs(t.step*10**d-Math.round(t.step*10**d))>1e-6)d++;return d};
function niceTicks(a,b,disc){
  const raw=(b-a)/6,mag=10**Math.floor(Math.log10(raw));let step=[1,2,5,10].map(m=>m*mag).find(s=>s>=raw);if(disc)step=Math.max(1,Math.round(step));
  const t=[];for(let k=Math.ceil(a/step-1e-9);k*step<=b+step*1e-9;k++)t.push(+(k*step).toPrecision(12)+0);return t;
}
/* Graduation très petite ou très grande (unités extrêmes) : notation scientifique plutôt qu'une suite de « 0 » */
const tickF=(v,small,d)=>{
  if(v===0||!(small||Math.abs(v)>=1e7))return fmt(v,d);
  const s=(+v.toPrecision(3)).toExponential().replace("e+","e");return EN?s:s.replace(".",",");
};
function curveOf(l,p,x0,x1){
  if(l.disc){const pts=[];for(let k=Math.ceil(x0);k<=Math.floor(x1);k++)pts.push([k,l.f(k,p)]);return pts}
  const N=200,pts=[];for(let i=0;i<N;i++){const x=x0+(x1-x0)*i/(N-1);pts.push([x,l.f(x,p)])}return pts;   // 200 points, comme Lib_Plot_densite.py
}
/* Lois à support positif : dans Propriétés, graphe sur [0, F⁻¹(0,999)] (comme Lib_Plot_densite.py) */
const POS=["exponentielle","gamma","weibull"];
/* Simulation et Application : le graphique est calculé par le serveur (alp/plot.py), le même que
   dans les exports PDF et Excel ; il s'adapte aux données, quelles qu'elles soient. */
function fromPlot(m,P){
  if(P.discrete){
    m.x0=P.x0-.7;m.x1=P.x1+.7;m.v0=m.x0;m.v1=m.x1;
    m.hist=P.ks.map((k,i)=>[k,P.freq[i]]).filter(h=>h[1]>0);
    if(P.ref)m.main=P.ks.map((k,i)=>[k,P.ref[i]??NaN]);
    if(P.est)m.estCurve=P.ks.map((k,i)=>[k,P.est[i]??NaN]);
  }else{
    const mg=(P.x1-P.x0)*.05;m.x0=P.x0;m.x1=P.x1;m.v0=P.x0-mg;m.v1=P.x1+mg;   // 5 % de marge, comme matplotlib
    m.bw=P.bw;m.hist=P.dens.map((d,i)=>[P.a+i*P.bw,d??0]);
    const pts=c=>P.grid.map((x,i)=>[x,c[i]??NaN]);                       // null = densité infinie : point non tracé
    if(P.ref)m.main=pts(P.ref);
    if(P.est)m.estCurve=pts(P.est);
  }
  m.ymax=P.ymax;
}
function buildModel(){
  const l=L(),m={main:[],hist:[],bw:1,estCurve:null,empty:null};
  if(st.tab!=="props"){
    if(st.tab==="sim"&&!st.sample)m.empty=tx("Aucun échantillon : cliquez sur « Simuler ».");
    if(st.tab==="data")m.empty=!st.data?tx("Saisissez ou importez des valeurs pour voir l'histogramme et la loi ajustée."):
      !st.dres?tx("Cliquez sur « Lancer l'estimation » pour analyser vos données."):null;
    const P=st.tab==="sim"?st.res&&st.res.plot:st.dres&&st.dres.plot;
    if(!m.empty&&!P)m.empty=tx("Calcul en cours…");
    if(!m.empty&&P){fromPlot(m,P);m.par=st.tab==="sim"?st.simP:(fitOk(st.dres.moments)?st.dres.moments:null)}
    st.model=m;return;
  }
  let par=st.p,ext=[];
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
    st.tab==="sim"?(st.sample?s("var(--a1)",tx("Loi théorique"))+s("rgba(10,15,30,.35)",tx("Échantillon simulé"))+s("dash",tx("Loi estimée")):""):
    (st.data&&st.dres?s("rgba(10,15,30,.35)",tx("Vos données"))+s("var(--a1)",tx("Loi ajustée (paramètres estimés)")):"");
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
    ctx.textAlign="center";ctx.fillText(tickF(x,xt.step<1e-4,xd),sx(x),H-Bm+17)});
  const yt=niceTicks(0,ymax,0),ySmall=yt.length>1&&yt[1]-yt[0]<1e-3;
  yt.forEach(y=>{ctx.strokeStyle="#f0f2f6";ctx.beginPath();ctx.moveTo(Lm,sy(y));ctx.lineTo(W-Rm,sy(y));ctx.stroke();ctx.fillStyle="#6b7385";ctx.textAlign="right";ctx.fillText(tickF(y,ySmall,3),Lm-8,sy(y)+4)});
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
      tp.textContent=`x = ${fmtS(x)}   ${l.disc?"P":"f"}(x) = ${fmtS(v)}`;tp.classList.add("show");return}
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
