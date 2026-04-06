-- ================================================
-- Fleet Finance — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ================================================

-- Aircraft
CREATE TABLE aircraft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  immat TEXT NOT NULL,
  type TEXT NOT NULL,
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
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rates_ac ON rates(ac_id, field, from_year, from_month);

-- Monthly activity (heures CdB + DC, mouvements)
CREATE TABLE monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ac_id UUID REFERENCES aircraft(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL,          -- 0-11
  heures NUMERIC DEFAULT 0,    -- heures CdB (commandant de bord)
  rotations INT DEFAULT 0,     -- nombre de mouvements (tous types confondus)
  heures_dc NUMERIC DEFAULT 0, -- heures Double Commande
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ac_id, year, month)
);

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
  cost NUMERIC NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'maintenance',       -- 'maintenance', 'arret', 'autre'
  created_at TIMESTAMPTZ DEFAULT now()
);

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
