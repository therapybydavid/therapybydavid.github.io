// Cloudflare Pages Function — handles newsletter/SMS sign-ups
// Submits directly to MailChimp API, bypassing form validation issues.
// Requires MAILCHIMP_API_KEY set as an environment variable in Cloudflare Pages.

export async function onRequestPost(context) {
  const { env, request } = context;

  // CORS headers so the browser can call this from the same domain
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const formData = await request.formData();
    const email = (formData.get('email') || '').trim();
    const fname = (formData.get('fname') || '').trim();
    const phone = (formData.get('phone') || '').trim();

    if (!email) {
      return Response.json({ success: false, message: 'Email address is required.' }, { status: 400, headers });
    }

    // Format phone to E.164 if provided
    let smsphone = '';
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length === 10) smsphone = '+1' + digits;
      else if (digits.length === 11 && digits[0] === '1') smsphone = '+' + digits;
      else smsphone = phone; // pass through as-is if format is unexpected
    }

    // Build MailChimp member payload
    const payload = {
      email_address: email,
      status: 'subscribed',
      merge_fields: { FNAME: fname },
    };

    if (smsphone) {
      payload.merge_fields.SMSPHONE = smsphone;
    }

    const apiKey = env.MAILCHIMP_API_KEY;
    const listId = '8fcf4a04de';
    const server = 'us5';

    const mcResponse = await fetch(
      `https://${server}.api.mailchimp.com/3.0/lists/${listId}/members`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('anystring:' + apiKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await mcResponse.json();

    if (mcResponse.ok) {
      return Response.json({ success: true }, { headers });
    } else if (result.title === 'Member Exists') {
      // Already subscribed — treat as success so UX is smooth
      return Response.json({ success: true, already: true }, { headers });
    } else {
      const msg = result.detail || result.title || 'Something went wrong. Please try again.';
      return Response.json({ success: false, message: msg }, { status: 400, headers });
    }

  } catch (err) {
    return Response.json({ success: false, message: 'Server error. Please try again.' }, { status: 500, headers });
  }
}
