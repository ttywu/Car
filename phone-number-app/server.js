require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  APP_PASSWORD,
  PUBLIC_URL = '',
  PORT = 3000,
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !APP_PASSWORD) {
  console.error('Missing settings. Copy .env.example to .env and fill in TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and APP_PASSWORD.');
  process.exit(1);
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const publicUrl = PUBLIC_URL.replace(/\/$/, '');
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// --- Tiny JSON store for incoming texts and voicemails ---
const DATA_FILE = path.join(__dirname, 'data.json');
function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { messages: [], voicemails: [] };
  }
}
function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Twilio webhooks (no password; checked with Twilio's signature instead) ---
function twilioOnly(req, res, next) {
  if (!publicUrl) return next();
  return twilio.webhook(TWILIO_AUTH_TOKEN, { url: publicUrl + req.originalUrl })(req, res, next);
}

app.post('/twilio/sms', twilioOnly, (req, res) => {
  const data = load();
  data.messages.unshift({
    id: req.body.MessageSid,
    direction: 'in',
    from: req.body.From,
    to: req.body.To,
    body: req.body.Body || '',
    date: new Date().toISOString(),
  });
  save(data);
  res.type('text/xml').send(new twilio.twiml.MessagingResponse().toString());
});

app.post('/twilio/voice', twilioOnly, (req, res) => {
  const vr = new twilio.twiml.VoiceResponse();
  vr.say('Hi. Please leave a message after the beep.');
  vr.record({
    maxLength: 120,
    playBeep: true,
    recordingStatusCallback: `${publicUrl}/twilio/recording`,
    recordingStatusCallbackMethod: 'POST',
  });
  vr.say('Goodbye.');
  res.type('text/xml').send(vr.toString());
});

app.post('/twilio/recording', twilioOnly, async (req, res) => {
  let from = '';
  let to = '';
  try {
    const call = await client.calls(req.body.CallSid).fetch();
    from = call.from;
    to = call.to;
  } catch {}
  const data = load();
  data.voicemails.unshift({
    id: req.body.RecordingSid,
    from,
    to,
    seconds: Number(req.body.RecordingDuration || 0),
    date: new Date().toISOString(),
  });
  save(data);
  res.sendStatus(204);
});

// --- Everything below needs the app password ---
app.use((req, res, next) => {
  const [type, value] = (req.headers.authorization || '').split(' ');
  if (type === 'Basic' && value) {
    const pass = Buffer.from(value, 'base64').toString().split(':').slice(1).join(':');
    if (pass === APP_PASSWORD) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="My Phone"').status(401).send('Password needed');
});

app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => res.status(400).json({ error: err.message }));

// Find numbers you can buy
app.get('/api/available', wrap(async (req, res) => {
  const country = (req.query.country || 'US').toUpperCase();
  const opts = { limit: 20, smsEnabled: true };
  if (req.query.areaCode) opts.areaCode = Number(req.query.areaCode);
  const list = await client.availablePhoneNumbers(country).local.list(opts);
  res.json(list.map((n) => ({ number: n.phoneNumber, nice: n.friendlyName, place: [n.locality, n.region].filter(Boolean).join(', ') })));
}));

// Buy a number and point its texts and calls at this app
app.post('/api/buy', wrap(async (req, res) => {
  const opts = { phoneNumber: req.body.number };
  if (publicUrl) {
    opts.smsUrl = `${publicUrl}/twilio/sms`;
    opts.voiceUrl = `${publicUrl}/twilio/voice`;
  }
  const n = await client.incomingPhoneNumbers.create(opts);
  res.json({ number: n.phoneNumber, linked: Boolean(publicUrl) });
}));

// Numbers you own
app.get('/api/numbers', wrap(async (req, res) => {
  const list = await client.incomingPhoneNumbers.list({ limit: 50 });
  res.json({
    publicUrl,
    numbers: list.map((n) => ({
      sid: n.sid,
      number: n.phoneNumber,
      nice: n.friendlyName,
      linked: Boolean(publicUrl) && n.smsUrl === `${publicUrl}/twilio/sms`,
    })),
  });
}));

// Re-link a number to this app (e.g. after PUBLIC_URL changed)
app.post('/api/numbers/:sid/link', wrap(async (req, res) => {
  if (!publicUrl) throw new Error('Set PUBLIC_URL first, then restart the app.');
  await client.incomingPhoneNumbers(req.params.sid).update({
    smsUrl: `${publicUrl}/twilio/sms`,
    voiceUrl: `${publicUrl}/twilio/voice`,
  });
  res.json({ ok: true });
}));

// Give a number back (stops the monthly cost)
app.delete('/api/numbers/:sid', wrap(async (req, res) => {
  await client.incomingPhoneNumbers(req.params.sid).remove();
  res.json({ ok: true });
}));

// Send a text
app.post('/api/send', wrap(async (req, res) => {
  const { from, to, body } = req.body;
  const msg = await client.messages.create({ from, to, body });
  const data = load();
  data.messages.unshift({ id: msg.sid, direction: 'out', from, to, body, date: new Date().toISOString() });
  save(data);
  res.json({ ok: true });
}));

// Inbox
app.get('/api/inbox', (req, res) => res.json(load()));

// Play a voicemail (proxied so your Twilio login stays secret)
app.get('/api/voicemail/:sid.mp3', wrap(async (req, res) => {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Recordings/${encodeURIComponent(req.params.sid)}.mp3`;
  const r = await fetch(url, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64') },
  });
  if (!r.ok) throw new Error('Voicemail not found');
  res.type('audio/mpeg').send(Buffer.from(await r.arrayBuffer()));
}));

app.listen(PORT, () => {
  console.log(`My Phone is running: http://localhost:${PORT}`);
  if (!publicUrl) console.log('Note: PUBLIC_URL is empty, so you can send texts but not receive them yet.');
});
