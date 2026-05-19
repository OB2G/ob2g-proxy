const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const JSONBIN_KEY = process.env.JSONBIN_KEY;
const JSONBIN_ID = process.env.JSONBIN_ID;
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_ID}`;

async function readHealth() {
  try {
    const r = await fetch(JSONBIN_URL + '/latest', {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    const data = await r.json();
    return data.record || {};
  } catch(e) {
    console.error('JSONBin read error:', e.message);
    return {};
  }
}

async function writeHealth(data) {
  try {
    await fetch(JSONBIN_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_KEY
      },
      body: JSON.stringify(data)
    });
  } catch(e) {
    console.error('JSONBin write error:', e.message);
  }
}

// ── Proxy Intervals.icu ──
app.all('/api*', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'No API key' });

  const path = req.path.replace('/api', '');
  const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const url = 'https://intervals.icu/api/v1/athlete/i552913' + path + qs;

  try {
    const opts = {
      method: req.method,
      headers: {
        'Authorization': 'Basic ' + Buffer.from('API_KEY:' + apiKey).toString('base64'),
        'Content-Type': 'application/json'
      }
    };
    if (['POST','PUT'].includes(req.method) && req.body) {
      opts.body = JSON.stringify(req.body);
    }
    const r = await fetch(url, opts);
    if (req.method === 'DELETE') return res.json({ ok: true });
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('json')) {
      const data = await r.json();
      res.status(r.status).json(data);
    } else {
      const text = await r.text();
      res.status(r.status).send(text);
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Proxy Claude ──
app.post('/claude', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Réception données Apple Santé ──
app.post('/health', async (req, res) => {
  try {
    const data = req.body;
    const today = new Date().toISOString().split('T')[0];
    const existing = await readHealth();
    const parsed = { date: today };

    const metrics = data.data?.metrics || data.metrics || [];
    metrics.forEach(metric => {
      const name = (metric.name || metric.type || '').toLowerCase();
      const points = metric.data || metric.points || [];
      if (!points.length) return;
      const latest = points[points.length - 1];
      const val = latest.qty ?? latest.value ?? latest.Qty ?? 0;

      if (name.includes('sleep'))                                                parsed.sleep_hours = Math.round(val * 10) / 10;
      else if (name.includes('resting_heart') || name.includes('resting heart')) parsed.resting_hr  = Math.round(val);
      else if (name.includes('heart_rate_variability') || name.includes('hrv'))  parsed.hrv         = Math.round(val);
      else if (name.includes('systolic'))                                         parsed.systolic    = Math.round(val);
      else if (name.includes('diastolic'))                                        parsed.diastolic   = Math.round(val);
      else if (name.includes('step'))                                             parsed.steps       = Math.round(val);
      else if (name.includes('body_mass') || name.includes('weight'))            parsed.weight      = Math.round(val * 10) / 10;
      else if (name.includes('active_energy') || name.includes('active energy')) parsed.calories    = Math.round(val);
    });

    const merged = existing.date === today ? { ...existing, ...parsed } : parsed;
    await writeHealth(merged);

    console.log('Health saved to JSONBin:', merged);
    res.json({ ok: true, received: parsed });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Lecture données santé ──
app.get('/health', async (req, res) => {
  const data = await readHealth();
  res.json(data);
});

// ── Status ──
app.get('/', async (req, res) => {
  const health = await readHealth();
  res.json({
    status: 'OB2G Proxy OK',
    health_data: Object.keys(health).length > 1 ? 'present' : 'empty',
    health_date: health.date || null
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('OB2G Proxy running on port ' + PORT));
