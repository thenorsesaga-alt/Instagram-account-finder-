// Runs on Netlify's servers, never in the browser -- reuses the same
// GEMINI_API_KEY environment variable Phase 4 already set up.

const MODEL = "gemini-3.5-flash-lite";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    niche: { type: "string" },
    content_themes: { type: "string" },
    audience_description: { type: "string" },
    analysis_notes: { type: "string" },
  },
  required: ["niche", "content_themes", "audience_description", "analysis_notes"],
};

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not set in Netlify's environment variables yet" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { username, platform, bio, niche } = body;
  if (!username) {
    return new Response(JSON.stringify({ error: "Missing username" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const message = data.error?.message || `Gemini returned ${geminiRes.status}`;
      return new Response(JSON.stringify({ error: message }), {
        status: geminiRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textPart) {
      return new Response(JSON.stringify({ error: "Gemini didn't return an analysis" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const analysis = JSON.parse(textPart);
    return new Response(JSON.stringify(analysis), {
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

export const config = { path: "/api/analyze-creator" };
