export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { firstName, email, phqScore, gadScore } = req.body;

  const API_KEY = process.env.MAILCHIMP_API_KEY;
  const LIST_ID = process.env.MAILCHIMP_LIST_ID;
  const DC = API_KEY.split('-')[1];

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
      FNAME:    firstName,
      PHQSCORE: String(phqScore),
      GADSCORE: String(gadScore),
      PHQLABEL: phqLabel,
      GADLABEL: gadLabel
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
        return res.status(200).json({ status: 'already_subscribed' });
      }
      return res.status(400).json(err);
    }

    const result = await response.json();
    return res.status(200).json({ status: 'subscribed', id: result.id });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
