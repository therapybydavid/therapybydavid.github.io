// Cloudflare Pages Function — AI summary of a medical visit transcript.
// Endpoint: POST /functions/summarize-visit   Body: { "transcript": "..." }
//
// SETUP:
//   Cloudflare Pages → your project → Settings → Variables and secrets
//   Add:  ANTHROPIC_API_KEY  (Secret)  — same key used in openpath-intake Worker.

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const { transcript } = await request.json();

    if (!transcript || transcript.trim().length < 15) {
      return Response.json({ summary: transcript || '' });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return Response.json({ summary: transcript });
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `You are summarizing a recording of a hospital/doctor visit for the patient. Write clear, factual notes covering: what the provider said, any findings or observations, medications or treatments mentioned, instructions, and follow-up steps. Be specific. Plain prose, no headers.\n\nTranscript:\n${transcript.trim()}`,
        }],
      }),
    });

    if (!resp.ok) {
      return Response.json({ summary: transcript });
    }

    const data = await resp.json();
    const summary = data.content?.[0]?.text || transcript;
    return Response.json({ summary });

  } catch (err) {
    return Response.json({ summary: '' }, { status: 500 });
  }
}
