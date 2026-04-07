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
      heures: Number(r.heures) || 0, rotations: Number(r.rotations) || 0,
      heuresDc: Number(r.heures_dc) || 0,
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
  }));
}

// ─── Main hook ───

export function useFleetData() {
  const [data, setData] = useState({ aircraft: [], rates: [], monthly: {}, loans: [], ops: [] });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load all data
  const loadAll = useCallback(async () => {
    const [ac, ra, mo, lo, op] = await Promise.all([
      supabase.from("aircraft").select("*").order("created_at"),
      supabase.from("rates").select("*"),
      supabase.from("monthly").select("*"),
      supabase.from("loans").select("*"),
      supabase.from("ops").select("*").order("year,month"),
    ]);
    setData({
      aircraft: dbToAircraft(ac.data || []),
      rates: dbToRates(ra.data || []),
      monthly: dbToMonthly(mo.data || []),
      loans: dbToLoans(lo.data || []),
      ops: dbToOps(op.data || []),
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
    // CASCADE handles rates, monthly, loans, ops
    setData(d => ({
      ...d,
      aircraft: d.aircraft.filter(a => a.id !== id),
      rates: d.rates.filter(r => r.acId !== id),
      loans: d.loans.filter(l => l.acId !== id),
      ops: d.ops.filter(o => o.acId !== id),
      monthly: Object.fromEntries(Object.entries(d.monthly).filter(([k]) => !k.startsWith(id + "|"))),
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

  const setMonthly = useCallback(async (acId, year, month, heures, rotations, heuresDc) => {
    const key = `${acId}|${year}|${month}`;
    const existing = data.monthly[key];
    const dbRow = { heures, rotations, heures_dc: heuresDc || 0 };
    const stateRow = { heures, rotations, heuresDc: heuresDc || 0 };

    if (existing && existing._dbId) {
      await supabase.from("monthly").update(dbRow).eq("id", existing._dbId);
      setData(d => ({
        ...d,
        monthly: { ...d.monthly, [key]: { ...d.monthly[key], ...stateRow } },
      }));
    } else {
      const { data: row, error } = await supabase.from("monthly")
        .upsert({ ac_id: acId, year, month, ...dbRow }, { onConflict: "ac_id,year,month" })
        .select().single();
      if (error) { console.error(error); return; }
      setData(d => ({
        ...d,
        monthly: { ...d.monthly, [key]: { _dbId: row.id, ...stateRow } },
      }));
    }
  }, [data.monthly]);

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
        cost: op.cost, label: op.label, description: op.desc || "", type: op.type,
      })
      .select().single();
    if (error) { console.error(error); return; }
    const o = { ...op, year, month, id: row.id };
    setData(d => ({ ...d, ops: [...d.ops, o] }));
  }, []);

  const deleteOp = useCallback(async (id) => {
    await supabase.from("ops").delete().eq("id", id);
    setData(d => ({ ...d, ops: d.ops.filter(o => o.id !== id) }));
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
    addLoan, deleteLoan,
    addOp, deleteOp,
    reload: loadAll,
  };
}
