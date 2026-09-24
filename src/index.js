// This is the Cloudflare Workers version of the three functions that used
// to live in netlify/functions/. Same logic, adapted to how Workers routes
// requests and reads secrets (env.X here, instead of process.env.X).
//
// GEMINI_API_KEY and YOUTUBE_API_KEY must be added as Secrets in:
// Workers & Pages -> this project -> Settings -> Variables and Secrets.

const GEMINI_MODEL = "gemini-3.6-flash";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/analyze-product") {
      return handleAnalyzeProduct(request, env);
    }
    if (url.pathname === "/api/analyze-creator") {
      return handleAnalyzeCreator(request, env);
    }
    if (url.pathname === "/api/search-youtube") {
      return handleSearchYoutube(request, env);
    }

    // Any other request under /api/* that doesn't match one of the above.
    return env.ASSETS.fetch(request);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------
// Product analysis (Gemini reads an uploaded PDF)
// ---------------------------------------------------------------

async function handleAnalyzeProduct(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: "GEMINI_API_KEY is not set in Cloudflare's environment variables yet" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { pdfBase64, mimeType } = body;
  if (!pdfBase64) return json({ error: "No file provided" }, 400);

  const schema = {
    type: "object",
    properties: {
      description: { type: "string" },
      category: { type: "string" },
      target_audience: { type: "string" },
      problems_solved: { type: "string" },
      benefits: { type: "string" },
      keywords: { type: "string" },
    },
    required: [
      "description",
      "category",
      "target_audience",
      "problems_solved",
      "benefits",
      "keywords",
    ],
  };

  const prompt = `You are analyzing a digital product (an ebook, PDF guide, or workbook) so it can later be matched against social media creators for partnership outreach. Read the attached file and return:
- description: a one-to-two sentence summary
- category: the single best category for it
- target_audience: who it's actually written for
- problems_solved: the main problem(s) it addresses
- benefits: the key benefits a reader gets
- keywords: 5-8 comma-separated keywords
Base every field only on what the document actually contains. Do not invent details it doesn't support.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: mimeType || "application/pdf", data: pdfBase64 } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json", responseSchema: schema },
        }),
      }
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      return json({ error: data.error?.message || `Gemini returned ${geminiRes.status}` }, geminiRes.status);
    }

    const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textPart) return json({ error: "Gemini didn't return an analysis" }, 502);

    return json(JSON.parse(textPart));
  } catch (err) {
    return json({ error: err.message || "Unexpected error" }, 500);
  }
}

// ---------------------------------------------------------------
// Creator analysis
// ---------------------------------------------------------------

async function handleAnalyzeCreator(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: "GEMINI_API_KEY is not set in Cloudflare's environment variables yet" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { username, platform, bio, niche } = body;
  if (!username) return json({ error: "Missing username" }, 400);

  const schema = {
    type: "object",
    properties: {
      niche: { type: "string" },
      content_themes: { type: "string" },
      audience_description: { type: "string" },
      analysis_notes: { type: "string" },
    },
    required: ["niche", "content_themes", "audience_description", "analysis_notes"],
  };

  const prompt = `You are analyzing a social media creator as a potential partner for promoting someone else's digital product. Base every field only on the information given below -- if it's too thin to say something with real confidence, say that plainly in the field instead of guessing. Do not invent anything not supported by what's given.

Username: ${username}
Platform: ${platform || "unknown"}
Bio: ${bio || "not provided"}
Niche already noted: ${niche || "not provided"}

Return:
- niche: their content category, refined from the above if possible
- content_themes: 3-6 words on recurring topics
- audience_description: who is likely following them
- analysis_notes: 1-2 sentences on their apparent collaboration potential`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: schema },
        }),
      }
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      return json({ error: data.error?.message || `Gemini returned ${geminiRes.status}` }, geminiRes.status);
    }

    const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textPart) return json({ error: "Gemini didn't return an analysis" }, 502);

    return json(JSON.parse(textPart));
  } catch (err) {
    return json({ error: err.message || "Unexpected error" }, 500);
  }
}

// ---------------------------------------------------------------
// YouTube discovery
// ---------------------------------------------------------------

async function handleSearchYoutube(request, env) {
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return json({ error: "YOUTUBE_API_KEY is not set in Cloudflare's environment variables yet" }, 500);
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  if (!query) return json({ error: "Missing query" }, 400);

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=10&q=${encodeURIComponent(
        query
      )}&key=${apiKey}`
    );
    const searchData = await searchRes.json();
    if (!searchRes.ok) {
      return json({ error: searchData.error?.message || "YouTube search failed" }, searchRes.status);
    }

    const channelIds = [
      ...new Set(
        (searchData.items || [])
          .map((item) => item.id?.channelId || item.snippet?.channelId)
          .filter(Boolean)
      ),
    ];

    if (!channelIds.length) return json({ results: [] });

    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds.join(
        ","
      )}&key=${apiKey}`
    );
    const statsData = await statsRes.json();
    if (!statsRes.ok) {
      return json({ error: statsData.error?.message || "YouTube channel lookup failed" }, statsRes.status);
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

    return json({ results });
  } catch (err) {
    return json({ error: err.message || "Unexpected error" }, 500);
  }
}
