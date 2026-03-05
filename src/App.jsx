import { useState, useMemo, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ComposedChart, Area } from "recharts";

const API = "https://script.google.com/macros/s/AKfycbzZN4yMYYUQTzMW3rC2uwC1A0vh40XKDt5wph3XQO0O7RfzKHK-PNPzzmIh4H-X_lmV/exec";

// ── Helpers ──
const fmt = (n, d=0) => n == null ? "—" : Number(n).toLocaleString("en-US", {minimumFractionDigits:d, maximumFractionDigits:d});
const fmtD = (n) => fmt(n, 0);
const fmtM = (n) => "$" + fmt(n, 0);
const fmtP = (n) => "$" + fmt(n, 2);

function docColor(doc, lt, buf) {
  if (doc <= lt) return "#ef4444";
  if (doc <= lt + (buf||14)) return "#f59e0b";
  return "#22c55e";
}
function statusLabel(doc, lt, buf) {
  if (doc <= lt) return "critical";
  if (doc <= lt + (buf||14)) return "warning";
  return "healthy";
}
function StatusDot({status}) {
  const c = status === "critical" ? "bg-red-500" : status === "warning" ? "bg-yellow-500" : "bg-green-500";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${c}`}/>;
}
function trend(d7, dsr) {
  if (!dsr) return "—";
  const pct = ((d7 - dsr) / dsr * 100);
  if (pct > 5) return <span className="text-green-400">▲ {pct.toFixed(0)}%</span>;
  if (pct < -5) return <span className="text-red-400">▼ {Math.abs(pct).toFixed(0)}%</span>;
  return <span className="text-gray-400">● {pct.toFixed(0)}%</span>;
}

// ── Info Tooltip ──
function InfoTip({text}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1">
      <button onClick={()=>setOpen(!open)} className="text-gray-500 hover:text-gray-300 text-xs">ⓘ</button>
      {open && <div className="absolute z-50 bg-gray-800 text-xs text-gray-200 p-2 rounded shadow-lg w-48 -left-20 top-5 border border-gray-600" onClick={()=>setOpen(false)}>{text}</div>}
    </span>
  );
}

// ── Sortable Header ──
function SortTh({label, field, sort, setSort, info, className=""}) {
  const active = sort.field === field;
  const arrow = active ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th className={`px-2 py-1.5 text-left text-xs font-medium text-gray-400 cursor-pointer hover:text-white select-none whitespace-nowrap ${className}`}
      onClick={()=>setSort({field, dir: active && sort.dir==="desc" ? "asc" : "desc"})}>
      {label}{arrow}{info && <InfoTip text={info}/>}
    </th>
  );
}

// ── Loading Spinner ──
function Spinner({msg}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/>
      <p className="text-gray-400 text-sm">{msg || "Loading..."}</p>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB 1: PURCHASING PRIORITIES
// ══════════════════════════════════════════
function PurchasingTab({cores, bundles, vendors, sales, fees, filter, onCoreClick}) {
  const [view, setView] = useState("core");
  const [sort, setSort] = useState({field:"doc", dir:"asc"});
  const [venFilter, setVenFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [targetDoc, setTargetDoc] = useState(90);
  const [search, setSearch] = useState("");

  // Build vendor map
  const venMap = useMemo(()=>{
    const m = {};
    vendors.forEach(v => m[v.name] = v);
    return m;
  },[vendors]);

  // Build sales map by JLS
  const salesMap = useMemo(()=>{
    const m = {};
    sales.forEach(s => m[s.j] = s);
    return m;
  },[sales]);

  // Build fees map by JLS
  const feesMap = useMemo(()=>{
    const m = {};
    fees.forEach(f => m[f.j] = f);
    return m;
  },[fees]);

  // Aggregate sales to core level
  const coreSales = useMemo(()=>{
    const m = {};
    cores.forEach(c => {
      const jlsList = c.jlsList ? c.jlsList.split(",").map(s=>s.trim()) : [];
      let ltR=0,ltP=0,tyR=0,tyP=0,lyR=0,lyP=0;
      jlsList.forEach(j => {
        const s = salesMap[j];
        if(s){ltR+=s.ltR;ltP+=s.ltP;tyR+=s.tyR;tyP+=s.tyP;lyR+=s.lyR;lyP+=s.lyP;}
      });
      m[c.id] = {ltR,ltP,tyR,tyP,lyR,lyP};
    });
    return m;
  },[cores, salesMap]);

  // Process & filter cores
  const processed = useMemo(()=>{
    return cores.map(c => {
      const v = venMap[c.ven] || {};
      const lt = v.lt || 45;
      const st = statusLabel(c.doc, lt, c.buf);
      const allIn = c.raw + c.inb + c.pp + c.jfn + c.pq + c.ji + c.fba;
      const cs = coreSales[c.id] || {};
      const need = Math.max(0, Math.ceil((targetDoc - c.doc) * c.dsr));
      const needCost = need * c.cost;
      const docAfter = c.dsr > 0 ? c.doc + (need / c.dsr) : c.doc;
      return {...c, lt, st, allIn, need, needCost, docAfter, ...cs};
    }).filter(c => {
      const isActive = c.active === "Yes";
      const isIgnored = c.ignoreUntil && new Date(c.ignoreUntil) > new Date();
      const isVisible = c.visible === "Yes";
      
      // Each toggle: if ON, include items matching that flag. If all OFF, show nothing.
      let show = false;
      if (filter.active && isActive && !isIgnored) show = true;
      if (filter.ignored && isIgnored) show = true;
      if (filter.visible && isVisible && !isActive) show = true;
      // If active+visible both on, show active OR visible
      if (filter.active && filter.visible && (isActive || isVisible) && !isIgnored) show = true;
      if (!show) return false;
      if (venFilter && c.ven !== venFilter) return false;
      if (statusFilter && c.st !== statusFilter) return false;
      if (search && !c.id.toLowerCase().includes(search.toLowerCase()) && !c.ti.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  },[cores, venMap, coreSales, filter, venFilter, statusFilter, targetDoc, search]);

  // Sort
  const sorted = useMemo(()=>{
    const s = [...processed];
    const dir = sort.dir === "asc" ? 1 : -1;
    const pri = {critical:0, warning:1, healthy:2};
    s.sort((a,b)=>{
      let av = a[sort.field], bv = b[sort.field];
      if (sort.field === "st") { av = pri[av]; bv = pri[bv]; }
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return ((av||0) - (bv||0)) * dir;
    });
    return s;
  },[processed, sort]);

  // Status counts
  const counts = useMemo(()=>{
    let cr=0,wa=0,he=0;
    processed.forEach(c=>{if(c.st==="critical")cr++;else if(c.st==="warning")wa++;else he++;});
    return {cr,wa,he};
  },[processed]);

  // Unique vendors
  const uniqueVens = useMemo(()=>[...new Set(cores.map(c=>c.ven).filter(Boolean))].sort(),[cores]);

  // Vendor view data
  const vendorGroups = useMemo(()=>{
    if (view !== "vendor") return [];
    const groups = {};
    sorted.forEach(c=>{
      if(!groups[c.ven]) groups[c.ven] = {vendor: venMap[c.ven]||{name:c.ven}, cores:[], totalNeed:0};
      groups[c.ven].cores.push(c);
      groups[c.ven].totalNeed += c.needCost;
    });
    return Object.values(groups).sort((a,b)=>b.totalNeed - a.totalNeed);
  },[sorted, view, venMap]);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-gray-800 rounded-lg overflow-hidden">
          <button className={`px-3 py-1.5 text-xs font-medium ${view==="core"?"bg-blue-600 text-white":"text-gray-400 hover:text-white"}`} onClick={()=>setView("core")}>By Core</button>
          <button className={`px-3 py-1.5 text-xs font-medium ${view==="vendor"?"bg-blue-600 text-white":"text-gray-400 hover:text-white"}`} onClick={()=>setView("vendor")}>By Vendor</button>
        </div>
        <input className="bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-700 w-44" placeholder="Search core/title..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-700" value={venFilter} onChange={e=>setVenFilter(e.target.value)}>
          <option value="">All Vendors</option>
          {uniqueVens.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
        <select className="bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-700" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="healthy">Healthy</option>
        </select>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span>Target DOC:</span>
          <input type="number" className="bg-gray-800 text-white text-xs px-2 py-1.5 rounded border border-gray-700 w-16" value={targetDoc} onChange={e=>setTargetDoc(Number(e.target.value)||90)}/>
        </div>
        <div className="ml-auto flex gap-2 text-xs">
          <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded">{counts.cr} Crit</span>
          <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">{counts.wa} Warn</span>
          <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded">{counts.he} OK</span>
        </div>
      </div>

      {/* Core View */}
      {view === "core" && (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-xs">
            <thead className="bg-gray-800/80">
              <tr>
                <SortTh label="" field="st" sort={sort} setSort={setSort}/>
                <SortTh label="Core ID" field="id" sort={sort} setSort={setSort}/>
                <SortTh label="Vendor" field="ven" sort={sort} setSort={setSort}/>
                <SortTh label="Title" field="ti" sort={sort} setSort={setSort}/>
                <SortTh label="C.DSR" field="dsr" sort={sort} setSort={setSort} info="Complete Daily Sales Rate"/>
                <SortTh label="7D DSR" field="d7" sort={sort} setSort={setSort} info="7-day average DSR"/>
                <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-400">Trend</th>
                <SortTh label="DOC" field="doc" sort={sort} setSort={setSort} info="Days of Coverage at current DSR"/>
                <SortTh label="All-In Own" field="allIn" sort={sort} setSort={setSort} info="Raw+Inb+PP+JFN+PQ+JI+FBA"/>
                <th className="px-2 py-1.5 text-gray-600">│</th>
                <SortTh label="LT Rev" field="ltR" sort={sort} setSort={setSort} info="Lifetime Revenue"/>
                <SortTh label="LT Profit" field="ltP" sort={sort} setSort={setSort} info="Lifetime Profit"/>
                <SortTh label="TY Rev" field="tyR" sort={sort} setSort={setSort} info="This Year Revenue"/>
                <SortTh label="TY Profit" field="tyP" sort={sort} setSort={setSort} info="This Year Profit"/>
                <th className="px-2 py-1.5 text-gray-600">│</th>
                <SortTh label="Need $" field="needCost" sort={sort} setSort={setSort} info="Cost to reach target DOC"/>
                <SortTh label="DOC After" field="docAfter" sort={sort} setSort={setSort} info="DOC after purchasing needed qty"/>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {sorted.map(c=>(
                <tr key={c.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-2 py-1.5"><StatusDot status={c.st}/></td>
                  <td className="px-2 py-1.5 font-mono text-blue-400 cursor-pointer hover:text-blue-300 hover:underline" onClick={()=>onCoreClick?.(c.id)}>{c.id}</td>
                  <td className="px-2 py-1.5 text-gray-300 max-w-[120px] truncate">{c.ven}</td>
                  <td className="px-2 py-1.5 text-gray-200 max-w-[200px] truncate">{c.ti}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(c.dsr,1)}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(c.d7,1)}</td>
                  <td className="px-2 py-1.5 text-right">{trend(c.d7, c.dsr)}</td>
                  <td className="px-2 py-1.5 text-right font-medium" style={{color:docColor(c.doc,c.lt,c.buf)}}>{fmtD(c.doc)}</td>
                  <td className="px-2 py-1.5 text-right">{fmtD(c.allIn)}</td>
                  <td className="px-2 py-1.5 text-gray-600">│</td>
                  <td className="px-2 py-1.5 text-right text-gray-300">{fmtM(c.ltR)}</td>
                  <td className="px-2 py-1.5 text-right text-green-400">{fmtM(c.ltP)}</td>
                  <td className="px-2 py-1.5 text-right text-gray-300">{fmtM(c.tyR)}</td>
                  <td className="px-2 py-1.5 text-right text-green-400">{fmtM(c.tyP)}</td>
                  <td className="px-2 py-1.5 text-gray-600">│</td>
                  <td className="px-2 py-1.5 text-right text-yellow-400">{c.needCost > 0 ? fmtM(c.needCost) : "—"}</td>
                  <td className="px-2 py-1.5 text-right" style={{color:docColor(c.docAfter,c.lt,c.buf)}}>{fmtD(c.docAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && <p className="text-gray-500 text-center py-8">No cores match filters</p>}
        </div>
      )}

      {/* Vendor View */}
      {view === "vendor" && (
        <div className="space-y-3">
          {vendorGroups.map(g=>{
            const v = g.vendor;
            const crCount = g.cores.filter(c=>c.st==="critical").length;
            const waCount = g.cores.filter(c=>c.st==="warning").length;
            const meetsMoq = v.moqDollar ? g.totalNeed >= v.moqDollar : true;
            return (
              <div key={v.name||"unknown"} className="border border-gray-800 rounded-lg overflow-hidden">
                <div className="bg-gray-800/80 px-3 py-2 flex flex-wrap items-center gap-3">
                  <span className="font-medium text-white text-sm">{v.name||"Unknown"}</span>
                  <span className="text-xs text-gray-400">LT: {v.lt||"?"}d</span>
                  <span className="text-xs text-gray-400">MOQ: {v.moqDollar ? fmtM(v.moqDollar) : "—"}</span>
                  <span className="text-xs text-gray-400">Terms: {v.terms||"—"}</span>
                  {crCount > 0 && <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">{crCount} crit</span>}
                  {waCount > 0 && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">{waCount} warn</span>}
                  <span className="ml-auto text-xs font-medium text-yellow-400">Total: {fmtM(g.totalNeed)}</span>
                  {v.moqDollar > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${meetsMoq ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                      {meetsMoq ? "Meets MOQ" : "Below MOQ"}
                    </span>
                  )}
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-800/40">
                      <th className="px-2 py-1 text-left text-gray-500"></th>
                      <th className="px-2 py-1 text-left text-gray-500">Core</th>
                      <th className="px-2 py-1 text-left text-gray-500">Title</th>
                      <th className="px-2 py-1 text-right text-gray-500">DSR</th>
                      <th className="px-2 py-1 text-right text-gray-500">DOC</th>
                      <th className="px-2 py-1 text-right text-gray-500">All-In</th>
                      <th className="px-2 py-1 text-right text-gray-500">Need $</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/30">
                    {g.cores.map(c=>(
                      <tr key={c.id} className="hover:bg-gray-800/30">
                        <td className="px-2 py-1"><StatusDot status={c.st}/></td>
                        <td className="px-2 py-1 font-mono text-blue-400">{c.id}</td>
                        <td className="px-2 py-1 text-gray-300 max-w-[200px] truncate">{c.ti}</td>
                        <td className="px-2 py-1 text-right">{fmt(c.dsr,1)}</td>
                        <td className="px-2 py-1 text-right" style={{color:docColor(c.doc,c.lt,c.buf)}}>{fmtD(c.doc)}</td>
                        <td className="px-2 py-1 text-right">{fmtD(c.allIn)}</td>
                        <td className="px-2 py-1 text-right text-yellow-400">{c.needCost>0?fmtM(c.needCost):"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// TAB 2: CORE DETAIL
// ══════════════════════════════════════════
function CoreDetailTab({cores, bundles, vendors, sales, fees, onBundleClick, dashData}) {
  const [search, setSearch] = useState("");
  const [selectedCore, setSelectedCore] = useState(null);
  const [histData, setHistData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Listen for external core selection (from Purchasing tab click)
  useEffect(()=>{
    const handler = (e)=>{
      const core = cores.find(c=>c.id===e.detail);
      if(core) selectCore(core);
    };
    window.addEventListener('selectCore', handler);
    return ()=>window.removeEventListener('selectCore', handler);
  },[cores]);

  const filtered = useMemo(()=>{
    if (!search || search.length < 2) return [];
    const s = search.toLowerCase();
    return cores.filter(c => c.id.toLowerCase().includes(s) || c.ti.toLowerCase().includes(s)).slice(0,10);
  },[cores, search]);

  const venMap = useMemo(()=>{const m={};vendors.forEach(v=>m[v.name]=v);return m;},[vendors]);
  const salesMap = useMemo(()=>{const m={};sales.forEach(s=>m[s.j]=s);return m;},[sales]);
  const feesMap = useMemo(()=>{const m={};fees.forEach(f=>m[f.j]=f);return m;},[fees]);

  const selectCore = useCallback(async(core)=>{
    setSelectedCore(core);
    setSearch(core.id);
    setLoading(true);
    setHistData(null);
    try {
      const r = await fetch(API+"?action=coreSummary&id="+encodeURIComponent(core.id));
      const d = await r.json();
      setHistData(d);
    } catch(e) { console.error(e); }
    setLoading(false);
  },[]);

  const v = selectedCore ? venMap[selectedCore.ven] || {} : {};
  const jlsList = selectedCore?.jlsList ? selectedCore.jlsList.split(",").map(s=>s.trim()) : [];
  const coreBundles = bundles.filter(b => jlsList.includes(b.j));

  // Aggregate core sales
  const cs = useMemo(()=>{
    let ltR=0,ltP=0,tyR=0,tyP=0,lyR=0,lyP=0;
    jlsList.forEach(j=>{const s=salesMap[j];if(s){ltR+=s.ltR;ltP+=s.ltP;tyR+=s.tyR;tyP+=s.tyP;lyR+=s.lyR;lyP+=s.lyP;}});
    return {ltR,ltP,tyR,tyP,lyR,lyP};
  },[jlsList, salesMap]);

  // Chart data from history
  const chartData = useMemo(()=>{
    if (!histData?.coreInv) return [];
    return histData.coreInv.map(r => {
      const m = typeof r.Month === 'string' ? r.Month : r.Month ? new Date(r.Month).toISOString().slice(0,7) : r.month;
      return { month: typeof m === 'string' ? m.slice(0,7) : m, dsr: r["Avg DSR"]||r.avgDsr||0, d7: r["Avg 7D DSR"]||r.avg7d||0, doc: r["Avg DOC"]||r.avgDoc||0, own: r["Avg All-In Own"]||r.avgOwn||0, fba: r["Avg FBA"]||r.avgFba||0, oos: r["OOS Days"]||r.oosDays||0, y: r.Year||r.y||0 };
    }).sort((a,b)=>a.month<b.month?-1:1);
  },[histData]);

  // Year-over-year DSR data
  const yoyData = useMemo(()=>{
    if (!chartData.length) return [];
    const byMonth = {};
    chartData.forEach(r=>{
      const mo = typeof r.month === 'string' ? parseInt(r.month.split("-")[1]) : r.m;
      const yr = r.y || (typeof r.month === 'string' ? parseInt(r.month.split("-")[0]) : 0);
      if(!byMonth[mo]) byMonth[mo] = {mo};
      byMonth[mo]["dsr_"+yr] = r.dsr;
      if(r.oos > 0) byMonth[mo]["oos_"+yr] = r.oos;
    });
    return Object.values(byMonth).sort((a,b)=>a.mo-b.mo);
  },[chartData]);

  const years = useMemo(()=>[...new Set(chartData.map(r=>r.y||parseInt(String(r.month).split("-")[0])))].filter(Boolean).sort(),[chartData]);
  const yearColors = ["#60a5fa","#f472b6","#34d399","#fbbf24","#a78bfa"];

  if (!selectedCore) return (
    <div className="space-y-4">
      <div className="relative">
        <input className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700" placeholder="Search cores by ID or title..." value={search} onChange={e=>setSearch(e.target.value)}/>
        {filtered.length > 0 && (
          <div className="absolute z-40 w-full bg-gray-800 border border-gray-700 rounded-lg mt-1 max-h-60 overflow-y-auto">
            {filtered.map(c=>(
              <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm flex gap-2" onClick={()=>selectCore(c)}>
                <span className="text-blue-400 font-mono">{c.id}</span>
                <span className="text-gray-300 truncate">{c.ti}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {dashData && dashData.length > 0 && (
        <div className="bg-gray-800/40 rounded-lg p-3">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Monthly Revenue & Profit (Business Overview)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dashData.slice(-18)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
              <XAxis dataKey="month" tick={{fill:"#9ca3af",fontSize:10}} tickFormatter={m=>m?m.slice(5):""}/>
              <YAxis tick={{fill:"#9ca3af",fontSize:10}} tickFormatter={v=>"$"+(v/1000).toFixed(0)+"k"}/>
              <Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,fontSize:12}} formatter={v=>fmtM(v)}/>
              <Legend/>
              <Bar dataKey="rev" name="Revenue" fill="#3b82f6" radius={[2,2,0,0]}/>
              <Bar dataKey="profit" name="Profit" fill="#22c55e" radius={[2,2,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-gray-500 text-center py-8">Search a core above, or click a Core ID in the Purchasing tab</p>
    </div>
  );

  const c = selectedCore;
  const lt = v.lt || 45;
  const st = statusLabel(c.doc, lt, c.buf);
  const allIn = c.raw+c.inb+c.pp+c.jfn+c.pq+c.ji+c.fba;
  const pipeline = [{label:"Raw",val:c.raw},{label:"Inbound",val:c.inb},{label:"Pre-Proc",val:c.pp},{label:"JFN",val:c.jfn},{label:"Proc Q",val:c.pq},{label:"JI",val:c.ji},{label:"FBA",val:c.fba}];
  const maxPipe = Math.max(...pipeline.map(p=>p.val),1);

  return (
    <div className="space-y-4">
      <button className="text-xs text-blue-400 hover:text-blue-300" onClick={()=>{setSelectedCore(null);setSearch("");setHistData(null);}}>← Back to search</button>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-white">{c.id}</h2>
        <StatusDot status={st}/>
        <span className={`text-xs px-2 py-0.5 rounded ${st==="critical"?"bg-red-500/20 text-red-400":st==="warning"?"bg-yellow-500/20 text-yellow-400":"bg-green-500/20 text-green-400"}`}>{st.toUpperCase()}</span>
        <span className="text-gray-400 text-sm truncate max-w-md">{c.ti}</span>
      </div>
      <div className="text-xs text-gray-400 flex flex-wrap gap-4">
        <span>Vendor: <strong className="text-gray-200">{c.ven}</strong></span>
        <span>Cost: <strong className="text-gray-200">{fmtP(c.cost)}</strong></span>
        <span>LT: <strong className="text-gray-200">{lt}d</strong></span>
        <span>Category: <strong className="text-gray-200">{c.cat||"—"}</strong></span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[{label:"C.DSR",val:fmt(c.dsr,1)},{label:"7D DSR",val:fmt(c.d7,1)},{label:"DOC",val:fmtD(c.doc),color:docColor(c.doc,lt,c.buf)},{label:"All-In Own",val:fmtD(allIn)},{label:"FBA",val:fmtD(c.fba)}].map(k=>(
          <div key={k.label} className="bg-gray-800/60 rounded-lg p-2.5">
            <div className="text-gray-500 text-xs">{k.label}</div>
            <div className="text-white text-lg font-bold" style={k.color?{color:k.color}:{}}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Profitability Table */}
      <div className="bg-gray-800/40 rounded-lg p-3">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Profitability</h3>
        <table className="w-full text-xs">
          <thead><tr><th className="text-left text-gray-500 py-1"></th><th className="text-right text-gray-500">Lifetime</th><th className="text-right text-gray-500">Last Year</th><th className="text-right text-gray-500">This Year</th></tr></thead>
          <tbody>
            <tr><td className="py-1 text-gray-400">Revenue</td><td className="text-right text-gray-200">{fmtM(cs.ltR)}</td><td className="text-right text-gray-200">{fmtM(cs.lyR)}</td><td className="text-right text-gray-200">{fmtM(cs.tyR)}</td></tr>
            <tr><td className="py-1 text-gray-400">Profit</td><td className="text-right text-green-400">{fmtM(cs.ltP)}</td><td className="text-right text-green-400">{fmtM(cs.lyP)}</td><td className="text-right text-green-400">{fmtM(cs.tyP)}</td></tr>
            {cs.ltR > 0 && <tr><td className="py-1 text-gray-500">Margin</td><td className="text-right text-gray-400">{(cs.ltP/cs.ltR*100).toFixed(1)}%</td><td className="text-right text-gray-400">{cs.lyR?(cs.lyP/cs.lyR*100).toFixed(1):0}%</td><td className="text-right text-gray-400">{cs.tyR?(cs.tyP/cs.tyR*100).toFixed(1):0}%</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Pipeline */}
      <div className="bg-gray-800/40 rounded-lg p-3">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Inventory Pipeline</h3>
        <div className="flex gap-1 items-end h-28">
          {pipeline.map(p=>(
            <div key={p.label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-gray-300 font-medium">{fmtD(p.val)}</span>
              <div className="w-full bg-blue-500/30 rounded-t" style={{height: Math.max(4, p.val/maxPipe*80)+"px"}}>
                <div className="w-full h-full bg-blue-500 rounded-t opacity-80"/>
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap">{p.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      {loading && <Spinner msg="Loading history..."/>}
      {chartData.length > 0 && (
        <div className="bg-gray-800/40 rounded-lg p-3">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Monthly DSR (Year over Year)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={yoyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
              <XAxis dataKey="mo" tick={{fill:"#9ca3af",fontSize:11}} tickFormatter={m=>["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m]||m}/>
              <YAxis tick={{fill:"#9ca3af",fontSize:11}}/>
              <Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,fontSize:12}} labelFormatter={m=>["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m]||m}/>
              <Legend/>
              {years.map((yr,i)=><Bar key={yr} dataKey={"dsr_"+yr} name={String(yr)} fill={yearColors[i%yearColors.length]} radius={[2,2,0,0]}/>)}
              {years.map((yr,i)=> yoyData.some(r=>r["oos_"+yr]>0) ? <Line key={"oos"+yr} dataKey={"oos_"+yr} name={yr+" OOS"} stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="4 2"/> : null)}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* DOC Timeline */}
      {chartData.length > 0 && (
        <div className="bg-gray-800/40 rounded-lg p-3">
          <h3 className="text-sm font-medium text-gray-300 mb-2">DOC & Inventory Timeline</h3>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
              <XAxis dataKey="month" tick={{fill:"#9ca3af",fontSize:10}} tickFormatter={m=>typeof m==='string'?m.slice(5):m}/>
              <YAxis yAxisId="doc" tick={{fill:"#9ca3af",fontSize:11}}/>
              <YAxis yAxisId="inv" orientation="right" tick={{fill:"#9ca3af",fontSize:11}}/>
              <Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,fontSize:12}}/>
              <Legend/>
              <Line yAxisId="doc" dataKey="doc" name="DOC" stroke="#f59e0b" strokeWidth={2} dot={false}/>
              <Bar yAxisId="inv" dataKey="own" name="All-In Own" fill="#3b82f6" opacity={0.5} radius={[2,2,0,0]}/>
              <Bar yAxisId="inv" dataKey="fba" name="FBA" fill="#8b5cf6" opacity={0.5} radius={[2,2,0,0]}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bundles Table */}
      {coreBundles.length > 0 && (
        <div className="bg-gray-800/40 rounded-lg p-3">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Bundles ({coreBundles.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500">
                <th className="text-left px-2 py-1">JLS</th><th className="text-left px-2 py-1">Title</th><th className="text-right px-2 py-1">DSR</th><th className="text-right px-2 py-1">DOC</th><th className="text-right px-2 py-1">FIB Inv</th><th className="text-right px-2 py-1">Price</th><th className="text-right px-2 py-1">GP</th><th className="text-right px-2 py-1">LT Profit</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-800/30">
                {coreBundles.map(b=>{
                  const f = feesMap[b.j]||{};
                  const s = salesMap[b.j]||{};
                  return (
                    <tr key={b.j} className="hover:bg-gray-800/30">
                      <td className="px-2 py-1 font-mono text-blue-400">{b.j}</td>
                      <td className="px-2 py-1 text-gray-300 max-w-[180px] truncate">{b.t}</td>
                      <td className="px-2 py-1 text-right">{fmt(b.fbaDsr,1)}</td>
                      <td className="px-2 py-1 text-right">{fmtD(b.doc)}</td>
                      <td className="px-2 py-1 text-right">{fmtD(b.fibInv)}</td>
                      <td className="px-2 py-1 text-right">{fmtP(f.pr)}</td>
                      <td className="px-2 py-1 text-right text-green-400">{fmtP(f.gp)}</td>
                      <td className="px-2 py-1 text-right text-green-400">{fmtM(s.ltP)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// TAB 3: BUNDLE DETAIL
// ══════════════════════════════════════════
function BundleDetailTab({bundles, sales, fees, cores}) {
  const [search, setSearch] = useState("");
  const [selectedBundle, setSelectedBundle] = useState(null);
  const [histData, setHistData] = useState(null);
  const [loading, setLoading] = useState(false);

  const salesMap = useMemo(()=>{const m={};sales.forEach(s=>m[s.j]=s);return m;},[sales]);
  const feesMap = useMemo(()=>{const m={};fees.forEach(f=>m[f.j]=f);return m;},[fees]);

  const filtered = useMemo(()=>{
    if (!search || search.length < 2) return [];
    const s = search.toLowerCase();
    return bundles.filter(b => b.j.toLowerCase().includes(s) || b.t.toLowerCase().includes(s)).slice(0,10);
  },[bundles, search]);

  const selectBundle = useCallback(async(b)=>{
    setSelectedBundle(b);
    setSearch(b.j);
    setLoading(true);
    setHistData(null);
    try {
      const r = await fetch(API+"?action=bundleSummary&id="+encodeURIComponent(b.j));
      const d = await r.json();
      setHistData(d);
    } catch(e) { console.error(e); }
    setLoading(false);
  },[]);

  // Parse history data
  const salesChart = useMemo(()=>{
    if (!histData?.bundleSales) return [];
    return histData.bundleSales.map(r=>({
      month: typeof r.month==='string' ? (r.month.length>7 ? r.month.slice(0,7) : r.month) : r.month ? new Date(r.month).toISOString().slice(0,7) : '',
      units: r.units||r.Units||0,
      rev: r.rev||r.Revenue||0,
      profit: r.profit||r.Profit||0,
      avgPrice: r.avgPrice||r["Avg Price"]||0
    })).sort((a,b)=>a.month<b.month?-1:1);
  },[histData]);

  const priceChart = useMemo(()=>{
    if (!histData?.priceHist) return [];
    return histData.priceHist.map(r=>({
      month: typeof r.month==='string' ? (r.month.length>7 ? r.month.slice(0,7) : r.month) : r.month ? new Date(r.month).toISOString().slice(0,7) : '',
      avgPrice: r.avgPrice||r["Avg Price"]||0,
      avgGp: r.avgGp||r["Avg GP"]||0,
      avgFee: r.avgFee||r["Avg Total Fee"]||0
    })).sort((a,b)=>a.month<b.month?-1:1);
  },[histData]);

  if (!selectedBundle) return (
    <div className="space-y-3">
      <div className="relative">
        <input className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700" placeholder="Search bundles by JLS # or title..." value={search} onChange={e=>setSearch(e.target.value)}/>
        {filtered.length > 0 && (
          <div className="absolute z-40 w-full bg-gray-800 border border-gray-700 rounded-lg mt-1 max-h-60 overflow-y-auto">
            {filtered.map(b=>(
              <button key={b.j} className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm flex gap-2" onClick={()=>selectBundle(b)}>
                <span className="text-blue-400 font-mono">{b.j}</span>
                <span className="text-gray-300 truncate">{b.t}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-gray-500 text-center py-16">Search and select a bundle to view details</p>
    </div>
  );

  const b = selectedBundle;
  const f = feesMap[b.j] || {};
  const s = salesMap[b.j] || {};
  const margin = f.pr ? (f.gp / f.pr * 100) : 0;

  return (
    <div className="space-y-4">
      <button className="text-xs text-blue-400 hover:text-blue-300" onClick={()=>{setSelectedBundle(null);setSearch("");setHistData(null);}}>← Back to search</button>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-white">{b.j}</h2>
        <span className="text-gray-400 text-sm truncate max-w-md">{b.t}</span>
        {b.core1 && <span className="text-xs text-blue-400">Core: {b.core1}</span>}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {[{l:"FBA DSR",v:fmt(b.fbaDsr,1)},{l:"DOC",v:fmtD(b.doc)},{l:"FIB Inv",v:fmtD(b.fibInv)},{l:"Price",v:fmtP(f.pr)},{l:"GP",v:fmtP(f.gp),c:"text-green-400"},{l:"Margin",v:margin.toFixed(1)+"%"}].map(k=>(
          <div key={k.l} className="bg-gray-800/60 rounded-lg p-2.5">
            <div className="text-gray-500 text-xs">{k.l}</div>
            <div className={`text-white text-lg font-bold ${k.c||""}`}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Profitability */}
      <div className="bg-gray-800/40 rounded-lg p-3">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Profitability</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[{l:"COGS",v:fmtP(f.pdmtCogs)},{l:"AICOGS%",v:f.pr?(f.aicogs/f.pr*100).toFixed(1)+"%":"—"},{l:"BE Price",v:fmtP(f.bePr)},{l:"BE ACoS",v:f.beAcos?(f.beAcos*100).toFixed(1)+"%":"—"}].map(k=>(
            <div key={k.l}><span className="text-gray-500">{k.l}: </span><span className="text-gray-200">{k.v}</span></div>
          ))}
        </div>
      </div>

      {/* Revenue Table */}
      <div className="bg-gray-800/40 rounded-lg p-3">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Revenue</h3>
        <table className="w-full text-xs">
          <thead><tr><th className="text-left text-gray-500 py-1"></th><th className="text-right text-gray-500">Units</th><th className="text-right text-gray-500">Revenue</th><th className="text-right text-gray-500">Profit</th></tr></thead>
          <tbody>
            {[{l:"Lifetime",u:s.ltU,r:s.ltR,p:s.ltP},{l:"Last Year",u:s.lyU,r:s.lyR,p:s.lyP},{l:"This Year",u:s.tyU,r:s.tyR,p:s.tyP},{l:"This Month",u:s.tmU,r:s.tmR,p:s.tmP},{l:"Last 7 Days",u:s.l7U,r:s.l7R,p:s.l7P},{l:"Last 28 Days",u:s.l28U,r:s.l28R,p:s.l28P}].map(r=>(
              <tr key={r.l}><td className="py-1 text-gray-400">{r.l}</td><td className="text-right text-gray-200">{fmtD(r.u)}</td><td className="text-right text-gray-200">{fmtM(r.r)}</td><td className="text-right text-green-400">{fmtM(r.p)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Charts */}
      {loading && <Spinner msg="Loading bundle history..."/>}

      {salesChart.length > 0 && (
        <div className="bg-gray-800/40 rounded-lg p-3">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Sales History</h3>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={salesChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
              <XAxis dataKey="month" tick={{fill:"#9ca3af",fontSize:10}} tickFormatter={m=>m?m.slice(5):""}/>
              <YAxis yAxisId="u" tick={{fill:"#9ca3af",fontSize:11}}/>
              <YAxis yAxisId="r" orientation="right" tick={{fill:"#9ca3af",fontSize:11}}/>
              <Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,fontSize:12}}/>
              <Legend/>
              <Bar yAxisId="u" dataKey="units" name="Units" fill="#3b82f6" radius={[2,2,0,0]}/>
              <Line yAxisId="r" dataKey="rev" name="Revenue" stroke="#22c55e" strokeWidth={2} dot={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {priceChart.length > 0 && (
        <div className="bg-gray-800/40 rounded-lg p-3">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Price & Profit History</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={priceChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
              <XAxis dataKey="month" tick={{fill:"#9ca3af",fontSize:10}} tickFormatter={m=>m?m.slice(5):""}/>
              <YAxis tick={{fill:"#9ca3af",fontSize:11}}/>
              <Tooltip contentStyle={{background:"#1f2937",border:"1px solid #374151",borderRadius:8,fontSize:12}} formatter={v=>"$"+Number(v).toFixed(2)}/>
              <Legend/>
              <Line dataKey="avgPrice" name="Avg Price" stroke="#f59e0b" strokeWidth={2} dot={false}/>
              <Line dataKey="avgGp" name="Avg GP" stroke="#22c55e" strokeWidth={2} dot={false}/>
              <Line dataKey="avgFee" name="Avg Fee" stroke="#ef4444" strokeWidth={1} dot={false} strokeDasharray="4 2"/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// TAB 4: AI ADVISOR
// ══════════════════════════════════════════
function AIAdvisorTab({cores, vendors, sales}) {
  const [selectedCore, setSelectedCore] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(()=>{
    if (!search || search.length < 2) return [];
    return cores.filter(c=>c.id.toLowerCase().includes(search.toLowerCase())||c.ti.toLowerCase().includes(search.toLowerCase())).slice(0,8);
  },[cores,search]);

  const analyze = async()=>{
    const core = cores.find(c=>c.id===selectedCore);
    if(!core) return;
    setLoading(true);
    setAnalysis("");
    const v = vendors.find(vn=>vn.name===core.ven)||{};
    const prompt = `You are an Amazon FBA inventory analyst. Analyze this core product and give a concise recommendation.

Core: ${core.id} - ${core.ti}
DSR: ${core.dsr} | 7D DSR: ${core.d7} | DOC: ${core.doc} days
All-In Own: ${core.own} | FBA: ${core.fba} | Raw: ${core.raw}
Vendor: ${core.ven} | Lead Time: ${v.lt||45}d | Cost: $${core.cost}/pc
MOQ: ${core.moq} pcs | Buffer: ${core.buf} days
Active: ${core.active} | Category: ${core.cat}

Give: 1) BUY/WAIT/MONITOR recommendation 2) Suggested qty if BUY 3) Risk level 4) One creative idea. Keep it under 150 words.`;

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-5-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})
      });
      const d = await r.json();
      setAnalysis(d.content?.[0]?.text || d.error?.message || "No response");
    } catch(e) { setAnalysis("Error: "+e.message); }
    setLoading(false);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-bold text-white">AI Purchase Advisor</h2>
      <div className="relative">
        <input className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700" placeholder="Search core..." value={search} onChange={e=>{setSearch(e.target.value);setSelectedCore("");}}/>
        {filtered.length > 0 && !selectedCore && (
          <div className="absolute z-40 w-full bg-gray-800 border border-gray-700 rounded-lg mt-1 max-h-48 overflow-y-auto">
            {filtered.map(c=>(
              <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm" onClick={()=>{setSelectedCore(c.id);setSearch(c.id+" - "+c.ti);}}>
                <span className="text-blue-400 font-mono">{c.id}</span> <span className="text-gray-400">{c.ti}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button disabled={!selectedCore||loading} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg" onClick={analyze}>
        {loading ? "Analyzing..." : "Analyze"}
      </button>
      {analysis && (
        <div className="bg-gray-800/60 rounded-lg p-4 text-sm text-gray-200 whitespace-pre-wrap border border-gray-700">{analysis}</div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState(0);
  const [data, setData] = useState(null);
  const [dashData, setDashData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({active: true, ignored: false, visible: true});
  const [showSettings, setShowSettings] = useState(false);

  const loadData = useCallback(async()=>{
    setLoading(true);
    setError(null);
    try {
      const [liveRes, dashRes] = await Promise.all([
        fetch(API+"?action=live"),
        fetch(API+"?action=dashboard")
      ]);
      const live = await liveRes.json();
      const dash = await dashRes.json();
      if (live.error) throw new Error(live.error);
      setData(live);
      setDashData(dash);
    } catch(e) { setError(e.message); }
    setLoading(false);
  },[]);

  useEffect(()=>{ loadData(); },[loadData]);

  // Counts for header
  const counts = useMemo(()=>{
    if (!data) return {cr:0,wa:0,he:0};
    const venMap = {};
    data.vendors?.forEach(v=>venMap[v.name]=v);
    let cr=0,wa=0,he=0;
    data.cores?.forEach(c=>{
      if (c.active !== "Yes") return;
      const v = venMap[c.ven]||{};
      const lt = v.lt||45;
      const st = statusLabel(c.doc, lt, c.buf);
      if(st==="critical")cr++;else if(st==="warning")wa++;else he++;
    });
    return {cr,wa,he};
  },[data]);

  // Dashboard chart
  const monthlyChart = useMemo(()=>{
    if (!dashData?.monthlyTotals) return [];
    return dashData.monthlyTotals.map(r=>({
      month: typeof r.Month==='string' ? (r.Month.length>7?r.Month.slice(0,7):r.Month) : r.month ? (typeof r.month==='string'&&r.month.length>7?r.month.slice(0,7):r.month) : '',
      rev: r.Revenue||r.rev||0,
      profit: r.Profit||r.profit||0,
      units: r.Units||r.units||0
    })).filter(r=>r.month).sort((a,b)=>a.month<b.month?-1:1);
  },[dashData]);

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><Spinner msg="Loading live data..."/></div>;
  if (error) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-red-400 p-4"><div><p className="text-lg font-bold">Error loading data</p><p className="text-sm mt-1">{error}</p><button className="mt-3 px-4 py-2 bg-blue-600 text-white rounded text-sm" onClick={loadData}>Retry</button></div></div>;
  if (!data) return null;

  // Allow navigating to core detail from purchasing table
  const goToCore = useCallback((coreId)=>{
    setTab(1);
    setTimeout(()=>window.dispatchEvent(new CustomEvent('selectCore',{detail:coreId})),100);
  },[]);
  const goToBundle = useCallback((jls)=>{
    setTab(2);
    setTimeout(()=>window.dispatchEvent(new CustomEvent('selectBundle',{detail:jls})),100);
  },[]);

  const tabs = ["Purchasing","Core Detail","Bundle Detail","AI Advisor"];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-2.5 flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold text-white">Core Visualizer</h1>
        <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded">LIVE — {data.cores?.length} cores</span>
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

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
          <div className="flex items-center gap-5 text-xs">
            <span className="text-gray-400">Show:</span>
            {[["active","Active"],["ignored","Ignored"],["visible","Visible"]].map(([key,label])=>(
              <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                <button className={`w-9 h-5 rounded-full transition-colors ${filter[key]?"bg-blue-600":"bg-gray-700"}`} onClick={()=>setFilter(f=>({...f,[key]:!f[key]}))}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-0.5 ${filter[key]?"translate-x-4":"translate-x-0"}`}/>
                </button>
                <span className={filter[key]?"text-white":"text-gray-500"}>{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <nav className="bg-gray-900/50 border-b border-gray-800 px-4 flex gap-0">
        {tabs.map((t,i)=>(
          <button key={t} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab===i?"border-blue-500 text-white":"border-transparent text-gray-500 hover:text-gray-300"}`} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </nav>

      {/* Content */}
      <main className="p-4 max-w-[1400px] mx-auto">
        {tab === 0 && <PurchasingTab cores={data.cores||[]} bundles={data.bundles||[]} vendors={data.vendors||[]} sales={data.sales||[]} fees={data.fees||[]} filter={filter} onCoreClick={goToCore}/>}
        {tab === 1 && <CoreDetailTab cores={data.cores||[]} bundles={data.bundles||[]} vendors={data.vendors||[]} sales={data.sales||[]} fees={data.fees||[]} onBundleClick={goToBundle} dashData={monthlyChart}/>}
        {tab === 2 && <BundleDetailTab bundles={data.bundles||[]} sales={data.sales||[]} fees={data.fees||[]} cores={data.cores||[]}/>}
        {tab === 3 && <AIAdvisorTab cores={data.cores||[]} vendors={data.vendors||[]} sales={data.sales||[]}/>}
      </main>
    </div>
  );
}
