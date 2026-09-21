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
}

export interface WeatherBundle {
  source_primary: "open-meteo" | "nws";
  windy_used: boolean;
  hourly: HourlyPoint[];
  current: HourlyPoint & { sun_altitude_deg: number };
}

export interface PredictionOutput {
  direction: Direction;
  probability_rise: number;
  probability_same: number;
  probability_fall: number;
  confidence_score: number;
}

// --- Geocoding via Open-Meteo (free, no key) ---
export async function geocodeCity(query: string): Promise<CityMatch | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const r = data?.results?.[0];
  if (!r) return null;
  return {
    name: r.name,
    country: r.country ?? "",
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone ?? "UTC"
  };
}

// --- Open-Meteo forecast (base + fallback for everyone) ---
async function fetchOpenMeteo(lat: number, lon: number): Promise<HourlyPoint[]> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly:
      "temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation_probability",
    forecast_days: "2",
    timezone: "UTC"
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
  return out;
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
      precipitation_prob_pct: p.probabilityOfPrecipitation?.value ?? null
    }));
  } catch {
    return null;
  }
}

// --- Windy (optional; only used if WINDY_API_KEY is set) ---
async function fetchWindy(lat: number, lon: number): Promise<Partial<HourlyPoint> | null> {
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
        parameters: ["wind", "temp"],
        key
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      wind_speed_kmh: data["wind_u-surface"]?.[0] != null ? Math.abs(data["wind_u-surface"][0]) * 3.6 : null
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

export async function getWeatherBundle(city: CityMatch): Promise<WeatherBundle> {
  const usSource = isLikelyUS(city.latitude, city.longitude);
  let hourly: HourlyPoint[] | null = null;
  let source_primary: "open-meteo" | "nws" = "open-meteo";

  if (usSource) {
    hourly = await fetchNWS(city.latitude, city.longitude);
    if (hourly && hourly.length > 0) source_primary = "nws";
  }
  if (!hourly || hourly.length === 0) {
    hourly = await fetchOpenMeteo(city.latitude, city.longitude);
    source_primary = "open-meteo";
  }

  const windy = await fetchWindy(city.latitude, city.longitude);
  const windy_used = !!windy;
  if (windy?.wind_speed_kmh != null && hourly[0]) {
    hourly[0] = { ...hourly[0], wind_speed_kmh: windy.wind_speed_kmh };
  }

  const now = new Date();
  const current = {
    ...hourly[0],
    sun_altitude_deg: sunAltitudeDeg(city.latitude, city.longitude, now)
  };

  return { source_primary, windy_used, hourly, current };
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
