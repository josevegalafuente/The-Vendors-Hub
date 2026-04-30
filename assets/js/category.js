(function () {
  const session = window.TVH_STORAGE.requireSession('manager');
  if (!session) return;

  const params = new URLSearchParams(window.location.search);
  const stateCode = params.get('state');
  const serviceId = params.get('service');
  const state = window.TVH_DATA.stateByCode(stateCode);
  const service = window.TVH_DATA.serviceById(serviceId);
  const title = document.querySelector('#categoryTitle');
  const subtitle = document.querySelector('#categorySubtitle');
  const vendorList = document.querySelector('#vendorList');
  const backToMarket = document.querySelector('#backToMarket');
  const logoutButton = document.querySelector('#logoutButton');

  function getCoverageSummary(vendor) {
    const area = vendor.coverage.find(item => item.state === stateCode);
    if (!area) return 'Coverage not specified';
    const counties = area.counties.map(county => county.name).join(', ');
    return counties ? `Covers ${counties}` : `Covers ${state.name}`;
  }

  function renderVendors() {
    if (!state || !service) {
      title.textContent = 'Category not found';
      subtitle.textContent = 'Please return to the market page and select a valid service category.';
      vendorList.innerHTML = '<a class="primary-button" href="manager-dashboard.html">Back to all markets</a>';
      return;
    }

    backToMarket.href = `market.html?state=${state.code}`;
    title.textContent = `${service.name} in ${state.name}`;
    subtitle.textContent = 'Only vendors who have registered this service and coverage market appear here.';

    const vendors = window.TVH_STORAGE.getVendorsByStateAndService(state.code, service.id);

    if (vendors.length === 0) {
      vendorList.innerHTML = `
        <div class="empty-state">
          <h2>No registered vendors yet</h2>
          <p>There are currently no vendors offering ${service.name} in ${state.name}. Once vendors register and select this market, they will appear here automatically.</p>
          <a class="secondary-button" href="market.html?state=${state.code}">Back to ${state.name} market</a>
        </div>
      `;
      return;
    }

    vendorList.innerHTML = vendors.map(vendor => `
      <article class="vendor-result-card">
        <div class="vendor-avatar ${vendor.profilePhoto ? 'has-photo' : ''}" style="${vendor.profilePhoto ? `background-image:url('${vendor.profilePhoto}')` : ''}">
          ${vendor.profilePhoto ? '' : vendor.businessName.slice(0, 1).toUpperCase()}
        </div>
        <div class="vendor-result-content">
          <div class="vendor-result-topline">
            <h2>${vendor.businessName}</h2>
            <span>${vendor.services.length} ${vendor.services.length === 1 ? 'service' : 'services'}</span>
          </div>
          <p>${vendor.about || service.description}</p>
          <div class="meta-line">
            <span>${getCoverageSummary(vendor)}</span>
            <span>${vendor.phone}</span>
            <span>${vendor.email}</span>
          </div>
        </div>
        <a class="primary-button small" href="vendor-profile.html?id=${vendor.id}&state=${state.code}&service=${service.id}">View profile</a>
      </article>
    `).join('');
  }

  logoutButton.addEventListener('click', window.TVH_STORAGE.logout);
  renderVendors();
})();
