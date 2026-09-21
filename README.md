# Temperature Direction AI

Search a city and see whether its temperature is predicted to rise, stay the same, or fall over the next hours — with confidence scoring.

## Stack
- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres) for logging cities, forecasts, predictions, and model metrics
- Weather sources: Open-Meteo (base/fallback), Weather.gov/NWS (US), optional Windy (set `WINDY_API_KEY`)

## Environment variables
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `WINDY_API_KEY` (optional)
