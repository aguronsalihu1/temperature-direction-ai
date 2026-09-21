export interface WorldCity {
  name: string;
  lat: number;
  lon: number;
  timezone: string;
}

export const WORLD_CITIES: WorldCity[] = [
  { name: "New York", lat: 40.7128, lon: -74.006, timezone: "America/New_York" },
  { name: "Los Angeles", lat: 34.0522, lon: -118.2437, timezone: "America/Los_Angeles" },
  { name: "Mexico City", lat: 19.4326, lon: -99.1332, timezone: "America/Mexico_City" },
  { name: "São Paulo", lat: -23.5505, lon: -46.6333, timezone: "America/Sao_Paulo" },
  { name: "London", lat: 51.5074, lon: -0.1278, timezone: "Europe/London" },
  { name: "Paris", lat: 48.8566, lon: 2.3522, timezone: "Europe/Paris" },
  { name: "Berlin", lat: 52.52, lon: 13.405, timezone: "Europe/Berlin" },
  { name: "Pristina", lat: 42.6629, lon: 21.1655, timezone: "Europe/Belgrade" },
  { name: "Cairo", lat: 30.0444, lon: 31.2357, timezone: "Africa/Cairo" },
  { name: "Moscow", lat: 55.7558, lon: 37.6173, timezone: "Europe/Moscow" },
  { name: "Dubai", lat: 25.2048, lon: 55.2708, timezone: "Asia/Dubai" },
  { name: "Mumbai", lat: 19.076, lon: 72.8777, timezone: "Asia/Kolkata" },
  { name: "Beijing", lat: 39.9042, lon: 116.4074, timezone: "Asia/Shanghai" },
  { name: "Tokyo", lat: 35.6762, lon: 139.6503, timezone: "Asia/Tokyo" },
  { name: "Singapore", lat: 1.3521, lon: 103.8198, timezone: "Asia/Singapore" },
  { name: "Sydney", lat: -33.8688, lon: 151.2093, timezone: "Australia/Sydney" },
  { name: "Johannesburg", lat: -26.2041, lon: 28.0473, timezone: "Africa/Johannesburg" },
  { name: "Toronto", lat: 43.6532, lon: -79.3832, timezone: "America/Toronto" }
];
