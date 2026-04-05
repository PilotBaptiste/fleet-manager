"use client";
import { useState, useMemo } from "react";
import { useFleetData } from "../lib/useFleetData";
import { YEARS, MO, MOS, QL, QM, ALL12, pf, fmt, fmt2, fH, fP, RATE_GROUPS, getRate, getActivity, loanPayment, calcMonth, aggAC, globAgg } from "../lib/calc";

export default function FleetApp({ onLogout }) {
  const db = useFleetData();
  const { data, loaded } = db;
  const [year, setYear] = useState(new Date().getFullYear());
  const [tab, setTab] = useState("dashboard");
  const [modal, setModal] = useState(null);

  if (!loaded) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60vh", color:"#8b93a1" }}>Chargement des données…</div>;

  const tabs = [
    { id:"dashboard", l:"Tableau de bord" },
    { id:"activity", l:"Activité" },
    { id:"rates", l:"Tarifs & Coûts" },
    { id:"ops", l:"Opérations" },
    { id:"loans", l:"Prêts" },
    { id:"sim", l:"Simulation" },
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
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div className="ynav">
            <button onClick={() => setYear(y => Math.max(2022,y-1))}>‹</button>
            <span className="yl">{year}</span>
            <button onClick={() => setYear(y => Math.min(2026,y+1))}>›</button>
          </div>
          <button className="btn btn-s" onClick={onLogout}>Déconnexion</button>
        </div>
      </div>

      <div className="tabs">
        {tabs.map(t => <button key={t.id} className={`tab ${tab===t.id?"on":""}`} onClick={() => setTab(t.id)}>{t.l}</button>)}
      </div>

      {tab === "dashboard" && <Dashboard data={data} year={year} />}
      {tab === "activity" && <Activity data={data} db={db} year={year} />}
      {tab === "rates" && <Rates data={data} db={db} modal={modal} setModal={setModal} />}
      {tab === "ops" && <Ops data={data} db={db} year={year} modal={modal} setModal={setModal} />}
      {tab === "loans" && <LoansTab data={data} db={db} modal={modal} setModal={setModal} />}
      {tab === "sim" && <Simulation data={data} year={year} />}
      {tab === "fleet" && <Fleet data={data} db={db} modal={modal} setModal={setModal} />}
    </div>
  );
}

// ════════ DASHBOARD ════════
function Dashboard({ data, year }) {
  const [view, setView] = useState("annuel");
  const [q, setQ] = useState(0);
  const range = view === "trimestre" ? QM[q] : ALL12;
  const g = globAgg(data, year, range);

  if (!data.aircraft.length) return <div className="card"><div className="empty">Commencez par ajouter vos avions dans l&apos;onglet <strong>Flotte</strong>.</div></div>;

  return (
    <div>
      <div className="chips">
        <button className={`chip ${view==="annuel"?"on":""}`} onClick={() => setView("annuel")}>Année {year}</button>
        {QL.map((l,i) => <button key={i} className={`chip ${view==="trimestre"&&q===i?"on":""}`} onClick={() => {setView("trimestre");setQ(i);}}>{l}</button>)}
      </div>
      <div className="sg">
        <div className="sc"><div className="sc-l">REVENUS</div><div className="sc-v b">{fmt(g.revenu)}</div><div className="sc-s">{fH(g.heures)} · {g.rotations} vols</div></div>
        <div className="sc"><div className="sc-l">DÉPENSES</div><div className="sc-v o">{fmt(g.depenses)}</div><div className="sc-s">Fixes {fmt(g.fixe)} · Var {fmt(g.variable)}</div></div>
        <div className="sc hl" style={{borderColor:g.resultat>=0?"var(--green)":"var(--red)"}}>
          <div className="sc-l" style={{color:g.resultat>=0?"var(--green)":"var(--red)"}}>{g.resultat>=0?"✓ BÉNÉFICE":"✗ DÉFICIT"}</div>
          <div className={`sc-v ${g.resultat>=0?"g":"r"}`}>{g.resultat>=0?"+":""}{fmt(g.resultat)}</div>
          <div className="sc-s">Marge : {g.revenu>0?fP(g.resultat/g.revenu):"—"}</div>
        </div>
        {g.loan > 0 && <div className="sc"><div className="sc-l">PRÊTS</div><div className="sc-v p">{fmt(g.loan)}</div></div>}
      </div>

      <div className="card">
        <div className="card-h"><h2>Rentabilité par avion <span className="badge">{view==="annuel"?year:QL[q]+" "+year}</span></h2></div>
        <div className="tw"><table>
          <thead><tr><th>Avion</th><th>Type</th><th>Heures</th><th>Vols</th><th>Revenus</th><th>Dépenses</th><th>Résultat</th><th>Coût/h</th><th>Verdict</th></tr></thead>
          <tbody>{data.aircraft.map(ac => {
            const f = aggAC(data,ac.id,year,range);
            const ok = f.resultat >= 0;
            return (<tr key={ac.id}>
              <td className="tx" style={{color:"var(--accent)",fontWeight:700}}>{ac.immat}</td>
              <td className="tx">{ac.type}</td>
              <td className="num">{fH(f.heures)}</td><td className="num">{f.rotations}</td>
              <td className="num" style={{color:"var(--accent)"}}>{fmt(f.revenu)}</td>
              <td className="num">{fmt(f.depenses)}</td>
              <td className={ok?"pos":"neg"}>{ok?"+":""}{fmt(f.resultat)}</td>
              <td className="num">{f.heures>0?fmt2(f.coutH):"—"}</td>
              <td><span className={`tag ${ok?"tag-g":"tag-r"}`}>{ok?"RENTABLE":"DÉFICIT"}</span></td>
            </tr>);
          })}</tbody>
        </table></div>
      </div>

      <div className="card">
        <div className="card-h"><h2>Décomposition des coûts</h2></div>
        <div className="card-b">
          {data.aircraft.map(ac => {
            const f = aggAC(data,ac.id,year,range);
            if (f.depenses === 0) return null;
            const items = [
              {l:"Coûts fixes",v:f.fixe,c:"#2563eb"},{l:"Carburant",v:f.carburant,c:"#d97706"},
              {l:"Maintenance var.",v:f.variable-f.carburant,c:"#7c3aed"},
              {l:"Prêts",v:f.loan,c:"#a78bfa"},{l:"Opérations",v:f.opsC,c:"#dc2626"},
            ].filter(x => x.v > 0);
            return (<div key={ac.id} style={{marginBottom:20}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10,color:"var(--accent)"}}>{ac.immat} — {ac.type}</div>
              {items.map((it,i) => <div className="cb-row" key={i}><div className="cb-dot" style={{background:it.c}}/><div className="cb-label">{it.l}</div><div className="cb-val">{fmt(it.v)}</div><div className="cb-pct">{fP(it.v/f.depenses)}</div></div>)}
            </div>);
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h2>Résultat mensuel {year}</h2></div>
        <div className="card-b"><BarChart data={data} year={year}/></div>
      </div>

      <div className="card">
        <div className="card-h"><h2>Historique 2022 – 2026</h2></div>
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

function BarChart({ data, year }) {
  const res = MOS.map((_,i) => { let r=0; data.aircraft.forEach(ac => { r += calcMonth(data,ac.id,year,i).resultat; }); return r; });
  const mx = Math.max(1,...res.map(Math.abs));
  return (<div className="bc">{MOS.map((m,i) => {
    const v = res[i]; const h = Math.max(4,(Math.abs(v)/mx)*140);
    return (<div className="bc-c" key={i}><div className="bc-v">{v!==0?fmt(v):""}</div><div className="bc-b" style={{height:h,background:v>=0?"var(--green)":"var(--red)",opacity:v===0?.2:.8}}/><div className="bc-l">{m}</div></div>);
  })}</div>);
}

// ════════ ACTIVITY ════════
function Activity({ data, db, year }) {
  const [acId, setAcId] = useState(data.aircraft[0]?.id || null);
  if (!data.aircraft.length) return <div className="card"><div className="empty">Ajoutez des avions dans Flotte.</div></div>;
  return (<div>
    <div className="sec-t">Avion</div>
    <div className="chips">{data.aircraft.map(a => <button key={a.id} className={`chip ${acId===a.id?"on":""}`} onClick={() => setAcId(a.id)}>{a.immat} — {a.type}</button>)}</div>
    <div className="card">
      <div className="card-h"><h2>Activité {year} <span className="badge">{data.aircraft.find(a=>a.id===acId)?.immat}</span></h2></div>
      <div className="tw"><table>
        <thead><tr><th>Mois</th><th>Heures de vol</th><th>Nombre de vols</th><th>Tarif (€/h)</th><th>Forfait roulage</th><th>Revenu</th></tr></thead>
        <tbody>{MOS.map((m,i) => {
          const act = getActivity(data,acId,year,i);
          const tarif = getRate(data.rates,acId,"tarifHeure",year,i);
          const forfait = getRate(data.rates,acId,"forfaitRoulage",year,i);
          const rev = (act.heures||0)*tarif + (act.rotations||0)*forfait;
          return (<tr key={i}>
            <td className="tx" style={{fontWeight:600}}>{m}</td>
            <td><input type="number" step="0.1" min="0" value={act.heures||""} placeholder="0" onChange={e => db.setMonthly(acId,year,i,pf(e.target.value),act.rotations||0)} style={{width:90,padding:"6px 10px",border:"1px solid var(--border)",borderRadius:6,fontSize:14,fontFamily:"inherit",outline:"none",background:"var(--bg)"}}/></td>
            <td><input type="number" step="1" min="0" value={act.rotations||""} placeholder="0" onChange={e => db.setMonthly(acId,year,i,act.heures||0,pf(e.target.value))} style={{width:80,padding:"6px 10px",border:"1px solid var(--border)",borderRadius:6,fontSize:14,fontFamily:"inherit",outline:"none",background:"var(--bg)"}}/></td>
            <td className="num" style={{color:"var(--text3)"}}>{tarif>0?fmt2(tarif):"—"}</td>
            <td className="num" style={{color:"var(--text3)"}}>{forfait>0?fmt2(forfait):"—"}</td>
            <td className="num" style={{fontWeight:600,color:"var(--accent)"}}>{rev>0?fmt(rev):"—"}</td>
          </tr>);
        })}</tbody>
      </table></div>
    </div>
  </div>);
}

// ════════ RATES ════════
function Rates({ data, db, modal, setModal }) {
  const [acId, setAcId] = useState(data.aircraft[0]?.id || null);
  const [form, setForm] = useState({ field:"", value:"", fromYear:new Date().getFullYear(), fromMonth:new Date().getMonth() });

  const openAdd = (fieldKey) => { setForm({field:fieldKey,value:"",fromYear:new Date().getFullYear(),fromMonth:new Date().getMonth()}); setModal("rate"); };
  const save = async () => { if (!acId || !form.field) return; await db.addRate(acId, form.field, pf(form.value), parseInt(form.fromYear), parseInt(form.fromMonth)); setModal(null); };

  if (!data.aircraft.length) return <div className="card"><div className="empty">Ajoutez des avions dans Flotte.</div></div>;

  return (<div>
    <div className="sec-t">Avion</div>
    <div className="chips">{data.aircraft.map(a => <button key={a.id} className={`chip ${acId===a.id?"on":""}`} onClick={() => setAcId(a.id)}>{a.immat}</button>)}</div>
    <p style={{fontSize:13,color:"var(--text3)",marginBottom:20}}>Chaque valeur s&apos;applique à partir de la date indiquée jusqu&apos;à ce qu&apos;une nouvelle la remplace.</p>

    {RATE_GROUPS.map(group => (
      <div className="card" key={group.group}>
        <div className="card-h"><h2>{group.group}</h2></div>
        <div className="card-b">
          {group.fields.map(field => {
            const periods = data.rates.filter(r => r.acId===acId && r.field===field.key).sort((a,b) => (a.fromYear*12+a.fromMonth) - (b.fromYear*12+b.fromMonth));
            return (<div key={field.key} style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div><span style={{fontSize:13,fontWeight:600}}>{field.label}</span>{field.help && <span style={{fontSize:11,color:"var(--text3)",marginLeft:8}}>{field.help}</span>}</div>
                <button className="btn btn-s btn-p" onClick={() => openAdd(field.key)}>+ Période</button>
              </div>
              {periods.length === 0 && <div style={{fontSize:13,color:"var(--text3)",padding:"8px 0"}}>Aucune valeur définie</div>}
              {periods.map(p => (<div className="rate-period" key={p.id}>
                <div className="rp-date">À partir de {MOS[p.fromMonth]} {p.fromYear}</div>
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
      <div className="mod-h"><h3>Nouvelle période</h3><button className="btn btn-s btn-ghost" onClick={() => setModal(null)}>✕</button></div>
      <div className="mod-b"><div className="fg">
        <div className="fi"><label>Année</label><select value={form.fromYear} onChange={e => setForm(f => ({...f,fromYear:e.target.value}))}>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
        <div className="fi"><label>Mois</label><select value={form.fromMonth} onChange={e => setForm(f => ({...f,fromMonth:e.target.value}))}>{MO.map((m,i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div className="fi"><label>Valeur</label><input type="number" step="0.01" value={form.value} placeholder="0" onChange={e => setForm(f => ({...f,value:e.target.value}))}/></div>
      </div></div>
      <div className="mod-f"><button className="btn" onClick={() => setModal(null)}>Annuler</button><button className="btn btn-p" onClick={save}>Enregistrer</button></div>
    </div></div>)}
  </div>);
}

// ════════ OPS ════════
function Ops({ data, db, year, modal, setModal }) {
  const [form, setForm] = useState({ acId:"", year, month:0, cost:"", label:"", desc:"", type:"maintenance" });
  const openAdd = () => { setForm({acId:data.aircraft[0]?.id||"",year,month:new Date().getMonth(),cost:"",label:"",desc:"",type:"maintenance"}); setModal("op"); };
  const save = async () => { if(!form.acId||!form.label) return; await db.addOp({...form,cost:pf(form.cost)}); setModal(null); };
  const yearOps = (data.ops||[]).filter(o => pf(o.year)===year).sort((a,b) => a.month-b.month);

  return (<div>
    <div className="card">
      <div className="card-h"><h2>Opérations exceptionnelles — {year}</h2><button className="btn btn-p" onClick={openAdd}>+ Ajouter</button></div>
      {!yearOps.length ? <div className="empty">Aucune opération en {year}.</div> : (
        <div className="tw"><table>
          <thead><tr><th>Mois</th><th>Avion</th><th>Type</th><th>Libellé</th><th>Coût</th><th></th></tr></thead>
          <tbody>{yearOps.map(o => {
            const ac = data.aircraft.find(a=>a.id===o.acId);
            return (<tr key={o.id}>
              <td className="tx">{MOS[o.month]} {o.year}</td>
              <td className="tx" style={{color:"var(--accent)",fontWeight:600}}>{ac?.immat||"?"}</td>
              <td><span className={`tag ${o.type==="maintenance"?"tag-o":o.type==="arret"?"tag-r":"tag-p"}`}>{o.type==="maintenance"?"MAINT.":o.type==="arret"?"ARRÊT":"AUTRE"}</span></td>
              <td className="tx">{o.label}</td>
              <td className="num" style={{color:"var(--red)",fontWeight:600}}>{fmt(o.cost)}</td>
              <td><button className="btn btn-s btn-d btn-ghost" onClick={() => db.deleteOp(o.id)}>✕</button></td>
            </tr>);
          })}</tbody>
        </table></div>
      )}
    </div>
    {modal==="op" && (<div className="mo" onClick={()=>setModal(null)}><div className="mod" onClick={e=>e.stopPropagation()}>
      <div className="mod-h"><h3>Nouvelle opération</h3><button className="btn btn-s btn-ghost" onClick={()=>setModal(null)}>✕</button></div>
      <div className="mod-b">
        <div className="fg" style={{marginBottom:14}}>
          <div className="fi"><label>Avion</label><select value={form.acId} onChange={e=>setForm(f=>({...f,acId:e.target.value}))}>{data.aircraft.map(a=><option key={a.id} value={a.id}>{a.immat}</option>)}</select></div>
          <div className="fi"><label>Type</label><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}><option value="maintenance">Maintenance</option><option value="arret">Arrêt avion</option><option value="autre">Autre</option></select></div>
        </div>
        <div className="fg" style={{marginBottom:14}}>
          <div className="fi"><label>Année</label><select value={form.year} onChange={e=>setForm(f=>({...f,year:parseInt(e.target.value)}))}>{YEARS.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
          <div className="fi"><label>Mois</label><select value={form.month} onChange={e=>setForm(f=>({...f,month:parseInt(e.target.value)}))}>{MO.map((m,i)=><option key={i} value={i}>{m}</option>)}</select></div>
          <div className="fi"><label>Coût (€)</label><input type="number" min="0" value={form.cost} placeholder="0" onChange={e=>setForm(f=>({...f,cost:e.target.value}))}/></div>
        </div>
        <div className="fi" style={{marginBottom:14}}><label>Libellé</label><input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder="GV 2000h…"/></div>
        <div className="fi"><label>Description</label><textarea value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder="Détails…"/></div>
      </div>
      <div className="mod-f"><button className="btn" onClick={()=>setModal(null)}>Annuler</button><button className="btn btn-p" onClick={save}>Enregistrer</button></div>
    </div></div>)}
  </div>);
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
function Simulation({ data, year }) {
  const [adjH, setAdjH] = useState(0);
  const [adjT, setAdjT] = useState(0);
  const [adjC, setAdjC] = useState(0);
  const [adjF, setAdjF] = useState(0);

  const current = useMemo(() => globAgg(data,year,ALL12), [data,year]);

  const proj = useMemo(() => {
    let tR=0, tD=0, tH=0;
    const items = [];
    data.aircraft.forEach(ac => {
      const cur = aggAC(data,ac.id,year,ALL12);
      const lm = Math.min(11, new Date().getMonth());
      const tarif = getRate(data.rates,ac.id,"tarifHeure",year,lm);
      const forfait = getRate(data.rates,ac.id,"forfaitRoulage",year,lm);
      const pC = getRate(data.rates,ac.id,"prixCarburant",year,lm);
      const cC = getRate(data.rates,ac.id,"consoCarburant",year,lm);
      const mH = getRate(data.rates,ac.id,"maintenanceHoraire",year,lm);
      const newH = cur.heures*(1+adjH/100);
      const rev = newH*tarif*(1+adjT/100) + cur.rotations*forfait*(1+adjT/100);
      const varC = newH*cC*pC*(1+adjC/100) + newH*mH;
      const dep = cur.fixe*(1+adjF/100) + varC + cur.loan + cur.opsC;
      const res = rev-dep;
      items.push({ac,heures:newH,rev,dep,res,delta:res-cur.resultat});
      tR += rev; tD += dep; tH += newH;
    });
    return { items, tR, tD, tRes:tR-tD, tH };
  }, [data,year,adjH,adjT,adjC,adjF]);

  if (!data.aircraft.length) return <div className="card"><div className="empty">Ajoutez des données pour simuler.</div></div>;

  return (<div>
    <div className="card">
      <div className="card-h"><h2>Projection <span className="badge">base {year}</span></h2><button className="btn btn-s" onClick={() => {setAdjH(0);setAdjT(0);setAdjC(0);setAdjF(0);}}>Réinitialiser</button></div>
      <div className="card-b">
        <p style={{fontSize:13,color:"var(--text3)",marginBottom:16}}>Déplacez les curseurs pour voir l&apos;impact sur le résultat.</p>
        {[
          {l:"Heures de vol",v:adjH,set:setAdjH,min:-50,max:100,inv:false},
          {l:"Tarif horaire + roulage",v:adjT,set:setAdjT,min:-30,max:50,inv:false},
          {l:"Prix carburant",v:adjC,set:setAdjC,min:-30,max:80,inv:true},
          {l:"Coûts fixes",v:adjF,set:setAdjF,min:-30,max:50,inv:true},
        ].map(s => (<div className="sl-row" key={s.l}>
          <label>{s.l}</label>
          <input type="range" min={s.min} max={s.max} value={s.v} onChange={e => s.set(Number(e.target.value))}/>
          <div className="sl-val" style={{color:s.v===0?"var(--text)":((s.v>0)!==s.inv)?"var(--green)":"var(--red)"}}>{s.v>0?"+":""}{s.v}%</div>
        </div>))}
      </div>
    </div>
    <div className="sg">
      <div className="sc"><div className="sc-l">Résultat actuel</div><div className={`sc-v ${current.resultat>=0?"g":"r"}`}>{current.resultat>=0?"+":""}{fmt(current.resultat)}</div></div>
      <div className="sc hl" style={{borderColor:proj.tRes>=0?"var(--green)":"var(--red)"}}>
        <div className="sc-l">Résultat projeté</div>
        <div className={`sc-v ${proj.tRes>=0?"g":"r"}`}>{proj.tRes>=0?"+":""}{fmt(proj.tRes)}</div>
        <div className="sc-s">Δ {proj.tRes>current.resultat?"+":""}{fmt(proj.tRes-current.resultat)}</div>
      </div>
      <div className="sc"><div className="sc-l">Revenus projetés</div><div className="sc-v b">{fmt(proj.tR)}</div></div>
      <div className="sc"><div className="sc-l">Heures projetées</div><div className="sc-v">{fH(proj.tH)}</div></div>
    </div>
    <div className="card">
      <div className="card-h"><h2>Détail par avion</h2></div>
      <div className="tw"><table>
        <thead><tr><th>Avion</th><th>Heures</th><th>Revenus</th><th>Dépenses</th><th>Résultat</th><th>vs Actuel</th></tr></thead>
        <tbody>{proj.items.map(({ac,heures,rev,dep,res,delta}) => (<tr key={ac.id}>
          <td className="tx" style={{color:"var(--accent)",fontWeight:700}}>{ac.immat}</td>
          <td className="num">{fH(heures)}</td><td className="num" style={{color:"var(--accent)"}}>{fmt(rev)}</td>
          <td className="num">{fmt(dep)}</td><td className={res>=0?"pos":"neg"}>{res>=0?"+":""}{fmt(res)}</td>
          <td style={{color:delta>=0?"var(--green)":"var(--red)",fontWeight:600}}>{delta>=0?"+":""}{fmt(delta)}</td>
        </tr>))}</tbody>
      </table></div>
    </div>
  </div>);
}

// ════════ FLEET ════════
function Fleet({ data, db, modal, setModal }) {
  const [form, setForm] = useState({ immat:"", type:"" });
  const [editId, setEditId] = useState(null);
  const openAdd = () => { setForm({immat:"",type:""}); setEditId(null); setModal("ac"); };
  const openEdit = ac => { setForm({immat:ac.immat,type:ac.type}); setEditId(ac.id); setModal("ac"); };
  const save = async () => {
    if (!form.immat) return;
    if (editId) await db.updateAircraft(editId, form.immat, form.type);
    else await db.addAircraft(form.immat, form.type);
    setModal(null);
  };

  return (<div>
    <div className="card">
      <div className="card-h"><h2>Flotte</h2><button className="btn btn-p" onClick={openAdd}>+ Ajouter un avion</button></div>
      {!data.aircraft.length ? <div className="empty">Aucun avion configuré.</div> : (
        <div className="tw"><table>
          <thead><tr><th>Immatriculation</th><th>Type</th><th>Tarifs</th><th>Prêts</th><th>Opérations</th><th></th></tr></thead>
          <tbody>{data.aircraft.map(ac => {
            const nR = data.rates.filter(r=>r.acId===ac.id).length;
            const nL = (data.loans||[]).filter(l=>l.acId===ac.id).length;
            const nO = (data.ops||[]).filter(o=>o.acId===ac.id).length;
            return (<tr key={ac.id}>
              <td className="tx" style={{color:"var(--accent)",fontWeight:700}}>{ac.immat}</td>
              <td className="tx">{ac.type}</td>
              <td>{nR>0?<span className="tag tag-g">{nR}</span>:"—"}</td>
              <td>{nL>0?<span className="tag tag-p">{nL}</span>:"—"}</td>
              <td>{nO>0?<span className="tag tag-o">{nO}</span>:"—"}</td>
              <td style={{display:"flex",gap:6}}>
                <button className="btn btn-s" onClick={() => openEdit(ac)}>Modifier</button>
                <button className="btn btn-s btn-d" onClick={() => db.deleteAircraft(ac.id)}>Supprimer</button>
              </td>
            </tr>);
          })}</tbody>
        </table></div>
      )}
    </div>
    {modal==="ac" && (<div className="mo" onClick={()=>setModal(null)}><div className="mod" onClick={e=>e.stopPropagation()}>
      <div className="mod-h"><h3>{editId?"Modifier":"Ajouter"} un avion</h3><button className="btn btn-s btn-ghost" onClick={()=>setModal(null)}>✕</button></div>
      <div className="mod-b"><div className="fg">
        <div className="fi"><label>Immatriculation</label><input value={form.immat} onChange={e=>setForm(f=>({...f,immat:e.target.value.toUpperCase()}))} placeholder="F-GXXX"/></div>
        <div className="fi"><label>Type avion</label><input value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} placeholder="DR400-120"/></div>
      </div></div>
      <div className="mod-f"><button className="btn" onClick={()=>setModal(null)}>Annuler</button><button className="btn btn-p" onClick={save}>Enregistrer</button></div>
    </div></div>)}
  </div>);
}
