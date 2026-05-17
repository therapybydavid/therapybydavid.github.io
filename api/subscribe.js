import { createHash } from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { firstName, email, phqScore, gadScore } = req.body;
  if (!firstName || !email || phqScore == null || gadScore == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const API_KEY = process.env.MAILCHIMP_API_KEY;
  const LIST_ID = process.env.MAILCHIMP_LIST_ID;
  const DC      = API_KEY.split('-')[1];
  const phq     = Number(phqScore);
  const gad     = Number(gadScore);

  // ─────────────────────────────────────────────────────────────
  // TIER LABELS
  // PHQ-9: 5 tiers (max 27)   GAD-7: 4 tiers (max 21)
  // ─────────────────────────────────────────────────────────────

  function phqLabel(s) {
    if (s >= 20) return 'Severe';
    if (s >= 15) return 'Moderately Severe';
    if (s >= 10) return 'Moderate';
    if (s >= 5)  return 'Mild';
    return 'Minimal';
  }

  function gadLabel(s) {
    if (s >= 15) return 'Severe';
    if (s >= 10) return 'Moderate';
    if (s >= 5)  return 'Mild';
    return 'Minimal';
  }

  // ─────────────────────────────────────────────────────────────
  // HTML HELPERS
  // ─────────────────────────────────────────────────────────────

  const BADGE_COLORS = {
    'Minimal':           'background-color:#ecfdf5;color:#065f46',
    'Mild':              'background-color:#fef3c7;color:#92400e',
    'Moderate':          'background-color:#fff7ed;color:#9a3412',
    'Moderately Severe': 'background-color:#fef2f2;color:#991b1b',
    'Severe':            'background-color:#fef2f2;color:#7f1d1d',
  };

  function badge(label, suffix) {
    const style = BADGE_COLORS[label] || BADGE_COLORS['Minimal'];
    return `<div style="display:inline-block;${style};font-size:11px;font-weight:bold;letter-spacing:.06em;padding:4px 14px;border-radius:100px;margin-bottom:18px;">${label} ${suffix}</div>`;
  }

  function scoreBar(score, max) {
    const pct  = Math.min(Math.round((score / max) * 100), 100);
    const rest = 100 - pct;
    const fR = rest > 0 ? '9px 0 0 9px' : '9px';
    const eR = pct  > 0 ? '0 9px 9px 0' : '9px';
    const filledCell = pct > 0
      ? `<td width="${pct}%" style="height:9px;background:linear-gradient(90deg,#3d9970,#c8960c,#d97706,#dc4a26,#c0392b);border-radius:${fR};font-size:0;">&nbsp;</td>`
      : '';
    const emptyCell = rest > 0
      ? `<td style="height:9px;background-color:#e8decc;border-radius:${eR};font-size:0;">&nbsp;</td>`
      : '';
    return [
      `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fbf8f1;border-radius:12px;margin-bottom:18px;">`,
      `<tr><td style="padding:18px 22px;">`,
      `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;"><tr>`,
      `<td style="font-size:12px;font-weight:bold;color:#101720;">Score</td>`,
      `<td align="right" style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:bold;color:#101720;">`,
      `${score} <span style="font-size:12px;color:#9ca3af;font-family:Arial,sans-serif;font-weight:normal;">/ ${max}</span>`,
      `</td></tr></table>`,
      `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;"><tr>${filledCell}${emptyCell}</tr></table>`,
      `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`,
      `<td style="font-size:9px;color:#6a6258;">Minimal</td>`,
      `<td align="center" style="font-size:9px;color:#6a6258;">Moderate</td>`,
      `<td align="right" style="font-size:9px;color:#6a6258;">Severe</td>`,
      `</tr></table>`,
      `<div style="font-size:10px;color:#9ca3af;margin-top:8px;">Most adults score below 5 on this scale.</div>`,
      `</td></tr></table>`,
    ].join('');
  }

  const P  = (t) => `<p style="font-size:14px;color:#6a6258;line-height:1.82;margin:0 0 14px 0;">${t}</p>`;
  const PL = (t) => `<p style="font-size:14px;color:#6a6258;line-height:1.82;margin:0;">${t}</p>`;
  const B  = (t) => `<strong style="color:#101720;font-weight:600;">${t}</strong>`;

  // ─────────────────────────────────────────────────────────────
  // PHQ-9 BODY  (score bar + badge + paragraphs)
  // ─────────────────────────────────────────────────────────────

  function phqBody(s) {
    const bar = scoreBar(s, 27);
    const bdg = badge(phqLabel(s), 'Depression');
    let   copy;

    if (s <= 4) {
      copy =
        P('Your responses indicate that depressive symptoms are either absent or occurring at a level that is not meaningfully disrupting your daily life. This is a clinically reassuring result.') +
        P('A minimal score does not suggest that everything is without difficulty. Many people seeking support at this level are doing so proactively &#8212; navigating a life transition, working through relational patterns, or simply wanting a structured space to think more clearly. These are legitimate and appropriate reasons for care.') +
        PL('Your clinician will use this baseline as a reference point over time. Tracking how scores shift across sessions is a meaningful part of monitoring progress and identifying early changes in functioning.');

    } else if (s <= 9) {
      copy =
        P('Your responses indicate a mild level of depressive symptoms &#8212; present and consistent enough to be clinically meaningful, but not yet at a level that significantly disrupts overall functioning.') +
        P('Mild depression often goes unnamed for a long time. The symptoms are real but manageable enough that most people continue to meet their obligations, which can create the impression that nothing is actually wrong. What tends to be missing at this level is not the ability to function &#8212; it is the ease of it. Things that used to feel natural start to require more effort. Recovery from stress takes longer. The margin for difficulty gets smaller.') +
        PL(`${B('Mild presentations are among the most responsive to early therapeutic intervention.')} Addressing symptoms at this stage &#8212; before patterns become more entrenched &#8212; significantly reduces the likelihood of progression. Your clinician will review these findings with you and discuss what a focused, practical approach to care could look like.`);

    } else if (s <= 14) {
      copy =
        P('Moderate depression rarely announces itself all at once. More often it builds quietly &#8212; a slow erosion of energy, interest, and the sense that things can actually get better. By the time most people take a screening like this one, they have been managing the weight of it for months, sometimes years, often without naming it.') +
        P(`A score in this range means your symptoms are real, consistent, and affecting how you function &#8212; not just occasionally, but as a pattern. This is not a reflection of how hard you are trying or how much willpower you have. Depression at this level changes how the brain processes reward, motivation, and future possibility. ${B('The belief that nothing will improve is itself a symptom, not a forecast.')}`) +
        P('The clinical picture at moderate depression typically involves more than low mood. It shows up in how you relate to people, how you respond to stress, how you talk to yourself when no one is listening, and how much of your day is spent simply getting through rather than actually living.') +
        PL('Moderate depression is among the most treatable presentations in outpatient therapy. The patterns that sustain it are identifiable &#8212; and with consistent, structured work, they change. This is not a permanent state.');

    } else if (s <= 19) {
      copy =
        P('Your responses indicate a moderately severe level of depressive symptoms &#8212; a range in which the impact on daily functioning is typically significant and consistent across multiple domains of life.') +
        P('At this level, depression is rarely limited to mood. It tends to affect sleep, concentration, energy, motivation, and the ability to engage with relationships or responsibilities in the way you would otherwise choose to. The experience of this level of depression is often one of significant depletion &#8212; not laziness, not weakness, but a system that is operating under substantial load.') +
        PL('This range warrants prompt and structured clinical attention. Research consistently shows that moderately severe depression responds well to structured outpatient therapy, and in some cases your clinician may discuss whether additional support &#8212; such as a psychiatric consultation &#8212; would be beneficial alongside therapy. You have already taken an important step by completing this screening.');

    } else {
      copy =
        P('Your responses indicate a severe level of depressive symptoms. This result reflects significant and wide-ranging impact on your ability to function, and it warrants your clinician\'s immediate attention.') +
        P(`Severe depression is not a reflection of personal failure or a permanent condition &#8212; it is a clinical presentation that requires structured, consistent care. At this level, the experience of depression often includes a diminished ability to believe that anything will improve. ${B('That belief is a symptom of the condition, not an accurate assessment of what is possible with appropriate treatment.')}`) +
        PL('Your clinician will prioritize a thorough review of your responses and will discuss with you what level of support is most appropriate at this time. If at any point before your appointment you are in crisis or feel unsafe, please contact the <strong>988 Suicide and Crisis Lifeline</strong> (call or text 988) or go to your nearest emergency room.');
    }

    return bar + bdg + copy;
  }

  // ─────────────────────────────────────────────────────────────
  // GAD-7 BODY  (score bar + badge + paragraphs)
  // ─────────────────────────────────────────────────────────────

  function gadBody(s) {
    const bar = scoreBar(s, 21);
    const bdg = badge(gadLabel(s), 'Anxiety');
    let   copy;

    if (s <= 4) {
      copy =
        P('Your responses indicate that anxiety symptoms are either absent or present at a level that is not currently causing meaningful disruption. This is a clinically low-acuity result.') +
        P('A minimal score here does not mean the absence of stress, tension, or worry &#8212; those are normal human experiences. What it does suggest is that your nervous system is not operating in a chronically activated state, and that anxiety is not currently a primary driver of distress for you.') +
        PL('Your clinician will note this baseline and revisit it across sessions. Anxiety levels can shift in response to life circumstances, and having an early reference point is clinically useful for tracking changes over time.');

    } else if (s <= 9) {
      copy =
        P('Your responses indicate a mild level of anxiety symptoms &#8212; present and recurring, but not yet at a level that is comprehensively disrupting your daily functioning.') +
        P('Mild anxiety tends to be experienced as a low-grade undercurrent rather than acute distress. It may show up as a difficulty fully relaxing, a tendency to anticipate problems, or a sense of restlessness that is hard to attribute to any one cause. At this level, most people are still functioning well outwardly &#8212; the cost is mostly internal.') +
        PL('Mild anxiety responds well to early, focused intervention. Your clinician will review these findings with you and discuss practical, targeted strategies that address the specific patterns showing up in your results.');

    } else if (s <= 14) {
      copy =
        P('A moderate anxiety score often reflects something a person has been living with long enough that it has started to feel normal. The nervous system at this level is not in crisis &#8212; it is chronically activated. There is a difference. Crisis passes. Chronic activation becomes the baseline, and over time that baseline quietly reorganizes everything around it.') +
        P(`At this level, anxiety is usually not the loud, obvious kind. It tends to look like diligence, preparation, or high standards. ${B('Most people at this level are identified by others as capable and reliable &#8212; the cost of that is mostly invisible.')}`) +
        P('Moderate anxiety becomes clinically significant when managing it starts to use more energy than the situations actually require. When you find yourself working harder to feel okay than the circumstances warrant, that is a signal worth paying attention to.') +
        PL('Anxiety at this level responds well to the right kind of work. The goal is not to eliminate worry &#8212; it is to reduce the noise so that your responses are proportional to what is actually in front of you.');

    } else {
      copy =
        P('Your responses indicate a severe level of anxiety symptoms &#8212; a range in which the nervous system is operating under significant and sustained activation, often with meaningful impact on concentration, sleep, physical wellbeing, and daily functioning.') +
        P('At this level, anxiety has typically moved well beyond worry. It tends to reorganize how a person moves through the day &#8212; what they avoid, how they make decisions, how much energy is consumed simply by managing internal experience. The functional cost is high, even when it is not fully visible to others.') +
        PL('This result warrants prompt and structured clinical attention. Severe anxiety is highly treatable with the right approach. Your clinician will review these results carefully and discuss with you what level of support is most appropriate, which may include consideration of adjunctive support such as psychiatric consultation.');
    }

    return bar + bdg + copy;
  }

  // ─────────────────────────────────────────────────────────────
  // COMORBIDITY BODY  (3 scenarios based on combined profile)
  // ElevatedBoth: PHQ >= 10 AND GAD >= 10
  // ElevatedOne:  exactly one >= 10
  // LowBoth:      both < 10
  // ─────────────────────────────────────────────────────────────

  function comboBody(phqS, gadS) {
    const phqElev = phqS >= 10;
    const gadElev = gadS >= 10;

    if (!phqElev && !gadElev) {
      return (
        P('Your depression and anxiety scores are both in the lower ranges of their respective scales. This means that neither is currently presenting as a primary clinical concern in terms of symptom severity.') +
        P('That said, depression and anxiety frequently co-occur &#8212; and even at lower levels, they can influence each other in ways that are worth understanding. Mild anxiety can quietly sustain patterns that erode mood over time. Low-grade depression can reduce the resilience available to manage everyday stress.') +
        PL('Your clinician will explore whether either area is worth addressing proactively as part of your overall care.')
      );
    }

    if (phqElev !== gadElev) {
      return (
        P('Your results show a meaningful elevation in one area alongside lower-range findings in the other. This pattern is clinically common &#8212; depression and anxiety do not always move in lockstep, and the leading presentation is worth understanding clearly before assuming the other area is not involved.') +
        P('Your clinician will use your individual scores to determine where to focus initial treatment while monitoring whether the secondary area shifts as the primary concern is addressed.') +
        PL('In many cases, targeted work on one area produces measurable movement in the other &#8212; because both draw from the same underlying patterns of avoidance, stress reactivity, and negative thought cycles.')
      );
    }

    // ElevatedBoth
    return [
      P('Your results show elevated scores in both areas &#8212; which is more common than most people realize. They are not two separate problems happening at the same time. In most cases, they are two expressions of the same underlying experience.'),
      P('Here is how the cycle typically works: anxiety keeps the nervous system activated and braced for what might go wrong. That constant state of alertness is exhausting. Over time, the exhaustion becomes depression &#8212; a shutting down of motivation and hope. Depression then makes it harder to take the actions that would reduce the anxiety. And the loop continues.'),
      P('The experience of living inside that cycle is often described as being simultaneously wound up and shut down &#8212; wanting to rest but unable to quiet the mind, wanting to act but unable to find the energy, wanting to connect but feeling too depleted to follow through.'),
      `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 20px;">`,
      `<tr>`,
      `<td width="48%" valign="top" style="background-color:#ffffff;border:1px solid #e8decc;border-radius:10px;padding:16px 18px;">`,
      `<div style="font-size:12px;font-weight:bold;color:#101720;margin-bottom:6px;">A common misconception</div>`,
      `<p style="font-size:13px;color:#6a6258;line-height:1.72;margin:0;">Many people assume you can't be anxious and depressed at the same time. Clinically, they are not opposites &#8212; they share the same root patterns: avoidance, negative thought loops, and a nervous system that has learned to stay on guard.</p>`,
      `</td>`,
      `<td width="4%">&nbsp;</td>`,
      `<td width="48%" valign="top" style="background-color:#ffffff;border:1px solid #e8decc;border-radius:10px;padding:16px 18px;">`,
      `<div style="font-size:12px;font-weight:bold;color:#101720;margin-bottom:6px;">What this means for treatment</div>`,
      `<p style="font-size:13px;color:#6a6258;line-height:1.72;margin:0;">Having both is not a sign that things are more complicated. It means there is a clear, shared target. Therapy that works at the root level tends to move both scores &#8212; because both are driven by the same underlying patterns.</p>`,
      `</td>`,
      `</tr></table>`,
      `<table width="100%" cellpadding="0" cellspacing="0" border="0">`,
      `<tr>`,
      `<td width="3" style="background-color:#d8b866;border-radius:2px;">&nbsp;</td>`,
      `<td width="14">&nbsp;</td>`,
      `<td style="background-color:#f5efe3;border-radius:0 10px 10px 0;padding:16px 18px;">`,
      `<p style="font-size:13px;color:#6a6258;line-height:1.78;margin:0;">${B('What often surprises people:')} when the anxiety begins to settle &#8212; when the nervous system stops running at a constant low-level alarm &#8212; the depression often lifts alongside it. Not because the depression wasn&#39;t real, but because a significant part of what was sustaining it was the depletion from managing anxiety that never fully turned off.</p>`,
      `</td>`,
      `</tr></table>`,
    ].join('');
  }

  // ─────────────────────────────────────────────────────────────
  // ASSEMBLE MERGE FIELDS
  // ─────────────────────────────────────────────────────────────

  const pl = phqLabel(phq);
  const gl = gadLabel(gad);

  const reportDate = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const mergeFields = {
    FNAME:      firstName,
    PHQSCORE:   String(phq),
    GADSCORE:   String(gad),
    PHQLABEL:   pl,
    GADLABEL:   gl,
    PHQBODY:    phqBody(phq),
    GADBODY:    gadBody(gad),
    COMBOBODY:  comboBody(phq, gad),
    REPORTDATE: reportDate,
  };

  // ─────────────────────────────────────────────────────────────
  // MAILCHIMP UPSERT
  // PUT /lists/{id}/members/{hash} creates-or-updates in one call,
  // so returning clients always get their latest scores written.
  // ─────────────────────────────────────────────────────────────

  const emailHash  = createHash('md5').update(email.toLowerCase()).digest('hex');
  const baseUrl    = `https://${DC}.api.mailchimp.com/3.0/lists/${LIST_ID}/members`;
  const authHeader = { Authorization: `apikey ${API_KEY}`, 'Content-Type': 'application/json' };

  try {
    const upsertRes = await fetch(`${baseUrl}/${emailHash}`, {
      method:  'PUT',
      headers: authHeader,
      body: JSON.stringify({
        email_address:  email,
        status_if_new:  'subscribed',
        merge_fields:   mergeFields,
      }),
    });

    const upsertData = await upsertRes.json();

    if (!upsertRes.ok) {
      return res.status(upsertRes.status).json(upsertData);
    }

    // Tags must be applied via a separate endpoint
    await fetch(`${baseUrl}/${emailHash}/tags`, {
      method:  'POST',
      headers: authHeader,
      body: JSON.stringify({
        tags: [`PHQ-${pl}`, `GAD-${gl}`].map(name => ({ name, status: 'active' })),
      }),
    });

    return res.status(200).json({ status: upsertData.status, id: upsertData.id });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
