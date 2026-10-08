/* ALP — données et calculs des dix lois (partagé par toutes les pages) */
const $=s=>document.querySelector(s);
const fmt=(x,d=4)=>Number.isFinite(x)?x.toLocaleString("fr-FR",{maximumFractionDigits:d}):"—";
/* Générateur pseudo-aléatoire : Math.random, ou mulberry32 si une graine est fixée */
const RNG={u:Math.random};
function setSeed(seed){
  if(seed===null){RNG.u=Math.random;return}
  let a=seed>>>0;RNG.u=()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
}
const U=()=>RNG.u();
const rand=()=>{let u=0;while(!u)u=U();return u};
const randn=()=>Math.sqrt(-2*Math.log(rand()))*Math.cos(2*Math.PI*U());
const mean=s=>s.reduce((a,b)=>a+b,0)/s.length;
const mn=s=>s.reduce((a,b)=>b<a?b:a,Infinity),mx=s=>s.reduce((a,b)=>b>a?b:a,-Infinity);
const mom=(s,k)=>{const m=mean(s);return s.reduce((a,b)=>a+(b-m)**k,0)/s.length};
const varS=s=>mom(s,2),skew=s=>mom(s,3)/mom(s,2)**1.5,kurt=s=>mom(s,4)/mom(s,2)**2-3;
const lg=(()=>{const c=[.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  const f=x=>{if(x<.5)return Math.log(Math.PI/Math.sin(Math.PI*x))-f(1-x);x-=1;let a=c[0];const t=x+7.5;for(let i=1;i<9;i++)a+=c[i]/(x+i);return .5*Math.log(2*Math.PI)+(x+.5)*Math.log(t)-t+Math.log(a)};return f})();
const gam=x=>Math.exp(lg(x));
const lnC=(n,k)=>lg(n+1)-lg(k+1)-lg(n-k+1);
/* gamma incomplète régularisée P(a,x) */
function gammp(a,x){
  if(x<=0)return 0;const g=lg(a);
  if(x<a+1){let ap=a,sum=1/a,del=sum;for(let n=0;n<600;n++){ap++;del*=x/ap;sum+=del;if(Math.abs(del)<Math.abs(sum)*1e-14)break}return sum*Math.exp(-x+a*Math.log(x)-g)}
  let b=x+1-a,c=1e300,d=1/b,h=d;
  for(let i=1;i<600;i++){const an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<1e-300)d=1e-300;c=b+an/c;if(Math.abs(c)<1e-300)c=1e-300;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<1e-14)break}
  return 1-Math.exp(-x+a*Math.log(x)-g)*h;
}
const erf=x=>x===0?0:Math.sign(x)*gammp(.5,x*x);
const sumTo=(f,lo,x)=>{let s=0;for(let k=lo;k<=Math.floor(x);k++)s+=f(k);return Math.min(1,s)};
const gammaDraw=(a,b)=>{ // Marsaglia–Tsang, a>0
  if(a<1)return gammaDraw(a+1,b)*Math.pow(rand(),1/a);
  const d=a-1/3,c=1/Math.sqrt(9*d);
  for(;;){const x=randn(),t=1+c*x;if(t<=0)continue;const w=t**3;if(Math.log(rand())<.5*x*x+d-d*w+d*Math.log(w))return d*w*b}
};

/* Quantiles F⁻¹(q) des lois à support positif (mêmes conventions que scipy.stats) :
   le graphe d'une densité est tracé sur [0, F⁻¹(Q_MAX)], comme dans Lib_Plot_densite.py */
const Q_MAX=0.999;
const expPpf=(q,l)=>-Math.log(1-q)/l;                          // expon.ppf(q, scale=1/λ)
const weibullPpf=(q,a,b)=>b*Math.pow(-Math.log(1-q),1/a);      // weibull_min.ppf(q, a, scale=b)
function gammaPpf(q,a,b){                                      // gamma.ppf(q, a, scale=1/b), par dichotomie sur F
  let lo=0,hi=Math.max(1,a)/b;
  while(gammp(a,b*hi)<q&&hi<1e12)hi*=2;
  for(let i=0;i<200;i++){const mid=(lo+hi)/2;gammp(a,b*mid)<q?lo=mid:hi=mid}
  return (lo+hi)/2;
}

/* Contrôles de validité des valeurs tapées */
const fin=(p)=>p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6);
const isInt=v=>Math.abs(v-Math.round(v))<1e-9;

/* ====== Calcul : une entrée par loi ======
   P : paramètres (symbole, valeur par défaut, domaine affiché)
   f : masse/densité · F : répartition · m, v : espérance, variance
   rg : intervalle de tracé · draw : tirage · est : estimateurs explicites
   check : message d'erreur ou null */
const LAWS=[
 {slug:"bernoulli",name:"Bernoulli",disc:1,ev:"E = θ · Var = θ(1−θ)",
  P:[{s:"θ",v:.3,d:"0 < θ < 1"}],
  check:([t])=>!(t>0&&t<1)?"θ doit être strictement compris entre 0 et 1.":null,
  f:(x,[t])=>x===0?1-t:x===1?t:0,F:(x,[t])=>x<0?0:x<1?1-t:1,rg:()=>[0,1],
  m:([t])=>t,v:([t])=>t*(1-t),draw:([t])=>rand()<t?1:0,est:s=>[mean(s)]},
 {slug:"binomiale",name:"Binomiale",disc:1,ev:"E = np · Var = np(1−p)",
  P:[{s:"n",v:10,d:"entier, 1 ≤ n ≤ 1000"},{s:"p",v:.4,d:"0 < p < 1"}],
  check:([n,p])=>!(isInt(n)&&n>=1&&n<=1000)?"n doit être un entier compris entre 1 et 1000.":!(p>0&&p<1)?"p doit être strictement compris entre 0 et 1.":null,
  f:(k,[n,p])=>k<0||k>n||!isInt(k)?0:Math.exp(lnC(n,k)+k*Math.log(p)+(n-k)*Math.log(1-p)),
  F:(x,P)=>x<0?0:sumTo(k=>LAWS[1].f(k,P),0,x),rg:([n])=>[0,n],
  m:([n,p])=>n*p,v:([n,p])=>n*p*(1-p),
  draw:([n,p])=>{let c=0;for(let i=0;i<n;i++)if(rand()<p)c++;return c},
  est:s=>{const m=mean(s),p=1-varS(s)/m;return p>0&&p<1?[m/p,p]:[NaN,NaN]}},
 {slug:"poisson",name:"Poisson",disc:1,ev:"E = λ · Var = λ",
  P:[{s:"λ",v:4,d:"0 < λ ≤ 500"}],
  check:([l])=>!(l>0&&l<=500)?"λ doit être strictement positif et au plus 500.":null,
  f:(k,[l])=>k<0||!isInt(k)?0:Math.exp(-l+k*Math.log(l)-lg(k+1)),
  F:(x,P)=>x<0?0:sumTo(k=>LAWS[2].f(k,P),0,x),rg:([l])=>[0,Math.ceil(l+5*Math.sqrt(l)+3)],
  m:([l])=>l,v:([l])=>l,
  draw:([l])=>{if(l>30)return Math.max(0,Math.round(l+Math.sqrt(l)*randn()));const L=Math.exp(-l);let k=0,p=1;do{k++;p*=rand()}while(p>L);return k-1},est:s=>[mean(s)]},
 {slug:"geometrique",name:"Géométrique",disc:1,ev:"E = 1/p · Var = (1−p)/p²",
  P:[{s:"p",v:.3,d:"0 < p < 1"}],
  check:([p])=>!(p>0&&p<1)?"p doit être strictement compris entre 0 et 1.":null,
  f:(k,[p])=>k<1||!isInt(k)?0:p*(1-p)**(k-1),F:(x,[p])=>x<1?0:1-(1-p)**Math.floor(x),
  rg:([p])=>[1,Math.min(400,Math.ceil(1/p+4*Math.sqrt(1-p)/p)+1)],
  m:([p])=>1/p,v:([p])=>(1-p)/p**2,draw:([p])=>1+Math.floor(Math.log(rand())/Math.log(1-p)),est:s=>[1/mean(s)]},
 {slug:"uniforme-discrete",name:"Uniforme discrète",disc:1,ev:"E = (a+b)/2",
  P:[{s:"a",v:1,d:"entier"},{s:"b",v:6,d:"entier, a < b ≤ a + 1000"}],
  check:([a,b])=>!(isInt(a)&&isInt(b))?"a et b doivent être des entiers.":!(a<b)?"Il faut a < b.":b-a>1000?"L'écart b − a doit rester inférieur à 1000.":null,
  f:(k,[a,b])=>k>=a&&k<=b&&isInt(k)?1/(b-a+1):0,F:(x,[a,b])=>x<a?0:x>=b?1:(Math.floor(x)-a+1)/(b-a+1),rg:([a,b])=>[a,b],
  m:([a,b])=>(a+b)/2,v:([a,b])=>((b-a+1)**2-1)/12,
  draw:([a,b])=>a+Math.floor(U()*(b-a+1)),est:s=>[mn(s),mx(s)]},
 {slug:"uniforme-continue",name:"Uniforme continue",disc:0,ev:"E = (a+b)/2 · Var = (b−a)²/12",
  P:[{s:"a",v:0,d:"réel"},{s:"b",v:3,d:"réel, a < b"}],
  check:([a,b])=>!(a<b)?"Il faut a < b.":null,
  f:(x,[a,b])=>x>=a&&x<=b?1/(b-a):0,F:(x,[a,b])=>x<a?0:x>b?1:(x-a)/(b-a),rg:([a,b])=>[a-(b-a)*.25,b+(b-a)*.25],
  m:([a,b])=>(a+b)/2,v:([a,b])=>(b-a)**2/12,draw:([a,b])=>a+(b-a)*U(),
  est:s=>[mn(s),mx(s)]},
 {slug:"exponentielle",name:"Exponentielle",disc:0,ev:"E = 1/λ · Var = 1/λ²",
  P:[{s:"λ",v:1,d:"λ > 0"}],
  check:([l])=>!(l>0)?"λ doit être strictement positif.":null,
  f:(x,[l])=>x<0?0:l*Math.exp(-l*x),F:(x,[l])=>x<0?0:1-Math.exp(-l*x),rg:([l])=>[0,expPpf(Q_MAX,l)],
  m:([l])=>1/l,v:([l])=>1/l**2,draw:([l])=>-Math.log(rand())/l,est:s=>[1/mean(s)]},
 {slug:"normale",name:"Normale",disc:0,ev:"E = μ · Var = σ²",
  P:[{s:"μ",v:0,d:"réel"},{s:"σ²",v:1,d:"σ² > 0"}],
  check:([,v])=>!(v>0)?"σ² doit être strictement positif.":null,
  f:(x,[u,v])=>Math.exp(-((x-u)**2)/(2*v))/Math.sqrt(2*Math.PI*v),
  F:(x,[u,v])=>.5*(1+erf((x-u)/Math.sqrt(2*v))),rg:([u,v])=>[u-4*Math.sqrt(v),u+4*Math.sqrt(v)],
  m:([u])=>u,v:([,v])=>v,draw:([u,v])=>u+Math.sqrt(v)*randn(),est:s=>[mean(s),varS(s)]},
 {slug:"gamma",name:"Gamma",disc:0,ev:"E = a/b · Var = a/b²",
  P:[{s:"a",v:2,d:"a > 0 (forme)"},{s:"b",v:.5,d:"b > 0 (taux)"}],
  check:([a,b])=>!(a>0&&b>0)?"a et b doivent être strictement positifs.":null,
  f:(x,[a,b])=>x<=0?0:Math.exp(a*Math.log(b)+(a-1)*Math.log(x)-b*x-lg(a)),
  F:(x,[a,b])=>gammp(a,b*x),rg:([a,b])=>[0,gammaPpf(Q_MAX,a,b)],
  m:([a,b])=>a/b,v:([a,b])=>a/(b*b),draw:([a,b])=>gammaDraw(a,1/b),
  est:s=>{const m=mean(s),v=varS(s);return[m*m/v,m/v]}},
 {slug:"weibull",name:"Weibull",disc:0,ev:"E = bΓ(1+1/a)",
  P:[{s:"a",v:1.5,d:"0,3 ≤ a ≤ 100 (forme)"},{s:"b",v:1,d:"b > 0 (échelle)"}],
  check:([a,b])=>!(a>=.3&&a<=100)?"a doit être compris entre 0,3 et 100.":!(b>0)?"b doit être strictement positif.":null,
  f:(x,[a,b])=>x<0?0:(a/b)*(x/b)**(a-1)*Math.exp(-((x/b)**a)),F:(x,[a,b])=>x<0?0:1-Math.exp(-((x/b)**a)),
  rg:([a,b])=>[0,weibullPpf(Q_MAX,a,b)],
  m:([a,b])=>b*gam(1+1/a),v:([a,b])=>b*b*(gam(1+2/a)-gam(1+1/a)**2),draw:([a,b])=>b*Math.pow(-Math.log(rand()),1/a),
  est:s=>{if(s.some(v=>v<=0))return[NaN,NaN];const n=s.length,lx=s.slice().sort((a,b)=>a-b).map(Math.log),y=lx.map((_,i)=>Math.log(-Math.log(1-(i+1-.3)/(n+.4)))),mx_=mean(lx),my=mean(y);let sxy=0,sxx=0;lx.forEach((v,i)=>{sxy+=(v-mx_)*(y[i]-my);sxx+=(v-mx_)**2});const a=sxy/sxx;return[a,mean(s)/gam(1+1/a)]}},
];
const bySlug=s=>Math.max(0,LAWS.findIndex(l=>l.slug===s));

/* ====== Cours : texte + formules LaTeX ======
   rows : lignes du tableau « Définition », écrites comme sur le site de référence.
   Une formule qui commence par « § » est affichée comme du texte. */
const NUM="§Pas de forme explicite ; elle est obtenue numériquement.";
const DOC=[
 {nt:String.raw`X\sim\mathcal{B}(\theta)`,
  desc:"La loi de Bernoulli décrit une épreuve unique à deux issues possibles. Elle prend la valeur 1 avec la probabilité θ et la valeur 0 sinon.",
  rows:[["Fonction de masse",String.raw`P(X=1)=\theta,\qquad P(X=0)=1-\theta`],
        ["Support",String.raw`x\in\{0,1\},\qquad \theta\in[0,1]`]],
  E:String.raw`E[X]=\theta`,V:String.raw`\mathrm{Var}(X)=\theta(1-\theta)`,ef:[String.raw`\hat\theta=m_1`]},
 {nt:String.raw`X\sim\mathcal{B}(n,p)`,
  desc:"La loi binomiale compte le nombre de succès parmi n épreuves de Bernoulli indépendantes, toutes de même probabilité de succès p.",
  rows:[["Fonction de masse",String.raw`P(X=k)=\binom{n}{k}\,p^{k}(1-p)^{n-k},\qquad k\in\{0,\dots,n\}`],
        ["Support",String.raw`k\in\{0,1,\dots,n\},\qquad n\in\mathbb{N}^*,\quad p\in[0,1]`]],
  E:String.raw`E[X]=np`,V:String.raw`\mathrm{Var}(X)=np(1-p)`,
  ef:[String.raw`\hat n=\operatorname{arrondi}\!\left(\dfrac{m_1}{\hat p}\right)`,String.raw`\hat p=1-\dfrac{\mu_2}{m_1}`]},
 {nt:String.raw`X\sim\mathcal{P}(\lambda)`,
  desc:"La loi de Poisson modélise le nombre d'événements rares survenant dans un intervalle fixe, lorsqu'ils arrivent indépendamment les uns des autres à un taux moyen λ.",
  rows:[["Fonction de masse",String.raw`P(X=k)=e^{-\lambda}\,\dfrac{\lambda^{k}}{k!},\qquad k\in\mathbb{N}`],
        ["Support",String.raw`k\in\{0,1,2,\dots\},\qquad \lambda>0`]],
  E:String.raw`E[X]=\lambda`,V:String.raw`\mathrm{Var}(X)=\lambda`,ef:[String.raw`\hat\lambda=m_1`]},
 {nt:String.raw`X\sim\mathcal{G}(p)`,
  desc:"La loi géométrique donne le rang du premier succès dans une suite d'épreuves de Bernoulli indépendantes de probabilité de succès p.",
  rows:[["Fonction de masse",String.raw`P(X=k)=p\,(1-p)^{k-1},\qquad k\ge 1`],
        ["Support",String.raw`k\in\{1,2,\dots\},\qquad p\in\,]0,1]`]],
  E:String.raw`E[X]=\dfrac{1}{p}`,V:String.raw`\mathrm{Var}(X)=\dfrac{1-p}{p^{2}}`,ef:[String.raw`\hat p=\dfrac{1}{m_1}`]},
 {nt:String.raw`X\sim\mathcal{U}\{a,\dots,b\}`,
  desc:"La loi uniforme discrète attribue la même probabilité à chaque entier compris entre a et b. C'est le modèle du dé équilibré.",
  rows:[["Fonction de masse",String.raw`P(X=k)=\dfrac{1}{b-a+1},\qquad k\in\{a,a+1,\dots,b\}`],
        ["Support",String.raw`k\in\{a,a+1,\dots,b\},\qquad a,b\in\mathbb{Z},\quad a<b`]],
  E:String.raw`E[X]=\dfrac{a+b}{2}`,V:String.raw`\mathrm{Var}(X)=\dfrac{(b-a+1)^{2}-1}{12}`,
  ef:[String.raw`\hat a=\min_i x_i`,String.raw`\hat b=\max_i x_i`]},
 {nt:String.raw`X\sim\mathcal{U}([a,b])`,
  desc:"La loi uniforme continue répartit la probabilité de façon égale sur l'intervalle [a, b] : tous les sous-intervalles de même longueur sont équiprobables.",
  rows:[["Densité",String.raw`f(x,a,b)=\begin{cases}\dfrac{1}{b-a}, & a\le x\le b\\[4pt] 0, & \text{sinon}\end{cases}`],
        ["Fonction de répartition",String.raw`F(x,a,b)=\begin{cases}0, & x<a\\[2pt] \dfrac{x-a}{b-a}, & a\le x\le b\\[4pt] 1, & x>b\end{cases}`],
        ["Support",String.raw`x\in[a,b],\qquad a<b`]],
  E:String.raw`E[X]=\dfrac{a+b}{2}`,V:String.raw`\mathrm{Var}(X)=\dfrac{(b-a)^{2}}{12}`,
  ef:[String.raw`\hat a=\min_i x_i`,String.raw`\hat b=\max_i x_i`]},
 {nt:String.raw`X\sim\mathcal{E}(\lambda)`,
  desc:"La loi exponentielle décrit le temps d'attente avant un événement dans un processus sans mémoire, de taux λ.",
  rows:[["Densité",String.raw`f(x,\lambda)=\lambda e^{-\lambda x},\qquad x\ge 0`],
        ["Fonction de répartition",String.raw`F(x,\lambda)=1-e^{-\lambda x},\qquad x\ge 0`],
        ["Fonction de répartition inverse",String.raw`F^{-1}(p,\lambda)=-\dfrac{1}{\lambda}\ln(1-p),\qquad 0\le p\le 1`],
        ["Support",String.raw`x\in[0,\infty),\qquad \lambda>0`]],
  E:String.raw`E[X]=\dfrac{1}{\lambda}`,V:String.raw`\mathrm{Var}(X)=\dfrac{1}{\lambda^{2}}`,ef:[String.raw`\hat\lambda=\dfrac{1}{m_1}`]},
 {nt:String.raw`X\sim\mathcal{N}(\mu,\sigma^2)`,
  desc:"La loi normale répartit sa masse symétriquement autour d'un centre μ, avec une largeur fixée par la variance σ². C'est la loi limite des sommes normalisées d'observations indépendantes, d'où son omniprésence en mesure.",
  rows:[["Densité",String.raw`f(x,\mu,\sigma^2)=\dfrac{1}{\sqrt{2\pi\sigma^2}}\,e^{-\frac{(x-\mu)^2}{2\sigma^2}}`],
        ["Fonction de répartition",String.raw`F(x,\mu,\sigma^2)=\int_{-\infty}^{x}\dfrac{1}{\sqrt{2\pi\sigma^2}}\,e^{-\frac{(t-\mu)^2}{2\sigma^2}}\,dt`],
        ["Fonction de répartition inverse",NUM],
        ["Support",String.raw`-\infty<x<\infty,\qquad \mu\in\mathbb{R},\qquad \sigma^2>0`]],
  E:String.raw`E[X]=\mu`,V:String.raw`\mathrm{Var}(X)=\sigma^2`,ef:[String.raw`\hat\mu=m_1`,String.raw`\hat\sigma^2=\mu_2`]},
 {nt:String.raw`X\sim\Gamma(a,b)`,
  desc:"La loi gamma généralise l'exponentielle. Elle modélise des grandeurs positives et asymétriques, comme des durées ou des cumuls ; a est le paramètre de forme et b le taux.",
  rows:[["Densité",String.raw`f(x,a,b)=\dfrac{b^{a}}{\Gamma(a)}\,x^{a-1}e^{-bx},\qquad x\ge 0`],
        ["Fonction de répartition",String.raw`F(x,a,b)=\dfrac{\gamma(a,bx)}{\Gamma(a)},\qquad x\ge 0`],
        ["Fonction de répartition inverse",NUM],
        ["Support",String.raw`x\in[0,+\infty),\qquad a>0,\quad b>0`]],
  E:String.raw`E[X]=\dfrac{a}{b}`,V:String.raw`\mathrm{Var}(X)=\dfrac{a}{b^{2}}`,
  ef:[String.raw`\hat a=\dfrac{m_1^{2}}{\mu_2}`,String.raw`\hat b=\dfrac{m_1}{\mu_2}`]},
 {nt:String.raw`X\sim\mathcal{W}(a,b)`,
  desc:"La loi de Weibull est le modèle classique des durées de vie et de la fiabilité. Son paramètre de forme a règle l'évolution du taux de défaillance ; b est le paramètre d'échelle.",
  rows:[["Densité",String.raw`f(x,a,b)=\dfrac{a}{b}\left(\dfrac{x}{b}\right)^{a-1}e^{-(x/b)^{a}},\qquad x\ge 0`],
        ["Fonction de répartition",String.raw`F(x,a,b)=1-e^{-(x/b)^{a}},\qquad x\ge 0`],
        ["Fonction de répartition inverse",String.raw`F^{-1}(p,a,b)=b\,\bigl(-\ln(1-p)\bigr)^{\frac{1}{a}},\qquad 0\le p\le 1`],
        ["Support",String.raw`x\ge 0,\qquad a>0,\qquad b>0`]],
  E:String.raw`E[X]=b\,\Gamma\!\left(1+\dfrac{1}{a}\right)`,
  V:String.raw`\mathrm{Var}(X)=b^{2}\left[\Gamma\!\left(1+\dfrac{2}{a}\right)-\Gamma\!\left(1+\dfrac{1}{a}\right)^{2}\right]`,
  ef:[String.raw`\hat a=\dfrac{\sum_i\left(\ln x_{(i)}-\overline{\ln x}\right)\left(y_i-\bar y\right)}{\sum_i\left(\ln x_{(i)}-\overline{\ln x}\right)^{2}},\quad y_i=\ln\!\left(-\ln\!\left(1-\tfrac{i-0.3}{n+0.4}\right)\right)`,String.raw`\hat b=\dfrac{m_1}{\Gamma(1+1/\hat a)}`]},
];
const STATS=[
 ["Observations",String.raw`n`,s=>s.length],
 ["Minimum",String.raw`\min(x_1,\dots,x_n)`,mn],
 ["Maximum",String.raw`\max(x_1,\dots,x_n)`,mx],
 ["Moyenne",String.raw`m_1=\bar x_n=\dfrac1n\sum_{i=1}^n x_i`,mean],
 ["Variance",String.raw`\mu_2=\dfrac1n\sum_{i=1}^n(x_i-\bar x_n)^2`,varS],
 ["Asymétrie",String.raw`\gamma_1=\mu_3\big/\mu_2^{3/2}`,skew],
 ["Kurtosis",String.raw`\gamma_2=\mu_4\big/\mu_2^{2}-3`,kurt],
];

/* Courbe normalisée d'une loi, pour les petites vignettes (0..1 en x et en y) */
function shape(L,n=80){
  const p=L.P.map(q=>q.v),[a,b]=L.rg(p);let ys=[];
  if(L.disc){const K=[];for(let k=a;k<=b;k++)K.push(L.f(k,p));
    for(let i=0;i<n;i++){const t=i/(n-1)*(K.length-1),j=Math.floor(t),fr=t-j,s=(1-Math.cos(fr*Math.PI))/2;ys.push(K[j]*(1-s)+(K[j+1]??K[j])*s)}}
  else for(let i=0;i<n;i++)ys.push(L.f(a+(b-a)*i/(n-1),p));
  const m=Math.max(...ys);return ys.map(y=>y/m);
}
function sparkPath(L,W,H,pad=1.5){
  const p=L.P.map(q=>q.v),[a,b]=L.rg(p);let pts=[];
  if(L.disc){for(let k=Math.ceil(a);k<=b;k++)pts.push([k,L.f(k,p)])}else for(let i=0;i<=60;i++){const x=a+(b-a)*i/60;pts.push([x,L.f(x,p)])}
  const m=Math.max(...pts.map(q=>q[1])),x0=L.disc?a-.5:a,x1=L.disc?b+.5:b,sx=x=>(x-x0)/(x1-x0)*W,sy=y=>H-pad-y/m*(H-2*pad-1);
  return L.disc?pts.map(([x,y])=>`M${sx(x).toFixed(1)} ${H} V${sy(y).toFixed(1)}`).join(""):"M"+pts.map(([x,y])=>sx(x).toFixed(1)+" "+sy(y).toFixed(1)).join(" L");
}
/* Quelle loi pour quel phénomène (accueil + guide) */
const CHOOSE=[
 ["Une épreuve a deux issues : succès ou échec.",["bernoulli"],"Deux issues"],
 ["Vous comptez les succès sur n épreuves indépendantes.",["binomiale"],"Compter des succès"],
 ["Vous comptez des événements sur une durée ou une zone fixe.",["poisson"],"Compter des événements"],
 ["Vous attendez un premier succès, compté en nombre d'épreuves.",["geometrique"],"Attendre un succès"],
 ["Toutes les valeurs entières d'un intervalle sont équiprobables.",["uniforme-discrete"],"Entiers équiprobables"],
 ["Toutes les valeurs d'un intervalle réel sont équiprobables.",["uniforme-continue"],"Intervalle équiprobable"],
 ["Vous observez des écarts symétriques autour d'une valeur centrale.",["normale"],"Écarts symétriques"],
 ["Vous mesurez une durée d'attente sans mémoire.",["exponentielle"],"Attente sans mémoire"],
 ["Vous étudiez des durées ou des grandeurs positives et asymétriques.",["gamma","weibull"],"Durées positives"],
];
const chooseRows=()=>CHOOSE.map(([q,ls])=>`<tr><td>${q}</td><td>${ls.map(s=>`<a class="lnk" href="/loi/${s}">${LAWS[bySlug(s)].name}</a>`).join(" ou ")}</td></tr>`).join("");

/* Lecture d'un nombre tapé (virgule ou point) */
const num=s=>{s=String(s).trim().replace(/\s/g,"").replace(",",".");return s===""?NaN:Number(s)};
