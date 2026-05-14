exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { firstName, email, phqScore, gadScore } = JSON.parse(event.body);

  const API_KEY = process.env.MAILCHIMP_API_KEY;
  const LIST_ID = process.env.MAILCHIMP_LIST_ID;
  const DC = API_KEY.split('-')[1]; // extracts "us5"

  const phqLabel = phqScore >= 20 ? 'Severe'
    : phqScore >= 15 ? 'Moderately Severe'
    : phqScore >= 10 ? 'Moderate'
    : phqScore >= 5  ? 'Mild'
    : 'Minimal';

  const gadLabel = gadScore >= 15 ? 'Severe'
    : gadScore >= 10 ? 'Moderate'
    : gadScore >= 5  ? 'Mild'
    : 'Minimal';

  const memberData = {
    email_address: email,
    status: 'subscribed',
    merge_fields: {
      FNAME:     firstName,
      PHQSCORE:  String(phqScore),
      GADSCORE:  String(gadScore),
      PHQLABEL:  phqLabel,
      GADLABEL:  gadLabel
    },
    tags: [`PHQ-${phqLabel}`, `GAD-${gadLabel}`]
  };

  try {
    const response = await fetch(
      `https://${DC}.api.mailchimp.com/3.0/lists/${LIST_ID}/members`,
      {
        method: 'POST',
        headers: {
          Authorization: `apikey ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(memberData)
      }
    );

    if (response.status === 400) {
      const err = await response.json();
      if (err.title === 'Member Exists') {
        return { statusCode: 200, body: JSON.stringify({ status: 'already_subscribed' }) };
      }
      return { statusCode: 400, body: JSON.stringify(err) };
    }

    const result = await response.json();
    return { statusCode: 200, body: JSON.stringify({ status: 'subscribed', id: result.id }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
