(function () {
  const session = window.TVH_STORAGE.requireSession('vendor');
  if (!session) return;

  let vendor = window.TVH_STORAGE.getVendorByUserId(session.userId);
  if (!vendor) {
    vendor = {
      id: window.TVH_STORAGE.uid('vendor'),
      userId: session.userId,
      businessName: '',
      contactName: '',
      email: session.email,
      phone: '',
      website: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      about: '',
      profilePhoto: '',
      services: [],
      coverage: [],
      reviews: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    window.TVH_STORAGE.upsertVendor(vendor);
  }

  const form = document.querySelector('#vendorProfileForm');
  const serviceGrid = document.querySelector('#serviceGrid');
  const coverageList = document.querySelector('#coverageList');
  const stateSelect = document.querySelector('#coverageState');
  const stateMap = document.querySelector('#stateMap');
  const addCoverageButton = document.querySelector('#addCoverageButton');
  const saveMessage = document.querySelector('#saveMessage');
  const completionStatus = document.querySelector('#completionStatus');
  const photoInput = document.querySelector('#profilePhoto');
  const photoPreview = document.querySelector('#photoPreview');
  const logoutButton = document.querySelector('#logoutButton');

  function fillStateSelects() {
    const stateOptions = window.TVH_DATA.states.map(state => `<option value="${state.code}">${state.name}</option>`).join('');
    document.querySelector('#state').innerHTML = `<option value="">Select a state</option>${stateOptions}`;
    stateSelect.innerHTML = `<option value="">Select a state</option>${stateOptions}`;
  }

  function groupedServices() {
    const groups = new Map();
    window.TVH_DATA.services.forEach(service => {
      if (!groups.has(service.group)) groups.set(service.group, []);
      groups.get(service.group).push(service);
    });
    return groups;
  }

  function renderServices() {
    const html = Array.from(groupedServices().entries()).map(([group, services]) => `
      <section class="service-group-card">
        <h3>${group}</h3>
        <div class="checkbox-grid">
          ${services.map(service => `
            <label class="checkbox-card">
              <input type="checkbox" name="services" value="${service.id}" ${vendor.services.includes(service.id) ? 'checked' : ''}>
              <span>
                <strong>${service.name}</strong>
                <small>${service.description}</small>
              </span>
            </label>
          `).join('')}
        </div>
      </section>
    `).join('');

    serviceGrid.innerHTML = html;
  }

  function renderStateMap() {
    const coveredStates = new Set((vendor.coverage || []).map(area => area.state));
    stateMap.innerHTML = window.TVH_DATA.states.map(state => `
      <button type="button" class="state-pill ${coveredStates.has(state.code) ? 'is-covered' : ''}" data-state="${state.code}">
        <span>${state.code}</span>
        <small>${state.name}</small>
      </button>
    `).join('');

    stateMap.querySelectorAll('[data-state]').forEach(button => {
      button.addEventListener('click', () => {
        stateSelect.value = button.dataset.state;
        document.querySelector('#coverageCounty').focus();
      });
    });
  }

  function renderCoverage() {
    if (!vendor.coverage || vendor.coverage.length === 0) {
      coverageList.innerHTML = '<div class="empty-state compact">No coverage areas saved yet. Add at least one state, county, and city group.</div>';
      renderStateMap();
      return;
    }

    coverageList.innerHTML = vendor.coverage.map((area, index) => {
      const state = window.TVH_DATA.stateByCode(area.state);
      const countyList = area.counties.map(county => `
        <li>
          <strong>${county.name}</strong>
          <span>${county.cities && county.cities.length ? county.cities.join(', ') : 'All cities / flexible coverage'}</span>
        </li>
      `).join('');

      return `
        <article class="coverage-card">
          <div>
            <h3>${state ? state.name : area.state}</h3>
            <ul>${countyList}</ul>
          </div>
          <button type="button" class="ghost-button danger" data-remove-coverage="${index}">Remove</button>
        </article>
      `;
    }).join('');

    coverageList.querySelectorAll('[data-remove-coverage]').forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.removeCoverage);
        vendor.coverage.splice(index, 1);
        renderCoverage();
        updateStatus();
      });
    });

    renderStateMap();
  }

  function populateForm() {
    fillStateSelects();
    form.businessName.value = vendor.businessName || '';
    form.contactName.value = vendor.contactName || '';
    form.email.value = vendor.email || session.email || '';
    form.phone.value = vendor.phone || '';
    form.website.value = vendor.website || '';
    form.address.value = vendor.address || '';
    form.city.value = vendor.city || '';
    form.state.value = vendor.state || '';
    form.zip.value = vendor.zip || '';
    form.about.value = vendor.about || '';

    if (vendor.profilePhoto) {
      photoPreview.style.backgroundImage = `url(${vendor.profilePhoto})`;
      photoPreview.classList.add('has-photo');
      photoPreview.textContent = '';
    }

    renderServices();
    renderCoverage();
    updateStatus();
  }

  function updateStatus() {
    const isComplete = window.TVH_STORAGE.isVendorComplete(vendor);
    completionStatus.className = `status-badge ${isComplete ? 'success' : 'warning'}`;
    completionStatus.textContent = isComplete
      ? 'Profile is live for Property Managers'
      : 'Profile is not live yet — add contact info, services, and coverage';
  }

  function readSelectedServices() {
    return Array.from(form.querySelectorAll('input[name="services"]:checked')).map(input => input.value);
  }

  addCoverageButton.addEventListener('click', () => {
    const selectedState = stateSelect.value;
    const countyName = document.querySelector('#coverageCounty').value.trim();
    const cities = document.querySelector('#coverageCities').value
      .split(',')
      .map(city => city.trim())
      .filter(Boolean);

    if (!selectedState || !countyName) {
      saveMessage.textContent = 'Select a state and enter at least one county before adding coverage.';
      saveMessage.className = 'form-message error';
      return;
    }

    vendor.coverage = Array.isArray(vendor.coverage) ? vendor.coverage : [];
    let stateArea = vendor.coverage.find(area => area.state === selectedState);
    if (!stateArea) {
      stateArea = { state: selectedState, counties: [] };
      vendor.coverage.push(stateArea);
    }

    const existingCounty = stateArea.counties.find(county => county.name.toLowerCase() === countyName.toLowerCase());
    if (existingCounty) {
      const merged = new Set([...(existingCounty.cities || []), ...cities]);
      existingCounty.cities = Array.from(merged);
    } else {
      stateArea.counties.push({ name: countyName, cities });
    }

    document.querySelector('#coverageCounty').value = '';
    document.querySelector('#coverageCities').value = '';
    saveMessage.textContent = 'Coverage area added. Remember to save your profile.';
    saveMessage.className = 'form-message success';
    renderCoverage();
    updateStatus();
  });

  photoInput.addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      vendor.profilePhoto = reader.result;
      photoPreview.style.backgroundImage = `url(${reader.result})`;
      photoPreview.classList.add('has-photo');
      photoPreview.textContent = '';
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener('submit', event => {
    event.preventDefault();

    const formData = new FormData(form);
    vendor = {
      ...vendor,
      businessName: formData.get('businessName').trim(),
      contactName: formData.get('contactName').trim(),
      email: window.TVH_STORAGE.normalizeEmail(formData.get('email')),
      phone: formData.get('phone').trim(),
      website: formData.get('website').trim(),
      address: formData.get('address').trim(),
      city: formData.get('city').trim(),
      state: formData.get('state'),
      zip: formData.get('zip').trim(),
      about: formData.get('about').trim(),
      services: readSelectedServices()
    };

    window.TVH_STORAGE.upsertVendor(vendor);
    saveMessage.textContent = 'Your vendor profile has been saved successfully.';
    saveMessage.className = 'form-message success';
    updateStatus();
    renderStateMap();
  });

  logoutButton.addEventListener('click', window.TVH_STORAGE.logout);
  populateForm();
})();
