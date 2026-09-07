import { NextRequest, NextResponse } from "next/server";

/** Tenor GIF search — uses public demo key if TENOR_API_KEY unset */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "happy";
  const key = process.env.TENOR_API_KEY || "AIzaSyAyimkuZjJJq5ggVlSqfGKmdnu1FDFicOY";

  try {
    const url = new URL("https://tenor.googleapis.com/v2/search");
    url.searchParams.set("q", q);
    url.searchParams.set("key", key);
    url.searchParams.set("limit", "24");
    url.searchParams.set("media_filter", "gif,tinygif");
    url.searchParams.set("client_key", "hango");

    const res = await fetch(url.toString());
    if (!res.ok) {
      return NextResponse.json({ results: [] });
    }
    const data = (await res.json()) as {
      results?: {
        id: string;
        content_description?: string;
        media_formats?: {
          gif?: { url: string };
          tinygif?: { url: string };
        };
      }[];
    };

    const results = (data.results ?? []).map((r) => ({
      id: r.id,
      title: r.content_description || "GIF",
      url: r.media_formats?.gif?.url || r.media_formats?.tinygif?.url || "",
      preview: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url || "",
    })).filter((r) => r.url);

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
