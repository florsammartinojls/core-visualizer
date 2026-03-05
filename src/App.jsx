import { useState, useMemo, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ComposedChart } from "recharts";

const API = "https://script.google.com/macros/s/AKfycbzZN4yMYYUQTzMW3rC2uwC1A0vh40XKDt5wph3XQO0O7RfzKHK-PNPzzmIh4H-X_lmV/exec";

const sanitize=(obj)=>{if(!obj||typeof obj!=='object')return obj;if(Array.isArray(obj))return obj.map(sanitize);const o={};for(const k in obj){const v=obj[k];if(v===null||v===undefined)o[k]="";else if(typeof v==='object'&&!Array.isArray(v)){try{if(v instanceof Date)o[k]=v.toISOString();else o[k]=JSON.stringify(v);}catch(e){o[k]="";}}else if(Array.isArray(v))o[k]=v.map(sanitize);else o[k]=v;}return o;};

const jsonpFetch=(url)=>{
  return new Promise((resolve,reject)=>{
    const cb='cb_'+Math.random().toString(36).slice(2);
    const timeout=setTimeout(()=>{reject(new Error("Timeout"));delete window[cb];},120000);
    window[cb]=(data)=>{clearTimeout(timeout);delete window[cb];resolve(data);};
    const s=document.createElement('script');
    s.src=url+(url.includes('?')?'&':'?')+'callback='+cb;
    s.onerror=()=>{clearTimeout(timeout);delete window[cb];reject(new Error("Network error"));};
    document.head.appendChild(s);
    s.onload=()=>{try{document.head.removeChild(s);}catch(e){}};
  });
};

const fmt = (n, d=0) => { if (n == null || n === "") return "—"; const v = Number(n); if (isNaN(v)) return "—"; return v.toLocaleString("en-US", {minimumFractionDigits:d, maximumFractionDigits:d}); };
const fmtD = (n) => fmt(n, 0);
const fmtM = (n) => "$" + fmt(n, 0);
const fmtP = (n) => "$" + fmt(n, 2);
const safe = (v) => { if (v == null) return ""; if (typeof v === "object") { try { return v instanceof Date ? v.toISOString().slice(0,10) : JSON.stringify(v); } catch(e) { return ""; } } return String(v); };
function docColor(doc, lt, buf) { if (doc <= lt) return "#ef4444"; if (doc <= lt + (buf||14)) return "#f59e0b"; return "#22c55e"; }
function statusLabel(doc, lt, buf) { if (doc <= lt) return "critical"; if (doc <= lt + (buf||14)) return "warning"; return "healthy"; }
function StatusDot({status}) { const c = status === "critical" ? "bg-red-500" : status === "warning" ? "bg-yellow-500" : "bg-green-500"; return <span className={`inline-block w-2.5 h-2.5 rounded-full ${c}`}/>; }
function trend(d7, dsr) { if (!dsr) return "—"; const p = ((d7-dsr)/dsr*100); if (p>5) return <span className="text-green-400">{"▲"}{p.toFixed(0)}{"%"}</span>; if (p<-5) return <span className="text-red-400">{"▼"}{Math.abs(p).toFixed(0)}{"%"}</span>; return <span className="text-gray-400">{"●"}{p.toFixed(0)}{"%"}</span>; }
function InfoTip({text}) { const [o,setO]=useState(false); return <span className="relative inline-block ml-1"><button onClick={()=>setO(!o)} className="text-gray-500 hover:text-gray-300 text-xs">ⓘ</button>{o&&<div className="absolute z-50 bg-gray-800 text-xs text-gray-200 p-2 rounded shadow-lg w-48 -left-20 top-5 border border-gray-600" onClick={()=>setO(false)}>{text}</div>}</span>; }
function SortTh({label,field,sort,setSort,info,className=""}) { const a=sort.field===field; const ar=a?(sort.dir==="asc"?" ↑":" ↓"):""; return <th className={`px-2 py-1.5 text-left text-xs font-medium text-gray-400 cursor-pointer hover:text-white select-none whitespace-nowrap ${className}`} onClick={()=>setSort({field,dir:a&&sort.dir==="desc"?"asc":"desc"})}>{label}{ar}{info&&<InfoTip text={info}/>}</th>; }
function Spinner({msg}) { return <div className="flex flex-col items-center justify-center h-64 gap-3"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/><p className="text-gray-400 text-sm">{msg||"Loading..."}</p></div>; }

// ═══ TAB 1: PURCHASING ═══
function PurchasingTab({cores,bundles,vendors,sales,fees,filter,onCoreClick}) {
  const [view,setView]=useState("core");
  const [sort,setSort]=useState({field:"doc",dir:"asc"});
  const [venFilter,setVenFilter]=useState("");
  const [statusFilter,setStatusFilter]=useState("");
  const [targetDoc,setTargetDoc]=useState(90);
  const [search,setSearch]=useState("");
  const venMap=useMemo(()=>{const m={};vendors.forEach(v=>m[v.name]=v);return m;},[vendors]);
  const salesMap=useMemo(()=>{const m={};sales.forEach(s=>m[s.j]=s);return m;},[sales]);
  const coreSales=useMemo(()=>{const m={};cores.forEach(c=>{const jl=c.jlsList?c.jlsList.split(",").map(s=>s.trim()):[];let ltR=0,ltP=0,tyR=0,tyP=0,lyR=0,lyP=0;jl.forEach(j=>{const s=salesMap[j];if(s){ltR+=s.ltR;ltP+=s.ltP;tyR+=s.tyR;tyP+=s.tyP;lyR+=s.lyR;lyP+=s.lyP;}});m[c.id]={ltR,ltP,tyR,tyP,lyR,lyP};});return m;},[cores,salesMap]);

  const processed=useMemo(()=>{
    return cores.map(c=>{
      const v=venMap[c.ven]||{};const lt=v.lt||45;const st=statusLabel(c.doc,lt,c.buf);
      const allIn=c.raw+c.inb+c.pp+c.jfn+c.pq+c.ji+c.fba;const cs=coreSales[c.id]||{};
      const need=Math.max(0,Math.ceil((targetDoc-c.doc)*c.dsr));const needCost=need*c.cost;
      const docAfter=c.dsr>0?c.doc+(need/c.dsr):c.doc;
      return {...c,lt,st,allIn,need,needCost,docAfter,...cs};
    }).filter(c=>{
      const isActive=c.active==="Yes";const isIgnored=c.ignoreUntil&&new Date(c.ignoreUntil)>new Date();const isVisible=c.visible==="Yes";
      let show=false;
      if(filter.active&&isActive&&!isIgnored)show=true;
      if(filter.ignored&&isIgnored)show=true;
      if(filter.visible&&isVisible&&!isActive&&!isIgnored)show=true;
      if(filter.active&&filter.visible&&(isActive||isVisible)&&!isIgnored)show=true;
      if(!show)return false;
      if(venFilter&&c.ven!==venFilter)return false;
      if(statusFilter&&c.st!==statusFilter)return false;
      if(search&&!c.id.toLowerCase().includes(search.toLowerCase())&&!c.ti.toLowerCase().includes(search.toLowerCase()))return false;
      return true;
    });
  },[cores,venMap,coreSales,filter,venFilter,statusFilter,targetDoc,search]);

  const sorted=useMemo(()=>{const s=[...processed];const dir=sort.dir==="asc"?1:-1;const pri={critical:0,warning:1,healthy:2};s.sort((a,b)=>{let av=a[sort.field],bv=b[sort.field];if(sort.field==="st"){av=pri[av];bv=pri[bv];}if(typeof av==="string")return av.localeCompare(bv)*dir;return((av||0)-(bv||0))*dir;});return s;},[processed,sort]);
  const counts=useMemo(()=>{let cr=0,wa=0,he=0;processed.forEach(c=>{if(c.st==="critical")cr++;else if(c.st==="warning")wa++;else he++;});return{cr,wa,he};},[processed]);
  const uniqueVens=useMemo(()=>[...new Set(cores.map(c=>c.ven).filter(Boolean))].sort(),[cores]);
  const vendorGroups=useMemo(()=>{if(view!=="vendor")return[];const g={};sorted.forEach(c=>{if(!g[c.ven])g[c.ven]={vendor:venMap[c.ven]||{name:c.ven},cores:[],totalNeed:0};g[c.ven].cores.push(c);g[c.ven].totalNeed+=c.needCost;});return Object.values(g).sort((a,b)=>b.totalNeed-a.totalNeed);},[sorted,view,venMap]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-gray-800 rounded-lg overflow-hidden">
          <button className={`px-3 py-1.5 text-xs font-medium ${view==="core"?"bg-blue-600 text-white":"text-gray-400 hover:text-white"}`} onClick={()=>setView("core")}>By Core</button>
          <button className={`px-3 py-1.5 text-xs font-medium ${view==="vendor"?"bg-blue-600 text-white":"text-gray-400 hover:text-white"}`} onClick={()=>setView("vendor")}>By Vendor</button>
        </div>
        <input className="bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-700 w-44" placeholder="Search core/title..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-700" value={venFilter} onChange={e=>setVenFilter(e.target.value)}>
          <option value="">All Vendors</option>{uniqueVens.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
        <select className="bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-700" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">All Status</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="healthy">Healthy</option>
        </select>
        <div className="flex items-center gap-1 text-xs text-gray-400"><span>Target DOC:</span><input type="number" className="bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-700 w-16" value={targetDoc} onChange={e=>setTargetDoc(Number(e.target.value)||90)}/></div>
        <div className="ml-auto flex gap-2 text-xs">
          <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded">{counts.cr} Crit</span>
          <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">{counts.wa} Warn</span>
          <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded">{counts.he} OK</span>
        </div>
      </div>

      {view==="core"&&(
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-xs">
            <thead className="bg-gray-800/80"><tr>
              <SortTh label="" field="st" sort={sort} setSort={setSort}/>
              <SortTh label="Core ID" field="id" sort={sort} setSort={setSort}/>
              <SortTh label="Vendor" field="ven" sort={sort} setSort={setSort}/>
              <SortTh label="Title" field="ti" sort={sort} setSort={setSort}/>
              <SortTh label="C.DSR" field="dsr" sort={sort} setSort={setSort} info="Complete Daily Sales Rate"/>
              <SortTh label="7D DSR" field="d7" sort={sort} setSort={setSort} info="7-day average DSR"/>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-400">Trend</th>
              <SortTh label="DOC" field="doc" sort={sort} setSort={setSort} info="Days of Coverage"/>
              <SortTh label="All-In Own" field="allIn" sort={sort} setSort={setSort} info="Raw+Inb+PP+JFN+PQ+JI+FBA"/>
              <th className="px-2 py-1.5 text-gray-600">│</th>
              <SortTh label="LT Rev" field="ltR" sort={sort} setSort={setSort}/>
              <SortTh label="LT Profit" field="ltP" sort={sort} setSort={setSort}/>
              <SortTh label="TY Rev" field="tyR" sort={sort} setSort={setSort}/>
              <SortTh label="TY Profit" field="tyP" sort={sort} setSort={setSort}/>
              <th className="px-2 py-1.5 text-gray-600">│</th>
              <SortTh label="Need $" field="needCost" sort={sort} setSort={setSort} info="Cost to reach target DOC"/>
              <SortTh label="DOC After" field="docAfter" sort={sort} setSort={setSort}/>
            </tr></thead>
            <tbody className="divide-y divide-gray-800/50">
              {sorted.map(c=>(
                <tr key={c.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-2 py-1.5"><StatusDot status={c.st}/></td>
                  <td className="px-2 py-1.5 font-mono text-blue-400 cursor-pointer hover:text-blue-300 hover:underline" onClick={()=>onCoreClick&&onCoreClick(c.id)}>{c.id}</td>
                  <td className="px-2 py-1.5 text-gray-300 max-w-[120px] truncate">{c.ven}</td>
                  <td className="px-2 py-1.5 text-gray-200 max-w-[200px] truncate">{c.ti}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(c.dsr,1)}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(c.d7,1)}</td>
                  <td className="px-2 py-1.5 text-right">{trend(c.d7,c.dsr)}</td>
                  <td className="px-2 py-1.5 text-right font-medium" style={{color:docColor(c.doc,c.lt,c.buf)}}>{fmtD(c.doc)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtD(c.allIn)}</td>
                  <td className="px-2 py-1.5 text-gray-600">│</td>
                  <td className="px-2 py-1.5 text-right text-gray-300">{fmtM(c.ltR)}</td>
                  <td className="px-2 py-1.5 text-right text-green-400">{fmtM(c.ltP)}</td>
                  <td className="px-2 py-1.5 text-right text-gray-300">{fmtM(c.tyR)}</td>
                  <td className="px-2 py-1.5 text-right text-green-400">{fmtM(c.tyP)}</td>
                  <td className="px-2 py-1.5 text-gray-600">│</td>
                  <td className="px-2 py-1.5 text-right text-yellow-400">{c.needCost>0?fmtM(c.needCost):"—"}</td>
                  <td className="px-2 py-1.5 text-right" style={{color:docColor(c.docAfter,c.lt,c.buf)}}>{fmtD(c.docAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length===0&&<p className="text-gray-500 text-center py-8">No cores match filters</p>}
        </div>
      )}

      {view==="vendor"&&(
        <div className="space-y-3">
          {vendorGroups.map(g=>{const v=g.vendor;const crC=g.cores.filter(c=>c.st==="critical").length;const waC=g.cores.filter(c=>c.st==="warning").length;const meetsMoq=v.moqDollar?g.totalNeed>=v.moqDollar:true;
            return(<div key={v.name||"u"} className="border border-gray-800 rounded-lg overflow-hidden">
              <div className="bg-gray-800/80 px-3 py-2 flex flex-wrap items-center gap-3">
                <span className="font-medium text-white text-sm">{v.name||"Unknown"}</span>
                <span className="text-xs text-gray-400">LT:{v.lt||"?"}d</span><span className="text-xs text-gray-400">MOQ:{v.moqDollar?fmtM(v.moqDollar):"—"}</span>
                {crC>0&&<span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">{crC} crit</span>}
                {waC>0&&<span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">{waC} warn</span>}
                <span className="ml-auto text-xs font-medium text-yellow-400">Total:{fmtM(g.totalNeed)}</span>
                {v.moqDollar>0&&<span className={`text-xs px-1.5 py-0.5 rounded ${meetsMoq?"bg-green-500/20 text-green-400":"bg-red-500/20 text-red-400"}`}>{meetsMoq?"Meets MOQ":"Below MOQ"}</span>}
              </div>
              <table className="w-full text-xs"><thead><tr className="bg-gray-800/40"><th className="px-2 py-1 text-left text-gray-500"></th><th className="px-2 py-1 text-left text-gray-500">Core</th><th className="px-2 py-1 text-left text-gray-500">Title</th><th className="px-2 py-1 text-right text-gray-500">DSR</th><th className="px-2 py-1 text-right text-gray-500">DOC</th><th className="px-2 py-1 text-right text-gray-500">All-In</th><th className="px-2 py-1 text-right text-gray-500">Need $</th></tr></thead>
              <tbody className="divide-y divide-gray-800/30">{g.cores.map(c=>(<tr key={c.id} className="hover:bg-gray-800/30"><td className="px-2 py-1"><StatusDot status={c.st}/></td><td className="px-2 py-1 font-mono text-blue-400 cursor-pointer hover:underline" onClick={()=>onCoreClick&&onCoreClick(c.id)}>{c.id}</td><td className="px-2 py-1 text-gray-300 max-w-[200px] truncate">{c.ti}</td><td className="px-2 py-1 text-right">{fmt(c.dsr,1)}</td><td className="px-2 py-1 text-right" style={{color:docColor(c.doc,c.lt,c.buf)}}>{fmtD(c.doc)}</td><td className="px-2 py-1 text-right">{fmtD(c.allIn)}</td><td className="px-2 py-1 text-right text-yellow-400">{c.needCost>0?fmtM(c.needCost):"—"}</td></tr>))}</tbody></table>
            </div>);
          })}
        </div>
      )}
    </div>
  );
}

// ═══ SAFE CHART WRAPPER ═══
// Prevents Recharts children count from changing between renders
function SafeChart({children, ...props}) {
  return children;
}

// ═══ TAB 2: CORE DETAIL ═══
function CoreDetailTab({cores,bundles,vendors,sales,fees,onBundleClick,dashData}) {
  const [search,setSearch]=useState("");
  const [sel,setSel]=useState(null);
  const [hist,setHist]=useState(null);
  const [loading,setLoading]=useState(false);
  const venMap=useMemo(()=>{const m={};vendors.forEach(v=>m[v.name]=v);return m;},[vendors]);
  const salesMap=useMemo(()=>{const m={};sales.forEach(s=>m[s.j]=s);return m;},[sales]);
  const feesMap=useMemo(()=>{const m={};fees.forEach(f=>m[f.j]=f);return m;},[fees]);
  const filtered=useMemo(()=>{if(!search||search.length<2)return[];const s=search.toLowerCase();return cores.filter(c=>c.id.toLowerCase().includes(s)||c.ti.toLowerCase().includes(s)).slice(0,10);},[cores,search]);

  const selectCore=useCallback(async(core)=>{
    setSel(core);setSearch(core.id);setLoading(true);setHist(null);
    try{const d=await jsonpFetch(API+"?action=coreSummary&id="+encodeURIComponent(core.id));setHist(d);}catch(e){console.error(e);}
    setLoading(false);
  },[]);

  useEffect(()=>{
    const h=(e)=>{const core=cores.find(c=>c.id===e.detail);if(core)selectCore(core);};
    window.addEventListener('selectCore',h);return()=>window.removeEventListener('selectCore',h);
  },[cores,selectCore]);

  const chartData=useMemo(()=>{
    if(!hist||!hist.coreInv)return[];
    return hist.coreInv.map(r=>{
      const m=r.Month||r.month;const ms=typeof m==='string'?(m.length>7?m.slice(0,7):m):(m?new Date(m).toISOString().slice(0,7):'');
      return{month:ms,dsr:r["Avg DSR"]||r.avgDsr||0,d7:r["Avg 7D DSR"]||r.avg7d||0,doc:r["Avg DOC"]||r.avgDoc||0,own:r["Avg All-In Own"]||r.avgOwn||0,fba:r["Avg FBA"]||r.avgFba||0,oos:r["OOS Days"]||r.oosDays||0,y:r.Year||r.y||0};
    }).sort((a,b)=>a.month<b.month?-1:1);
  },[hist]);

  const yoyData=useMemo(()=>{if(!chartData.length)return[];const bm={};chartData.forEach(r=>{const mo=parseInt(String(r.month).split("-")[1])||0;const yr=r.y||parseInt(String(r.month).split("-")[0])||0;if(!bm[mo])bm[mo]={mo};bm[mo]["dsr_"+yr]=r.dsr;bm[mo]["oos_"+yr]=r.oos||0;});return Object.values(bm).sort((a,b)=>a.mo-b.mo);},[chartData]);
  const years=useMemo(()=>[...new Set(chartData.map(r=>r.y||parseInt(String(r.month).split("-")[0])))].filter(Boolean).sort(),[chartData]);
  // FIX: Pre-compute which years have OOS data so we don't conditionally render inside JSX
  const oosYears=useMemo(()=>years.filter(yr=>yoyData.some(r=>(r["oos_"+yr]||0)>0)),[years,yoyData]);
  const yCols=["#60a5fa","#f472b6","#34d399","#fbbf24"];

  if(!sel)return(
    <div className="space-y-4">
      <div className="relative">
        <input className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700" placeholder="Search cores by ID or title..." value={search} onChange={e=>setSearch(e.target.value)}/>
        {filtered.length>0&&<div className="absolute z-40 w-full bg-gray-800 border border-gray-700 rounded-lg mt-1 max-h-60 overflow-y-auto">{filtered.map(c=><button key={c.id} className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm flex gap-2" onClick={()=>selectCore(c)}><span className="text-blue-400 font-mono">{c.id}</span><span className="text-gray-300 truncate">{c.ti}</span></button>)}</div>}
      </div>
      {dashData&&dashData.length>0&&<div className="bg-gray-800/40 rounded-lg p-3"><h3 className="text-sm font-medium text-gray-300 mb-2">Monthly Revenue & Profit</h3><ResponsiveContainer width="100%" height={220}><BarChart data={dashData.slice(-18)}><CartesianGrid strokeDasharray="3 3" stroke="#374151"/><XAxis dataKey="month" tick={{fill:"#9ca3af",fontSize:10}} tickFormatter={m=>{const s=String(m||"");return s.length>=5?s.slice(5):s;}}/><YAxis tick={{fill:"#9ca3af",fontSize:10}} tickFormatter={v=>"$"+(Number(v||0)/1000).toFixed(0)+"k"}/><Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,fontSize:12}} formatter={v=>"$"+fmt(v,0)}/><Legend/><Bar dataKey="rev" name="Revenue" fill="#3b82f6" radius={[2,2,0,0]}/><Bar dataKey="profit" name="Profit" fill="#22c55e" radius={[2,2,0,0]}/></BarChart></ResponsiveContainer></div>}
      <p className="text-gray-500 text-center py-8">Search a core above, or click a Core ID in the Purchasing tab</p>
    </div>
  );

  const c=sel;const v=venMap[c.ven]||{};const lt=v.lt||45;const st=statusLabel(c.doc,lt,c.buf);
  const allIn=c.raw+c.inb+c.pp+c.jfn+c.pq+c.ji+c.fba;
  const jlsList=c.jlsList?c.jlsList.split(",").map(s=>s.trim()):[];
  const coreBundles=bundles.filter(b=>jlsList.includes(b.j));
  const cs=useMemo(()=>{let ltR=0,ltP=0,tyR=0,tyP=0,lyR=0,lyP=0;jlsList.forEach(j=>{const s=salesMap[j];if(s){ltR+=s.ltR;ltP+=s.ltP;tyR+=s.tyR;tyP+=s.tyP;lyR+=s.lyR;lyP+=s.lyP;}});return{ltR,ltP,tyR,tyP,lyR,lyP};},[jlsList,salesMap]);
  const pipeline=[{label:"Raw",val:c.raw},{label:"Inbound",val:c.inb},{label:"Pre-Proc",val:c.pp},{label:"JFN",val:c.jfn},{label:"Proc Q",val:c.pq},{label:"JI",val:c.ji},{label:"FBA",val:c.fba}];
  const maxP=Math.max(...pipeline.map(p=>p.val),1);

  return(
    <div className="space-y-4">
      <button className="text-xs text-blue-400 hover:text-blue-300" onClick={()=>{setSel(null);setSearch("");setHist(null);}}>← Back to search</button>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-white">{c.id}</h2><StatusDot status={st}/>
        <span className={`text-xs px-2 py-0.5 rounded ${st==="critical"?"bg-red-500/20 text-red-400":st==="warning"?"bg-yellow-500/20 text-yellow-400":"bg-green-500/20 text-green-400"}`}>{st.toUpperCase()}</span>
        <span className="text-gray-400 text-sm truncate max-w-md">{c.ti}</span>
      </div>
      <div className="text-xs text-gray-400 flex flex-wrap gap-4">
        <span>Vendor: <strong className="text-gray-200">{c.ven}</strong></span><span>Cost: <strong className="text-gray-200">{fmtP(c.cost)}</strong></span><span>LT: <strong className="text-gray-200">{lt}d</strong></span><span>Category: <strong className="text-gray-200">{c.cat||"—"}</strong></span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[{l:"C.DSR",v:fmt(c.dsr,1)},{l:"7D DSR",v:fmt(c.d7,1)},{l:"DOC",v:fmtD(c.doc),color:docColor(c.doc,lt,c.buf)},{l:"All-In Own",v:fmtD(allIn)},{l:"FBA",v:fmtD(c.fba)}].map(k=><div key={k.l} className="bg-gray-800/60 rounded-lg p-2.5"><div className="text-gray-500 text-xs">{k.l}</div><div className="text-white text-lg font-bold" style={k.color?{color:k.color}:{}}>{k.v}</div></div>)}
      </div>
      <div className="bg-gray-800/40 rounded-lg p-3"><h3 className="text-sm font-medium text-gray-300 mb-2">Profitability</h3><table className="w-full text-xs"><thead><tr><th className="text-left text-gray-500 py-1"></th><th className="text-right text-gray-500">Lifetime</th><th className="text-right text-gray-500">Last Year</th><th className="text-right text-gray-500">This Year</th></tr></thead><tbody><tr><td className="py-1 text-gray-400">Revenue</td><td className="text-right text-gray-200">{fmtM(cs.ltR)}</td><td className="text-right text-gray-200">{fmtM(cs.lyR)}</td><td className="text-right text-gray-200">{fmtM(cs.tyR)}</td></tr><tr><td className="py-1 text-gray-400">Profit</td><td className="text-right text-green-400">{fmtM(cs.ltP)}</td><td className="text-right text-green-400">{fmtM(cs.lyP)}</td><td className="text-right text-green-400">{fmtM(cs.tyP)}</td></tr></tbody></table></div>
      <div className="bg-gray-800/40 rounded-lg p-3"><h3 className="text-sm font-medium text-gray-300 mb-2">Inventory Pipeline</h3><div className="flex gap-1 items-end h-28">{pipeline.map(p=><div key={p.label} className="flex-1 flex flex-col items-center gap-1"><span className="text-xs text-gray-300 font-medium">{fmtD(p.val)}</span><div className="w-full rounded-t" style={{height:Math.max(4,p.val/maxP*80)+"px",background:"#3b82f6"}}/><span className="text-xs text-gray-500 whitespace-nowrap">{p.label}</span></div>)}</div></div>

      {loading&&<Spinner msg="Loading history..."/>}

      {/* FIX: YoY chart - pre-filter oosYears so children count is stable */}
      {yoyData.length>0&&<div className="bg-gray-800/40 rounded-lg p-3"><h3 className="text-sm font-medium text-gray-300 mb-2">Monthly DSR (Year over Year)</h3><ResponsiveContainer width="100%" height={220}><ComposedChart data={yoyData}><CartesianGrid strokeDasharray="3 3" stroke="#374151"/><XAxis dataKey="mo" tick={{fill:"#9ca3af",fontSize:11}} tickFormatter={m=>["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m]||m}/><YAxis tick={{fill:"#9ca3af",fontSize:11}}/><Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,fontSize:12}} labelFormatter={m=>["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m)]||String(m)}/><Legend/>{years.map((yr,i)=><Bar key={yr} dataKey={"dsr_"+yr} name={String(yr)} fill={yCols[i%yCols.length]} radius={[2,2,0,0]}/>)}{oosYears.map((yr,i)=><Line key={"o"+yr} dataKey={"oos_"+yr} name={yr+" OOS"} stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="4 2"/>)}</ComposedChart></ResponsiveContainer></div>}

      {chartData.length>0&&<div className="bg-gray-800/40 rounded-lg p-3"><h3 className="text-sm font-medium text-gray-300 mb-2">DOC & Inventory</h3><ResponsiveContainer width="100%" height={200}><ComposedChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#374151"/><XAxis dataKey="month" tick={{fill:"#9ca3af",fontSize:10}} tickFormatter={m=>typeof m==='string'?m.slice(5):m}/><YAxis yAxisId="d" tick={{fill:"#9ca3af",fontSize:11}}/><YAxis yAxisId="i" orientation="right" tick={{fill:"#9ca3af",fontSize:11}}/><Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,fontSize:12}}/><Legend/><Line yAxisId="d" dataKey="doc" name="DOC" stroke="#f59e0b" strokeWidth={2} dot={false}/><Bar yAxisId="i" dataKey="own" name="All-In Own" fill="#3b82f6" opacity={0.5} radius={[2,2,0,0]}/><Bar yAxisId="i" dataKey="fba" name="FBA" fill="#8b5cf6" opacity={0.5} radius={[2,2,0,0]}/></ComposedChart></ResponsiveContainer></div>}

      {coreBundles.length>0&&<div className="bg-gray-800/40 rounded-lg p-3"><h3 className="text-sm font-medium text-gray-300 mb-2">Bundles ({coreBundles.length})</h3><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-gray-500"><th className="text-left px-2 py-1">JLS</th><th className="text-left px-2 py-1">Title</th><th className="text-right px-2 py-1">DSR</th><th className="text-right px-2 py-1">DOC</th><th className="text-right px-2 py-1">FIB Inv</th><th className="text-right px-2 py-1">Price</th><th className="text-right px-2 py-1">GP</th><th className="text-right px-2 py-1">LT Profit</th></tr></thead><tbody className="divide-y divide-gray-800/30">{coreBundles.map(b=>{const f=feesMap[b.j]||{};const s=salesMap[b.j]||{};return(<tr key={b.j} className="hover:bg-gray-800/30"><td className="px-2 py-1 font-mono text-blue-400 cursor-pointer hover:underline" onClick={()=>onBundleClick&&onBundleClick(b.j)}>{b.j}</td><td className="px-2 py-1 text-gray-300 max-w-[180px] truncate">{b.t}</td><td className="px-2 py-1 text-right">{fmt(b.fbaDsr,1)}</td><td className="px-2 py-1 text-right">{fmtD(b.doc)}</td><td className="px-2 py-1 text-right">{fmtD(b.fibInv)}</td><td className="px-2 py-1 text-right">{fmtP(f.pr)}</td><td className="px-2 py-1 text-right text-green-400">{fmtP(f.gp)}</td><td className="px-2 py-1 text-right text-green-400">{fmtM(s.ltP)}</td></tr>);})}</tbody></table></div></div>}
    </div>
  );
}

// ═══ TAB 3: BUNDLE DETAIL ═══
function BundleDetailTab({bundles,sales,fees,cores}) {
  const [search,setSearch]=useState("");
  const [sel,setSel]=useState(null);
  const [hist,setHist]=useState(null);
  const [loading,setLoading]=useState(false);
  const salesMap=useMemo(()=>{const m={};sales.forEach(s=>m[s.j]=s);return m;},[sales]);
  const feesMap=useMemo(()=>{const m={};fees.forEach(f=>m[f.j]=f);return m;},[fees]);
  const filtered=useMemo(()=>{if(!search||search.length<2)return[];const s=search.toLowerCase();return bundles.filter(b=>b.j.toLowerCase().includes(s)||b.t.toLowerCase().includes(s)).slice(0,10);},[bundles,search]);

  const selectBundle=useCallback(async(b)=>{
    setSel(b);setSearch(b.j);setLoading(true);setHist(null);
    try{const d=await jsonpFetch(API+"?action=bundleSummary&id="+encodeURIComponent(b.j));setHist(d);}catch(e){console.error(e);}
    setLoading(false);
  },[]);

  useEffect(()=>{
    const h=(e)=>{const b=bundles.find(x=>x.j===e.detail);if(b)selectBundle(b);};
    window.addEventListener('selectBundle',h);return()=>window.removeEventListener('selectBundle',h);
  },[bundles,selectBundle]);

  const salesChart=useMemo(()=>{if(!hist||!hist.bundleSales)return[];return hist.bundleSales.map(r=>{const m=r.month||r.Month;const ms=typeof m==='string'?(m.length>7?m.slice(0,7):m):(m?new Date(m).toISOString().slice(0,7):'');return{month:ms,units:r.units||r.Units||0,rev:r.rev||r.Revenue||0,profit:r.profit||r.Profit||0};}).sort((a,b)=>a.month<b.month?-1:1);},[hist]);
  const priceChart=useMemo(()=>{if(!hist||!hist.priceHist)return[];return hist.priceHist.map(r=>{const m=r.month||r.Month;const ms=typeof m==='string'?(m.length>7?m.slice(0,7):m):(m?new Date(m).toISOString().slice(0,7):'');return{month:ms,avgPrice:r.avgPrice||r["Avg Price"]||0,avgGp:r.avgGp||r["Avg GP"]||0,avgFee:r.avgFee||r["Avg Total Fee"]||0};}).sort((a,b)=>a.month<b.month?-1:1);},[hist]);

  if(!sel)return(
    <div className="space-y-3">
      <div className="relative">
        <input className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700" placeholder="Search bundles by JLS # or title..." value={search} onChange={e=>setSearch(e.target.value)}/>
        {filtered.length>0&&<div className="absolute z-40 w-full bg-gray-800 border border-gray-700 rounded-lg mt-1 max-h-60 overflow-y-auto">{filtered.map(b=><button key={b.j} className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm flex gap-2" onClick={()=>selectBundle(b)}><span className="text-blue-400 font-mono">{b.j}</span><span className="text-gray-300 truncate">{b.t}</span></button>)}</div>}
      </div>
      <p className="text-gray-500 text-center py-16">Search and select a bundle to view details</p>
    </div>
  );

  const b=sel;const f=feesMap[b.j]||{};const s=salesMap[b.j]||{};const margin=f.pr?(f.gp/f.pr*100):0;

  return(
    <div className="space-y-4">
      <button className="text-xs text-blue-400 hover:text-blue-300" onClick={()=>{setSel(null);setSearch("");setHist(null);}}>← Back to search</button>
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-bold text-white">{b.j}</h2><span className="text-gray-400 text-sm truncate max-w-md">{b.t}</span>{b.core1&&<span className="text-xs text-blue-400">Core:{b.core1}</span>}</div>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {[{l:"FBA DSR",v:fmt(b.fbaDsr,1)},{l:"DOC",v:fmtD(b.doc)},{l:"FIB Inv",v:fmtD(b.fibInv)},{l:"Price",v:fmtP(f.pr)},{l:"GP",v:fmtP(f.gp),c:"text-green-400"},{l:"Margin",v:margin.toFixed(1)+"%"}].map(k=><div key={k.l} className="bg-gray-800/60 rounded-lg p-2.5"><div className="text-gray-500 text-xs">{k.l}</div><div className={`text-white text-lg font-bold ${k.c||""}`}>{k.v}</div></div>)}
      </div>
      <div className="bg-gray-800/40 rounded-lg p-3"><h3 className="text-sm font-medium text-gray-300 mb-2">Profitability</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">{[{l:"COGS",v:fmtP(f.pdmtCogs)},{l:"AICOGS%",v:f.pr?(f.aicogs/f.pr*100).toFixed(1)+"%":"—"},{l:"BE Price",v:fmtP(f.bePr)},{l:"BE ACoS",v:f.beAcos?(f.beAcos*100).toFixed(1)+"%":"—"}].map(k=><div key={k.l}><span className="text-gray-500">{k.l}: </span><span className="text-gray-200">{k.v}</span></div>)}</div></div>
      <div className="bg-gray-800/40 rounded-lg p-3"><h3 className="text-sm font-medium text-gray-300 mb-2">Revenue</h3><table className="w-full text-xs"><thead><tr><th className="text-left text-gray-500 py-1"></th><th className="text-right text-gray-500">Units</th><th className="text-right text-gray-500">Revenue</th><th className="text-right text-gray-500">Profit</th></tr></thead><tbody>{[{l:"Lifetime",u:s.ltU,r:s.ltR,p:s.ltP},{l:"Last Year",u:s.lyU,r:s.lyR,p:s.lyP},{l:"This Year",u:s.tyU,r:s.tyR,p:s.tyP},{l:"This Month",u:s.tmU,r:s.tmR,p:s.tmP},{l:"Last 7 Days",u:s.l7U,r:s.l7R,p:s.l7P},{l:"Last 28 Days",u:s.l28U,r:s.l28R,p:s.l28P}].map(r=><tr key={r.l}><td className="py-1 text-gray-400">{r.l}</td><td className="text-right text-gray-200">{fmtD(r.u)}</td><td className="text-right text-gray-200">{fmtM(r.r)}</td><td className="text-right text-green-400">{fmtM(r.p)}</td></tr>)}</tbody></table></div>

      {loading&&<Spinner msg="Loading bundle history..."/>}
      {salesChart.length>0&&<div className="bg-gray-800/40 rounded-lg p-3"><h3 className="text-sm font-medium text-gray-300 mb-2">Sales History</h3><ResponsiveContainer width="100%" height={200}><ComposedChart data={salesChart}><CartesianGrid strokeDasharray="3 3" stroke="#374151"/><XAxis dataKey="month" tick={{fill:"#9ca3af",fontSize:10}} tickFormatter={m=>m?m.slice(5):""}/><YAxis yAxisId="u" tick={{fill:"#9ca3af",fontSize:11}}/><YAxis yAxisId="r" orientation="right" tick={{fill:"#9ca3af",fontSize:11}}/><Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,fontSize:12}}/><Legend/><Bar yAxisId="u" dataKey="units" name="Units" fill="#3b82f6" radius={[2,2,0,0]}/><Line yAxisId="r" dataKey="rev" name="Revenue" stroke="#22c55e" strokeWidth={2} dot={false}/></ComposedChart></ResponsiveContainer></div>}
      {priceChart.length>0&&<div className="bg-gray-800/40 rounded-lg p-3"><h3 className="text-sm font-medium text-gray-300 mb-2">Price & Profit History</h3><ResponsiveContainer width="100%" height={200}><LineChart data={priceChart}><CartesianGrid strokeDasharray="3 3" stroke="#374151"/><XAxis dataKey="month" tick={{fill:"#9ca3af",fontSize:10}} tickFormatter={m=>m?m.slice(5):""}/><YAxis tick={{fill:"#9ca3af",fontSize:11}}/><Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,fontSize:12}} formatter={v=>"$"+Number(v).toFixed(2)}/><Legend/><Line dataKey="avgPrice" name="Avg Price" stroke="#f59e0b" strokeWidth={2} dot={false}/><Line dataKey="avgGp" name="Avg GP" stroke="#22c55e" strokeWidth={2} dot={false}/><Line dataKey="avgFee" name="Avg Fee" stroke="#ef4444" strokeWidth={1} dot={false} strokeDasharray="4 2"/></LineChart></ResponsiveContainer></div>}
    </div>
  );
}

// ═══ TAB 4: AI ADVISOR ═══
function AIAdvisorTab({cores,vendors}) {
  const [selId,setSelId]=useState("");
  const [analysis,setAnalysis]=useState("");
  const [loading,setLoading]=useState(false);
  const [search,setSearch]=useState("");
  const filtered=useMemo(()=>{if(!search||search.length<2)return[];return cores.filter(c=>c.id.toLowerCase().includes(search.toLowerCase())||c.ti.toLowerCase().includes(search.toLowerCase())).slice(0,8);},[cores,search]);

  const analyze=async()=>{
    const core=cores.find(c=>c.id===selId);if(!core)return;
    setLoading(true);setAnalysis("");
    const v=vendors.find(vn=>vn.name===core.ven)||{};
    const prompt=`You are an Amazon FBA inventory analyst. Analyze this core:\nCore:${core.id}-${core.ti}\nDSR:${core.dsr}|7D:${core.d7}|DOC:${core.doc}\nOwn:${core.own}|FBA:${core.fba}|Raw:${core.raw}\nVendor:${core.ven}|LT:${v.lt||45}d|Cost:$${core.cost}\nMOQ:${core.moq}|Buffer:${core.buf}d\nGive:1)BUY/WAIT/MONITOR 2)Qty if BUY 3)Risk 4)One idea. Under 150 words.`;
    try{const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});const d=await r.json();setAnalysis(d.content?.[0]?.text||d.error?.message||"No response");}catch(e){setAnalysis("Error:"+e.message);}
    setLoading(false);
  };

  return(
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-bold text-white">AI Purchase Advisor</h2>
      <div className="relative">
        <input className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700" placeholder="Search core..." value={search} onChange={e=>{setSearch(e.target.value);setSelId("");}}/>
        {filtered.length>0&&!selId&&<div className="absolute z-40 w-full bg-gray-800 border border-gray-700 rounded-lg mt-1 max-h-48 overflow-y-auto">{filtered.map(c=><button key={c.id} className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm" onClick={()=>{setSelId(c.id);setSearch(c.id+" - "+c.ti);}}><span className="text-blue-400 font-mono">{c.id}</span> <span className="text-gray-400">{c.ti}</span></button>)}</div>}
      </div>
      <button disabled={!selId||loading} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg" onClick={analyze}>{loading?"Analyzing...":"Analyze"}</button>
      {analysis&&<div className="bg-gray-800/60 rounded-lg p-4 text-sm text-gray-200 whitespace-pre-wrap border border-gray-700">{analysis}</div>}
    </div>
  );
}

// ═══ MAIN APP ═══
export default function App() {
  const [tab,setTab]=useState(0);
  const [data,setData]=useState(null);
  const [dashData,setDashData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [loadMsg,setLoadMsg]=useState("Loading...");
  const [error,setError]=useState(null);
  const [filter,setFilter]=useState({active:true,ignored:false,visible:true});
  const [showSettings,setShowSettings]=useState(false);

  const loadData=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      setLoadMsg("Loading dashboard summary...");
      const dash=await jsonpFetch(API+"?action=dashboard");
      if(dash&&dash.error)throw new Error("Dashboard: "+dash.error);
      setDashData(sanitize(dash));

      setLoadMsg("Loading live data... this takes 15-30 seconds, please wait");
      const live=await jsonpFetch(API+"?action=live");
      if(live&&live.error)throw new Error("Live: "+live.error);
      setData(sanitize(live));
    }catch(e){
      console.error("Load failed:", e);
      setError(String(e.message||e));
    }
    setLoading(false);
  },[]);

  useEffect(()=>{loadData();},[loadData]);

  const goToCore=useCallback((id)=>{setTab(1);setTimeout(()=>window.dispatchEvent(new CustomEvent('selectCore',{detail:id})),100);},[]);
  const goToBundle=useCallback((jls)=>{setTab(2);setTimeout(()=>window.dispatchEvent(new CustomEvent('selectBundle',{detail:jls})),100);},[]);

  const counts=useMemo(()=>{
    if(!data)return{cr:0,wa:0,he:0};
    const vm={};data.vendors?.forEach(v=>vm[v.name]=v);
    let cr=0,wa=0,he=0;
    data.cores?.forEach(c=>{if(c.active!=="Yes")return;const v=vm[c.ven]||{};const st=statusLabel(c.doc,v.lt||45,c.buf);if(st==="critical")cr++;else if(st==="warning")wa++;else he++;});
    return{cr,wa,he};
  },[data]);

  const monthlyChart=useMemo(()=>{
    if(!dashData?.monthlyTotals)return[];
    return dashData.monthlyTotals.map(r=>{
      let m=r.Month||r.month||"";
      if(typeof m==='object'&&m)try{m=new Date(m).toISOString().slice(0,7);}catch(e){m="";}
      if(typeof m==='string'&&m.length>7)m=m.slice(0,7);
      const rev=Number(r.Revenue||r.rev)||0;
      const profit=Number(r.Profit||r.profit)||0;
      const units=Number(r.Units||r.units)||0;
      return{month:String(m),rev,profit,units};
    }).filter(r=>r.month).sort((a,b)=>a.month<b.month?-1:1);
  },[dashData]);

  if(loading)return<div className="min-h-screen bg-gray-950 flex items-center justify-center"><Spinner msg={loadMsg}/></div>;
  if(error)return<div className="min-h-screen bg-gray-950 flex items-center justify-center text-red-400 p-4"><div><p className="text-lg font-bold">Error loading data</p><p className="text-sm mt-1">{error}</p><button className="mt-3 px-4 py-2 bg-blue-600 text-white rounded text-sm" onClick={loadData}>Retry</button></div></div>;
  if(!data)return null;

  const tabs=["Purchasing","Core Detail","Bundle Detail","AI Advisor"];

  return(
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-2.5 flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold text-white">Core Visualizer</h1>
        <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded">LIVE — {data.cores?.length||0} cores</span>
        <div className="flex gap-1.5 text-xs">
          <span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">{counts.cr} Crit</span>
          <span className="bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">{counts.wa} Warn</span>
          <span className="bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">{counts.he} OK</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-800" onClick={loadData}>↻ Refresh</button>
          <button className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-800" onClick={()=>setShowSettings(!showSettings)}>⚙️</button>
        </div>
      </header>

      {showSettings&&<div className="bg-gray-900 border-b border-gray-800 px-4 py-3"><div className="flex items-center gap-5 text-xs"><span className="text-gray-400">Show:</span>{[["active","Active"],["ignored","Ignored"],["visible","Visible"]].map(([key,label])=><label key={key} className="flex items-center gap-1.5 cursor-pointer"><button className={`w-9 h-5 rounded-full transition-colors ${filter[key]?
