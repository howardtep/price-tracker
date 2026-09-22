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

// Get USD price for a coin by id
app.get('/api/price/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const response = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`
    );
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch price' });
    }
    const data = await response.json();
    if (!data[id]) {
      return res.status(404).json({ error: 'Coin not found' });
    }
    res.json({
      id,
      usd: data[id].usd,
      usd_24h_change: data[id].usd_24h_change,
    });
  } catch (err) {
    res.status(500).json({ error: 'Price request failed' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
