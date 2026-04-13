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
export const fH = n => { const h = Math.floor(n); const m = Math.round((n - h) * 60); return h + "h" + (m > 0 ? String(m).padStart(2,"0") : ""); };
export const fP = n => (n * 100).toFixed(1) + "%";

// HH:MM ↔ decimal conversion
export const hmToDecimal = (str) => {
  if (!str) return 0;
  if (str.includes(":")) {
    const [h, m] = str.split(":").map(Number);
    return (h || 0) + (m || 0) / 60;
  }
  if (str.includes("h")) {
    const [h, m] = str.split("h").map(Number);
    return (h || 0) + (m || 0) / 60;
  }
  return parseFloat(str) || 0;
};
export const decimalToHM = (n) => {
  if (!n) return "";
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return h + ":" + String(m).padStart(2, "0");
};

// Standard rate groups (per-aircraft, non-flight-type)
export const RATE_GROUPS = [
  { group: "Tarification", fields: [
    { key: "tarifHeure", label: "Vols pilotes CdB/DC (€/h)", step: "1" },
  ]},
  { group: "Consommations", fields: [
    { key: "consoCarburant", label: "Conso carburant (L/h)", step: "0.1" },
    { key: "consoHuile", label: "Conso huile (L/h)", step: "0.001" },
  ]},
];

// Build dynamic rate fields from flight types (for Rates & Simulation UI)
export function getDynamicRateFields(flightTypes) {
  const fields = [];
  (flightTypes || []).forEach(ft => {
    if (ft.mode === "tarif" && ft.tarifKey) {
      fields.push({ key: ft.tarifKey, label: `${ft.name} (€/vol)`, step: "1" });
    } else if (ft.mode === "pax3") {
      if (ft.tarifKey) fields.push({ key: ft.tarifKey, label: `${ft.name} 1 pax (€/vol)`, step: "1" });
      if (ft.tarifKey2) fields.push({ key: ft.tarifKey2, label: `${ft.name} 2 pax (€/vol)`, step: "1" });
      if (ft.tarifKey3) fields.push({ key: ft.tarifKey3, label: `${ft.name} 3 pax (€/vol)`, step: "1" });
    }
  });
  return fields;
}

// Build full rate groups including dynamic flight type tariffs
export function getAllRateGroups(flightTypes) {
  const ftFields = getDynamicRateFields(flightTypes);
  return [
    ...RATE_GROUPS,
    ...(ftFields.length > 0 ? [{ group: "Tarifs types de vol", fields: ftFields }] : []),
  ];
}

export const GLOBAL_RATE_FIELDS = [];

// Helper: check if aircraft is active for a given year/month
export function isAircraftActive(ac, year, month) {
  if (ac.activeFrom) {
    const [fy, fm] = ac.activeFrom.split("-").map(Number);
    if (year < fy || (year === fy && month < fm - 1)) return false;
  }
  if (ac.activeTo) {
    const [ty, tm] = ac.activeTo.split("-").map(Number);
    if (year > ty || (year === ty && month > tm - 1)) return false;
  }
  return true;
}

// Check if aircraft was active at any point during the given months of a year
export function isAircraftActiveYear(ac, year, months) {
  return months.some(m => isAircraftActive(ac, year, m));
}

// Get fuel or oil price: global rate keyed by type (e.g. "prixCarbu_100LL")
export function getFuelPrice(rates, carbuType, year, month) {
  return getGlobalRate(rates, `prixCarbu_${carbuType}`, year, month);
}
export function getOilPrice(rates, huileType, year, month) {
  return getGlobalRate(rates, `prixHuile_${huileType}`, year, month);
}

// Get distinct fuel/oil types from aircraft list
export function getFuelTypes(aircraft) {
  return [...new Set(aircraft.map(a => a.carbuType).filter(Boolean))];
}
export function getOilTypes(aircraft) {
  return [...new Set(aircraft.map(a => a.huileType).filter(Boolean))];
}

// Rate time key: year*400 + month*32 + day (allows day-level ordering)
const rateKey = (y, m, d) => (y || 2022) * 400 + (m || 0) * 32 + (d || 1);

// Global rate: same value for all aircraft (stored with any ac_id, lookup ignores ac_id)
export function getGlobalRate(rates, field, year, month) {
  const target = rateKey(year, month, 31); // end of month = pick any rate set during/before
  let best = null, bestTime = -1;
  rates.forEach(r => {
    if (r.field === field) {
      const t = rateKey(r.fromYear, r.fromMonth, r.fromDay);
      if (t <= target && t > bestTime) { bestTime = t; best = r; }
    }
  });
  return best ? pf(best.value) : 0;
}

export function getRate(rates, acId, field, year, month) {
  const target = rateKey(year, month, 31);
  let best = null, bestTime = -1;
  rates.forEach(r => {
    if (r.acId === acId && r.field === field) {
      const t = rateKey(r.fromYear, r.fromMonth, r.fromDay);
      if (t <= target && t > bestTime) { bestTime = t; best = r; }
    }
  });
  return best ? pf(best.value) : 0;
}

// Standard monthly activity (CdB, DC, rotations, litres)
export function getActivity(data, acId, year, month) {
  return data.monthly[`${acId}|${year}|${month}`] || {
    heures: 0, heuresDc: 0, rotations: 0, litresCarburant: 0,
  };
}

// Flight activity for a specific flight type
export function getFlightAct(data, acId, ftId, year, month) {
  return (data.flightActivity || {})[`${acId}|${ftId}|${year}|${month}`] || {
    heures: 0, vols: 0, vols2: 0, vols3: 0, revenu: 0,
  };
}

// Compute revenue for one flight type in one month
export function flightTypeRevenue(data, acId, ft, year, month) {
  const fa = getFlightAct(data, acId, ft.id, year, month);
  let revenu = 0;
  if (ft.mode === "tarif" && ft.tarifKey) {
    revenu = fa.vols * getRate(data.rates, acId, ft.tarifKey, year, month);
  } else if (ft.mode === "pax3") {
    const t1 = ft.tarifKey ? getRate(data.rates, acId, ft.tarifKey, year, month) : 0;
    const t2 = ft.tarifKey2 ? getRate(data.rates, acId, ft.tarifKey2, year, month) : 0;
    const t3 = ft.tarifKey3 ? getRate(data.rates, acId, ft.tarifKey3, year, month) : 0;
    revenu = fa.vols * t1 + fa.vols2 * t2 + fa.vols3 * t3;
  } else if (ft.mode === "direct") {
    revenu = fa.revenu;
  }
  return { heures: fa.heures, vols: fa.vols, vols2: fa.vols2, vols3: fa.vols3, revenu, directRevenu: fa.revenu };
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

// Split ops cost into normal vs exceptional
export function opsCostSplit(ops, acId, year, month) {
  let normal = 0, exceptional = 0;
  (ops || []).filter(o => o.acId === acId && pf(o.year) === year && pf(o.month) === month).forEach(o => {
    if (o.isExceptional) exceptional += pf(o.cost);
    else normal += pf(o.cost);
  });
  return { normal, exceptional };
}

export function calcMonth(data, acId, y, m) {
  const ac = (data.aircraft || []).find(a => a.id === acId);
  const act = getActivity(data, acId, y, m);
  const hCdb = act.heures || 0;
  const hDc = act.heuresDc || 0;
  const heuresPilote = hCdb + hDc;
  const rotations = act.rotations || 0;

  const tarif = getRate(data.rates, acId, "tarifHeure", y, m);
  const revenuPilote = heuresPilote * tarif;

  // Dynamic flight type revenues
  const flightTypes = data.flightTypes || [];
  const ftRevenues = {};
  let totalFtHeures = 0;
  let totalFtRevenu = 0;
  flightTypes.forEach(ft => {
    const r = flightTypeRevenue(data, acId, ft, y, m);
    ftRevenues[ft.id] = r;
    totalFtHeures += r.heures;
    totalFtRevenu += r.revenu;
  });

  const heures = heuresPilote + totalFtHeures;
  const revenuVol = revenuPilote + totalFtRevenu;
  const revenu = revenuVol;

  // Fuel & oil: price is global per type, consumption is per-aircraft
  const carbuType = ac?.carbuType || "100LL";
  const huileType = ac?.huileType || "W100";
  const prixCarbu = getFuelPrice(data.rates, carbuType, y, m);
  const prixHuile = getOilPrice(data.rates, huileType, y, m);
  const litresActuels = act.litresCarburant || 0;
  const litresCalcules = heures * getRate(data.rates, acId, "consoCarburant", y, m);
  const litresUtilises = litresActuels > 0 ? litresActuels : litresCalcules;
  const carburant = litresUtilises * prixCarbu;
  const huile = heures * getRate(data.rates, acId, "consoHuile", y, m) * prixHuile;
  const variable = carburant + huile;
  const loan = loanCost(data.loans, acId, y, m);
  const { normal: opsCNormal, exceptional: opsCExceptional } = opsCostSplit(data.ops, acId, y, m);
  const opsC = opsCNormal + opsCExceptional;
  const depensesNormales = variable + loan + opsCNormal;
  const depenses = depensesNormales + opsCExceptional;
  const resultat = revenu - depenses;
  const resultatRecurrent = revenu - depensesNormales;
  const coutH = heures > 0 ? depenses / heures : 0;

  return {
    heures, rotations, hCdb, hDc, heuresPilote,
    tarif,
    revenu, revenuVol, revenuPilote, totalFtRevenu,
    ftRevenues,
    litresCarburant: litresUtilises, litresActuels,
    variable, depenses, depensesNormales, resultat, resultatRecurrent,
    coutH, carburant, huile, loan, opsC, opsCNormal, opsCExceptional,
  };
}

const AGG_KEYS = ["heures","rotations","hCdb","hDc","heuresPilote","revenu","revenuVol","revenuPilote","totalFtRevenu","litresCarburant","variable","depenses","depensesNormales","resultat","resultatRecurrent","loan","opsC","opsCNormal","opsCExceptional","carburant"];

function mergeFtRevenues(target, source) {
  Object.entries(source || {}).forEach(([ftId, r]) => {
    if (!target[ftId]) target[ftId] = { heures: 0, vols: 0, vols2: 0, vols3: 0, revenu: 0 };
    target[ftId].heures += r.heures;
    target[ftId].vols += r.vols;
    target[ftId].vols2 += r.vols2;
    target[ftId].vols3 += r.vols3;
    target[ftId].revenu += r.revenu;
  });
}

export function aggAC(data, acId, y, ms) {
  let t = {}; AGG_KEYS.forEach(k => t[k] = 0);
  t.ftRevenues = {};
  ms.forEach(m => {
    const c = calcMonth(data, acId, y, m);
    AGG_KEYS.forEach(k => t[k] += (c[k]||0));
    mergeFtRevenues(t.ftRevenues, c.ftRevenues);
  });
  t.coutH = t.heures > 0 ? t.depenses / t.heures : 0;
  return t;
}

export function globAgg(data, y, ms) {
  let t = {}; AGG_KEYS.forEach(k => t[k] = 0);
  t.ftRevenues = {};
  data.aircraft.filter(ac => isAircraftActiveYear(ac, y, ms)).forEach(ac => {
    const a = aggAC(data, ac.id, y, ms);
    AGG_KEYS.forEach(k => t[k] += a[k]);
    mergeFtRevenues(t.ftRevenues, a.ftRevenues);
  });
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

  const activityKeys = new Set(["heures", "rotations"]);
  const rateOverrides = {};
  const actOverrides = {};

  Object.entries(overrides).forEach(([k, v]) => {
    if (activityKeys.has(k)) actOverrides[k] = v;
    else rateOverrides[k] = v;
  });

  // Build synthetic rates
  const overriddenFields = new Set(Object.keys(rateOverrides));
  const syntheticRates = overriddenFields.size > 0
    ? [
        ...data.rates.filter(r => !(r.acId === acId && overriddenFields.has(r.field))),
        ...[...overriddenFields].map(field => ({ acId, field, value: rateOverrides[field], fromYear: 2000, fromMonth: 0 })),
      ]
    : data.rates;

  // Build synthetic monthly
  const actKey = `${acId}|${y}|${m}`;
  const origAct = data.monthly[actKey] || { heures: 0, rotations: 0 };
  let syntheticMonthly = data.monthly;
  if (actOverrides.heures !== undefined || actOverrides.rotations !== undefined) {
    syntheticMonthly = { ...data.monthly };
    syntheticMonthly[actKey] = {
      ...origAct,
      heures: actOverrides.heures !== undefined ? actOverrides.heures / 12 : origAct.heures,
      rotations: actOverrides.rotations !== undefined ? Math.round(actOverrides.rotations / 12) : origAct.rotations,
    };
  }

  return calcMonth({ ...data, rates: syntheticRates, monthly: syntheticMonthly }, acId, y, m);
}

export function aggACWithOverrides(data, acId, y, ms, overrides) {
  let t = {}; AGG_KEYS.forEach(k => t[k] = 0);
  t.ftRevenues = {};
  ms.forEach(m => {
    const c = calcMonthWithOverrides(data, acId, y, m, overrides);
    AGG_KEYS.forEach(k => t[k] += (c[k]||0));
    mergeFtRevenues(t.ftRevenues, c.ftRevenues);
  });
  t.coutH = t.heures > 0 ? t.depenses / t.heures : 0;
  return t;
}

export function globAggWithOverrides(data, y, ms, overridesMap) {
  let t = {}; AGG_KEYS.forEach(k => t[k] = 0);
  t.ftRevenues = {};
  data.aircraft.forEach(ac => {
    const ov = overridesMap && overridesMap[ac.id] ? overridesMap[ac.id] : null;
    const a = ov ? aggACWithOverrides(data, ac.id, y, ms, ov) : aggAC(data, ac.id, y, ms);
    Object.keys(t).forEach(k => { if (k !== "ftRevenues") t[k] += a[k]; });
    mergeFtRevenues(t.ftRevenues, a.ftRevenues);
  });
  return t;
}

export function breakEvenHours(data, acId, year, ms, overrideTarif) {
  const lm = ms[ms.length - 1] || 0;
  const tarif = overrideTarif !== undefined ? overrideTarif : getRate(data.rates, acId, "tarifHeure", year, lm);

  // Fixed costs = loans + operations (all fixed costs are now entered as ops)
  let totalFixed = 0;
  ms.forEach(m => {
    totalFixed += loanCost(data.loans, acId, year, m);
    totalFixed += opsCost(data.ops, acId, year, m);
  });

  const ac = (data.aircraft || []).find(a => a.id === acId);
  const pC = getFuelPrice(data.rates, ac?.carbuType || "100LL", year, lm);
  const cC = getRate(data.rates, acId, "consoCarburant", year, lm);
  const pH = getOilPrice(data.rates, ac?.huileType || "W100", year, lm);
  const cH = getRate(data.rates, acId, "consoHuile", year, lm);
  const variablePerH = cC * pC + cH * pH;

  const marginPerH = tarif - variablePerH;

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
