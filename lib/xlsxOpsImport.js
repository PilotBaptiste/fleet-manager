// ═══════════════════════════════════════════
// XLSX Import — Parse operations / factures
// Columns: # | Date | Infos | Débit | Crédit
// ═══════════════════════════════════════════
import * as XLSX from "xlsx";

/**
 * Convert an Excel serial date number → ISO string "YYYY-MM-DD"
 */
function excelDateToISO(v) {
  if (!v) return null;
  // Already a string? Try to parse it
  if (typeof v === "string") {
    const s = v.trim();
    // DD/MM/YYYY
    const fr = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (fr) return `${fr[3]}-${String(fr[2]).padStart(2,"0")}-${String(fr[1]).padStart(2,"0")}`;
    // YYYY-MM-DD
    const iso = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2,"0")}-${String(iso[3]).padStart(2,"0")}`;
    return null;
  }
  // Numeric serial date from Excel
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d || !d.y) return null;
    return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  // Date object
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,"0")}-${String(v.getDate()).padStart(2,"0")}`;
  }
  return null;
}

function normalizeHeader(h) {
  return String(h || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Match column headers to known fields.
 * Returns { dateCol, infosCol, debitCol, creditCol } or null keys if not found.
 */
function findColumns(headers) {
  const result = { dateCol: null, infosCol: null, debitCol: null, creditCol: null };
  headers.forEach((h, i) => {
    const n = normalizeHeader(h);
    if (n === "date") result.dateCol = i;
    else if (["infos", "info", "description", "libelle", "libellé", "descriptif", "objet", "designation"].includes(n)) result.infosCol = i;
    else if (["debit", "débit", "montant", "cout", "coût", "depense", "dépense"].includes(n)) result.debitCol = i;
    else if (["credit", "crédit", "remboursement", "avoir"].includes(n)) result.creditCol = i;
  });
  return result;
}

function parseNum(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  return parseFloat(String(v).replace(/\s/g, "").replace(",", ".").replace(/[€]/g, "")) || 0;
}

/**
 * Parse an XLSX ArrayBuffer of operations.
 * Returns { rows: [{date, label, debit, credit, cost}], warnings, error, sheetNames }
 */
export function parseOpsXLSX(buffer, sheetIndex = 0) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: "array", cellDates: false });
  } catch (e) {
    return { error: "Impossible de lire le fichier. Vérifiez qu'il s'agit d'un .xlsx valide.", rows: [], warnings: [], sheetNames: [] };
  }

  const sheetNames = wb.SheetNames || [];
  if (!sheetNames.length) return { error: "Aucune feuille trouvée dans le fichier.", rows: [], warnings: [], sheetNames };

  const ws = wb.Sheets[sheetNames[sheetIndex] || sheetNames[0]];
  // Convert to array-of-arrays, keeping raw values
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  if (raw.length < 2) return { error: "Feuille vide ou pas assez de lignes.", rows: [], warnings: [], sheetNames };

  // Find header row (first row with recognizable "Date" column)
  let headerIdx = 0;
  let cols = null;
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const c = findColumns(raw[i]);
    if (c.dateCol !== null && (c.debitCol !== null || c.creditCol !== null)) {
      headerIdx = i;
      cols = c;
      break;
    }
  }
  if (!cols || cols.dateCol === null) {
    return { error: `Colonnes "Date" et "Débit" introuvables. En-têtes détectées : ${raw[0]?.join(", ")}`, rows: [], warnings: [], sheetNames };
  }

  const rows = [];
  const warnings = [];

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.every(c => c === "" || c == null)) continue; // skip empty rows

    const dateVal = r[cols.dateCol];
    const date = excelDateToISO(dateVal);
    if (!date) {
      // Might be a subtotal or section header row — skip silently if no date
      if (String(dateVal || "").trim()) warnings.push(`Ligne ${i + 1}: date invalide "${dateVal}", ignorée`);
      continue;
    }

    const label = String(r[cols.infosCol] ?? "").trim() || `Ligne ${i + 1}`;
    const debit = cols.debitCol !== null ? parseNum(r[cols.debitCol]) : 0;
    const credit = cols.creditCol !== null ? parseNum(r[cols.creditCol]) : 0;

    // Skip rows with no monetary value
    if (debit === 0 && credit === 0) continue;

    // Cost: debit is expense (positive), credit is refund (negative cost)
    const cost = debit - credit;

    rows.push({ date, label, debit, credit, cost });
  }

  if (rows.length === 0) {
    return { error: "Aucune opération trouvée dans le fichier.", rows: [], warnings, sheetNames };
  }

  return { rows, warnings, error: null, sheetNames };
}
