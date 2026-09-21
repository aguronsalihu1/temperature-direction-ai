import { createClient } from "@supabase/supabase-js";

export function getSupabase() {
  const url = process.env.SUPABASE_URL as string;
  const key = process.env.SUPABASE_ANON_KEY as string;
  return createClient(url, key);
}

export async function upsertCity(sb: ReturnType<typeof getSupabase>, city: {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}) {
  const { data, error } = await sb
    .from("cities")
    .upsert(
      {
        name: city.name,
        country: city.country,
        latitude: city.latitude,
        longitude: city.longitude,
        timezone: city.timezone
      },
      { onConflict: "name,latitude,longitude" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
