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

-- Categories: configurable buckets for operations (Carburant, Assurance, Pneus...)
CREATE TABLE op_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#6b7280',          -- hex color for UI tags
  account_code TEXT,                     -- comptabilité (ex: '602200')
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Operations / factures (charges récurrentes ou exceptionnelles)
CREATE TABLE ops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ac_id UUID REFERENCES aircraft(id) ON DELETE CASCADE,
  category_id UUID REFERENCES op_categories(id) ON DELETE SET NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  op_date DATE,                          -- précise date de la facture (jour)
  cost NUMERIC NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'maintenance',       -- legacy, kept for backward compat
  is_exceptional BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migrations
ALTER TABLE ops ADD COLUMN IF NOT EXISTS op_date DATE;
ALTER TABLE ops ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES op_categories(id) ON DELETE SET NULL;
ALTER TABLE ops ADD COLUMN IF NOT EXISTS is_exceptional BOOLEAN NOT NULL DEFAULT false;

-- Default categories (run once after table creation)
INSERT INTO op_categories (name, color, account_code, sort_order) VALUES
  ('Carburant',          '#f59e0b', '602200', 10),
  ('Variation stock carburant', '#fbbf24', '603200', 15),
  ('Huile',              '#a16207', '60622',  20),
  ('Maintenance périodique', '#dc2626', '60623', 30),
  ('Convoyage maintenance',  '#ea580c', '606231', 35),
  ('Vol d''essai maintenance','#ea580c', '606232', 36),
  ('Réparation petit matériel','#b91c1c', '60624', 40),
  ('Pneus',              '#7c2d12', '60625',  50),
  ('Gestion navigabilité','#6366f1', '606297', 60),
  ('Assurance',          '#059669', '616300', 70),
  ('Taxes',              '#9ca3af', '637800', 80),
  ('Amortissement',      '#7c3aed', '681120', 90),
  ('Prêt / mensualité',  '#8b5cf6', NULL,     95),
  ('Autre',              '#6b7280', NULL,     999)
ON CONFLICT (name) DO NOTHING;

-- ================================================
-- Row Level Security (RLS)
-- Only authenticated users can read/write
-- ================================================
ALTER TABLE aircraft ENABLE ROW LEVEL SECURITY;
ALTER TABLE rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE op_categories ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "auth_all" ON aircraft FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON rates FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON monthly FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON loans FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON ops FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON op_categories FOR ALL USING (auth.role() = 'authenticated');
