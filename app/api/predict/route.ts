import { NextRequest, NextResponse } from "next/server";
import { geocodeCity, getWeatherBundle, predictDirection, CityMatch } from "@/lib/weather";
import { getSupabase, upsertCity } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city");
  const lat = req.nextUrl.searchParams.get("lat");
  const lon = req.nextUrl.searchParams.get("lon");
  const name = req.nextUrl.searchParams.get("name");
  const country = req.nextUrl.searchParams.get("country");
  const timezone = req.nextUrl.searchParams.get("timezone");

  let match: CityMatch | null = null;

  if (lat && lon) {
    // Precise selection from the autocomplete dropdown — skip re-geocoding.
    match = {
      name: name ?? "Selected location",
      country: country ?? "",
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
      timezone: timezone ?? "UTC"
    };
  } else if (city) {
    match = await geocodeCity(city);
    if (!match) {
      return NextResponse.json({ error: `City not found: ${city}` }, { status: 404 });
    }
  } else {
    return NextResponse.json({ error: "Missing ?city= or ?lat=&lon=" }, { status: 400 });
  }

  const bundle = await getWeatherBundle(match);
  const prediction = predictDirection(bundle.hourly);

  let logged = false;
  try {
    const sb = getSupabase();
    const cityRow = await upsertCity(sb, match);
    await sb.from("forecasts").insert(
      bundle.hourly.slice(0, 24).map((h) => ({
        city_id: cityRow.id,
        source: bundle.source_primary,
        forecast_for: h.time,
        temperature_c: h.temperature_c,
        humidity: h.humidity,
        dew_point_c: h.dew_point_c,
        wind_speed_kmh: h.wind_speed_kmh,
        wind_direction_deg: h.wind_direction_deg,
        cloud_cover_pct: h.cloud_cover_pct,
        precipitation_prob_pct: h.precipitation_prob_pct
      }))
    );
    await sb.from("predictions").insert({
      city_id: cityRow.id,
      target_time: bundle.hourly[Math.min(5, bundle.hourly.length - 1)]?.time ?? new Date().toISOString(),
      direction: prediction.direction,
      probability_rise: prediction.probability_rise,
      probability_same: prediction.probability_same,
      probability_fall: prediction.probability_fall,
      confidence_score: prediction.confidence_score
    });
    logged = true;
  } catch (e) {
    // Logging failures should never break the user-facing prediction
    logged = false;
  }

  return NextResponse.json({
    city: match,
    source_primary: bundle.source_primary,
    windy_used: bundle.windy_used,
    fetched_at: bundle.fetched_at,
    source_urls: bundle.source_urls,
    current: bundle.current,
    hourly: bundle.hourly.slice(0, 24),
    prediction,
    logged
  });
}
