// Runs on Netlify's servers, never in the browser -- YOUTUBE_API_KEY
// lives only in a Netlify environment variable.
// Set it in: Site configuration -> Environment variables -> YOUTUBE_API_KEY.

export default async (req) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "YOUTUBE_API_KEY is not set in Netlify's environment variables yet" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(req.url);
  const query = url.searchParams.get("query");
  if (!query) {
    return new Response(JSON.stringify({ error: "Missing query" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=10&q=${encodeURIComponent(
        query
      )}&key=${apiKey}`
    );
    const searchData = await searchRes.json();

    if (!searchRes.ok) {
      return new Response(
        JSON.stringify({ error: searchData.error?.message || "YouTube search failed" }),
        { status: searchRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const channelIds = [
      ...new Set(
        (searchData.items || [])
          .map((item) => item.id?.channelId || item.snippet?.channelId)
          .filter(Boolean)
      ),
    ];

    if (!channelIds.length) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds.join(
        ","
      )}&key=${apiKey}`
    );
    const statsData = await statsRes.json();

    if (!statsRes.ok) {
      return new Response(
        JSON.stringify({ error: statsData.error?.message || "YouTube channel lookup failed" }),
        { status: statsRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const results = (statsData.items || []).map((c) => ({
      channelId: c.id,
      title: c.snippet?.title || c.id,
      description: c.snippet?.description || "",
      customUrl: c.snippet?.customUrl || null,
      subscriberCount: c.statistics?.hiddenSubscriberCount
        ? null
        : Number(c.statistics?.subscriberCount ?? 0),
    }));

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/search-youtube" };
