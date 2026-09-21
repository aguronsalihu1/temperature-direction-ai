export type Direction = "rise" | "same" | "fall";

export interface CityMatch {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface HourlyPoint {
  time: string; // ISO
  temperature_c: number | null;
  humidity: number | null;
  dew_point_c: number | null;
  wind_speed_kmh: number | null;
  wind_direction_deg: number | null;
  cloud_cover_pct: number | null;
  precipitation_prob_pct: number | null;
  short_forecast?: string;
}

export interface NwsSnapshot {
  available: boolean;
  temperature_c?: number;
  short_forecast?: string;
  wind_speed_kmh?: number;
  time?: string;
  url: string;
  note?: string;
}

export interface AccuWeatherSnapshot {
  available: boolean;
  temperature_c?: number;
  weather_text?: string;
  wind_speed_kmh?: number;
  time?: string;
  url: string;
  note?: string;
}

export interface WeatherBundle {
  source_primary: "open-meteo" | "nws" | "windy";
  windy_used: boolean;
  hourly: HourlyPoint[];
  current: HourlyPoint & { sun_altitude_deg: number; local_time: string; timezone: string };
  fetched_at: string;
  source_urls: { label: string; url: string }[];
  nws_snapshot: NwsSnapshot;
  accuweather_snapshot: AccuWeatherSnapshot;
}

export interface PredictionOutput {
  direction: Direction;
  probability_rise: number;
  probability_same: number;
  probability_fall: number;
  confidence_score: number;
}

export interface PeakHeat {
  time: string;
  temperature_c: number;
}

export function findPeakHeat(hourly: HourlyPoint[], hoursAhead = 24): PeakHeat | null {
  const window = hourly.slice(0, hoursAhead).filter((h) => h.temperature_c != null);
  if (window.length === 0) return null;
  let best = window[0];
  for (const h of window) {
    if ((h.temperature_c as number) > (best.temperature_c as number)) best = h;
  }
  return { time: best.time, temperature_c: best.temperature_c as number };
}

// --- Geocoding via Open-Meteo (free, no key) ---
export interface CityCandidate extends CityMatch {
  admin1?: string;
  population?: number;
}

async function fetchGeocodeCandidates(query: string): Promise<CityCandidate[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=8&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const results = data?.results ?? [];
  return results.map((r: any) => ({
    name: r.name,
    country: r.country ?? "",
    admin1: r.admin1 ?? "",
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone ?? "UTC",
    population: r.population ?? 0
  }));
}

export async function geocodeCandidates(query: string): Promise<CityCandidate[]> {
  const candidates = await fetchGeocodeCandidates(query);
  // Largest / most populous match first, so "Milano" resolves to Milan, Italy
  // instead of a same-named small town elsewhere.
  return candidates.sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
}

export async function geocodeCity(query: string): Promise<CityMatch | null> {
  const candidates = await geocodeCandidates(query);
  return candidates[0] ?? null;
}

// --- Open-Meteo forecast (last-resort fallback for everyone) ---
// Uses timezone=auto so returned hourly timestamps are in the CITY'S OWN local
// time, and current_weather=true for a true up-to-the-minute reading — not
// just the value for hour zero of the day.
async function fetchOpenMeteo(
  lat: number,
  lon: number
): Promise<{ hourly: HourlyPoint[]; currentTime: string }> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly:
      "temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation_probability",
    current_weather: "true",
    forecast_days: "2",
    timezone: "auto"
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error("open-meteo failed");
  const data = await res.json();
  const h = data.hourly;
  const out: HourlyPoint[] = h.time.map((t: string, i: number) => ({
    time: t,
    temperature_c: h.temperature_2m?.[i] ?? null,
    humidity: h.relative_humidity_2m?.[i] ?? null,
    dew_point_c: h.dew_point_2m?.[i] ?? null,
    wind_speed_kmh: h.wind_speed_10m?.[i] ?? null,
    wind_direction_deg: h.wind_direction_10m?.[i] ?? null,
    cloud_cover_pct: h.cloud_cover?.[i] ?? null,
    precipitation_prob_pct: h.precipitation_probability?.[i] ?? null
  }));
  // current_weather.time marks "now" in the city's local time, in the same
  // naive format as hourly.time — use it to trim the table to now-forward.
  const currentTime: string = data.current_weather?.time ?? h.time[0];
  return { hourly: out, currentTime };
}

function trimToNowForward(hourly: HourlyPoint[], currentTime: string): HourlyPoint[] {
  const idx = hourly.findIndex((h) => h.time >= currentTime);
  return idx >= 0 ? hourly.slice(idx) : hourly;
}

// For sources with real, unambiguous timestamps (NWS ISO w/ offset, Windy UTC
// "Z" strings) — compare as actual instants in time rather than as strings,
// since string comparison breaks across differently-formatted timestamps.
function trimByRealTime(hourly: HourlyPoint[], nowMs: number): HourlyPoint[] {
  // 30-minute grace window so the "current" hour isn't dropped early.
  const cutoff = nowMs - 30 * 60 * 1000;
  const idx = hourly.findIndex((h) => new Date(h.time).getTime() >= cutoff);
  return idx >= 0 ? hourly.slice(idx) : hourly;
}

// --- Weather.gov / NWS for US locations ---
function isLikelyUS(lat: number, lon: number): boolean {
  // Rough continental US + Alaska/Hawaii bounding boxes
  const conus = lat >= 24.5 && lat <= 49.5 && lon >= -125 && lon <= -66.9;
  const alaska = lat >= 51 && lat <= 71.5 && lon >= -180 && lon <= -129;
  const hawaii = lat >= 18.5 && lat <= 22.5 && lon >= -160.5 && lon <= -154.5;
  return conus || alaska || hawaii;
}

async function fetchNWS(lat: number, lon: number): Promise<HourlyPoint[] | null> {
  try {
    const pointRes = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, {
      headers: { "User-Agent": "temperature-direction-ai (contact: aguron@zzozzo.ai)" }
    });
    if (!pointRes.ok) return null;
    const point = await pointRes.json();
    const hourlyUrl = point?.properties?.forecastHourly;
    if (!hourlyUrl) return null;
    const fRes = await fetch(hourlyUrl, {
      headers: { "User-Agent": "temperature-direction-ai (contact: aguron@zzozzo.ai)" }
    });
    if (!fRes.ok) return null;
    const fData = await fRes.json();
    const periods = fData?.properties?.periods ?? [];
    return periods.slice(0, 48).map((p: any) => ({
      time: p.startTime,
      temperature_c: p.temperatureUnit === "F" ? ((p.temperature - 32) * 5) / 9 : p.temperature,
      humidity: p.relativeHumidity?.value ?? null,
      dew_point_c: p.dewpoint?.value ?? null,
      wind_speed_kmh: p.windSpeed ? parseFloat(p.windSpeed) * 1.60934 : null,
      wind_direction_deg: null,
      cloud_cover_pct: null,
      precipitation_prob_pct: p.probabilityOfPrecipitation?.value ?? null,
      short_forecast: p.shortForecast ?? undefined
    }));
  } catch {
    return null;
  }
}

// --- Windy (used as 2nd-priority source, only if WINDY_API_KEY is set) ---
async function fetchWindyHourly(lat: number, lon: number): Promise<HourlyPoint[] | null> {
  const key = process.env.WINDY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.windy.com/api/point-forecast/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat,
        lon,
        model: "gfs",
        parameters: ["temp", "wind", "rh", "dewpoint", "lclouds", "mclouds", "hclouds"],
        levels: ["surface"],
        key
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const ts: number[] = data.ts ?? [];
    if (!ts.length) return null;
    const u = data["wind_u-surface"] ?? [];
    const v = data["wind_v-surface"] ?? [];
    return ts.map((t, i) => {
      const uu = u[i] ?? 0;
      const vv = v[i] ?? 0;
      const windSpeedKmh = Math.sqrt(uu * uu + vv * vv) * 3.6;
      const cloud =
        Math.max(data["lclouds-surface"]?.[i] ?? 0, data["mclouds-surface"]?.[i] ?? 0, data["hclouds-surface"]?.[i] ?? 0);
      return {
        time: new Date(t).toISOString(),
        temperature_c: data["temp-surface"]?.[i] != null ? data["temp-surface"][i] - 273.15 : null,
        humidity: data["rh-surface"]?.[i] ?? null,
        dew_point_c: data["dewpoint-surface"]?.[i] != null ? data["dewpoint-surface"][i] - 273.15 : null,
        wind_speed_kmh: windSpeedKmh,
        wind_direction_deg: (Math.atan2(-uu, -vv) * 180) / Math.PI,
        cloud_cover_pct: cloud || null,
        precipitation_prob_pct: null
      };
    });
  } catch {
    return null;
  }
}

// --- AccuWeather (optional; only used if ACCUWEATHER_API_KEY is set) ---
// Two-step API: resolve a location key from lat/lon, then fetch current conditions.
async function fetchAccuWeatherSnapshot(
  lat: number,
  lon: number
): Promise<{ temperature_c: number; weather_text: string; wind_speed_kmh: number; time: string; url: string } | null> {
  const key = process.env.ACCUWEATHER_API_KEY;
  if (!key) return null;
  try {
    const locRes = await fetch(
      `https://dataservice.accuweather.com/locations/v1/cities/geoposition/search?apikey=${key}&q=${lat},${lon}`
    );
    if (!locRes.ok) return null;
    const loc = await locRes.json();
    const locationKey = loc?.Key;
    const url = loc?.Links?.canonical ?? "https://www.accuweather.com";
    if (!locationKey) return null;

    const condRes = await fetch(
      `https://dataservice.accuweather.com/currentconditions/v1/${locationKey}?apikey=${key}&details=true`
    );
    if (!condRes.ok) return null;
    const condArr = await condRes.json();
    const cond = condArr?.[0];
    if (!cond) return null;

    return {
      temperature_c: cond.Temperature?.Metric?.Value,
      weather_text: cond.WeatherText,
      wind_speed_kmh: cond.Wind?.Speed?.Metric?.Value,
      time: cond.LocalObservationDateTime,
      url
    };
  } catch {
    return null;
  }
}

function sunAltitudeDeg(lat: number, lon: number, date: Date): number {
  // Simplified solar elevation angle calculation
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getUTCFullYear(), 0, 0).getTime()) / 86400000
  );
  const decl = 23.44 * Math.sin(rad * ((360 / 365) * (dayOfYear - 81)));
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const solarTime = utcHours + lon / 15;
  const hourAngle = 15 * (solarTime - 12);
  const altitude =
    Math.asin(
      Math.sin(decl * rad) * Math.sin(lat * rad) +
        Math.cos(decl * rad) * Math.cos(lat * rad) * Math.cos(hourAngle * rad)
    ) / rad;
  return Math.round(altitude * 10) / 10;
}

// Source priority: 1) Weather.gov/NWS (US only, official) 2) Windy (if
// WINDY_API_KEY set) 3) Open-Meteo (always-available fallback for everyone).
export async function getWeatherBundle(city: CityMatch): Promise<WeatherBundle> {
  const usSource = isLikelyUS(city.latitude, city.longitude);
  let hourly: HourlyPoint[] | null = null;
  let source_primary: "open-meteo" | "nws" | "windy" = "open-meteo";
  const source_urls: { label: string; url: string }[] = [];

  // Always attempt Weather.gov independently, so we can show it as its own
  // labeled section even when it isn't the source picked for the main figures.
  const nwsUrl = `https://forecast.weather.gov/MapClick.php?lat=${city.latitude}&lon=${city.longitude}`;
  let nwsResult: HourlyPoint[] | null = null;
  if (usSource) {
    nwsResult = await fetchNWS(city.latitude, city.longitude);
  }

  if (nwsResult && nwsResult.length > 0) {
    hourly = nwsResult;
    source_primary = "nws";
    source_urls.push({ label: "Weather.gov / NWS (official US forecast)", url: nwsUrl });
  }

  if (!hourly || hourly.length === 0) {
    hourly = await fetchWindyHourly(city.latitude, city.longitude);
    if (hourly && hourly.length > 0) {
      source_primary = "windy";
      source_urls.push({ label: "Windy (GFS model)", url: "https://www.windy.com" });
    }
  }

  // Always fetch Open-Meteo for its accurate current_weather + local
  // timezone-aware timestamps; use it as the data source if nothing else
  // worked, and as the anchor for "now" either way.
  const openMeteo = await fetchOpenMeteo(city.latitude, city.longitude);
  const now = new Date();
  if (!hourly || hourly.length === 0) {
    hourly = trimToNowForward(openMeteo.hourly, openMeteo.currentTime);
    source_primary = "open-meteo";
    source_urls.push({
      label: "Open-Meteo (ECMWF/GFS blended model)",
      url: `https://open-meteo.com/en/docs?latitude=${city.latitude}&longitude=${city.longitude}`
    });
  } else {
    // hourly came from NWS or Windy, which use real (non-naive) timestamps —
    // trim against the actual current instant, not Open-Meteo's local string.
    hourly = trimByRealTime(hourly, now.getTime());
  }

  const localHourly = trimToNowForward(openMeteo.hourly, openMeteo.currentTime);
  const localTimeString = new Intl.DateTimeFormat("en-GB", {
    timeZone: city.timezone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    day: "2-digit",
    month: "short"
  }).format(now);

  const current = {
    ...(hourly[0] ?? localHourly[0]),
    sun_altitude_deg: sunAltitudeDeg(city.latitude, city.longitude, now),
    local_time: localTimeString,
    timezone: city.timezone
  };

  // Build a standalone Weather.gov snapshot, independent of which source
  // ended up primary above — so it can always be shown as its own section.
  let nws_snapshot: NwsSnapshot;
  if (!usSource) {
    nws_snapshot = { available: false, url: nwsUrl, note: "Weather.gov only covers US locations." };
  } else if (nwsResult && nwsResult.length > 0) {
    const nwsNow = trimByRealTime(nwsResult, now.getTime())[0] ?? nwsResult[0];
    nws_snapshot = {
      available: true,
      temperature_c: nwsNow.temperature_c ?? undefined,
      short_forecast: nwsNow.short_forecast,
      wind_speed_kmh: nwsNow.wind_speed_kmh ?? undefined,
      time: nwsNow.time,
      url: nwsUrl
    };
  } else {
    nws_snapshot = { available: false, url: nwsUrl, note: "Weather.gov request failed or returned no data." };
  }

  // AccuWeather works worldwide, but only if ACCUWEATHER_API_KEY is configured.
  let accuweather_snapshot: AccuWeatherSnapshot;
  if (!process.env.ACCUWEATHER_API_KEY) {
    accuweather_snapshot = {
      available: false,
      url: "https://developer.accuweather.com",
      note: "AccuWeather isn't connected yet — add ACCUWEATHER_API_KEY to enable it."
    };
  } else {
    const aw = await fetchAccuWeatherSnapshot(city.latitude, city.longitude);
    accuweather_snapshot = aw
      ? {
          available: true,
          temperature_c: aw.temperature_c,
          weather_text: aw.weather_text,
          wind_speed_kmh: aw.wind_speed_kmh,
          time: aw.time,
          url: aw.url
        }
      : {
          available: false,
          url: "https://www.accuweather.com",
          note: "AccuWeather request failed or returned no data."
        };
  }

  return {
    source_primary,
    windy_used: source_primary === "windy",
    hourly,
    current,
    fetched_at: now.toISOString(),
    source_urls,
    nws_snapshot,
    accuweather_snapshot
  };
}

// --- Heuristic temperature-direction model ---
// This is an explicit heuristic, not yet a calibrated statistical model.
export function predictDirection(hourly: HourlyPoint[]): PredictionOutput {
  const points = hourly.filter((h) => h.temperature_c != null).slice(0, 6);
  if (points.length < 2) {
    return {
      direction: "same",
      probability_rise: 0.33,
      probability_same: 0.34,
      probability_fall: 0.33,
      confidence_score: 0.2
    };
  }

  const t0 = points[0].temperature_c as number;
  const tN = points[points.length - 1].temperature_c as number;
  const deltaT = tN - t0;

  const cloudTrend =
    (points[points.length - 1].cloud_cover_pct ?? 50) - (points[0].cloud_cover_pct ?? 50);
  const humidityTrend =
    (points[points.length - 1].humidity ?? 50) - (points[0].humidity ?? 50);
  const windTrend =
    (points[points.length - 1].wind_speed_kmh ?? 10) - (points[0].wind_speed_kmh ?? 10);

  // Weighted score: positive => rising, negative => falling
  let score = deltaT * 1.2 - cloudTrend * 0.03 - humidityTrend * 0.02 - windTrend * 0.05;

  // Squash score into a rise/fall/same probability split via logistic-style buckets
  const magnitude = Math.min(Math.abs(score), 6);
  const strength = magnitude / 6; // 0..1

  let probRise: number, probFall: number, probSame: number;
  if (score > 0) {
    probRise = 0.34 + strength * 0.5;
    probFall = 0.33 - strength * 0.25;
    probSame = 1 - probRise - probFall;
  } else if (score < 0) {
    probFall = 0.34 + strength * 0.5;
    probRise = 0.33 - strength * 0.25;
    probSame = 1 - probRise - probFall;
  } else {
    probRise = 0.33;
    probFall = 0.33;
    probSame = 0.34;
  }
  probRise = Math.max(0.02, Math.min(0.9, probRise));
  probFall = Math.max(0.02, Math.min(0.9, probFall));
  probSame = Math.max(0.02, 1 - probRise - probFall);

  const direction: Direction =
    probRise >= probFall && probRise >= probSame
      ? "rise"
      : probFall >= probRise && probFall >= probSame
      ? "fall"
      : "same";

  const confidence_score = Math.round((0.5 + strength * 0.45) * 100) / 100;

  return {
    direction,
    probability_rise: Math.round(probRise * 100) / 100,
    probability_same: Math.round(probSame * 100) / 100,
    probability_fall: Math.round(probFall * 100) / 100,
    confidence_score
  };
}
