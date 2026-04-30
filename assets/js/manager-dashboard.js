(function () {
  const session = window.TVH_STORAGE.requireSession('manager');
  if (!session) return;

  const marketsGrid = document.querySelector('#marketsGrid');
  const marketSearch = document.querySelector('#marketSearch');
  const logoutButton = document.querySelector('#logoutButton');
  const totalMarkets = document.querySelector('#totalMarkets');
  const totalVendors = document.querySelector('#totalVendors');

  function countVendorsForState(stateCode) {
    return window.TVH_STORAGE.getVendorsByState(stateCode).length;
  }

  function renderMarkets(filter = '') {
    const term = filter.trim().toLowerCase();
    const states = window.TVH_DATA.states.filter(state => {
      return state.name.toLowerCase().includes(term) || state.code.toLowerCase().includes(term);
    });

    marketsGrid.innerHTML = states.map(state => {
      const count = countVendorsForState(state.code);
      return `
        <article class="market-card">
          <div class="market-code">${state.code}</div>
          <div>
            <h2>${state.name}</h2>
            <p>${count} registered ${count === 1 ? 'vendor' : 'vendors'}</p>
          </div>
          <a class="primary-button small" href="market.html?state=${state.code}">Browse market</a>
        </article>
      `;
    }).join('');

    if (states.length === 0) {
      marketsGrid.innerHTML = '<div class="empty-state">No markets match your search.</div>';
    }
  }

  function updateStats() {
    totalMarkets.textContent = window.TVH_DATA.states.length;
    totalVendors.textContent = window.TVH_STORAGE.getPublicVendors().length;
  }

  marketSearch.addEventListener('input', () => renderMarkets(marketSearch.value));
  logoutButton.addEventListener('click', window.TVH_STORAGE.logout);

  updateStats();
  renderMarkets();
})();
