import { NextRequest, NextResponse } from "next/server";
import { geocodeCandidates } from "@/lib/weather";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }
  const candidates = await geocodeCandidates(q.trim());
  return NextResponse.json({
    results: candidates.slice(0, 6).map((c) => ({
      name: c.name,
      admin1: c.admin1 ?? "",
      country: c.country,
      latitude: c.latitude,
      longitude: c.longitude,
      timezone: c.timezone
    }))
  });
}
