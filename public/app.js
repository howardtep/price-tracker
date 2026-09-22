// --- API layer (Express proxy version) ---
const api = {
  search: (query) => fetch(`/api/search?q=${encodeURIComponent(query)}`).then(checkOk),
  price: (ids, currency) =>
    fetch(`/api/price?ids=${encodeURIComponent(ids)}&vs_currency=${encodeURIComponent(currency)}`).then(checkOk),
  history: (id, currency, days) =>
    fetch(`/api/history/${encodeURIComponent(id)}?vs_currency=${encodeURIComponent(currency)}&days=${days}`).then(
      checkOk
    ),
};

function checkOk(res) {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

const CURRENCIES = ['usd', 'eur', 'gbp', 'jpy', 'aud', 'cad', 'chf', 'cny', 'inr', 'krw', 'btc', 'eth'];
const CURRENCY_SYMBOLS = {
  usd: '$',
  eur: '€',
  gbp: '£',
  jpy: '¥',
  aud: 'A$',
  cad: 'C$',
  chf: 'CHF ',
  cny: '¥',
  inr: '₹',
  krw: '₩',
};

const FAVORITES_KEY = 'crypto-favorites';
const CURRENCY_KEY = 'crypto-currency';

const state = {
  currency: localStorage.getItem(CURRENCY_KEY) || 'usd',
  favorites: loadFavorites(),
  currentCoin: null,
  currentDays: 7,
  chart: null,
};

// --- Elements ---
const currencySelect = document.getElementById('currency-select');
const tabButtons = document.querySelectorAll('.tab-btn');
const searchPanel = document.getElementById('search-panel');
const favoritesPanel = document.getElementById('favorites-panel');
const favoritesList = document.getElementById('favorites-list');
const favoritesEmpty = document.getElementById('favorites-empty');

const searchInput = document.getElementById('search-input');
const suggestionsEl = document.getElementById('suggestions');

const resultEl = document.getElementById('result');
const resultThumb = document.getElementById('result-thumb');
const resultName = document.getElementById('result-name');
const resultPrice = document.getElementById('result-price');
const resultChange = document.getElementById('result-change');
const favoriteBtn = document.getElementById('favorite-btn');
const rangeButtons = document.querySelectorAll('.range-btn');
const chartCanvas = document.getElementById('price-chart');
const chartStatusEl = document.getElementById('chart-status');

const statusEl = document.getElementById('status');

let debounceTimer = null;
let activeIndex = -1;
let currentSuggestions = [];

// --- Helpers ---
function setStatus(message) {
  statusEl.textContent = message || '';
}

function setChartStatus(message) {
  chartStatusEl.textContent = message || '';
}

function formatPrice(value, currency) {
  if (currency === 'btc' || currency === 'eth') {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${currency.toUpperCase()}`;
  }
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency.toUpperCase()} `;
  const maxDigits = value < 1 ? 6 : 2;
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: maxDigits })}`;
}

function formatChartLabel(timestampMs, days) {
  const date = new Date(timestampMs);
  if (days <= 1) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days <= 90) return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return date.toLocaleDateString([], { month: 'short', year: 'numeric' });
}

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
}

function isFavorite(id) {
  return state.favorites.some((f) => f.id === id);
}

function toggleFavorite(coin) {
  if (isFavorite(coin.id)) {
    state.favorites = state.favorites.filter((f) => f.id !== coin.id);
  } else {
    state.favorites.push({ id: coin.id, name: coin.name, symbol: coin.symbol, thumb: coin.thumb });
  }
  saveFavorites();
  updateFavoriteButton();
  if (!favoritesPanel.classList.contains('hidden')) {
    renderFavoritesList();
  }
}

function updateFavoriteButton() {
  if (!state.currentCoin) return;
  const active = isFavorite(state.currentCoin.id);
  favoriteBtn.textContent = active ? '★' : '☆';
  favoriteBtn.classList.toggle('active', active);
  favoriteBtn.title = active ? 'Remove from favorites' : 'Add to favorites';
}

// --- Currency select ---
function initCurrencySelect() {
  currencySelect.innerHTML = CURRENCIES.map(
    (c) => `<option value="${c}" ${c === state.currency ? 'selected' : ''}>${c.toUpperCase()}</option>`
  ).join('');
}

currencySelect.addEventListener('change', () => {
  state.currency = currencySelect.value;
  localStorage.setItem(CURRENCY_KEY, state.currency);
  if (state.currentCoin) {
    loadPrice(state.currentCoin);
    loadHistory(state.currentCoin);
  }
  if (!favoritesPanel.classList.contains('hidden')) {
    renderFavoritesList();
  }
});

// --- Tabs ---
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
    const tab = btn.dataset.tab;
    searchPanel.classList.toggle('hidden', tab !== 'search');
    favoritesPanel.classList.toggle('hidden', tab !== 'favorites');
    if (tab === 'favorites') {
      renderFavoritesList();
    }
  });
});

// --- Favorites list rendering ---
async function renderFavoritesList() {
  if (!state.favorites.length) {
    favoritesList.innerHTML = '';
    favoritesEmpty.classList.remove('hidden');
    return;
  }
  favoritesEmpty.classList.add('hidden');
  favoritesList.innerHTML = state.favorites
    .map(
      (f) => `
      <li data-id="${f.id}">
        <img src="${f.thumb}" alt="" />
        <div>
          <div class="fav-name">${f.name}</div>
          <div class="fav-symbol">${f.symbol}</div>
        </div>
        <div class="fav-right">
          <div class="fav-price" id="fav-price-${f.id}">…</div>
          <div class="fav-change" id="fav-change-${f.id}"></div>
        </div>
      </li>
    `
    )
    .join('');

  favoritesList.querySelectorAll('li').forEach((li) => {
    li.addEventListener('click', () => {
      const coin = state.favorites.find((f) => f.id === li.dataset.id);
      if (coin) selectCoin(coin);
    });
  });

  try {
    const ids = state.favorites.map((f) => f.id).join(',');
    const data = await api.price(ids, state.currency);
    state.favorites.forEach((f) => {
      const priceEl = document.getElementById(`fav-price-${f.id}`);
      const changeEl = document.getElementById(`fav-change-${f.id}`);
      const coinData = data[f.id];
      if (!priceEl || !changeEl) return;
      if (!coinData || typeof coinData[state.currency] !== 'number') {
        priceEl.textContent = 'n/a';
        changeEl.textContent = '';
        return;
      }
      priceEl.textContent = formatPrice(coinData[state.currency], state.currency);
      const change = coinData[`${state.currency}_24h_change`];
      if (typeof change === 'number') {
        changeEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        changeEl.className = `fav-change ${change >= 0 ? 'positive' : 'negative'}`;
        changeEl.style.color = change >= 0 ? 'var(--green)' : 'var(--red)';
      }
    });
  } catch (err) {
    // leave placeholders on failure
  }
}

// --- Search ---
function hideSuggestions() {
  suggestionsEl.classList.add('hidden');
  suggestionsEl.innerHTML = '';
  activeIndex = -1;
}

function renderSuggestions(coins) {
  currentSuggestions = coins;
  activeIndex = -1;

  if (!coins.length) {
    hideSuggestions();
    return;
  }

  suggestionsEl.innerHTML = coins
    .map(
      (coin, i) => `
      <li data-index="${i}" data-id="${coin.id}">
        <img src="${coin.thumb}" alt="" />
        <span>${coin.name}</span>
        <span class="coin-symbol">${coin.symbol}</span>
      </li>
    `
    )
    .join('');

  suggestionsEl.classList.remove('hidden');
}

async function searchCoins(query) {
  setStatus('Searching...');
  try {
    const coins = await api.search(query);
    renderSuggestions(coins);
    setStatus(coins.length ? '' : 'No coins found');
  } catch (err) {
    setStatus('Error searching coins');
    hideSuggestions();
  }
}

// --- Coin detail (price + chart) ---
async function selectCoin(coin) {
  hideSuggestions();
  state.currentCoin = coin;
  searchInput.value = coin.name;
  resultThumb.src = coin.thumb;
  resultName.textContent = `${coin.name} (${coin.symbol.toUpperCase()})`;
  resultPrice.textContent = '';
  resultChange.textContent = '';
  resultEl.classList.remove('hidden');
  updateFavoriteButton();

  await Promise.all([loadPrice(coin), loadHistory(coin)]);
}

async function loadPrice(coin) {
  setStatus('Loading price...');
  try {
    const data = await api.price(coin.id, state.currency);
    const coinData = data[coin.id];
    if (!coinData || typeof coinData[state.currency] !== 'number') {
      setStatus('Price not available for this coin/currency');
      return;
    }
    resultPrice.textContent = formatPrice(coinData[state.currency], state.currency);
    const change = coinData[`${state.currency}_24h_change`];
    if (typeof change === 'number') {
      resultChange.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}% (24h)`;
      resultChange.className = `result-change ${change >= 0 ? 'positive' : 'negative'}`;
    } else {
      resultChange.textContent = '';
    }
    setStatus('');
  } catch (err) {
    setStatus('Error loading price');
  }
}

async function loadHistory(coin) {
  setChartStatus('Loading chart...');
  try {
    const data = await api.history(coin.id, state.currency, state.currentDays);
    renderChart(data.prices, state.currentDays);
    setChartStatus('');
  } catch (err) {
    setChartStatus('Error loading chart');
  }
}

function renderChart(prices, days) {
  const labels = prices.map((p) => formatChartLabel(p[0], days));
  const values = prices.map((p) => p[1]);

  if (state.chart) {
    state.chart.destroy();
  }

  state.chart = new Chart(chartCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: '#4f8cff',
          backgroundColor: 'rgba(79, 140, 255, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatPrice(ctx.parsed.y, state.currency),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#9aa1ac', maxTicksLimit: 6, autoSkip: true },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: '#9aa1ac',
            callback: (value) => formatPrice(value, state.currency),
          },
          grid: { color: '#2a2e37' },
        },
      },
    },
  });
}

// --- Event listeners ---
favoriteBtn.addEventListener('click', () => {
  if (state.currentCoin) toggleFavorite(state.currentCoin);
});

rangeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    rangeButtons.forEach((b) => b.classList.toggle('active', b === btn));
    state.currentDays = Number(btn.dataset.days);
    if (state.currentCoin) loadHistory(state.currentCoin);
  });
});

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();
  clearTimeout(debounceTimer);

  if (!query) {
    hideSuggestions();
    setStatus('');
    return;
  }

  debounceTimer = setTimeout(() => searchCoins(query), 300);
});

suggestionsEl.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const coin = currentSuggestions[Number(li.dataset.index)];
  if (coin) selectCoin(coin);
});

searchInput.addEventListener('keydown', (e) => {
  if (suggestionsEl.classList.contains('hidden')) return;

  const items = suggestionsEl.querySelectorAll('li');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIndex >= 0 && currentSuggestions[activeIndex]) {
      selectCoin(currentSuggestions[activeIndex]);
    }
    return;
  } else if (e.key === 'Escape') {
    hideSuggestions();
    return;
  } else {
    return;
  }

  items.forEach((item, i) => item.classList.toggle('active', i === activeIndex));
  items[activeIndex]?.scrollIntoView({ block: 'nearest' });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box')) {
    hideSuggestions();
  }
});

// --- Init ---
initCurrencySelect();
