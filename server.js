const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Proxy vers intervals.icu
app.all('/api*', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'No API key' });

  const path = req.path.replace('/api', '');
  const url = 'https://intervals.icu/api/v1/athlete/i552913' + path + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');

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
    const ct = r.headers.get('content-type') || '';
    if (req.method === 'DELETE') return res.json({ ok: true });
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

// Proxy vers Anthropic Claude
app.post('/claude', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée' });

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

app.get('/', (req, res) => res.json({ status: 'OB2G Proxy OK' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('OB2G Proxy running on port ' + PORT));
