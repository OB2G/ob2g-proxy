const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

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

// ── Réception données Apple Santé (Health Auto Export) ──
let healthStore = {};

app.post('/health', (req, res) => {
  try {
    const data = req.body;
    const today = new Date().toISOString().split('T')[0];

    // Health Auto Export envoie un tableau de métriques
    const metrics = data.data?.metrics || data.metrics || [];

    const parsed = { date: today };

    metrics.forEach(metric => {
      const name = metric.name || metric.type || '';
      const points = metric.data || metric.points || [];
      if (!points.length) return;
      const latest = points[points.length - 1];
      const val = latest.qty || latest.value || latest.Qty || 0;

      if (name.includes('sleep') || name.includes('Sleep')) {
        parsed.sleep_hours = Math.round(val * 10) / 10;
      } else if (name.includes('resting_heart') || name.includes('Resting Heart')) {
        parsed.resting_hr = Math.round(val);
      } else if (name.includes('heart_rate_variability') || name.includes('HRV')) {
        parsed.hrv = Math.round(val);
      } else if (name.includes('blood_pressure_systolic') || name.includes('Systolic')) {
        parsed.systolic = Math.round(val);
      } else if (name.includes('blood_pressure_diastolic') || name.includes('Diastolic')) {
        parsed.diastolic = Math.round(val);
      } else if (name.includes('step') || name.includes('Step')) {
        parsed.steps = Math.round(val);
      } else if (name.includes('body_mass') || name.includes('Weight')) {
        parsed.weight = Math.round(val * 10) / 10;
      } else if (name.includes('active_energy') || name.includes('Active Energy')) {
        parsed.calories = Math.round(val);
      }
    });

    healthStore = { ...healthStore, ...parsed };
    console.log('Health data received:', parsed);
    res.json({ ok: true, received: parsed });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Lecture données santé par l'app ──
app.get('/health', (req, res) => {
  res.json(healthStore);
});

// ── Status ──
app.get('/', (req, res) => res.json({ status: 'OB2G Proxy OK', health: Object.keys(healthStore).length > 0 }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('OB2G Proxy running on port ' + PORT));
