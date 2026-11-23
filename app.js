'use strict';
/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{if(typeof v==='number')return isFinite(v)?v:NaN;const t=String(v==null?'':v).replace(/[₹,\s]|^rs\.?|inr/gi,'');if(t==='')return NaN;return Number(t);};
const fi=n=>isFinite(n)?Math.round(n).toLocaleString('en-IN'):'–';
const f1=n=>isFinite(n)?n.toLocaleString('en-IN',{minimumFractionDigits:1,maximumFractionDigits:1}):'–';
const f2=n=>isFinite(n)?n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}):'–';
const inr=n=>isFinite(n)?(n<0?'-':'')+'₹'+Math.abs(Math.round(n)).toLocaleString('en-IN'):'–';
const inrC=n=>{if(!isFinite(n))return '–';const a=Math.abs(n),s=n<0?'-':'';if(a>=1e7)return s+'₹'+(a/1e7).toFixed(2)+' Cr';if(a>=1e5)return s+'₹'+(a/1e5).toFixed(2)+' L';return s+'₹'+Math.round(a).toLocaleString('en-IN');};
const pc=n=>isFinite(n)?(n*100).toFixed(1)+'%':'–';
const dayOf=(y,m,d)=>(m<1||m>12||d<1||d>31)?null:Math.floor(Date.UTC(y,m-1,d)/864e5);
const dayStr=d=>new Date(d*864e5).toISOString().slice(0,10);
function parseDay(v){
  if(v==null||v==='')return null;
  if(v instanceof Date){return isNaN(v)?null:dayOf(v.getFullYear(),v.getMonth()+1,v.getDate());}
  if(typeof v==='number'){return (v>20000&&v<80000)?Math.floor(v)-25569:null;}
  const t=String(v).trim();let m;
  if((m=t.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)))return dayOf(+m[1],+m[2],+m[3]);
  if((m=t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))){let a=+m[1],b=+m[2],y=+m[3];if(y<100)y+=2000;if(b>12&&a<=12){const x=a;a=b;b=x;}return dayOf(y,b,a);}
  const p=Date.parse(t);if(!isNaN(p)){const d=new Date(p);return dayOf(d.getFullYear(),d.getMonth()+1,d.getDate());}
  return null;
}
function invNorm(p){ // Acklam's rational approximation
  const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239];
  const b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572];
  const c=[-0.007784894002430293,-0.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783];
  const d=[0.007784695709041462,0.3224671290700398,2.445134137142996,3.754408661907416];
  if(p<=0)return -8;if(p>=1)return 8;let q,r;
  if(p<0.02425){q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  if(p>1-0.02425){q=Math.sqrt(-2*Math.log(1-p));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  q=p-0.5;r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
function percentile(arr,p){if(!arr.length)return Infinity;const s=[...arr].sort((x,y)=>x-y),i=(p/100)*(s.length-1),lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo);}
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),4200);}

/* ---------- variables (every decision input lives here) ---------- */
const VARS=[
 {k:'W',g:'Demand estimate',l:'Trailing window',u:'days',d:60,min:7,src:'Your choice',use:['segment','hub','nodes','tower','surges','avail','prodinv','stores'],h:'Days of order history behind average daily sales (d) and daily variability (σ). Deliberately short: a crude short-horizon estimate, not a long-horizon SKU forecast.'},
 {k:'exclude',g:'Demand estimate',l:'Ignore order rows whose status matches',u:'regex',d:'cancel|rto|return|fail',type:'text',src:'Your choice',use:['data'],h:'Applied only if you map a status column on upload.'},
 {k:'oosInfer',g:'Demand estimate',l:'Infer stock-outs from zero-sales streaks (used only when no stock history is loaded)',u:'yes / no',d:1,type:'bool',src:'Your choice',use:['segment','data','hub','nodes','avail'],h:'A long run of zero-sales days on a listing that sold before is treated as a stock-out, not as low demand. Those days are left out of daily sales (d) and variability (σ). Turn off if your listings are often seasonal or delisted for long periods.'},
 {k:'oosStreak',g:'Demand estimate',l:'Zero-sales days in a row that count as a stock-out',u:'days',d:5,min:2,src:'Your choice',use:['segment','data','hub','nodes','avail'],h:'This is the minimum. Slow sellers need a longer gap, about three days of expected sales (a 0.2 units/day listing needs 15 days), so ordinary quiet spells are not read as stock-outs. Ignored for listings that have a stock history.'},
 {k:'gst',g:'Margin (GM & CM)',l:'GST included in MRP',u:'%',d:18,min:0,max:40,src:'Check your product HSN rates',use:['margin','segment','skus'],h:'MRP includes GST. Gross margin and contribution margin are measured on net revenue after removing it.'},
 {k:'classPct',g:'Step 1 · Segment',l:'High-volume cut-off',u:'percentile within channel',d:70,min:1,max:99,src:'Placeholder, tune',use:['segment'],h:'A listing is high-volume if its units/month is at or above this percentile of the channel’s selling listings. Per channel because Amazon and Myntra volumes are not comparable.'},
 {k:'marginCut',g:'Step 1 · Segment',l:'High-margin cut-off',u:'% contribution margin of net revenue (ex-GST)',d:35,min:0,max:95,src:'Placeholder, tune',use:['segment'],h:'Contribution margin per unit after GST, discount, commission, delivery, packing, returns, ads and store costs (see Channel costs on the data desk), as % of net revenue.'},
 {k:'tA',g:'Step 1 · Segment',l:'Target availability, class A',u:'%',d:99,min:50,max:99.9,src:'Book example',use:['segment','hub','nodes','avail','stores'],h:'Starting value from the book, not law.'},
 {k:'tB',g:'Step 1 · Segment',l:'Target availability, class B',u:'%',d:97,min:50,max:99.9,src:'Book example',use:['segment','hub','nodes','avail']},
 {k:'tC',g:'Step 1 · Segment',l:'Target availability, class C',u:'%',d:90,min:50,max:99.9,src:'Book example',use:['segment','hub','nodes','avail']},
 {k:'hubL',g:'Step 2 · Hub pool',l:'Hub replenishment lead time',u:'days',d:14,min:1,src:'Your production lead time',use:['hub','tower','surges','avail'],h:'Time from deciding to make or buy until stock is in the hub. The hub safety stock protects against demand variability over this lead time.'},
 {k:'hubCycle',g:'Step 2 · Hub pool',l:'Production / purchase cycle',u:'days of demand',d:14,min:1,src:'Your choice',use:['hub','tower'],h:'Order-up-to level at the hub = reorder point + this many days of demand.'},
 {k:'rho',g:'Step 2 · Hub pool',l:'Demand correlation across channels (used only when not measured)',u:'0 to 1',d:0,min:0,max:1,step:0.1,src:'Assumption',use:['hub','avail'],h:'0 means channel demands are independent, so pooling gives the full √ benefit. 1 means they move together and pooling saves nothing.'},
 {k:'rhoAuto',g:'Step 2 · Hub pool',l:'Measure correlation from orders',u:'yes / no',d:1,type:'bool',src:'Recommended',use:['hub','avail'],h:'Yes: correlation is measured per SKU from daily orders across channels. No: the typed value above is used.'},
 {k:'hubLsd',g:'Step 2 · Hub pool',l:'Production lead-time swing (std dev)',u:'days',d:2,min:0,step:0.5,src:'Placeholder: measure promised vs actual batch dates',use:['hub','tower','avail'],h:'How many days a batch typically lands early or late. Warehouse safety stock covers this as well as demand swings: z × √(σ²·L + d²·σL²).'},
 {k:'postpone',g:'Step 2 · Hub pool',l:'Channel-specific steps can happen after the hub?',u:'yes / no',d:1,type:'bool',src:'Depends on your products',use:['hub'],h:'Labelling, packaging, bundling after the hub is what lets one stock pool serve every channel. Set No if stock must be committed to a channel when made; pooling saving then drops to zero.'},
 {k:'dsL',g:'Step 3 · Forward nodes',l:'Dark-store delivery time, average across cities',u:'days',d:1,min:0,step:0.5,src:'Placeholder: replace with the average of your real lanes',use:['nodes','tower','stores','avail'],h:'Days from the company warehouse to a quick-commerce dark store. One average for Blinkit, Zepto and Instamart in every city for now. Each retail store has its own delivery time on the data desk (Store delivery times).'},
 {k:'R',g:'Step 3 · Forward nodes',l:'Refill cycle',u:'days',d:2,min:0,src:'Your choice',use:['nodes','tower','stores'],h:'Small and often. Order-up-to level = reorder point + R × daily sales.'},
 {k:'trigDOC',g:'Step 4 · Control tower',l:'Minimum days of cover before refill',u:'days',d:3,min:0,src:'Your choice',use:['tower'],h:'A node is also refilled when its days of cover fall below this, even if it is above the reorder point.'},
 {k:'storeCredit',g:'Step 4 · Control tower',l:'Credit store stock above its reorder point to the warehouse',u:'yes / no',d:1,type:'bool',src:'Recommended',use:['tower','capacity'],h:'Stock in a store above its own reorder point will cover that store before its next refill, so the warehouse does not hold it a second time.'},
 {k:'reserve',g:'Step 4 · Control tower',l:'Hub reserve for direct-ship demand',u:'days of demand',d:3,min:0,src:'Your choice',use:['tower'],h:'Hub stock held back for website and ship-on-order demand before any is moved to forward nodes.'},
 {k:'bull',g:'Step 5 · Surges',l:'Bullwhip amplification',u:'×',d:4,min:1,src:'Book example (10% → 40%)',use:['surges'],h:'Order spike seen upstream per unit of demand rise when replenishing in big infrequent orders.'},
 {k:'fMonths',g:'Step 6 · Capacity',l:'Months averaged for forecast',u:'30-day buckets',d:3,min:1,max:6,src:'Your choice',use:['capacity']},
 {k:'growth',g:'Step 6 · Capacity',l:'Growth adjustment',u:'% on top of average',d:0,min:-50,max:200,src:'Your choice',use:['capacity']},
 {k:'commit',g:'Step 6 · Capacity',l:'Share of family forecast committed to production',u:'%',d:70,min:0,max:100,src:'Your choice',use:['capacity'],h:'The rest is made later, with the SKU mix decided from hub depletion.'}
];
const CH_DEF=[
 {name:'Website',type:'Own site',fee:0,ret:8,disc:10,L:0,node:0},
 {name:'Amazon',type:'Marketplace',fee:18,ret:6,disc:25,L:0,node:0},
 {name:'Flipkart',type:'Marketplace',fee:17,ret:8,disc:25,L:0,node:0},
 {name:'Myntra',type:'Marketplace',fee:30,ret:12,disc:30,L:0,node:0},
 {name:'Blinkit',type:'Quick commerce',fee:2,ret:1,disc:28,L:1,node:1},
 {name:'Zepto',type:'Quick commerce',fee:2,ret:1,disc:28,L:1,node:1},
 {name:'Instamart',type:'Quick commerce',fee:2,ret:1,disc:28,L:1,node:1}
];
/* Retail stores found on Google Maps (search run 23 Nov 2026). Positions, phone and hours are as Maps shows them. */
const STORES=[
 ['Store GK-1','DailyObjects Store - GK-1, N Block','Delhi','Ground floor, Kasbah Building, N-2 Market, N Block, Greater Kailash I, New Delhi 110048',28.5569422,77.2329081,'+91 99903 90637','11:00–22:00',4.9,114,'ChIJtcJmTmTjDDkRiztQEFyA8pU','High street',/gk-?1|greater kailash/],
 ['Store Aerocity','DailyObjects Store - Worldmark 5 Aerocity','Delhi','5 Worldmark, Asset Area, Gateway District, LP-1B-03, Aerocity, New Delhi 110037',28.5504685,77.1245931,'+91 85880 30872','11:00–22:00',5.0,1,'ChIJT-BMwmUdDTkRSsMSKfZC7ZI','Mall',/aerocity|worldmark/],
 ['Store Gurugram','DailyObjects Store - DLF Summit Plaza','Gurugram','First Floor, FC1, DLF Summit Rd, DLF Phase 5, Sector 54, Gurugram 122009',28.4462104,77.1063597,'+91 99908 47076','11:00–22:00',4.6,20,'ChIJAdhUp9AfDTkRr4BQVgGroeU','Mall',/summit plaza|gurgaon store|gurugram store/],
 ['Store Mumbai Airport','DailyObjects Store - Mumbai Airport T2','Mumbai','Terminal 2, CSIA Level 3, Domestic SHA, Vile Parle, Mumbai 400099',19.0967877,72.8749323,'+91 93551 14001','Open 24 hours',4.8,146,'ChIJCWDUrkLI5zsRjFvme0YHVxI','Airport',/mumbai airport|csmia|bom/],
 ['Store Sky City','DailyObjects Store - Sky City Mall, Borivali','Mumbai','Ground Floor, Sky City Mall, G44, Khande Rao Dongari, Borivali East, Mumbai 400066',19.2231026,72.864184,'+91 93552 28946','11:00–22:00',4.7,705,'ChIJU7iFbACx5zsRQeiA3813hm8','Mall',/sky city|borivali/],
 ['Store Ballard Pier','DailyObjects Store - Ballard Pier','Mumbai','Unit 04, 3rd Floor, Ballard Pier Downtown Experience Centre, Fort, Mumbai 400001',18.9306198,72.8437785,'+91 99901 47193','11:00–22:00',4.0,13,'ChIJAaZlyFzR5zsRoVgWAs9vqPY','Cruise terminal',/ballard/],
 ['Store Ecoworld','DailyObjects Store - The Bay at Ecoworld','Bengaluru','1st Floor, The Bay at Ecoworld, Outer Ring Rd, Bellandur, Bengaluru 560103',12.9205731,77.6843732,'+91 99900 58553','10:00–22:00',4.8,163,'ChIJK4GCIQITrjsRz2-ukrrgnDM','Mall',/ecoworld|bellandur/],
 ['Store HSR','DailyObjects Store - HSR Layout','Bengaluru','Unit 1286, 27th Main Rd, Sector 2, HSR Layout, Bengaluru 560102',12.9063282,77.6513191,'+91 99900 26981','11:00–22:00',4.7,64,'ChIJx1BmpXwVrjsRVwC6ZJFymYA','High street',/hsr/],
 ['Store Bengaluru Airport','DailyObjects Store - Bengaluru Airport T2','Bengaluru','Terminal 2, Domestic Departure Hall, 3rd Floor, Outlet 3T73-06A, Kempegowda Airport 560300',13.1988757,77.7193906,'+91 99900 35476','Open 24 hours',5.0,24,'ChIJW4UTSdkdrjsRZPDJ6dh_G1k','Airport',/bengaluru airport|bangalore airport|kempegowda|\bblr\b/],
 ['Store Koramangala','DailyObjects Store - Nexus Koramangala','Bengaluru','GF-10 & 10-B, Nexus Koramangala Mall, Hosur Rd, Bengaluru 560095',12.9347181,77.6112997,'+91 99903 59852','10:00–22:00',4.9,121,'ChIJY6tmfjUVrjsRjaq4r74IV7I','Mall',/koramangala|nexus koramangala/],
 ['Store Pune Airport','DailyObjects Store - Pune Airport','Pune','R10-B, New Integrated Terminal Building, Domestic SHA, Lohgaon, Pune 411032',18.579375,73.9095274,'+91 99900 35531','Open 24 hours',5.0,18,'ChIJJ60Y6lnBwjsRRYpEGYHZPzQ','Airport',/pune airport/],
 ['Store Kopa Mall','DailyObjects Store - The Kopa Mall','Pune','Unit 1-30, First Floor, The Kopa Mall, Koregaon Park Annexe, Pune 411001',18.5383646,73.9077382,'+91 84478 81020','11:00–21:30',4.9,177,'ChIJRee6cI7BwjsRwIlwyv0Xt8M','Mall',/kopa|koregaon/],
 ['Store Lakeshore','DailyObjects Store - Lakeshore Mall','Hyderabad','Unit 12, Ground Floor, Lakeshore Mall, Y Junction, Kukatpally, Hyderabad 500072',17.4769801,78.4233401,'+91 99900 15549','10:00–21:30',4.9,674,'ChIJbUbOYtGRyzsRFv1Z_XjhVR8','Mall',/lakeshore|kukatpally/],
 ['Store RMZ Nexcity','DailyObjects Store - RMZ Nexcity','Hyderabad','Tower 20, RMZ Nexcity, Unit PL 20, Hitech City Main Rd, Madhapur, Hyderabad 500032',17.4305967,78.382947,'+91 99900 27952','10:00–22:00',4.5,84,'ChIJVYd9dv2TyzsRQpdoJ8vm4bs','Mall',/rmz|nexcity|madhapur/],
 ['Store VR Mall','DailyObjects Store - VR Mall, Anna Nagar','Chennai','Ground Floor, G-21, Jawaharlal Nehru Salai, Anna Nagar West, Chennai 600040',13.0807796,80.197717,'+91 99900 96384','10:30–22:00',5.0,445,'ChIJTx4K_ydlUjoRRmQdHYnOMDc','Mall',/vr mall|anna nagar/]
].map(a=>({ch:a[0],name:a[1],city:a[2],addr:a[3],lat:a[4],lng:a[5],phone:a[6],hours:a[7],rating:a[8],rc:a[9],pid:a[10],fmt:a[11],re:a[12]}));
/* Starting delivery days warehouse -> store, by city. PLACEHOLDERS assuming the warehouse is in Delhi NCR; edit each store on the data desk (Store delivery times). */
const DEF_LANE={Delhi:1,Gurugram:1,Mumbai:3,Pune:4,Bengaluru:4,Hyderabad:4,Chennai:5};
const storeCh=x=>({name:x.ch,type:'Retail store',fee:0,ret:3,disc:15,L:DEF_LANE[x.city]!=null?DEF_LANE[x.city]:3,node:1});
/* Placeholder cost terms by channel type. All of these are guesses until you enter real contract and logistics rates. */
function costDef(t){
  if(t==='Own site')return {closing:0,pay:2,ads:12,occ:0,fixed:0,shipN:60,shipE:120,expShare:20,cShipN:0,cShipE:99,upo:1.3,pack:25,pick:15,retCost:70,recover:85};
  if(t==='Quick commerce')return {closing:0,pay:0,ads:4,occ:0,fixed:0,shipN:1500,shipE:0,expShare:0,cShipN:0,cShipE:0,upo:40,pack:0,pick:200,retCost:0,recover:0};
  if(t==='Retail store')return {closing:0,pay:1.8,ads:0,occ:15,fixed:25,shipN:1200,shipE:0,expShare:0,cShipN:0,cShipE:0,upo:30,pack:0,pick:150,retCost:0,recover:95};
  return {closing:25,pay:0,ads:6,occ:0,fixed:0,shipN:70,shipE:130,expShare:10,cShipN:0,cShipE:0,upo:1.2,pack:25,pick:15,retCost:80,recover:80};
}
const withDef=c=>{const q=c.type==='Quick commerce';return Object.assign({demand:q?'bulk':'daily',bucket:q?7:1,see:q?0:1},costDef(c.type),c);};
const defChannels=()=>JSON.parse(JSON.stringify([...CH_DEF,{name:'Retail (unassigned)',type:'Retail store',fee:0,ret:3,disc:15,L:2,node:0},...STORES.map(storeCh)].map(withDef)));

/* ---------- state ---------- */
const KEY='sbp_v2';
let S={skus:[],channels:defChannels(),stock:[],events:[],override:{},demo:false,lv:2};
let V={};VARS.forEach(v=>V[v.k]=v.d);
let ORD=new Map(); // "sku\tchannel" -> Map(day -> qty)
let PROD=new Map(); // sku -> Map(day -> units produced)
let STK=new Map(); // "sku\tlocation" -> Map(day -> on hand at day end)
let M=null, saveFailed=false;
const UI={tab:'overview',segCh:'All',segCls:'All',q:'',view:'matrix',skuQ:'',ev:null};

function load(){
  try{const j=JSON.parse(localStorage.getItem(KEY)||'null');
    if(j&&j.S){S=j.S;if(!S.lv){S.channels.forEach(c=>{const st=STORES.find(x=>x.ch===c.name);if(st&&c.L===2&&DEF_LANE[st.city]!=null)c.L=DEF_LANE[st.city];});S.lv=2;}Object.assign(V,j.V||{});ORD=new Map((j.ord||[]).map(([k,a])=>[k,new Map(a)]));PROD=new Map((j.prod||[]).map(([k,a])=>[k,new Map(a)]));STK=new Map((j.stk||[]).map(([k,a])=>[k,new Map(a)]));S.channels=S.channels.map(c=>{if(c.closing===undefined){c.fixed=0;if(c.type==='Own site'&&c.fee===2.5)c.fee=0;}return withDef(c);});return true;}}catch(e){}
  return false;
}

/* ---------- compute ---------- */
function resolveChannel(raw){
  const t=String(raw||'').trim();if(!t)return null;const l=t.toLowerCase();
  let ch=S.channels.find(c=>c.name.toLowerCase()===l);if(ch)return ch.name;
  for(const st of STORES){if(st.re.test(l))return st.ch;}
  const al=[[/amazon|\bamz\b|\bfba\b/,'Amazon'],[/flipkart|\bfk\b|\bfbf\b/,'Flipkart'],[/myntra/,'Myntra'],[/blinkit|grofers/,'Blinkit'],[/zepto/,'Zepto'],[/instamart|swiggy/,'Instamart'],[/website|shopify|\bown\b|direct|\bd2c\b|\.com\b|storefront/,'Website']];
  for(const [re,n] of al){if(re.test(l)){ch=S.channels.find(c=>c.name===n);if(ch)return n;}}
  if(/retail|offline|\bstore\b|outlet|exclusive|experience/.test(l)){if(S.channels.find(c=>c.name==='Retail (unassigned)'))return 'Retail (unassigned)';}
  const name=t.slice(0,30);S.channels.push(withDef({name,type:'Other',fee:15,ret:8,disc:20,L:0,node:0}));return name;
}
function isHub(raw){const t=String(raw||'').trim(),l=t.toLowerCase();if(/^(hub|central|warehouse|wh|main|dc|mother)/i.test(t))return true;if(!/warehouse|\bwh\b|\bhub\b|godown/.test(l))return false;
  return !S.channels.some(c=>c.name.toLowerCase()===l)&&!STORES.some(x=>x.re.test(l))&&!/amazon|flipkart|myntra|blinkit|zepto|instamart|swiggy/.test(l);}
/* Stock-out days for one listing in the window. A day counts only if no units sold that day.
   Source 1: daily stock history at the location that ships it (Hub for warehouse channels, the channel itself for stores / dark stores).
   Source 2 (fallback): a run of zero-sales days at least oosStreak long, on a listing that had sold before. */
function oosSet(sku,loc,m,start,maxDay){
  const out=new Set(),h=STK.get(sku+'\t'+loc);
  if(h&&h.size){
    let last=null,ld=-1e9;h.forEach((v,dd)=>{if(dd<start&&dd>ld){ld=dd;last=v;}});
    for(let dd=start;dd<=maxDay;dd++){const v=h.get(dd);if(v!==undefined)last=v;if(last!==null&&last<=0&&!(m.get(dd)>0))out.add(dd);}
    return {set:out,src:'history'};
  }
  if(V.oosInfer){
    let tot=0;m.forEach((q,dd)=>{if(dd>=start&&dd<=maxDay)tot+=q;});
    const lam=tot/(maxDay-start+1),need=lam>0?Math.max(V.oosStreak,Math.ceil(3/lam)):Infinity; // slow sellers need a longer gap: P(gap by chance) under ~5%
    let seen=false;m.forEach((q,dd)=>{if(dd<start&&q>0)seen=true;});
    let run=[];const flush=()=>{if(run.length>=need)run.forEach(x=>out.add(x));run=[];};
    for(let dd=start;dd<=maxDay;dd++){if(m.get(dd)>0){flush();seen=true;}else if(seen)run.push(dd);}
    flush();
    if(out.size)return {set:out,src:'inferred'};
  }
  return {set:out,src:'none'};
}
function compute(){
  S.channels.forEach(c=>{if(c.type==='Quick commerce')c.L=V.dsL;});
  const W=Math.max(1,V.W),skuMap=new Map(S.skus.map(s=>[s.sku,s])),chMap=new Map(S.channels.map(c=>[c.name,c]));
  let maxDay=-1e9,minDay=1e9;
  ORD.forEach(m=>m.forEach((q,d)=>{if(d>maxDay)maxDay=d;if(d<minDay)minDay=d;}));
  const has=maxDay>-1e9,start=maxDay-W+1;
  const rows=[];
  ORD.forEach((m,key)=>{
    const [sku,chn]=key.split('\t'),s=skuMap.get(sku),ch=chMap.get(chn);if(!s||!ch)return;
    let sum=0,sq=0,last=-1e9;m.forEach((q,dd)=>{if(dd>last)last=dd;if(dd>=start&&dd<=maxDay){sum+=q;sq+=q*q;}});
    const B=Math.max(1,Math.round(ch.bucket||7)),nb=Math.floor(W/B),bulk=ch.demand==='bulk'&&nb>=1;
    let evN=0,exS=null,d,sigD,bm=0,bsd=0,o={set:new Set(),src:'bulk'},Wn=W,dRaw=NaN;
    if(bulk){const sums=new Array(nb).fill(0);m.forEach((q,dd)=>{const k=Math.floor((maxDay-dd)/B);if(dd<=maxDay&&k>=0&&k<nb)sums[k]+=q;});
      const tot=sums.reduce((a,x)=>a+x,0);bm=tot/nb;d=tot/(nb*B);
      bsd=nb>1?Math.sqrt(sums.reduce((a,x)=>a+(x-bm)*(x-bm),0)/(nb-1)):0;sigD=bsd/Math.sqrt(B);}
    else{o=oosSet(sku,ch.node?chn:'Hub',m,start,maxDay);const ex=exS=new Set(o.set);evDays(chn,start,maxDay).forEach(x=>{if(!o.set.has(x)){ex.add(x);evN++;}});Wn=W-ex.size;dRaw=sum/W;let s2=0,q2=0;m.forEach((q,dd)=>{if(dd>=start&&dd<=maxDay&&!ex.has(dd)){s2+=q;q2+=q*q;}});d=Wn>0?s2/Wn:0;sigD=Math.sqrt(Wn>1?Math.max(0,(q2-Wn*d*d)/(Wn-1)):0);}
    const ok=s.mrp>0&&isFinite(s.cogs)&&s.cogs>=0;
    const e=ok?econ(s,ch):null,price=ok?e.P:NaN,cm=ok?e.cm:NaN;
    rows.push({key:sku+'\t'+chn,sku,ch:chn,s,chO:ch,d,sig:sigD,bulk,B,nb,bm,bsd,last,oos:o.set.size,evN,ex:exS,oosSrc:o.src,Wn,dRaw,thin:!bulk&&Wn<Math.max(7,0.25*W),since:maxDay-last,units:d*30,ok,e,price,cm,cmPct:ok?e.cmPct:NaN,contrib:ok?d*30*cm:NaN});
  });
  // thresholds per channel
  const thr={};S.channels.forEach(c=>{thr[c.name]=percentile(rows.filter(r=>r.ch===c.name&&r.ok&&r.units>0).map(r=>r.units),V.classPct);});
  const tgt={A:V.tA,B:V.tB,C:V.tC},z={};['A','B','C'].forEach(k=>z[k]=invNorm(tgt[k]/100));
  rows.forEach(r=>{
    let a,sub='';
    if(!r.ok)a='?';else if(r.units<=0)a='0';else if(r.cm<=0)a='X';
    else{const hv=r.units>=thr[r.ch],hm=r.cmPct>=V.marginCut/100;
      if(hv&&hm)a='A';else if(hv){a='B';sub='thin';}else if(hm){a='B';sub='niche';}else a='C';}
    r.auto=a;r.sub=sub;r.cls=S.override[r.key]||a;
    r.target=tgt[r.cls]||null;r.z=z[r.cls]!=null?z[r.cls]:null;
    if(r.cls==='?'){r.target=tgt.A;r.z=z.A;}else if(r.cls==='X'){r.target=tgt.C;r.z=z.C;}
    const qc=r.chO.type==='Quick commerce',rt=r.chO.type==='Retail store';
    r.place=r.cls==='A'?(r.chO.node?(rt?'Store shelf + warehouse':'Dark store + warehouse'):'Ships from company warehouse'):
      r.cls==='B'?(qc?'Not stocked in dark store; consider delisting':rt?'Store shelf at B target + warehouse':(sub==='thin'||r.sub==='thin'?'Warehouse, ship on order; fix margin':'Warehouse only, ship on order')):
      r.cls==='C'?(qc?'Not stocked in dark store; delist':rt?'Store shelf at C target; review the range':'Warehouse only; review for deletion'):
      r.cls==='X'?'Negative margin: reprice or delete':r.cls==='0'?'No sales in window; review':'Add MRP and COGS (planned at A target until then)';
  });
  const byKey=new Map(rows.map(r=>[r.key,r]));
  // forward nodes: class A on channels that have a node
  const R=V.R,nodes=[];
  rows.filter(r=>r.chO.node&&r.z!=null&&(r.cls==='A'||(r.chO.type==='Retail store'&&r.units>0))).forEach(r=>{
    const L=r.chO.L,ss=r.z*r.sig*Math.sqrt(L),rop=r.d*L+ss,up=rop+r.d*R;
    nodes.push({key:r.key,sku:r.sku,ch:r.ch,s:r.s,z:r.z,target:r.target,d:r.d,sig:r.sig,L,ss,rop,up,r});
  });
  const nodeKeys=new Set(nodes.map(n=>n.key));
  // hub per SKU
  const hubMap=new Map(),bySku=new Map();
  rows.forEach(r=>{if(!bySku.has(r.sku))bySku.set(r.sku,[]);bySku.get(r.sku).push(r);});
  const rank={A:0,B:1,C:2,X:3,'0':4,'?':5};
  bySku.forEach((rs,sku)=>{
    const s=rs[0].s,dTot=rs.reduce((a,r)=>a+r.d,0),zs=rs.filter(r=>r.z!=null);
    const best=[...rs].sort((a,b)=>rank[a.cls]-rank[b.cls])[0].cls;
    let sumSig=0,sumVar=0,unpooled=0,zHub=0;
    const sq=Math.sqrt(V.hubL),sL=Math.max(0,V.hubLsd||0),rho=V.rhoAuto?measRho(rs,start,maxDay):V.rho,dZ=zs.reduce((a,r)=>a+r.d,0);
    zs.forEach(r=>{sumSig+=r.sig;sumVar+=r.sig*r.sig;unpooled+=r.z*Math.sqrt(r.sig*r.sig*V.hubL+r.d*r.d*sL*sL);if(r.z>zHub)zHub=r.z;});
    const sigPool=Math.sqrt((1-rho)*sumVar+rho*sumSig*sumSig);
    let aS=0,aV=0;rs.forEach(r=>{aS+=r.sig;aV+=r.sig*r.sig;});const sigAll=Math.sqrt((1-rho)*aV+rho*aS*aS);
    const pooled=zHub*Math.sqrt(sigPool*sigPool*V.hubL+dZ*dZ*sL*sL);
    const ss=V.postpone?pooled:unpooled;
    const rop=dTot*V.hubL+ss,up=rop+dTot*V.hubCycle;
    const direct=rs.filter(r=>!nodeKeys.has(r.key)).reduce((a,r)=>a+r.d,0);
    hubMap.set(sku,{sku,s,rs,best,rho,dTot,direct,sigPool,sigAll,zHub,unpooled,pooled,ss,rop,up,saveU:unpooled-ss,saveV:(unpooled-ss)*(isFinite(s.cogs)?s.cogs:0)});
  });
  // channel summary
  const chSum=S.channels.map(c=>{const o={name:c.name,A:0,B:0,C:0,X:0,'0':0,'?':0,contrib:0,units:0,n:0};
    rows.filter(r=>r.ch===c.name).forEach(r=>{o[r.cls]++;o.n++;o.units+=r.units;if(isFinite(r.contrib)&&r.contrib>0)o.contrib+=r.contrib;});return o;});
  const oosR=rows.filter(r=>r.oos>0),dayR=rows.filter(r=>!r.bulk);
  const oosInfo={n:oosR.length,hist:oosR.filter(r=>r.oosSrc==='history').length,inf:oosR.filter(r=>r.oosSrc==='inferred').length,days:oosR.reduce((a,r)=>a+r.oos,0),
    histCover:dayR.filter(r=>r.oosSrc==='history').length,daily:dayR.length,thin:dayR.filter(r=>r.thin).length,
    dRaw:dayR.reduce((a,r)=>a+(r.dRaw||0),0),dFix:dayR.reduce((a,r)=>a+r.d,0)};
  const rhoW=(()=>{let a=0,b=0;hubMap.forEach(h=>{if(h.dTot>0){a+=h.rho*h.dTot;b+=h.dTot;}});return b>0?a/b:V.rho;})();
  return {rows,byKey,nodes,nodeKeys,rhoW,hub:hubMap,bySku,thr,z,tgt,chSum,has,maxDay,minDay,start,W,oosInfo,
    missing:S.skus.filter(s=>!(s.mrp>0&&isFinite(s.cogs))).length,
    noOrders:S.skus.filter(s=>!bySku.has(s.sku)).length,
    totalContrib:rows.reduce((a,r)=>a+(isFinite(r.contrib)&&r.contrib>0?r.contrib:0),0)};
}

/* Per-unit economics for one SKU on one channel. extra = additional promo discount %. Costs are negative. */
function econ(s,ch,extra){
  if(!(s.mrp>0&&isFinite(s.cogs)&&s.cogs>=0))return {ok:false};
  const gst=(V.gst||0)/100,upo=Math.max(1,ch.upo||1),ret=(ch.ret||0)/100,kept=1-ret,sx=(ch.expShare||0)/100;
  const P=s.mrp*(1-(ch.disc||0)/100)*(1-(extra||0)/100),NR=P/(1+gst),L={};
  L.commission=-(ch.fee||0)/100*P*kept;
  L.closing=-(ch.closing||0)/upo;
  L.payment=-(ch.pay||0)/100*P*kept;
  L.ads=-(ch.ads||0)/100*P*kept;
  L.occupancy=-(ch.occ||0)/100*P*kept;
  L.shipNormal=-(ch.shipN||0)*(1-sx)/upo;
  L.shipExpress=-(ch.shipE||0)*sx/upo;
  L.shipIncome=((ch.cShipN||0)*(1-sx)+(ch.cShipE||0)*sx)/upo*kept;
  L.pack=-(ch.pack||0)/upo;
  L.pick=-(ch.pick||0)/upo;
  L.reverse=-ret*(ch.retCost||0);
  L.writeoff=-ret*(1-(ch.recover||0)/100)*s.cogs;
  L.other=-(ch.fixed||0);
  const revLost=-NR*ret,cogsSaved=s.cogs*ret,gm=NR-s.cogs;
  const cm=gm+revLost+cogsSaved+Object.values(L).reduce((a,x)=>a+x,0);
  return {ok:true,mrp:s.mrp,P,NR,gstAmt:P-NR,kept,gm,gmPct:gm/NR,revLost,cogsSaved,L,cm,cmPct:cm/NR};
}
function refresh(){M=compute();save();render();}

/* ---------- demo data ---------- */
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function loadDemo(){
  const r=mulberry(7),g=()=>{let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
  const cats=[
   ['Backpacks','BP',[3499,2999,3999,2499],0.22,{Website:1,Amazon:1,Flipkart:.7,Myntra:1}],
   ['Laptop sleeves','LS',[1999,1799,2299],0.20,{Website:1,Amazon:1,Flipkart:.8,Myntra:.6}],
   ['Wallets','WL',[1499,1199,999,1799],0.15,{Website:1,Amazon:1,Flipkart:.8,Myntra:1,Blinkit:.5,Zepto:.5,Instamart:.4}],
   ['Phone cases','PC',[799,899,999,699,1099,599],0.12,{Website:1,Amazon:1.4,Flipkart:1,Myntra:1.2,Blinkit:1,Zepto:1,Instamart:.8}],
   ['Chargers & power banks','CH',[1999,2999,1499],0.40,{Website:.8,Amazon:1,Flipkart:.8,Blinkit:.8,Zepto:.8,Instamart:.6}],
   ['Cables','CB',[699,999],0.30,{Website:.6,Amazon:1,Flipkart:.7,Blinkit:1,Zepto:1,Instamart:.8}],
   ['Desk mats','DM',[1499,1999],0.18,{Website:1,Amazon:1,Flipkart:.6,Myntra:.3}],
   ['Sling bags','SB',[2299,2599],0.21,{Website:1,Amazon:1,Flipkart:.7,Myntra:1}],
   ['Keyrings','KR',[399,499],0.10,{Website:.8,Amazon:.8,Flipkart:.5,Myntra:.8,Blinkit:.7,Zepto:.7,Instamart:.6}]];
  const names=['Alpha','Bravo','Cedar','Delta','Ember','Fjord'],share={Website:.12,Amazon:.35,Flipkart:.12,Myntra:.18,Blinkit:.09,Zepto:.08,Instamart:.06};
  const demoStores=['Store GK-1','Store Sky City','Store Lakeshore','Store VR Mall','Store Ecoworld'],rfit={Backpacks:.7,'Laptop sleeves':.7,Wallets:.9,'Phone cases':1.2,'Chargers & power banks':.7,Cables:.4,'Desk mats':.3,'Sling bags':.7,Keyrings:.7};
  demoStores.forEach(n=>share[n]=.045);
  S.skus=[];S.channels=defChannels();S.stock=[];S.events=[];S.override={};ORD=new Map();STK=new Map();S.demo=true;
  const end=Math.floor(Date.now()/864e5)-1,DAYS=120;
  cats.forEach(([cat,code,mrps,cp,fit])=>mrps.forEach((mrp,i)=>{
    demoStores.forEach(n=>fit[n]=rfit[cat]);
    const sku='DEMO-'+code+'-0'+(i+1);
    S.skus.push({sku,name:'[DEMO] '+cat.replace(/s$/,'')+' '+names[i],cat,mrp,cogs:Math.round(mrp*cp*(0.9+r()*0.2))});
    const pop=Math.exp(g()*0.9);
    const oosS=r()<0.25?end-55+Math.floor(r()*40):null,oosLen=6+Math.floor(r()*7),oosHist=r()<0.5;
    if(oosS!==null&&oosHist){const h=new Map();h.set(oosS-1,40);for(let d=oosS;d<oosS+oosLen;d++)h.set(d,0);h.set(oosS+oosLen,60);STK.set(sku+'\tHub',h);}
    Object.keys(fit).forEach(ch=>{
      const mu=pop*share[ch]*fit[ch]*14;let m=new Map();
      for(let d=end-DAYS+1;d<=end;d++){
        let mm=mu*(1+0.15*Math.sin((d%7)/7*6.28));
        if(d>=end-80&&d<=end-77&&['Amazon','Flipkart','Myntra'].includes(ch))mm*=2;
        let q=Math.max(0,Math.round(mm+g()*Math.sqrt(mm)*1.3));
        if(oosS!==null&&d>=oosS&&d<oosS+oosLen&&['Website','Amazon','Flipkart','Myntra'].includes(ch))q=0;
        if(q>0)m.set(d,q);
      }
      if(['Blinkit','Zepto','Instamart'].includes(ch)){const w=new Map();m.forEach((q,d)=>{const k=d-(d%7);w.set(k,(w.get(k)||0)+q);});m=w;}
      if(m.size)ORD.set(sku+'\t'+ch,m);
    });
  }));
  M=compute();
  M.hub.forEach(h=>{
    const on=Math.round(h.dTot*(6+r()*24));
    S.stock.push({sku:h.sku,node:'Hub',onhand:on,transit:r()<0.3?Math.round(h.dTot*7):0});
  });
  M.nodes.forEach(n=>{const pos=n.rop*(0.4+r()*1.5);S.stock.push({sku:n.sku,node:n.ch,onhand:Math.round(pos*0.8),transit:Math.round(pos*0.2)});});
  PROD=new Map();
  M.hub.forEach(h=>{const m=new Map();for(let d=end-DAYS+1;d<=end;d++){if(r()<0.2){const q=Math.round(h.dTot*(3+r()*4));if(q>0)m.set(d,q);}}if(m.size)PROD.set(h.sku,m);});
  const ev={id:1,name:'Marketplace sale (example)',ch:'Amazon',start:dayStr(end+10),end:dayStr(end+13),uplift:100,disc:15,scope:'all'};
  S.events=[ev];
  S.listings=[...ORD.keys()].map(k=>k.split("\t")).concat([["DEMO-CB-01","Myntra"],["DEMO-CB-02","Myntra"],["DEMO-DM-01","Blinkit"],["DEMO-DM-02","Zepto"]]);
}

/* ---------- file reading + import ---------- */
function parseCSV(text){
  text=text.replace(/^﻿/,'');const first=text.split(/\r?\n/,1)[0];
  const delim=[',',';','\t'].map(d=>[d,first.split(d).length-1]).sort((a,b)=>b[1]-a[1])[0][0];
  const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}
    else if(c==='"')q=true;else if(c===delim){row.push(cur);cur='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cur);cur='';if(row.some(x=>x!==''))rows.push(row);row=[];}
    else cur+=c;}
  row.push(cur);if(row.some(x=>x!==''))rows.push(row);return rows;
}
async function readRows(file){
  if(/\.xlsx?$/i.test(file.name)){
    if(!window.XLSX)throw new Error('The Excel reader did not load. Save the sheet as CSV and upload that.');
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const ws=wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''}).filter(r=>r.some(x=>x!==''));
  }
  return parseCSV(await file.text());
}
const norm=s=>String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,'');
function guess(headers,aliases){
  const H=headers.map(norm);
  for(const a of aliases){const i=H.indexOf(norm(a));if(i>=0)return i;}
  for(const a of aliases){const n=norm(a);const i=H.findIndex(h=>h&&(h.includes(n)));if(i>=0)return i;}
  return -1;
}
const KINDS={
 skus:{title:'Import SKU master',fields:[
   {k:'sku',l:'SKU code',req:1,al:['sku','item sku code','sku code','item code','seller sku','product code']},
   {k:'name',l:'Name',al:['name','product name','title','item name','description']},
   {k:'cat',l:'Category / product family',al:['category','product family','family','product category','type']},
   {k:'mrp',l:'MRP (₹)',al:['mrp','list price','price','max retail price']},
   {k:'cogs',l:'COGS per unit (₹)',al:['cogs','cost','unit cost','cost price','landed cost','manufacturing cost']}]},
 orders:{title:'Import orders / demand',fields:[
   {k:'date',l:'Order date',req:1,al:['order date','date','created at','order created','invoice date','dispatch date','sale order date','ordered on']},
   {k:'sku',l:'SKU code',req:1,al:['sku','item sku code','sku code','item code','seller sku','product sku']},
   {k:'channel',l:'Channel / marketplace',req:1,al:['channel','channel name','marketplace','source','platform','sales channel']},
   {k:'qty',l:'Quantity',req:1,al:['quantity','qty','units','item quantity','order quantity','shipped quantity']},
   {k:'status',l:'Status (optional, to skip cancelled / returned)',al:['status','order status','item status','sale order item status']}]},
 prod:{title:'Import production log',fields:[
   {k:'date',l:'Production date',req:1,al:['production date','date','mfg date','manufactured on','completed on','batch date','received date']},
   {k:'sku',l:'SKU code',req:1,al:['sku','item sku code','sku code','item code','product code']},
   {k:'qty',l:'Units produced',req:1,al:['produced','production qty','quantity','qty','units','good units','output']}]},
 stockhist:{title:'Import daily stock history',fields:[
   {k:'date',l:'Date',req:1,al:['date','snapshot date','stock date','as of','day']},
   {k:'sku',l:'SKU code',req:1,al:['sku','item sku code','sku code','item code','seller sku']},
   {k:'node',l:'Location (Hub or channel / store name)',req:1,al:['node','location','warehouse','facility','channel','store','fulfilment centre']},
   {k:'onhand',l:'On hand at end of day',req:1,al:['on hand','onhand','available','inventory','stock','quantity','qty','sellable']}]},
 listings:{title:'Import marketplace listings',fields:[
   {k:'sku',l:'SKU code',req:1,al:['sku','seller sku','sku code','item code','style id','fsn','asin']},
   {k:'channel',l:'Channel / marketplace',req:1,al:['channel','marketplace','platform','source']},
   {k:'status',l:'Status (optional, skips inactive)',al:['status','listing status','state']}]},
 stock:{title:'Import stock on hand',fields:[
   {k:'sku',l:'SKU code',req:1,al:['sku','item sku code','sku code','item code','seller sku']},
   {k:'node',l:'Location (Hub or channel name)',req:1,al:['node','location','warehouse','facility','channel','store','fulfilment centre']},
   {k:'onhand',l:'On hand',req:1,al:['on hand','onhand','available','inventory','stock','quantity','qty','sellable']},
   {k:'transit',l:'In transit (optional)',al:['in transit','transit','inbound','incoming','on order']}]}
};
function pickFile(kind){window._kind=kind;const f=$('#file');f.value='';f.click();}
$('#file').addEventListener('change',e=>{if(e.target.files[0])handleFile(e.target.files[0],window._kind);});
async function handleFile(file,kind){
  try{const rows=await readRows(file);if(rows.length<2)throw new Error('The file has no data rows.');openImport(kind,rows,file.name);}
  catch(err){toast(err.message||'Could not read that file.');}
}
function openImport(kind,rows,fname){
  const K=KINDS[kind],hd=rows[0].map(x=>String(x));
  const sel=K.fields.map(f=>{const g=guess(hd,f.al);return `<label for="m-${f.k}">${esc(f.l)}${f.req?' *':''}</label>
    <select id="m-${f.k}"><option value="-1">— none —</option>${hd.map((h,i)=>`<option value="${i}"${i===g?' selected':''}>${esc(h)}</option>`).join('')}</select>`;}).join('');
  const prev=`<div class="tw"><table class="t"><thead><tr>${hd.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1,6).map(r=>`<tr>${hd.map((_,i)=>`<td>${esc(r[i] instanceof Date?dayStr(parseDay(r[i])):r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const opt=kind==='stock'?`<label for="o-date">Stock counted on</label><input type="date" id="o-date" value="${dayStr(Math.floor(Date.now()/864e5))}">`:(kind==='orders'||kind==='prod'||kind==='stockhist')?`<label for="o-mode">Existing history</label><select id="o-mode"><option value="merge">Add: replace only the dates in this file</option><option value="replace">Replace all history with this file</option></select>`:
    kind==='skus'?`<label for="o-mode">Existing SKUs</label><select id="o-mode"><option value="merge">Update matches, add new</option><option value="replace">Replace all</option></select>`:'';
  $('#overlay').innerHTML=`<div class="modal"><div class="box" role="dialog" aria-label="${esc(K.title)}">
    <h2>${esc(K.title)}</h2><p class="mute small">${esc(fname)} · ${rows.length-1} data rows · Check the column match, then import. * required.</p>
    <div class="map">${sel}${opt}</div>${prev}
    <div class="row"><span class="spacer"></span><button class="btn" data-act="closeModal">Cancel</button><button class="btn pri" id="doImport">Import</button></div></div></div>`;
  $('#doImport').onclick=()=>{
    const map={};K.fields.forEach(f=>map[f.k]=+$('#m-'+f.k).value);
    const miss=K.fields.filter(f=>f.req&&map[f.k]<0);
    if(miss.length){toast('Match these columns first: '+miss.map(f=>f.l).join(', '));return;}
    const mode=$('#o-mode')?$('#o-mode').value:'';
    if(mode==='replace'&&['orders','prod','stockhist'].includes(kind)){const fr=fileRange(rows,map.date);if(fr&&fr[1]-fr[0]+1<V.W){toast(`This file covers ${fr[1]-fr[0]+1} days. Replacing would leave less than the ${V.W}-day window, so it was not imported. Choose “Add” instead.`);return;}}
    if(S.demo)resetState();UPFILE[kind]=fname;
    const msg=({skus:applySkus,orders:applyOrders,stock:applyStock,prod:applyProd,stockhist:applyStockHist,listings:applyListings})[kind](rows,map,mode);
    S.demo=false;$('#overlay').innerHTML='';refresh();toast(msg);
  };
}
function applySkus(rows,map,mode){
  if(mode==='replace')S.skus=[];
  const idx=new Map(S.skus.map(s=>[s.sku,s]));let add=0,upd=0;
  rows.slice(1).forEach(r=>{
    const sku=String(r[map.sku]==null?'':r[map.sku]).trim();if(!sku)return;
    const g=k=>map[k]>=0?r[map[k]]:undefined;
    let s=idx.get(sku);const isNew=!s;if(isNew){s={sku,name:'',cat:'Uncategorised',mrp:NaN,cogs:NaN};S.skus.push(s);idx.set(sku,s);add++;}else upd++;
    if(g('name')!==undefined&&g('name')!=='')s.name=String(g('name'));
    if(g('cat')!==undefined&&g('cat')!=='')s.cat=String(g('cat'));
    if(g('mrp')!==undefined&&isFinite(num(g('mrp'))))s.mrp=num(g('mrp'));
    if(g('cogs')!==undefined&&isFinite(num(g('cogs'))))s.cogs=num(g('cogs'));
  });
  return `${add} SKUs added, ${upd} updated.`;
}
function applyOrders(rows,map,mode){
  if(mode==='replace')ORD=new Map();else dropRange(ORD,fileRange(rows,map.date),new Set(rows.slice(1).map(r=>resolveChannel(String(r[map.channel]==null?'':r[map.channel]).trim()||'Unknown'))));
  const known=new Set(S.skus.map(s=>s.sku));let n=0,bad=0,skip=0,newSku=new Set();
  let re;try{re=new RegExp(V.exclude||'$^','i');}catch(e){re=/cancel|rto|return|fail/i;toast('The “ignore order status” pattern is not valid, so the default (cancel, RTO, return, fail) was used. Fix it under Planning rules.');}
  const chCache=new Map();
  rows.slice(1).forEach(r=>{
    const sku=String(r[map.sku]==null?'':r[map.sku]).trim(),day=parseDay(r[map.date]),q=num(r[map.qty]);
    if(!sku||day==null||!isFinite(q)||q<=0){bad++;return;}
    if(map.status>=0&&re.test(String(r[map.status]))){skip++;return;}
    const raw=String(r[map.channel]==null?'':r[map.channel]).trim();
    if(!chCache.has(raw))chCache.set(raw,resolveChannel(raw||'Unknown'));
    const ch=chCache.get(raw),key=sku+'\t'+ch;
    if(!known.has(sku)){known.add(sku);newSku.add(sku);S.skus.push({sku,name:'',cat:'Uncategorised',mrp:NaN,cogs:NaN});}
    if(!ORD.has(key))ORD.set(key,new Map());const m=ORD.get(key);m.set(day,(m.get(day)||0)+q);n++;
  });
  return `${n} order rows imported${skip?`, ${skip} skipped by status`:''}${bad?`, ${bad} unreadable`:''}${newSku.size?`. ${newSku.size} new SKUs added without MRP or COGS: fill them in on the data desk (SKUs & COGS)`:''}.`;
}
function applyProd(rows,map,mode){
  if(mode==='replace')PROD=new Map();else dropRange(PROD,fileRange(rows,map.date));
  const known=new Set(S.skus.map(s=>s.sku));let n=0,bad=0,add=0;
  rows.slice(1).forEach(r=>{
    const sku=String(r[map.sku]==null?'':r[map.sku]).trim(),day=parseDay(r[map.date]),q=num(r[map.qty]);
    if(!sku||day==null||!isFinite(q)||q<=0){bad++;return;}
    if(!known.has(sku)){known.add(sku);add++;S.skus.push({sku,name:'',cat:'Uncategorised',mrp:NaN,cogs:NaN});}
    if(!PROD.has(sku))PROD.set(sku,new Map());const m=PROD.get(sku);m.set(day,(m.get(day)||0)+q);n++;
  });
  return `${n} production rows imported${bad?`, ${bad} unreadable`:''}${add?`. ${add} new SKUs added without MRP or COGS`:''}.`;
}
function applyStockHist(rows,map,mode){
  if(mode==='replace')STK=new Map();else dropRange(STK,fileRange(rows,map.date),new Set(rows.slice(1).map(r=>{const x=String(r[map.node]==null?'':r[map.node]).trim();return isHub(x)?'Hub':resolveChannel(x);})));
  const known=new Set(S.skus.map(s=>s.sku));let n=0,bad=0,unk=0;
  rows.slice(1).forEach(r=>{
    const sku=String(r[map.sku]==null?'':r[map.sku]).trim(),raw=String(r[map.node]==null?'':r[map.node]).trim(),day=parseDay(r[map.date]),on=num(r[map.onhand]);
    if(!sku||!raw||day==null||!isFinite(on)){bad++;return;}
    if(!known.has(sku)){unk++;return;}
    const node=isHub(raw)?'Hub':resolveChannel(raw),key=sku+'\t'+node;
    if(!STK.has(key))STK.set(key,new Map());STK.get(key).set(day,on);n++;
  });
  return `${n} stock-history rows imported${bad?`, ${bad} unreadable`:''}${unk?`, ${unk} skipped for SKUs not in the master (load the SKU master first)`:''}.`;
}
function applyStock(rows,map){
  const dd=$('#o-date')?parseDay($('#o-date').value):null,add=[];let n=0,bad=0;
  rows.slice(1).forEach(r=>{
    const sku=String(r[map.sku]==null?'':r[map.sku]).trim(),raw=String(r[map.node]==null?'':r[map.node]).trim(),on=num(r[map.onhand]);
    if(!sku||!raw||!isFinite(on)){bad++;return;}
    const node=isHub(raw)?'Hub':resolveChannel(raw);
    const tr=map.transit>=0?num(r[map.transit]):0;
    add.push({sku,node,onhand:on,transit:isFinite(tr)?tr:0});n++;
  });
  // a file from one system (e.g. store POS) must not wipe stock reported by another (e.g. the warehouse)
  const locs=new Set(add.map(x=>x.node)),kept=[...new Set(S.stock.filter(x=>!locs.has(x.node)).map(x=>x.node))];
  S.stock=S.stock.filter(x=>!locs.has(x.node)).concat(add);
  if(locs.has('Hub')||S.stockAt==null)S.stockAt=dd!=null?dd:Math.floor(Date.now()/864e5);
  return `${n} stock rows imported for ${locs.size} locations${bad?`, ${bad} unreadable`:''}.${kept.length?` ${kept.length} other locations kept from earlier uploads.`:''}`;
}

/* ---------- export ---------- */
async function saveCSV(name,rows){
  const csv=rows.map(r=>r.map(v=>{const s=v==null?'':String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\n');
  try{
    if(typeof claude!=='undefined'){const d=await claude.use('downloads');if(d){await d.save({filename:name,data:csv});return;}}
  }catch(e){if(e&&e.code==='declined')return;}
  try{await navigator.clipboard.writeText(csv);toast('Download is not available here. CSV copied to clipboard.');}catch(e){toast('Download and copy are both blocked in this view.');}
}
const TPL={
 skus:[['sku','name','category','mrp','cogs'],['BP-001','Everyday Backpack','Backpacks',3499,770]],
 orders:[['order_date','sku','channel','quantity','status'],['2026-11-20','BP-001','Amazon',2,'Shipped']],
 prod:[['production_date','sku','units_produced'],['2026-11-20','BP-001',300]],
 stock:[['sku','location','on_hand','in_transit'],['BP-001','Hub',120,40],['BP-001','Amazon',18,6]],
 listings:[['sku','channel','status'],['BP-001','Amazon','Active'],['BP-001','Myntra','Active']],
 stockhist:[['date','sku','location','on_hand'],['2026-11-20','BP-001','Hub',120],['2026-11-21','BP-001','Hub',0]]
};

/* ---------- ui helpers ---------- */
const TABS=[['overview','Overview'],['variables','Variables'],['skus','SKUs & COGS'],['margin','GM & CM'],['data','Orders & stock'],['prodinv','Production & stock'],['stores','Retail stores'],['segment','1 Segment'],['hub','2 Hub pool'],['nodes','3 Forward nodes'],['tower','4 Control tower'],['avail','Availability now'],['surges','5 Surges'],['capacity','6 Capacity']];
const chip=c=>`<span class="chip k-${c==='?'?'q':c}">${esc(c)}</span>`;
function varInput(v,compact){
  const val=V[v.k];let inp;
  if(v.type==='bool')inp=`<select data-v="${v.k}" id="v-${v.k}"><option value="1"${val?' selected':''}>Yes</option><option value="0"${val?'':' selected'}>No</option></select>`;
  else if(v.type==='text')inp=`<input data-v="${v.k}" id="v-${v.k}" value="${esc(val)}" class="w-l">`;
  else inp=`<input type="number" data-v="${v.k}" id="v-${v.k}" value="${val}" ${v.min!=null?`min="${v.min}"`:''} ${v.max!=null?`max="${v.max}"`:''} step="${v.step||'any'}">`;
  return `<div class="var"><label for="v-${v.k}">${esc(v.l)}</label>${inp}<span class="u">${esc(v.u)}</span></div>`;
}
const table=(cols,rows,empty)=>rows.length?`<div class="tw"><table class="t"><thead><tr>${cols.map(c=>`<th class="${c[2]||''}">${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:`<p class="mute">${empty||'Nothing to show.'}</p>`;
const td=(v,c)=>`<td class="${c||''}">${v}</td>`;
const noData=()=>`<div class="note">No orders loaded yet. The data desk uploads them (Uploads &amp; checks).</div>`;

/* ---------- renderers ---------- */
function chanTable(){
  const isSt=n=>STORES.some(x=>x.ch===n),rows=M.chSum.filter(c=>c.n||isSt(c.name)).map(c=>`<tr>${td(esc(c.name))}${['A','B','C','X','0','?'].map(k=>td(c[k]||'','n')).join('')}${td(fi(c.units),'n')}${td(inrC(c.contrib),'n')}</tr>`);
  return table([['Channel'],['A','n'],['B','n'],['C','n'],['X','n'],['0','n'],['?','n'],['Units / month','n'],['Contribution / month','n']],rows,'No listings yet.')+
   `<p class="mute small">A high volume + high margin · B high volume with thin margin, or low volume with high margin · C low on both · X negative margin · 0 no sales in window · ? missing MRP or COGS.</p>`;
}
function rVariables(){
  const groups=[...new Set(VARS.map(v=>v.g))];
  const derived=`<div class="tw"><table class="t"><thead><tr><th>Derived value</th><th class="n">Now</th><th>How</th></tr></thead><tbody>
   ${['A','B','C'].map(k=>`<tr>${td('z-score, class '+k)}${td(f2(M.z[k]),'n')}${td('Inverse normal of target availability '+M.tgt[k]+'%')}</tr>`).join('')}
   ${S.channels.map(c=>`<tr>${td('High-volume cut-off, '+esc(c.name))}${td(isFinite(M.thr[c.name])?f1(M.thr[c.name]):'–','n')}${td('units / month at the '+V.classPct+'th percentile of selling listings')}</tr>`).join('')}
   <tr>${td('Demand window')}${td(M.has?dayStr(M.start)+' → '+dayStr(M.maxDay):'–','n')}${td('Last '+V.W+' days up to the latest order date')}</tr></tbody></table></div>`;
  const chRows=S.channels.map((c,i)=>`<tr>${td(`<input data-ch="${i}:name" value="${esc(c.name)}" aria-label="Channel name" class="w-l">`)}${td(esc(c.type))}
   ${['fee','ret','fixed','disc','L'].map(f=>td(f==='L'&&derivedL(c)?`<span class="mute" title="Edit on the data desk (Store delivery times) (stores) or under Variables (dark-store average)">${c.L} <span class="small">${c.type==='Retail store'?'edit on Retail stores':'average'}</span></span>`:`<input type="number" data-ch="${i}:${f}" value="${c[f]}" step="any" min="0" aria-label="${f}">`,'n')).join('')}
   ${td(`<select data-ch="${i}:node" aria-label="Forward node"><option value="1"${c.node?' selected':''}>Yes</option><option value="0"${c.node?'':' selected'}>No, ships from company warehouse</option></select>`)}
   ${td(`<select data-ch="${i}:demand" aria-label="Demand data"><option value="daily"${c.demand==='daily'?' selected':''}>Daily sales</option><option value="bulk"${c.demand==='bulk'?' selected':''}>Bulk purchase orders</option></select>`)}
   ${td(`<input type="number" data-ch="${i}:bucket" value="${c.bucket}" min="1" step="1" aria-label="Order cycle days">`,'n')}
   ${td(`<select data-ch="${i}:see" aria-label="Stock visible"><option value="1"${c.see?' selected':''}>Yes</option><option value="0"${c.see?'':' selected'}>No</option></select>`)}</tr>`);
  return `<div class="note">Anything marked “Placeholder” or “Your choice” is my starting guess, not data. Replace it with real numbers before acting.</div>
  ${groups.map(g=>`<div class="card"><h3>${esc(g)}</h3>${table([['Variable'],['Value'],['Unit'],['Source'],['What it does']],VARS.filter(v=>v.g===g).map(v=>`<tr>${td(esc(v.l))}${td(varInput(v).replace('class="var"','class="var" style="border:0;padding:0;background:none"').replace(/<label.*?<\/label>/,'').replace(/<span class="u">.*?<\/span>/,''))}${td(esc(v.u))}${td(esc(v.src||''))}${td(esc(v.h||''),'wrapc')}</tr>`),'')}</div>`).join('')}
  <div class="card"><h3>Channel terms</h3><p>Commission, delivery (normal and express), packing, returns, store costs and supply settings for every channel are on the GM &amp; CM tab, where you can see their effect on each SKU.</p><div class="row"><button class="btn pri" data-go="margin">Open GM &amp; CM</button></div></div>
  <div class="card"><h3>Derived values</h3>${derived}</div>
  <div class="card"><h3>Formulas used</h3><div class="formula">d      = units in last W days ÷ W
σ      = standard deviation of daily units over the same W days (zero days included)
         bulk channels: σ = stdev of order-cycle totals ÷ √(cycle days); d = total ÷ covered days
z      = inverse normal of target availability   (99% → 2.33, 97% → 1.88, 90% → 1.28)
Node:  safety stock = z × σ × √L          reorder point = d × L + safety stock
       order-up-to  = reorder point + d × R
Hub:   σ pooled = √[(1 − ρ) Σσᵢ² + ρ (Σσᵢ)²]     safety stock = z(max) × σ pooled × √L(hub)
       without pooling = Σ zᵢ σᵢ √L(hub)
Refill a node when: on hand + in transit ≤ reorder point, or days of cover &lt; trigger
CM per unit = net revenue (price ÷ (1+GST)) − COGS − commission − closing fee − payment − ads − store rent
              − delivery (normal/express blended ÷ units per order) + delivery fee charged − packing − pick/pack
              − returns (lost revenue net of COGS, reverse logistics, unsold returns) − other per unit
Capacity: forecast = average of last N 30-day buckets × (1 + growth)</div>
  <p class="mute small">The reorder-point and safety-stock formulas are standard inventory maths, not the book’s. They assume demand is roughly normal and lead time is fixed.</p></div>`;
}
function rSkus(){
  const q=UI.skuQ.toLowerCase(),list=S.skus.map((s,i)=>[s,i]).filter(([s])=>!q||(s.sku+' '+s.name+' '+s.cat).toLowerCase().includes(q));
  const web=S.channels.find(c=>c.name==='Website')||S.channels[0];
  const rows=list.slice(0,300).map(([s,i])=>{
    const ok=s.mrp>0&&isFinite(s.cogs),we=ok&&web?econ(s,web):null;
    return `<tr>${td(`<input data-sku="${i}:sku" value="${esc(s.sku)}" aria-label="SKU" style="width:130px">`)}${td(`<input data-sku="${i}:name" value="${esc(s.name)}" aria-label="Name" class="w-l">`)}
    ${td(`<input data-sku="${i}:cat" value="${esc(s.cat)}" aria-label="Category" style="width:150px">`)}
    ${td(`<input type="number" data-sku="${i}:mrp" value="${isFinite(s.mrp)?s.mrp:''}" aria-label="MRP">`,'n')}${td(`<input type="number" data-sku="${i}:cogs" value="${isFinite(s.cogs)?s.cogs:''}" aria-label="COGS">`,'n')}
    ${td(we?inr(we.gm):'<span class="bad">missing</span>','n')}${td(we?pc(we.gmPct):'–','n')}
    ${td(we?pc(we.cmPct):'–','n')}
    ${td(M.bySku.get(s.sku)?M.bySku.get(s.sku).map(r=>`<span title="${esc(r.ch)}">${chip(r.cls)}</span>`).join(' '):'<span class="mute">no orders</span>')}
    ${td(`<button class="btn danger" data-act="delSku" data-i="${i}" aria-label="Delete ${esc(s.sku)}">Delete</button>`)}</tr>`;});
  return `<div class="card"><div class="row"><h2>SKUs with COGS and margin</h2><span class="spacer"></span>
    <input id="skuQ" placeholder="Search SKU, name, category" value="${esc(UI.skuQ)}" aria-label="Search SKUs">
    <button class="btn" data-act="addSku">Add SKU</button><button class="btn" data-act="tpl" data-k="skus">Template</button>
    <button class="btn" data-act="expSkus">Export CSV</button><button class="btn pri" data-act="pick" data-k="skus">Upload CSV / Excel</button></div>
    <p class="mute small">${list.length} SKUs${list.length>300?' (first 300 shown, use search)':''}. GM = website net revenue (price after discount, minus GST) − COGS. “Website CM %” also takes off payment, ads, delivery, packing and returns. Every line is on the GM & CM tab. Chips on the right show each channel’s class, in channel order of first sale.</p>
    ${table([['SKU'],['Name'],['Category'],['MRP ₹','n'],['COGS ₹','n'],['GM ₹ (web, ex-GST)','n'],['GM %','n'],['Website CM %','n'],['Classes'],['']],rows,'No SKUs yet. Upload a file or add one.')}</div>`;
}
function dqCalc(){
  const out=[],add=(sev,name,text)=>out.push({sev,name,text}),ex=(a,n=5)=>a.slice(0,n).join(', ')+(a.length>n?` and ${a.length-n} more`:'');
  const today=Math.floor(Date.now()/864e5),hasO=M&&M.has;
  if(!S.skus.length&&!ORD.size)return out;
  // SKU master
  const selling=[...new Set(M.rows.filter(r=>!r.ok).map(r=>r.sku))];
  if(selling.length)add('bad','Selling SKUs without MRP or COGS',`${selling.length} SKUs have orders but cannot be classed (class “?”): ${ex(selling)}.`);
  else add('ok','SKU master','Every SKU with orders has an MRP and COGS.');
  const gst=1+V.gst/100;
  const oddC=S.skus.filter(s=>isFinite(s.cogs)&&s.mrp>0&&(s.cogs<=0||s.cogs>=s.mrp/gst)).map(s=>s.sku);
  if(oddC.length)add('warn','COGS looks wrong',`${oddC.length} SKUs have zero COGS, or COGS at or above their MRP excluding GST: ${ex(oddC)}.`);
  const dup=new Map();S.skus.forEach(s=>{const k=s.sku.toLowerCase().replace(/[^a-z0-9]/g,'');dup.set(k,(dup.get(k)||[]).concat(s.sku));});
  const dups=[...dup.values()].filter(a=>a.length>1);
  if(dups.length)add('warn','Near-duplicate SKU codes',`${dups.length} pairs differ only by case, spaces or punctuation: ${ex(dups.map(a=>a.join(' / ')),3)}. Orders may be split between them.`);
  // channels
  const oth=S.channels.filter(c=>c.type==='Other').map(c=>c.name);
  if(oth.length)add('warn','Channels created from unrecognised names',`${oth.length} channels got placeholder terms (15% commission): ${ex(oth)}. Rename, merge or set their terms under Variables.`);
  const un=M.rows.filter(r=>r.ch==='Retail (unassigned)').length;
  if(un)add('warn','Retail sales not tied to a store',`${un} listings sit in “Retail (unassigned)”, shipped from the warehouse. Put the store name in the channel column to place stock at the right shelf.`);
  if(hasO){
    // orders freshness and gaps
    const age=today-M.maxDay;
    add(age>3?'warn':'ok','Order feed freshness',`Latest order is ${dayStr(M.maxDay)}, ${age} day${age===1?'':'s'} ago.${age>3?' Demand and availability are as of that date, not today.':''}`);
    const have=new Set();M.rows.filter(r=>!r.bulk).forEach(r=>{const m=ORD.get(r.key);if(m)m.forEach((q,dd)=>{if(q>0)have.add(dd);});});
    if(have.size){const gaps=[];for(let dd=M.start;dd<=M.maxDay;dd++)if(dd>=M.minDay&&!have.has(dd))gaps.push(dayStr(dd));
      if(gaps.length)add('warn','Days with no orders at all',`${gaps.length} days in the window have no orders on any daily channel (${ex(gaps,4)}). Usually a missing export, not a quiet day; they pull daily sales down.`);
      else add('ok','Order dates','Every day in the window has orders.');}
    if(M.minDay>M.start)add('warn','History shorter than the window',`Orders start ${dayStr(M.minDay)}, but the window is ${M.W} days (from ${dayStr(M.start)}). Days before the first order count as zero demand.`);
    // spikes
    const sp=M.rows.filter(r=>!r.bulk&&r.d>0).filter(r=>{const m=ORD.get(r.key);let mx=0;if(m)m.forEach((q,dd)=>{if(dd>=M.start&&q>mx)mx=q;});return mx>20&&mx>10*r.d;});
    if(sp.length)add('warn','Single-day spikes',`${sp.length} listings have a day above 10× their average (${ex(sp.map(r=>r.sku+' on '+r.ch),3)}). Check for a duplicated upload or a bulk B2B order inside a retail feed.`);
    // stock-out coverage
    const o=M.oosInfo;
    if(o.daily){add(o.histCover===o.daily?'ok':'warn','Stock-out detection',`${o.histCover} of ${o.daily} daily listings use real stock history; ${o.inf} had stock-outs inferred; ${o.daily-o.histCover-o.inf} have no stock-out information, so a stock-out there would look like low demand.${o.thin?` ${o.thin} listings are thin after exclusions.`:''}`);}
  }
  // stock snapshot
  if(S.stock.length){
    const neg=S.stock.filter(x=>x.onhand<0);
    if(neg.length)add('bad','Negative stock',`${neg.length} stock rows have negative on-hand: ${ex(neg.map(x=>x.sku+' @ '+x.node),3)}.`);
    if(S.stockAt!=null){const a=today-S.stockAt;add(a>7?'warn':'ok','Stock snapshot freshness',`Loaded ${a} day${a===1?'':'s'} ago.${a>7?' Availability and refills use stock that may have moved.':''}`);}
    const ks=new Set(S.skus.map(s=>s.sku)),orph=S.stock.filter(x=>!ks.has(x.sku));
    if(orph.length)add('warn','Stock for unknown SKUs',`${orph.length} stock rows carry SKUs that are not in the master: ${ex(orph.map(x=>x.sku),4)}.`);
    if(hasO){
      const st=new Set(S.stock.map(x=>x.sku+'\t'+x.node)),miss=M.nodes.filter(n=>!st.has(n.sku+'\t'+n.ch));
      if(miss.length)add('warn','Shelf items with no stock row',`${miss.length} of ${M.nodes.length} class A store / dark-store items have no stock row, so refills assume zero stock there.`);
      const hubOut=[...M.hub.values()].filter(h=>h.dTot>0&&(S.stock.find(x=>x.sku===h.sku&&x.node==='Hub')||{onhand:1}).onhand<=0).map(h=>h.sku);
      if(hubOut.length)add('warn','Selling SKUs at zero hub stock',`${hubOut.length} SKUs are selling but show no stock at the hub: ${ex(hubOut)}. Their recent sales will be understated once the stock-out shows in the order feed.`);
    }
  }else if(hasO)add('warn','No stock file','Availability, control tower and refill lists need a stock snapshot.');
  return out;
}
function dqCard(){
  const q=dqCalc();if(!q.length)return '';
  const bad=q.filter(x=>x.sev==='bad').length,w=q.filter(x=>x.sev==='warn').length;
  const sym={ok:'✓ OK',warn:'! Check',bad:'✗ Fix'},cls={ok:'ok',warn:'amber',bad:'bad'};
  return `<div class="card"><h2>Data quality</h2><p>${bad?`<b class="bad">${bad} to fix</b>, `:''}${w?`<b class="amber">${w} to check</b>`:(bad?'':'<b class="ok">No problems found</b>')}. Nothing is dropped silently: these checks run on whatever is loaded and update with every upload.</p>
   <div class="tw"><table class="t"><thead><tr><th>Status</th><th>Check</th><th>Detail</th></tr></thead><tbody>${q.map(x=>`<tr><td class="${cls[x.sev]}">${sym[x.sev]}</td><td>${esc(x.name)}</td><td class="wrapc">${esc(x.text)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function filterRows(){
  const q=UI.q.toLowerCase();
  return M.rows.filter(r=>(UI.segCh==='All'||r.ch===UI.segCh)&&(UI.segCls==='All'||r.cls===UI.segCls)&&(!q||(r.sku+' '+r.s.name+' '+r.s.cat).toLowerCase().includes(q)));
}
function rSegment(){
  if(!M.has)return head(1,'Segment by SKU and channel','Ch. 2 pp. 46–48, Ch. 8 p. 167','')+noData();
  const fr=filterRows().sort((a,b)=>(isFinite(b.contrib)?b.contrib:-1e12)-(isFinite(a.contrib)?a.contrib:-1e12));
  let body;
  if(UI.view==='matrix'){
    const q=UI.q.toLowerCase(),skus=S.skus.filter(s=>M.bySku.has(s.sku)&&(!q||(s.sku+' '+s.name+' '+s.cat).toLowerCase().includes(q)));
    const chs=S.channels.filter(c=>M.rows.some(r=>r.ch===c.name));
    const rows=skus.slice(0,300).map(s=>`<tr>${td(esc(s.sku))}${td(esc(s.name),'wrapc')}${td(isFinite(s.mrp)&&isFinite(s.cogs)?inr(s.mrp-s.cogs):'–','n')}${chs.map(c=>{const r=M.byKey.get(s.sku+'\t'+c.name);return td(r?`<span title="${esc(r.place)} · ${f1(r.units)} units/mo · CM ${pc(r.cmPct)}">${chip(r.cls)} ${r.target?r.target+'%':''}</span>`:'<span class="mute">·</span>');}).join('')}</tr>`);
    body=table([['SKU'],['Name'],['GM ₹','n'],...chs.map(c=>[c.name])],rows)+`<p class="mute small">Each cell: class and target availability. Hover for placement, volume and margin. ${skus.length>300?'First 300 SKUs shown.':''}</p>`;
  }else{
    const rows=fr.slice(0,400).map(r=>`<tr>${td(esc(r.sku))}${td(esc(r.s.name),'wrapc')}${td(esc(r.ch))}${td(inr(r.price),'n')}${td(inr(r.cm),'n')}${td(pc(r.cmPct),'n')}${td(f1(r.units),'n')}${td(r.bulk?'<span class="mute">bulk</span>':(r.oos?`<span title="${r.oos} of ${M.W} days excluded; source: ${r.oosSrc}">${r.oos} <span class="mute small">${r.oosSrc}</span></span>`:'0')+(r.thin?' <span class="amber" title="Fewer than a quarter of the window days remain after exclusions">thin</span>':''),'n')}${td(inrC(r.contrib),'n')}
      ${td(chip(r.cls)+(S.override[r.key]?' <span class="mute small">set by you</span>':''))}${td(r.target?r.target+'%':'–','n')}${td(r.z!=null?f2(r.z):'–','n')}${td(esc(r.place))}
      ${td(`<select data-ov="${esc(r.key)}" aria-label="Override class"><option value="">auto (${r.auto})</option>${['A','B','C','X'].map(k=>`<option${S.override[r.key]===k?' selected':''}>${k}</option>`).join('')}</select>`)}</tr>`);
    body=table([['SKU'],['Name'],['Channel'],['Price','n'],['CM / unit','n'],['CM %','n'],['Units / mo','n'],['Stock-out days','n'],['Contribution / mo','n'],['Class'],['Target','n'],['z','n'],['Placement'],['Override']],rows,'No listings match.')+`<p class="mute small">${fr.length} listings${fr.length>400?', first 400 shown':''}, sorted by contribution.</p>`;
  }
  const delC=M.rows.filter(r=>['C','X','0'].includes(r.cls)).length,dist=M.rows.length;
  return head(1,'Segment by SKU and channel','Ch. 2 pp. 46–48, Ch. 8 p. 167, Ch. 5 p. 114',`Classes use contribution margin and volume per unit, not revenue. High-volume, high-margin listings (A) get the high availability target and stock near the customer. Low-volume, high-margin listings sit centrally and ship on order. Low-low listings are reviewed for deletion. Cutting the long tail first matters because more listings spread the same demand thinner.`)+strip('segment')+
  `${oosCard()}<div class="card"><h3>Class mix by channel</h3>${chanTable()}<p class="small"><b>${delC}</b> of ${dist} listings (${Math.round(delC/dist*100)}%) are C, X or 0: candidates for deletion review before any stock is placed.</p></div>
  <div class="card"><div class="row"><h3>SKUs by marketplace</h3><span class="spacer"></span>
   <div class="seg"><button data-view="matrix" aria-pressed="${UI.view==='matrix'}">Matrix</button><button data-view="list" aria-pressed="${UI.view==='list'}">List</button></div>
   <select data-f="segCh" aria-label="Channel filter"><option>All</option>${S.channels.map(c=>`<option${UI.segCh===c.name?' selected':''}>${esc(c.name)}</option>`).join('')}</select>
   <select data-f="segCls" aria-label="Class filter"><option>All</option>${['A','B','C','X','0','?'].map(k=>`<option${UI.segCls===k?' selected':''}>${k}</option>`).join('')}</select>
   <input id="q" placeholder="Search" value="${esc(UI.q)}" aria-label="Search listings"><button class="btn" data-act="expSeg">Export CSV</button></div>${body}</div>`;
}
function oosCard(){
  const o=M.oosInfo;if(!o||!o.daily)return '';
  const up=o.dRaw>0?(o.dFix-o.dRaw)/o.dRaw:0;
  return `<div class="card"><h3>Stock-out correction</h3><p><b>${o.n}</b> of ${o.daily} daily-order listings had stock-out days removed (${o.hist} from your stock history, ${o.inf} inferred from zero-sales streaks), ${fi(o.days)} listing-days in all. Total daily sales rose by <b>${(up*100).toFixed(1)}%</b> against a plain average, and variability is measured on in-stock days only.
   ${o.histCover<o.daily?`Only ${o.histCover} listings have a real stock history; for the rest a quiet spell and a stock-out look the same, so upload daily stock history on the data desk.`:''} ${o.thin?`<span class="amber">${o.thin} listings have under a quarter of the window left in stock: treat their numbers as thin.</span>`:''} Quick-commerce purchase orders are not corrected (they are bulk).</p></div>`;
}
function rHub(){
  if(!M.has)return head(2,'Pool the bulk of stock in one central hub','Ch. 4 p. 85, Ch. 5 pp. 113–114','')+noData();
  const hs=[...M.hub.values()].filter(h=>h.dTot>0).sort((a,b)=>b.saveV-a.saveV);
  const tot=hs.reduce((o,h)=>{o.un+=h.unpooled*(isFinite(h.s.cogs)?h.s.cogs:0);o.p+=h.ss*(isFinite(h.s.cogs)?h.s.cogs:0);return o;},{un:0,p:0});
  const rows=hs.slice(0,300).map(h=>`<tr>${td(esc(h.sku))}${td(esc(h.s.name),'wrapc')}${td(chip(h.best))}${td(f1(h.dTot),'n')}${td(f2(h.sigPool),'n')}${td(h.zHub?f2(h.zHub):'–','n')}${td(f1(h.unpooled),'n')}${td(f1(h.ss),'n')}${td(f1(h.saveU),'n')}${td(inr(h.saveV),'n')}${td(fi(h.rop),'n')}${td(fi(h.up),'n')}</tr>`);
  return head(2,'Pool the bulk of stock in one central hub','Ch. 4 p. 85, Ch. 5 pp. 113–114','The decoupling point: hold strategic stock as generic as possible and commit it to a channel as late as possible. Channel-specific steps (labelling, packaging, bundling) happen after the hub, so every channel’s safety stock sits in one pool. The website and the marketplaces (Amazon, Flipkart, Myntra) ship straight from the company warehouse, so they draw on this pool and hold no stock of their own. Whether this works depends on your products; the variable below switches the saving off if it does not.')+strip('hub')+
  `<div class="kpis"><div class="kpi"><b>${inrC(tot.un)}</b><span>hub safety stock if each channel held its own (at COGS)</span></div><div class="kpi"><b>${inrC(tot.p)}</b><span>hub safety stock with the chosen setting</span></div><div class="kpi"><b>${inrC(tot.un-tot.p)}</b><span>inventory released</span></div></div>
  <div class="card"><h3>Hub stock by SKU</h3>${table([['SKU'],['Name'],['Best class'],['d, units/day','n'],['σ pooled','n'],['z','n'],['Safety stock, unpooled','n'],['Safety stock, hub','n'],['Saving, units','n'],['Saving, ₹ COGS','n'],['Hub reorder point','n'],['Hub order-up-to','n']],rows)}
  <p class="mute small">Reorder point = d × hub lead time + safety stock. Order-up-to adds the production cycle. Cycle stock from batch sizes is not modelled. Pooling saving assumes the correlation variable above; a promotion across all channels at once raises it.</p></div>`;
}
function bulkCard(){
  const rs=M.rows.filter(r=>r.bulk&&r.units>0&&r.z!=null).sort((a,b)=>b.units-a.units).slice(0,300);
  const rows=rs.map(r=>`<tr>${td(esc(r.sku))}${td(esc(r.s.name),'wrapc')}${td(esc(r.ch))}${td(chip(r.cls))}${td(r.B,'n')}${td(r.nb,'n')}${td(fi(r.bm),'n')}${td(fi(r.bsd),'n')}${td(fi(r.bm+r.z*r.bsd),'n')}${td(isFinite(r.last)?dayStr(r.last):'–','n')}${td(isFinite(r.since)?r.since:'–','n')}</tr>`);
  return `<div class="card"><h3>Bulk-order channels: what to keep ready for the next purchase order</h3>
   <p>Quick commerce buys in bulk, so the brand sees purchase orders, not consumer sales per day. These figures come from order-cycle totals. “Keep ready” is the average cycle order plus z × the spread of cycle orders, so one purchase order at the target service level can be filled from the warehouse. Their dark-store stock is theirs; this is what the warehouse must be able to ship.</p>
   ${table([['SKU'],['Name'],['Channel'],['Class'],['Cycle, days','n'],['Cycles in window','n'],['Avg per cycle','n'],['Spread (σ) per cycle','n'],['Keep ready','n'],['Last order','n'],['Days since','n']],rows,'No quick-commerce listings with orders. Mark a channel “Bulk purchase orders” under Variables.')}
   <p class="mute small">Few cycles in the window make the spread unreliable; raise the trailing window if “Cycles in window” is below about 4.</p></div>`;
}




const CHT=[
 ['Pricing and fees','Discount is the average selling discount from MRP; for quick commerce it is the margin you give the platform. Commission, payment and ads are % of selling price.',[['conf','Terms confirmed by finance'],['disc','Avg discount / trade margin %'],['fee','Commission %'],['closing','Fixed closing fee ₹/order'],['pay','Payment or card fee %'],['ads','Ads and marketing %'],['occ','Store rent or revenue share %'],['fixed','Other cost ₹/unit (staff, utilities)']]],
 ['Delivery: normal and express','Per-order costs are spread over units per order. Express share is the % of orders sent express. Fees charged to the customer come back as income.',[['shipN','Our cost, normal ₹/order'],['shipE','Our cost, express ₹/order'],['expShare','Express share of orders %'],['cShipN','Fee charged to customer, normal ₹'],['cShipE','Fee charged to customer, express ₹'],['upo','Units per order']]],
 ['Handling and returns','Quick commerce and stores are shipped in bulk, so “units per order” there is units per consignment.',[['pack','Packaging ₹/order'],['pick','Pick, pack and handling ₹/order'],['ret','Returns or wastage %'],['retCost','Reverse logistics ₹/returned unit'],['recover','Returned units resold %']]],
 ['Supply and data','Where stock is held and what demand data we receive.',[['node','Holds stock outside the warehouse?'],['L','Refill lead time, days'],['demand','Demand data we get'],['bucket','Order cycle, days'],['see','Can we see their stock?']]]
];
function derivedL(c){return c.type==='Quick commerce'||(c.type==='Retail store'&&STORES.some(x=>x.ch===c.name));}
function chField(i,f,c){
  if(f==='L'&&derivedL(c))return `<span class="mute">${c.L} <span class="small">${c.type==='Retail store'?'edit on Retail stores':'average, edit under Variables'}</span></span>`;
  if(f==='conf')return `<select data-ch="${i}:conf" aria-label="Terms confirmed"><option value="0"${c.conf?'':' selected'}>Placeholder</option><option value="1"${c.conf?' selected':''}>Confirmed</option></select>`;
  if(f==='node')return `<select data-ch="${i}:node" aria-label="Holds stock"><option value="1"${c.node?' selected':''}>Yes</option><option value="0"${c.node?'':' selected'}>No, ships from warehouse</option></select>`;
  if(f==='see')return `<select data-ch="${i}:see" aria-label="Stock visible"><option value="1"${c.see?' selected':''}>Yes</option><option value="0"${c.see?'':' selected'}>No</option></select>`;
  if(f==='demand')return `<select data-ch="${i}:demand" aria-label="Demand data"><option value="daily"${c.demand==='daily'?' selected':''}>Daily sales</option><option value="bulk"${c.demand==='bulk'?' selected':''}>Bulk purchase orders</option></select>`;
  return `<input type="number" data-ch="${i}:${f}" value="${c[f]==null?0:c[f]}" step="any" min="0" aria-label="${f}">`;
}
const LINES=[['MRP',e=>e.mrp,'b'],['Discount or trade margin',e=>-(e.mrp-e.P)],['Selling price, incl. GST',e=>e.P,'b'],['GST',e=>-e.gstAmt],['Net revenue, ex-GST',e=>e.NR,'b'],['COGS',(e,s)=>-s.cogs],
 ['Gross margin ₹',e=>e.gm,'b'],['Gross margin %',e=>e.gmPct,'p'],['Revenue lost to returns',e=>e.revLost],['COGS not incurred on returns',e=>e.cogsSaved],
 ['Commission',e=>e.L.commission],['Fixed closing fee',e=>e.L.closing],['Payment or card fee',e=>e.L.payment],['Ads and marketing',e=>e.L.ads],['Store rent or revenue share',e=>e.L.occupancy],
 ['Delivery, normal',e=>e.L.shipNormal],['Delivery, express',e=>e.L.shipExpress],['Delivery fee charged to customer',e=>e.L.shipIncome],['Packaging',e=>e.L.pack],['Pick, pack and handling',e=>e.L.pick],
 ['Reverse logistics',e=>e.L.reverse],['Unsold returns written off',e=>e.L.writeoff],['Other per unit',e=>e.L.other],
 ['Contribution margin ₹',e=>e.cm,'b'],['Contribution margin %',e=>e.cmPct,'p']];
function rMargin(){
  const rs=(k,l,note,fields)=>`<div class="card"><h3>${esc(l)}</h3><p class="mute small">${esc(note)}</p><div class="tw"><table class="t"><thead><tr><th class="stick">Channel</th>${fields.map(f=>`<th class="${['node','see','demand','conf'].includes(f[0])?'':'n'}">${esc(f[1])}</th>`).join('')}</tr></thead><tbody>${S.channels.map((c,i)=>`<tr><td class="stick">${k===0?`<input data-ch="${i}:name" value="${esc(c.name)}" aria-label="Channel name" style="width:170px">`:esc(c.name)} <span class="mute small">${esc(c.type)}</span></td>${fields.map(f=>td(chField(i,f[0],c),['node','see','demand','conf'].includes(f[0])?'':'n')).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  const sk=S.skus.find(x=>x.sku===UI.mSku)||S.skus.find(x=>x.mrp>0&&isFinite(x.cogs))||S.skus[0];
  const used=new Set(M.rows.map(r=>r.ch)),chs=S.channels.filter(c=>used.size?used.has(c.name):['Website','Amazon','Flipkart','Myntra','Blinkit','Zepto','Instamart'].includes(c.name));
  let bridge='<p class="mute">Add a SKU with MRP and COGS to see the build-up.</p>';
  if(sk){
    const es=chs.map(c=>econ(sk,c));
    bridge=`<div class="tw"><table class="t"><thead><tr><th class="stick">Per unit shipped, ₹</th>${chs.map(c=>`<th class="n">${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${LINES.map(([l,f,t])=>`<tr><td class="stick">${t?'<b>'+l+'</b>':l}</td>${es.map(e=>e.ok?td((()=>{const v=f(e,sk);return t==='p'?pc(v):(isFinite(v)?(v<0?'<span class="bad">':'<span>')+(v<0?'-':'')+Math.abs(v).toFixed(Math.abs(v)>=100?0:1)+'</span>':'–');})(),'n'):td('–','n')).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const tot=S.channels.map(c=>{const r=M.rows.filter(x=>x.ch===c.name&&x.ok);const u=r.reduce((a,x)=>a+x.units,0);if(!u)return null;
    const nr=r.reduce((a,x)=>a+x.units*x.e.NR,0),gm=r.reduce((a,x)=>a+x.units*x.e.gm,0),cm=r.reduce((a,x)=>a+x.units*x.cm,0);return {c,u,gmp:gm/nr,cmp:cm/nr,cm,cmu:cm/u};}).filter(Boolean);
  const tr=tot.map(o=>`<tr>${td(esc(o.c.name))}${td(esc(o.c.type))}${td(fi(o.u),'n')}${td(pc(o.gmp),'n')}${td(pc(o.cmp),'n')}${td(inr(o.cmu),'n')}${td(inrC(o.cm),'n')}</tr>`);
  return `<div class="note">Every rate here is a placeholder until you enter your real contract, courier and rent terms. Change a cell and every class, margin and surge check updates.</div>
  <div class="card"><div class="row"><h2>Gross and contribution margin, line by line</h2><span class="spacer"></span><label for="mSku" class="mute small">SKU</label>
   <select id="mSku" data-f="mSku" style="max-width:340px">${S.skus.map(x=>`<option value="${esc(x.sku)}"${sk&&x.sku===sk.sku?' selected':''}>${esc(x.sku)} ${esc(x.name)}</option>`).join('')}</select></div>
   <p class="mute small">Per unit shipped. GM = net revenue − COGS, before returns and channel costs. CM = GM after returns, commission, delivery, packing, ads and store costs. Percentages are of net revenue (price with GST removed).</p>${bridge}</div>
  <div class="card"><h3>By channel, weighted by units sold</h3>${table([['Channel'],['Type'],['Units / month','n'],['GM %','n'],['CM %','n'],['CM per unit','n'],['Contribution / month','n']],tr,'No orders loaded.')}</div>
  ${CHT.map((g,k)=>rs(k,g[0],g[1],g[2])).join('')}
  <div class="row"><button class="btn" data-act="addChannel">Add channel</button></div>`;
}

function prodCalc(){
  let pMax=-1e9;PROD.forEach(m=>m.forEach((q,d)=>{if(d>pMax)pMax=d;}));
  const hasP=PROD.size>0,end=Math.max(M.has?M.maxDay:-1e9,hasP?pMax:-1e9),N=Math.max(1,V.W),start=end-N+1;
  const prod=new Array(N).fill(0),dem=new Array(N).fill(0),pS=new Map(),dS=new Map();
  if(end>-1e9){
    ORD.forEach((m,key)=>{const sku=key.split('\t')[0];m.forEach((q,d)=>{if(d>=start&&d<=end){dem[d-start]+=q;dS.set(sku,(dS.get(sku)||0)+q);}});});
    PROD.forEach((m,sku)=>m.forEach((q,d)=>{if(d>=start&&d<=end){prod[d-start]+=q;pS.set(sku,(pS.get(sku)||0)+q);}}));
  }
  const chType=new Map(S.channels.map(c=>[c.name,c.type])),loc=new Map(),sk=new Map(S.skus.map(s=>[s.sku,s]));
  const stS=new Map();
  S.stock.forEach(x=>{
    const s=sk.get(x.sku),cg=s&&isFinite(s.cogs)?s.cogs:0,o=loc.get(x.node)||{node:x.node,on:0,tr:0,val:0,owner:x.node==='Hub'||chType.get(x.node)==='Retail store'?'Company':'Platform'};
    o.on+=x.onhand;o.tr+=x.transit;o.val+=(x.onhand+x.transit)*cg;loc.set(x.node,o);
    const a=stS.get(x.sku)||{hubOn:0,hubTr:0,oth:0};
    if(x.node==='Hub'){a.hubOn+=x.onhand;a.hubTr+=x.transit;}else a.oth+=x.onhand;stS.set(x.sku,a);
  });
  const skus=new Set([...pS.keys(),...dS.keys(),...stS.keys()]),rows=[];
  skus.forEach(sku=>{
    const s=sk.get(sku);if(!s)return;const p=(pS.get(sku)||0)/N,d=(dS.get(sku)||0)/N,a=stS.get(sku)||{hubOn:0,hubTr:0,oth:0},net=p-d;
    const hubPos=a.hubOn+a.hubTr,doc=d>0?a.hubOn/d:Infinity;
    rows.push({sku,s,p,d,net,hubOn:a.hubOn,hubTr:a.hubTr,oth:a.oth,total:hubPos+a.oth,doc,
      out:net<0&&d>0?a.hubOn/(-net):Infinity,hasP:pS.has(sku),status:!pS.has(sku)?'No production data':net<-0.05*Math.max(d,1e-9)?'Falling':net>0.05*Math.max(d,1e-9)?'Building':'Balanced'});
  });
  rows.sort((a,b)=>a.doc-b.doc);
  return {end,N,start,prod,dem,rows,loc:[...loc.values()],hasP,hasStock:S.stock.length>0,
    pTot:prod.reduce((a,x)=>a+x,0),dTot:dem.reduce((a,x)=>a+x,0),p7:prod.slice(-7).reduce((a,x)=>a+x,0)/Math.min(7,N)};
}
function prodChart(P){
  const W=760,H=230,l=46,r=10,t=14,b=30,n=P.N,mx=Math.max(1,...P.prod,...P.dem),bw=(W-l-r)/n,y=v=>t+(H-t-b)*(1-v/mx);
  const bars=P.prod.map((v,i)=>v>0?`<rect x="${(l+i*bw+0.5).toFixed(1)}" y="${y(v).toFixed(1)}" width="${Math.max(1,bw-1).toFixed(1)}" height="${(H-b-y(v)).toFixed(1)}" fill="var(--accent)" fill-opacity=".8"><title>${dayStr(P.start+i)}: ${fi(v)} produced</title></rect>`:'').join('');
  const line=P.dem.map((v,i)=>`${(l+i*bw+bw/2).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const grid=[0,.5,1].map(f=>`<line x1="${l}" x2="${W-r}" y1="${y(mx*f).toFixed(1)}" y2="${y(mx*f).toFixed(1)}" stroke="var(--line)"/><text x="${l-6}" y="${(y(mx*f)+4).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--mute)">${fi(mx*f)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Units produced and units sold per day" style="width:100%;height:auto">${grid}${bars}<polyline points="${line}" fill="none" stroke="var(--b)" stroke-width="2"/>
   <text x="${l}" y="${H-10}" font-size="10" fill="var(--mute)">${dayStr(P.start)}</text><text x="${W-r}" y="${H-10}" font-size="10" text-anchor="end" fill="var(--mute)">${dayStr(P.end)}</text>
   <rect x="${l+120}" y="${H-20}" width="10" height="10" fill="var(--accent)"/><text x="${l+136}" y="${H-11}" font-size="11" fill="var(--ink)">Produced per day</text>
   <line x1="${l+270}" x2="${l+290}" y1="${H-15}" y2="${H-15}" stroke="var(--b)" stroke-width="2"/><text x="${l+296}" y="${H-11}" font-size="11" fill="var(--ink)">Sold per day, all channels</text></svg>`;
}
function rProdInv(){
  const head8=`<div class="card"><h2>Production per day and stock we hold</h2><p>Production comes from your production log; stock comes from the stock file. Together they show how much we have, whether we are making more than we sell, and when the hub would run out if nothing changes. Quick-commerce stock is held by the platform, so it is counted apart from stock the company owns.</p></div>`+strip('prodinv');
  if(!M.has&&!PROD.size&&!S.stock.length)return head8+`<div class="note">Upload a production log and a stock file on the Orders &amp; stock tab.</div>`;
  const P=prodCalc(),own=P.loc.filter(x=>x.owner==='Company'),plat=P.loc.filter(x=>x.owner==='Platform');
  const sum=a=>a.reduce((o,x)=>({on:o.on+x.on,tr:o.tr+x.tr,val:o.val+x.val}),{on:0,tr:0,val:0}),O=sum(own),Pl=sum(plat);
  const pd=P.pTot/P.N,dd=P.dTot/P.N;
  const lr=P.loc.sort((a,b)=>b.val-a.val).map(x=>`<tr>${td(esc(x.node))}${td(x.owner)}${td(fi(x.on),'n')}${td(fi(x.tr),'n')}${td(inr(x.val),'n')}</tr>`);
  const sr=P.rows.slice(0,300).map(o=>`<tr>${td(esc(o.sku))}${td(esc(o.s.name),'wrapc')}${td(o.hasP?f1(o.p):'–','n')}${td(f1(o.d),'n')}${td(o.hasP?(o.net>=0?'+':'')+f1(o.net):'–','n')}${td(fi(o.hubOn),'n')}${td(fi(o.hubTr),'n')}${td(fi(o.oth),'n')}${td(fi(o.total),'n')}${td(isFinite(o.doc)?f1(o.doc):'–','n')}${td(isFinite(o.out)&&o.net<0?dayStr(Math.floor(P.end+o.out)):'–','n')}${td(`<span class="${o.status==='Falling'?'bad':o.status==='Building'?'ok':'mute'}">${o.status}</span>`)}</tr>`);
  return head8+`<div class="kpis">
   <div class="kpi"><b>${fi(O.on+O.tr)}</b><span>units the company holds (${fi(O.on)} on hand, ${fi(O.tr)} in transit)</span></div>
   <div class="kpi"><b>${inrC(O.val)}</b><span>company stock at COGS</span></div>
   <div class="kpi"><b>${plat.length?fi(Pl.on):'–'}</b><span>units on platform shelves (not ours)</span></div>
   <div class="kpi"><b>${P.hasP?f1(pd):'–'}</b><span>units produced per day (last ${P.N} days)</span></div>
   <div class="kpi"><b>${P.hasP?f1(P.p7):'–'}</b><span>produced per day, last 7 days</span></div>
   <div class="kpi"><b>${f1(dd)}</b><span>units sold per day, all channels</span></div>
   <div class="kpi"><b>${P.hasP?(pd-dd>=0?'+':'')+f1(pd-dd):'–'}</b><span>net per day (produced − sold)</span></div></div>
  <div class="card"><h3>Per day, last ${P.N} days</h3>${P.hasP||M.has?prodChart(P):''}<p class="mute small">Bars are units produced; the line is units sold across channels. Quick-commerce sales appear on the day of the purchase order, not the day the consumer buys.</p></div>
  <div class="card"><div class="row"><h3>By SKU, tightest cover first</h3><span class="spacer"></span><button class="btn" data-act="expProd">Export CSV</button></div>${table([['SKU'],['Name'],['Made / day','n'],['Sold / day','n'],['Net / day','n'],['Hub on hand','n'],['Hub in transit','n'],['Stores on hand','n'],['Total units','n'],['Hub days of cover','n'],['Hub runs out around','n'],['Trend']],sr,'Nothing to show yet.')}
   <p class="mute small">Days of cover = hub on hand ÷ sold per day. “Runs out around” = hub on hand ÷ (sold − made per day), shown only where sales exceed production. In-transit units are not counted until they arrive.</p></div>
  <div class="card"><h3>By location</h3>${table([['Location'],['Owner'],['On hand','n'],['In transit','n'],['Value at COGS','n']],lr,'No stock file loaded.')}</div>`;
}

function erf(x){const sg=x<0?-1:1;x=Math.abs(x);const t=1/(1+0.3275911*x);const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return sg*y;}
const phi=z=>0.5*(1+erf(z/Math.SQRT2));
function availCalc(){
  const out={has:S.stock.length>0,hub:[],nodes:[],hidden:0};if(!out.has||!M)return out;
  const st=new Map();S.stock.forEach(x=>st.set(x.sku+'\t'+x.node,x));
  const zOf=(pos,mean,sd)=>sd>0?(pos-mean)/sd:(pos>=mean?8:-8);
  const hubA=new Map();
  M.hub.forEach(h=>{
    if(h.dTot<=0)return;
    const s=st.get(h.sku+'\tHub'),pos=s?s.onhand+s.transit:0,mean=h.dTot*V.hubL,sd=Math.sqrt(h.sigAll*h.sigAll*V.hubL+h.dTot*h.dTot*Math.pow(V.hubLsd||0,2));
    const a=phi(zOf(pos,mean,sd)),tg=Math.max(0,...h.rs.map(r=>r.target||0)),need=h.zHub>0?mean+h.zHub*sd:0;
    const gapU=Math.max(0,Math.ceil(need-pos)),direct=[...new Set(h.rs.filter(r=>!M.nodeKeys.has(r.key)&&r.d>0).map(r=>r.ch))];
    const o={h,sku:h.sku,s:h.s,has:!!s,pos,doc:pos/h.dTot,a,tg,ok:tg>0?a*100>=tg:true,gapU,gapV:gapU*(isFinite(h.s.cogs)?h.s.cogs:0),direct};
    hubA.set(h.sku,a);out.hub.push(o);
  });
  M.nodes.forEach(n=>{
    const s=st.get(n.sku+'\t'+n.ch);if(!s&&n.r.chO.see===0){out.hidden++;return;}
    const pos=s?s.onhand+s.transit:0,aN=phi(zOf(pos,n.d*n.L,n.sig*Math.sqrt(n.L))),aH=hubA.has(n.sku)?hubA.get(n.sku):0,e=aN*aH;
    const gapU=Math.max(0,Math.ceil(n.rop-pos));
    out.nodes.push({n,sku:n.sku,s:n.s,ch:n.ch,has:!!s,pos,doc:n.d>0?pos/n.d:Infinity,aN,aH,e,tg:n.target,ok:e*100>=n.target,gapU,gapV:gapU*(isFinite(n.s.cogs)?n.s.cogs:0),lim:aH<aN?'Hub':'Node'});
  });
  out.hubOk=out.hub.filter(o=>o.ok).length;out.nodeOk=out.nodes.filter(o=>o.ok).length;
  out.gapV=out.hub.reduce((a,o)=>a+o.gapV,0)+out.nodes.reduce((a,o)=>a+o.gapV,0);
  out.lost=out.hub.reduce((a,o)=>a+o.h.direct*30*(1-o.a),0)+out.nodes.reduce((a,o)=>a+o.n.d*30*(1-o.e),0);
  return out;
}
function availSummary(){const A=availCalc();return A.has?`${A.hubOk} of ${A.hub.length} warehouse SKUs and ${A.nodeOk} of ${A.nodes.length} store/dark-store positions at target`:'Needs stock file';}
function rAvail(){
  const head7=`<div class="card"><div class="row"><span class="chip k-A">Check</span><h2>Availability we can support right now</h2></div>
   <p>The target (99 / 97 / 90%) is what you want. This tab turns the stock you hold today back into the availability it supports, and the units it would take to reach the target. It is the reorder-point formula run backwards: instead of choosing z to get a reorder point, it takes today’s stock position and solves for z.</p>
   <div class="formula">Company warehouse (serves website, Amazon, Flipkart, Myntra and refills every store):
  z now = (hub position − d(all channels) × L(hub)) ÷ (σ(all channels pooled) × √L(hub))
  availability now = Φ(z now)          Φ = normal cumulative distribution
  units to target  = d × L + z(target) × σ × √L − hub position

Dark store or retail store (stock held locally):
  z now = (node position − d × L(node)) ÷ (σ × √L(node))
  availability now = Φ(z now) × warehouse availability   (both must hold)
  units to target  = node reorder point − node position

position = on hand + in transit</div></div>`+strip('avail');
  if(!M.has)return head7+noData();
  const A=availCalc();
  if(!A.has)return head7+`<div class="note">Upload a stock file (SKU, location, on hand, in transit) to see current availability.</div><div class="row"><button class="btn pri" data-act="pick" data-k="stock">Upload stock</button></div>`;
  const cl=(a,t)=>`<span class="${a*100>=t?'ok':'bad'}">${(a*100).toFixed(1)}%</span>`;
  const hr=A.hub.filter(o=>o.tg>0).sort((a,b)=>(b.tg-b.a*100)-(a.tg-a.a*100)).slice(0,300).map(o=>`<tr>${td(esc(o.sku))}${td(esc(o.s.name),'wrapc')}${td(chip(o.h.best))}${td(fi(o.pos),'n')}${td(o.has?f1(o.doc):'<span class="amber">no row</span>','n')}${td(o.tg+'%','n')}${td(cl(o.a,o.tg),'n')}${td(fi(o.gapU),'n')}${td(inr(o.gapV),'n')}${td(esc(o.direct.join(', ')),'wrapc')}</tr>`);
  return head7+`<div class="kpis"><div class="kpi"><b>${A.hubOk}/${A.hub.length}</b><span>warehouse SKUs at target</span></div><div class="kpi"><b>${A.nodeOk}/${A.nodes.length}</b><span>store and dark-store positions at target</span></div><div class="kpi"><b>${inrC(A.gapV)}</b><span>stock (at COGS) to buy or move to reach every target</span></div><div class="kpi"><b>${fi(A.lost)}</b><span>units/month at risk from stock-outs (rough)</span></div></div>
  <div class="card"><div class="row"><h3>Company warehouse, by SKU</h3><span class="spacer"></span><button class="btn" data-act="expAvail">Export CSV</button></div>${table([['SKU'],['Name'],['Best class'],['Position','n'],['Days of cover','n'],['Target','n'],['Availability now','n'],['Units to target','n'],['Cost to target','n'],['Serves directly']],hr,'No SKUs with a target.')}</div>
  ${A.hidden?`<div class="note">${A.hidden} quick-commerce positions are left out because their stock is not visible to us.</div>`:''}
  <div class="note">Read this as “the share of lead-time cycles with no stock-out”, not as fill rate. It assumes demand is roughly normal, lead time is fixed, and node and warehouse shortfalls are independent (so the end-to-end figure is a product, which is conservative). Lead times and σ come from your variables and order history.</div>`;
}
function storeCalc(){
  const st=new Map(S.stock.map(x=>[x.sku+'\t'+x.node,x])),sk=new Map(S.skus.map(x=>[x.sku,x]));
  return STORES.map(s=>{
    const ci=S.channels.findIndex(c=>c.name===s.ch),c=S.channels[ci]||{L:0};
    const rs=M.rows.filter(r=>r.ch===s.ch),dSum=rs.reduce((a,r)=>a+r.d,0);
    const nodes=M.nodes.filter(n=>n.ch===s.ch).map(n=>{const x=st.get(n.sku+'\t'+n.ch),on=x?x.onhand:0,tr=x?x.transit:0,pos=on+tr;
      return {sku:n.sku,s:n.s,cls:n.r.cls,d:n.d,sig:n.sig,L:n.L,ss:n.ss,rop:n.rop,up:n.up,on,tr,pos,has:!!x,doc:n.d>0?pos/n.d:Infinity,below:pos<=n.rop,need:Math.max(0,Math.ceil(n.up-pos))};});
    const inNodes=new Set(nodes.map(n=>n.sku)),extra=S.stock.filter(x=>x.node===s.ch&&!inNodes.has(x.sku)).map(x=>{
      const r=M.byKey.get(x.sku+'\t'+s.ch),pos=x.onhand+x.transit;return {sku:x.sku,s:sk.get(x.sku)||{name:'',cogs:NaN},cls:r?r.cls:'–',d:r?r.d:0,sig:r?r.sig:0,L:c.L,ss:NaN,rop:NaN,up:NaN,on:x.onhand,tr:x.transit,pos,has:true,doc:r&&r.d>0?pos/r.d:Infinity,below:false,need:0};});
    const stk=S.stock.filter(x=>x.node===s.ch),on=stk.reduce((a,x)=>a+x.onhand,0),tr=stk.reduce((a,x)=>a+x.transit,0);
    const val=stk.reduce((a,x)=>{const p=sk.get(x.sku);return a+(x.onhand+x.transit)*(p&&isFinite(p.cogs)?p.cogs:0);},0);
    return {s,ci,c,rs,dSum,units:rs.reduce((a,r)=>a+r.units,0),winUnits:dSum*M.W,nodes,extra,on,tr,val,pos:on+tr,doc:dSum>0?(on+tr)/dSum:Infinity,
      ropSum:nodes.reduce((a,n)=>a+n.rop,0),below:nodes.filter(n=>n.below).length,need:nodes.reduce((a,n)=>a+n.need,0),hasStock:stk.length>0};
  });
}
function rStores(){
  const D=storeCalc();
  const sel=UI.storeSel||'All';
  const sum=D.map(o=>{const L=o.c.L,idx=o.ci;
    return `<tr>${td(esc(o.s.name),'wrapc')}${td(esc(o.s.city))}
     ${td(L,'n')}
     ${td(o.rs.length?fi(o.winUnits):'<span class="mute">no orders</span>','n')}${td(o.rs.length?fi(o.units):'–','n')}${td(o.rs.length||'–','n')}${td(o.nodes.length||'–','n')}
     ${td(o.hasStock?fi(o.on):'<span class="mute">no stock</span>','n')}${td(o.hasStock?fi(o.tr):'–','n')}${td(o.hasStock?inr(o.val):'–','n')}
     ${td(isFinite(o.doc)&&o.hasStock?f1(o.doc):'–','n')}${td(o.nodes.length?fi(o.ropSum):'–','n')}
     ${td(o.nodes.length&&o.hasStock?(o.below?`<span class="bad">${o.below}</span>`:'<span class="ok">0</span>'):'–','n')}${td(o.nodes.length&&o.hasStock?fi(o.need):'–','n')}</tr>`;});
  const tot=D.reduce((a,o)=>({on:a.on+o.on,tr:a.tr+o.tr,u:a.u+o.units,val:a.val+o.val,rop:a.rop+o.ropSum,need:a.need+o.need}),{on:0,tr:0,u:0,val:0,rop:0,need:0});
  const picks=D.filter(o=>sel==='All'||o.s.ch===sel);
  const dr=[];picks.forEach(o=>[...o.nodes,...o.extra].forEach(n=>dr.push([o,n])));
  dr.sort((a,b)=>(a[0].s.city+a[0].s.ch).localeCompare(b[0].s.city+b[0].s.ch)||(b[1].d-a[1].d));
  const detail=dr.slice(0,500).map(([o,n])=>`<tr>${sel==='All'?td(esc(o.s.ch)):''}${td(esc(n.sku))}${td(esc(n.s.name),'wrapc')}${td(chip(n.cls))}${td(f2(n.d),'n')}${td(f2(n.sig),'n')}${td(n.L,'n')}${td(isFinite(n.ss)?f1(n.ss):'–','n')}${td(isFinite(n.rop)?fi(n.rop):'–','n')}${td(isFinite(n.up)?fi(n.up):'–','n')}${td(fi(n.on),'n')}${td(fi(n.tr),'n')}${td(fi(n.pos),'n')}${td(isFinite(n.doc)?f1(n.doc):'–','n')}
    ${td(!isFinite(n.rop)?'<span class="mute">not a shelf item</span>':!n.has?'<span class="amber">no stock row</span>':n.below?'<span class="bad">Refill</span>':'<span class="ok">OK</span>')}${td(isFinite(n.rop)?fi(n.need):'–','n')}</tr>`);
  const list=STORES.map(s=>`<tr>${td(esc(s.name),'wrapc')}${td(esc(s.city))}${td(esc(s.fmt))}${td(esc(s.addr),'wrapc')}${td(esc(s.hours))}${td(esc(s.phone))}${td(s.rating.toFixed(1)+' ('+fi(s.rc)+')','n')}${td((S.channels.find(c=>c.name===s.ch)||{disc:NaN}).disc+'%','n')}${td(`<a href="https://www.google.com/maps/place/?q=place_id:${esc(s.pid)}" target="_blank" rel="noopener">Open in Maps</a>`)}</tr>`);
  return `<div class="card"><h2>Retail stores</h2><p>${STORES.length} DailyObjects stores in ${new Set(STORES.map(x=>x.city)).size} cities, taken from a Google Maps search on 23 Nov 2026. Each store is its own stock location: the company warehouse refills every item it sells, at the target for that item's class. Marketplaces and the website hold no stock of their own. Orders for a store come in the normal orders upload with the store name in the channel column; stock comes in the stock file with the store name as location.</p>
</div>
  ${strip('stores')}
  <div class="card"><div class="row"><h3>Every store: orders, inventory, lead time and reorder point</h3><span class="spacer"></span><button class="btn" data-act="expStores">Export CSV</button></div>
   <p class="mute small">Lead time is the days from the warehouse to that store, door to door. It is edited on the data desk (Store delivery times). The starting values are placeholders by city (Delhi and Gurugram 1, Mumbai 3, Bengaluru, Pune and Hyderabad 4, Chennai 5) that assume the warehouse is in Delhi NCR, so replace them with your transporter’s real times, airports especially. Dark stores use one average (see the variable above). “Reorder point” adds up the reorder points of every item the store sells: ROP = d × lead time + z × σ × √lead time. Refill is due when on hand plus in transit is at or below it.</p>
   ${table([['Store'],['City'],['Lead time, days','n'],['Units sold, last '+M.W+' days','n'],['Units / month','n'],['Selling listings','n'],['Shelf items','n'],['On hand','n'],['In transit','n'],['Stock at COGS','n'],['Days of cover','n'],['Reorder point, units','n'],['Items at / below ROP','n'],['Units to refill','n']],sum)}
   <p class="small"><b>All stores:</b> ${fi(tot.on)} on hand, ${fi(tot.tr)} in transit, ${inrC(tot.val)} at COGS, ${fi(tot.u)} units a month, reorder points total ${fi(tot.rop)} units, ${fi(tot.need)} units to refill.</p></div>
  <div class="card"><div class="row"><h3>Store detail by SKU</h3><span class="spacer"></span><label for="storeSel" class="mute small">Store</label>
   <select id="storeSel" data-f="storeSel"><option>All</option>${STORES.map(x=>`<option value="${esc(x.ch)}"${sel===x.ch?' selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
   ${table([...(sel==='All'?[['Store']]:[]),['SKU'],['Name'],['Class'],['Sold / day','n'],['σ / day','n'],['Lead time','n'],['Safety stock','n'],['Reorder point','n'],['Order-up-to','n'],['On hand','n'],['In transit','n'],['Position','n'],['Days of cover','n'],['Status'],['Refill qty','n']],detail,'No shelf items for this store yet. Load orders with this store name in the channel column.')}</div>
`;
}


/* ================= SHARED DATA (claude.ai db) =================
   Collection "ds". Each dataset has a header doc "<name>.h" {at,by,rows,file,gen,n | inline}.
   Big datasets are chunked: "<name>.<gen>.<i>" = {r:[...]}. */
let DB=null,USER=null,DL=null,canWrite=true,myId=null,SRC='local',HDR={},DOCS=new Map(),LAST={},APPLIED={},NAMES={},UPFILE={},sharedHas=false,localReal=false;
function packMap(m){return [...m].map(([k,mm])=>{const a=[...mm].sort((x,y)=>x[0]-y[0]),base=a.length?a[0][0]:0,f=[];a.forEach(([d,q])=>f.push(d-base,q));return [k,base,f];});}
function unpackMap(rows){return new Map((rows||[]).map(([k,base,f])=>{const m=new Map();for(let i=0;i<f.length;i+=2)m.set(base+f[i],f[i+1]);return [k,m];}));}
const DSETS={
 skus:{big:1,enc:()=>S.skus.map(s=>({sku:s.sku,name:s.name,cat:s.cat,mrp:isFinite(s.mrp)?s.mrp:null,cogs:isFinite(s.cogs)?s.cogs:null})),dec:r=>{S.skus=r.map(s=>({...s,mrp:s.mrp==null?NaN:s.mrp,cogs:s.cogs==null?NaN:s.cogs}));}},
 orders:{big:1,enc:()=>packMap(ORD),dec:r=>{ORD=unpackMap(r);}},
 stock:{big:1,enc:()=>S.stock.map(x=>[x.sku,x.node,x.onhand,x.transit]),dec:(r,h)=>{S.stock=r.map(a=>({sku:a[0],node:a[1],onhand:a[2],transit:a[3]||0}));S.stockAt=h&&h.stockAt!=null?h.stockAt:S.stockAt;},extra:()=>({stockAt:S.stockAt==null?null:S.stockAt})},
 prod:{big:1,enc:()=>packMap(PROD),dec:r=>{PROD=unpackMap(r);}},
 stockhist:{big:1,enc:()=>packMap(STK),dec:r=>{STK=unpackMap(r);}},
 signoff:{enc:()=>S.signoff||{},dec:r=>{S.signoff=r||{};}},
 listings:{big:1,enc:()=>S.listings||[],dec:r=>{S.listings=r||[];}},
 channels:{enc:()=>S.channels,dec:r=>{S.channels=(r||[]).map(withDef);}},
 events:{enc:()=>S.events,dec:r=>{S.events=r||[];}},
 override:{enc:()=>S.override,dec:r=>{S.override=r||{};}},
 vars:{enc:()=>V,dec:r=>{VARS.forEach(v=>V[v.k]=v.d);Object.assign(V,r||{});}}
};
let wq=Promise.resolve();const SEEN={},seen=n=>SEEN[n]||(SEEN[n]=new Set());
function dbErr(e){toast(e&&e.code==='quota_exceeded'?'The shared store is full. Clear old production or stock history before saving more.':e&&e.code==='invalid_argument'?'You can view this page but not change its data. Ask the owner for Contributor access.':'Could not save to shared data. Check your connection; your change is only on this screen.');}
function writeSet(name,val,prev){
  const d=DSETS[name],col=DB.collection('ds'),old=HDR[name],meta={at:new Date().toISOString(),by:myId||'',rows:Array.isArray(val)?val.length:Object.keys(val||{}).length,file:UPFILE[name]||(old&&old.file)||''};
  if(d.extra)Object.assign(meta,d.extra());
  wq=wq.then(async()=>{
    const cur=HDR[name];if(cur&&!seen(name).has(d.big?cur.gen:cur.at)){toast(`${DSLABEL[name]||name} was just changed by someone else. Your change was not saved; their version is shown.`);return;}
    if(!d.big){APPLIED[name]=meta.at;seen(name).add(meta.at);await col.doc(name+'.h').set(Object.assign(meta,{inline:val}));}
    else{
      const gen=Date.now().toString(36),chunks=[];let cur=[],size=0;
      val.forEach(r=>{const s=JSON.stringify(r).length;if(size+s>180000&&cur.length){chunks.push(cur);cur=[];size=0;}cur.push(r);size+=s;});
      chunks.push(cur);
      for(let i=0;i<chunks.length;i++)await col.doc(name+'.'+gen+'.'+i).set({r:chunks[i]});
      APPLIED[name]=gen;seen(name).add(gen);
      await col.doc(name+'.h').set(Object.assign(meta,{gen,n:chunks.length}));
      if(old&&old.gen&&old.n)for(let i=0;i<old.n;i++)await col.doc(name+'.'+old.gen+'.'+i).delete();
    }
    delete UPFILE[name];
    await logChange(name,describe(name,val,prev,meta),meta.at);
  }).catch(dbErr);
}
function save(){
  if(SRC==='empty'&&DB&&canWrite&&!S.demo&&!localReal)SRC='shared';
  if(SRC==='shared'){
    if(S.demo||!canWrite)return;
    Object.keys(DSETS).forEach(n=>{const v=DSETS[n].enc(),s=JSON.stringify(v);if(s!==LAST[n]){const prev=LAST[n];LAST[n]=s;writeSet(n,v,prev);}});
    return;
  }
  try{localStorage.setItem(KEY,JSON.stringify({S,V,ord:[...ORD].map(([k,m])=>[k,[...m]]),prod:[...PROD].map(([k,m])=>[k,[...m]]),stk:[...STK].map(([k,m])=>[k,[...m]])}));saveFailed=false;}catch(e){saveFailed=true;}
}
function resetState(){S={skus:[],channels:defChannels(),stock:[],events:[],override:{},listings:[],signoff:{},demo:false,lv:2};VARS.forEach(v=>V[v.k]=v.d);ORD=new Map();PROD=new Map();STK=new Map();}
function onShared(snap){
  DOCS=new Map(snap.docs.map(d=>[d.id,d.data()]));
  const hdr={};DOCS.forEach((v,id)=>{if(id.endsWith('.h'))hdr[id.slice(0,-2)]=v;});HDR=hdr;
  sharedHas=Object.keys(hdr).length>0;
  if(!sharedHas){if(!snap.metadata.fromCache&&SRC!=='shared'){SRC='empty';}render();return;}
  let changed=false;
  if(SRC!=='shared'){resetState();SRC='shared';LAST={};APPLIED={};changed=true;}
  Object.keys(DSETS).forEach(n=>{
    const h=hdr[n];if(!h)return;const d=DSETS[n],tag=d.big?h.gen:h.at;if(APPLIED[n]===tag)return;
    let val;if(!d.big)val=h.inline;else{const parts=[];for(let i=0;i<h.n;i++){const c=DOCS.get(n+'.'+h.gen+'.'+i);if(!c)return;parts.push(...c.r);}val=parts;}
    d.dec(val,h);APPLIED[n]=tag;seen(n).add(tag);LAST[n]=JSON.stringify(d.enc());changed=true;
  });
  if(!snap.metadata.fromCache&&canWrite&&!onShared.swept){onShared.swept=true;const now=Date.now(),col=DB.collection('ds');
    DOCS.forEach((v,id)=>{const m=id.match(/^(\w+)\.([0-9a-z]+)\.\d+$/);if(!m)return;const h=hdr[m[1]],g=parseInt(m[2],36);if(h&&h.gen===m[2])return;if(now-g>600000&&(!h||!h.gen||g<parseInt(h.gen,36)))col.doc(id).delete().catch(()=>{});});}
  if(changed){M=compute();Object.keys(DSETS).forEach(n=>{if(HDR[n])LAST[n]=JSON.stringify(DSETS[n].enc());});render();resolveNames();}
  else render();
}
async function resolveNames(){
  if(!USER)return;const so=S.signoff||{},ids=[...new Set([...Object.values(HDR).map(h=>h.by),...['make','dispatch'].map(k=>so[k]&&so[k].by)].filter(Boolean))].filter(id=>!(id in NAMES));if(!ids.length)return;
  try{const ps=await USER.profiles(ids);ids.forEach(id=>NAMES[id]=(ps[id]&&ps[id].name)||'someone');render();}catch(e){}
}
function migrateLocal(){
  if(!DB||!canWrite)return;
  if(!load()){toast('No saved planner data was found in this browser.');return;}
  S.demo=false;SRC='shared';LAST={};M=compute();save();render();toast('Your browser data is now shared. Everyone with access sees it.');
}
const ago=iso=>{if(!iso)return 'never';const h=(Date.now()-Date.parse(iso))/36e5;if(h<1)return 'just now';if(h<24)return Math.floor(h)+' h ago';const d=Math.floor(h/24);return d===1?'yesterday':d+' days ago';};
const ageD=iso=>iso?(Date.now()-Date.parse(iso))/864e5:Infinity;
const who=h=>h&&h.by&&NAMES[h.by]?' by '+esc(NAMES[h.by]):'';
const RO=()=>SRC==='shared'&&!canWrite;

/* ================= NAVIGATION ================= */
const VIEWS={
 decide:{l:'Decisions',tabs:[['overview','Overview'],['today','Today'],['avail','Availability'],['stores','Stores'],['mix','Products & channels'],['hub','Hub & production'],['ahead','Sales & next month']]},
 desk:{l:'Data desk',tabs:[['inputs','Uploads & checks'],['skus','SKUs & COGS'],['terms','Channel costs'],['lead','Store delivery times'],['events','Sale calendar'],['rules','Planning rules']]}
};
const ALIAS={segment:'mix',tower:'today',nodes:'stores',surges:'ahead',capacity:'ahead',prodinv:'hub',margin:'terms',variables:'rules',data:'inputs',decide:'overview',desk:'inputs'};
const ALLTABS=[...VIEWS.decide.tabs,...VIEWS.desk.tabs].map(x=>x[0]);
const viewOf=t=>VIEWS.desk.tabs.some(x=>x[0]===t)?'desk':'decide';
function go(t){t=ALIAS[t]||t;if(!ALLTABS.includes(t))t='overview';UI.tab=t;try{history.replaceState(null,'','#'+t);}catch(e){location.hash=t;}render();window.scrollTo(0,0);}
window.addEventListener('hashchange',()=>{let t=location.hash.slice(1);t=ALIAS[t]||t;if(ALLTABS.includes(t)&&t!==UI.tab){UI.tab=t;render();window.scrollTo(0,0);}});

/* read-only assumptions line (decisions) */
function fmtVar(v){const x=V[v.k];if(v.type==='bool')return x?'Yes':'No';if(v.type==='text')return String(x);return String(x)+(v.u==='%'?'%':v.u==='days'?' days':v.u==='×'?'×':'');}
const strip=tag=>{const vs=VARS.filter(v=>v.use.includes(tag)&&v.type!=='text');if(!vs.length)return '';
  return `<p class="assume small mute">Assumptions: ${vs.map(v=>`${esc(v.l)} <b>${esc(fmtVar(v))}</b>`).join(' · ')} · <a href="#rules" data-go="rules">change on the data desk</a></p>`;};
const head=(n,t,refs,txt)=>`<div class="card"><h2>${esc(t)}</h2>${txt?`<details><summary class="small mute">Why this works${refs?' ('+esc(refs)+')':''}</summary><p class="small">${txt}</p></details>`:''}</div>`;

/* ================= DECISIONS: OVERVIEW ================= */
function excessCalc(){
  const st=new Map();S.stock.forEach(x=>st.set(x.sku+'\t'+x.node,x));const sk=new Map(S.skus.map(s=>[s.sku,s])),out=[];
  const cg=s=>s&&isFinite(s.cogs)?s.cogs:0;
  S.stock.filter(x=>x.node==='Hub').forEach(x=>{const h=M.hub.get(x.sku),pos=x.onhand+x.transit,s=sk.get(x.sku);
    if(!h||h.dTot<=0){if(pos>0)out.push({sku:x.sku,s:s||{name:'(not in SKU master)'},loc:'Hub',pos,up:0,d:0,ex:pos,v:pos*cg(s),why:'No sales in '+V.W+' days'});return;}
    if(pos>h.up)out.push({sku:x.sku,s:h.s,loc:'Hub',pos,up:h.up,d:h.dTot,ex:pos-h.up,v:(pos-h.up)*cg(h.s),why:'Above order-up-to'});});
  M.nodes.forEach(n=>{const x=st.get(n.sku+'\t'+n.ch);if(!x)return;const pos=x.onhand+x.transit;if(pos>n.up)out.push({sku:n.sku,s:n.s,loc:n.ch,pos,up:n.up,d:n.d,ex:pos-n.up,v:(pos-n.up)*cg(n.s),why:'Above order-up-to'});});
  // store stock of a SKU that sold nothing there in the window
  const shelf=new Set(M.nodes.map(n=>n.sku+'\t'+n.ch));
  S.stock.filter(x=>x.node!=='Hub'&&!shelf.has(x.sku+'\t'+x.node)).forEach(x=>{const c=S.channels.find(c=>c.name===x.node);if(!c||c.type!=='Retail store')return;const pos=x.onhand+x.transit;if(pos>0){const s=sk.get(x.sku);out.push({sku:x.sku,s:s||{name:''},loc:x.node,pos,up:0,d:(M.byKey.get(x.sku+'\t'+x.node)||{d:0}).d,ex:pos,v:pos*cg(s),why:'No sales here in '+V.W+' days'});}});
  out.sort((a,b)=>b.v-a.v);return {rows:out,v:out.reduce((a,o)=>a+o.v,0)};
}
function tile(cls,lab,big,sub,go){return `<button class="tile ${cls}" data-go="${go}"><span class="lab">${lab}</span><span class="big">${big}</span><span class="sub">${sub}</span></button>`;}
function freshBanner(){
  if(S.demo)return `<div class="note"><b>Example data.</b> These numbers are invented so you can see how the page works. ${SRC==='empty'||SRC==='shared'?'Real numbers appear once the data desk uploads the SKU master, orders and stock.':''} <a href="#inputs" data-go="inputs">Open the data desk</a></div>`;
  const w=[];
  if(M.has){const a=Math.floor(Date.now()/864e5)-M.maxDay;if(a>7)w.push(`latest order is ${a} days old`);}
  if(S.stockAt!=null){const a=Math.floor(Date.now()/864e5)-S.stockAt;if(a>2)w.push(`stock file is ${a} days old`);}else if(!S.stock.length)w.push('no stock file');
  const g=setupGaps();if(g.length)w.push(...g.map(x=>x.charAt(0).toLowerCase()+x.slice(1)));
  return w.length?`<div class="note"><b>Check the data before acting:</b> ${w.join(', ')}. <a href="#inputs" data-go="inputs">Data desk</a></div>`:'';
}
function rOverview(){
  const T=towerCalc(),A=availCalc(),P=prodCalc(),E=excessCalc();
  const own=P.loc.filter(x=>x.owner==='Company'),ov=own.reduce((a,x)=>a+x.val,0);
  const dailyCogs=[...M.hub.values()].reduce((a,h)=>a+h.dTot*(isFinite(h.s.cogs)?h.s.cogs:0),0);
  const hubQ=T.hubTrig.reduce((a,h)=>a+h.qty,0),hubV=T.hubTrig.reduce((a,h)=>a+h.qty*(isFinite(h.s.cogs)?h.s.cogs:0),0);
  const pool=[...M.hub.values()].reduce((a,h)=>a+h.saveV,0);
  const aShare=A.has&&A.hub.length?A.hubOk/A.hub.length:1;
  let h=freshBanner();
  h+=`<section class="tiles">
   ${tile(T.hubTrig.length?'red':'grn','Make or buy now',fi(T.hubTrig.length),T.has?`SKUs at or below the warehouse reorder point. ${fi(hubQ)} units, ${inrC(hubV)} at COGS.`:'Needs a stock file.','today')}
   ${tile(T.short>0?'red':T.refill.length?'amb':'grn','Store refills due',fi(T.refill.length),T.has?`store and dark-store items to send today. ${T.short>0?fi(T.short)+' units the warehouse cannot cover.':'The warehouse can cover all of them.'}`:'Needs a stock file.','today')}
   ${tile(aShare>=.9?'grn':aShare>=.7?'amb':'red','Availability on target',A.has?`${A.hubOk}/${A.hub.length}`:'–',A.has?`warehouse SKUs at target; ${A.nodeOk}/${A.nodes.length} store and dark-store items. ${inrC(A.gapV)} of stock closes every gap.`:'Needs a stock file.','avail')}
   ${tile(E.v>ov*.15?'red':E.v>0?'amb':'grn','Cash stuck above max',inrC(E.v),`at COGS, stock above its order-up-to level or not selling. This is the working-capital side.`,'today')}
   ${tile('blu','Company stock',inrC(ov),`at COGS, about ${dailyCogs>0?Math.round(ov/dailyCogs):'–'} days of sales. Pooling at the hub saves ${inrC(pool)} of safety stock.`,'hub')}
   ${tile('blu','Contribution a month',inrC(M.totalContrib),`after channel costs, last ${V.W} days run-rate. ${M.rows.filter(r=>r.cls==='X').length} listings lose money.`,'mix')}
  </section>`;
  h+=`<div class="charts">${chStockHealth()}${chContribByChannel()}${chStockByLoc()}${chExcess()}</div>`;
  // flow
  const loc=P.loc,sum=f=>loc.filter(f).reduce((a,x)=>a+x.on,0),hub=loc.find(x=>x.node==='Hub')||{on:0,tr:0};
  const chT=new Map(S.channels.map(c=>[c.name,c.type]));
  const dir=M.rows.filter(r=>!M.nodeKeys.has(r.key)).reduce((a,r)=>a+r.d,0),stD=M.nodes.filter(n=>chT.get(n.ch)==='Retail store').reduce((a,n)=>a+n.d,0),qcD=M.rows.filter(r=>r.chO.type==='Quick commerce').reduce((a,r)=>a+r.d,0);
  h+=`<section class="card"><div class="row"><h2>Where the stock is</h2><span class="mute small">units on hand, and what each part sells a day</span></div>
   <div class="flow">
    <div class="node"><span class="nm">In production / transit</span><b>${fi(hub.tr)}</b><span class="small mute">${P.hasP?f1(P.pTot/P.N)+' made a day':'no production log'}</span></div>
    <div class="arrow"><span>→</span><span>${V.hubL} days</span></div>
    <div class="node"><span class="nm">Company warehouse</span><b>${fi(hub.on)}</b><span class="small mute">${f1(P.dTot/P.N)} sold a day, all channels</span></div>
    <div class="arrow"><span>→</span><span>${V.dsL}–${Math.max(...S.channels.filter(c=>c.type==='Retail store').map(c=>c.L||0),0)} days</span></div>
    <div class="outs">
     <div class="node"><span><span class="nm">Website + marketplaces</span><br><span class="small mute">ship from warehouse · ${f1(dir)}/day</span></span><b>—</b></div>
     <div class="node"><span><span class="nm">Retail stores</span><br><span class="small mute">${f1(stD)}/day</span></span><b>${fi(sum(x=>chT.get(x.node)==='Retail store'))}</b></div>
     <div class="node"><span><span class="nm">Quick-commerce dark stores</span><br><span class="small mute">platform-owned · ${f1(qcD)}/day</span></span><b>${fi(sum(x=>chT.get(x.node)==='Quick commerce'))}</b></div>
    </div></div></section>`;
  // attention
  const att=[];
  T.hubTrig.slice(0,5).forEach(x=>att.push(['red',`Make <b>${fi(x.qty)}</b> of ${esc(x.sku)} ${esc(x.s.name)} (class ${x.best}, ${f1(x.doc)} days of cover)`,'today']));
  T.refill.filter(o=>o.short>0).slice(0,3).forEach(o=>att.push(['red',`${esc(o.ch)} is ${fi(o.short)} short of ${esc(o.sku)}: the warehouse can't cover it`,'today']));
  S.events.forEach(ev=>{const c=evCalc(ev);if(c.hasStock&&c.shortS>0)att.push(['red',`${esc(ev.name)}: hold. ${fi(c.shortU)} units short at the hub across ${c.shortS} SKUs`,'ahead']);else if(c.n&&c.delta<=0)att.push(['amb',`${esc(ev.name)} loses ${inrC(-c.delta)} of contribution at a ${ev.disc}% extra discount`,'ahead']);});
  E.rows.slice(0,3).forEach(o=>att.push(['amb',`${inrC(o.v)} stuck in ${esc(o.sku)} at ${esc(o.loc)} (${o.why.toLowerCase()})`,'today']));
  const xs=M.rows.filter(r=>r.cls==='X').length;if(xs)att.push(['amb',`${xs} listings have negative contribution: reprice or delist`,'mix']);
  h+=`<section class="card"><h2>Needs attention</h2>${att.length?`<ul class="att">${att.map(([c,t,g])=>`<li><span class="dot ${c}"></span><span>${t}</span><a href="#${g}" data-go="${g}" class="small">Open</a></li>`).join('')}</ul>`:'<p>Nothing urgent.</p>'}</section>`;
  return h;
}

/* ================= DECISIONS: other tabs ================= */
function rToday(){
  const E=excessCalc();const top=runCard()+chCover();
  const ex=E.rows.slice(0,200).map(o=>`<tr>${td(esc(o.sku))}${td(esc(o.s.name||''),'wrapc')}${td(esc(o.loc))}${td(f1(o.d),'n')}${td(fi(o.pos),'n')}${td(o.up?fi(o.up):'–','n')}${td(fi(o.ex),'n')}${td(inr(o.v),'n')}${td(esc(o.why))}</tr>`);
  return top+rTower()+chExcess()+`<div class="card"><div class="row"><h3>Too much stock: cash to free</h3><span class="spacer"></span><button class="btn" data-act="expExcess">Export CSV</button></div>
   <p class="mute small">Stock above its order-up-to level, stock with no sales in ${V.W} days, and store stock of items that are not shelf (A) items there. Pause production of these, push them on the channel that sells them best, or pull store stock back to the warehouse. Total ${inrC(E.v)} at COGS.</p>
   ${table([['SKU'],['Name'],['Location'],['Sold / day','n'],['Position','n'],['Order-up-to','n'],['Excess units','n'],['Excess at COGS','n'],['Why']],ex,'Nothing is above its max level.')}</div>`;
}
function rStoresDecide(){
  return chStores()+rStores()+bulkCard();
}
function rMix(){
  const tot=S.channels.map(c=>{const r=M.rows.filter(x=>x.ch===c.name&&x.ok);const u=r.reduce((a,x)=>a+x.units,0);if(!u)return null;
    const nr=r.reduce((a,x)=>a+x.units*x.e.NR,0),gm=r.reduce((a,x)=>a+x.units*x.e.gm,0),cm=r.reduce((a,x)=>a+x.units*x.cm,0);return {c,u,gmp:gm/nr,cmp:cm/nr,cm,cmu:cm/u};}).filter(Boolean);
  const tr=tot.map(o=>`<tr>${td(esc(o.c.name))}${td(esc(o.c.type))}${td(fi(o.u),'n')}${td(pc(o.gmp),'n')}${td(pc(o.cmp),'n')}${td(inr(o.cmu),'n')}${td(inrC(o.cm),'n')}</tr>`);
  return chListings()+rListings()+rSegment()+`<div class="card"><h3>Margin by channel, weighted by units sold</h3>${table([['Channel'],['Type'],['Units / month','n'],['GM %','n'],['CM %','n'],['CM per unit','n'],['Contribution / month','n']],tr,'No orders loaded.')}<p class="mute small">Cost terms behind these numbers are on the data desk (Channel costs).</p></div>`;
}
function rHubProd(){return `<div class="note">Channel correlation ${V.rhoAuto?'measured from orders':'typed'}: <b>${f2(M.rhoW)}</b> (demand-weighted). ${V.rhoAuto?'0 means channels cancel out, 1 means they move together.':'Switch “Measure correlation from orders” on under Planning rules.'} Lead-time swing in safety stock: <b>${V.hubLsd} days</b>.</div>`+rHub()+rProdInv();}
function rSurgesView(){
  const head5=head(5,'Upcoming sales and promotions','Ch. 7 pp. 155–156','Marketplace sale events and quick-commerce promotions create the same distortion. Do not run a promotion without a stock commitment from the hub. Each event is checked twice: can the hub cover the extra units without eating its safety stock, and does the promotion add contribution after the deeper discount.')+strip('surges');
  if(!M.has)return head5+noData();
  if(!S.events.length)return head5+`<div class="note">No events on the sale calendar. Add Big Billion Days, Great Indian Festival and similar dates on the data desk as soon as they are announced.</div>`;
  const cards=S.events.map(ev=>{const c=evCalc(ev),hold=c.hasStock&&c.shortS>0,loss=c.delta<=0,sd=parseDay(ev.start),by=sd!=null?sd-V.hubL:null,today=Math.floor(Date.now()/864e5);
    const verdict=c.n===0?'<span class="mute">No selling listings in scope</span>':(hold?'<span class="bad">Hold: hub cannot commit</span>':!c.hasStock?'<span class="amber">Upload stock to test the commitment</span>':'<span class="ok">Hub can commit</span>')+' · '+(loss?'<span class="bad">loses contribution at this discount</span>':'<span class="ok">adds contribution</span>');
    return `<div class="card"><div class="row"><h3>${esc(ev.name)}</h3><span class="mute small">${esc(ev.ch)} · ${esc(ev.start)} to ${esc(ev.end)} · +${ev.uplift}% demand · ${ev.disc}% extra discount · ${ev.scope==='A'?'A listings':ev.scope==='AB'?'A and B listings':'all selling listings'}</span><span class="spacer"></span><button class="btn" data-act="selEv" data-id="${ev.id}">Show SKU detail</button></div>
     <div class="kpis"><div class="kpi"><b>${by==null?'–':dayStr(by)}</b><span>${by!=null&&by<today?'<span class="bad">commit date has passed</span>':'commit production by (start − hub lead time)'}</span></div><div class="kpi"><b>${fi(c.inc)}</b><span>extra units to commit (${c.days} days, ${c.n} listings)</span></div>
      <div class="kpi"><b>${c.hasStock?fi(c.shortU):'–'}</b><span>units short at hub (${c.hasStock?c.shortS:'–'} SKUs)</span></div><div class="kpi"><b>${inrC(c.delta)}</b><span>change in contribution</span></div><div class="kpi"><b>${fi(ev.uplift*V.bull)}%</b><span>upstream order spike if replenished in one big order</span></div></div>
     <p>${verdict}</p></div>`;}).join('');
  const sel=S.events.find(e=>e.id===UI.ev);let det='';
  if(sel){const c=evCalc(sel);const rows=c.detail.sort((a,b)=>b.sh-a.sh||b.i-a.i).slice(0,80).map(d=>`<tr>${td(esc(d.r.sku))}${td(esc(d.r.s.name),'wrapc')}${td(esc(d.r.ch))}${td(chip(d.r.cls))}${td(fi(d.i),'n')}${td(fi(d.free),'n')}${td(fi(d.sh),'n')}${td(inr(d.r.cm),'n')}${td(inr(d.cmp),'n')}</tr>`);
    det=`<div class="card"><h3>SKU detail: ${esc(sel.name)}</h3>${table([['SKU'],['Name'],['Channel'],['Class'],['Extra units','n'],['Hub free stock','n'],['Short','n'],['CM / unit now','n'],['CM / unit on promo','n']],rows)}<p class="mute small">Hub free stock = on hand + in transit − hub safety stock. Top 80 rows.</p></div>`;}
  return head5+cards+det+`<p class="small mute">Lock most of the extra units now and the rest after the first sale day. Plan for the dip after the sale, and don't reorder at the peak.</p>`;
}
function rAhead(){return rSurgesView()+chCapacity()+rCapacity();}

/* ================= DATA DESK ================= */
const UPS=[
 ['stock','Stock on hand','Every morning',1,3,'stock','Everything on the Decisions page starts from this. Location is “Hub” for the warehouse, or the store or platform name. Put stock ordered from production under in_transit on the Hub row.'],
 ['orders','Orders','Every week',7,14,'orders','At least 120 days, every channel and store. Put the store name in the channel column. Quick commerce: the purchase orders you receive.'],
 ['skus','SKU master','When products or costs change',30,90,'skus','COGS values stock and sets margin classes. Upload this first.'],
 ['prod','Production log','Every week',7,14,'prod','Units made per day. Feeds the production-vs-sales view.'],
 ['listings','Marketplace listings','Every month',30,60,'listings','Live listings per channel (SKU, channel, optional status). Lets the Decisions page show listed SKUs that sold nothing. Optional.'],
 ['stockhist','Daily stock history','Every week (recommended)',7,14,'stockhist','End-of-day stock by SKU and location. The only reliable way to stop stock-outs from looking like low demand.']
];
function upState(u){
  const [k,,,amb,red]=u;
  if(SRC!=='shared'){const has=k==='orders'?ORD.size:k==='prod'?PROD.size:k==='stockhist'?STK.size:k==='listings'?(S.listings||[]).length:k==='stock'?S.stock.length:S.skus.length;
    return has?(S.demo?['k-B','Example',`Example data`]:['k-B','This browser',`${fi(has)} records, not shared`]):['k-X','Missing','Never uploaded'];}
  const h=HDR[k];if(!h||!h.rows)return k==='stockhist'||k==='prod'||k==='listings'?['k-0','Optional','Not uploaded']:['k-X','Missing','Never uploaded'];
  const sAge=k==='stock'&&h.stockAt!=null?Math.floor(Date.now()/864e5)-h.stockAt:null,a=sAge!=null?sAge:ageD(h.at),t=`${sAge!=null?'Counted '+dayStr(h.stockAt)+', u':'U'}pdated ${ago(h.at)}${who(h)} · ${fi(h.rows)} ${k==='orders'||k==='prod'||k==='stockhist'?'series':'rows'}${h.file?' · '+esc(h.file):''}`;
  return a>red?['k-X','Out of date',t]:a>amb?['k-B','Due',t]:['k-A','Fresh',t];
}
function rInputs(){
  let h='';
  if(SRC==='local'&&!DB)h+=`<div class="note">Shared data can't be reached here (signed out, or the page is open outside claude.ai). Changes are kept in this browser only.</div>`;
  if(RO())h+=`<div class="note">You have view access. Ask the owner for Contributor access to upload or edit.</div>`;
  if(SRC==='empty'&&localReal&&canWrite)h+=`<div class="card"><h3>Planner data found in this browser</h3><p>You entered data in this planner before it was shared. Move it to shared data so the team sees the same numbers. Nothing is shared until you click.</p><div class="row"><button class="btn pri" data-act="migrate">Share my browser data</button></div></div>`;
  h+=`<div class="card"><h2>Uploads</h2><p class="mute small">CSV or Excel, any column order; headers are matched automatically and you confirm before saving. ${SRC==='shared'?'Saving replaces the data for everyone.':''}</p><div class="ups">`;
  UPS.forEach(u=>{const [k,t,every,,,tpl,why]=u,s=upState(u);
    h+=`<div class="up"><div class="row"><h3>${t}</h3><span class="spacer"></span><span class="chip ${s[0]}">${s[1]}</span></div>
     <p class="small"><b>${every}.</b> ${s[2]}</p><p class="small mute">${why}</p>
     <div class="drop small" data-drop="${k}">Drop a file here</div>
     <div class="row"><button class="btn pri" data-act="pick" data-k="${k}">Upload</button><button class="btn" data-act="tpl" data-k="${tpl}">Template</button>${k!=='skus'&&!S.demo?`<button class="btn danger" data-act="clr" data-k="${k}">Clear</button>`:''}</div></div>`;});
  h+=`</div></div>`;
  const gaps=setupGaps();if(gaps.length)h+=`<div class="card"><h3>Setup gaps</h3><ul class="tight">${gaps.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
  h+=dqCard()+oosCard()+logCard();
  h+=`<div class="card"><h3>Pulling orders automatically (Unicommerce and similar)</h3><p class="small">This page can't call an order system's API: the browser blocks it, and an API key typed into a web page isn't safe. Today the route is a scheduled export (Unicommerce, Increff, Shiprocket, a marketplace report) uploaded here. A live feed needs a small backend that holds the credentials and serves the file.</p>
   ${SRC!=='shared'?`<div class="row">${S.demo?'':'<button class="btn" data-act="demo">Show example data</button>'}</div>`:''}</div>`;
  return h;
}
function rLead(){
  const rows=STORES.map(s=>{const i=S.channels.findIndex(c=>c.name===s.ch),c=S.channels[i];if(!c)return '';
    return `<tr>${td(esc(s.ch))}${td(esc(s.city))}${td(esc(s.fmt))}${td(`<input type="number" data-ch="${i}:L" value="${c.L}" min="0" step="0.5" aria-label="Delivery days for ${esc(s.ch)}">`,'n')}${td(esc(s.addr),'wrapc')}${td(esc(s.hours))}${td(esc(s.phone))}${td(`<a href="https://www.google.com/maps/place/?q=place_id:${esc(s.pid)}" target="_blank" rel="noopener">Maps</a>`)}</tr>`;});
  const dv=VARS.filter(v=>['dsL','R','trigDOC'].includes(v.k));
  return `<div class="card"><h2>Store delivery times</h2><p class="small mute">Days from dispatch at the warehouse to stock on the store shelf, door to door. Measure them from dispatch to receipt over recent shipments; quoted times are usually optimistic. The starting values assume a Delhi NCR warehouse (Delhi and Gurugram 1, Mumbai 3, Bengaluru, Pune and Hyderabad 4, Chennai 5). Airport stores usually need extra days for security clearance.</p>
   ${table([['Store'],['City'],['Format'],['Delivery days','n'],['Address'],['Hours'],['Phone'],['']],rows)}</div>
   <div class="card"><h3>Dark stores and refill rhythm</h3><div class="vars">${dv.map(v=>varInput(v)).join('')}</div><p class="small mute">Dark-store delivery time is one average for Blinkit, Zepto and Instamart in every city. Refill cycle can't be shorter than how often a truck actually goes to a store.</p></div>
   <div class="note">Store list from a Google Maps search on 23 Nov 2026. It shows no store in Kolkata, Ahmedabad, Jaipur, Chandigarh, Noida or Lucknow, and no partner shelves. Check phone numbers and hours before relying on them.</div>`;
}
function rEventsDesk(){
  const cards=S.events.map(ev=>`<div class="card"><div class="row"><h3>${esc(ev.name)}</h3><span class="spacer"></span><button class="btn danger" data-act="delEv" data-id="${ev.id}">Delete</button></div>
   <div class="vars">
    <div class="var"><label for="e${ev.id}n">Name</label><input id="e${ev.id}n" data-ev="${ev.id}:name" value="${esc(ev.name)}"></div>
    <div class="var"><label for="e${ev.id}c">Channel</label><select id="e${ev.id}c" data-ev="${ev.id}:ch"><option>All</option>${S.channels.map(c=>`<option${ev.ch===c.name?' selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="var"><label for="e${ev.id}s">Start</label><input id="e${ev.id}s" type="date" data-ev="${ev.id}:start" value="${esc(ev.start)}"></div>
    <div class="var"><label for="e${ev.id}e">End</label><input id="e${ev.id}e" type="date" data-ev="${ev.id}:end" value="${esc(ev.end)}"></div>
    <div class="var"><label for="e${ev.id}u">Expected demand uplift</label><input id="e${ev.id}u" type="number" data-ev="${ev.id}:uplift" value="${ev.uplift}"><span class="u">% over normal</span></div>
    <div class="var"><label for="e${ev.id}d">Extra discount</label><input id="e${ev.id}d" type="number" data-ev="${ev.id}:disc" value="${ev.disc}"><span class="u">% off current price</span></div>
    <div class="var"><label for="e${ev.id}x">Listings taking part</label><select id="e${ev.id}x" data-ev="${ev.id}:scope"><option value="A"${ev.scope==='A'?' selected':''}>A listings only</option><option value="AB"${ev.scope==='AB'?' selected':''}>A and B</option><option value="all"${ev.scope==='all'?' selected':''}>All selling</option></select></div></div></div>`).join('');
  return `<div class="card"><h2>Sale calendar</h2><p class="small mute">Add each marketplace sale or quick-commerce promotion as soon as it is announced. The results (stock check, contribution, commit-by date) are on Decisions → Sales &amp; next month. Uplift is your estimate; check it against last year's event.</p></div>${cards||'<p class="mute">No events yet.</p>'}<div class="row"><button class="btn pri" data-act="addEv">Add event</button></div>`;
}
function rTerms(){
  return rMargin().replace('<div class="card"><h3>By channel, weighted by units sold</h3>','<div class="card" hidden><h3>By channel, weighted by units sold</h3>')
   +`<div class="card"><h3>Tax</h3><div class="vars">${varInput(VARS.find(v=>v.k==='gst'))}</div></div>`;
}

/* ================= SHELL ================= */
function render(){
  if(!M)M=compute();
  const v=viewOf(UI.tab);
  $('#views').innerHTML=Object.entries(VIEWS).map(([k,o])=>`<button data-go="${k}" aria-current="${v===k?'page':'false'}">${o.l}</button>`).join('');
  $('#nav').innerHTML=VIEWS[v].tabs.map(([k,l])=>`<button data-go="${k}"${UI.tab===k?' aria-current="page"':''}>${l}</button>`).join('');
  $('#status').innerHTML=S.demo?`<span class="chip k-B">Example data</span>`:SRC==='shared'?`<span class="mute small">Shared · ${canWrite?'you can edit':'view only'} · ${fi(S.skus.length)} SKUs</span>`:`<span class="mute small">This browser only · ${fi(S.skus.length)} SKUs</span>`;
  const R={rules:()=>(canAdmin||SRC!=='shared'?'':'<div class="note">Only editors can change planning rules. Ask the owner if a value is wrong.</div>')+rVariables()+logCard(['vars','override']),overview:rOverview,today:rToday,avail:rAvailView,stores:rStoresDecide,mix:rMix,hub:rHubProd,ahead:rAhead,inputs:rInputs,skus:rSkus,terms:rTerms,lead:rLead,events:rEventsDesk,};
  const y=window.scrollY;$('#main').innerHTML=(R[UI.tab]||rOverview)();window.scrollTo(0,y);
  if(SRC==='shared'&&!canAdmin)$('#main').querySelectorAll('[data-v],[data-ov]').forEach(e=>e.disabled=true);
  if(RO())$('#main').querySelectorAll('input:not([type=file]):not(#q):not(#skuQ),select:not([data-f]),[data-act=pick],[data-act=clr],[data-act=addSku],[data-act=delSku],[data-act=addChannel],[data-act=addEv],[data-act=delEv]').forEach(e=>e.disabled=true);
}


/* ================= CHARTS (HTML bars: one scale per chart, hover titles, legend + table view alongside) ================= */
const COL={red:'var(--x)',amb:'var(--b)',grn:'var(--a)',gry:'var(--c)',acc:'var(--accent)',acc2:'var(--accent-2)'};
const CLSCOL={A:COL.grn,B:COL.amb,C:COL.gry,X:COL.red,'0':'var(--line)','?':'var(--line)'};
function lg(items){return `<div class="lg">${items.map(([c,l])=>`<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`;}
function bars(rows,o){o=o||{};
  const tot=r=>r.segs?r.segs.reduce((a,s)=>a+Math.max(0,s[0]),0):Math.max(0,r.v);
  const max=o.max||Math.max(1e-9,...rows.map(tot),o.ref?o.ref.v*1.08:0,...rows.map(r=>r.m!=null?r.m*1.02:0));
  const w=v=>Math.max(0,Math.min(100,v/max*100));
  return `<div class="bars" role="img" aria-label="${esc(o.aria||'Bar chart')}">${rows.map(r=>{const segs=r.segs||[[r.v,r.c||COL.acc,r.t||'']];
    return `<div class="br"><span class="bl" title="${esc(r.l)}">${r.lh||esc(r.l)}</span><span class="bt">${segs.filter(s=>s[0]>0).map(s=>`<i style="width:${w(s[0])}%;background:${s[1]}" title="${esc(s[2]||'')}"></i>`).join('')}${o.ref?`<b class="ref" style="left:${w(o.ref.v)}%" title="${esc(o.ref.l)}"></b>`:''}${r.m!=null?`<b class="mk" style="left:${w(r.m)}%" title="${esc(r.mt||'')}"></b>`:''}</span><span class="bv">${r.txt}</span></div>`;}).join('')}</div>`;
}
function chartCard(title,sub,body){return `<div class="card chart"><div class="row"><h3>${title}</h3>${sub?`<span class="mute small">${sub}</span>`:''}</div>${body}</div>`;}

function hubStatus(){
  const st=new Map();S.stock.forEach(x=>st.set(x.sku+'\t'+x.node,x));
  const H={red:0,amb:0,grn:0,gry:0},N={red:0,amb:0,grn:0,gry:0},HV={red:0,amb:0,grn:0,gry:0};
  M.hub.forEach(h=>{if(h.dTot<=0)return;const x=st.get(h.sku+'\tHub'),pos=x?x.onhand+x.transit:0,k=pos<h.dTot*V.hubL?'red':pos<=h.rop?'amb':pos<=h.up?'grn':'gry';H[k]++;HV[k]+=(x?x.onhand:0)*(isFinite(h.s.cogs)?h.s.cogs:0);});
  M.nodes.forEach(n=>{const x=st.get(n.sku+'\t'+n.ch);if(!x&&n.r.chO.see===0)return;const pos=x?x.onhand+x.transit:0,k=pos<n.d*n.L?'red':pos<=n.rop?'amb':pos<=n.up?'grn':'gry';N[k]++;});
  return {H,N,HV};
}
function chStockHealth(){
  if(!S.stock.length)return chartCard('Stock health','','<p class="mute">Needs a stock file.</p>');
  const {H,N}=hubStatus(),seg=o=>[[o.red,COL.red,o.red+' run out before new stock lands'],[o.amb,COL.amb,o.amb+' into safety stock: refill now'],[o.grn,COL.grn,o.grn+' healthy'],[o.gry,COL.gry,o.gry+' above max: cash stuck']];
  const t=o=>o.red+o.amb+o.grn+o.gry;
  return chartCard('Stock health','count of items in each state',bars([
    {l:'Warehouse SKUs',segs:seg(H),txt:fi(t(H))},{l:'Store & dark-store items',segs:seg(N),txt:fi(t(N))}],{aria:'Stock health'})+
    lg([[COL.red,`Runs out first (${H.red} / ${N.red})`],[COL.amb,`Into safety stock (${H.amb} / ${N.amb})`],[COL.grn,`Healthy (${H.grn} / ${N.grn})`],[COL.gry,`Above max (${H.gry} / ${N.gry})`]])+
    `<p class="small mute">Figures in brackets: warehouse / stores. Red and amber need action today; grey is working capital you could free.</p>`);
}
function chContribByChannel(){
  const rs=M.chSum.filter(c=>c.contrib>0).sort((a,b)=>b.contrib-a.contrib);
  if(!rs.length)return chartCard('Contribution by channel','','<p class="mute">No orders yet.</p>');
  const top=rs.slice(0,10),rest=rs.slice(10).reduce((a,c)=>a+c.contrib,0);if(rest>0)top.push({name:'All other stores',contrib:rest,units:0});
  return chartCard('Contribution by channel','₹ a month after channel costs',bars(top.map(c=>({l:c.name,v:c.contrib,txt:inrC(c.contrib),t:`${c.name}: ${inrC(c.contrib)} a month`})),{aria:'Contribution by channel'}));
}
function chStockByLoc(){
  const P=prodCalc();const ls=P.loc.filter(x=>x.val>0).sort((a,b)=>b.val-a.val);if(!ls.length)return '';
  const top=ls.slice(0,10),rest=ls.slice(10).reduce((a,x)=>a+x.val,0);
  const rows=top.map(x=>({l:x.node==='Hub'?'Company warehouse':x.node,v:x.val,c:x.owner==='Platform'?COL.gry:COL.acc,txt:inrC(x.val),t:`${x.node}: ${inrC(x.val)} at COGS`}));
  if(rest>0)rows.push({l:'All other locations',v:rest,c:COL.acc,txt:inrC(rest)});
  return chartCard('Where the cash sits','stock at COGS, on hand + in transit',bars(rows,{aria:'Stock value by location'})+lg([[COL.acc,'Company-owned'],[COL.gry,'On platform shelves']]));
}
function chCover(){
  const st=new Map();S.stock.forEach(x=>{if(x.node==='Hub')st.set(x.sku+'\tHub',x);});if(!S.stock.length)return '';
  const rs=[...M.hub.values()].filter(h=>h.dTot>0).map(h=>{const x=st.get(h.sku+'\tHub'),on=x?x.onhand:0,tr=x?x.transit:0;return {h,doc:on/h.dTot,tdoc:(on+tr)/h.dTot};}).sort((a,b)=>a.doc-b.doc).slice(0,20);
  const cap=V.hubL*4;
  return chartCard('Warehouse days of cover','20 tightest SKUs; dashed line = production lead time',bars(rs.map(o=>({l:o.h.sku,lh:`${esc(o.h.sku)} <span class="mute">${chip(o.h.best)}</span>`,v:Math.min(o.doc,cap),c:o.doc<V.hubL?COL.red:o.doc<o.h.rop/o.h.dTot?COL.amb:COL.acc,m:Math.min(o.tdoc,cap),mt:`with in-transit: ${f1(o.tdoc)} days`,txt:f1(o.doc)+' d',t:`${o.h.s.name}: ${f1(o.doc)} days on hand`})),{ref:{v:V.hubL,l:`Lead time ${V.hubL} days`},max:Math.max(V.hubL*1.6,...rs.map(o=>Math.min(o.tdoc,cap)))*1.02,aria:'Days of cover'})+
   lg([[COL.red,'Runs out before a new batch can land'],[COL.amb,'Below reorder point'],[COL.acc,'Covered'],['var(--ink)','Tick: including stock in transit']]));
}
function chExcess(){
  const E=excessCalc();if(!E.rows.length)return '';
  return chartCard('Biggest cash traps','excess stock at COGS',bars(E.rows.slice(0,12).map(o=>({l:o.sku+' · '+o.loc,v:o.v,c:o.why.startsWith('No sales')?COL.red:COL.gry,txt:inrC(o.v),t:`${o.s.name||o.sku} at ${o.loc}: ${fi(o.ex)} units over (${o.why})`})),{aria:'Excess stock'})+lg([[COL.red,'Not selling at all'],[COL.gry,'Above max or off-shelf']]));
}
function chAvail(){
  const A=availCalc();if(!A.has||!A.hub.length)return '';
  const rs=A.hub.filter(o=>o.tg>0).sort((a,b)=>(a.a*100-a.tg)-(b.a*100-b.tg)).slice(0,20);
  return chartCard('Availability now vs target','20 warehouse SKUs furthest below target; tick = target',bars(rs.map(o=>({l:o.sku,lh:`${esc(o.sku)} <span class="mute">${chip(o.h.best)}</span>`,v:o.a*100,c:o.a*100>=o.tg?COL.grn:o.a*100>=o.tg-10?COL.amb:COL.red,m:o.tg,mt:`target ${o.tg}%`,txt:(o.a*100).toFixed(0)+'%',t:`${o.s.name}: ${(o.a*100).toFixed(1)}% now, target ${o.tg}%`})),{max:100,aria:'Availability vs target'})+
   lg([[COL.red,'More than 10 points short'],[COL.amb,'Within 10 points'],[COL.grn,'At target'],['var(--ink)','Target']]));
}
function chStores(){
  const D=storeCalc().filter(o=>o.hasStock||o.rs.length);if(!D.length)return '';
  const rs=D.sort((a,b)=>b.val-a.val);
  return chartCard('Stores: stock held and refills due','bar = stock at COGS; colour = share of shelf items at or below reorder point',bars(rs.map(o=>{const sh=o.nodes.length?o.below/o.nodes.length:0;return {l:o.s.ch.replace(/^Store /,''),v:o.val,c:sh>=.5?COL.red:sh>0?COL.amb:COL.grn,txt:`${inrC(o.val)} · ${o.below}/${o.nodes.length||0}`,t:`${o.s.ch}: ${inrC(o.val)}, ${o.below} of ${o.nodes.length} shelf items need a refill, ${f1(o.doc)} days of cover`};}),{aria:'Stores'})+
   lg([[COL.red,'Half or more shelf items need refill'],[COL.amb,'Some need refill'],[COL.grn,'All above reorder point']])+`<p class="small mute">Right-hand figure: items needing refill / shelf (A) items.</p>`);
}
function chListings(){
  const chs=S.channels.map(c=>{const L=listingsFor(c.name);return {c,L};}).filter(o=>o.L.length);
  if(!chs.length)return '';
  const k=['A','B','C','X','0','?'];
  return chartCard('SKUs on each marketplace','listings by class',bars(chs.sort((a,b)=>b.L.length-a.L.length).map(o=>{const n={};o.L.forEach(x=>n[x.cls]=(n[x.cls]||0)+1);return {l:o.c.name,segs:k.map(c=>[n[c]||0,CLSCOL[c],`${n[c]||0} class ${c}`]),txt:fi(o.L.length)};}),{aria:'Listings by channel and class'})+
   lg([[CLSCOL.A,'A high volume + margin'],[CLSCOL.B,'B'],[CLSCOL.C,'C low on both'],[CLSCOL.X,'X loses money'],['var(--line)','0 / ? listed, no sales or no cost']]));
}

/* ================= SKUs listed on each marketplace ================= */
function listingsFor(ch){
  const out=new Map();
  M.rows.filter(r=>r.ch===ch).forEach(r=>out.set(r.sku,{sku:r.sku,s:r.s,cls:r.cls,r,src:'Selling'}));
  (S.listings||[]).forEach(([sku,c])=>{if(c!==ch)return;if(out.has(sku)){out.get(sku).listed=true;return;}const s=S.skus.find(x=>x.sku===sku)||{sku,name:'(not in SKU master)',cat:''};out.set(sku,{sku,s,cls:'0',r:null,src:'Listed, no sales',listed:true});});
  return [...out.values()];
}
function rListings(){
  const chs=S.channels.map(c=>({c,n:listingsFor(c.name).length})).filter(o=>o.n);
  if(!chs.length)return '';
  if(!UI.lch||!chs.some(o=>o.c.name===UI.lch))UI.lch=(chs.find(o=>o.c.name==='Amazon')||chs[0]).c.name;
  const L=listingsFor(UI.lch).sort((a,b)=>(b.r?b.r.units:-1)-(a.r?a.r.units:-1));
  const q=(UI.lq||'').toLowerCase(),fl=L.filter(x=>(UI.lcls==='All'||!UI.lcls||x.cls===UI.lcls)&&(!q||(x.sku+' '+x.s.name+' '+(x.s.cat||'')).toLowerCase().includes(q)));
  const hasFile=(S.listings||[]).length>0;
  const rows=fl.slice(0,500).map(x=>{const r=x.r;return `<tr>${td(esc(x.sku))}${td(esc(x.s.name),'wrapc')}${td(esc(x.s.cat||''))}${td(chip(x.cls))}${td(r?f1(r.units):'0','n')}${td(r?inr(r.price):'–','n')}${td(r?inr(r.cm):'–','n')}${td(r?pc(r.cmPct):'–','n')}${td(r?inrC(r.contrib):'–','n')}${td(r&&r.oos?r.oos:'–','n')}${td(r?esc(r.place):'<span class="amber">Listed but sold nothing in '+V.W+' days: review</span>','wrapc')}</tr>`;});
  const n={};L.forEach(x=>n[x.cls]=(n[x.cls]||0)+1);
  return `<div class="card"><div class="row"><h3>SKUs listed on each marketplace</h3><span class="spacer"></span><input id="lq" placeholder="Search SKU or name" value="${esc(UI.lq||'')}" aria-label="Search listings"><select data-f="lcls" aria-label="Class filter"><option>All</option>${['A','B','C','X','0','?'].map(k=>`<option${UI.lcls===k?' selected':''}>${k}</option>`).join('')}</select><button class="btn" data-act="expList">Export CSV</button></div>
   <div class="chips">${chs.map(o=>`<button data-lch="${esc(o.c.name)}" aria-pressed="${o.c.name===UI.lch}">${esc(o.c.name)} <span class="ct">${o.n}</span></button>`).join('')}</div>
   <p class="small">${esc(UI.lch)}: <b>${L.length}</b> SKUs · ${['A','B','C','X','0','?'].filter(k=>n[k]).map(k=>`${chip(k)} ${n[k]}`).join(' ')}</p>
   ${table([['SKU'],['Name'],['Family'],['Class'],['Units / month','n'],['Price','n'],['CM / unit','n'],['CM %','n'],['Contribution / month','n'],['Stock-out days','n'],['What to do']],rows,'No SKUs match.')}
   <p class="small mute">${hasFile?'Includes SKUs from the listings file that sold nothing.':'Shows SKUs with orders on this channel. Listings that sold nothing appear only once the data desk uploads a listings file (SKU, channel).'}</p></div>`;
}

/* ================= Availability by channel, store and dark store ================= */
// Status: red = will run out before new stock can land (days of cover < lead time) or 10+ points below target; amber = below target; green = at target.
function avStatus(a,tg,doc,L){return (a*100<tg-10||doc<L)?'red':a*100<tg?'amb':'grn';}
function avRows(kind){
  const A=availCalc();if(!A.has)return null;
  const hub=new Map(A.hub.map(o=>[o.sku,o])),node=new Map(A.nodes.map(o=>[o.sku+'\t'+o.ch,o])),out=[];
  M.rows.filter(r=>r.units>0).forEach(r=>{
    const t=r.chO.type,ho=hub.get(r.sku);
    const k=t==='Retail store'?'store':t==='Quick commerce'?'dark':!r.chO.node?'mkt':null;
    if(k!==kind||!ho)return;
    const no=node.get(r.key),tg=r.target||ho.tg||V.tC;let o;
    if(k==='mkt')o={a:ho.a,pos:ho.pos,doc:ho.doc,L:V.hubL,lim:'Warehouse',src:'warehouse'};
    else if(no)o={a:no.e,pos:no.pos,doc:Math.min(no.doc,ho.doc),L:no.n.L,aN:no.aN,aH:no.aH,lim:no.aH<no.aN?'Warehouse':'Shelf',src:'node'};
    else o={a:ho.a,pos:ho.pos,doc:ho.doc,L:V.hubL,lim:k==='dark'?'Warehouse (no platform data)':'Warehouse',src:'warehouse'};
    if(k==='dark'&&r.bulk)o.ready=r.bm+(r.z||0)*r.bsd;
    o.r=r;o.ch=r.ch;o.sku=r.sku;o.s=r.s;o.cls=r.cls;o.d=r.d;o.tg=tg;o.risk=r.d*30*(1-o.a);o.st=avStatus(o.a,tg,o.doc,o.L);
    out.push(o);
  });
  return out.sort((x,y)=>x.a-y.a||y.risk-x.risk);
}
const AVT=[['wh','Warehouse'],['mkt','Marketplaces'],['store','Retail stores'],['dark','Dark stores']];
function rAvailView(){
  if(!UI.avTab)UI.avTab='wh';UI.avCh=UI.avCh||{};
  const counts={};AVT.slice(1).forEach(([k])=>{const rs=avRows(k);counts[k]=rs?rs.filter(o=>o.st==='red').length:0;});
  const sub=`<div class="chips avt" role="group" aria-label="Availability view">${AVT.map(([k,l])=>`<button data-avt="${k}" aria-pressed="${UI.avTab===k}">${l}${k!=='wh'&&counts[k]?` <span class="ct red">${counts[k]} red</span>`:''}</button>`).join('')}</div>`;
  if(UI.avTab==='wh')return sub+chAvail()+rAvail();
  if(!M.has)return sub+noData();
  const rows=avRows(UI.avTab);if(!rows)return sub+`<div class="note">The data desk needs to upload a stock file to see availability.</div>`;
  const kind=UI.avTab,chs=[...new Set(rows.map(o=>o.ch))];
  if(!chs.length)return sub+`<p class="mute">No selling listings here.</p>`;
  const sel=chs.includes(UI.avCh[kind])?UI.avCh[kind]:'All';UI.avCh[kind]=sel;
  const by=c=>rows.filter(o=>o.ch===c),n=(rs,s)=>rs.filter(o=>o.st===s).length;
  const chart=chartCard(kind==='mkt'?'Products by availability, per marketplace':kind==='store'?'Products by availability, per store':'Products by availability, per platform','count of listed products; red first',
    bars(chs.map(c=>{const rs=by(c);return {l:c,segs:[[n(rs,'red'),COL.red,n(rs,'red')+' red'],[n(rs,'amb'),COL.amb,n(rs,'amb')+' below target'],[n(rs,'grn'),COL.grn,n(rs,'grn')+' at target']],txt:`${n(rs,'red')} / ${rs.length}`};}).sort((a,b)=>parseInt(b.txt)-parseInt(a.txt)),{aria:'Availability by location'})+
    lg([[COL.red,'Runs out before stock can land, or 10+ points below target'],[COL.amb,'Below target'],[COL.grn,'At target']]));
  const show=sel==='All'?rows:by(sel);
  const pick=`<div class="chips">${['All',...chs].map(c=>{const rs=c==='All'?rows:by(c),red=n(rs,'red');return `<button data-avch="${esc(c)}" aria-pressed="${c===sel}">${esc(c)} <span class="ct${red?' red':''}">${red?red+' red':rs.length}</span></button>`;}).join('')}</div>`;
  const tr=show.slice(0,400).map(o=>`<tr class="${o.st==='red'?'rowred':''}">${sel==='All'?td(esc(o.ch)):''}${td(esc(o.sku))}${td(esc(o.s.name),'wrapc')}${td(chip(o.cls))}${td(f1(o.d),'n')}${td(fi(o.pos),'n')}${td(isFinite(o.doc)?f1(o.doc):'–','n')}${td(o.L%1?f1(o.L):fi(o.L),'n')}
    ${td(`<span class="avbar"><i style="width:${Math.max(2,o.a*100)}%;background:${o.st==='red'?COL.red:o.st==='amb'?COL.amb:COL.grn}"></i></span> <b class="${o.st==='red'?'bad':o.st==='amb'?'amber':'ok'}">${(o.a*100).toFixed(1)}%</b>`,'n')}${td(o.tg+'%','n')}
    ${kind!=='mkt'?td(o.src==='node'?`${(o.aN*100).toFixed(0)}% / ${(o.aH*100).toFixed(0)}%`:'–','n'):''}${kind!=='mkt'?td(esc(o.lim)):''}${kind==='dark'?td(isFinite(o.ready)?fi(o.ready):'–','n'):''}${td(fi(o.risk),'n')}
    ${td(`<span class="chip ${o.st==='red'?'k-X':o.st==='amb'?'k-B':'k-A'}">${o.st==='red'?'Critical':o.st==='amb'?'Below target':'OK'}</span>`)}</tr>`);
  const heads=[...(sel==='All'?[['Location']]:[]),['SKU'],['Name'],['Class'],['Sells / day here','n'],['Stock position','n'],['Days of cover','n'],['Lead time, days','n'],['Availability now','n'],['Target','n'],
    ...(kind!=='mkt'?[['Shelf / warehouse','n'],['Limited by']]:[]),...(kind==='dark'?[['Keep ready for next PO','n']]:[]),['Units at risk / month','n'],['Status']];
  const note=kind==='mkt'?'Website and marketplaces ship from the company warehouse, so a product\'s availability is the warehouse\'s for that product. Days of cover and lead time are the warehouse\'s (production lead time). Units at risk uses this channel\'s own sales, so the same product ranks higher where it sells more.'
    :kind==='store'?'Each store holds its own stock. Availability = chance the shelf lasts until the next refill × chance the warehouse can refill it. Lead time is that store\'s delivery time; days of cover is the lower of shelf and warehouse.'
    :'Dark-store stock belongs to the platform. Where you upload their inventory report, availability is shelf × warehouse. Otherwise it is the warehouse\'s readiness for the next purchase order; "Keep ready" is the order size to have on hand.';
  return sub+chart+`<div class="card"><div class="row"><h3>${kind==='mkt'?'Availability by marketplace':kind==='store'?'Availability by store':'Availability by dark-store platform'}</h3><span class="spacer"></span><button class="btn" data-act="expAv">Export CSV</button></div>${pick}
   <p class="small mute">Least available first. ${note}</p>
   ${table(heads,tr,'Nothing to show.')}${show.length>400?'<p class="small mute">First 400 shown.</p>':''}</div>`;
}
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-avt]');if(t){UI.avTab=t.dataset.avt;render();return;}
  const c=e.target.closest('[data-avch]');if(c){UI.avCh[UI.avTab]=c.dataset.avch;render();return;}
  if(e.target.closest('[data-act=expAv]')){const rs=(avRows(UI.avTab)||[]).filter(o=>UI.avCh[UI.avTab]==='All'||o.ch===UI.avCh[UI.avTab]);
    saveCSV('availability_'+UI.avTab+'.csv',[['location','sku','name','class','sells_per_day','position','days_of_cover','lead_time','availability_pct','target_pct','limited_by','units_at_risk_month','status'],...rs.map(o=>[o.ch,o.sku,o.s.name,o.cls,o.d.toFixed(2),Math.round(o.pos),isFinite(o.doc)?o.doc.toFixed(1):'',o.L,(o.a*100).toFixed(1),o.tg,o.lim,Math.round(o.risk),o.st==='red'?'Critical':o.st==='amb'?'Below target':'OK'])]);}
});

document.addEventListener('click',e=>{const b=e.target.closest('[data-lch]');if(b){UI.lch=b.dataset.lch;render();}
  const x=e.target.closest('[data-act=expList]');if(x){const L=listingsFor(UI.lch);saveCSV('listings_'+UI.lch.replace(/\W+/g,'_')+'.csv',[['sku','name','family','class','units_per_month','cm_per_unit','status'],...L.map(o=>[o.sku,o.s.name,o.s.cat||'',o.cls,o.r?o.r.units.toFixed(1):0,o.r?Math.round(o.r.cm):'',o.src])]);}});
document.addEventListener('change',e=>{if(e.target.id==='lq'){UI.lq=e.target.value;render();}});
function applyListings(rows,map){
  const re=/inactive|delist|blocked|suppress|archiv|out of catalog/i;let n=0,bad=0,skip=0;const out=[],seen=new Set(),cc=new Map();
  rows.slice(1).forEach(r=>{const sku=String(r[map.sku]==null?'':r[map.sku]).trim(),raw=String(r[map.channel]==null?'':r[map.channel]).trim();if(!sku||!raw){bad++;return;}
    if(map.status>=0&&re.test(String(r[map.status]))){skip++;return;}
    if(!cc.has(raw))cc.set(raw,resolveChannel(raw));const ch=cc.get(raw),k=sku+'\t'+ch;if(seen.has(k))return;seen.add(k);out.push([sku,ch]);n++;});
  S.listings=out;return `${n} live listings saved${skip?`, ${skip} inactive skipped`:''}${bad?`, ${bad} unreadable`:''}.`;
}


/* ================= FIXES (audit, 23 Nov 2026) ================= */
let canAdmin=true,LOG=[];
const DSLABEL={skus:'SKU master',orders:'Orders',stock:'Stock on hand',prod:'Production log',stockhist:'Stock history',listings:'Listings',channels:'Channel costs and lead times',events:'Sale calendar',override:'Class overrides',vars:'Planning rules',signoff:'Daily sign-off'};
/* #8 past sale-calendar days are left out of normal demand */
function evDays(ch,start,maxDay){const out=[];(S.events||[]).forEach(ev=>{if(ev.ch!=='All'&&ev.ch!==ch)return;const a=parseDay(ev.start),b=parseDay(ev.end);if(a==null||b==null)return;for(let d=Math.max(a,start);d<=Math.min(b,maxDay);d++)out.push(d);});return out;}
/* #9 correlation measured per SKU from daily orders: rho = (Var(total) − Σ var_i) ÷ ((Σ sd_i)² − Σ var_i) */
function measRho(rs,start,maxDay){
  const ds=rs.filter(r=>!r.bulk&&r.d>0),n=maxDay-start+1;if(ds.length<2||n<14)return V.rho;
  const skip=new Set();ds.forEach(r=>{if(r.ex)r.ex.forEach(d=>skip.add(d));});
  const days=[];for(let d=start;d<=maxDay;d++)if(!skip.has(d))days.push(d);const k=days.length;if(k<14)return V.rho;
  const tot=new Array(k).fill(0);let sv=0,ssd=0;
  ds.forEach(r=>{const m=ORD.get(r.key),a=days.map(d=>(m&&m.get(d))||0);
    const mu=a.reduce((x,y)=>x+y,0)/k,v=a.reduce((x,y)=>x+(y-mu)*(y-mu),0)/(k-1);sv+=v;ssd+=Math.sqrt(v);a.forEach((q,i)=>tot[i]+=q);});
  const mt=tot.reduce((x,y)=>x+y,0)/k,vt=tot.reduce((x,y)=>x+(y-mt)*(y-mt),0)/(k-1),den=ssd*ssd-sv;
  return den>0?Math.max(0,Math.min(1,(vt-sv)/den)):V.rho;
}
function fileRange(rows,col){let a=Infinity,b=-Infinity;rows.slice(1).forEach(r=>{const d=parseDay(r[col]);if(d!=null){if(d<a)a=d;if(d>b)b=d;}});return isFinite(a)?[a,b]:null;}
function dropRange(map,r,only){if(!r)return;map.forEach((m,k)=>{if(only&&!only.has(k.split('\t')[1]))return;[...m.keys()].forEach(d=>{if(d>=r[0]&&d<=r[1])m.delete(d);});});}

/* #1 #10 control tower: every selling store item is refilled; A first when short; store stock above its reorder point is credited to the warehouse */
function towerCalc(){
  const st=new Map();S.stock.forEach(s=>st.set(s.sku+'\t'+s.node,s));
  const out={has:S.stock.length>0,nodeRows:[],refill:[],hubTrig:[],short:0,hidden:0,credit:new Map()};
  if(!out.has||!M)return out;
  const bySku=new Map();
  M.nodes.forEach(n=>{
    const s=st.get(n.sku+'\t'+n.ch);if(!s&&n.r.chO.see===0){out.hidden++;return;}
    const on=s?s.onhand:0,tr=s?s.transit:0,pos=on+tr,doc=n.d>0?pos/n.d:Infinity;
    const trigger=pos<=n.rop||doc<V.trigDOC,need=trigger?Math.max(0,Math.ceil(n.up-pos)):0;
    const o={...n,has:!!s,on,tr,pos,doc,trigger,need,give:0};out.nodeRows.push(o);
    out.credit.set(n.sku,(out.credit.get(n.sku)||0)+Math.max(0,pos-n.rop));
    if(!bySku.has(n.sku))bySku.set(n.sku,[]);bySku.get(n.sku).push(o);
  });
  const rk={A:0,'?':0,B:1,C:2,X:3,'0':4};
  bySku.forEach((os,sku)=>{
    const h=M.hub.get(sku),hs=st.get(sku+'\tHub'),on=hs?hs.onhand:0,res=(h?h.direct:0)*V.reserve;let avail=Math.max(0,on-res);
    os.filter(o=>o.need>0).sort((a,b)=>(rk[a.r.cls]-rk[b.r.cls])||a.doc-b.doc).forEach(o=>{o.give=Math.min(o.need,avail);avail-=o.give;o.short=o.need-o.give;});
  });
  out.refill=out.nodeRows.filter(o=>o.need>0);out.short=out.refill.reduce((a,o)=>a+(o.short||0),0);
  M.hub.forEach(h=>{
    if(h.dTot<=0)return;const hs=st.get(h.sku+'\tHub'),on=hs?hs.onhand:0,tr=hs?hs.transit:0,cr=V.storeCredit?(out.credit.get(h.sku)||0):0,pos=on+tr+cr;
    out.hubTrig.push({...h,on,tr,cr,pos,doc:(on+tr)/h.dTot,has:!!hs,trigger:pos<=h.rop,qty:pos<=h.rop?Math.ceil(h.up-pos):0});
  });
  out.hubTrig=out.hubTrig.filter(h=>h.trigger).sort((a,b)=>rk[a.best]-rk[b.best]||a.doc-b.doc);
  return out;
}
function rTower(){
  const head4=head(4,'Control tower: substitute information for inventory','Ch. 4 pp. 85–87, VMI and CPFR p. 94','Daily sell-through plus on-hand and in-transit stock does the work safety stock used to do. Rules: refill a store or dark store when its stock falls to the reorder point or its days of cover fall below the trigger; when the warehouse is short, serve A items first, then the lowest days of cover; move stock only from the warehouse, never between stores. Store stock above its own reorder point counts toward the warehouse position, so the same demand is not covered twice.')+strip('tower');
  if(!M.has)return head4+noData();
  const T=towerCalc();
  if(!T.has)return head4+`<div class="note">The data desk needs to upload a stock file (SKU, location, on hand, in transit) to get the daily lists.</div>`;
  const C=capCalc(),famOf=new Map(S.skus.map(s=>[s.sku,s.cat||'Uncategorised'])),famC=new Map(((C&&C.fams)||[]).map(f=>[f.cat,f]));
  const rr=T.refill.sort((a,b)=>a.doc-b.doc).slice(0,400).map(o=>`<tr>${td(esc(o.sku))}${td(esc(o.s.name),'wrapc')}${td(esc(o.ch))}${td(chip(o.r.cls))}${td(fi(o.on),'n')}${td(fi(o.tr),'n')}${td(f1(o.doc),'n')}${td(fi(o.rop),'n')}${td(fi(o.up),'n')}${td(fi(o.need),'n')}${td(fi(o.give),'n')}${td(o.short>0?`<span class="bad">${fi(o.short)}</span>`:'<span class="ok">0</span>','n')}${td(o.has?'':'<span class="amber">no stock row, assumed 0</span>')}</tr>`);
  const hr=T.hubTrig.slice(0,300).map(h=>{const f=famC.get(famOf.get(h.sku)),left=f?f.com-f.today:NaN;
    return `<tr>${td(esc(h.sku))}${td(esc(h.s.name),'wrapc')}${td(chip(h.best))}${td(fi(h.on),'n')}${td(fi(h.tr),'n')}${td(h.cr?fi(h.cr):'–','n')}${td(f1(h.doc),'n')}${td(fi(h.rop),'n')}${td(fi(h.up),'n')}${td(fi(h.qty),'n')}${td(isFinite(left)?(left<0?`<span class="bad">${fi(left)} over the monthly lock</span>`:fi(left)):'–','n')}</tr>`;});
  const ok=T.nodeRows.filter(o=>!o.trigger).length,over=((C&&C.fams)||[]).filter(f=>f.today>f.com);
  return head4+`<div class="kpis"><div class="kpi"><b>${T.refill.length}</b><span>store and dark-store refills due</span></div><div class="kpi"><b>${fi(T.short)}</b><span>units the warehouse cannot cover</span></div><div class="kpi"><b>${T.hubTrig.length}</b><span>warehouse orders due (make or buy)</span></div><div class="kpi"><b>${ok}</b><span>store items above trigger</span></div></div>${T.hidden?`<div class="note">${T.hidden} quick-commerce positions are left out because their stock is not visible to us and no stock row was uploaded.</div>`:''}
  ${over.length?`<div class="note"><b>Today's make list exceeds this month's production lock for ${over.map(f=>esc(f.cat)).join(', ')}.</b> Check factory capacity before approving, or move the extra into the "decide later" share.</div>`:''}
  <div class="card"><div class="row"><h3>Refill from warehouse today</h3><span class="spacer"></span><button class="btn" data-act="expRefill">Export CSV</button></div>${table([['SKU'],['Name'],['Store / dark store'],['Class'],['On hand','n'],['In transit','n'],['Days of cover','n'],['Reorder point','n'],['Order-up-to','n'],['Needed','n'],['Send from warehouse','n'],['Shortfall','n'],['']],rr,'No store is at or below its trigger.')}</div>
  <div class="card"><h3>Warehouse: make or buy (A SKUs first)</h3>${table([['SKU'],['Name'],['Best class'],['On hand','n'],['In transit','n'],['Store stock credited','n'],['Days of cover','n'],['Reorder point','n'],['Order-up-to','n'],['Order qty','n'],['Family monthly lock left','n']],hr,'No warehouse position is at or below its reorder point.')}
  <p class="mute small">"Family monthly lock left" = this month's lock-now quantity for the product family minus everything on today's make list for that family. Negative means today's list alone is bigger than the monthly plan.</p></div>`;
}

/* #4 sale check: extra units added up per SKU across channels, against free stock after normal sales until the event ends */
function evCalc(ev){
  const s=parseDay(ev.start),e=parseDay(ev.end),days=s!=null&&e!=null?Math.max(1,e-s+1):0,today=Math.floor(Date.now()/864e5),lead=s!=null?Math.max(0,s-today):0;
  const st=new Map();S.stock.forEach(x=>{if(x.node==='Hub')st.set(x.sku,x);});
  const inScope=M.rows.filter(r=>(ev.ch==='All'||r.ch===ev.ch)&&r.ok&&r.units>0&&(ev.scope==='all'||(ev.scope==='AB'?['A','B'].includes(r.cls):r.cls==='A')));
  let base=0,inc=0,cmBase=0,cmPromo=0;const detail=[],bySku=new Map();
  inScope.forEach(r=>{const b=r.d*days,i=b*ev.uplift/100,cmp=econ(r.s,r.chO,ev.disc).cm;base+=b;inc+=i;cmBase+=b*r.cm;cmPromo+=(b+i)*cmp;detail.push({r,i,cmp});bySku.set(r.sku,(bySku.get(r.sku)||0)+i);});
  let shortU=0,shortS=0;const free=new Map(),sh=new Map();
  bySku.forEach((ex,sku)=>{const h=M.hub.get(sku),x=st.get(sku),pos=x?x.onhand+x.transit:0,normal=h?h.dTot*(lead+days):0,f=h?Math.max(0,pos-h.ss-normal):0,s2=Math.max(0,ex-f);
    free.set(sku,f);sh.set(sku,s2);if(S.stock.length&&s2>0){shortU+=s2;shortS++;}});
  detail.forEach(d=>{const ex=bySku.get(d.r.sku)||1;d.free=free.get(d.r.sku);d.sh=(sh.get(d.r.sku)||0)*d.i/ex;});
  return {days,lead,n:inScope.length,skus:bySku.size,base,inc,delta:cmPromo-cmBase,cmBase,cmPromo,shortU,shortS,detail,hasStock:S.stock.length>0};
}

/* #5 #6 #11 monthly plan nets off stock, uses smoothed quick-commerce demand, and reconciles with today's make list */
function capCalc(){
  if(!M||!M.has)return null;
  const skuCat=new Map(S.skus.map(s=>[s.sku,s.cat||'Uncategorised'])),B=6,cats=new Map();
  const full=Math.min(B,Math.floor((M.maxDay-M.minDay+1)/30));if(full<1)return {full:0,fams:[]};
  ORD.forEach((m,key)=>{const sku=key.split('\t')[0],cat=skuCat.get(sku)||'Uncategorised';if(!cats.has(cat))cats.set(cat,new Array(B).fill(0));const a=cats.get(cat),r=M.byKey.get(key);
    if(r&&r.bulk){for(let b=0;b<full;b++)a[b]+=r.d*30;return;}
    const ch=key.split('\t')[1],ex=new Set([...(r&&r.ex?r.ex:[]),...evDays(ch,M.maxDay-B*30+1,M.maxDay)]),sum=new Array(B).fill(0),off=new Array(B).fill(0);
    ex.forEach(d=>{const b=Math.floor((M.maxDay-d)/30);if(b>=0&&b<B)off[b]++;});
    m.forEach((q,d)=>{const b=Math.floor((M.maxDay-d)/30);if(b<B&&!ex.has(d))sum[b]+=q;});
    for(let b=0;b<B;b++)a[b]+=off[b]<=20?sum[b]*30/(30-off[b]):sum[b];});
  const n=Math.min(V.fMonths,full),T=towerCalc(),trig=new Map(T.hubTrig.map(h=>[h.sku,h])),st=new Map();S.stock.forEach(x=>{if(x.node==='Hub')st.set(x.sku,x);});
  const fams=[...cats].map(([cat,a])=>{const hist=a.slice(0,full),fc=hist.slice(0,n).reduce((x,y)=>x+y,0)/n*(1+V.growth/100);
    const hs=[...M.hub.values()].filter(h=>(skuCat.get(h.sku)||'Uncategorised')===cat&&h.dTot>0);
    const pos=h=>{const s=st.get(h.sku);return (s?s.onhand+s.transit:0)+(V.storeCredit?(T.credit.get(h.sku)||0):0);};
    const stock=hs.reduce((x,h)=>x+pos(h),0),target=hs.reduce((x,h)=>x+h.ss+h.dTot*V.hubCycle/2,0);
    const net=S.stock.length?Math.max(0,fc+target-stock):fc,com=net*V.commit/100,late=net-com,today=hs.reduce((x,h)=>x+((trig.get(h.sku)||{qty:0}).qty),0);
    return {cat,hist,fc,stock,target,net,com,late,today,hs,pos};}).sort((a,b)=>b.fc-a.fc);
  return {full,n,fams};
}
function rCapacity(){
  const head6=head(6,'Forecast only for capacity, execute against demand','Ch. 4 pp. 89–91','Plan production at product-family level monthly. Net off the stock you already hold, lock only part of what is left, and decide the SKU mix late from what the warehouse actually runs short of.')+strip('capacity');
  if(!M.has)return head6+noData();
  const C=capCalc();if(!C||!C.full)return head6+`<div class="note">Needs at least 30 days of orders to form one monthly bucket.</div>`;
  const trs=C.fams.map(f=>`<tr>${td(esc(f.cat))}${f.hist.slice().reverse().map(x=>td(fi(x),'n')).join('')}${td(fi(f.fc),'n')}${td(S.stock.length?fi(f.stock):'–','n')}${td(S.stock.length?fi(f.target):'–','n')}${td('<b>'+fi(f.net)+'</b>','n')}${td(fi(f.com),'n')}${td(fi(f.late),'n')}${td(f.today?fi(f.today):'–','n')}${td(f.today>f.com?'<span class="bad">Make list above lock</span>':f.net===0&&S.stock.length?'<span class="amber">Enough stock: pause</span>':'')}</tr>`);
  const heads=[['Product family'],...Array.from({length:C.full},(_,i)=>[i===0?'Latest 30d':`${i*30}–${i*30+30}d ago`,'n']).reverse(),['Demand next 30d','n'],['Stock now','n'],['Target end stock','n'],['Net to make','n'],['Lock now','n'],['Decide later','n'],["On today's make list",'n'],['']];
  const mixRows=[];
  C.fams.forEach(f=>{const w=f.hs.map(h=>({h,pos:f.pos(h),gap:S.stock.length?Math.max(0,h.up-f.pos(h)):h.dTot}));const tot=w.reduce((a,x)=>a+x.gap,0);
    w.forEach(x=>{const u=tot>0?f.late*x.gap/tot:0;if(u>=1)mixRows.push({f,x,u});});});
  mixRows.sort((a,b)=>b.u-a.u);
  const mr=mixRows.slice(0,60).map(({f,x,u})=>`<tr>${td(esc(f.cat))}${td(esc(x.h.sku))}${td(esc(x.h.s.name),'wrapc')}${td(chip(x.h.best))}${td(fi(x.pos),'n')}${td(fi(x.h.up),'n')}${td(fi(u),'n')}</tr>`);
  return head6+`<div class="card"><h3>Monthly plan by product family (30-day buckets ending ${dayStr(M.maxDay)})</h3>${table(heads,trs)}
   <p class="mute small">Net to make = demand next 30 days + target end stock (safety stock + half a batch) − stock now (warehouse + in transit${V.storeCredit?' + store stock above reorder point':''}). Demand = average of the last ${C.n} buckets × (1 + ${V.growth}%). Quick-commerce purchase orders are replaced by their smoothed daily rate so platform bulk buying is not counted twice.</p></div>
  <div class="card"><div class="row"><h3>Late SKU mix for the decide-later share</h3><span class="spacer"></span><button class="btn" data-act="expMix">Export CSV</button></div>
   <p class="mute small">Decide-later units go to SKUs by how far each sits below its order-up-to level. SKUs above their maximum get nothing. Top 60 shown.</p>
   ${table([['Family'],['SKU'],['Name'],['Best class'],['Warehouse position','n'],['Order-up-to','n'],['Units to make','n']],mr,'Nothing to allocate.')}</div>`;
}
function chCapacity(){
  const C=capCalc();if(!C||!C.full)return '';
  return chartCard('Next 30 days of production by family',`net of stock held; lock ${V.commit}% now; tick = demand forecast`,bars(C.fams.map(f=>({l:f.cat,segs:[[f.com,COL.acc,`Lock now: ${fi(f.com)}`],[f.late,'var(--accent-2)',`Decide later: ${fi(f.late)}`]],m:f.fc,mt:`Demand next 30 days: ${fi(f.fc)}`,txt:fi(f.net)})),{aria:'Capacity plan'})+
   lg([[COL.acc,'Lock with production now'],['var(--accent-2)','Decide later by SKU'],['var(--ink)','Demand forecast']])+`<p class="small mute">A bar shorter than its tick means stock on hand already covers part of next month.</p>`);
}

/* #12 change log */
function describe(name,val,prev,meta){
  try{
    if(name==='vars'&&prev){const p=JSON.parse(prev);return VARS.filter(v=>p[v.k]!==val[v.k]).map(v=>`${v.l}: ${p[v.k]} → ${val[v.k]}`).join('; ')||'no change';}
    if(name==='channels'&&prev){const p=new Map(JSON.parse(prev).map(c=>[c.name,JSON.stringify(c)]));const ch=val.filter(c=>p.get(c.name)!==JSON.stringify(c)).map(c=>c.name);return ch.length?'Changed: '+ch.slice(0,6).join(', ')+(ch.length>6?'…':''):'';}
  }catch(e){}
  return `${fi(meta.rows)} ${name==='orders'||name==='prod'||name==='stockhist'?'series':'rows'}${meta.file?' from '+meta.file:''}`;
}
async function logChange(name,detail,at){
  if(!DB)return;const items=(LOG||[]).slice(-79);items.push({at,by:myId||'',what:name,detail:String(detail||'').slice(0,300)});
  LOG=items;try{await DB.collection('log').doc('recent').set({items});}catch(e){}
}
function logCard(filter){
  const items=(LOG||[]).filter(x=>!filter||filter.includes(x.what)).slice().reverse().slice(0,25);
  if(SRC!=='shared')return '';
  return `<div class="card"><h3>Recent changes</h3>${items.length?table([['When'],['Who'],['What'],['Detail']],items.map(x=>`<tr>${td(esc(new Date(x.at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})))}${td(esc(NAMES[x.by]||(x.by===myId?'You':'Someone')))}${td(esc(DSLABEL[x.what]||x.what))}${td(esc(x.detail),'wrapc')}</tr>`)):'<p class="mute">No changes recorded yet.</p>'}</div>`;
}

/* #15 daily run sign-off */
const RUN=[['stock','Stock file counted and uploaded','10:00'],['make','Make list approved','11:00'],['dispatch','Store dispatch released','15:00']];
function runCard(){
  const today=dayStr(Math.floor(Date.now()/864e5)),so=(S.signoff&&S.signoff.date===today)?S.signoff:{};
  const st=HDR.stock&&S.stockAt===Math.floor(Date.now()/864e5)?{by:HDR.stock.by,at:HDR.stock.at}:(S.stockAt===Math.floor(Date.now()/864e5)&&SRC!=='shared'?{by:'',at:new Date().toISOString()}:null);
  const step=([k,l,dl])=>{const d=k==='stock'?st:so[k],late=(at)=>{const t=new Date(at),[hh,mm]=dl.split(':');return t.getHours()*60+t.getMinutes()>(+hh)*60+(+mm);};
    const nowLate=(()=>{const t=new Date(),[hh,mm]=dl.split(':');return t.getHours()*60+t.getMinutes()>(+hh)*60+(+mm);})();
    return `<li><span class="dot ${d?(late(d.at)?'amb':'grn'):nowLate?'red':''}"></span><span><b>${l}</b> <span class="mute small">by ${dl}</span><br><span class="small">${d?`Done ${new Date(d.at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}${d.by?' by '+esc(NAMES[d.by]||(d.by===myId?'you':'someone')):''}${late(d.at)?' · <span class="amber">late</span>':''}`:nowLate?'<span class="bad">Overdue</span>':'<span class="mute">Not yet</span>'}</span></span>${k!=='stock'&&!d?`<button class="btn pri" data-act="sign" data-k="${k}">Mark done</button>`:''}</li>`;};
  return `<div class="card"><div class="row"><h3>Today's run</h3><span class="mute small">${esc(today)} · each step has an owner and a cut-off</span></div><ul class="att run">${RUN.map(step).join('')}</ul></div>`;
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act=sign]');if(!b)return;
  const today=dayStr(Math.floor(Date.now()/864e5)),so=(S.signoff&&S.signoff.date===today)?{...S.signoff}:{date:today};
  so[b.dataset.k]={by:myId||'',at:new Date().toISOString()};S.signoff=so;refresh();toast('Recorded.');});

/* #14 #2 setup gaps shown to both teams */
function setupGaps(){
  const g=[],used=new Set(M.rows.filter(r=>r.units>0).map(r=>r.ch));
  const unconf=S.channels.filter(c=>used.has(c.name)&&!c.conf);if(unconf.length)g.push(`Cost terms for ${unconf.length} of ${used.size} selling channels are placeholders (${unconf.slice(0,5).map(c=>esc(c.name)).join(', ')}${unconf.length>5?'…':''}). Classes, margins and "loses money" flags are estimates until finance confirms them under Channel costs.`);
  const q=new Set(M.rows.filter(r=>r.cls==='?').map(r=>r.sku));if(q.size)g.push(`${q.size} selling SKUs have no MRP or COGS. They are planned at the A target (${V.tA}%) until costs are added, so they are never under-stocked by default.`);
  if(V.hubLsd===2&&!S.lsdSet)g.push('Production lead-time swing is a placeholder (2 days). Record promised vs actual batch dates and set the real figure under Planning rules.');
  return g;
}

document.addEventListener('click',e=>{
  const g=e.target.closest('[data-go]');if(g){go(g.dataset.go);return;}
  const v=e.target.closest('[data-view]');if(v){UI.view=v.dataset.view;render();return;}
  const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act,k=b.dataset.k;
  if(a==='closeModal')$('#overlay').innerHTML='';
  else if(a==='pick')pickFile(k);
  else if(a==='tpl')saveCSV(k+'_template.csv',TPL[k]);
  else if(a==='addSku'){S.skus.unshift({sku:'NEW-'+(S.skus.length+1),name:'',cat:'Uncategorised',mrp:NaN,cogs:NaN});refresh();}
  else if(a==='delSku'){const s=S.skus[+b.dataset.i];if(s){S.skus.splice(+b.dataset.i,1);refresh();}}
  else if(a==='addChannel'){S.channels.push(withDef({name:'New channel',type:'Other',fee:15,ret:8,disc:20,L:3,node:1}));refresh();}
  else if(a==='clearOrders'){ORD=new Map();refresh();}
  else if(a==='clearStock'){S.stock=[];refresh();}
  else if(a==='clearProd'){PROD=new Map();refresh();}
  else if(a==='clearStk'){STK=new Map();refresh();}
  else if(a==='expProd'){const P=prodCalc();saveCSV('production_and_stock.csv',[['sku','name','produced_per_day','demand_per_day','net_per_day','hub_on_hand','hub_in_transit','other_on_hand','total_units','days_of_cover'],...P.rows.map(o=>[o.sku,o.s.name,o.p.toFixed(2),o.d.toFixed(2),o.net.toFixed(2),Math.round(o.hubOn),Math.round(o.hubTr),Math.round(o.oth),Math.round(o.total),isFinite(o.doc)?o.doc.toFixed(1):''])]);}
  else if(a==='clearDemo'){S.skus=[];S.stock=[];S.events=[];S.override={};ORD=new Map();PROD=new Map();STK=new Map();S.demo=false;S.channels=defChannels();refresh();toast('Cleared. Upload your SKU master first, then orders and stock.');go('data');}
  else if(a==='demo'){loadDemo();refresh();toast('Demo data loaded. It is invented.');}
  else if(a==='addEv'){const id=Math.max(0,...S.events.map(x=>x.id))+1,t=Math.floor(Date.now()/864e5)+7;S.events.push({id,name:'New event',ch:'Amazon',start:dayStr(t),end:dayStr(t+3),uplift:50,disc:10,scope:'A'});refresh();}
  else if(a==='delEv'){S.events=S.events.filter(x=>x.id!==+b.dataset.id);refresh();}
  else if(a==='selEv'){UI.ev=+b.dataset.id;render();}
  else if(a==='expSkus')saveCSV('skus.csv',[['sku','name','category','mrp','cogs'],...S.skus.map(s=>[s.sku,s.name,s.cat,isFinite(s.mrp)?s.mrp:'',isFinite(s.cogs)?s.cogs:''])]);
  else if(a==='expSeg')saveCSV('segmentation.csv',[['sku','name','channel','price','cm_per_unit','cm_pct','units_per_month','contribution_per_month','class','target_availability','placement'],...filterRows().map(r=>[r.sku,r.s.name,r.ch,r.price,r.cm,r.cmPct,r.units,r.contrib,r.cls,r.target||'',r.place])]);
  else if(a==='expRefill'){const T=towerCalc();saveCSV('refill_today.csv',[['sku','node','on_hand','in_transit','days_of_cover','reorder_point','order_up_to','needed','send_from_hub','shortfall'],...T.refill.map(o=>[o.sku,o.ch,o.on,o.tr,o.doc,Math.round(o.rop),Math.round(o.up),o.need,o.give,o.short])]);}
  else if(a==='expAvail'){const A=availCalc();saveCSV('availability_now.csv',[['level','sku','location','position','target_pct','availability_pct','units_to_target'],...A.hub.map(o=>['warehouse',o.sku,'Hub',Math.round(o.pos),o.tg,(o.a*100).toFixed(1),o.gapU]),...A.nodes.map(o=>['node',o.sku,o.ch,Math.round(o.pos),o.tg,(o.e*100).toFixed(1),o.gapU])]);}
  else if(a==='expStores'){const D=storeCalc();saveCSV('stores_inventory_reorder.csv',[['store','city','lead_time_days','units_per_month','on_hand','in_transit','stock_at_cogs','days_of_cover','reorder_point_units','items_at_or_below_rop','units_to_refill'],...D.map(o=>[o.s.ch,o.s.city,o.c.L,Math.round(o.units),o.on,o.tr,Math.round(o.val),isFinite(o.doc)&&o.hasStock?o.doc.toFixed(1):'',Math.round(o.ropSum),o.below,o.need])]);}
  else if(a==='expMix'){const t=[...document.querySelectorAll('#main table.t')].pop();if(t)saveCSV('late_mix.csv',[...t.rows].map(r=>[...r.cells].map(c=>c.textContent)));}
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.v!==undefined){const v=VARS.find(x=>x.k===t.dataset.v);let x=v.type==='text'?t.value:Number(t.value);
    if(v.type!=='text'){if(!isFinite(x)){render();return;}if(v.min!=null&&x<v.min)x=v.min;if(v.max!=null&&x>v.max)x=v.max;}
    V[v.k]=x;refresh();}
  else if(t.dataset.ch){const [i,f]=t.dataset.ch.split(':'),c=S.channels[+i];
    if(f==='name'){const old=c.name,nn=t.value.trim()||old;if(nn!==old){ORD=new Map([...ORD].map(([k,m])=>{const [s,ch]=k.split('\t');return [ch===old?s+'\t'+nn:k,m];}));S.stock.forEach(s=>{if(s.node===old)s.node=nn;});S.events.forEach(ev=>{if(ev.ch===old)ev.ch=nn;});c.name=nn;}}
    else if(f==='node'||f==='see'||f==='conf')c[f]=+t.value;else if(f==='demand')c.demand=t.value;
    else if(f==='L'&&c.type==='Quick commerce')toast('Dark-store delivery time is one average. Change it under Variables.');
    else c[f]=Number(t.value)||0;refresh();}
  else if(t.dataset.sku){const [i,f]=t.dataset.sku.split(':'),s=S.skus[+i];
    if(f==='mrp'||f==='cogs')s[f]=t.value===''?NaN:Number(t.value);
    else if(f==='sku'){const old=s.sku,nn=t.value.trim();if(nn&&nn!==old){ORD=new Map([...ORD].map(([k,m])=>{const [a,b]=k.split('\t');return [a===old?nn+'\t'+b:k,m];}));S.stock.forEach(x=>{if(x.sku===old)x.sku=nn;});s.sku=nn;}}
    else s[f]=t.value;refresh();}
  else if(t.dataset.ov!==undefined){if(t.value)S.override[t.dataset.ov]=t.value;else delete S.override[t.dataset.ov];refresh();}
  else if(t.dataset.f){UI[t.dataset.f]=t.value;render();}
  else if(t.dataset.ev){const [id,f]=t.dataset.ev.split(':'),ev=S.events.find(x=>x.id===+id);
    ev[f]=['uplift','disc'].includes(f)?(Number(t.value)||0):t.value;UI.ev=ev.id;refresh();}
  else if(t.id==='q'){UI.q=t.value;render();}
  else if(t.id==='skuQ'){UI.skuQ=t.value;render();}
});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  if(a==='migrate')migrateLocal();
  else if(a==='expExcess'){const E=excessCalc();saveCSV('too_much_stock.csv',[['sku','name','location','sold_per_day','position','order_up_to','excess_units','excess_cogs','why'],...E.rows.map(o=>[o.sku,o.s.name||'',o.loc,o.d.toFixed(2),Math.round(o.pos),Math.round(o.up),Math.round(o.ex),Math.round(o.v),o.why])]);}
  else if(a==='clr'){if(b.dataset.armed){const k=b.dataset.k;if(k==='orders')ORD=new Map();else if(k==='prod')PROD=new Map();else if(k==='stockhist')STK=new Map();else if(k==='listings')S.listings=[];else if(k==='stock'){S.stock=[];S.stockAt=null;}refresh();toast('Cleared.');}
    else{b.dataset.armed='1';b.textContent=SRC==='shared'?'Click again: clears it for everyone':'Click again to clear';}}
});
['dragover','dragleave','drop'].forEach(ev=>document.addEventListener(ev,e=>{
  const d=e.target.closest&&e.target.closest('[data-drop]');if(!d)return;e.preventDefault();
  d.classList.toggle('over',ev==='dragover');
  if(ev==='drop'&&e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0],d.dataset.drop);
}));

localReal=(()=>{try{const j=JSON.parse(localStorage.getItem(KEY)||'null');return !!(j&&j.S&&!j.S.demo&&(j.S.skus||[]).length);}catch(e){return false;}})();
if(!load())loadDemo();
M=compute();
{let t=location.hash.slice(1);t=ALIAS[t]||t;if(ALLTABS.includes(t))UI.tab=t;}
render();
(async()=>{
  const c=window.claude;if(!c||!c.use)return;
  const [db,user,dl]=await Promise.all([c.use('db'),c.use('user'),c.use('downloads')]);DB=db;USER=user;DL=dl;
  if(!DB){render();return;}
  try{myId=user?await user.id():null;const cw=user?await user.can('data.write'):null;canWrite=cw!==false;canAdmin=user&&user.canEdit?(await user.canEdit())!==false:true;}catch(e){}
  DB.doc('log/recent').onSnapshot(sn=>{LOG=sn.exists?((sn.data()||{}).items||[]):[];const ids=LOG.map(x=>x.by).filter(Boolean);if(USER&&ids.length)USER.profiles([...new Set(ids)].filter(i=>!(i in NAMES))).then(ps=>{Object.keys(ps||{}).forEach(i=>NAMES[i]=ps[i].name||'someone');}).catch(()=>{});if(viewOf(UI.tab)==='desk'||UI.tab==='today')render();},()=>{});
  const timer=setTimeout(()=>{if(SRC==='local')toast('Shared data is slow to load. Showing what this browser has.');},10000);
  DB.collection('ds').onSnapshot(sn=>{if(!sn.metadata.fromCache)clearTimeout(timer);onShared(sn);},()=>{clearTimeout(timer);toast('Shared data stopped updating. Reload to reconnect.');});
})();
