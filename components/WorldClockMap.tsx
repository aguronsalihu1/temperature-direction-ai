"use client";

import { useEffect, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { WORLD_CITIES } from "@/lib/world-cities";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

function timeInZone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export default function WorldClockMap() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ margin: "24px 0" }}>
      <h3 style={{ marginBottom: 8 }}>🌍 World Clock</h3>
      <div
        style={{
          border: "1px solid #e3e6ea",
          borderRadius: 12,
          background: "#f7f8fa",
          padding: 8,
          overflow: "hidden"
        }}
      >
        <ComposableMap
          projection="geoEqualEarth"
          projectionConfig={{ scale: 148 }}
          width={980}
          height={480}
          style={{ width: "100%", height: "auto" }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }: { geographies: any[] }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#dfe4ea"
                  stroke="#c7cdd4"
                  strokeWidth={0.5}
                  style={{ outline: "none" }}
                />
              ))
            }
          </Geographies>

          {now &&
            WORLD_CITIES.map((city) => (
              <Marker key={city.name} coordinates={[city.lon, city.lat]}>
                <circle r={4} fill="#2563eb" stroke="#ffffff" strokeWidth={1} />
                <text
                  textAnchor="middle"
                  y={-10}
                  style={{ fontFamily: "system-ui, sans-serif", fontSize: 10, fontWeight: 600, fill: "#1a1f26" }}
                >
                  {city.name}
                </text>
                <text
                  textAnchor="middle"
                  y={16}
                  style={{ fontFamily: "system-ui, sans-serif", fontSize: 10, fill: "#2563eb", fontWeight: 600 }}
                >
                  {timeInZone(now, city.timezone)}
                </text>
              </Marker>
            ))}
        </ComposableMap>
      </div>
      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 6 }}>
        Local time for major cities worldwide, updated live.
      </p>
    </div>
  );
}
