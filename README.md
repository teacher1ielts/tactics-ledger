# Tactics Ledger

Cyberpunk habit, money and goal tracker (PWA). Local-first: everything works offline and is stored on the device. Optional cloud sync via Supabase keeps your phone and computer in step.

## Install on a phone
Open the site, then **iPhone**: Share, then Add to Home Screen. **Android**: browser menu, then Install app.

## Cloud sync (optional)
1. Create a free project at supabase.com.
2. SQL Editor: paste and run `supabase/schema.sql`.
3. Authentication, Providers, Email: turn off "Confirm email" (single-user app) or keep it on and confirm by link. Authentication, URL Configuration: set Site URL to the deployed address.
4. Project Settings, API: copy the Project URL and the `anon` public key into GitHub repo variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then re-run the deploy workflow. For local dev put them in `.env.local`.

The anon key is meant to be public: Row Level Security (see the SQL) is what protects the data.

## Develop
`npm i`, `npm run dev`, `npm run build`.
