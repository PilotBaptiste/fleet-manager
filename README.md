# Fleet Finance — Suivi financier flotte

Outil de suivi financier pour aéroclub. Next.js 15 + Supabase + Vercel.

## Setup

### 1. Supabase

1. Crée un projet sur [supabase.com](https://supabase.com)
2. Va dans **SQL Editor** et exécute le contenu de `supabase-schema.sql`
3. Va dans **Authentication > Users** et crée un utilisateur (email + mot de passe)
4. Copie l'URL du projet et la clé `anon` depuis **Settings > API**

### 2. Configuration locale

```bash
cp .env.local.example .env.local
# Remplis NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 3. Lancer en local

```bash
npm install
npm run dev
# → http://localhost:3000
```

### 4. Déployer sur Vercel

```bash
# Push sur GitHub, puis dans Vercel :
# 1. Import le repo
# 2. Ajoute les variables d'environnement (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY)
# 3. Deploy
```

## Architecture

```
app/
  layout.js          # Root layout
  globals.css        # Thème clair
  page.js            # Auth (login/logout)
  FleetApp.js        # App principale (dashboard, saisie, etc.)
lib/
  supabase.js        # Client Supabase
  useFleetData.js    # Hook CRUD Supabase
  calc.js            # Fonctions de calcul (pure, sans DB)
supabase-schema.sql  # Schéma SQL à exécuter dans Supabase
```

## Fonctionnement

- **Tarifs par période** : chaque coût/tarif est défini "à partir de" une date. Le système applique automatiquement la bonne valeur sur chaque mois.
- **Forfait roulage** : facturé par vol (rotation), pas par heure.
- **Prêts** : mensualités calculées automatiquement (annuité constante).
- **Opérations exceptionnelles** : GV, arrêts, réparations majeures.
- **Simulation** : projection avec sliders (heures, tarif, carburant, fixes).
