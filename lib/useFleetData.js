"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Helpers: convert DB rows ↔ app format ───

function dbToAircraft(rows) {
  return rows.map(r => ({
    id: r.id, immat: r.immat, type: r.type,
    carbuType: r.carbu_type || "100LL",
    huileType: r.huile_type || "W100",
    activeFrom: r.active_from || null,  // "YYYY-MM-DD" or null
    activeTo: r.active_to || null,
  }));
}

function dbToRates(rows) {
  return rows.map(r => ({
    id: r.id, acId: r.ac_id, field: r.field, value: Number(r.value),
    fromYear: r.from_year, fromMonth: r.from_month, fromDay: r.from_day || 1,
  }));
}

function dbToMonthly(rows) {
  const m = {};
  rows.forEach(r => {
    m[`${r.ac_id}|${r.year}|${r.month}`] = {
      _dbId: r.id,
      heures: Number(r.heures) || 0,
      heuresDc: Number(r.heures_dc) || 0,
      rotations: Number(r.rotations) || 0,
      litresCarburant: Number(r.litres_carburant) || 0,
    };
  });
  return m;
}

function dbToFlightTypes(rows) {
  return rows.map(r => ({
    id: r.id, name: r.name, color: r.color || "#6b7280",
    mode: r.mode || "tarif",
    tarifKey: r.tarif_key || null,
    tarifKey2: r.tarif_key_2 || null,
    tarifKey3: r.tarif_key_3 || null,
    sortOrder: r.sort_order || 0,
  })).sort((a,b) => a.sortOrder - b.sortOrder);
}

function dbToFlightActivity(rows) {
  const m = {};
  rows.forEach(r => {
    m[`${r.ac_id}|${r.flight_type_id}|${r.year}|${r.month}`] = {
      _dbId: r.id,
      heures: Number(r.heures) || 0,
      vols: Number(r.vols) || 0,
      vols2: Number(r.vols_2) || 0,
      vols3: Number(r.vols_3) || 0,
      revenu: Number(r.revenu) || 0,
    };
  });
  return m;
}

function dbToLoans(rows) {
  return rows.map(r => ({
    id: r.id, acId: r.ac_id, label: r.label, amount: Number(r.amount),
    rate: Number(r.rate), durationMonths: r.duration_months,
    startYear: r.start_year, startMonth: r.start_month,
  }));
}

function dbToOps(rows) {
  return rows.map(r => ({
    id: r.id, acId: r.ac_id, year: r.year, month: r.month,
    opDate: r.op_date || null,
    cost: Number(r.cost), label: r.label, desc: r.description, type: r.type,
    categoryId: r.category_id || null,
    isExceptional: !!r.is_exceptional,
  }));
}

function dbToCategories(rows) {
  return rows.map(r => ({
    id: r.id, name: r.name, color: r.color || "#6b7280",
    accountCode: r.account_code || "", sortOrder: r.sort_order || 0,
  })).sort((a,b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
}

// ─── Main hook ───

export function useFleetData() {
  const [data, setData] = useState({ aircraft: [], rates: [], monthly: {}, loans: [], ops: [], categories: [], flightTypes: [], flightActivity: {} });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load all data
  const loadAll = useCallback(async () => {
    const [ac, ra, mo, lo, op, ca, ft, fa] = await Promise.all([
      supabase.from("aircraft").select("*").order("created_at"),
      supabase.from("rates").select("*"),
      supabase.from("monthly").select("*"),
      supabase.from("loans").select("*"),
      supabase.from("ops").select("*").order("year,month"),
      supabase.from("op_categories").select("*"),
      supabase.from("flight_types").select("*").order("sort_order"),
      supabase.from("flight_activity").select("*"),
    ]);
    setData({
      aircraft: dbToAircraft(ac.data || []),
      rates: dbToRates(ra.data || []),
      monthly: dbToMonthly(mo.data || []),
      loans: dbToLoans(lo.data || []),
      ops: dbToOps(op.data || []),
      categories: dbToCategories(ca.data || []),
      flightTypes: dbToFlightTypes(ft.data || []),
      flightActivity: dbToFlightActivity(fa.data || []),
    });
    setLoaded(true);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Aircraft CRUD ───

  const addAircraft = useCallback(async (immat, type, opts = {}) => {
    const row_data = { immat, type };
    if (opts.carbuType) row_data.carbu_type = opts.carbuType;
    if (opts.huileType) row_data.huile_type = opts.huileType;
    if (opts.activeFrom) row_data.active_from = opts.activeFrom;
    if (opts.activeTo) row_data.active_to = opts.activeTo;
    const { data: row, error } = await supabase.from("aircraft").insert(row_data).select().single();
    if (error) { console.error(error); return null; }
    const ac = { id: row.id, immat: row.immat, type: row.type, carbuType: row.carbu_type || "100LL", huileType: row.huile_type || "W100", activeFrom: row.active_from || null, activeTo: row.active_to || null };
    setData(d => ({ ...d, aircraft: [...d.aircraft, ac] }));
    return ac;
  }, []);

  const updateAircraft = useCallback(async (id, fields) => {
    const dbFields = { immat: fields.immat, type: fields.type };
    if (fields.carbuType !== undefined) dbFields.carbu_type = fields.carbuType;
    if (fields.huileType !== undefined) dbFields.huile_type = fields.huileType;
    if (fields.activeFrom !== undefined) dbFields.active_from = fields.activeFrom || null;
    if (fields.activeTo !== undefined) dbFields.active_to = fields.activeTo || null;
    await supabase.from("aircraft").update(dbFields).eq("id", id);
    setData(d => ({ ...d, aircraft: d.aircraft.map(a => a.id === id ? { ...a, ...fields } : a) }));
  }, []);

  const deleteAircraft = useCallback(async (id) => {
    await supabase.from("aircraft").delete().eq("id", id);
    // CASCADE handles rates, monthly, loans, ops, flight_activity
    setData(d => ({
      ...d,
      aircraft: d.aircraft.filter(a => a.id !== id),
      rates: d.rates.filter(r => r.acId !== id),
      loans: d.loans.filter(l => l.acId !== id),
      ops: d.ops.filter(o => o.acId !== id),
      monthly: Object.fromEntries(Object.entries(d.monthly).filter(([k]) => !k.startsWith(id + "|"))),
      flightActivity: Object.fromEntries(Object.entries(d.flightActivity).filter(([k]) => !k.startsWith(id + "|"))),
    }));
  }, []);

  // ─── Rates CRUD ───

  const addRate = useCallback(async (acId, field, value, fromYear, fromMonth, fromDay = 1) => {
    const { data: row, error } = await supabase.from("rates")
      .insert({ ac_id: acId, field, value, from_year: fromYear, from_month: fromMonth, from_day: fromDay })
      .select().single();
    if (error) { console.error(error); return; }
    const rate = { id: row.id, acId, field, value: Number(value), fromYear, fromMonth, fromDay };
    setData(d => ({ ...d, rates: [...d.rates, rate] }));
  }, []);

  const deleteRate = useCallback(async (id) => {
    await supabase.from("rates").delete().eq("id", id);
    setData(d => ({ ...d, rates: d.rates.filter(r => r.id !== id) }));
  }, []);

  // ─── Monthly activity ───

  const setMonthly = useCallback(async (acId, year, month, fields) => {
    const key = `${acId}|${year}|${month}`;
    const existing = data.monthly[key] || {};
    const mergeF = (k) => fields[k] !== undefined ? fields[k] : (existing[k] || 0);
    const merged = {
      heures: mergeF("heures"), heuresDc: mergeF("heuresDc"),
      rotations: mergeF("rotations"), litresCarburant: mergeF("litresCarburant"),
    };
    const dbRow = {
      heures: merged.heures, heures_dc: merged.heuresDc,
      rotations: merged.rotations, litres_carburant: merged.litresCarburant,
    };
    if (existing._dbId) {
      await supabase.from("monthly").update(dbRow).eq("id", existing._dbId);
      setData(d => ({ ...d, monthly: { ...d.monthly, [key]: { ...d.monthly[key], ...merged } } }));
    } else {
      const { data: row, error } = await supabase.from("monthly")
        .upsert({ ac_id: acId, year, month, ...dbRow }, { onConflict: "ac_id,year,month" })
        .select().single();
      if (error) { console.error(error); return; }
      setData(d => ({ ...d, monthly: { ...d.monthly, [key]: { _dbId: row.id, ...merged } } }));
    }
  }, [data.monthly]);

  // ─── Flight Types CRUD ───

  const addFlightType = useCallback(async (ft) => {
    const { data: row, error } = await supabase.from("flight_types")
      .insert({ name: ft.name, color: ft.color || "#6b7280", mode: ft.mode || "tarif", tarif_key: ft.tarifKey || null, tarif_key_2: ft.tarifKey2 || null, tarif_key_3: ft.tarifKey3 || null, sort_order: ft.sortOrder || 0 })
      .select().single();
    if (error) { console.error(error); return null; }
    const t = { id: row.id, name: row.name, color: row.color, mode: row.mode, tarifKey: row.tarif_key, tarifKey2: row.tarif_key_2, tarifKey3: row.tarif_key_3, sortOrder: row.sort_order || 0 };
    setData(d => ({ ...d, flightTypes: [...d.flightTypes, t].sort((a,b) => a.sortOrder - b.sortOrder) }));
    return t;
  }, []);

  const updateFlightType = useCallback(async (id, fields) => {
    const dbRow = {};
    if (fields.name !== undefined) dbRow.name = fields.name;
    if (fields.color !== undefined) dbRow.color = fields.color;
    if (fields.mode !== undefined) dbRow.mode = fields.mode;
    if (fields.tarifKey !== undefined) dbRow.tarif_key = fields.tarifKey || null;
    if (fields.tarifKey2 !== undefined) dbRow.tarif_key_2 = fields.tarifKey2 || null;
    if (fields.tarifKey3 !== undefined) dbRow.tarif_key_3 = fields.tarifKey3 || null;
    if (fields.sortOrder !== undefined) dbRow.sort_order = fields.sortOrder;
    await supabase.from("flight_types").update(dbRow).eq("id", id);
    setData(d => ({ ...d, flightTypes: d.flightTypes.map(t => t.id === id ? { ...t, ...fields } : t).sort((a,b) => a.sortOrder - b.sortOrder) }));
  }, []);

  const deleteFlightType = useCallback(async (id) => {
    await supabase.from("flight_types").delete().eq("id", id);
    setData(d => ({
      ...d,
      flightTypes: d.flightTypes.filter(t => t.id !== id),
      flightActivity: Object.fromEntries(Object.entries(d.flightActivity).filter(([k]) => !k.includes(`|${id}|`))),
    }));
  }, []);

  // ─── Flight Activity ───

  const setFlightActivity = useCallback(async (acId, ftId, year, month, fields) => {
    const key = `${acId}|${ftId}|${year}|${month}`;
    const existing = data.flightActivity[key] || {};
    const mergeF = (k) => fields[k] !== undefined ? fields[k] : (existing[k] || 0);
    const merged = { heures: mergeF("heures"), vols: mergeF("vols"), vols2: mergeF("vols2"), vols3: mergeF("vols3"), revenu: mergeF("revenu") };
    const dbRow = { heures: merged.heures, vols: merged.vols, vols_2: merged.vols2, vols_3: merged.vols3, revenu: merged.revenu };
    if (existing._dbId) {
      await supabase.from("flight_activity").update(dbRow).eq("id", existing._dbId);
      setData(d => ({ ...d, flightActivity: { ...d.flightActivity, [key]: { ...d.flightActivity[key], ...merged } } }));
    } else {
      const { data: row, error } = await supabase.from("flight_activity")
        .upsert({ ac_id: acId, flight_type_id: ftId, year, month, ...dbRow }, { onConflict: "ac_id,flight_type_id,year,month" })
        .select().single();
      if (error) { console.error(error); return; }
      setData(d => ({ ...d, flightActivity: { ...d.flightActivity, [key]: { _dbId: row.id, ...merged } } }));
    }
  }, [data.flightActivity]);

  // ─── Loans CRUD ───

  const addLoan = useCallback(async (loan) => {
    const { data: row, error } = await supabase.from("loans")
      .insert({
        ac_id: loan.acId, label: loan.label, amount: loan.amount,
        rate: loan.rate, duration_months: loan.durationMonths,
        start_year: loan.startYear, start_month: loan.startMonth,
      })
      .select().single();
    if (error) { console.error(error); return; }
    const l = { ...loan, id: row.id };
    setData(d => ({ ...d, loans: [...d.loans, l] }));
  }, []);

  const deleteLoan = useCallback(async (id) => {
    await supabase.from("loans").delete().eq("id", id);
    setData(d => ({ ...d, loans: d.loans.filter(l => l.id !== id) }));
  }, []);

  // ─── Ops CRUD ───

  const addOp = useCallback(async (op) => {
    // Derive year/month from opDate if provided
    let year = op.year, month = op.month;
    if (op.opDate) {
      const d = new Date(op.opDate);
      year = d.getFullYear();
      month = d.getMonth();
    }
    const { data: row, error } = await supabase.from("ops")
      .insert({
        ac_id: op.acId, year, month,
        op_date: op.opDate || null,
        cost: op.cost, label: op.label, description: op.desc || "",
        type: op.type || "autre",
        category_id: op.categoryId || null,
        is_exceptional: !!op.isExceptional,
      })
      .select().single();
    if (error) { console.error(error); return; }
    const o = { ...op, year, month, id: row.id };
    setData(d => ({ ...d, ops: [...d.ops, o] }));
  }, []);

  const updateOp = useCallback(async (id, fields) => {
    const dbRow = {};
    if (fields.acId !== undefined) dbRow.ac_id = fields.acId;
    if (fields.opDate !== undefined) {
      dbRow.op_date = fields.opDate || null;
      if (fields.opDate) {
        const d = new Date(fields.opDate);
        dbRow.year = d.getFullYear();
        dbRow.month = d.getMonth();
      }
    }
    if (fields.cost !== undefined) dbRow.cost = fields.cost;
    if (fields.label !== undefined) dbRow.label = fields.label;
    if (fields.desc !== undefined) dbRow.description = fields.desc;
    if (fields.categoryId !== undefined) dbRow.category_id = fields.categoryId || null;
    if (fields.isExceptional !== undefined) dbRow.is_exceptional = !!fields.isExceptional;
    await supabase.from("ops").update(dbRow).eq("id", id);
    setData(d => ({ ...d, ops: d.ops.map(o => o.id === id ? { ...o, ...fields } : o) }));
  }, []);

  const deleteOp = useCallback(async (id) => {
    await supabase.from("ops").delete().eq("id", id);
    setData(d => ({ ...d, ops: d.ops.filter(o => o.id !== id) }));
  }, []);

  // Bulk insert operations (for CSV import)
  const bulkAddOps = useCallback(async (opsArr) => {
    const rows = opsArr.map(op => {
      let year = op.year, month = op.month;
      if (op.opDate) { const d = new Date(op.opDate); year = d.getFullYear(); month = d.getMonth(); }
      return {
        ac_id: op.acId, year, month,
        op_date: op.opDate || null,
        cost: op.cost, label: op.label, description: op.desc || "",
        type: op.type || "autre",
        category_id: op.categoryId || null,
        is_exceptional: !!op.isExceptional,
      };
    });
    const { data: inserted, error } = await supabase.from("ops").insert(rows).select();
    if (error) { console.error(error); return 0; }
    const mapped = dbToOps(inserted || []);
    setData(d => ({ ...d, ops: [...d.ops, ...mapped] }));
    return mapped.length;
  }, []);

  // ─── Categories CRUD ───

  const addCategory = useCallback(async (cat) => {
    const { data: row, error } = await supabase.from("op_categories")
      .insert({
        name: cat.name, color: cat.color || "#6b7280",
        account_code: cat.accountCode || null, sort_order: cat.sortOrder || 0,
      }).select().single();
    if (error) { console.error(error); return null; }
    const c = { id: row.id, name: row.name, color: row.color, accountCode: row.account_code || "", sortOrder: row.sort_order || 0 };
    setData(d => ({ ...d, categories: [...d.categories, c].sort((a,b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name)) }));
    return c;
  }, []);

  const updateCategory = useCallback(async (id, fields) => {
    const dbRow = {};
    if (fields.name !== undefined) dbRow.name = fields.name;
    if (fields.color !== undefined) dbRow.color = fields.color;
    if (fields.accountCode !== undefined) dbRow.account_code = fields.accountCode || null;
    if (fields.sortOrder !== undefined) dbRow.sort_order = fields.sortOrder;
    await supabase.from("op_categories").update(dbRow).eq("id", id);
    setData(d => ({ ...d, categories: d.categories.map(c => c.id === id ? { ...c, ...fields } : c).sort((a,b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name)) }));
  }, []);

  const deleteCategory = useCallback(async (id) => {
    await supabase.from("op_categories").delete().eq("id", id);
    setData(d => ({
      ...d,
      categories: d.categories.filter(c => c.id !== id),
      // Ops keep their cost but lose the category link (FK SET NULL)
      ops: d.ops.map(o => o.categoryId === id ? { ...o, categoryId: null } : o),
    }));
  }, []);

  // Global rate (stored with first aircraft as carrier, lookup ignores ac_id)
  const addGlobalRate = useCallback(async (field, value, fromYear, fromMonth, fromDay = 1) => {
    // Use first aircraft as carrier for global rates
    const acId = data.aircraft[0]?.id;
    if (!acId) return;
    return addRate(acId, field, value, fromYear, fromMonth, fromDay);
  }, [data.aircraft, addRate]);

  return {
    data, loaded,
    addAircraft, updateAircraft, deleteAircraft,
    addRate, deleteRate, addGlobalRate,
    setMonthly,
    addFlightType, updateFlightType, deleteFlightType,
    setFlightActivity,
    addLoan, deleteLoan,
    addOp, updateOp, deleteOp, bulkAddOps,
    addCategory, updateCategory, deleteCategory,
    reload: loadAll,
  };
}
