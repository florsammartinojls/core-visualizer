import { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ComposedChart, Area } from "recharts";

const API = "https://script.google.com/macros/s/AKfycbxp8ff7uSJouHVPKXz3wcLlu70XbkyVJVt23VP1k4x_ctPza36nZnQXnytAtE4rz2jGxw/exec";

const fmt$ = (v) => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${Math.round(v)}`;
const fmtN = (v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toString();
const SC = {red:{bg:"bg-red-500/10",tx:"text-red-400",dt:"bg-red-500",bd:"border-red-500/30"},yellow:{bg:"bg-yellow-500/10",tx:"text-yellow-400",dt:"bg-yellow-500",bd:"border-yellow-500/30"},green:{bg:"bg-green-500/10",tx:"text-green-400",dt:"bg-green-500",bd:"border-green-500/30"},gray:{bg:"bg-gray-500/10",tx:"text-gray-400",dt:"bg-gray-500",bd:"border-gray-500/30"}};
const TABS = ["Purchasing Priorities","Core Detail","Bundle Detail","AI Advisor"];

const InfoTip = ({tip}) => {
  const [o,setO] = useState(false);
  return (<span className="relative inline-block"><button onClick={e=>{e.stopPropagation();setO(!o);}} className="text-blue-400/60 hover:text-blue-400 text-[9px] ml-0.5 align-super">i</button>{o&&<><div className="fixed inset-0 z-40" onClick={()=>setO(false)}/><div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-gray-900 border border-blue-500/30 rounded-lg text-[11px] text-gray-300 font-normal whitespace-normal shadow-2xl leading-relaxed">{tip}</div></>}</span>);
};

export default function App() {
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [selCore, setSelCore] = useState(null);
  const [selBundle, setSelBundle] = useState(null);
  const [bSearch, setBSearch] = useState("");
  const [vf, setVf] = useState("All");
  const [sf, setSf] = useState("All");
  const [tDOC, setTDOC] = useState(90);
  const [viewMode, setViewMode] = useState("vendor");
  const [sortBy, setSortBy] = useState("priority");
  const [showSettings, setShowSettings] = useState(false);
  const [critMode, setCritMode] = useState("lt");
  const [critCustom, setCritCustom] = useState(45);
  const [warnMode, setWarnMode] = useState("lt_buf");
  const [warnCustom, setWarnCustom] = useState(60);
  const [aiRes, setAiRes] = useState("");
  const [aiLoad, setAiLoad] = useState(false);
  const [aiCore, setAiCore] = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);

  // Fetch data from Google Sheets API
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`${API}?action=all`);
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        setRawData(d);
        setLastUpdate(d.timestamp || new Date().toISOString());
      } catch (e) {
        setError(e.message);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  // Build vendor lookup
  const vendorLookup = useMemo(() => {
    if (!rawData) return {};
    const m = {};
    rawData.vendors.forEach(v => { m[v.name] = v; if (v.code) m[v.code] = v; });
    return m;
  }, [rawData]);

  // Build sales lookup by JLS#
  const salesLookup = useMemo(() => {
    if (!rawData) return {};
    const m = {};
    rawData.sales.forEach(s => { m[s.j] = s; });
    return m;
  }, [rawData]);

  // Build fees lookup by JLS#
  const feesLookup = useMemo(() => {
    if (!rawData) return {};
    const m = {};
    rawData.fees.forEach(f => { m[f.j] = f; });
    return m;
  }, [rawData]);

  // Status function
  const getSt = (c) => {
    const ct = critMode === "lt" ? (c.ltDays || 30) : critCustom;
    const wt = warnMode === "lt_buf" ? (c.ltDays || 30) + c.buf : warnCustom;
    if (!c.d7 || c.d7 === 0) return {l:"No Sales",c:"gray",p:4};
    if (c.doc <= ct) return {l:"Critical",c:"red",p:1};
    if (c.doc <= wt) return {l:"Warning",c:"yellow",p:2};
    return {l:"Healthy",c:"green",p:3};
  };

  // Enrich cores with all data
  const enriched = useMemo(() => {
    if (!rawData) return [];
    return rawData.cores
      .filter(c => c.active !== "No" && c.id && c.id !== "Core-0000")
      .map(c => {
        const vInfo = vendorLookup[c.ven] || {};
        const ltDays = vInfo.lt || 30;
        const allInOwn = c.raw + c.inb + c.pp + c.jfn + c.pq + c.ji + c.fba;

        // Find bundles for this core
        const coreBundles = rawData.bundles
          .filter(b => b.core1 === c.id && b.active !== "No")
          .map(b => {
            const sales = salesLookup[b.j] || {};
            const fees = feesLookup[b.j] || {};
            return {
              j: b.j, t: b.t, asin: b.asin,
              cd: b.cd || 0,
              d7comp: b.d7comp || 0,
              d7fba: b.d7fba || 0,
              fb: b.fibInv || 0,
              pr: fees.pr || 0,
              co: fees.pdmtCogs || b.pdmtCogs || 0,
              gp: fees.gp || 0,
              aicogs: fees.aicogs || b.aicogs || 0,
              totalFee: fees.totalFee || 0,
              beAcos: fees.beAcos || 0,
              oo: (b.fibInv || 0) === 0 && (b.cd || 0) > 0,
              lu: sales.ltU || 0, lr: sales.ltR || 0, lp: sales.ltP || 0,
              tyU: sales.tyU || 0, ty: sales.tyR || 0, tyP: sales.tyP || 0,
              lyU: sales.lyU || 0, ly: sales.lyR || 0, lyP: sales.lyP || 0,
              l7U: sales.l7U || 0, l7R: sales.l7R || 0,
              l28U: sales.l28U || 0, l28R: sales.l28R || 0,
              l84U: sales.l84U || 0, l84R: sales.l84R || 0,
              tmU: sales.tmU || 0, tmR: sales.tmR || 0, tmP: sales.tmP || 0,
              lmU: sales.lmU || 0, lmR: sales.lmR || 0, lmP: sales.lmP || 0,
              lm1U: sales.lm1U || 0, lm1R: sales.lm1R || 0, lm1P: sales.lm1P || 0,
              fibDoc: b.fibDoc || 0,
              compDOC: b.cd > 0 ? Math.floor(allInOwn / b.cd) : 9999,
            };
          });

        const totalBDsr = coreBundles.reduce((s,x) => s + x.cd, 0);
        const jlE = coreBundles.map(b => ({
          ...b,
          pctSales: +(totalBDsr > 0 ? b.cd / totalBDsr * 100 : 0).toFixed(1),
        }));

        const ltProfit = jlE.reduce((s,b) => s + b.lp, 0);
        const ltRev = jlE.reduce((s,b) => s + b.lr, 0);
        const tyRev = jlE.reduce((s,b) => s + b.ty, 0);
        const lyRev = jlE.reduce((s,b) => s + b.ly, 0);
        const oosCount = jlE.filter(b => b.oo).length;
        const wMargin = ltRev > 0 ? (ltProfit/ltRev*100).toFixed(1) : 0;

        const need = Math.max(0, Math.ceil(c.d7 * tDOC) - c.fba);
        const needCost = +(need * c.cost).toFixed(2);
        const docAfterBase = c.d7 > 0 ? Math.floor((c.fba + need) / c.d7) : 9999;
        const trendDir = c.d7 > c.dsr ? "▲" : "▼";

        const coreObj = {
          ...c, ltDays, allInOwn, jl: jlE,
          st: null, need, needCost, docAfterBase, trendDir,
          ltProfit, ltRev, tyRev, lyRev, wMargin, oosCount,
          recheckFlag: false,
          venInfo: vInfo,
        };
        coreObj.st = getSt(coreObj);
        return coreObj;
      });
  }, [rawData, tDOC, critMode, critCustom, warnMode, warnCustom, vendorLookup, salesLookup, feesLookup]);

  const filtered = useMemo(() => {
    let d = enriched;
    if (vf !== "All") d = d.filter(c => c.ven === vf);
    if (sf !== "All") d = d.filter(c => c.st.l === sf);
    return d;
  }, [enriched, vf, sf]);

  const vendors = useMemo(() => ["All", ...new Set(enriched.map(c => c.ven).filter(Boolean))], [enriched]);

  const vendorGrps = useMemo(() => {
    const g = {};
    filtered.forEach(c => { if (!g[c.ven]) g[c.ven] = []; g[c.ven].push(c); });
    return Object.entries(g).map(([v, cores]) => {
      const vi = vendorLookup[v] || {};
      const tN = cores.reduce((s,c) => s+c.need, 0);
      const tC = cores.reduce((s,c) => s+c.needCost, 0);
      const moq$ = vi.moqDollar || 0;
      const moqPcs = vi.moqCases || 0;
      const mm = moq$ > 0 ? tC >= moq$ : moqPcs > 0 ? tN >= moqPcs : true;
      const sf2 = moq$ > 0 ? Math.max(0, moq$ - tC) : moqPcs > 0 ? Math.max(0, moqPcs - tN) : 0;
      const w = Math.min(...cores.map(c => c.st.p));
      const cws = cores.map(c => {
        let sq = c.need;
        if (!mm && c.d7 > 0) {
          const sh = c.d7 / Math.max(.01, cores.reduce((s,x) => s+x.d7, 0));
          if (moq$ > 0) sq = Math.ceil(c.need + (sf2*sh)/Math.max(.001,c.cost));
          else sq = Math.ceil(c.need + sf2*sh);
        }
        return {...c, sq, sqCost:+(sq*c.cost).toFixed(2), sqDOC:c.d7>0?Math.floor((c.fba+sq)/c.d7):9999, totalQ:sq, totalP:+(sq*c.cost).toFixed(2)};
      });
      return {vendor:v, vi, cores:cws, totalNeed:tN, totalCost:tC, meetsMin:mm, shortfall:Math.round(sf2), crit:cores.filter(c=>c.st.c==="red").length, warn:cores.filter(c=>c.st.c==="yellow").length, worst:w, grandP:cws.reduce((s,c)=>s+c.totalP,0)};
    }).sort((a,b) => a.worst - b.worst);
  }, [filtered, tDOC, vendorLookup]);

  const coreFlat = useMemo(() => {
    const s = [...filtered];
    const pe = (c,f) => c.jl.reduce((x,j) => x+(j[f]>0&&j.lr>0?j.lp*(j[f]/j.lr):0),0);
    switch(sortBy) {
      case "lt_profit": return s.sort((a,b) => b.ltProfit-a.ltProfit);
      case "lt_rev": return s.sort((a,b) => b.ltRev-a.ltRev);
      case "ty_rev": return s.sort((a,b) => b.tyRev-a.tyRev);
      case "ty_profit": return s.sort((a,b) => pe(b,"ty")-pe(a,"ty"));
      case "ly_rev": return s.sort((a,b) => b.lyRev-a.lyRev);
      case "ly_profit": return s.sort((a,b) => pe(b,"ly")-pe(a,"ly"));
      default: return s.sort((a,b) => a.st.p-b.st.p || a.doc-b.doc);
    }
  }, [filtered, sortBy]);

  const summary = useMemo(() => ({
    total: enriched.length,
    crit: enriched.filter(c => c.st.c==="red").length,
    warn: enriched.filter(c => c.st.c==="yellow").length,
    ok: enriched.filter(c => c.st.c==="green").length,
  }), [enriched]);

  const searchRes = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return enriched.filter(c => c.id.toLowerCase().includes(q) || c.ti.toLowerCase().includes(q));
  }, [search, enriched]);

  const allBundles = useMemo(() => enriched.flatMap(c => c.jl.map(b => ({...b, coreId:c.id, coreTi:c.ti, ven:c.ven, allInOwn:c.allInOwn}))), [enriched]);
  const bSearchRes = useMemo(() => {
    if (!bSearch) return allBundles.slice(0,30);
    const q = bSearch.toLowerCase();
    return allBundles.filter(b => b.j.toLowerCase().includes(q) || b.t.toLowerCase().includes(q) || (b.coreId||"").toLowerCase().includes(q));
  }, [bSearch, allBundles]);

  const core = selCore ? enriched.find(c => c.id === selCore) : null;

  const bundleDetail = useMemo(() => {
    if (!selBundle) return null;
    const c = enriched.find(x => x.jl.some(b => b.j === selBundle.j));
    if (!c) return null;
    const b = c.jl.find(x => x.j === selBundle.j);
    if (!b) return null;
    return {...b, core: c};
  }, [selBundle, enriched]);

  const runAI = async (cid) => {
    setAiLoad(true); setAiRes("");
    const c = enriched.find(x => x.id === cid);
    if (!c) { setAiRes("Not found."); setAiLoad(false); return; }
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({model:"claude-sonnet-4-5-20250514",max_tokens:1000,messages:[{role:"user",content:`Purchasing advisor Amazon FBA. Concise, 200 words max.\nCORE:${c.id}—${c.ti}|${c.ven}|$${c.cost}/pc|LT:${c.ltDays}d|${c.st.l}\nDSR:${c.dsr}|7D:${c.d7}|DOC:${c.doc}d|FBA:${c.fba}|Own:${c.allInOwn}|OOS:${c.oosCount}\nMargin:${c.wMargin}%|Need${tDOC}d:${c.need}u($${c.needCost})\nBundles:${c.jl.slice(0,5).map(b=>`${b.j}:DSR${b.cd},$${b.pr},GP$${b.gp},${b.oo?"OOS":"ok"}`).join(";")}\nGive:1)BUY/WAIT/MONITOR 2)Qty&timing 3)Risk 4)Idea`}]})
      });
      const data = await r.json();
      setAiRes(data.content?.map(i => i.text||"").join("\n") || "No response");
    } catch(e) { setAiRes("Error: "+e.message); }
    setAiLoad(false);
  };

  const th = "py-2 px-2 text-gray-500 font-medium text-[10px] uppercase tracking-wider";

  // Loading screen
  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-pulse text-4xl mb-4">📊</div>
        <div className="text-blue-400 font-bold text-lg mb-2">Loading Core Visualizer</div>
        <div className="text-gray-500 text-sm">Reading from Google Sheets... (30-90 seconds first time)</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4">❌</div>
        <div className="text-red-400 font-bold text-lg mb-2">Connection Error</div>
        <div className="text-gray-400 text-sm mb-4">{error}</div>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 rounded-lg text-sm">Retry</button>
      </div>
    </div>
  );

  return (
  <div className="min-h-screen bg-gray-950 text-white text-xs">
    <div className="bg-gray-900/80 backdrop-blur border-b border-gray-800 px-4 py-3 sticky top-0 z-30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-blue-400">Core Visualizer</h1>
          <span className="text-[10px] text-gray-600">LIVE — {enriched.length} cores</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-[11px]">
            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">{summary.crit} Crit</span>
            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full">{summary.warn} Warn</span>
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">{summary.ok} OK</span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="text-gray-400 hover:text-white text-sm">⚙️</button>
          <button onClick={() => window.location.reload()} className="text-gray-400 hover:text-white text-[10px] px-2 py-1 bg-gray-800 rounded">↻ Refresh</button>
        </div>
      </div>
      {showSettings && (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-3">
          <div className="text-xs text-gray-300 font-medium mb-3">Semaphore Thresholds</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><div className="text-[10px] text-red-400 font-medium mb-2">🔴 Critical when DOC ≤</div><div className="flex gap-2 items-center"><select value={critMode} onChange={e=>setCritMode(e.target.value)} className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"><option value="lt">Lead Time (per vendor)</option><option value="custom">Custom days</option></select>{critMode==="custom"&&<input type="number" value={critCustom} onChange={e=>setCritCustom(Math.max(1,+e.target.value||30))} className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-center text-white"/>}</div></div>
            <div><div className="text-[10px] text-yellow-400 font-medium mb-2">🟡 Warning when DOC ≤</div><div className="flex gap-2 items-center"><select value={warnMode} onChange={e=>setWarnMode(e.target.value)} className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"><option value="lt_buf">LT + Buffer (per core)</option><option value="custom">Custom days</option></select>{warnMode==="custom"&&<input type="number" value={warnCustom} onChange={e=>setWarnCustom(Math.max(1,+e.target.value||60))} className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-center text-white"/>}</div></div>
          </div>
        </div>
      )}
      <div className="flex gap-1">{TABS.map((t,i) => <button key={t} onClick={()=>setTab(i)} className={`px-4 py-1.5 text-xs rounded-t-lg ${tab===i?"bg-gray-950 text-blue-400 border-t border-x border-gray-700":"text-gray-500 hover:text-gray-300"}`}>{t}</button>)}</div>
    </div>

    <div className="p-4">

    {/* ===== PURCHASING PRIORITIES ===== */}
    {tab===0 && (
      <div>
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <div className="flex bg-gray-800 rounded-lg overflow-hidden border border-gray-700"><button onClick={()=>setViewMode("vendor")} className={`px-3 py-1.5 text-xs ${viewMode==="vendor"?"bg-blue-600 text-white":"text-gray-400"}`}>By Vendor</button><button onClick={()=>setViewMode("core")} className={`px-3 py-1.5 text-xs ${viewMode==="core"?"bg-blue-600 text-white":"text-gray-400"}`}>By Core</button></div>
          {viewMode==="core" && <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300"><option value="priority">Priority</option><option value="lt_profit">LT Profit ↓</option><option value="lt_rev">LT Revenue ↓</option><option value="ty_rev">This Yr Rev ↓</option><option value="ly_rev">Last Yr Rev ↓</option></select>}
          <select value={vf} onChange={e=>setVf(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300">{vendors.map(v=><option key={v} value={v}>{v==="All"?"All Vendors":v}</option>)}</select>
          <select value={sf} onChange={e=>setSf(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300">{["All","Critical","Warning","Healthy","No Sales"].map(s=><option key={s} value={s}>{s==="All"?"All Status":s}</option>)}</select>
          <div className="flex items-center gap-2 ml-auto"><span className="text-[10px] text-gray-400">Target DOC:</span><input type="number" value={tDOC} onChange={e=>setTDOC(Math.max(1,+e.target.value||90))} className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-center text-white"/></div>
        </div>

        {/* CORE VIEW */}
        {viewMode==="core" && (
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-x-auto">
            <table className="w-full text-xs"><thead><tr className="border-b border-gray-700">
              <th className={th} style={{width:20}}></th><th className={`${th} text-left`}>Core</th><th className={`${th} text-left`}>Vendor</th><th className={`${th} text-left hidden xl:table-cell`}>Title</th>
              {sortBy!=="priority"&&<th className={`${th} text-right`}>{sortBy.replace(/_/g," ")}</th>}
              <th className={`${th} text-right`}>C.DSR</th><th className={`${th} text-right`}>7D</th><th className={`${th} text-center`}>▲▼</th><th className={`${th} text-right`}>DOC</th><th className={`${th} text-right`}>All-In</th><th className={`${th} text-center`}>Seas</th><th className={`${th} text-right`}>LT</th>
              <th className="w-px bg-gray-600"></th><th className={`${th} text-right`}>Need $</th><th className={`${th} text-right`}>DOC Aft</th><th className={th}></th>
            </tr></thead><tbody>
            {coreFlat.slice(0, 200).map(c => {
              const sc = SC[c.st.c];
              const pe = (f) => c.jl.reduce((x,j)=>x+(j[f]>0&&j.lr>0?j.lp*(j[f]/j.lr):0),0);
              let sv = null;
              if(sortBy==="lt_profit")sv=fmt$(c.ltProfit);else if(sortBy==="lt_rev")sv=fmt$(c.ltRev);else if(sortBy==="ty_rev")sv=fmt$(c.tyRev);else if(sortBy==="ly_rev")sv=fmt$(c.lyRev);
              return (<tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                <td className="py-2 px-2"><div className={`w-2.5 h-2.5 rounded-full ${sc.dt}`}/></td>
                <td className="py-2 px-2 font-mono text-blue-300 text-[11px]">{c.id}</td>
                <td className="py-2 px-2 text-gray-500 text-[11px] truncate max-w-20">{c.ven}</td>
                <td className="py-2 px-2 text-gray-400 truncate max-w-32 hidden xl:table-cell text-[11px]">{c.ti}</td>
                {sortBy!=="priority"&&<td className="py-2 px-2 text-right font-medium text-yellow-400">{sv}</td>}
                <td className="py-2 px-2 text-right">{c.dsr.toFixed(1)}</td>
                <td className="py-2 px-2 text-right">{c.d7.toFixed(1)}</td>
                <td className={`py-2 px-2 text-center ${c.trendDir==="▲"?"text-green-400":"text-red-400"}`}>{c.trendDir}</td>
                <td className={`py-2 px-2 text-right font-medium ${c.doc<=c.ltDays?"text-red-400":c.doc<=c.ltDays+c.buf?"text-yellow-400":"text-green-400"}`}>{Math.round(c.doc)}</td>
                <td className="py-2 px-2 text-right">{c.allInOwn.toLocaleString()}</td>
                <td className="py-2 px-2 text-center text-gray-700">○</td>
                <td className="py-2 px-2 text-right text-gray-500">{c.ltDays}d</td>
                <td className="w-px bg-gray-600"></td>
                <td className="py-2 px-2 text-right font-medium">{c.need>0?fmt$(c.needCost):"—"}</td>
                <td className="py-2 px-2 text-right text-gray-300">{c.docAfterBase<9999?`${c.docAfterBase}d`:"—"}</td>
                <td className="py-2 px-2"><button onClick={()=>{setSelCore(c.id);setTab(1);}} className="text-blue-400 text-[11px]">View</button></td>
              </tr>);
            })}
            </tbody></table>
          </div>
        )}

        {/* VENDOR VIEW */}
        {viewMode==="vendor" && (
          <div className="space-y-4">{vendorGrps.map(vg => (
            <div key={vg.vendor} className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/80">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-200 text-sm">{vg.vendor}</span>
                    <span className="text-[10px] text-gray-500">{vg.cores.length} cores</span>
                    <span className="text-[10px] px-2 py-0.5 bg-gray-700 rounded text-gray-300">LT:{vg.vi.lt||"?"}d</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    {vg.crit>0&&<span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">{vg.crit}Crit</span>}
                    {vg.warn>0&&<span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full">{vg.warn}Warn</span>}
                    <span className={`px-2 py-0.5 rounded-full font-medium ${vg.meetsMin?"bg-green-500/20 text-green-400":"bg-orange-500/20 text-orange-400"}`}>
                      {vg.meetsMin?"✓MOQ":`Short: $${vg.shortfall}`}
                    </span>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs"><thead><tr className="border-b border-gray-700">
                  <th className={th} style={{width:20}}></th><th className={`${th} text-left`}>Core</th><th className={`${th} text-left hidden xl:table-cell`}>Title</th>
                  <th className={`${th} text-right`}>C.DSR</th><th className={`${th} text-right`}>7D</th><th className={`${th} text-center`}>▲▼</th><th className={`${th} text-right`}>DOC</th><th className={`${th} text-right`}>All-In</th><th className={`${th} text-right`}>LT</th>
                  <th className="w-px bg-gray-600"></th><th className={`${th} text-right`}>Total$</th><th className={`${th} text-right`}>DOC Aft</th><th className={th}></th>
                </tr></thead><tbody>
                {vg.cores.map(c => {
                  const sc = SC[c.st.c];
                  return (<tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                    <td className="py-2 px-2"><div className={`w-2.5 h-2.5 rounded-full ${sc.dt}`}/></td>
                    <td className="py-2 px-2 font-mono text-blue-300 text-[11px]">{c.id}</td>
                    <td className="py-2 px-2 text-gray-400 truncate max-w-32 hidden xl:table-cell text-[11px]">{c.ti}</td>
                    <td className="py-2 px-2 text-right">{c.dsr.toFixed(1)}</td>
                    <td className="py-2 px-2 text-right">{c.d7.toFixed(1)}</td>
                    <td className={`py-2 px-2 text-center ${c.trendDir==="▲"?"text-green-400":"text-red-400"}`}>{c.trendDir}</td>
                    <td className={`py-2 px-2 text-right font-medium ${c.doc<=c.ltDays?"text-red-400":c.doc<=c.ltDays+c.buf?"text-yellow-400":"text-green-400"}`}>{Math.round(c.doc)}</td>
                    <td className="py-2 px-2 text-right">{c.allInOwn.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right text-gray-500">{c.ltDays}d</td>
                    <td className="w-px bg-gray-600"></td>
                    <td className="py-2 px-2 text-right font-medium text-white">{c.totalQ>0?fmt$(c.totalP):"—"}</td>
                    <td className="py-2 px-2 text-right text-gray-300">{c.sqDOC<9999?`${c.sqDOC}d`:"—"}</td>
                    <td className="py-2 px-2"><button onClick={()=>{setSelCore(c.id);setTab(1);}} className="text-blue-400 text-[11px]">View</button></td>
                  </tr>);
                })}
                <tr className="border-t-2 border-gray-600 bg-gray-900/80 text-[11px] font-medium">
                  <td colSpan={9} className="py-2 px-3 text-gray-400">TOTAL</td>
                  <td className="w-px bg-gray-600"></td>
                  <td className="py-2 px-2 text-right text-white font-bold">{fmt$(vg.grandP)}</td>
                  <td colSpan={2}></td>
                </tr>
                </tbody></table>
              </div>
            </div>
          ))}</div>
        )}
      </div>
    )}

    {/* ===== CORE DETAIL ===== */}
    {tab===1 && (
      <div>
        <input type="text" placeholder="Search core #, title..." value={search} onChange={e=>{setSearch(e.target.value);if(e.target.value)setSelCore(null);}} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none mb-4"/>
        {!selCore&&search&&(<div className="bg-gray-800 rounded-xl border border-gray-700 mb-4">{searchRes.length===0?<div className="p-4 text-gray-500">No results</div>:searchRes.slice(0,20).map(c=><div key={c.id} onClick={()=>{setSelCore(c.id);setSearch("");}} className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 hover:bg-gray-750 cursor-pointer"><div className={`w-2.5 h-2.5 rounded-full ${SC[c.st.c].dt}`}/><span className="font-mono text-blue-300">{c.id}</span><span className="text-gray-400">{c.ti}</span></div>)}</div>)}
        {!selCore&&!search&&<div className="text-center py-16 text-gray-600"><div className="text-3xl mb-2">🔍</div>Search or click View</div>}
        {core && (
          <div>
            <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 mb-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-blue-400 font-bold text-base">{core.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${SC[core.st.c].bg} ${SC[core.st.c].tx}`}>{core.st.l}</span>
                    {core.oosCount>0&&<span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400">{core.oosCount} OOS</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{core.ti}</div>
                </div>
                <div className="text-right text-[10px] text-gray-500">{core.ven} · ${core.cost}/pc · LT:{core.ltDays}d · {core.cat}</div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 mb-4">
              {[["C.DSR",core.dsr.toFixed(1),"text-white"],["7D DSR",core.d7.toFixed(1),core.d7>core.dsr?"text-green-400":"text-red-400"],["DOC",`${Math.round(core.doc)}d`,core.doc<=core.ltDays?"text-red-400":"text-green-400"],["All-In Own",core.allInOwn.toLocaleString(),"text-white"],["Inbound",core.inb.toLocaleString(),"text-blue-400"]].map(([l,v,cl])=>
                <div key={l} className="bg-gray-800/60 rounded-lg p-3 border border-gray-700"><div className="text-[10px] text-gray-500">{l}</div><div className={`text-lg font-bold ${cl}`}>{v}</div></div>
              )}
            </div>

            {/* Profitability */}
            <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 mb-4">
              <div className="text-xs text-gray-300 mb-3 font-medium">Profitability (all bundles)</div>
              <table className="w-full text-xs"><thead><tr className="border-b border-gray-700"><th className="py-2 px-3 text-left text-gray-500 text-[10px]"></th><th className="py-2 px-3 text-right text-gray-500 text-[10px]">Lifetime</th><th className="py-2 px-3 text-right text-gray-500 text-[10px]">Last Yr</th><th className="py-2 px-3 text-right text-gray-500 text-[10px]">This Yr</th></tr></thead><tbody>
                <tr className="border-b border-gray-800"><td className="py-2 px-3 text-gray-400">Revenue</td><td className="py-2 px-3 text-right font-bold text-white">{fmt$(core.ltRev)}</td><td className="py-2 px-3 text-right text-gray-300">{fmt$(core.lyRev)}</td><td className="py-2 px-3 text-right text-gray-300">{fmt$(core.tyRev)}</td></tr>
                <tr className="border-b border-gray-800"><td className="py-2 px-3 text-gray-400">Profit</td><td className="py-2 px-3 text-right font-bold text-green-400">{fmt$(core.ltProfit)}</td><td className="py-2 px-3 text-right text-green-400/70">{fmt$(core.jl.reduce((s,b)=>s+(b.ly>0&&b.lr>0?b.lp*(b.ly/b.lr):0),0))}</td><td className="py-2 px-3 text-right text-green-400/70">{fmt$(core.jl.reduce((s,b)=>s+(b.ty>0&&b.lr>0?b.lp*(b.ty/b.lr):0),0))}</td></tr>
                <tr><td className="py-2 px-3 text-gray-400">Margin</td><td className="py-2 px-3 text-right font-bold text-blue-400">{core.wMargin}%</td><td colSpan={2}></td></tr>
              </tbody></table>
            </div>

            {/* Pipeline */}
            <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 mb-4">
              <div className="text-xs text-gray-300 mb-3 font-medium">Inventory Pipeline</div>
              <div className="flex gap-2 items-end">
                {[{n:"Raw",v:core.raw,cl:"bg-amber-500"},{n:"Inbound",v:core.inb,cl:"bg-orange-500"},{n:"Pre-Proc",v:core.pp,cl:"bg-yellow-500"},{n:"JFN",v:core.jfn,cl:"bg-lime-500"},{n:"Proc Q",v:core.pq,cl:"bg-emerald-500"},{n:"JI",v:core.ji,cl:"bg-teal-500"},{n:"FBA",v:core.fba,cl:"bg-blue-500"}].map(s=>{
                  const mx=Math.max(core.raw,core.inb,core.pp,core.jfn,core.pq,core.ji,core.fba,1);
                  return(<div key={s.n} className="flex-1 flex flex-col items-center gap-1"><span className="text-[10px] text-gray-300 font-medium">{s.v.toLocaleString()}</span><div className={`w-full rounded-t-md ${s.cl}`} style={{height:Math.max(8,s.v/mx*100)}}/><span className="text-[9px] text-gray-500">{s.n}</span></div>);
                })}
              </div>
              <div className="mt-2 text-right text-[10px] text-gray-500">Total: <span className="text-white font-medium">{core.allInOwn.toLocaleString()}</span></div>
            </div>

            {/* Bundles */}
            <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 mb-4">
              <div className="text-xs text-gray-300 mb-3 font-medium">Bundles ({core.jl.length}){core.oosCount>0&&<span className="text-red-400 ml-2">{core.oosCount} OOS</span>}</div>
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-gray-700">
                <th className={`${th} text-left`}>JLS</th><th className={`${th} text-left`}>Title</th><th className={`${th} text-right`}>DSR</th><th className={`${th} text-right`}>%</th><th className={`${th} text-right`}>CompDOC</th><th className={`${th} text-right`}>FIBDOC</th>
                <th className="w-px bg-gray-600"></th><th className={`${th} text-right`}>Price</th><th className={`${th} text-right`}>GP</th><th className={`${th} text-right`}>LT Profit</th><th className={`${th} text-center`}>Status</th><th className={th}></th>
              </tr></thead><tbody>
              {[...core.jl].sort((a,b)=>b.cd-a.cd).map(b=>
                <tr key={b.j} className={`border-b border-gray-800 hover:bg-gray-800/50 ${b.oo?"bg-red-500/5":""}`}>
                  <td className="py-2 px-2 font-mono text-blue-300">{b.j}</td>
                  <td className="py-2 px-2 text-gray-400 truncate max-w-36">{b.t}</td>
                  <td className="py-2 px-2 text-right font-medium">{b.cd.toFixed(1)}</td>
                  <td className="py-2 px-2 text-right text-gray-400">{b.pctSales}%</td>
                  <td className={`py-2 px-2 text-right ${b.compDOC<=core.ltDays?"text-red-400":"text-green-400"}`}>{b.compDOC<9999?`${b.compDOC}d`:"∞"}</td>
                  <td className={`py-2 px-2 text-right ${b.fibDoc<=core.ltDays?"text-red-400":"text-green-400"}`}>{b.fibDoc>0?`${Math.round(b.fibDoc)}d`:"∞"}</td>
                  <td className="w-px bg-gray-600"></td>
                  <td className="py-2 px-2 text-right">${b.pr.toFixed(2)}</td>
                  <td className="py-2 px-2 text-right text-green-400">${b.gp.toFixed(2)}</td>
                  <td className="py-2 px-2 text-right text-green-400">{fmt$(b.lp)}</td>
                  <td className="py-2 px-2 text-center">{b.oo?<span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[9px] font-bold">OOS</span>:<span className="text-green-400">●</span>}</td>
                  <td className="py-2 px-2"><button onClick={()=>{setSelBundle({...b,coreId:core.id});setTab(2);}} className="text-blue-400 text-[10px]">Detail</button></td>
                </tr>
              )}
              </tbody></table></div>
            </div>

            {/* Purchase Rec */}
            <div className={`rounded-xl p-4 border-2 ${SC[core.st.c].bg} ${SC[core.st.c].bd}`}>
              <div className="text-xs font-medium text-gray-300 mb-2">Purchase Recommendation</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-gray-500 text-[10px]">Current DOC</span><div className={`font-bold ${core.doc<=core.ltDays?"text-red-400":"text-green-400"}`}>{Math.round(core.doc)}d</div></div>
                <div><span className="text-gray-500 text-[10px]">Qty for {tDOC}d</span><div className="font-bold text-white">{core.need>0?core.need.toLocaleString():"None"}</div></div>
                <div><span className="text-gray-500 text-[10px]">Cost</span><div className="font-bold text-yellow-400">{fmt$(core.needCost)}</div></div>
                <div><span className="text-gray-500 text-[10px]">DOC After</span><div className="font-bold text-blue-400">{core.docAfterBase<9999?`${core.docAfterBase}d`:"∞"}</div></div>
              </div>
            </div>
          </div>
        )}
      </div>
    )}

    {/* ===== BUNDLE DETAIL ===== */}
    {tab===2 && (
      <div>
        <input type="text" placeholder="Search JLS #, title, core..." value={bSearch} onChange={e=>{setBSearch(e.target.value);setSelBundle(null);}} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none mb-4"/>
        {bundleDetail && (
          <div className="mb-6">
            <button onClick={()=>setSelBundle(null)} className="text-blue-400 text-xs mb-3">← Back</button>
            <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-2"><span className="font-mono text-blue-400 font-bold text-sm">{bundleDetail.j}</span><span className="text-gray-400">{bundleDetail.t}</span>{bundleDetail.oo&&<span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px] font-bold">OOS</span>}</div>
                <button onClick={()=>{setSelCore(bundleDetail.core.id);setTab(1);setSearch("");}} className="text-blue-400 text-[10px]">Core→{bundleDetail.core.id}</button>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
                {[["DSR",bundleDetail.cd.toFixed(1),"text-white"],["% Core",`${bundleDetail.pctSales}%`,"text-blue-400"],["CompDOC",bundleDetail.compDOC<9999?`${bundleDetail.compDOC}d`:"∞","text-green-400"],["FIBDOC",bundleDetail.fibDoc>0?`${Math.round(bundleDetail.fibDoc)}d`:"∞","text-green-400"],["FBA",bundleDetail.fb.toLocaleString(),"text-white"],["Price",`$${bundleDetail.pr.toFixed(2)}`,"text-white"]].map(([l,v,cl])=>
                  <div key={l} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700"><div className="text-[10px] text-gray-500">{l}</div><div className={`text-base font-bold ${cl}`}>{v}</div></div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-xs text-gray-300 mb-2 font-medium">Profitability</div>
                  <div className="grid grid-cols-2 gap-3">
                    {[["COGS",`$${bundleDetail.co.toFixed(2)}`,"text-white"],["AICOGS",`${bundleDetail.aicogs.toFixed(1)}%`,"text-gray-400"],["GP",`$${bundleDetail.gp.toFixed(2)}`,"text-green-400"],["Margin",bundleDetail.pr>0?`${(bundleDetail.gp/bundleDetail.pr*100).toFixed(0)}%`:"—","text-blue-400"],["BEACoS",bundleDetail.beAcos>0?`${(bundleDetail.beAcos*100).toFixed(0)}%`:"—","text-orange-400"],["LT Profit",fmt$(bundleDetail.lp),"text-green-400"]].map(([l,v,cl])=>
                      <div key={l}><div className="text-[10px] text-gray-500">{l}</div><div className={`text-sm font-bold ${cl}`}>{v}</div></div>
                    )}
                  </div>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="text-xs text-gray-300 mb-2 font-medium">Revenue</div>
                  <table className="w-full text-xs"><tbody>
                    <tr className="border-b border-gray-800"><td className="py-1 text-gray-500">Lifetime</td><td className="py-1 text-right font-bold text-white">{fmt$(bundleDetail.lr)}</td></tr>
                    <tr className="border-b border-gray-800"><td className="py-1 text-gray-500">Last Yr</td><td className="py-1 text-right">{fmt$(bundleDetail.ly)}</td></tr>
                    <tr className="border-b border-gray-800"><td className="py-1 text-gray-500">This Yr</td><td className="py-1 text-right">{fmt$(bundleDetail.ty)}</td></tr>
                    <tr><td className="py-1 text-gray-500">YoY</td><td className={`py-1 text-right font-bold ${bundleDetail.ty>=bundleDetail.ly?"text-green-400":"text-red-400"}`}>{bundleDetail.ly>0?`${((bundleDetail.ty-bundleDetail.ly)/bundleDetail.ly*100).toFixed(0)}%`:"—"}</td></tr>
                  </tbody></table>
                </div>
              </div>
              {/* Recent sales breakdown */}
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700 mb-4">
                <div className="text-xs text-gray-300 mb-2 font-medium">Recent Sales</div>
                <div className="grid grid-cols-4 gap-3">
                  {[["This Month",bundleDetail.tmU,bundleDetail.tmR],["Last Month",bundleDetail.lmU,bundleDetail.lmR],["Last 7 Days",bundleDetail.l7U,bundleDetail.l7R],["Last 28 Days",bundleDetail.l28U,bundleDetail.l28R]].map(([l,u,r])=>
                    <div key={l}><div className="text-[10px] text-gray-500">{l}</div><div className="text-sm font-bold text-white">{u.toLocaleString()} <span className="text-gray-500 font-normal text-[10px]">({fmt$(r)})</span></div></div>
                  )}
                </div>
              </div>
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                <div className="text-xs text-gray-300 mb-2 font-medium">Price Insight</div>
                <div className="text-[11px] text-gray-400">{bundleDetail.ty<bundleDetail.ly?<span>Revenue <span className="text-red-400 font-medium">down YoY</span>. Consider testing lower price or reducing ad spend.</span>:<span>Revenue <span className="text-green-400 font-medium">up YoY</span>. Current pricing effective.</span>}</div>
              </div>
            </div>
          </div>
        )}
        {!selBundle && (
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-x-auto">
            <table className="w-full text-xs"><thead><tr className="border-b border-gray-700">
              <th className={`${th} text-left`}>JLS</th><th className={`${th} text-left`}>Title</th><th className={`${th} text-left`}>Core</th><th className={`${th} text-right`}>DSR</th><th className={`${th} text-right`}>FIBDOC</th>
              <th className="w-px bg-gray-600"></th><th className={`${th} text-right`}>Price</th><th className={`${th} text-right`}>GP</th><th className={`${th} text-right`}>LT Profit</th><th className={`${th} text-center`}>OOS</th><th className={th}></th>
            </tr></thead><tbody>
            {bSearchRes.map(b =>
              <tr key={b.j+b.coreId} className={`border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer ${b.oo?"bg-red-500/5":""}`} onClick={()=>setSelBundle(b)}>
                <td className="py-2 px-2 font-mono text-blue-300">{b.j}</td>
                <td className="py-2 px-2 text-gray-400 truncate max-w-40">{b.t}</td>
                <td className="py-2 px-2 font-mono text-gray-300">{b.coreId}</td>
                <td className="py-2 px-2 text-right">{b.cd.toFixed(1)}</td>
                <td className="py-2 px-2 text-right">{b.fibDoc>0?`${Math.round(b.fibDoc)}d`:"∞"}</td>
                <td className="w-px bg-gray-600"></td>
                <td className="py-2 px-2 text-right">${b.pr.toFixed(2)}</td>
                <td className="py-2 px-2 text-right text-green-400">${b.gp.toFixed(2)}</td>
                <td className="py-2 px-2 text-right text-green-400">{fmt$(b.lp)}</td>
                <td className="py-2 px-2 text-center">{b.oo?<span className="text-red-400 font-bold">OOS</span>:<span className="text-green-400">●</span>}</td>
                <td className="py-2 px-2"><span className="text-blue-400 text-[10px]">→</span></td>
              </tr>
            )}
            </tbody></table>
          </div>
        )}
      </div>
    )}

    {/* ===== AI ADVISOR ===== */}
    {tab===3 && (
      <div>
        <div className="bg-gray-800/60 rounded-xl p-5 border border-gray-700 mb-4">
          <div className="text-xs text-gray-300 mb-3 font-medium">AI Analysis</div>
          <div className="flex gap-3">
            <select value={aiCore} onChange={e=>setAiCore(e.target.value)} className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
              <option value="">Select core...</option>
              {enriched.sort((a,b)=>a.st.p-b.st.p).slice(0,100).map(c=><option key={c.id} value={c.id}>{c.st.l==="Critical"?"🔴":c.st.l==="Warning"?"🟡":"🟢"} {c.id}—{c.ti.slice(0,35)}</option>)}
            </select>
            <button onClick={()=>aiCore&&runAI(aiCore)} disabled={!aiCore||aiLoad} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-lg text-xs font-medium">{aiLoad?"...":"Analyze"}</button>
          </div>
        </div>
        {aiLoad&&<div className="bg-gray-800/60 rounded-xl p-8 border border-gray-700 text-center animate-pulse text-gray-400">Analyzing...</div>}
        {aiRes&&!aiLoad&&<div className="bg-gray-800/60 rounded-xl p-5 border border-gray-700"><div className="text-xs text-blue-400 mb-3 font-medium">Recommendation</div><div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{aiRes}</div></div>}
        {!aiRes&&!aiLoad&&<div className="text-center py-16 text-gray-600">🤖 Select a core</div>}
      </div>
    )}
    </div>
  </div>
  );
}