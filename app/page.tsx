"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface HourlyPoint {
  time: string;
  temperature_c: number | null;
  humidity: number | null;
  dew_point_c: number | null;
  wind_speed_kmh: number | null;
  wind_direction_deg: number | null;
  cloud_cover_pct: number | null;
  precipitation_prob_pct: number | null;
}

interface GeoOption {
  name: string;
  admin1: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface ApiResult {
  city: { name: string; country: string; latitude: number; longitude: number };
  source_primary: string;
  windy_used: boolean;
  fetched_at: string;
  source_urls: { label: string; url: string }[];
  current: HourlyPoint & { sun_altitude_deg: number; local_time: string; timezone: string };
  hourly: HourlyPoint[];
  prediction: {
    direction: "rise" | "same" | "fall";
    probability_rise: number;
    probability_same: number;
    probability_fall: number;
    confidence_score: number;
  };
}

const arrow: Record<string, string> = { rise: "⬆️", same: "➡️", fall: "⬇️" };
const REFRESH_MS = 10000;
const CARD_BG = "#f7f8fa";
const BORDER = "#e3e6ea";

export default function Home() {
  const [query, setQuery] = useState("Milano");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [activeParams, setActiveParams] = useState<Record<string, string> | null>(null);
  const [secondsToRefresh, setSecondsToRefresh] = useState(10);
  const [suggestions, setSuggestions] = useState<GeoOption[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (params: Record<string, string>, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`/api/predict?${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data);
      setActiveParams(params);
      setSecondsToRefresh(10);
    } catch (e: any) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  function searchByText() {
    setShowDropdown(false);
    runSearch({ city: query });
  }

  function selectSuggestion(opt: GeoOption) {
    setQuery(`${opt.name}${opt.admin1 ? ", " + opt.admin1 : ""}${opt.country ? ", " + opt.country : ""}`);
    setShowDropdown(false);
    setSuggestions([]);
    runSearch({
      name: opt.name,
      country: opt.country,
      lat: String(opt.latitude),
      lon: String(opt.longitude),
      timezone: opt.timezone
    });
  }

  function onQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(value)}`);
        const data = await res.json();
        setSuggestions(data.results ?? []);
        setShowDropdown(true);
      } catch {
        // ignore
      }
    }, 250);
  }

  // Auto-refresh every 10 seconds once a location is active
  useEffect(() => {
    if (!activeParams) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      runSearch(activeParams, true);
    }, REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeParams, runSearch]);

  useEffect(() => {
    if (!activeParams) return;
    const tick = setInterval(() => {
      setSecondsToRefresh((s) => (s <= 1 ? 10 : s - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [activeParams]);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>🌡️ Temperature Direction AI</h1>
      <p style={{ opacity: 0.65, marginTop: 0 }}>Search a city to see where the temperature is heading.</p>

      <div style={{ position: "relative", margin: "20px 0" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchByText()}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            placeholder="e.g. Milano"
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              background: "#ffffff",
              color: "#1a1f26"
            }}
          />
          <button
            onClick={searchByText}
            disabled={loading}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "white",
              cursor: "pointer"
            }}
          >
            {loading ? "..." : "🔎 Search"}
          </button>
        </div>

        {showDropdown && suggestions.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "#ffffff",
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              zIndex: 10,
              overflow: "hidden"
            }}
          >
            {suggestions.map((s, i) => (
              <div
                key={`${s.name}-${s.latitude}-${i}`}
                onClick={() => selectSuggestion(s)}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderTop: i > 0 ? `1px solid ${BORDER}` : "none"
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <b>{s.name}</b>
                <span style={{ opacity: 0.6 }}>
                  {s.admin1 ? `, ${s.admin1}` : ""}
                  {s.country ? `, ${s.country}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p style={{ color: "#dc2626" }}>{error}</p>}

      {result && (
        <div>
          <h2 style={{ marginBottom: 4 }}>
            {result.city.name}, {result.city.country}
          </h2>
          <div style={{ opacity: 0.7, marginTop: 0, fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
            <div>
              🕒 Local time: <b>{result.current.local_time}</b> ({result.current.timezone})
            </div>
            <div>
              Data fetched at {new Date(result.fetched_at).toLocaleTimeString()} · next refresh in{" "}
              <b>{secondsToRefresh}s</b>
            </div>
            <div>
              Source:{" "}
              {result.source_urls.map((s, i) => (
                <span key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                    {s.label}
                  </a>
                  {i < result.source_urls.length - 1 ? " · " : ""}
                </span>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              margin: "16px 0"
            }}
          >
            <Stat label="🌡️ Temperature" value={`${result.current.temperature_c?.toFixed(1)}°C`} />
            <Stat
              label="☀️ Sun position"
              value={
                result.current.sun_altitude_deg >= 0
                  ? `${result.current.sun_altitude_deg}° above horizon`
                  : `${Math.abs(result.current.sun_altitude_deg)}° below horizon (night)`
              }
            />
            <Stat label="💨 Wind" value={`${result.current.wind_speed_kmh?.toFixed(0) ?? "–"} km/h`} />
            <Stat label="☁️ Cloud cover" value={`${result.current.cloud_cover_pct ?? "–"}%`} />
            <Stat label="💧 Humidity" value={`${result.current.humidity ?? "–"}%`} />
            <Stat label="💦 Dew point" value={`${result.current.dew_point_c?.toFixed(1) ?? "–"}°C`} />
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: CARD_BG,
              border: `1px solid ${BORDER}`,
              marginBottom: 20
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 8 }}>
              {arrow[result.prediction.direction]} Direction: <b>{result.prediction.direction.toUpperCase()}</b>{" "}
              <span style={{ opacity: 0.6, fontSize: 14 }}>
                (confidence {Math.round(result.prediction.confidence_score * 100)}%)
              </span>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
              <span>⬆️ Rise {Math.round(result.prediction.probability_rise * 100)}%</span>
              <span>➡️ Same {Math.round(result.prediction.probability_same * 100)}%</span>
              <span>⬇️ Fall {Math.round(result.prediction.probability_fall * 100)}%</span>
            </div>
            <p style={{ fontSize: 12, opacity: 0.55, marginTop: 10, marginBottom: 0 }}>
              Heuristic estimate — not yet a calibrated statistical model. No forecast can be 100% certain.
            </p>
          </div>

          <h3>📈 Next hours</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.6 }}>
                  <th style={{ padding: 6 }}>Time</th>
                  <th>🌡️ Temp</th>
                  <th>🌧️ Rain %</th>
                  <th>💨 Wind</th>
                  <th>☁️ Cloud</th>
                </tr>
              </thead>
              <tbody>
                {result.hourly.slice(0, 12).map((h) => (
                  <tr key={h.time} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ padding: 6 }}>
                      {new Date(h.time).toLocaleString([], { hour: "2-digit", weekday: "short" })}
                    </td>
                    <td>{h.temperature_c?.toFixed(1) ?? "–"}°</td>
                    <td>{h.precipitation_prob_pct ?? "–"}</td>
                    <td>{h.wind_speed_kmh?.toFixed(0) ?? "–"}</td>
                    <td>{h.cloud_cover_pct ?? "–"}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
