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
    { key: "forfaitRoulage", label: "Forfait roulage (min)", step: "1", help: "Minutes facturées au tarif horaire par vol" },
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
  const forfaitMin = getRate(data.rates, acId, "forfaitRoulage", y, m);
  const forfaitEur = (forfaitMin / 60) * tarif;
  const revenuVol = h * tarif;
  const revenuRoulage = rot * forfaitEur;
  const revenu = revenuVol + revenuRoulage;

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

  return { heures:h, rotations:rot, tarif, forfaitMin, forfaitEur, revenu, revenuVol, revenuRoulage, fixe, variable, depenses, resultat, coutH, carburant, huile, mainVar, loan, opsC };
}

export function aggAC(data, acId, y, ms) {
  let t = { heures:0, rotations:0, revenu:0, revenuVol:0, revenuRoulage:0, fixe:0, variable:0, depenses:0, resultat:0, loan:0, opsC:0, carburant:0 };
  ms.forEach(m => { const c = calcMonth(data,acId,y,m); Object.keys(t).forEach(k => t[k] += c[k]); });
  t.coutH = t.heures > 0 ? t.depenses / t.heures : 0;
  return t;
}

export function globAgg(data, y, ms) {
  let t = { heures:0, rotations:0, revenu:0, revenuVol:0, revenuRoulage:0, fixe:0, variable:0, depenses:0, resultat:0, loan:0, opsC:0 };
  data.aircraft.forEach(ac => { const a = aggAC(data,ac.id,y,ms); Object.keys(t).forEach(k => t[k] += a[k]); });
  return t;
}

// ════════════════════════════════════════
// Extended calculation functions
// ════════════════════════════════════════

export function revenuePerHour(agg) {
  return agg.heures > 0 ? agg.revenu / agg.heures : 0;
}

export function calcMonthWithOverrides(data, acId, y, m, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return calcMonth(data, acId, y, m);

  const rateFields = ["tarifHeure","forfaitRoulage","assurance","hangar","maintenanceFixe","redevance","navigabilite","diversFixe","prixCarburant","consoCarburant","prixHuile","consoHuile","maintenanceHoraire"];
  const overriddenFields = new Set(rateFields.filter(k => overrides[k] !== undefined));

  const syntheticRates = overriddenFields.size > 0
    ? [
        ...data.rates.filter(r => !(r.acId === acId && overriddenFields.has(r.field))),
        ...[...overriddenFields].map(field => ({ acId, field, value: overrides[field], fromYear: 2000, fromMonth: 0 })),
      ]
    : data.rates;

  const actKey = `${acId}|${y}|${m}`;
  const origAct = data.monthly[actKey] || { heures: 0, rotations: 0 };
  const newHeuresTotal = overrides.heures !== undefined ? overrides.heures : null;
  const newRotTotal = overrides.rotations !== undefined ? overrides.rotations : null;

  let syntheticMonthly = data.monthly;
  if (newHeuresTotal !== null || newRotTotal !== null) {
    syntheticMonthly = { ...data.monthly };
    syntheticMonthly[actKey] = {
      heures: newHeuresTotal !== null ? newHeuresTotal / 12 : origAct.heures,
      rotations: newRotTotal !== null ? Math.round(newRotTotal / 12) : origAct.rotations,
    };
  }

  return calcMonth({ ...data, rates: syntheticRates, monthly: syntheticMonthly }, acId, y, m);
}

export function aggACWithOverrides(data, acId, y, ms, overrides) {
  let t = { heures:0, rotations:0, revenu:0, revenuVol:0, revenuRoulage:0, fixe:0, variable:0, depenses:0, resultat:0, loan:0, opsC:0, carburant:0 };
  ms.forEach(m => { const c = calcMonthWithOverrides(data, acId, y, m, overrides); Object.keys(t).forEach(k => t[k] += c[k]); });
  t.coutH = t.heures > 0 ? t.depenses / t.heures : 0;
  return t;
}

export function globAggWithOverrides(data, y, ms, overridesMap) {
  let t = { heures:0, rotations:0, revenu:0, revenuVol:0, revenuRoulage:0, fixe:0, variable:0, depenses:0, resultat:0, loan:0, opsC:0 };
  data.aircraft.forEach(ac => {
    const ov = overridesMap && overridesMap[ac.id] ? overridesMap[ac.id] : null;
    const a = ov ? aggACWithOverrides(data, ac.id, y, ms, ov) : aggAC(data, ac.id, y, ms);
    Object.keys(t).forEach(k => t[k] += a[k]);
  });
  return t;
}

export function breakEvenHours(data, acId, year, ms, overrideTarif, overrideForfaitMin) {
  const lm = ms[ms.length - 1] || 0;
  const tarif = overrideTarif !== undefined ? overrideTarif : getRate(data.rates, acId, "tarifHeure", year, lm);
  const forfaitMin = overrideForfaitMin !== undefined ? overrideForfaitMin : getRate(data.rates, acId, "forfaitRoulage", year, lm);
  const forfaitEur = (forfaitMin / 60) * tarif;

  let totalFixed = 0;
  const fixedFields = ["assurance","hangar","maintenanceFixe","redevance","navigabilite","diversFixe"];
  ms.forEach(m => {
    fixedFields.forEach(k => { totalFixed += getRate(data.rates, acId, k, year, m); });
    totalFixed += loanCost(data.loans, acId, year, m);
    totalFixed += opsCost(data.ops, acId, year, m);
  });

  const pC = getRate(data.rates, acId, "prixCarburant", year, lm);
  const cC = getRate(data.rates, acId, "consoCarburant", year, lm);
  const pH = getRate(data.rates, acId, "prixHuile", year, lm);
  const cH = getRate(data.rates, acId, "consoHuile", year, lm);
  const mH = getRate(data.rates, acId, "maintenanceHoraire", year, lm);
  const variablePerH = cC * pC + cH * pH + mH;

  // Estimate rotations per hour from actual data
  const actual = aggAC(data, acId, year, ms);
  const rotPerH = actual.heures > 0 ? actual.rotations / actual.heures : 1;
  const revenuePerH = tarif + rotPerH * forfaitEur;
  const marginPerH = revenuePerH - variablePerH;

  if (marginPerH <= 0) return Infinity;
  return totalFixed / marginPerH;
}

export function sensitivityAnalysis(data, acId, year, ms, field, steps) {
  return steps.map(value => {
    const ov = { [field]: value };
    const agg = aggACWithOverrides(data, acId, year, ms, ov);
    return { value, revenu: agg.revenu, depenses: agg.depenses, resultat: agg.resultat };
  });
}
