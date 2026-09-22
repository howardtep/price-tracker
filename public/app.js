const searchInput = document.getElementById('search-input');
const suggestionsEl = document.getElementById('suggestions');
const resultEl = document.getElementById('result');
const resultThumb = document.getElementById('result-thumb');
const resultName = document.getElementById('result-name');
const resultPrice = document.getElementById('result-price');
const resultChange = document.getElementById('result-change');
const statusEl = document.getElementById('status');

let debounceTimer = null;
let activeIndex = -1;
let currentSuggestions = [];

function setStatus(message) {
  statusEl.textContent = message || '';
}

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
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Search failed');
    const coins = await res.json();
    renderSuggestions(coins);
    setStatus(coins.length ? '' : 'No coins found');
  } catch (err) {
    setStatus('Error searching coins');
    hideSuggestions();
  }
}

async function selectCoin(coin) {
  hideSuggestions();
  searchInput.value = coin.name;
  setStatus('Loading price...');
  resultEl.classList.add('hidden');

  try {
    const res = await fetch(`/api/price/${encodeURIComponent(coin.id)}`);
    if (!res.ok) throw new Error('Price fetch failed');
    const data = await res.json();

    if (typeof data.usd !== 'number') {
      setStatus('Price not available for this coin');
      return;
    }

    resultThumb.src = coin.thumb;
    resultName.textContent = `${coin.name} (${coin.symbol.toUpperCase()})`;
    resultPrice.textContent = `$${data.usd.toLocaleString(undefined, { maximumFractionDigits: 8 })}`;

    if (typeof data.usd_24h_change === 'number') {
      const change = data.usd_24h_change;
      resultChange.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}% (24h)`;
      resultChange.className = `result-change ${change >= 0 ? 'positive' : 'negative'}`;
    } else {
      resultChange.textContent = '';
    }

    resultEl.classList.remove('hidden');
    setStatus('');
  } catch (err) {
    setStatus('Error loading price');
  }
}

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
