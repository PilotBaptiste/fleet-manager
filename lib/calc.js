// ════════════════════════════════════════
// Pure calculation functions
// ════════════════════════════════════════

export const YEARS = [2022, 2023, 2024, 2025, 2026];
export const MO = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
export const MOS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
export const QL = ["T1","T2","T3","T4"];
export const QM = [[0,1,2],[3,4,5],[6,7,8],[9,10,11]];
export const ALL12 = [0,1,2,3,4,5,6,7,8,9,10,11];

export const pf = v => parseFloat(v) || 0;
export const fmt = n => new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:0,maximumFractionDigits:0}).format(n);
export const fmt2 = n => new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
export const fH = n => n.toFixed(1) + "h";
export const fP = n => (n * 100).toFixed(1) + "%";

export const RATE_GROUPS = [
  { group: "Tarification", fields: [
    { key: "tarifHeure", label: "Tarif heure de vol (€/h)", step: "1" },
    { key: "forfaitRoulage", label: "Forfait roulage (€)", step: "0.5", help: "Facturé par vol" },
  ]},
  { group: "Coûts fixes mensuels", fields: [
    { key: "assurance", label: "Assurance (€/mois)", step: "1" },
    { key: "hangar", label: "Hangar / Parking (€/mois)", step: "1" },
    { key: "maintenanceFixe", label: "Maint. programmée (€/mois)", step: "1" },
    { key: "redevance", label: "Redevance aérodrome (€/mois)", step: "1" },
    { key: "navigabilite", label: "Navigabilité / CDN (€/mois)", step: "1" },
    { key: "diversFixe", label: "Divers fixes (€/mois)", step: "1" },
  ]},
  { group: "Coûts variables", fields: [
    { key: "prixCarburant", label: "Prix carburant (€/L)", step: "0.01" },
    { key: "consoCarburant", label: "Conso carburant (L/h)", step: "0.1" },
    { key: "prixHuile", label: "Prix huile (€/L)", step: "0.01" },
    { key: "consoHuile", label: "Conso huile (L/h)", step: "0.001" },
    { key: "maintenanceHoraire", label: "Provision maintenance (€/h)", step: "0.1" },
  ]},
];

export function getRate(rates, acId, field, year, month) {
  const target = year * 12 + month;
  let best = null, bestTime = -1;
  rates.forEach(r => {
    if (r.acId === acId && r.field === field) {
      const t = (r.fromYear || 2022) * 12 + (r.fromMonth || 0);
      if (t <= target && t > bestTime) { bestTime = t; best = r; }
    }
  });
  return best ? pf(best.value) : 0;
}

export function getActivity(data, acId, year, month) {
  return data.monthly[`${acId}|${year}|${month}`] || { heures: 0, rotations: 0 };
}

export function loanPayment(amount, rateY, months) {
  if (!amount || !months) return 0;
  if (!rateY) return amount / months;
  const r = rateY / 100 / 12;
  return amount * (r * Math.pow(1+r,months)) / (Math.pow(1+r,months) - 1);
}

export function loanCost(loans, acId, year, month) {
  let total = 0;
  (loans || []).filter(l => l.acId === acId).forEach(l => {
    const s = (l.startYear||2022)*12 + (l.startMonth||0);
    const cur = year*12 + month;
    if (cur >= s && cur < s + (l.durationMonths||0))
      total += loanPayment(pf(l.amount), pf(l.rate), l.durationMonths||1);
  });
  return total;
}

export function opsCost(ops, acId, year, month) {
  let total = 0;
  (ops || []).filter(o => o.acId === acId && pf(o.year) === year && pf(o.month) === month).forEach(o => {
    total += pf(o.cost);
  });
  return total;
}

export function calcMonth(data, acId, y, m) {
  const act = getActivity(data, acId, y, m);
  const h = act.heures || 0, rot = act.rotations || 0;
  const tarif = getRate(data.rates, acId, "tarifHeure", y, m);
  const forfait = getRate(data.rates, acId, "forfaitRoulage", y, m);
  const revenu = h * tarif + rot * forfait;

  let fixe = 0;
  ["assurance","hangar","maintenanceFixe","redevance","navigabilite","diversFixe"].forEach(k => {
    fixe += getRate(data.rates, acId, k, y, m);
  });

  const carburant = h * getRate(data.rates, acId, "consoCarburant", y, m) * getRate(data.rates, acId, "prixCarburant", y, m);
  const huile = h * getRate(data.rates, acId, "consoHuile", y, m) * getRate(data.rates, acId, "prixHuile", y, m);
  const mainVar = h * getRate(data.rates, acId, "maintenanceHoraire", y, m);
  const variable = carburant + huile + mainVar;
  const loan = loanCost(data.loans, acId, y, m);
  const opsC = opsCost(data.ops, acId, y, m);
  const depenses = fixe + variable + loan + opsC;
  const resultat = revenu - depenses;
  const coutH = h > 0 ? depenses / h : 0;

  return { heures:h, rotations:rot, tarif, forfait, revenu, fixe, variable, depenses, resultat, coutH, carburant, huile, mainVar, loan, opsC };
}

export function aggAC(data, acId, y, ms) {
  let t = { heures:0, rotations:0, revenu:0, fixe:0, variable:0, depenses:0, resultat:0, loan:0, opsC:0, carburant:0 };
  ms.forEach(m => { const c = calcMonth(data,acId,y,m); Object.keys(t).forEach(k => t[k] += c[k]); });
  t.coutH = t.heures > 0 ? t.depenses / t.heures : 0;
  return t;
}

export function globAgg(data, y, ms) {
  let t = { heures:0, rotations:0, revenu:0, fixe:0, variable:0, depenses:0, resultat:0, loan:0, opsC:0 };
  data.aircraft.forEach(ac => { const a = aggAC(data,ac.id,y,ms); Object.keys(t).forEach(k => t[k] += a[k]); });
  return t;
}
