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

interface ApiResult {
  city: { name: string; country: string; latitude: number; longitude: number };
  source_primary: string;
  windy_used: boolean;
  fetched_at: string;
  source_urls: { label: string; url: string }[];
  current: HourlyPoint & { sun_altitude_deg: number };
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

export default function Home() {
  const [query, setQuery] = useState("Milano");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const [secondsToRefresh, setSecondsToRefresh] = useState(10);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSearch = useCallback(async (city: string, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`/api/predict?city=${encodeURIComponent(city)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data);
      setActiveCity(city);
      setSecondsToRefresh(10);
    } catch (e: any) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  function search() {
    runSearch(query);
  }

  // Auto-refresh every 10 seconds once a city is active
  useEffect(() => {
    if (!activeCity) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      runSearch(activeCity, true);
    }, REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeCity, runSearch]);

  // Visual countdown between refreshes
  useEffect(() => {
    if (!activeCity) return;
    const tick = setInterval(() => {
      setSecondsToRefresh((s) => (s <= 1 ? 10 : s - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [activeCity]);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>🌡️ Temperature Direction AI</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>Search a city to see where the temperature is heading.</p>

      <div style={{ display: "flex", gap: 8, margin: "20px 0" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="e.g. Milano"
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #2a333d",
            background: "#131a22",
            color: "#e8edf2"
          }}
        />
        <button
          onClick={search}
          disabled={loading}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: "#3b82f6",
            color: "white",
            cursor: "pointer"
          }}
        >
          {loading ? "..." : "🔎 Search"}
        </button>
      </div>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      {result && (
        <div>
          <h2 style={{ marginBottom: 4 }}>
            {result.city.name}, {result.city.country}
          </h2>
          <div style={{ opacity: 0.7, marginTop: 0, fontSize: 12, marginBottom: 12 }}>
            <div>
              🕒 Fetched at {new Date(result.fetched_at).toLocaleTimeString()} · next refresh in{" "}
              <b>{secondsToRefresh}s</b>
            </div>
            <div style={{ marginTop: 4 }}>
              Sources:{" "}
              {result.source_urls.map((s, i) => (
                <span key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
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
            <Stat label="☀️ Sun altitude" value={`${result.current.sun_altitude_deg}°`} />
            <Stat
              label="💨 Wind"
              value={`${result.current.wind_speed_kmh?.toFixed(0) ?? "–"} km/h`}
            />
            <Stat label="☁️ Cloud cover" value={`${result.current.cloud_cover_pct ?? "–"}%`} />
            <Stat label="💧 Humidity" value={`${result.current.humidity ?? "–"}%`} />
            <Stat label="💦 Dew point" value={`${result.current.dew_point_c?.toFixed(1) ?? "–"}°C`} />
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: "#131a22",
              border: "1px solid #2a333d",
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
            <p style={{ fontSize: 12, opacity: 0.5, marginTop: 10, marginBottom: 0 }}>
              Heuristic estimate — not yet a calibrated statistical model.
            </p>
          </div>

          <h3>📈 Next hours</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.6 }}>
                  <th style={{ padding: 6 }}>Time</th>
                  <th>🌡️</th>
                  <th>🌧️ %</th>
                  <th>💨</th>
                  <th>☁️</th>
                </tr>
              </thead>
              <tbody>
                {result.hourly.slice(0, 12).map((h) => (
                  <tr key={h.time} style={{ borderTop: "1px solid #2a333d" }}>
                    <td style={{ padding: 6 }}>{new Date(h.time).toLocaleString([], { hour: "2-digit", weekday: "short" })}</td>
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
    <div style={{ background: "#131a22", border: "1px solid #2a333d", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
