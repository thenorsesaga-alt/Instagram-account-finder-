// Runs on Netlify's servers, never in the browser -- this is the only
// place GEMINI_API_KEY exists, read from a Netlify environment variable.
// Set it in: Site configuration -> Environment variables -> GEMINI_API_KEY.

const MODEL = "gemini-3.5-flash-lite";

const RESPONSE_SCHEMA = {
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

const PROMPT = `You are analyzing a digital product (an ebook, PDF guide, or workbook) so it can later be matched against social media creators for partnership outreach. Read the attached file and return:
- description: a one-to-two sentence summary
- category: the single best category for it
- target_audience: who it's actually written for
- problems_solved: the main problem(s) it addresses
- benefits: the key benefits a reader gets
- keywords: 5-8 comma-separated keywords
Base every field only on what the document actually contains. Do not invent details it doesn't support.`;

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

  const { pdfBase64, mimeType } = body;
  if (!pdfBase64) {
    return new Response(JSON.stringify({ error: "No file provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inlineData: { mimeType: mimeType || "application/pdf", data: pdfBase64 } },
              ],
            },
          ],
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

export const config = { path: "/api/analyze-product" };
