// Netlify function: writes one follow-up question based on the student's last answer.
// The API key stays on the server (set in Netlify as GEMINI_API_KEY).

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing GEMINI_API_KEY" }) };
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request" }) };
  }

  const field = String(input.field || "General").slice(0, 60);
  const lastAnswer = String(input.lastAnswer || "").slice(0, 3000);
  const history = Array.isArray(input.history) ? input.history.slice(-6) : [];
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const system = `You are a job interviewer practising with a student for the field: ${field}.
Rules:
- Ask exactly one follow-up question, based on the student's last answer. Do not use a script.
- Pick the most specific or unclear point in that answer and ask about it.
- Keep the question clear and reasonable in length: one or two sentences.
- If the last answer was vague, long, or exaggerated, first write one short line telling the student to answer on point and not exaggerate, then ask the question.
- Output plain text only. No headings, no lists, no quotes.`;

  const transcript = history
    .map((h) => `Question: ${String(h.question || "").slice(0, 300)}\nAnswer: ${String(h.answer || "").slice(0, 1500)}`)
    .join("\n\n");

  const prompt = `Conversation so far:\n${transcript}\n\nLatest answer from the student:\n${lastAnswer}\n\nWrite the next follow-up.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.8 }
        })
      }
    );

    const data = await res.json();
    if (!res.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: (data.error && data.error.message) || "AI error" })
      };
    }

    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("")
      .trim();

    if (!text) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Empty AI reply" }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ followUp: text }) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "AI unavailable" }) };
  }
};
