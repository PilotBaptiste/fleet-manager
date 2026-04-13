"use client";
import { useState, useMemo } from "react";
import { useFleetData } from "../lib/useFleetData";
import { YEARS, MO, MOS, QL, QM, ALL12, pf, fmt, fmt2, fH, fP, hmToDecimal, decimalToHM, RATE_GROUPS, GLOBAL_RATE_FIELDS, getDynamicRateFields, getAllRateGroups, getRate, getGlobalRate, getActivity, getFlightAct, flightTypeRevenue, loanPayment, calcMonth, aggAC, globAgg, calcMonthWithOverrides, aggACWithOverrides, globAggWithOverrides, breakEvenHours, sensitivityAnalysis, isAircraftActive, isAircraftActiveYear, getFuelTypes, getOilTypes, getFuelPrice, getOilPrice } from "../lib/calc";
import { parseFlightCSV, aggregateFlights } from "../lib/csvImport";
import { parseOpsXLSX } from "../lib/xlsxOpsImport";
import * as XLSX from "xlsx";

export default function FleetApp({ onLogout }) {
  const db = useFleetData();
  const { data, loaded } = db;
  const [year, setYear] = useState(new Date().getFullYear());
  const [mFrom, setMFrom] = useState(0);   // 0 = Jan
  const [mTo, setMTo] = useState(11);       // 11 = Dec
  const [tab, setTab] = useState("dashboard");
  const [modal, setModal] = useState(null);

  // Month range for filtering
  const range = [];
  for (let i = mFrom; i <= mTo; i++) range.push(i);

  if (!loaded) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60vh", color:"#8b93a1" }}>Chargement des données…</div>;

  const tabs = [
    { id:"dashboard", l:"Tableau de bord" },
    { id:"activity", l:"Activité" },
    { id:"rates", l:"Tarifs & Coûts" },
    { id:"ops", l:"Opérations" },
    { id:"loans", l:"Prêts" },
    { id:"sim", l:"Simulation" },
    { id:"import", l:"Import" },
    { id:"fleet", l:"Flotte" },
  ];

  return (
    <div className="app">
      <div className="hdr">
        <div className="hdr-l">
          <div className="logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
          </div>
          <h1>Fleet Finance <span>Suivi financier</span></h1>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <div className="ynav">
            <button onClick={() => setYear(y => Math.max(2022,y-1))}>‹</button>
            <span className="yl">{year}</span>
            <button onClick={() => setYear(y => Math.min(2026,y+1))}>›</button>
          </div>
          <select value={mFrom} onChange={e => { const v = Number(e.target.value); setMFrom(v); if (v > mTo) setMTo(v); }} style={{padding:"5px 8px",border:"1px solid var(--border)",borderRadius:6,fontSize:12,fontFamily:"inherit",background:"var(--bg)",color:"var(--text)"}}>
            {MOS.map((m,i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <span style={{fontSize:12,color:"var(--text3)"}}>→</span>
          <select value={mTo} onChange={e => { const v = Number(e.target.value); setMTo(v); if (v < mFrom) setMFrom(v); }} style={{padding:"5px 8px",border:"1px solid var(--border)",borderRadius:6,fontSize:12,fontFamily:"inherit",background:"var(--bg)",color:"var(--text)"}}>
            {MOS.map((m,i) => <option key={i} value={i}>{m}</option>)}
          </select>
          {(mFrom !== 0 || mTo !== 11) && <button className="btn btn-s" onClick={() => {setMFrom(0);setMTo(11);}} style={{fontSize:11,padding:"4px 8px"}}>Année</button>}
          <button className="btn btn-s" onClick={onLogout}>Déconnexion</button>
        </div>
      </div>

      <div className="tabs">
        {tabs.map(t => <button key={t.id} className={`tab ${tab===t.id?"on":""}`} onClick={() => setTab(t.id)}>{t.l}</button>)}
      </div>

      {tab === "dashboard" && <Dashboard data={data} year={year} range={range} />}
      {tab === "activity" && <Activity data={data} db={db} year={year} range={range} />}
      {tab === "rates" && <Rates data={data} db={db} modal={modal} setModal={setModal} />}
      {tab === "ops" && <Ops data={data} db={db} year={year} modal={modal} setModal={setModal} />}
      {tab === "loans" && <LoansTab data={data} db={db} modal={modal} setModal={setModal} />}
      {tab === "sim" && <Simulation data={data} year={year} range={range} />}
      {tab === "import" && <ImportCSV data={data} db={db} />}
      {tab === "fleet" && <Fleet data={data} db={db} modal={modal} setModal={setModal} year={year} />}
    </div>
  );
}

// ════════ DASHBOARD ════════
function Dashboard({ data, year, range }) {
  const [viewAcId, setViewAcId] = useState(null); // null = overview, else focused aircraft
  const periodLabel = range.length === 12 ? `${year}` : `${MOS[range[0]]}–${MOS[range[range.length-1]]} ${year}`;

  if (!data.aircraft.length) return <div className="card"><div className="empty">Commencez par ajouter vos avions dans l&apos;onglet <strong>Flotte</strong>.</div></div>;

  const activeAc = data.aircraft.filter(ac => isAircraftActiveYear(ac, year, range));
  const focused = viewAcId ? data.aircraft.find(a => a.id === viewAcId) : null;

  const selector = (
    <div className="chips">
      <button className={`chip ${viewAcId===null?"on":""}`} onClick={() => setViewAcId(null)}>Vue d&apos;ensemble</button>
      {activeAc.map(ac => <button key={ac.id} className={`chip ${viewAcId===ac.id?"on":""}`} onClick={() => setViewAcId(ac.id)}>{ac.immat}</button>)}
    </div>
  );

  return (
    <div>
      {selector}
      {focused
        ? <DashboardDetail data={data} ac={focused} year={year} range={range} periodLabel={periodLabel}/>
        : <DashboardOverview data={data} activeAc={activeAc} year={year} range={range} periodLabel={periodLabel} onSelectAc={setViewAcId}/>}
    </div>
  );
}

function DashboardOverview({ data, activeAc, year, range, periodLabel, onSelectAc }) {
  const g = globAgg(data, year, range);
  const gPrev = globAgg(data, year - 1, range);
  const acData = activeAc.map(ac => ({ ac, f: aggAC(data, ac.id, year, range), fPrev: aggAC(data, ac.id, year - 1, range) })).sort((a,b) => b.f.resultat - a.f.resultat);
  const best = acData[0];
  const worst = acData[acData.length - 1];
  const maxAbs = Math.max(1, ...acData.map(x => Math.abs(x.f.resultat)));
  const hasPrev = gPrev.revenu > 0 || gPrev.heures > 0;

  const deltaBadge = (cur, prev) => {
    const d = cur - prev;
    return <span className={`delta ${d>=0?"delta-up":"delta-dn"}`}>{d>=0?"+":""}{fmt(d)}</span>;
  };

  return (
    <div>
      {/* 3 KPI cards — simplifiés */}
      <div className="sg">
        <div className="sc">
          <div className="sc-l">REVENUS</div>
          <div className="sc-v b">{fmt(g.revenu)}</div>
          <div className="sc-s">{hasPrev ? <>vs {year-1} {deltaBadge(g.revenu, gPrev.revenu)}</> : `${fH(g.heures)} de vol`}</div>
        </div>
        <div className="sc">
          <div className="sc-l">DÉPENSES</div>
          <div className="sc-v o">{fmt(g.depenses)}</div>
          <div className="sc-s">{(g.opsCExceptional||0)>0 ? <>dont excep. {fmt(g.opsCExceptional)}</> : (g.heures>0 ? <>{fmt2(g.depenses/g.heures)}/h</> : "—")}</div>
        </div>
        <div className="sc hl" style={{borderColor:g.resultat>=0?"var(--green)":"var(--red)"}}>
          <div className="sc-l" style={{color:g.resultat>=0?"var(--green)":"var(--red)"}}>{g.resultat>=0 ? "✓ BÉNÉFICE" : "✗ DÉFICIT"}</div>
          <div className={`sc-v ${g.resultat>=0?"g":"r"}`}>{g.resultat>=0?"+":""}{fmt(g.resultat)}</div>
          <div className="sc-s">
            Marge {g.revenu>0?fP(g.resultat/g.revenu):"—"}
            {hasPrev && <> · vs {year-1} {deltaBadge(g.resultat, gPrev.resultat)}</>}
          </div>
        </div>
      </div>

      {/* Classement */}
      <div className="card">
        <div className="card-h">
          <h2>Classement par rentabilité <span className="badge">{periodLabel}</span></h2>
          <span className={`tag ${g.resultat>=0?"tag-g":"tag-r"}`} style={{fontSize:13,padding:"5px 14px"}}>{g.resultat>=0?"FLOTTE RENTABLE":"FLOTTE DÉFICITAIRE"}</span>
        </div>
        <div className="card-b">
          {acData.length > 1 && <p style={{fontSize:13,color:"var(--text2)",marginBottom:16,lineHeight:1.6}}>
            Meilleur : <strong style={{color:"var(--accent)"}}>{best.ac.immat}</strong> ({best.f.resultat>=0?"+":""}{fmt(best.f.resultat)}) · Plus coûteux : <strong style={{color:"var(--accent)"}}>{worst.ac.immat}</strong> ({worst.f.resultat>=0?"+":""}{fmt(worst.f.resultat)})
          </p>}
          {acData.map((x,i) => (
            <div className="synth-row" key={x.ac.id} onClick={() => onSelectAc(x.ac.id)} style={{cursor:"pointer"}}>
              <div className="synth-rank">{i+1}</div>
              <div className="synth-immat">{x.ac.immat}</div>
              <div className="synth-bar-wrap">
                <div className="synth-bar" style={{width: `${Math.max(2,(Math.abs(x.f.resultat)/maxAbs)*100)}%`, background: x.f.resultat>=0?"var(--green)":"var(--red)"}}/>
              </div>
              <div className="synth-val" style={{color:x.f.resultat>=0?"var(--green)":"var(--red)"}}>{x.f.resultat>=0?"+":""}{fmt(x.f.resultat)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Aircraft cards grid (replaces wide 13-col table) */}
      <div className="card">
        <div className="card-h">
          <h2>Détail par avion <span className="badge">{periodLabel}</span></h2>
          <span style={{fontSize:11,color:"var(--text3)"}}>Cliquez pour voir les détails</span>
        </div>
        <div className="card-b">
          <div className="ac-grid">
            {acData.map(({ac, f, fPrev}) => {
              const ok = f.resultat >= 0;
              const dRes = f.resultat - fPrev.resultat;
              const acHasPrev = fPrev.revenu > 0 || fPrev.heures > 0;
              return (
                <div key={ac.id} className={`ac-card ${ok?"ok":"bad"}`} onClick={() => onSelectAc(ac.id)}>
                  <div className="ac-card-h">
                    <div>
                      <div className="ac-card-immat">{ac.immat}</div>
                      <div className="ac-card-type">{ac.type}</div>
                    </div>
                    <span className={`tag ${ok?"tag-g":"tag-r"}`}>{ok?"RENTABLE":"DÉFICIT"}</span>
                  </div>
                  <div className="ac-card-grid">
                    <div className="ac-card-stat"><div className="ac-card-stat-l">Heures</div><div className="ac-card-stat-v">{fH(f.heures)}</div></div>
                    <div className="ac-card-stat"><div className="ac-card-stat-l">Mouvements</div><div className="ac-card-stat-v">{f.rotations}</div></div>
                    <div className="ac-card-stat"><div className="ac-card-stat-l">Revenus</div><div className="ac-card-stat-v" style={{color:"var(--accent)"}}>{fmt(f.revenu)}</div></div>
                    <div className="ac-card-stat"><div className="ac-card-stat-l">Dépenses</div><div className="ac-card-stat-v" style={{color:"var(--orange)"}}>{fmt(f.depenses)}</div></div>
                  </div>
                  <div className="ac-card-result">
                    <div>
                      <div className="ac-card-stat-l">Résultat</div>
                      <div className="ac-card-result-v" style={{color:ok?"var(--green)":"var(--red)"}}>{ok?"+":""}{fmt(f.resultat)}</div>
                    </div>
                    {acHasPrev && <div style={{textAlign:"right"}}>
                      <div className="ac-card-stat-l">vs {year-1}</div>
                      <span className={`delta ${dRes>=0?"delta-up":"delta-dn"}`}>{dRes>=0?"+":""}{fmt(dRes)}</span>
                    </div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Monthly result chart */}
      <div className="card">
        <div className="card-h"><h2>Résultat mensuel {year}</h2></div>
        <div className="card-b"><BarChart data={data} year={year}/></div>
      </div>

      {/* Historique (6 cols, fits without scroll) */}
      <div className="card">
        <div className="card-h"><h2>Historique {YEARS[0]} – {YEARS[YEARS.length-1]}</h2></div>
        <div className="tw"><table>
          <thead><tr><th>Année</th><th>Heures</th><th>Revenus</th><th>Dépenses</th><th>Résultat</th><th>Marge</th></tr></thead>
          <tbody>{YEARS.map(y => {
            const gy = globAgg(data,y,ALL12);
            return (<tr key={y} style={y===year?{background:"var(--accent-s)"}:{}}>
              <td className="tx" style={{fontWeight:y===year?700:500}}>{y}</td>
              <td className="num">{fH(gy.heures)}</td>
              <td className="num" style={{color:"var(--accent)"}}>{fmt(gy.revenu)}</td>
              <td className="num">{fmt(gy.depenses)}</td>
              <td className={gy.resultat>=0?"pos":"neg"}>{gy.resultat>=0?"+":""}{fmt(gy.resultat)}</td>
              <td className="num">{gy.revenu>0?fP(gy.resultat/gy.revenu):"—"}</td>
            </tr>);
          })}</tbody>
        </table></div>
      </div>
    </div>
  );
}

function DashboardDetail({ data, ac, year, range, periodLabel }) {
  const f = aggAC(data, ac.id, year, range);
  const fPrev = aggAC(data, ac.id, year - 1, range);
  const be = breakEvenHours(data, ac.id, year, range);
  const beOk = be !== Infinity;
  const beMargin = f.heures - be;
  const bePct = beOk && be > 0 ? f.heures / be : (f.heures > 0 ? 1 : 0);
  const hasPrev = fPrev.revenu > 0 || fPrev.heures > 0;
  const ok = f.resultat >= 0;

  const cmpCard = (label, cur, prev, fmtFn, colorCur) => {
    const d = cur - prev;
    const dCls = d >= 0 ? "delta-up" : "delta-dn";
    return (<div className="cmp-card">
      <div className="cmp-card-l">{label}</div>
      <div className="cmp-card-v" style={{color:colorCur||"var(--text)"}}>{fmtFn(cur)}</div>
      {hasPrev && <>
        <div className="cmp-card-prev">{year-1} : {fmtFn(prev)}</div>
        <span className={`cmp-card-delta ${dCls}`}>{d>=0?"+":""}{fmtFn(d)}</span>
      </>}
    </div>);
  };

  const costItems = [
    {l:"Carburant",v:f.carburant,c:"#d97706"},
    {l:"Huile",v:(f.variable||0)-(f.carburant||0),c:"#7c3aed"},
    {l:"Prêts",v:f.loan,c:"#a78bfa"},
    {l:"Opérations",v:f.opsC,c:"#dc2626"},
  ].filter(x => x.v > 0);

  return (
    <div>
      {/* Header + comparison cards */}
      <div className="card">
        <div className="card-h">
          <h2 style={{color:"var(--accent)"}}>{ac.immat} <span style={{color:"var(--text3)",fontWeight:400}}>— {ac.type}</span> <span className="badge">{periodLabel}</span></h2>
          <span className={`tag ${ok?"tag-g":"tag-r"}`} style={{fontSize:13,padding:"5px 14px"}}>{ok?"RENTABLE":"DÉFICIT"}</span>
        </div>
        <div className="card-b">
          <div className="cmp-grid">
            {cmpCard("Revenus", f.revenu, fPrev.revenu, fmt, "var(--accent)")}
            {cmpCard("Dépenses", f.depenses, fPrev.depenses, fmt, "var(--orange)")}
            {cmpCard("Résultat", f.resultat, fPrev.resultat, fmt, ok?"var(--green)":"var(--red)")}
            {cmpCard("Heures", f.heures, fPrev.heures, fH, "var(--text)")}
          </div>
        </div>
      </div>

      {/* Break-even */}
      <div className="card">
        <div className="card-h"><h2>Seuil de rentabilité</h2></div>
        <div className="card-b">
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14}}>
            <div className="cmp-card"><div className="cmp-card-l">Heures actuelles</div><div className="cmp-card-v">{fH(f.heures)}</div></div>
            <div className="cmp-card"><div className="cmp-card-l">Heures seuil</div><div className="cmp-card-v">{beOk ? fH(be) : "N/A"}</div></div>
            <div className="cmp-card"><div className="cmp-card-l">Marge</div><div className="cmp-card-v" style={{color:beMargin>=0?"var(--green)":"var(--red)"}}>{beOk ? (beMargin>=0?"+":"") + fH(beMargin) : "—"}</div></div>
            <div className="cmp-card"><div className="cmp-card-l">Atteinte</div><div className="cmp-card-v">{beOk ? fP(bePct) : "—"}</div></div>
          </div>
          {beOk && <div style={{marginTop:16,height:12,background:"var(--bg3)",borderRadius:6,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${Math.min(100,bePct*100)}%`,background:bePct>=1?"var(--green)":bePct>=0.7?"var(--orange)":"var(--red)",borderRadius:6,transition:"width .3s"}}/>
          </div>}
        </div>
      </div>

      {/* Cost decomposition */}
      {costItems.length > 0 && <div className="card">
        <div className="card-h"><h2>Décomposition des dépenses</h2></div>
        <div className="card-b">
          {costItems.map((it,i) => <div className="cb-row" key={i}>
            <div className="cb-dot" style={{background:it.c}}/>
            <div className="cb-label">{it.l}</div>
            <div className="cb-bar-wrap"><div className="cb-bar" style={{width:`${(it.v/f.depenses*100).toFixed(1)}%`,background:it.c}}/></div>
            <div className="cb-val">{fmt(it.v)}</div>
            <div className="cb-pct">{fP(it.v/f.depenses)}</div>
          </div>)}
        </div>
      </div>}

      {/* Monthly evolution for this aircraft */}
      <div className="card">
        <div className="card-h"><h2>Résultat mensuel {year} — {ac.immat}</h2></div>
        <div className="card-b"><BarChart data={data} year={year} acId={ac.id}/></div>
      </div>
    </div>
  );
}

function BarChart({ data, year, acId }) {
  const res = MOS.map((_,i) => {
    if (acId) {
      const ac = data.aircraft.find(a => a.id === acId);
      return ac && isAircraftActive(ac, year, i) ? calcMonth(data, acId, year, i).resultat : 0;
    }
    let r = 0;
    data.aircraft.filter(ac => isAircraftActive(ac, year, i)).forEach(ac => { r += calcMonth(data,ac.id,year,i).resultat; });
    return r;
  });
  const mx = Math.max(1,...res.map(Math.abs));
  return (<div className="bc">{MOS.map((m,i) => {
    const v = res[i]; const h = Math.max(4,(Math.abs(v)/mx)*140);
    return (<div className="bc-c" key={i}><div className="bc-v">{v!==0?fmt(v):""}</div><div className="bc-b" style={{height:h,background:v>=0?"var(--green)":"var(--red)",opacity:v===0?.2:.8}}/><div className="bc-l">{m}</div></div>);
  })}</div>);
}

// ════════ ACTIVITY ════════
function HMInput({ value, onChange, style, placeholder }) {
  const [raw, setRaw] = useState(value ? decimalToHM(value) : "");
  const prev = value ? decimalToHM(value) : "";
  // Sync from outside only if value changed externally
  const [lastSaved, setLastSaved] = useState(prev);
  if (prev !== lastSaved && prev !== decimalToHM(hmToDecimal(raw))) { setRaw(prev); setLastSaved(prev); }
  const commit = () => {
    const dec = hmToDecimal(raw);
    const formatted = dec > 0 ? decimalToHM(dec) : "";
    setRaw(formatted);
    setLastSaved(formatted);
    onChange(dec);
  };
  return <input type="text" placeholder={placeholder||"0:00"} value={raw} onChange={e=>setRaw(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();}} style={style}/>;
}

function Activity({ data, db, year, range }) {
  const [acId, setAcId] = useState(data.aircraft[0]?.id || null);
  const [sub, setSub] = useState("standard");
  const [ftModal, setFtModal] = useState(null); // null | "add" | ftId (edit)
  const [ftForm, setFtForm] = useState({ name:"", color:"#6b7280", mode:"tarif", tarifKey:"", tarifKey2:"", tarifKey3:"", sortOrder:0 });
  const inpSt = {padding:"6px 10px",border:"1px solid var(--border)",borderRadius:6,fontSize:14,fontFamily:"inherit",outline:"none",background:"var(--bg)"};
  const inpSm = {...inpSt, width:60};
  const inpN = {...inpSt, width:55, textAlign:"center"};
  const inpE = {...inpSt, width:80};
  if (!data.aircraft.length) return <div className="card"><div className="empty">Ajoutez des avions dans Flotte.</div></div>;

  const flightTypes = data.flightTypes || [];
  const save = (i, field, val) => { db.setMonthly(acId, year, i, { [field]: pf(val) }); };
  const saveHM = (i, field, val) => { db.setMonthly(acId, year, i, { [field]: val }); };
  const saveFa = (ftId, i, field, val) => { db.setFlightActivity(acId, ftId, year, i, { [field]: pf(val) }); };
  const saveFaHM = (ftId, i, field, val) => { db.setFlightActivity(acId, ftId, year, i, { [field]: val }); };

  const rows = range.map(i => {
    const act = getActivity(data,acId,year,i);
    const c = calcMonth(data,acId,year,i);
    return { i, act, c };
  });

  const agg = aggAC(data, acId, year, range);
  const periodLabel = range.length === 12 ? `${year}` : `${MOS[range[0]]}–${MOS[range[range.length-1]]} ${year}`;
  const acLabel = data.aircraft.find(a=>a.id===acId)?.immat;
  const tfSt = {borderTop:"2px solid var(--text)",background:"var(--bg-2,#f8f9fb)"};
  const tfTd = {fontWeight:700,padding:"14px 12px"};

  // Dynamic sub-tabs: standard + each flight type + resume + manage
  const subs = [
    {id:"standard",l:"Standard"},
    ...flightTypes.map(ft => ({id:`ft-${ft.id}`,l:ft.name,ft})),
    {id:"resume",l:"Résumé"},
    {id:"manage",l:"⚙ Gérer"},
  ];

  // ── Flight type CRUD ──
  const openAddFt = () => {
    setFtForm({ name:"", color:"#6b7280", mode:"tarif", tarifKey:"", tarifKey2:"", tarifKey3:"", sortOrder: (flightTypes.length+1)*10 });
    setFtModal("add");
  };
  const openEditFt = (ft) => {
    setFtForm({ name:ft.name, color:ft.color, mode:ft.mode, tarifKey:ft.tarifKey||"", tarifKey2:ft.tarifKey2||"", tarifKey3:ft.tarifKey3||"", sortOrder:ft.sortOrder||0 });
    setFtModal(ft.id);
  };
  const autoKey = (name) => "tarif" + name.replace(/[^a-zA-Z0-9]/g,"");
  const saveFt = async () => {
    if (!ftForm.name.trim()) return;
    const payload = {
      name: ftForm.name.trim(), color: ftForm.color, mode: ftForm.mode, sortOrder: pf(ftForm.sortOrder),
      tarifKey: ftForm.mode !== "direct" ? (ftForm.tarifKey || autoKey(ftForm.name)) : null,
      tarifKey2: ftForm.mode === "pax3" ? (ftForm.tarifKey2 || autoKey(ftForm.name)+"2pax") : null,
      tarifKey3: ftForm.mode === "pax3" ? (ftForm.tarifKey3 || autoKey(ftForm.name)+"3pax") : null,
    };
    if (ftModal === "add") await db.addFlightType(payload);
    else await db.updateFlightType(ftModal, payload);
    setFtModal(null);
  };
  const deleteFt = async (id) => {
    if (!confirm("Supprimer ce type de vol et toute son activité ?")) return;
    await db.deleteFlightType(id);
    if (sub === `ft-${id}`) setSub("standard");
  };

  // ── Render a flight type sub-tab ──
  const renderFlightTypeTab = (ft) => {
    const ftAgg = agg.ftRevenues[ft.id] || { heures:0, vols:0, vols2:0, vols3:0, revenu:0 };
    const ftColor = ft.color || "var(--accent)";

    if (ft.mode === "pax3") {
      return (<div className="card">
        <div className="card-h"><h2>{ft.name} <span className="badge">{acLabel} · {periodLabel}</span></h2></div>
        <p style={{fontSize:12,color:"var(--text3)",padding:"12px 20px 0"}}>Nb vols par catégorie passagers. Revenu = vols × tarif (défini dans Tarifs & Coûts).</p>
        <div className="tw"><table>
          <thead><tr><th>Mois</th><th>1 pax</th><th>2 pax</th><th>3 pax</th><th>Heures</th><th style={{color:ftColor}}>Revenu €</th></tr></thead>
          <tbody>{rows.map(r => {
            const fa = getFlightAct(data, acId, ft.id, year, r.i);
            const rev = (r.c.ftRevenues[ft.id]||{}).revenu || 0;
            return (<tr key={`ft-${ft.id}-${acId}-${r.i}`}>
              <td className="tx" style={{fontWeight:600}}>{MOS[r.i]}</td>
              <td><input type="number" min="0" step="1" value={fa.vols||""} placeholder="0" onChange={e=>saveFa(ft.id,r.i,"vols",e.target.value)} style={inpN}/></td>
              <td><input type="number" min="0" step="1" value={fa.vols2||""} placeholder="0" onChange={e=>saveFa(ft.id,r.i,"vols2",e.target.value)} style={inpN}/></td>
              <td><input type="number" min="0" step="1" value={fa.vols3||""} placeholder="0" onChange={e=>saveFa(ft.id,r.i,"vols3",e.target.value)} style={inpN}/></td>
              <td><HMInput value={fa.heures} onChange={v=>saveFaHM(ft.id,r.i,"heures",v)} style={inpSm}/></td>
              <td className="num" style={{color:ftColor,fontWeight:600}}>{rev>0?fmt(rev):"—"}</td>
            </tr>);
          })}</tbody>
          <tfoot><tr style={tfSt}>
            <td className="tx" style={{fontWeight:800,fontSize:13,...tfTd}}>TOTAL</td>
            <td className="num" style={{color:ftColor,...tfTd}}>{ftAgg.vols||"—"}</td>
            <td className="num" style={{color:ftColor,...tfTd}}>{ftAgg.vols2||"—"}</td>
            <td className="num" style={{color:ftColor,...tfTd}}>{ftAgg.vols3||"—"}</td>
            <td className="num" style={tfTd}>{fH(ftAgg.heures)}</td>
            <td className="num" style={{color:ftColor,fontWeight:800,fontSize:15,...tfTd}}>{fmt(ftAgg.revenu)}</td>
          </tr>
          <tr style={{background:"var(--bg-2,#f8f9fb)"}}>
            <td className="tx" style={{...tfTd,fontWeight:600,color:"var(--text3)"}}>Total vols</td>
            <td colSpan="5" className="num" style={{...tfTd,fontWeight:800,fontSize:15}}>{ftAgg.vols+ftAgg.vols2+ftAgg.vols3} vol{(ftAgg.vols+ftAgg.vols2+ftAgg.vols3)>1?"s":""}</td>
          </tr></tfoot>
        </table></div>
      </div>);
    }

    if (ft.mode === "direct") {
      return (<div className="card">
        <div className="card-h"><h2>{ft.name} <span className="badge">{acLabel} · {periodLabel}</span></h2></div>
        <p style={{fontSize:12,color:"var(--text3)",padding:"12px 20px 0"}}>Revenu saisi directement (prix variable par vol).</p>
        <div className="tw"><table>
          <thead><tr><th>Mois</th><th>Heures</th><th>Nb vols</th><th style={{color:ftColor}}>Revenu €</th></tr></thead>
          <tbody>{rows.map(r => {
            const fa = getFlightAct(data, acId, ft.id, year, r.i);
            return (<tr key={`ft-${ft.id}-${acId}-${r.i}`}>
              <td className="tx" style={{fontWeight:600}}>{MOS[r.i]}</td>
              <td><HMInput value={fa.heures} onChange={v=>saveFaHM(ft.id,r.i,"heures",v)} style={inpSm}/></td>
              <td><input type="number" min="0" step="1" value={fa.vols||""} placeholder="0" onChange={e=>saveFa(ft.id,r.i,"vols",e.target.value)} style={inpN}/></td>
              <td><input type="number" min="0" step="1" value={fa.revenu||""} placeholder="0 €" onChange={e=>saveFa(ft.id,r.i,"revenu",e.target.value)} style={inpE}/></td>
            </tr>);
          })}</tbody>
          <tfoot><tr style={tfSt}>
            <td className="tx" style={{fontWeight:800,fontSize:13,...tfTd}}>TOTAL</td>
            <td className="num" style={tfTd}>{fH(ftAgg.heures)}</td>
            <td className="num" style={{color:ftColor,...tfTd}}>{ftAgg.vols||"—"}</td>
            <td className="num" style={{color:ftColor,fontWeight:800,fontSize:15,...tfTd}}>{fmt(ftAgg.revenu)}</td>
          </tr></tfoot>
        </table></div>
      </div>);
    }

    // mode === "tarif" (default)
    return (<div className="card">
      <div className="card-h"><h2>{ft.name} <span className="badge">{acLabel} · {periodLabel}</span></h2></div>
      <p style={{fontSize:12,color:"var(--text3)",padding:"12px 20px 0"}}>Revenu = nb vols × tarif (défini dans Tarifs & Coûts).</p>
      <div className="tw"><table>
        <thead><tr><th>Mois</th><th>Heures</th><th>Nb vols</th><th style={{color:ftColor}}>Revenu €</th></tr></thead>
        <tbody>{rows.map(r => {
          const fa = getFlightAct(data, acId, ft.id, year, r.i);
          const rev = (r.c.ftRevenues[ft.id]||{}).revenu || 0;
          return (<tr key={`ft-${ft.id}-${acId}-${r.i}`}>
            <td className="tx" style={{fontWeight:600}}>{MOS[r.i]}</td>
            <td><HMInput value={fa.heures} onChange={v=>saveFaHM(ft.id,r.i,"heures",v)} style={inpSm}/></td>
            <td><input type="number" min="0" step="1" value={fa.vols||""} placeholder="0" onChange={e=>saveFa(ft.id,r.i,"vols",e.target.value)} style={inpN}/></td>
            <td className="num" style={{color:ftColor,fontWeight:600}}>{rev>0?fmt(rev):"—"}</td>
          </tr>);
        })}</tbody>
        <tfoot><tr style={tfSt}>
          <td className="tx" style={{fontWeight:800,fontSize:13,...tfTd}}>TOTAL</td>
          <td className="num" style={tfTd}>{fH(ftAgg.heures)}</td>
          <td className="num" style={{color:ftColor,...tfTd}}>{ftAgg.vols||"—"}</td>
          <td className="num" style={{color:ftColor,fontWeight:800,fontSize:15,...tfTd}}>{fmt(ftAgg.revenu)}</td>
        </tr></tfoot>
      </table></div>
    </div>);
  };

  return (<div>
    <div className="sec-t">Avion</div>
    <div className="chips">{data.aircraft.map(a => <button key={a.id} className={`chip ${acId===a.id?"on":""}`} onClick={() => setAcId(a.id)}>{a.immat} — {a.type}</button>)}</div>

    <div className="chips" style={{marginTop:8}}>{subs.map(s => <button key={s.id} className={`chip ${sub===s.id?"on":""}`} onClick={() => setSub(s.id)} style={s.ft?{borderColor:s.ft.color}:{}}>{s.l}</button>)}</div>

    {/* ── STANDARD ── */}
    {sub === "standard" && <div className="card">
      <div className="card-h"><h2>Vols standard <span className="badge">{acLabel} · {periodLabel}</span></h2></div>
      <p style={{fontSize:12,color:"var(--text3)",padding:"12px 20px 0"}}>Heures au format H:MM. Revenu = (CdB+DC) × tarif horaire. Litres : si renseigné, remplace le calcul conso×heures.</p>
      <div className="tw"><table>
        <thead><tr><th>Mois</th><th style={{color:"var(--accent)"}}>CdB</th><th style={{color:"var(--orange)"}}>DC</th><th>Mvts</th><th>Litres</th><th style={{color:"var(--accent)"}}>Revenu €</th></tr></thead>
        <tbody>{rows.map(r => (<tr key={`s-${acId}-${r.i}`}>
          <td className="tx" style={{fontWeight:600}}>{MOS[r.i]}</td>
          <td><HMInput value={r.act.heures} onChange={v=>saveHM(r.i,"heures",v)} style={inpSm}/></td>
          <td><HMInput value={r.act.heuresDc} onChange={v=>saveHM(r.i,"heuresDc",v)} style={{...inpSm,borderColor:"var(--orange-s)"}}/></td>
          <td><input type="number" step="1" min="0" value={r.act.rotations||""} placeholder="0" onChange={e=>save(r.i,"rotations",e.target.value)} style={{...inpSt,width:60,textAlign:"center",fontWeight:600}}/></td>
          <td><input type="number" step="0.1" min="0" value={r.act.litresCarburant||""} placeholder="0" onChange={e=>save(r.i,"litresCarburant",e.target.value)} style={inpSm}/></td>
          <td className="num" style={{color:"var(--accent)",fontWeight:600}}>{r.c.revenuPilote>0?fmt(r.c.revenuPilote):"—"}</td>
        </tr>))}</tbody>
        <tfoot><tr style={tfSt}>
          <td className="tx" style={{fontWeight:800,fontSize:13,letterSpacing:.5,...tfTd}}>TOTAL</td>
          <td className="num" style={tfTd}>{fH(agg.hCdb)}</td>
          <td className="num" style={{color:"var(--orange)",...tfTd}}>{fH(agg.hDc)}</td>
          <td className="num" style={tfTd}>{agg.rotations}</td>
          <td className="num" style={tfTd}>{agg.litresCarburant>0?Math.round(agg.litresCarburant)+" L":"—"}</td>
          <td className="num" style={{color:"var(--accent)",fontWeight:800,fontSize:15,...tfTd}}>{fmt(agg.revenuPilote)}</td>
        </tr>
        <tr style={{background:"var(--bg-2,#f8f9fb)"}}>
          <td className="tx" style={{...tfTd,fontWeight:600,color:"var(--text3)"}}>Total heures</td>
          <td colSpan="5" className="num" style={{...tfTd,fontWeight:800,fontSize:15}}>{fH(agg.hCdb + agg.hDc)}</td>
        </tr></tfoot>
      </table></div>
    </div>}

    {/* ── DYNAMIC FLIGHT TYPE TABS ── */}
    {flightTypes.map(ft => sub === `ft-${ft.id}` && <div key={ft.id}>{renderFlightTypeTab(ft)}</div>)}

    {/* ── RÉSUMÉ ── */}
    {sub === "resume" && <div className="card">
      <div className="card-h"><h2>Résumé des revenus <span className="badge">{acLabel} · {periodLabel}</span></h2></div>
      <div className="card-b">
        <div className="tw"><table>
          <thead><tr><th>Type de vol</th><th>Heures</th><th>Nb vols</th><th>Revenu</th></tr></thead>
          <tbody>
            <tr><td className="tx" style={{fontWeight:600}}>Standard (CdB+DC)</td><td className="num">{fH(agg.heuresPilote)}</td><td className="num">—</td><td className="num" style={{color:"var(--accent)",fontWeight:700}}>{fmt(agg.revenuPilote)}</td></tr>
            {flightTypes.map(ft => {
              const fa = agg.ftRevenues[ft.id] || { heures:0, vols:0, vols2:0, vols3:0, revenu:0 };
              const totalVols = ft.mode === "pax3" ? fa.vols + fa.vols2 + fa.vols3 : fa.vols;
              return <tr key={ft.id}><td className="tx" style={{fontWeight:600}}><span style={{display:"inline-block",width:8,height:8,borderRadius:4,background:ft.color,marginRight:6}}/>{ft.name}</td><td className="num">{fH(fa.heures)}</td><td className="num">{totalVols||"—"}</td><td className="num" style={{color:ft.color,fontWeight:700}}>{fmt(fa.revenu)}</td></tr>;
            })}
          </tbody>
          <tfoot><tr style={tfSt}>
            <td className="tx" style={{fontWeight:800,fontSize:13,...tfTd}}>TOTAL</td>
            <td className="num" style={{...tfTd,fontWeight:800}}>{fH(agg.heures)}</td>
            <td className="num" style={tfTd}></td>
            <td className="num" style={{color:"var(--accent)",fontWeight:800,fontSize:16,...tfTd}}>{fmt(agg.revenu)}</td>
          </tr></tfoot>
        </table></div>
      </div>
    </div>}

    {/* ── MANAGE FLIGHT TYPES ── */}
    {sub === "manage" && <div className="card">
      <div className="card-h"><h2>Gérer les types de vol</h2><button className="btn btn-p btn-s" onClick={openAddFt}>+ Ajouter</button></div>
      <div className="card-b">
        <p style={{fontSize:13,color:"var(--text3)",marginBottom:16}}>Créez, modifiez ou supprimez des types de vol. Chaque type = un onglet dans Activité.</p>
        {flightTypes.length === 0 && <div style={{color:"var(--text3)",fontSize:13}}>Aucun type de vol configuré.</div>}
        {flightTypes.map(ft => (
          <div key={ft.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,border:"1px solid var(--border)",marginBottom:8,background:"var(--bg)"}}>
            <div style={{width:12,height:12,borderRadius:6,background:ft.color,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:14}}>{ft.name}</div>
              <div style={{fontSize:12,color:"var(--text3)"}}>Mode : {ft.mode === "pax3" ? "Multi-passagers" : ft.mode === "direct" ? "Saisie directe" : "Tarif × vols"}{ft.tarifKey ? ` · Clé : ${ft.tarifKey}` : ""}</div>
            </div>
            <button className="btn btn-s" onClick={() => openEditFt(ft)}>Modifier</button>
            <button className="btn btn-s btn-d btn-ghost" onClick={() => deleteFt(ft.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>}

    {/* ── Flight type modal ── */}
    {ftModal && (<div className="mo" onClick={() => setFtModal(null)}><div className="mod" onClick={e => e.stopPropagation()}>
      <div className="mod-h"><h3>{ftModal === "add" ? "Nouveau type de vol" : "Modifier le type de vol"}</h3><button className="btn btn-s btn-ghost" onClick={() => setFtModal(null)}>✕</button></div>
      <div className="mod-b"><div className="fg">
        <div className="fi"><label>Nom</label><input type="text" value={ftForm.name} onChange={e => setFtForm(f=>({...f,name:e.target.value}))}/></div>
        <div className="fi"><label>Couleur</label><input type="color" value={ftForm.color} onChange={e => setFtForm(f=>({...f,color:e.target.value}))}/></div>
        <div className="fi"><label>Mode de calcul</label>
          <select value={ftForm.mode} onChange={e => setFtForm(f=>({...f,mode:e.target.value}))}>
            <option value="tarif">Tarif × nb vols</option>
            <option value="pax3">Multi-passagers (1/2/3 pax)</option>
            <option value="direct">Saisie directe du revenu</option>
          </select>
        </div>
        <div className="fi"><label>Ordre d&apos;affichage</label><input type="number" step="1" value={ftForm.sortOrder} onChange={e => setFtForm(f=>({...f,sortOrder:pf(e.target.value)}))}/></div>
        {ftForm.mode !== "direct" && <div className="fi"><label>Clé tarif{ftForm.mode === "pax3" ? " (1 pax)" : ""}</label><input type="text" value={ftForm.tarifKey} placeholder={autoKey(ftForm.name||"nom")} onChange={e => setFtForm(f=>({...f,tarifKey:e.target.value}))}/></div>}
        {ftForm.mode === "pax3" && <><div className="fi"><label>Clé tarif 2 pax</label><input type="text" value={ftForm.tarifKey2} placeholder={autoKey(ftForm.name||"nom")+"2pax"} onChange={e => setFtForm(f=>({...f,tarifKey2:e.target.value}))}/></div>
        <div className="fi"><label>Clé tarif 3 pax</label><input type="text" value={ftForm.tarifKey3} placeholder={autoKey(ftForm.name||"nom")+"3pax"} onChange={e => setFtForm(f=>({...f,tarifKey3:e.target.value}))}/></div></>}
      </div></div>
      <div className="mod-f"><button className="btn" onClick={() => setFtModal(null)}>Annuler</button><button className="btn btn-p" onClick={saveFt}>Enregistrer</button></div>
    </div></div>)}
  </div>);
}

// ════════ RATES ════════
function Rates({ data, db, modal, setModal }) {
  const [acId, setAcId] = useState(data.aircraft[0]?.id || null);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const [form, setForm] = useState({ field:"", value:"", fromDate:todayStr, global:false, isBool:false });

  const dynamicRateGroups = getAllRateGroups(data.flightTypes);
  const allFieldDefs = [...dynamicRateGroups.flatMap(g => g.fields), ...GLOBAL_RATE_FIELDS];
  const openAdd = (fieldKey, isGlobal) => {
    const def = allFieldDefs.find(f => f.key === fieldKey);
    setForm({field:fieldKey, value:def?.isBool ? "0" : "", fromDate:todayStr, global:isGlobal, isBool:!!def?.isBool});
    setModal("rate");
  };
  const save = async () => {
    if (!form.field) return;
    const [fy,fm,fd] = form.fromDate.split("-").map(Number);
    if (form.global) { await db.addGlobalRate(form.field, pf(form.value), fy, fm-1, fd); }
    else { if (!acId) return; await db.addRate(acId, form.field, pf(form.value), fy, fm-1, fd); }
    setModal(null);
  };

  if (!data.aircraft.length) return <div className="card"><div className="empty">Ajoutez des avions dans Flotte.</div></div>;

  return (<div>
    {/* ── Paramètres club (global) ── */}
    <div className="card">
      <div className="card-h"><h2>Paramètres club</h2></div>
      <div className="card-b">
        <p style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>S&apos;applique à tous les avions.</p>
        {GLOBAL_RATE_FIELDS.map(field => {
          const periods = data.rates.filter(r => r.field===field.key).sort((a,b) => (a.fromYear*400+a.fromMonth*32+(a.fromDay||1)) - (b.fromYear*400+b.fromMonth*32+(b.fromDay||1)));
          return (<div key={field.key} style={{marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div><span style={{fontSize:13,fontWeight:600}}>{field.label}</span>{field.help && <span style={{fontSize:11,color:"var(--text3)",marginLeft:8}}>{field.help}</span>}</div>
              <button className="btn btn-s btn-p" onClick={() => openAdd(field.key, true)}>+ Période</button>
            </div>
            {periods.length === 0 && <div style={{fontSize:13,color:"var(--text3)",padding:"8px 0"}}>Aucune valeur définie</div>}
            {periods.map(p => (<div className="rate-period" key={p.id}>
              <div className="rp-date">À partir du {String(p.fromDay||1).padStart(2,"0")}/{String((p.fromMonth||0)+1).padStart(2,"0")}/{p.fromYear}</div>
              <div className="rp-val">{p.value} min</div>
              <div style={{flex:1}}/>
              <button className="btn btn-s btn-d btn-ghost" onClick={() => db.deleteRate(p.id)}>✕</button>
            </div>))}
          </div>);
        })}

        {/* ── Prix carburant par type ── */}
        <div style={{borderTop:"1px solid var(--border)",paddingTop:16,marginTop:8}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Prix carburant par type</div>
          {getFuelTypes(data.aircraft).map(fType => {
            const rateKey = `prixCarbu_${fType}`;
            const periods = data.rates.filter(r => r.field===rateKey).sort((a,b) => (a.fromYear*400+a.fromMonth*32+(a.fromDay||1)) - (b.fromYear*400+b.fromMonth*32+(b.fromDay||1)));
            const acList = data.aircraft.filter(a => a.carbuType === fType).map(a => a.immat).join(", ");
            return (<div key={fType} style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div><span style={{fontSize:13,fontWeight:600}}>{fType} (€/L)</span><span style={{fontSize:11,color:"var(--text3)",marginLeft:8}}>{acList}</span></div>
                <button className="btn btn-s btn-p" onClick={() => openAdd(rateKey, true)}>+ Période</button>
              </div>
              {periods.length === 0 && <div style={{fontSize:13,color:"var(--text3)",padding:"8px 0"}}>Aucun prix défini</div>}
              {periods.map(p => (<div className="rate-period" key={p.id}>
                <div className="rp-date">À partir du {String(p.fromDay||1).padStart(2,"0")}/{String((p.fromMonth||0)+1).padStart(2,"0")}/{p.fromYear}</div>
                <div className="rp-val">{fmt2(p.value)}/L</div>
                <div style={{flex:1}}/>
                <button className="btn btn-s btn-d btn-ghost" onClick={() => db.deleteRate(p.id)}>✕</button>
              </div>))}
            </div>);
          })}
          {getFuelTypes(data.aircraft).length === 0 && <div style={{fontSize:13,color:"var(--text3)"}}>Configurez les types de carburant dans Flotte.</div>}
        </div>

        {/* ── Prix huile par type ── */}
        <div style={{borderTop:"1px solid var(--border)",paddingTop:16,marginTop:8}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Prix huile par type</div>
          {getOilTypes(data.aircraft).map(oType => {
            const rateKey = `prixHuile_${oType}`;
            const periods = data.rates.filter(r => r.field===rateKey).sort((a,b) => (a.fromYear*400+a.fromMonth*32+(a.fromDay||1)) - (b.fromYear*400+b.fromMonth*32+(b.fromDay||1)));
            const acList = data.aircraft.filter(a => a.huileType === oType).map(a => a.immat).join(", ");
            return (<div key={oType} style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div><span style={{fontSize:13,fontWeight:600}}>{oType} (€/L)</span><span style={{fontSize:11,color:"var(--text3)",marginLeft:8}}>{acList}</span></div>
                <button className="btn btn-s btn-p" onClick={() => openAdd(rateKey, true)}>+ Période</button>
              </div>
              {periods.length === 0 && <div style={{fontSize:13,color:"var(--text3)",padding:"8px 0"}}>Aucun prix défini</div>}
              {periods.map(p => (<div className="rate-period" key={p.id}>
                <div className="rp-date">À partir du {String(p.fromDay||1).padStart(2,"0")}/{String((p.fromMonth||0)+1).padStart(2,"0")}/{p.fromYear}</div>
                <div className="rp-val">{fmt2(p.value)}/L</div>
                <div style={{flex:1}}/>
                <button className="btn btn-s btn-d btn-ghost" onClick={() => db.deleteRate(p.id)}>✕</button>
              </div>))}
            </div>);
          })}
          {getOilTypes(data.aircraft).length === 0 && <div style={{fontSize:13,color:"var(--text3)"}}>Configurez les types d&apos;huile dans Flotte.</div>}
        </div>
      </div>
    </div>

    {/* ── Tarifs par avion ── */}
    <div className="sec-t">Tarifs & coûts par avion</div>
    <div className="chips">{data.aircraft.map(a => <button key={a.id} className={`chip ${acId===a.id?"on":""}`} onClick={() => setAcId(a.id)}>{a.immat}</button>)}</div>
    <p style={{fontSize:13,color:"var(--text3)",marginBottom:20}}>Chaque valeur s&apos;applique à partir de la date indiquée jusqu&apos;à ce qu&apos;une nouvelle la remplace.</p>

    {dynamicRateGroups.map(group => (
      <div className="card" key={group.group}>
        <div className="card-h"><h2>{group.group}</h2></div>
        <div className="card-b">
          {group.fields.map(field => {
            const periods = data.rates.filter(r => r.acId===acId && r.field===field.key).sort((a,b) => (a.fromYear*400+a.fromMonth*32+(a.fromDay||1)) - (b.fromYear*400+b.fromMonth*32+(b.fromDay||1)));
            return (<div key={field.key} style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div><span style={{fontSize:13,fontWeight:600}}>{field.label}</span>{field.help && <span style={{fontSize:11,color:"var(--text3)",marginLeft:8}}>{field.help}</span>}</div>
                <button className="btn btn-s btn-p" onClick={() => openAdd(field.key, false)}>+ Période</button>
              </div>
              {periods.length === 0 && <div style={{fontSize:13,color:"var(--text3)",padding:"8px 0"}}>Aucune valeur définie</div>}
              {periods.map(p => (<div className="rate-period" key={p.id}>
                <div className="rp-date">À partir du {String(p.fromDay||1).padStart(2,"0")}/{String((p.fromMonth||0)+1).padStart(2,"0")}/{p.fromYear}</div>
                <div className="rp-val">{fmt2(p.value)}</div>
                <div style={{flex:1}}/>
                <button className="btn btn-s btn-d btn-ghost" onClick={() => db.deleteRate(p.id)}>✕</button>
              </div>))}
              {periods.length > 0 && <div className="divider"/>}
            </div>);
          })}
        </div>
      </div>
    ))}

    {modal === "rate" && (<div className="mo" onClick={() => setModal(null)}><div className="mod" onClick={e => e.stopPropagation()}>
      <div className="mod-h"><h3>Nouvelle période {form.global?"(club)":""}</h3><button className="btn btn-s btn-ghost" onClick={() => setModal(null)}>✕</button></div>
      <div className="mod-b"><div className="fg">
        <div className="fi"><label>Date d&apos;effet</label><input type="date" value={form.fromDate} onChange={e => setForm(f => ({...f,fromDate:e.target.value}))}/></div>
        <div className="fi"><label>Valeur</label><input type="number" step="0.01" value={form.value} placeholder="0" onChange={e => setForm(f => ({...f,value:e.target.value}))}/></div>
      </div></div>
      <div className="mod-f"><button className="btn" onClick={() => setModal(null)}>Annuler</button><button className="btn btn-p" onClick={save}>Enregistrer</button></div>
    </div></div>)}
  </div>);
}

// ════════ OPS ════════
function Ops({ data, db, year, modal, setModal }) {
  const todayIso = new Date().toISOString().slice(0,10);
  const cats = data.categories || [];
  const defaultCatId = cats[0]?.id || "";
  const [form, setForm] = useState({ id:null, acId:"", opDate: todayIso, cost:"", label:"", desc:"", categoryId: defaultCatId, isExceptional: false });
  const [filterAc, setFilterAc] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterScope, setFilterScope] = useState("year");
  const [showException, setShowException] = useState("all");
  // XLSX import state
  const [impStep, setImpStep] = useState(null); // null | "upload" | "preview" | "done"
  const [impAcId, setImpAcId] = useState(data.aircraft[0]?.id || "");
  const [impCatId, setImpCatId] = useState(defaultCatId);
  const [staged, setStaged] = useState([]);
  const [impWarnings, setImpWarnings] = useState([]);
  const [impBusy, setImpBusy] = useState(false);
  const [impResult, setImpResult] = useState(null);
  const [impError, setImpError] = useState(null);

  const openAdd = () => { setForm({id:null,acId:data.aircraft[0]?.id||"",opDate:todayIso,cost:"",label:"",desc:"",categoryId:defaultCatId,isExceptional:false}); setModal("op"); };
  const openEdit = (o) => { setForm({id:o.id,acId:o.acId,opDate:o.opDate||todayIso,cost:String(o.cost),label:o.label,desc:o.desc||"",categoryId:o.categoryId||"",isExceptional:!!o.isExceptional}); setModal("op"); };
  const save = async () => {
    if (!form.acId || !form.label || !form.opDate) return;
    const payload = { acId:form.acId, opDate:form.opDate, cost:pf(form.cost), label:form.label, desc:form.desc, categoryId:form.categoryId||null, isExceptional:form.isExceptional };
    if (form.id) await db.updateOp(form.id, payload);
    else await db.addOp(payload);
    setModal(null);
  };

  const opDateOf = (o) => o.opDate || (o.year!=null && o.month!=null ? `${o.year}-${String(o.month+1).padStart(2,"0")}-01` : "");
  const fmtDate = (iso) => { if(!iso) return "—"; const [y,m,d]=iso.split("-"); return `${d}/${m}/${y}`; };
  const catById = (id) => cats.find(c => c.id === id);
  const filteredOps = (data.ops||[])
    .filter(o => filterScope==="all" || pf(o.year)===year)
    .filter(o => !filterAc || o.acId===filterAc)
    .filter(o => !filterCat || o.categoryId===filterCat)
    .filter(o => showException==="all" || (showException==="only" ? o.isExceptional : !o.isExceptional))
    .sort((a,b) => (opDateOf(a) < opDateOf(b) ? -1 : 1));

  const byCat = {};
  filteredOps.forEach(o => {
    const k = o.categoryId || "_none";
    if (!byCat[k]) byCat[k] = { cat: catById(o.categoryId), normal:0, exceptional:0, count:0 };
    if (o.isExceptional) byCat[k].exceptional += pf(o.cost); else byCat[k].normal += pf(o.cost);
    byCat[k].count += 1;
  });
  const catSummary = Object.entries(byCat).map(([k,v]) => ({ key:k, ...v, total: v.normal+v.exceptional })).sort((a,b) => b.total - a.total);
  const totalNormal = catSummary.reduce((s,c)=>s+c.normal,0);
  const totalExceptional = catSummary.reduce((s,c)=>s+c.exceptional,0);
  const totalAll = totalNormal + totalExceptional;
  const scopeLabel = filterScope==="all" ? "Tout l'historique" : year;

  // ── XLSX import handlers ──
  const handleXlsxFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImpError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseOpsXLSX(new Uint8Array(ev.target.result));
      if (result.error) { setImpError(result.error); return; }
      const rows = result.rows.map((r, idx) => ({
        _idx: idx,
        date: r.date,
        label: r.label,
        debit: r.debit,
        credit: r.credit,
        cost: r.cost,
        isExceptional: false,
      }));
      setStaged(rows);
      setImpWarnings(result.warnings);
      setImpStep("preview");
    };
    reader.readAsArrayBuffer(file);
  };

  const updateStaged = (idx, field, val) => {
    setStaged(s => s.map(r => r._idx === idx ? { ...r, [field]: val } : r));
  };
  const removeStaged = (idx) => {
    setStaged(s => s.filter(r => r._idx !== idx));
  };

  const doImport = async () => {
    if (!impAcId) return;
    const valid = staged.filter(r => r.cost !== 0);
    if (!valid.length) return;
    setImpBusy(true);
    const opsArr = valid.map(r => ({
      acId: impAcId,
      opDate: r.date,
      cost: Math.abs(r.cost),
      label: r.label + (r.cost < 0 ? " (avoir)" : ""),
      desc: r.credit > 0 ? `Débit: ${r.debit} / Crédit: ${r.credit}` : "",
      categoryId: impCatId || null,
      isExceptional: r.isExceptional,
    }));
    const count = await db.bulkAddOps(opsArr);
    setImpResult({ imported: count, skipped: staged.length - valid.length, total: staged.reduce((s,r) => s + r.cost, 0) });
    setImpBusy(false);
    setImpStep("done");
  };

  const resetImp = () => { setImpStep(null); setStaged([]); setImpWarnings([]); setImpResult(null); setImpError(null); };
  const stagedTotal = staged.reduce((s,r) => s + (r.cost||0), 0);
  const stagedDebits = staged.reduce((s,r) => s + (r.debit||0), 0);
  const stagedCredits = staged.reduce((s,r) => s + (r.credit||0), 0);

  // ── If import is active, show import UI ──
  if (impStep) return (<div>
    {/* Upload step */}
    {impStep === "upload" && (
      <div className="card">
        <div className="card-h"><h2>Import XLSX — Opérations</h2><button className="btn btn-s" onClick={resetImp}>Annuler</button></div>
        <div className="card-b">
          <p style={{fontSize:13,color:"var(--text2)",marginBottom:16,lineHeight:1.8}}>
            Importez vos factures depuis un fichier Excel (.xlsx).<br/>
            Colonnes attendues : <strong>Date</strong>, <strong>Infos</strong> (descriptif), <strong>Débit</strong>, <strong>Crédit</strong> (optionnel).
          </p>
          <div className="fg" style={{marginBottom:20}}>
            <div className="fi">
              <label>Avion pour cet import</label>
              <select value={impAcId} onChange={e=>setImpAcId(e.target.value)}>
                {data.aircraft.map(a=><option key={a.id} value={a.id}>{a.immat} — {a.type}</option>)}
              </select>
            </div>
            <div className="fi">
              <label>Catégorie</label>
              <select value={impCatId} onChange={e=>setImpCatId(e.target.value)}>
                <option value="">— Aucune —</option>
                {cats.map(c=><option key={c.id} value={c.id}>{c.name}{c.accountCode?` (${c.accountCode})`:""}</option>)}
              </select>
            </div>
          </div>
          <div style={{border:"2px dashed var(--border)",borderRadius:12,padding:40,textAlign:"center",background:"var(--bg)"}}>
            <input type="file" accept=".xlsx,.xls" onChange={handleXlsxFile} style={{fontSize:14,fontFamily:"inherit"}}/>
          </div>
          {impError && <div style={{color:"var(--red)",marginTop:16,fontSize:13,fontWeight:600}}>{impError}</div>}
        </div>
      </div>
    )}

    {/* Preview / edit step */}
    {impStep === "preview" && (
      <div>
        <div className="card">
          <div className="card-h">
            <h2>Import pour <span style={{color:"var(--accent)"}}>{data.aircraft.find(a=>a.id===impAcId)?.immat || "?"}</span>
            {impCatId && <> · <span style={{color:catById(impCatId)?.color||"var(--text3)"}}>{catById(impCatId)?.name}</span></>}
            </h2>
            <button className="btn btn-s" onClick={resetImp}>Annuler</button>
          </div>
          <div style={{display:"flex",gap:10,padding:"12px 20px",flexWrap:"wrap",alignItems:"center",borderBottom:"1px solid var(--border)"}}>
            <div className="fi" style={{flex:"0 0 auto",gap:4}}>
              <label style={{fontSize:11}}>Avion</label>
              <select value={impAcId} onChange={e=>setImpAcId(e.target.value)} style={{padding:"4px 8px",fontSize:13}}>
                {data.aircraft.map(a=><option key={a.id} value={a.id}>{a.immat}</option>)}
              </select>
            </div>
            <div className="fi" style={{flex:"0 0 auto",gap:4}}>
              <label style={{fontSize:11}}>Catégorie</label>
              <select value={impCatId} onChange={e=>setImpCatId(e.target.value)} style={{padding:"4px 8px",fontSize:13}}>
                <option value="">— Aucune —</option>
                {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="sg">
          <div className="sc"><div className="sc-l">LIGNES</div><div className="sc-v b">{staged.length}</div></div>
          <div className="sc"><div className="sc-l">DÉBITS</div><div className="sc-v o">{fmt(stagedDebits)}</div></div>
          {stagedCredits > 0 && <div className="sc"><div className="sc-l">CRÉDITS</div><div className="sc-v g">{fmt(stagedCredits)}</div></div>}
          <div className="sc"><div className="sc-l">NET</div><div className="sc-v" style={{color:stagedTotal>=0?"var(--red)":"var(--green)"}}>{fmt(stagedTotal)}</div></div>
        </div>

        {impWarnings.length > 0 && (
          <div className="card" style={{borderColor:"var(--orange)"}}>
            <div className="card-h"><h2 style={{color:"var(--orange)"}}>Avertissements ({impWarnings.length})</h2></div>
            <div className="card-b" style={{maxHeight:150,overflowY:"auto"}}>{impWarnings.slice(0,30).map((w,i) => <div key={i} style={{fontSize:12,color:"var(--text3)",padding:"2px 0"}}>{w}</div>)}</div>
          </div>
        )}

        <div className="card">
          <div className="card-h"><h2>Aperçu — {staged.length} opérations</h2><span style={{fontSize:11,color:"var(--text3)"}}>Modifiez avant import</span></div>
          <div className="tw" style={{maxHeight:500,overflowY:"auto"}}><table>
            <thead><tr><th>Date</th><th>Infos</th><th>Débit</th><th>Crédit</th><th>Net</th><th>Excep.</th><th></th></tr></thead>
            <tbody>{staged.map(r => (
              <tr key={r._idx} style={r.credit > 0 ? {background:"var(--green-s)"} : r.isExceptional ? {background:"rgba(234,88,12,0.06)"} : {}}>
                <td className="tx" style={{fontSize:12,whiteSpace:"nowrap"}}>{fmtDate(r.date)}</td>
                <td className="tx" style={{fontSize:12}}>{r.label}</td>
                <td className="num" style={{color:"var(--red)"}}>{r.debit>0?fmt(r.debit):"—"}</td>
                <td className="num" style={{color:"var(--green)"}}>{r.credit>0?fmt(r.credit):"—"}</td>
                <td className="num" style={{fontWeight:600,color:r.cost>=0?"var(--red)":"var(--green)"}}>{fmt(r.cost)}</td>
                <td style={{textAlign:"center"}}><input type="checkbox" checked={r.isExceptional} onChange={e=>updateStaged(r._idx,"isExceptional",e.target.checked)} style={{width:14,height:14}}/></td>
                <td><button className="btn btn-s btn-d btn-ghost" onClick={()=>removeStaged(r._idx)} style={{padding:"2px 6px"}}>✕</button></td>
              </tr>
            ))}</tbody>
            <tfoot><tr style={{borderTop:"2px solid var(--text)",background:"var(--bg-2,#f8f9fb)"}}>
              <td colSpan={2} className="tx" style={{fontWeight:800,padding:"14px 12px",letterSpacing:.5}}>TOTAL</td>
              <td className="num" style={{color:"var(--red)",fontWeight:700,padding:"14px 12px"}}>{fmt(stagedDebits)}</td>
              <td className="num" style={{color:"var(--green)",fontWeight:700,padding:"14px 12px"}}>{stagedCredits>0?fmt(stagedCredits):"—"}</td>
              <td className="num" style={{fontWeight:800,fontSize:15,padding:"14px 12px",color:stagedTotal>=0?"var(--red)":"var(--green)"}}>{fmt(stagedTotal)}</td>
              <td colSpan={2}></td>
            </tr></tfoot>
          </table></div>
        </div>

        <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:8}}>
          <button className="btn" onClick={resetImp}>Annuler</button>
          <button className="btn btn-p" onClick={doImport} disabled={impBusy || !impAcId}>
            {impBusy ? "Import en cours…" : `Importer ${staged.length} opérations`}
          </button>
        </div>
      </div>
    )}

    {/* Done step */}
    {impStep === "done" && impResult && (
      <div className="card">
        <div className="card-h"><h2 style={{color:"var(--green)"}}>Import terminé</h2></div>
        <div className="card-b" style={{textAlign:"center",padding:40}}>
          <div style={{fontSize:48,marginBottom:12}}>✓</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>{impResult.imported} opération(s) importée(s)</div>
          <div style={{fontSize:14,color:"var(--text2)",marginBottom:4}}>
            Avion : <strong style={{color:"var(--accent)"}}>{data.aircraft.find(a=>a.id===impAcId)?.immat}</strong>
            {impCatId && <> · Catégorie : <strong>{catById(impCatId)?.name}</strong></>}
          </div>
          {impResult.skipped > 0 && <div style={{fontSize:13,color:"var(--text3)"}}>{impResult.skipped} ignorée(s)</div>}
          <button className="btn btn-p" onClick={resetImp} style={{marginTop:20}}>Retour aux opérations</button>
        </div>
      </div>
    )}
  </div>);

  // ── Normal Ops view ──
  return (<div>
    <div className="card">
      <div className="card-h">
        <h2>Opérations & factures — {scopeLabel}</h2>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <button className="btn btn-s" onClick={()=>setModal("cats")}>⚙ Catégories</button>
          <button className="btn btn-s" onClick={()=>setImpStep("upload")}>Import XLSX</button>
          <button className="btn btn-p" onClick={openAdd}>+ Ajouter</button>
        </div>
      </div>
      <div style={{display:"flex",gap:10,padding:"12px 20px",flexWrap:"wrap",alignItems:"center",borderBottom:"1px solid var(--border)"}}>
        <select value={filterScope} onChange={e=>setFilterScope(e.target.value)} style={{padding:"6px 10px",fontSize:13}}>
          <option value="year">Année {year}</option>
          <option value="all">Tout l&apos;historique</option>
        </select>
        <select value={filterAc} onChange={e=>setFilterAc(e.target.value)} style={{padding:"6px 10px",fontSize:13}}>
          <option value="">Tous les avions</option>
          {data.aircraft.map(a=><option key={a.id} value={a.id}>{a.immat}</option>)}
        </select>
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{padding:"6px 10px",fontSize:13}}>
          <option value="">Toutes les catégories</option>
          {cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={showException} onChange={e=>setShowException(e.target.value)} style={{padding:"6px 10px",fontSize:13}}>
          <option value="all">Normales + exceptionnelles</option>
          <option value="exclude">Normales seulement</option>
          <option value="only">Exceptionnelles seulement</option>
        </select>
      </div>
    </div>

    {catSummary.length > 0 && (
      <div className="card">
        <div className="card-h"><h2>Bilan par catégorie <span className="badge">{scopeLabel}</span></h2></div>
        <div className="tw"><table>
          <thead><tr><th>Catégorie</th><th>Compte</th><th>Nb</th><th>Normal</th><th>Exceptionnel</th><th>Total</th><th>%</th></tr></thead>
          <tbody>{catSummary.map(c => {
            const pct = totalAll > 0 ? (c.total / totalAll) * 100 : 0;
            return (<tr key={c.key}>
              <td className="tx">
                <span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:c.cat?.color||"#9ca3af",marginRight:8,verticalAlign:"middle"}}></span>
                <span style={{fontWeight:600}}>{c.cat?.name || "(sans catégorie)"}</span>
              </td>
              <td className="tx" style={{color:"var(--text3)",fontSize:12}}>{c.cat?.accountCode||"—"}</td>
              <td className="num">{c.count}</td>
              <td className="num" style={{color:c.normal>0?"var(--red)":"var(--text3)"}}>{c.normal>0?fmt(c.normal):"—"}</td>
              <td className="num" style={{color:c.exceptional>0?"var(--orange)":"var(--text3)",fontStyle:c.exceptional>0?"italic":"normal"}}>{c.exceptional>0?fmt(c.exceptional):"—"}</td>
              <td className="num" style={{fontWeight:700,color:"var(--red)"}}>{fmt(c.total)}</td>
              <td className="num" style={{color:"var(--text3)",fontSize:12}}>{pct.toFixed(1)}%</td>
            </tr>);
          })}</tbody>
          <tfoot><tr style={{borderTop:"2px solid var(--text)",background:"var(--bg-2,#f8f9fb)"}}>
            <td colSpan={3} className="tx" style={{fontWeight:800,padding:"14px 12px",letterSpacing:.5}}>TOTAL</td>
            <td className="num" style={{color:"var(--red)",fontWeight:700,padding:"14px 12px"}}>{fmt(totalNormal)}</td>
            <td className="num" style={{color:"var(--orange)",fontWeight:700,padding:"14px 12px",fontStyle:"italic"}}>{fmt(totalExceptional)}</td>
            <td className="num" style={{color:"var(--red)",fontWeight:800,fontSize:15,padding:"14px 12px"}}>{fmt(totalAll)}</td>
            <td></td>
          </tr></tfoot>
        </table></div>
      </div>
    )}

    <div className="card">
      <div className="card-h"><h2>Détail des opérations <span className="badge">{filteredOps.length}</span></h2></div>
      {!filteredOps.length ? <div className="empty">Aucune opération avec ces filtres.</div> : (
        <div className="tw"><table>
          <thead><tr><th>Date</th><th>Avion</th><th>Catégorie</th><th>Libellé</th><th>Description</th><th>Coût</th><th></th></tr></thead>
          <tbody>{filteredOps.map(o => {
            const ac = data.aircraft.find(a=>a.id===o.acId);
            const cat = catById(o.categoryId);
            return (<tr key={o.id} style={o.isExceptional?{background:"rgba(234,88,12,0.06)"}:{}}>
              <td className="tx">{fmtDate(opDateOf(o))}</td>
              <td className="tx" style={{color:"var(--accent)",fontWeight:600}}>{ac?.immat||"?"}</td>
              <td>
                {cat ? (
                  <span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 8px",borderRadius:4,background:cat.color+"22",color:cat.color,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:.3}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:cat.color}}></span>
                    {cat.name}
                  </span>
                ) : <span style={{color:"var(--text3)",fontSize:11}}>—</span>}
                {o.isExceptional && <span style={{marginLeft:6,padding:"2px 6px",background:"var(--orange,#ea580c)",color:"#fff",fontSize:9,borderRadius:3,fontWeight:700,letterSpacing:.5}}>EXCEP.</span>}
              </td>
              <td className="tx">{o.label}</td>
              <td className="tx" style={{color:"var(--text3)",fontSize:12}}>{o.desc||""}</td>
              <td className="num" style={{color:"var(--red)",fontWeight:600}}>{fmt(o.cost)}</td>
              <td>
                <button className="btn btn-s btn-ghost" onClick={() => openEdit(o)} style={{marginRight:4}}>✎</button>
                <button className="btn btn-s btn-d btn-ghost" onClick={() => db.deleteOp(o.id)}>✕</button>
              </td>
            </tr>);
          })}</tbody>
          <tfoot><tr style={{borderTop:"2px solid var(--text)",background:"var(--bg-2,#f8f9fb)"}}>
            <td colSpan={5} className="tx" style={{fontWeight:800,padding:"14px 12px",letterSpacing:.5}}>TOTAL FILTRÉ</td>
            <td className="num" style={{color:"var(--red)",fontWeight:800,fontSize:15,padding:"14px 12px"}}>{fmt(totalAll)}</td>
            <td></td>
          </tr></tfoot>
        </table></div>
      )}
    </div>

    {modal==="op" && (<div className="mo" onClick={()=>setModal(null)}><div className="mod" onClick={e=>e.stopPropagation()}>
      <div className="mod-h"><h3>{form.id?"Modifier":"Nouvelle"} facture / opération</h3><button className="btn btn-s btn-ghost" onClick={()=>setModal(null)}>✕</button></div>
      <div className="mod-b">
        <div className="fg" style={{marginBottom:14}}>
          <div className="fi"><label>Avion</label><select value={form.acId} onChange={e=>setForm(f=>({...f,acId:e.target.value}))}>{data.aircraft.map(a=><option key={a.id} value={a.id}>{a.immat}</option>)}</select></div>
          <div className="fi"><label>Catégorie</label><select value={form.categoryId} onChange={e=>setForm(f=>({...f,categoryId:e.target.value}))}>
            <option value="">— Aucune —</option>
            {cats.map(c=><option key={c.id} value={c.id}>{c.name}{c.accountCode?` (${c.accountCode})`:""}</option>)}
          </select></div>
        </div>
        <div className="fg" style={{marginBottom:14}}>
          <div className="fi"><label>Date facture</label><input type="date" value={form.opDate} onChange={e=>setForm(f=>({...f,opDate:e.target.value}))}/></div>
          <div className="fi"><label>Coût (€)</label><input type="number" min="0" step="0.01" value={form.cost} placeholder="0" onChange={e=>setForm(f=>({...f,cost:e.target.value}))}/></div>
        </div>
        <div className="fi" style={{marginBottom:14}}><label>Libellé</label><input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder="GV 2000h, vidange…"/></div>
        <div className="fi" style={{marginBottom:14}}><label>Description</label><textarea value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder="Détails de la facture…"/></div>
        <div className="fi" style={{display:"flex",alignItems:"center",gap:8}}>
          <input type="checkbox" id="exceptional" checked={form.isExceptional} onChange={e=>setForm(f=>({...f,isExceptional:e.target.checked}))} style={{width:16,height:16}}/>
          <label htmlFor="exceptional" style={{cursor:"pointer",margin:0}}>Marquer comme <strong>opération exceptionnelle</strong></label>
        </div>
      </div>
      <div className="mod-f"><button className="btn" onClick={()=>setModal(null)}>Annuler</button><button className="btn btn-p" onClick={save}>Enregistrer</button></div>
    </div></div>)}

    {modal==="cats" && <CategoriesModal data={data} db={db} onClose={()=>setModal(null)}/>}
  </div>);
}

// ════════ CATEGORIES MODAL ════════
function CategoriesModal({ data, db, onClose }) {
  const cats = data.categories || [];
  const [form, setForm] = useState({ id:null, name:"", color:"#6b7280", accountCode:"", sortOrder:100 });
  const reset = () => setForm({ id:null, name:"", color:"#6b7280", accountCode:"", sortOrder:100 });
  const save = async () => {
    if (!form.name) return;
    const payload = { name:form.name, color:form.color, accountCode:form.accountCode, sortOrder:parseInt(form.sortOrder)||0 };
    if (form.id) await db.updateCategory(form.id, payload);
    else await db.addCategory(payload);
    reset();
  };
  const edit = (c) => setForm({ id:c.id, name:c.name, color:c.color, accountCode:c.accountCode, sortOrder:c.sortOrder });
  const del = async (id) => {
    if (!confirm("Supprimer cette catégorie ? Les opérations qui l'utilisent garderont leur montant mais perdront le rattachement.")) return;
    await db.deleteCategory(id);
    if (form.id === id) reset();
  };

  return (<div className="mo" onClick={onClose}><div className="mod" onClick={e=>e.stopPropagation()} style={{maxWidth:760}}>
    <div className="mod-h"><h3>Gestion des catégories</h3><button className="btn btn-s btn-ghost" onClick={onClose}>✕</button></div>
    <div className="mod-b">
      {cats.length > 0 && (
        <div className="tw" style={{marginBottom:18,maxHeight:340,overflowY:"auto"}}><table>
          <thead><tr><th></th><th>Nom</th><th>Compte</th><th>Ordre</th><th></th></tr></thead>
          <tbody>{cats.map(c => (
            <tr key={c.id}>
              <td><span style={{display:"inline-block",width:14,height:14,borderRadius:3,background:c.color}}></span></td>
              <td className="tx" style={{fontWeight:600}}>{c.name}</td>
              <td className="tx" style={{color:"var(--text3)",fontSize:12}}>{c.accountCode||"—"}</td>
              <td className="num">{c.sortOrder}</td>
              <td>
                <button className="btn btn-s btn-ghost" onClick={()=>edit(c)} style={{marginRight:4}}>✎</button>
                <button className="btn btn-s btn-d btn-ghost" onClick={()=>del(c.id)}>✕</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <div style={{borderTop:"1px solid var(--border)",paddingTop:14}}>
        <h4 style={{margin:"0 0 10px",fontSize:13,color:"var(--text2)"}}>{form.id?"Modifier":"Ajouter"} une catégorie</h4>
        <div className="fg" style={{marginBottom:10}}>
          <div className="fi"><label>Nom</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Pneus, Réparation…"/></div>
          <div className="fi"><label>Couleur</label><input type="color" value={form.color} onChange={e=>setForm(f=>({...f,color:e.target.value}))} style={{height:36,padding:2}}/></div>
        </div>
        <div className="fg">
          <div className="fi"><label>Code compta (optionnel)</label><input value={form.accountCode} onChange={e=>setForm(f=>({...f,accountCode:e.target.value}))} placeholder="60625"/></div>
          <div className="fi"><label>Ordre d'affichage</label><input type="number" value={form.sortOrder} onChange={e=>setForm(f=>({...f,sortOrder:e.target.value}))}/></div>
        </div>
      </div>
    </div>
    <div className="mod-f">
      {form.id && <button className="btn" onClick={reset}>Nouvelle</button>}
      <button className="btn btn-p" onClick={save}>{form.id?"Enregistrer":"Ajouter"}</button>
    </div>
  </div></div>);
}

// ════════ LOANS ════════
function LoansTab({ data, db, modal, setModal }) {
  const [form, setForm] = useState({ acId:"", label:"", amount:"", rate:"", durationMonths:"", startYear:2022, startMonth:0 });
  const openAdd = () => { setForm({acId:data.aircraft[0]?.id||"",label:"",amount:"",rate:"",durationMonths:"",startYear:2022,startMonth:0}); setModal("loan"); };
  const save = async () => { if(!form.acId||!form.amount) return; await db.addLoan({...form,amount:pf(form.amount),rate:pf(form.rate),durationMonths:parseInt(form.durationMonths)||0,startYear:parseInt(form.startYear),startMonth:parseInt(form.startMonth)}); setModal(null); };

  return (<div>
    <div className="card">
      <div className="card-h"><h2>Prêts & Amortissements</h2><button className="btn btn-p" onClick={openAdd}>+ Ajouter</button></div>
      {!(data.loans||[]).length ? <div className="empty">Aucun prêt.</div> : (
        <div className="tw"><table>
          <thead><tr><th>Avion</th><th>Libellé</th><th>Montant</th><th>Taux</th><th>Durée</th><th>Début</th><th>Mensualité</th><th></th></tr></thead>
          <tbody>{(data.loans||[]).map(l => {
            const ac = data.aircraft.find(a=>a.id===l.acId);
            const mens = loanPayment(l.amount,l.rate,l.durationMonths);
            return (<tr key={l.id}>
              <td className="tx" style={{color:"var(--accent)",fontWeight:600}}>{ac?.immat||"?"}</td>
              <td className="tx">{l.label||"—"}</td><td className="num">{fmt(l.amount)}</td>
              <td className="num">{l.rate}%</td><td className="num">{l.durationMonths} mois</td>
              <td className="tx">{MOS[l.startMonth]} {l.startYear}</td>
              <td className="num" style={{color:"var(--purple)",fontWeight:600}}>{fmt2(mens)}</td>
              <td><button className="btn btn-s btn-d btn-ghost" onClick={() => db.deleteLoan(l.id)}>✕</button></td>
            </tr>);
          })}</tbody>
        </table></div>
      )}
    </div>
    {modal==="loan" && (<div className="mo" onClick={()=>setModal(null)}><div className="mod" onClick={e=>e.stopPropagation()}>
      <div className="mod-h"><h3>Nouveau prêt</h3><button className="btn btn-s btn-ghost" onClick={()=>setModal(null)}>✕</button></div>
      <div className="mod-b">
        <div className="fg" style={{marginBottom:14}}>
          <div className="fi"><label>Avion</label><select value={form.acId} onChange={e=>setForm(f=>({...f,acId:e.target.value}))}>{data.aircraft.map(a=><option key={a.id} value={a.id}>{a.immat}</option>)}</select></div>
          <div className="fi"><label>Libellé</label><input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder="Achat…"/></div>
        </div>
        <div className="fg" style={{marginBottom:14}}>
          <div className="fi"><label>Montant (€)</label><input type="number" min="0" value={form.amount} placeholder="50000" onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/></div>
          <div className="fi"><label>Taux annuel (%)</label><input type="number" step="0.1" min="0" value={form.rate} placeholder="3.5" onChange={e=>setForm(f=>({...f,rate:e.target.value}))}/></div>
          <div className="fi"><label>Durée (mois)</label><input type="number" min="1" value={form.durationMonths} placeholder="120" onChange={e=>setForm(f=>({...f,durationMonths:e.target.value}))}/></div>
        </div>
        <div className="fg">
          <div className="fi"><label>Année</label><select value={form.startYear} onChange={e=>setForm(f=>({...f,startYear:e.target.value}))}>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
          <div className="fi"><label>Mois</label><select value={form.startMonth} onChange={e=>setForm(f=>({...f,startMonth:e.target.value}))}>{MO.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></div>
        </div>
      </div>
      <div className="mod-f"><button className="btn" onClick={()=>setModal(null)}>Annuler</button><button className="btn btn-p" onClick={save}>Enregistrer</button></div>
    </div></div>)}
  </div>);
}

// ════════ SIMULATION ════════
function Simulation({ data, year, range }) {
  const [mode, setMode] = useState("global");
  const [selAc, setSelAc] = useState(data.aircraft[0]?.id || null);
  const [overrides, setOverrides] = useState({});
  const [scenarios, setScenarios] = useState([]);
  const [globOv, setGlobOv] = useState({}); // { acId: { tarifHeure, heures, rotations, ... } }
  const [beOverrides, setBeOverrides] = useState({});
  const [sensAc, setSensAc] = useState(data.aircraft[0]?.id || null);
  const [sensField, setSensField] = useState("tarifHeure");
  const [excludedAc, setExcludedAc] = useState(new Set());
  const [scenName, setScenName] = useState("");

  const lm = Math.min(11, new Date().getMonth());
  const current = useMemo(() => globAgg(data, year, range), [data, year, range]);

  const setOv = (acId, key, val) => {
    setOverrides(prev => ({ ...prev, [acId]: { ...(prev[acId] || {}), [key]: val } }));
  };
  const clearOv = (acId) => { setOverrides(prev => { const n = {...prev}; delete n[acId]; return n; }); };

  const modes = [
    {id:"global",l:"Projection globale"},{id:"aircraft",l:"Par avion"},{id:"breakeven",l:"Seuil de rentabilité"},
    {id:"sensitivity",l:"Sensibilité"},{id:"fleet",l:"Ajout / Retrait"},
  ];

  if (!data.aircraft.length) return <div className="card"><div className="empty">Ajoutez des données pour simuler.</div></div>;

  // ── MODE: Global projection ──
  const setGOv = (acId, key, val) => {
    setGlobOv(prev => ({ ...prev, [acId]: { ...(prev[acId] || {}), [key]: val } }));
  };

  const GlobalMode = () => {
    const items = data.aircraft.filter(ac => isAircraftActiveYear(ac, year, range)).map(ac => {
      const cur = aggAC(data, ac.id, year, range);
      const ov = globOv[ac.id] || {};
      const proj = Object.keys(ov).length > 0 ? aggACWithOverrides(data, ac.id, year, range, ov) : cur;
      return { ac, cur, proj, delta: proj.resultat - cur.resultat };
    });
    const totCur = { revenu:0, depenses:0, resultat:0, heures:0 };
    const totProj = { revenu:0, depenses:0, resultat:0, heures:0 };
    items.forEach(({ cur, proj }) => {
      totCur.revenu += cur.revenu; totCur.depenses += cur.depenses; totCur.resultat += cur.resultat; totCur.heures += cur.heures;
      totProj.revenu += proj.revenu; totProj.depenses += proj.depenses; totProj.resultat += proj.resultat; totProj.heures += proj.heures;
    });
    const hasChanges = Object.keys(globOv).some(id => Object.keys(globOv[id]).length > 0);

    const saveScenario = () => {
      if (!scenName.trim()) return;
      setScenarios(prev => [...prev, { name: scenName.trim(), globOv: JSON.parse(JSON.stringify(globOv)), res: totProj.resultat, rev: totProj.revenu, dep: totProj.depenses, heures: totProj.heures }]);
      setScenName("");
    };

    const inpSt = (cur, sim) => ({ width:85, padding:"6px 8px", border:`1px solid ${sim !== undefined && sim !== cur ? "var(--accent)" : "var(--border)"}`, borderRadius:6, fontSize:13, fontFamily:"inherit", outline:"none", background: sim !== undefined && sim !== cur ? "var(--accent-s)" : "var(--bg)", textAlign:"right" });

    return (<>
      <div className="card">
        <div className="card-h"><h2>Projection globale <span className="badge">base {year}</span></h2>{hasChanges && <button className="btn btn-s btn-d" onClick={() => setGlobOv({})}>Réinitialiser</button>}</div>
        <div className="card-b">
          <p style={{fontSize:13,color:"var(--text3)",marginBottom:16}}>Modifiez directement les valeurs par avion pour voir l&apos;impact sur le résultat.</p>
          <div className="tw"><table>
            <thead><tr><th>Avion</th><th>Tarif (€/h)</th><th>Heures</th><th>Vols</th><th>Résultat actuel</th><th>Résultat simulé</th><th>Delta</th></tr></thead>
            <tbody>{items.map(({ ac, cur, proj, delta }) => {
              const ov = globOv[ac.id] || {};
              const curTarif = getRate(data.rates, ac.id, "tarifHeure", year, lm);
              return (<tr key={ac.id}>
                <td className="tx" style={{color:"var(--accent)",fontWeight:700}}>{ac.immat}</td>
                <td><input type="number" step="1" value={ov.tarifHeure !== undefined ? ov.tarifHeure : curTarif} onChange={e => setGOv(ac.id,"tarifHeure",pf(e.target.value))} style={inpSt(curTarif, ov.tarifHeure)}/></td>
                <td><input type="number" step="1" value={ov.heures !== undefined ? ov.heures : Math.round(cur.heures)} onChange={e => setGOv(ac.id,"heures",pf(e.target.value))} style={inpSt(Math.round(cur.heures), ov.heures)}/></td>
                <td><input type="number" step="1" value={ov.rotations !== undefined ? ov.rotations : cur.rotations} onChange={e => setGOv(ac.id,"rotations",pf(e.target.value))} style={inpSt(cur.rotations, ov.rotations)}/></td>
                <td className={cur.resultat>=0?"pos":"neg"}>{cur.resultat>=0?"+":""}{fmt(cur.resultat)}</td>
                <td className={proj.resultat>=0?"pos":"neg"} style={{fontWeight:700}}>{proj.resultat>=0?"+":""}{fmt(proj.resultat)}</td>
                <td style={{color:delta>=0?"var(--green)":"var(--red)",fontWeight:600}}>{delta>=0?"+":""}{fmt(delta)}</td>
              </tr>);
            })}</tbody>
            <tfoot><tr style={{fontWeight:700,borderTop:"2px solid var(--border)"}}>
              <td>TOTAL</td><td></td><td className="num">{fH(totProj.heures)}</td><td></td>
              <td className={totCur.resultat>=0?"pos":"neg"}>{totCur.resultat>=0?"+":""}{fmt(totCur.resultat)}</td>
              <td className={totProj.resultat>=0?"pos":"neg"}>{totProj.resultat>=0?"+":""}{fmt(totProj.resultat)}</td>
              <td style={{color:totProj.resultat-totCur.resultat>=0?"var(--green)":"var(--red)"}}>{totProj.resultat-totCur.resultat>=0?"+":""}{fmt(totProj.resultat-totCur.resultat)}</td>
            </tr></tfoot>
          </table></div>
        </div>
      </div>
      <div className="sg">
        <div className="sc"><div className="sc-l">Résultat actuel</div><div className={`sc-v ${totCur.resultat>=0?"g":"r"}`}>{totCur.resultat>=0?"+":""}{fmt(totCur.resultat)}</div></div>
        <div className="sc hl" style={{borderColor:totProj.resultat>=0?"var(--green)":"var(--red)"}}>
          <div className="sc-l">Résultat projeté</div>
          <div className={`sc-v ${totProj.resultat>=0?"g":"r"}`}>{totProj.resultat>=0?"+":""}{fmt(totProj.resultat)}</div>
          <div className="sc-s">Δ {totProj.resultat>totCur.resultat?"+":""}{fmt(totProj.resultat-totCur.resultat)}</div>
        </div>
        <div className="sc"><div className="sc-l">Revenus projetés</div><div className="sc-v b">{fmt(totProj.revenu)}</div></div>
        <div className="sc"><div className="sc-l">Heures projetées</div><div className="sc-v">{fH(totProj.heures)}</div></div>
      </div>
      {/* Save & compare scenarios */}
      <div className="card">
        <div className="card-h"><h2>Scénarios enregistrés</h2></div>
        <div className="card-b">
          <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
            <input value={scenName} onChange={e=>setScenName(e.target.value)} placeholder="Nom du scénario…" style={{flex:1,padding:"8px 12px",border:"1px solid var(--border)",borderRadius:8,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
            <button className="btn btn-p btn-s" onClick={saveScenario} disabled={!scenName.trim()}>Sauvegarder</button>
          </div>
          {!scenarios.length ? <div style={{color:"var(--text3)",fontSize:13}}>Aucun scénario sauvegardé. Modifiez les valeurs puis sauvegardez.</div> : (
            <div className="tw"><table>
              <thead><tr><th>Scénario</th><th>Heures</th><th>Revenus</th><th>Dépenses</th><th>Résultat</th><th>vs Actuel</th><th></th></tr></thead>
              <tbody>{scenarios.map((s,i) => {
                const d = s.res - current.resultat;
                return (<tr key={i}>
                  <td className="tx" style={{fontWeight:600}}>{s.name}</td>
                  <td className="num">{fH(s.heures)}</td>
                  <td className="num" style={{color:"var(--accent)"}}>{fmt(s.rev)}</td>
                  <td className="num">{fmt(s.dep)}</td>
                  <td className={s.res>=0?"pos":"neg"}>{s.res>=0?"+":""}{fmt(s.res)}</td>
                  <td><span className={`delta ${d>=0?"delta-up":"delta-dn"}`}>{d>=0?"+":""}{fmt(d)}</span></td>
                  <td><button className="btn btn-s btn-d btn-ghost" onClick={() => setScenarios(prev=>prev.filter((_,j)=>j!==i))}>✕</button></td>
                </tr>);
              })}</tbody>
            </table></div>
          )}
        </div>
      </div>
    </>);
  };

  // ── MODE: Per-aircraft ──
  const AircraftMode = () => {
    const ac = data.aircraft.find(a => a.id === selAc);
    if (!ac) return null;
    const ov = overrides[selAc] || {};
    const cur = aggAC(data, ac.id, year, range);
    const proj = aggACWithOverrides(data, ac.id, year, range, ov);
    const fleetCur = current;
    const fleetProj = globAggWithOverrides(data, year, range, overrides);
    const hasOv = Object.keys(ov).length > 0;

    const simRateGroups = getAllRateGroups(data.flightTypes);

    return (<>
      <div className="sec-t">Avion</div>
      <div className="chips">{data.aircraft.map(a => <button key={a.id} className={`chip ${selAc===a.id?"on":""}`} onClick={() => setSelAc(a.id)}>{a.immat} — {a.type}{overrides[a.id] ? " ●" : ""}</button>)}</div>

      <div className="card">
        <div className="card-h"><h2>Paramètres simulés <span className="badge">{ac.immat}</span></h2>{hasOv && <button className="btn btn-s btn-d" onClick={() => clearOv(selAc)}>Réinitialiser</button>}</div>
        <div className="card-b">
          <p style={{fontSize:13,color:"var(--text3)",marginBottom:16}}>Modifiez les valeurs pour simuler. Les champs modifiés sont surlignés en bleu.</p>
          {simRateGroups.map(group => (
            <div key={group.group} style={{marginBottom:20}}>
              <div className="sec-t">{group.group}</div>
              <div className="fg">
                {group.fields.map(field => {
                  const curVal = getRate(data.rates, selAc, field.key, year, lm);
                  const ovVal = ov[field.key];
                  const isModified = ovVal !== undefined && ovVal !== curVal;
                  return (<div className={`fi ${isModified?"fi-mod":""}`} key={field.key}>
                    <label>{field.label}</label>
                    <input type="number" step={field.step} value={ovVal !== undefined ? ovVal : curVal} onChange={e => setOv(selAc, field.key, pf(e.target.value))}/>
                    {isModified && <span style={{fontSize:11,color:ovVal>curVal?"var(--green)":"var(--red)"}}>Actuel : {fmt2(curVal)} → {ovVal>curVal?"+":""}{fmt2(ovVal-curVal)}</span>}
                  </div>);
                })}
              </div>
            </div>
          ))}
          <div style={{marginBottom:20}}>
            <div className="sec-t">Activité projetée (annuelle)</div>
            <div className="fg">
              <div className={`fi ${ov.heures !== undefined?"fi-mod":""}`}>
                <label>Heures de vol</label>
                <input type="number" step="1" value={ov.heures !== undefined ? ov.heures : Math.round(cur.heures)} onChange={e => setOv(selAc, "heures", pf(e.target.value))}/>
                {ov.heures !== undefined && ov.heures !== Math.round(cur.heures) && <span style={{fontSize:11,color:ov.heures>cur.heures?"var(--green)":"var(--red)"}}>Actuel : {fH(cur.heures)} → {ov.heures>cur.heures?"+":""}{fH(ov.heures-cur.heures)}</span>}
              </div>
              <div className={`fi ${ov.rotations !== undefined?"fi-mod":""}`}>
                <label>Nombre de vols</label>
                <input type="number" step="1" value={ov.rotations !== undefined ? ov.rotations : cur.rotations} onChange={e => setOv(selAc, "rotations", pf(e.target.value))}/>
                {ov.rotations !== undefined && ov.rotations !== cur.rotations && <span style={{fontSize:11,color:ov.rotations>cur.rotations?"var(--green)":"var(--red)"}}>Actuel : {cur.rotations} → {ov.rotations>cur.rotations?"+":""}{ov.rotations-cur.rotations}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison: Actual vs Projected */}
      <div className="sg">
        <div className="sc"><div className="sc-l">RÉSULTAT ACTUEL</div><div className={`sc-v ${cur.resultat>=0?"g":"r"}`}>{cur.resultat>=0?"+":""}{fmt(cur.resultat)}</div><div className="sc-s">Rev {fmt(cur.revenu)} · Dép {fmt(cur.depenses)}</div></div>
        <div className="sc hl" style={{borderColor:proj.resultat>=0?"var(--green)":"var(--red)"}}>
          <div className="sc-l">RÉSULTAT PROJETÉ</div>
          <div className={`sc-v ${proj.resultat>=0?"g":"r"}`}>{proj.resultat>=0?"+":""}{fmt(proj.resultat)}</div>
          <div className="sc-s">Rev {fmt(proj.revenu)} · Dép {fmt(proj.depenses)}</div>
        </div>
        <div className="sc">
          <div className="sc-l">DELTA</div>
          <div className={`sc-v ${proj.resultat-cur.resultat>=0?"g":"r"}`}>{proj.resultat-cur.resultat>=0?"+":""}{fmt(proj.resultat-cur.resultat)}</div>
        </div>
      </div>

      {/* Detailed comparison table */}
      <div className="card">
        <div className="card-h"><h2>Comparaison détaillée</h2></div>
        <div className="tw"><table>
          <thead><tr><th>Poste</th><th>Actuel</th><th>Projeté</th><th>Delta</th></tr></thead>
          <tbody>
            {[
              {l:"Rev. Pilotes (CdB+DC)",a:cur.revenuPilote||0,p:proj.revenuPilote||0,isRev:true},
              ...(data.flightTypes||[]).map(ft => ({l:`Rev. ${ft.name}`,a:(cur.ftRevenues[ft.id]||{}).revenu||0,p:(proj.ftRevenues[ft.id]||{}).revenu||0,isRev:true})),
              {l:"Revenus total",a:cur.revenu,p:proj.revenu,isRev:true},
              {l:"Carburant & huile",a:cur.variable,p:proj.variable},{l:"Prêts",a:cur.loan,p:proj.loan},
              {l:"Opérations",a:cur.opsC,p:proj.opsC},{l:"Total dépenses",a:cur.depenses,p:proj.depenses},
              {l:"Résultat",a:cur.resultat,p:proj.resultat,isRev:true},
            ].map(r => {
              const d = r.p - r.a;
              return (<tr key={r.l}>
                <td className="tx" style={{fontWeight:600}}>{r.l}</td>
                <td className="num">{fmt(r.a)}</td>
                <td className="num">{fmt(r.p)}</td>
                <td>{d !== 0 && <span className={`delta ${(r.isRev?(d>=0):(d<=0))?"delta-up":"delta-dn"}`}>{d>0?"+":""}{fmt(d)}</span>}</td>
              </tr>);
            })}
          </tbody>
        </table></div>
      </div>

      {/* Fleet impact */}
      <div className="card">
        <div className="card-h"><h2>Impact sur la flotte</h2></div>
        <div className="sg" style={{padding:20}}>
          <div className="sc"><div className="sc-l">Flotte actuelle</div><div className={`sc-v ${fleetCur.resultat>=0?"g":"r"}`}>{fleetCur.resultat>=0?"+":""}{fmt(fleetCur.resultat)}</div></div>
          <div className="sc hl" style={{borderColor:fleetProj.resultat>=0?"var(--green)":"var(--red)"}}>
            <div className="sc-l">Flotte projetée</div>
            <div className={`sc-v ${fleetProj.resultat>=0?"g":"r"}`}>{fleetProj.resultat>=0?"+":""}{fmt(fleetProj.resultat)}</div>
            <div className="sc-s">Δ {fleetProj.resultat-fleetCur.resultat>=0?"+":""}{fmt(fleetProj.resultat-fleetCur.resultat)}</div>
          </div>
        </div>
      </div>
    </>);
  };

  // ── MODE: Break-even ──
  const BreakevenMode = () => {
    return (<div className="card">
      <div className="card-h"><h2>Seuil de rentabilité interactif <span className="badge">{year}</span></h2></div>
      <div className="card-b">
        <p style={{fontSize:13,color:"var(--text3)",marginBottom:16}}>Modifiez le tarif horaire pour voir l&apos;impact sur le seuil de rentabilité.</p>
      </div>
      <div className="tw"><table>
        <thead><tr><th>Avion</th><th>Tarif actuel</th><th>Tarif simulé</th><th>Seuil (h)</th><th>H. actuelles</th><th>Excédent</th><th>Statut</th></tr></thead>
        <tbody>{data.aircraft.filter(ac => isAircraftActiveYear(ac, year, range)).map(ac => {
          const cur = aggAC(data, ac.id, year, range);
          const curTarif = getRate(data.rates, ac.id, "tarifHeure", year, lm);
          const simTarif = beOverrides[ac.id]?.tarif !== undefined ? beOverrides[ac.id].tarif : curTarif;
          const be = breakEvenHours(data, ac.id, year, range, simTarif);
          const beOk = be !== Infinity;
          const margin = cur.heures - be;
          const pct = beOk && be > 0 ? cur.heures / be : 0;
          const status = pct >= 1 ? "tag-g" : pct >= 0.7 ? "tag-o" : "tag-r";
          const statusTxt = pct >= 1 ? "ATTEINT" : pct >= 0.7 ? "PROCHE" : "INSUFFISANT";
          const inpSt = (c,s) => ({width:80,padding:"6px 10px",border:`1px solid ${s!==c?"var(--accent)":"var(--border)"}`,borderRadius:6,fontSize:14,fontFamily:"inherit",outline:"none",background:s!==c?"var(--accent-s)":"var(--bg)"});
          return (<tr key={ac.id}>
            <td className="tx" style={{color:"var(--accent)",fontWeight:700}}>{ac.immat}</td>
            <td className="num">{fmt2(curTarif)}</td>
            <td><input type="number" step="1" value={simTarif} onChange={e => setBeOverrides(p=>({...p,[ac.id]:{...(p[ac.id]||{}),tarif:pf(e.target.value)}}))} style={inpSt(curTarif,simTarif)}/></td>
            <td className="num" style={{fontWeight:700}}>{beOk ? fH(be) : "∞"}</td>
            <td className="num">{fH(cur.heures)}</td>
            <td className={margin>=0?"pos":"neg"}>{beOk ? (margin>=0?"+":"") + fH(margin) : "—"}</td>
            <td><span className={`tag ${status}`}>{statusTxt}</span></td>
          </tr>);
        })}</tbody>
      </table></div>
    </div>);
  };

  // ── MODE: Sensitivity ──
  const SensitivityMode = () => {
    const ac = data.aircraft.find(a => a.id === sensAc);
    if (!ac) return null;
    const allFields = getAllRateGroups(data.flightTypes).flatMap(g => g.fields);
    const curVal = getRate(data.rates, sensAc, sensField, year, lm);
    const steps = [];
    for (let i = -3; i <= 3; i++) {
      const v = curVal * (1 + i * 0.1);
      if (v >= 0) steps.push(Math.round(v * 100) / 100);
    }
    const results = sensitivityAnalysis(data, sensAc, year, range, sensField, steps);
    const curRes = aggAC(data, sensAc, year, range);
    const maxAbsRes = Math.max(1, ...results.map(r => Math.abs(r.resultat)));

    return (<>
      <div className="card">
        <div className="card-h"><h2>Analyse de sensibilité</h2></div>
        <div className="card-b">
          <p style={{fontSize:13,color:"var(--text3)",marginBottom:16}}>Choisissez un avion et un paramètre pour voir comment le résultat varie.</p>
          <div className="fg" style={{marginBottom:16}}>
            <div className="fi"><label>Avion</label><select value={sensAc} onChange={e => setSensAc(e.target.value)}>{data.aircraft.map(a => <option key={a.id} value={a.id}>{a.immat} — {a.type}</option>)}</select></div>
            <div className="fi"><label>Paramètre</label><select value={sensField} onChange={e => setSensField(e.target.value)}>{allFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
          </div>
          {/* Sensitivity bar chart */}
          <div className="sens-chart">{results.map((r,i) => {
            const h = Math.max(6, (Math.abs(r.resultat) / maxAbsRes) * 140);
            const isCur = Math.abs(r.value - curVal) < 0.01;
            return (<div className="sens-col" key={i}>
              <div className="sens-val">{fmt(r.resultat)}</div>
              <div className={`sens-b ${isCur?"sens-cur":""}`} style={{height:h,background:r.resultat>=0?"var(--green)":"var(--red)",opacity:isCur?1:.7}}/>
              <div className="sens-lbl">{r.value}</div>
            </div>);
          })}</div>
        </div>
      </div>
      <div className="card">
        <div className="card-h"><h2>Détail</h2></div>
        <div className="tw"><table>
          <thead><tr><th>Valeur</th><th>Revenus</th><th>Dépenses</th><th>Résultat</th><th>Delta</th></tr></thead>
          <tbody>{results.map((r,i) => {
            const d = r.resultat - curRes.resultat;
            const isCur = Math.abs(r.value - curVal) < 0.01;
            return (<tr key={i} style={isCur?{background:"var(--accent-s)"}:{}}>
              <td className="num" style={{fontWeight:isCur?700:500}}>{r.value}{isCur?" ●":""}</td>
              <td className="num" style={{color:"var(--accent)"}}>{fmt(r.revenus || r.revenu)}</td>
              <td className="num">{fmt(r.depenses)}</td>
              <td className={r.resultat>=0?"pos":"neg"}>{r.resultat>=0?"+":""}{fmt(r.resultat)}</td>
              <td>{!isCur && <span className={`delta ${d>=0?"delta-up":"delta-dn"}`}>{d>=0?"+":""}{fmt(d)}</span>}</td>
            </tr>);
          })}</tbody>
        </table></div>
      </div>
    </>);
  };

  // ── MODE: Fleet what-if ──
  const FleetMode = () => {
    const toggleAc = (acId) => {
      setExcludedAc(prev => { const n = new Set(prev); if (n.has(acId)) n.delete(acId); else n.add(acId); return n; });
    };
    const activeAc = data.aircraft.filter(a => !excludedAc.has(a.id));
    let simTotal = { revenu:0, depenses:0, resultat:0, heures:0 };
    activeAc.forEach(ac => {
      const a = aggAC(data, ac.id, year, range);
      simTotal.revenu += a.revenu; simTotal.depenses += a.depenses;
      simTotal.resultat += a.resultat; simTotal.heures += a.heures;
    });

    return (<>
      <div className="card">
        <div className="card-h"><h2>Simulation de flotte</h2></div>
        <div className="card-b">
          <p style={{fontSize:13,color:"var(--text3)",marginBottom:16}}>Décochez un avion pour simuler son retrait de la flotte et voir l&apos;impact financier.</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {data.aircraft.map(ac => {
              const f = aggAC(data, ac.id, year, range);
              const active = !excludedAc.has(ac.id);
              return (<div key={ac.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,background:active?"var(--bg)":"var(--red-s)",border:`1px solid ${active?"var(--border)":"var(--red)"}`,cursor:"pointer",transition:".15s"}} onClick={() => toggleAc(ac.id)}>
                <input type="checkbox" checked={active} readOnly style={{accentColor:"var(--accent)",width:18,height:18}}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14,color:active?"var(--accent)":"var(--red)"}}>{ac.immat} <span style={{fontWeight:400,color:"var(--text2)"}}>{ac.type}</span></div>
                  <div style={{fontSize:12,color:"var(--text3)"}}>{fH(f.heures)} · {f.rotations} vols · Résultat : <span style={{color:f.resultat>=0?"var(--green)":"var(--red)",fontWeight:600}}>{f.resultat>=0?"+":""}{fmt(f.resultat)}</span></div>
                </div>
              </div>);
            })}
          </div>
        </div>
      </div>
      <div className="sg">
        <div className="sc"><div className="sc-l">Flotte actuelle ({data.aircraft.length} avions)</div><div className={`sc-v ${current.resultat>=0?"g":"r"}`}>{current.resultat>=0?"+":""}{fmt(current.resultat)}</div><div className="sc-s">{fH(current.heures)} · Rev {fmt(current.revenu)}</div></div>
        <div className="sc hl" style={{borderColor:simTotal.resultat>=0?"var(--green)":"var(--red)"}}>
          <div className="sc-l">Flotte simulée ({activeAc.length} avions)</div>
          <div className={`sc-v ${simTotal.resultat>=0?"g":"r"}`}>{simTotal.resultat>=0?"+":""}{fmt(simTotal.resultat)}</div>
          <div className="sc-s">{fH(simTotal.heures)} · Rev {fmt(simTotal.revenu)}</div>
        </div>
        <div className="sc">
          <div className="sc-l">DELTA</div>
          <div className={`sc-v ${simTotal.resultat-current.resultat>=0?"g":"r"}`}>{simTotal.resultat-current.resultat>=0?"+":""}{fmt(simTotal.resultat-current.resultat)}</div>
          <div className="sc-s">{excludedAc.size > 0 ? `${excludedAc.size} avion(s) retiré(s)` : "Aucun changement"}</div>
        </div>
      </div>
      {excludedAc.size > 0 && <div className="card">
        <div className="card-h"><h2>Avions retirés — Économies détaillées</h2></div>
        <div className="tw"><table>
          <thead><tr><th>Avion</th><th>Revenus perdus</th><th>Dépenses économisées</th><th>Impact net</th></tr></thead>
          <tbody>{data.aircraft.filter(a => excludedAc.has(a.id)).map(ac => {
            const f = aggAC(data, ac.id, year, range);
            return (<tr key={ac.id}>
              <td className="tx" style={{color:"var(--red)",fontWeight:700}}>{ac.immat}</td>
              <td className="num" style={{color:"var(--red)"}}>-{fmt(f.revenu)}</td>
              <td className="num" style={{color:"var(--green)"}}>+{fmt(f.depenses)}</td>
              <td className={f.resultat<=0?"pos":"neg"}>{f.resultat<=0?"+":""}{fmt(-f.resultat)}</td>
            </tr>);
          })}</tbody>
        </table></div>
      </div>}
    </>);
  };

  return (<div>
    <div className="chips" style={{marginBottom:20}}>
      {modes.map(m => <button key={m.id} className={`chip ${mode===m.id?"on":""}`} onClick={() => setMode(m.id)}>{m.l}</button>)}
    </div>
    {mode === "global" && <GlobalMode />}
    {mode === "aircraft" && <AircraftMode />}
    {mode === "breakeven" && <BreakevenMode />}
    {mode === "sensitivity" && <SensitivityMode />}
    {mode === "fleet" && <FleetMode />}
  </div>);
}

// ════════ IMPORT CSV ════════
function ImportCSV({ data, db }) {
  const [step, setStep] = useState("upload"); // upload | preview | done
  const [parsed, setParsed] = useState(null);
  const [agg, setAgg] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const [importTarget, setImportTarget] = useState("standard"); // "standard" or flight type id
  const [importAcId, setImportAcId] = useState("auto"); // "auto" or aircraft id

  const flightTypes = data.flightTypes || [];
  const targetFt = flightTypes.find(ft => ft.id === importTarget);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isXlsx = /\.xlsx?$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      let text;
      if (isXlsx) {
        // Convert XLSX to CSV via SheetJS, then parse as CSV
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        text = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
      } else {
        text = ev.target.result;
      }
      const p = parseFlightCSV(text, importYear);
      setParsed(p);
      if (!p.error && p.flights.length > 0) {
        const a = aggregateFlights(p.flights, data.aircraft);
        setAgg(a);
        setStep("preview");
      } else if (!p.error && p.flights.length === 0) {
        setParsed({ ...p, error: `Aucun vol trouvé pour l'année ${importYear}. Vérifiez le fichier ou changez l'année.` });
      }
    };
    if (isXlsx) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, "UTF-8");
  };

  const doImport = async () => {
    if (!agg) return;
    setImporting(true);
    let imported = 0, skipped = 0;
    const immatMap = {};
    data.aircraft.forEach(ac => { immatMap[ac.immat.toUpperCase().replace(/\s/g, "")] = ac.id; });

    // Create missing aircraft first (only in auto mode)
    if (importAcId === "auto") {
      for (const immat of agg.unknownImmats) {
        const ac = await db.addAircraft(immat, "—");
        if (ac) immatMap[immat] = ac.id;
      }
    }

    // Aggregate rows by aircraft if a specific aircraft is selected
    const rows = importAcId !== "auto"
      ? aggregateRowsForAc(agg.monthly)
      : agg.monthly;

    // Import data to target
    for (const row of rows) {
      const acId = importAcId !== "auto" ? importAcId : immatMap[row.immat];
      if (!acId) { skipped++; continue; }
      if (importTarget === "standard") {
        await db.setMonthly(acId, row.year, row.month, { heures: row.heures, rotations: row.rotations, heuresDc: row.heuresDc });
      } else {
        await db.setFlightActivity(acId, importTarget, row.year, row.month, {
          heures: row.heures + row.heuresDc,
          vols: row.rotations,
        });
      }
      imported++;
    }

    const nbAc = importAcId !== "auto" ? 1 : new Set(agg.monthly.map(r => r.immat)).size;
    const nbMo = new Set(rows.map(r => r.month)).size;
    const acLabel = importAcId !== "auto" ? data.aircraft.find(a => a.id === importAcId)?.immat : null;
    setResult({ imported, skipped, newAircraft: importAcId === "auto" ? agg.unknownImmats.length : 0, nbAc, nbMo, year: importYear, target: importTarget === "standard" ? "Standard" : (targetFt?.name || importTarget), acLabel });
    setImporting(false);
    setStep("done");
    db.reload();
  };

  // When importing all CSV data to a single aircraft, aggregate monthly rows
  const aggregateRowsForAc = (rows) => {
    const byMonth = {};
    rows.forEach(r => {
      const k = `${r.year}|${r.month}`;
      if (!byMonth[k]) byMonth[k] = { year: r.year, month: r.month, heures: 0, heuresDc: 0, rotations: 0, carbu: 0, montant: 0 };
      byMonth[k].heures += r.heures;
      byMonth[k].heuresDc += r.heuresDc;
      byMonth[k].rotations += r.rotations;
      byMonth[k].carbu += r.carbu || 0;
      byMonth[k].montant += r.montant || 0;
    });
    return Object.values(byMonth).sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  };

  const reset = () => { setStep("upload"); setParsed(null); setAgg(null); setResult(null); };

  return (<div>
    {/* ── Step 1: Upload ── */}
    {step === "upload" && (
      <div className="card">
        <div className="card-h"><h2>Import vols (CSV / XLSX)</h2></div>
        <div className="card-b">
          <p style={{fontSize:13,color:"var(--text2)",marginBottom:16,lineHeight:1.8}}>
            Importez un fichier CSV ou Excel (.xlsx) par année. Seuls les vols de l&apos;année sélectionnée seront importés.<br/>
            Colonnes attendues : Date, Aéronef, Durée, Mode (DC/CDB), etc.
          </p>
          <div className="fg" style={{marginBottom:20}}>
            <div className="fi">
              <label>Année à importer</label>
              <select value={importYear} onChange={e => setImportYear(Number(e.target.value))}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="fi">
              <label>Importer dans</label>
              <select value={importTarget} onChange={e => setImportTarget(e.target.value)}>
                <option value="standard">Standard (CdB / DC)</option>
                {flightTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
              </select>
            </div>
            <div className="fi">
              <label>Avion</label>
              <select value={importAcId} onChange={e => setImportAcId(e.target.value)}>
                <option value="auto">Auto (depuis le CSV)</option>
                {data.aircraft.map(a => <option key={a.id} value={a.id}>{a.immat} — {a.type}</option>)}
              </select>
            </div>
          </div>
          {(importTarget !== "standard" || importAcId !== "auto") && <div style={{fontSize:12,color:"var(--orange)",marginBottom:16,padding:"8px 14px",background:"var(--orange-s)",borderRadius:8}}>
            {importAcId !== "auto" && <>Toutes les données du CSV seront importées sur <strong>{data.aircraft.find(a=>a.id===importAcId)?.immat}</strong>.<br/></>}
            {importTarget !== "standard" && <>Import vers <strong>{targetFt?.name}</strong> : les heures CdB+DC seront importées comme heures, les mouvements comme nombre de vols.</>}
          </div>}
          <div style={{border:"2px dashed var(--border)",borderRadius:12,padding:40,textAlign:"center",background:"var(--bg)"}}>
            <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleFile} style={{fontSize:14,fontFamily:"inherit"}}/>
          </div>
          {parsed?.error && <div style={{color:"var(--red)",marginTop:16,fontSize:13,fontWeight:600}}>{parsed.error}</div>}
        </div>
      </div>
    )}

    {/* ── Step 2: Preview ── */}
    {step === "preview" && agg && (
      <div>
        {/* Stats */}
        <div className="sg">
          <div className="sc"><div className="sc-l">VOLS {importYear}</div><div className="sc-v b">{agg.stats.totalFlights}</div></div>
          <div className="sc"><div className="sc-l">HEURES TOTALES</div><div className="sc-v">{fH(agg.stats.totalHours)}</div><div className="sc-s">CdB {fH(agg.stats.hoursCdb)} · DC {fH(agg.stats.hoursDc)}</div></div>
          <div className="sc"><div className="sc-l">MOUVEMENTS</div><div className="sc-v">{agg.stats.totalRotations}</div></div>
          {agg.stats.totalMontant > 0 && <div className="sc"><div className="sc-l">MONTANT TOTAL</div><div className="sc-v b">{fmt(agg.stats.totalMontant)}</div></div>}
          {agg.stats.totalCarbu > 0 && <div className="sc"><div className="sc-l">CARBURANT</div><div className="sc-v o">{Math.round(agg.stats.totalCarbu)} L</div></div>}
        </div>

        {agg.stats.dateRange.min && (
          <div style={{fontSize:13,color:"var(--text3)",marginBottom:16}}>
            Période : {agg.stats.dateRange.min.toLocaleDateString("fr-FR")} → {agg.stats.dateRange.max.toLocaleDateString("fr-FR")}
          </div>
        )}

        {/* Unknown aircraft */}
        {agg.unknownImmats.length > 0 && (
          <div className="card" style={{borderColor:"var(--orange)"}}>
            <div className="card-h"><h2 style={{color:"var(--orange)"}}>Avions non trouvés ({agg.unknownImmats.length})</h2></div>
            <div className="card-b">
              <p style={{fontSize:13,color:"var(--text2)",marginBottom:10}}>Ces immatriculations seront créées automatiquement :</p>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {agg.unknownImmats.map(im => <span key={im} className="tag tag-o">{im}</span>)}
              </div>
            </div>
          </div>
        )}

        {/* Warnings */}
        {parsed.warnings.length > 0 && (
          <div className="card">
            <div className="card-h"><h2>Avertissements ({parsed.warnings.length})</h2></div>
            <div className="card-b" style={{maxHeight:200,overflowY:"auto"}}>
              {parsed.warnings.slice(0, 50).map((w, i) => <div key={i} style={{fontSize:12,color:"var(--text3)",padding:"3px 0"}}>{w}</div>)}
              {parsed.warnings.length > 50 && <div style={{fontSize:12,color:"var(--text3)",fontWeight:600}}>… et {parsed.warnings.length - 50} autres</div>}
            </div>
          </div>
        )}

        {/* Monthly preview table */}
        <div className="card">
          <div className="card-h"><h2>Aperçu — {importYear} ({new Set(agg.monthly.map(r=>r.immat)).size} avions × {new Set(agg.monthly.map(r=>r.month)).size} mois)</h2></div>
          <div className="tw" style={{maxHeight:400,overflowY:"auto"}}><table>
            <thead><tr><th>Avion</th><th>Mois</th><th>H. CdB</th><th>H. DC</th><th>Total</th><th>Mvts</th><th>Carbu (L)</th><th>Montant</th></tr></thead>
            <tbody>{agg.monthly.map((r, i) => (
              <tr key={i}>
                <td className="tx" style={{color: data.aircraft.some(a=>a.immat.toUpperCase().replace(/\s/g,"")===r.immat) ? "var(--accent)" : "var(--orange)", fontWeight:700}}>{r.immat}</td>
                <td className="tx">{MOS[r.month]} {r.year}</td>
                <td className="num">{fH(r.heures)}</td>
                <td className="num" style={{color:"var(--orange)"}}>{fH(r.heuresDc)}</td>
                <td className="num" style={{fontWeight:600}}>{fH(r.heures + r.heuresDc)}</td>
                <td className="num">{r.rotations}</td>
                <td className="num">{r.carbu > 0 ? Math.round(r.carbu) + " L" : "—"}</td>
                <td className="num">{fmt(r.montant)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>

        {/* Actions */}
        <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:8}}>
          <button className="btn" onClick={reset}>Annuler</button>
          <button className="btn btn-p" onClick={doImport} disabled={importing}>
            {importing ? "Import en cours…" : `Importer ${importYear} (${new Set(agg.monthly.map(r=>r.immat)).size} avions)`}
          </button>
        </div>
      </div>
    )}

    {/* ── Step 3: Done ── */}
    {step === "done" && result && (
      <div className="card">
        <div className="card-h"><h2 style={{color:"var(--green)"}}>Import terminé</h2></div>
        <div className="card-b" style={{textAlign:"center",padding:40}}>
          <div style={{fontSize:48,marginBottom:12}}>✓</div>
          <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Import {result.year} terminé — {result.acLabel ? result.acLabel : `${result.nbAc} avions`} × {result.nbMo} mois{result.target ? ` → ${result.target}` : ""}</div>
          {result.newAircraft > 0 && <div style={{fontSize:13,color:"var(--orange)",marginBottom:4}}>{result.newAircraft} avion(s) créé(s)</div>}
          {result.skipped > 0 && <div style={{fontSize:13,color:"var(--text3)"}}>{result.skipped} ignoré(s)</div>}
          <button className="btn btn-p" onClick={reset} style={{marginTop:20}}>Nouvel import</button>
        </div>
      </div>
    )}
  </div>);
}

// ════════ FLEET ════════
function Fleet({ data, db, modal, setModal, year }) {
  const defaultForm = { immat:"", type:"", carbuType:"100LL", huileType:"W100", activeFrom:"", activeTo:"" };
  const [form, setForm] = useState(defaultForm);
  const [editId, setEditId] = useState(null);
  const openAdd = () => { setForm(defaultForm); setEditId(null); setModal("ac"); };
  const openEdit = ac => { setForm({ immat:ac.immat, type:ac.type, carbuType:ac.carbuType||"100LL", huileType:ac.huileType||"W100", activeFrom:ac.activeFrom||"", activeTo:ac.activeTo||"" }); setEditId(ac.id); setModal("ac"); };
  const save = async () => {
    if (!form.immat) return;
    if (editId) await db.updateAircraft(editId, form);
    else await db.addAircraft(form.immat, form.type, { carbuType:form.carbuType, huileType:form.huileType, activeFrom:form.activeFrom||null, activeTo:form.activeTo||null });
    setModal(null);
  };

  const fmtDate = d => d ? new Date(d+"T00:00:00").toLocaleDateString("fr-FR") : "";
  const lm = Math.min(11, new Date().getMonth());

  return (<div>
    <div className="card">
      <div className="card-h"><h2>Flotte</h2><button className="btn btn-p" onClick={openAdd}>+ Ajouter un avion</button></div>
      {!data.aircraft.length ? <div className="empty">Aucun avion configuré.</div> : (
        <div className="tw"><table>
          <thead><tr><th>Immatriculation</th><th>Type</th><th>Carburant</th><th>Huile</th><th>Actif</th><th></th></tr></thead>
          <tbody>{data.aircraft.map(ac => {
            const active = !ac.activeTo;
            return (<tr key={ac.id} style={!active?{opacity:.5}:{}}>
              <td className="tx" style={{color:"var(--accent)",fontWeight:700}}>{ac.immat}</td>
              <td className="tx">{ac.type}</td>
              <td className="tx">{ac.carbuType || "100LL"}</td>
              <td className="tx">{ac.huileType || "W100"}</td>
              <td>{ac.activeFrom || ac.activeTo ? <span style={{fontSize:12,color:"var(--text3)"}}>{fmtDate(ac.activeFrom)||"…"} → {fmtDate(ac.activeTo)||"Actif"}</span> : <span className="tag tag-g">Actif</span>}</td>
              <td style={{display:"flex",gap:6}}>
                <button className="btn btn-s" onClick={() => openEdit(ac)}>Modifier</button>
                <button className="btn btn-s btn-d" onClick={() => db.deleteAircraft(ac.id)}>Supprimer</button>
              </td>
            </tr>);
          })}</tbody>
        </table></div>
      )}
    </div>
    {modal==="ac" && (<div className="mo" onClick={()=>setModal(null)}><div className="mod" style={{maxWidth:600}} onClick={e=>e.stopPropagation()}>
      <div className="mod-h"><h3>{editId?"Modifier":"Ajouter"} un avion</h3><button className="btn btn-s btn-ghost" onClick={()=>setModal(null)}>✕</button></div>
      <div className="mod-b">
        <div className="fg">
          <div className="fi"><label>Immatriculation</label><input value={form.immat} onChange={e=>setForm(f=>({...f,immat:e.target.value.toUpperCase()}))} placeholder="F-GXXX"/></div>
          <div className="fi"><label>Type avion</label><input value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} placeholder="DR400-120"/></div>
        </div>
        <div className="fg" style={{marginTop:16}}>
          <div className="fi"><label>Type carburant</label><input value={form.carbuType} onChange={e=>setForm(f=>({...f,carbuType:e.target.value}))} placeholder="100LL"/></div>
          <div className="fi"><label>Type huile</label><input value={form.huileType} onChange={e=>setForm(f=>({...f,huileType:e.target.value}))} placeholder="W100"/></div>
        </div>
        <div className="fg" style={{marginTop:16}}>
          <div className="fi"><label>Actif depuis</label><input type="date" value={form.activeFrom} onChange={e=>setForm(f=>({...f,activeFrom:e.target.value}))}/><span style={{fontSize:11,color:"var(--text3)"}}>Vide = toujours</span></div>
          <div className="fi"><label>Actif jusqu&apos;au</label><input type="date" value={form.activeTo} onChange={e=>setForm(f=>({...f,activeTo:e.target.value}))}/><span style={{fontSize:11,color:"var(--text3)"}}>Vide = encore actif</span></div>
        </div>
        <p style={{fontSize:12,color:"var(--text3)",marginTop:12}}>Le mode de facturation (Block-Block / Roulage) se configure dans l&apos;onglet <strong>Tarifs</strong> par avion, avec une date d&apos;effet.</p>
      </div>
      <div className="mod-f"><button className="btn" onClick={()=>setModal(null)}>Annuler</button><button className="btn btn-p" onClick={save}>Enregistrer</button></div>
    </div></div>)}
  </div>);
}
