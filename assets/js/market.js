(function () {
  const session = window.TVH_STORAGE.requireSession('manager');
  if (!session) return;

  const params = new URLSearchParams(window.location.search);
  const stateCode = params.get('state');
  const state = window.TVH_DATA.stateByCode(stateCode);
  const categoryGrid = document.querySelector('#categoryGrid');
  const marketTitle = document.querySelector('#marketTitle');
  const marketSubtitle = document.querySelector('#marketSubtitle');
  const marketStats = document.querySelector('#marketStats');
  const logoutButton = document.querySelector('#logoutButton');

  if (!state) {
    marketTitle.textContent = 'Market not found';
    marketSubtitle.textContent = 'Please return to all markets and select a valid state.';
    categoryGrid.innerHTML = '<a class="primary-button" href="manager-dashboard.html">Back to all markets</a>';
    return;
  }

  function groupedServices() {
    const groups = new Map();
    window.TVH_DATA.services.forEach(service => {
      if (!groups.has(service.group)) groups.set(service.group, []);
      groups.get(service.group).push(service);
    });
    return groups;
  }

  function renderMarket() {
    const vendorsInState = window.TVH_STORAGE.getVendorsByState(state.code);
    marketTitle.textContent = `${state.name} Market`;
    marketSubtitle.textContent = 'Choose a service category to see vendors registered for this market.';
    marketStats.innerHTML = `
      <span>${vendorsInState.length} registered ${vendorsInState.length === 1 ? 'vendor' : 'vendors'}</span>
      <span>${window.TVH_DATA.services.length} service categories</span>
    `;

    categoryGrid.innerHTML = Array.from(groupedServices().entries()).map(([group, services]) => `
      <section class="service-category-section">
        <h2>${group}</h2>
        <div class="category-card-grid">
          ${services.map(service => {
            const count = window.TVH_STORAGE.getServiceCountByState(state.code, service.id);
            return `
              <a class="category-card" href="category.html?state=${state.code}&service=${service.id}">
                <span class="category-count">${count}</span>
                <h3>${service.name}</h3>
                <p>${service.description}</p>
                <small>${count === 1 ? '1 vendor available' : `${count} vendors available`}</small>
              </a>
            `;
          }).join('')}
        </div>
      </section>
    `).join('');
  }

  logoutButton.addEventListener('click', window.TVH_STORAGE.logout);
  renderMarket();
})();
