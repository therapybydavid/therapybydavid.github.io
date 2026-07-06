export async function onRequestPost(context) {
  const { request, env } = context;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.REMINDER_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { message } = body;
  if (!message) {
    return new Response('Missing message', { status: 400 });
  }

  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const fromNumber = env.TWILIO_FROM_NUMBER;
  const toNumber = '+18325365177';

  const params = new URLSearchParams({
    To: toNumber,
    From: fromNumber,
    Body: message,
  });

  const twilioResponse = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  if (!twilioResponse.ok) {
    const err = await twilioResponse.text();
    return new Response(`Twilio error: ${err}`, { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
