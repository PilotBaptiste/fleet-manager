// ═══════════════════════════════════════════
// CSV Import — Parse operations / factures
// ═══════════════════════════════════════════

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
  const tabs = (headerLine.match(/\t/g) || []).length;
  if (tabs >= semicolons && tabs >= commas) return "\t";
  return semicolons >= commas ? ";" : ",";
}

function parseDate(str) {
  if (!str) return null;
  str = str.trim();
  const fr = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (fr) return `${fr[3]}-${String(fr[2]).padStart(2,"0")}-${String(fr[1]).padStart(2,"0")}`;
  const iso = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2,"0")}-${String(iso[3]).padStart(2,"0")}`;
  return null;
}

const COL_MAP = {
  date: ["date", "date facture", "date_facture"],
  immat: ["avion", "immat", "immatriculation", "aéronef", "aeronef", "appareil"],
  category: ["categorie", "catégorie", "category", "cat", "type", "poste"],
  cost: ["montant", "cout", "coût", "cost", "prix", "amount", "total", "ht", "ttc"],
  label: ["libelle", "libellé", "label", "intitulé", "intitule", "objet", "titre", "designation", "désignation"],
  desc: ["description", "détail", "detail", "commentaire", "note", "notes", "remarque"],
  exceptional: ["exceptionnel", "exceptionnelle", "exceptional", "excep", "type_op"],
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
    if (key && mapping[key] === undefined) mapping[key] = i;
  });
  return mapping;
}

/**
 * Parse a CSV file of operations/invoices.
 * Returns { rows: [{date, immat, categoryName, cost, label, desc, isExceptional}], warnings, error }
 */
export function parseOpsCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: "Fichier vide ou invalide", rows: [], warnings: [] };

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCSVLine(lines[0], delimiter);
  const colMap = mapHeaders(headers);

  // Validate required columns
  const missing = [];
  if (colMap.date === undefined) missing.push("date");
  if (colMap.immat === undefined) missing.push("avion/immat");
  if (colMap.cost === undefined) missing.push("montant/cout");
  if (missing.length > 0) {
    return { error: `Colonnes manquantes : ${missing.join(", ")}. Colonnes trouvées : ${headers.join(", ")}`, rows: [], warnings: [] };
  }

  const rows = [];
  const warnings = [];
  const get = (row, key) => colMap[key] !== undefined ? (row[colMap[key]] || "").trim() : "";

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i], delimiter);
    if (row.length < 2) continue;

    const dateStr = get(row, "date");
    const date = parseDate(dateStr);
    if (!date) { warnings.push(`Ligne ${i + 1}: date invalide "${dateStr}", ignorée`); continue; }

    const immat = get(row, "immat").toUpperCase().replace(/\s/g, "");
    if (!immat) { warnings.push(`Ligne ${i + 1}: avion vide, ignorée`); continue; }

    const costStr = get(row, "cost").replace(",", ".").replace(/[€\s]/g, "");
    const cost = parseFloat(costStr) || 0;
    if (cost === 0) { warnings.push(`Ligne ${i + 1}: montant nul, ignorée`); continue; }

    const label = get(row, "label") || `Import ligne ${i + 1}`;
    const desc = get(row, "desc");
    const categoryName = get(row, "category");
    const excepRaw = get(row, "exceptional").toLowerCase();
    const isExceptional = excepRaw === "oui" || excepRaw === "1" || excepRaw === "true" || excepRaw === "yes" || excepRaw === "x";

    rows.push({ date, immat, categoryName, cost, label, desc, isExceptional });
  }

  return { rows, warnings, error: null };
}
