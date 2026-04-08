-- ================================================
-- Fleet Finance — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ================================================

-- Aircraft
CREATE TABLE aircraft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  immat TEXT NOT NULL,
  type TEXT NOT NULL,
  carbu_type TEXT DEFAULT '100LL',
  huile_type TEXT DEFAULT 'W100',
  active_from DATE,              -- NULL = always active
  active_to DATE,                -- NULL = still active
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Rate periods (tarifs & coûts par période)
-- Each row = "field X is worth Y starting from fromYear/fromMonth"
CREATE TABLE rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ac_id UUID REFERENCES aircraft(id) ON DELETE CASCADE,
  field TEXT NOT NULL,         -- e.g. 'tarifHeure', 'prixCarburant', 'assurance'...
  value NUMERIC NOT NULL DEFAULT 0,
  from_year INT NOT NULL,
  from_month INT NOT NULL,     -- 0-11
  from_day INT NOT NULL DEFAULT 1, -- 1-31
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rates_ac ON rates(ac_id, field, from_year, from_month);

-- Monthly activity (heures par catégorie de vol)
CREATE TABLE monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ac_id UUID REFERENCES aircraft(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL,          -- 0-11
  heures NUMERIC DEFAULT 0,    -- heures CdB pilotes (commandant de bord)
  rotations INT DEFAULT 0,     -- nombre de mouvements (tous types confondus)
  heures_dc NUMERIC DEFAULT 0, -- heures Double Commande pilotes
  heures_decouverte NUMERIC DEFAULT 0, -- vols découverte
  heures_initiation NUMERIC DEFAULT 0, -- vols d'initiation
  heures_bia NUMERIC DEFAULT 0,        -- vols BIA
  litres_carburant NUMERIC DEFAULT 0,  -- litres carburant réels (sinon calc via conso)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ac_id, year, month)
);

-- Migrations
ALTER TABLE monthly ADD COLUMN IF NOT EXISTS heures_decouverte NUMERIC DEFAULT 0;
ALTER TABLE monthly ADD COLUMN IF NOT EXISTS heures_initiation NUMERIC DEFAULT 0;
ALTER TABLE monthly ADD COLUMN IF NOT EXISTS heures_bia NUMERIC DEFAULT 0;
ALTER TABLE monthly ADD COLUMN IF NOT EXISTS litres_carburant NUMERIC DEFAULT 0;

-- Loans
CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ac_id UUID REFERENCES aircraft(id) ON DELETE CASCADE,
  label TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  rate NUMERIC NOT NULL DEFAULT 0,       -- annual rate %
  duration_months INT NOT NULL DEFAULT 0,
  start_year INT NOT NULL,
  start_month INT NOT NULL,              -- 0-11
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Exceptional operations
CREATE TABLE ops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ac_id UUID REFERENCES aircraft(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL,
  op_date DATE,                          -- précise date de la facture (jour)
  cost NUMERIC NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'maintenance',       -- 'maintenance', 'arret', 'autre'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migration: add column if table already exists
ALTER TABLE ops ADD COLUMN IF NOT EXISTS op_date DATE;

-- ================================================
-- Row Level Security (RLS)
-- Only authenticated users can read/write
-- ================================================
ALTER TABLE aircraft ENABLE ROW LEVEL SECURITY;
ALTER TABLE rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "auth_all" ON aircraft FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON rates FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON monthly FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON loans FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON ops FOR ALL USING (auth.role() = 'authenticated');
