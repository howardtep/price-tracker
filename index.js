const express = require('express');
const path = require('path');

const app = express();
const port = 3000;

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

app.use(express.static(path.join(__dirname, 'public')));

// Search coins by name or symbol
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter "q"' });
  }

  try {
    const response = await fetch(`${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch search results' });
    }
    const data = await response.json();
    const coins = data.coins.slice(0, 10).map((coin) => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol,
      thumb: coin.thumb,
    }));
    res.json(coins);
  } catch (err) {
    res.status(500).json({ error: 'Search request failed' });
  }
});

// Get price(s) for one or more coin ids in a given currency
// GET /api/price?ids=bitcoin,ethereum&vs_currency=usd
app.get('/api/price', async (req, res) => {
  const { ids, vs_currency = 'usd' } = req.query;
  if (!ids) {
    return res.status(400).json({ error: 'Missing query parameter "ids"' });
  }

  try {
    const response = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(
        vs_currency
      )}&include_24hr_change=true`
    );
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch price' });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Price request failed' });
  }
});

// Get historical price data for a coin
// GET /api/history/:id?vs_currency=usd&days=7
app.get('/api/history/:id', async (req, res) => {
  const { id } = req.params;
  const { vs_currency = 'usd', days = 7 } = req.query;

  try {
    const response = await fetch(
      `${COINGECKO_BASE}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${encodeURIComponent(
        vs_currency
      )}&days=${encodeURIComponent(days)}`
    );
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch history' });
    }
    const data = await response.json();
    res.json({ prices: data.prices });
  } catch (err) {
    res.status(500).json({ error: 'History request failed' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
