/* ALP — comportements communs à toutes les pages */
(function(){
  /* Couleur d'accent : commence en bleu et glisse lentement vers l'orange, puis revient.
     Cycle complet de 2 minutes ; l'horloge est partagée entre les pages de la visite. */
  const root=document.documentElement,PERIOD=120000;
  let start=Date.now();try{const s=+sessionStorage.getItem("alp-t0");if(s)start=s;else sessionStorage.setItem("alp-t0",start)}catch(e){}
  /* Mélange dans l'espace OKLab : le passage bleu → orange reste naturel, sans détour par le rose */
  const lin=c=>(c/=255)<=.04045?c/12.92:((c+.055)/1.055)**2.4,gam=c=>Math.round(255*Math.min(1,Math.max(0,c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055)));
  function toLab([r,g,b]){[r,g,b]=[r,g,b].map(lin);
    const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
    return[.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s]}
  function toRgb([L,a,b]){const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
    return[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s].map(gam)}
  const BLUE=toLab([47,91,255]),ORANGE=toLab([240,83,45]);
  let lastEvt=0;
  function tint(){
    const u=(1-Math.cos(2*Math.PI*((Date.now()-start)%PERIOD)/PERIOD))/2,
          f=Math.min(1,Math.max(0,(u-.25)/.5)),e=f*f*(3-2*f);                 // paliers : bleu, transition, orange, transition
    const lab=BLUE.map((v,i)=>v+(ORANGE[i]-v)*e),rgb=toRgb(lab),dk=toRgb([lab[0]-.1,lab[1],lab[2]]);
    root.style.setProperty("--a1",`rgb(${rgb})`);root.style.setProperty("--a1-rgb",rgb.join(","));root.style.setProperty("--a1-d",`rgb(${dk})`);
    const now=Date.now();if(now-lastEvt>1500){lastEvt=now;dispatchEvent(new Event("themechange"))}  // les graphiques se redessinent de temps en temps
  }
  tint();setInterval(tint,250);

  /* Lecture d'une variable CSS (utilisée par les graphiques) */
  window.cssv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* Logo : histogramme en points, aux couleurs de la palette */
  function logoSVG(){
    const cols=[1,2,4,6,7,6,4,2,1],p=3.8,h=7*p;let s="";
    cols.forEach((c,i)=>{for(let j=0;j<c;j++){s+=`<circle cx="${(p/2+i*p).toFixed(1)}" cy="${(h-p/2-j*p).toFixed(1)}" r="1.5" style="--i:${i};fill:${j===c-1?(i<4?"var(--a1)":i>4?"var(--a2)":"var(--a1)"):"var(--ink)"}"/>`}});
    return`<svg viewBox="0 0 ${(9*p).toFixed(1)} ${h.toFixed(1)}" height="30" aria-hidden="true" style="display:block">${s}</svg>`;
  }

  document.addEventListener("DOMContentLoaded",()=>{
    document.querySelectorAll(".logo-mark").forEach(e=>e.innerHTML=logoSVG());

    /* Barre de progression + en-tête */
    const bar=document.createElement("div");bar.id="progress";document.body.prepend(bar);
    const hd=document.querySelector("header");
    const onScroll=()=>{const h=document.documentElement,max=h.scrollHeight-h.clientHeight;bar.style.width=(max>0?h.scrollTop/max*100:0)+"%";if(hd)hd.classList.toggle("scrolled",h.scrollTop>8)};
    addEventListener("scroll",onScroll,{passive:true});onScroll();

    /* Apparition au défilement */
    const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{threshold:.12,rootMargin:"0px 0px -40px 0px"});
    document.querySelectorAll(".reveal,.journey").forEach(el=>io.observe(el));
    window.observeReveal=el=>io.observe(el);

    /* Compteurs : les chiffres [data-count] défilent jusqu'à leur valeur */
    const still=matchMedia("(prefers-reduced-motion: reduce)").matches;
    const co=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;co.unobserve(e.target);
      const el=e.target,to=+el.dataset.count,from=+(el.dataset.from||0),t0=performance.now(),dur=1100;
      if(still){el.textContent=to;return}
      (function step(t){const k=Math.min(1,(t-t0)/dur),v=from+(to-from)*(1-(1-k)**3);el.textContent=Math.round(v);if(k<1)requestAnimationFrame(step)})(t0);
    }),{threshold:.6});
    document.querySelectorAll("[data-count]").forEach(el=>co.observe(el));

    /* Inclinaison 3D légère des cartes [data-tilt] */
    if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&matchMedia("(hover:hover)").matches){
      document.addEventListener("mousemove",e=>{const c=e.target.closest("[data-tilt]");if(!c)return;
        const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
        c.style.transform=`perspective(700px) rotateX(${(-y*7).toFixed(2)}deg) rotateY(${(x*9).toFixed(2)}deg) translateY(-3px)`});
      document.addEventListener("mouseout",e=>{const c=e.target.closest("[data-tilt]");if(c&&!c.contains(e.relatedTarget))c.style.transform=""});
    }

    /* Agrandissement des photos [data-zoom] */
    const lb=document.createElement("div");lb.className="lightbox";lb.innerHTML="<img alt=''>";document.body.appendChild(lb);
    document.addEventListener("click",e=>{const im=e.target.closest("img[data-zoom]");if(im){lb.firstChild.src=im.src;lb.firstChild.alt=im.alt;lb.classList.add("show")}});
    lb.addEventListener("click",()=>lb.classList.remove("show"));
    addEventListener("keydown",e=>{if(e.key==="Escape")lb.classList.remove("show")});
  });
})();
