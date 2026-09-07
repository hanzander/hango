import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

function pickMeta(html: string, key: string) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
    "i",
  );
  return html.match(re)?.[1] || html.match(re2)?.[1] || null;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "HangoBot/1.0" },
      redirect: "follow",
    });
    const html = await res.text();
    const title =
      pickMeta(html, "og:title") ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
      null;
    const description =
      pickMeta(html, "og:description") || pickMeta(html, "description");
    const image = pickMeta(html, "og:image");
    let site: string | null = null;
    try {
      site = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      site = null;
    }

    return NextResponse.json({
      url,
      title: title?.slice(0, 200) ?? null,
      description: description?.slice(0, 300) ?? null,
      image,
      site,
    });
  } catch {
    return NextResponse.json({ url, title: null, description: null, image: null });
  }
}
