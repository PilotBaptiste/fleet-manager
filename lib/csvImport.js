// ═══════════════════════════════════════════
// CSV Import — Parse Aerogest flight exports
// ═══════════════════════════════════════════

// Smart CSV parser: handles ; and , delimiters, quoted fields
function parseCSVLine(line, delimiter) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === delimiter) { fields.push(current.trim()); current = ""; }
      else { current += ch; }
    }
  }
  fields.push(current.trim());
  return fields;
}

function detectDelimiter(headerLine) {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons >= commas ? ";" : ",";
}

// Parse DD/MM/YYYY or YYYY-MM-DD
function parseDate(str) {
  if (!str) return null;
  str = str.trim();
  // DD/MM/YYYY
  const fr = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (fr) return { day: parseInt(fr[1]), month: parseInt(fr[2]) - 1, year: parseInt(fr[3]) };
  // YYYY-MM-DD
  const iso = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (iso) return { day: parseInt(iso[3]), month: parseInt(iso[2]) - 1, year: parseInt(iso[1]) };
  return null;
}

// Normalize column headers — match fuzzy
const COL_MAP = {
  date: ["date"],
  idAerogest: ["id aerogest", "id", "aerogest"],
  pilote: ["nom pilote", "pilote", "nom"],
  instructeur: ["instructeur", "instr"],
  immat: ["immatriculation", "immat", "appareil", "avion", "aéronef", "aeronef"],
  heureDepart: ["heure départ", "heure depart", "h départ", "h depart", "départ", "depart"],
  heureArrivee: ["heure arrivée", "heure arrivee", "h arrivée", "h arrivee", "arrivée", "arrivee"],
  dureeMin: ["durée en min", "duree en min", "durée de vol", "duree de vol", "durée du vol", "duree du vol", "durée", "duree", "durée min", "duree min", "temps de vol"],
  classeVol: ["classe de vol", "classe vol", "classe"],
  typeVol: ["type de vol", "type vol", "type"],
  mode: ["mode"],
  nature: ["nature"],
  typeAdherent: ["type d'adhérent", "type d adherent", "type adherent"],
  terrainDep: ["terrain dep", "terrain départ", "terrain depart", "dep (loc)", "dep(loc)"],
  terrainArr: ["terrain arr", "terrain arrivée", "terrain arrivee", "arr (loc)", "arr(loc)"],
  atterrissages: ["atterrissage", "atterrissages", "att", "nbr att", "nb att"],
  carbuDepart: ["carburant départ", "carburant depart", "carbu départ", "carbu depart", "carb dep", "carburant départ en litre", "carburant_depart", "carburant depart"],
  carbuArrivee: ["carburant arrivée", "carburant arrivee", "carbu arrivée", "carbu arrivee", "carb arr", "carburant arrivée en litre", "carburant_arrivée", "carburant arrivée"],
  huile: ["huile", "huile en litre"],
  horametreDepart: ["horamètre1 départ", "horametre1 depart", "horamètre départ", "horametre depart", "compt dep", "compteur dep"],
  horametreArrivee: ["horamètre1 arrivée", "horametre1 arrivee", "horamètre arrivée", "horametre arrivee", "compt arr", "compteur arr"],
  correctionIndex: ["correction d'index", "correction d index", "correction index"],
  correctionAvitaillement: ["correction avitaillement"],
  correctionChauffe: ["correction temps de chauffe", "correction chauffe"],
  formation: ["formation", "formations en cours"],
  montant: ["montant", "montant en e", "montant en €", "montant (€)", "montant (en euros)", "prix"],
  tempsMeca: ["temps mécanique", "temps mecanique", "temps mécanique en minute", "temps mecanique en minute", "tps méca"],
  partenaire: ["partenaire"],
};

function matchColumn(header) {
  const h = header.toLowerCase().trim().replace(/[_\-]/g, " ");
  for (const [key, aliases] of Object.entries(COL_MAP)) {
    if (aliases.some(a => h === a || h.startsWith(a))) return key;
  }
  return null;
}

function mapHeaders(headers) {
  const mapping = {};
  headers.forEach((h, i) => {
    const key = matchColumn(h);
    if (key) mapping[key] = i;
  });
  return mapping;
}

// ── Main parse function ──

export function parseFlightCSV(csvText, filterYear) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: "Fichier vide ou invalide", flights: [], warnings: [] };

  // Auto-detect header row: scan first 10 lines for one with recognizable columns
  let headerIdx = 0;
  let delimiter = detectDelimiter(lines[0]);
  let headers = parseCSVLine(lines[0], delimiter);
  let colMap = mapHeaders(headers);

  for (let hi = 0; hi < Math.min(lines.length, 10); hi++) {
    const d = detectDelimiter(lines[hi]);
    const h = parseCSVLine(lines[hi], d);
    const cm = mapHeaders(h);
    // Accept row if it has immat + duration (or departure/arrival)
    if (cm.immat !== undefined && (cm.dureeMin !== undefined || (cm.heureDepart !== undefined && cm.heureArrivee !== undefined))) {
      headerIdx = hi;
      delimiter = d;
      headers = h;
      colMap = cm;
      break;
    }
  }

  // Validate required columns
  const required = ["immat"];
  const missing = required.filter(k => colMap[k] === undefined);
  // Need either dureeMin or departure/arrival times
  if (colMap.dureeMin === undefined && (colMap.heureDepart === undefined || colMap.heureArrivee === undefined)) {
    missing.push("durée (ou départ+arrivée)");
  }
  if (missing.length > 0) {
    return { error: `Colonnes manquantes : ${missing.join(", ")}. Colonnes trouvées : ${headers.join(", ")}`, flights: [], warnings: [] };
  }

  const flights = [];
  const warnings = [];
  const get = (row, key) => colMap[key] !== undefined ? (row[colMap[key]] || "").trim() : "";

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i], delimiter);
    if (row.length < 3) continue; // skip empty/malformed

    const immat = get(row, "immat").toUpperCase().replace(/\s/g, "");
    if (!immat) { warnings.push(`Ligne ${i + 1}: immatriculation vide, ignorée`); continue; }

    // Date
    const dateStr = get(row, "date");
    const date = parseDate(dateStr);
    if (!date) { warnings.push(`Ligne ${i + 1}: date invalide "${dateStr}", ignorée`); continue; }
    if (filterYear && date.year !== filterYear) continue; // Only keep selected year

    // Duration in minutes — handle HH:MM, HhMM, decimal hours, or plain minutes
    let dureeMin = 0;
    const dureeRaw = get(row, "dureeMin");
    if (dureeRaw) {
      const hhmm = dureeRaw.match(/^(\d{1,3})[:hH](\d{1,2})$/);
      if (hhmm) {
        dureeMin = parseInt(hhmm[1]) * 60 + parseInt(hhmm[2]);
      } else {
        const v = parseFloat(dureeRaw.replace(",", "."));
        if (!isNaN(v)) {
          // If value looks like hours (< 24), convert to minutes; otherwise treat as minutes
          dureeMin = v < 24 ? Math.round(v * 60) : v;
        }
      }
    }
    if (!dureeMin && colMap.heureDepart !== undefined && colMap.heureArrivee !== undefined) {
      // Try computing from departure/arrival times
      const hd = get(row, "heureDepart");
      const ha = get(row, "heureArrivee");
      if (hd && ha) {
        const [hd1, hd2] = hd.split(/[:h]/).map(Number);
        const [ha1, ha2] = ha.split(/[:h]/).map(Number);
        if (!isNaN(hd1) && !isNaN(ha1)) {
          dureeMin = (ha1 * 60 + (ha2 || 0)) - (hd1 * 60 + (hd2 || 0));
          if (dureeMin < 0) dureeMin += 24 * 60;
        }
      }
    }
    if (dureeMin <= 0) { warnings.push(`Ligne ${i + 1}: durée invalide, ignorée`); continue; }

    // Mode: DC or CDB
    const modeRaw = get(row, "mode").toUpperCase().replace(/\s/g, "");
    const isDC = modeRaw.includes("DC") || modeRaw.includes("DOUBLE");

    // Fuel
    const carbuDepart = parseFloat(get(row, "carbuDepart")) || 0;
    const carbuArrivee = parseFloat(get(row, "carbuArrivee")) || 0;
    const carbuConsomme = carbuDepart > carbuArrivee ? carbuDepart - carbuArrivee : 0;

    // Other
    const huile = parseFloat(get(row, "huile")) || 0;
    const montant = parseFloat(get(row, "montant").replace(",", ".").replace(/[€\s]/g, "")) || 0;
    const tempsMeca = parseFloat(get(row, "tempsMeca")) || 0;
    const pilote = get(row, "pilote");
    const instructeur = get(row, "instructeur");
    const typeVol = get(row, "typeVol") || "";

    flights.push({
      date,
      immat,
      dureeMin,
      isDC,
      carbuConsomme,
      huile,
      montant,
      tempsMeca,
      pilote,
      instructeur,
      typeVol,
    });
  }

  return { flights, warnings, error: null };
}

// ── Aggregate flights into monthly data ──

export function aggregateFlights(flights, existingAircraft) {
  // Build immat → aircraft ID map
  const immatMap = {};
  (existingAircraft || []).forEach(ac => {
    immatMap[ac.immat.toUpperCase().replace(/\s/g, "")] = ac.id;
  });

  // Find unknown immatriculations
  const unknownImmats = new Set();
  flights.forEach(f => {
    if (!immatMap[f.immat]) unknownImmats.add(f.immat);
  });

  // Aggregate by aircraft + year + month
  const agg = {}; // key: "acImmat|year|month"
  const stats = { totalFlights: flights.length, totalHours: 0, hoursCdb: 0, hoursDc: 0, totalRotations: 0, totalMontant: 0, totalCarbu: 0, dateRange: { min: null, max: null }, byType: {} };

  flights.forEach(f => {
    const key = `${f.immat}|${f.date.year}|${f.date.month}`;
    if (!agg[key]) agg[key] = { immat: f.immat, year: f.date.year, month: f.date.month, heures: 0, heuresDc: 0, rotations: 0, carbu: 0, huile: 0, montant: 0, tempsMeca: 0 };
    const h = f.dureeMin / 60;
    if (f.isDC) { agg[key].heuresDc += h; stats.hoursDc += h; }
    else { agg[key].heures += h; stats.hoursCdb += h; }
    agg[key].rotations += 1;
    agg[key].carbu += f.carbuConsomme;
    agg[key].huile += f.huile;
    agg[key].montant += f.montant;
    agg[key].tempsMeca += f.tempsMeca;
    stats.totalHours += h;
    stats.totalRotations += 1;
    stats.totalMontant += f.montant;
    stats.totalCarbu += f.carbuConsomme;

    // Type de vol stats
    if (f.typeVol) {
      const t = f.typeVol;
      if (!stats.byType[t]) stats.byType[t] = { count: 0, heures: 0 };
      stats.byType[t].count += 1;
      stats.byType[t].heures += h;
    }

    // Date range
    const d = new Date(f.date.year, f.date.month, f.date.day);
    if (!stats.dateRange.min || d < stats.dateRange.min) stats.dateRange.min = d;
    if (!stats.dateRange.max || d > stats.dateRange.max) stats.dateRange.max = d;
  });

  const monthly = Object.values(agg).sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month) || a.immat.localeCompare(b.immat));

  return { monthly, stats, unknownImmats: [...unknownImmats], immatMap };
}
