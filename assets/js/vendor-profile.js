(function () {
  const session = window.TVH_STORAGE.requireSession('manager');
  if (!session) return;

  const params = new URLSearchParams(window.location.search);
  const vendorId = params.get('id');
  const stateCode = params.get('state');
  const serviceId = params.get('service');
  const vendor = window.TVH_STORAGE.getVendorById(vendorId);
  const profile = document.querySelector('#vendorProfile');
  const reviewForm = document.querySelector('#reviewForm');
  const reviewMessage = document.querySelector('#reviewMessage');
  const reviewsList = document.querySelector('#reviewsList');
  const backButton = document.querySelector('#backButton');
  const logoutButton = document.querySelector('#logoutButton');

  if (stateCode && serviceId) {
    backButton.href = `category.html?state=${stateCode}&service=${serviceId}`;
  } else if (stateCode) {
    backButton.href = `market.html?state=${stateCode}`;
  } else {
    backButton.href = 'manager-dashboard.html';
  }

  function renderServices(vendorData) {
    return vendorData.services.map(serviceId => {
      const service = window.TVH_DATA.serviceById(serviceId);
      return `<span class="tag">${service ? service.name : serviceId}</span>`;
    }).join('');
  }

  function renderCoverage(vendorData) {
    return vendorData.coverage.map(area => {
      const state = window.TVH_DATA.stateByCode(area.state);
      const counties = area.counties.map(county => `
        <li>
          <strong>${county.name}</strong>
          <span>${county.cities && county.cities.length ? county.cities.join(', ') : 'All cities / flexible coverage'}</span>
        </li>
      `).join('');

      return `
        <article class="coverage-card subtle">
          <h3>${state ? state.name : area.state}</h3>
          <ul>${counties}</ul>
        </article>
      `;
    }).join('');
  }

  function renderReviews(vendorData) {
    const reviews = Array.isArray(vendorData.reviews) ? vendorData.reviews : [];
    if (reviews.length === 0) {
      reviewsList.innerHTML = '<div class="empty-state compact">No reviews have been added for this vendor yet.</div>';
      return;
    }

    reviewsList.innerHTML = reviews.map(review => `
      <article class="review-card">
        <div class="review-card-header">
          <strong>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</strong>
          <span>${new Date(review.createdAt).toLocaleDateString()}</span>
        </div>
        <h3>${review.title || 'Property Manager Review'}</h3>
        <p>${review.comment}</p>
        <small>Submitted by ${review.reviewerEmail}</small>
      </article>
    `).join('');
  }

  function renderProfile() {
    if (!vendor || !window.TVH_STORAGE.isVendorComplete(vendor)) {
      profile.innerHTML = `
        <div class="empty-state">
          <h1>Vendor profile not available</h1>
          <p>This vendor profile may be incomplete, unavailable, or removed.</p>
          <a class="primary-button" href="manager-dashboard.html">Back to all markets</a>
        </div>
      `;
      reviewForm.hidden = true;
      return;
    }

    profile.innerHTML = `
      <section class="profile-hero-card">
        <div class="profile-avatar ${vendor.profilePhoto ? 'has-photo' : ''}" style="${vendor.profilePhoto ? `background-image:url('${vendor.profilePhoto}')` : ''}">
          ${vendor.profilePhoto ? '' : vendor.businessName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <p class="eyebrow">Vendor profile</p>
          <h1>${vendor.businessName}</h1>
          <p>${vendor.about || 'No business description has been added yet.'}</p>
          <div class="profile-contact-grid">
            <span><strong>Contact:</strong> ${vendor.contactName || 'Not specified'}</span>
            <span><strong>Phone:</strong> ${vendor.phone}</span>
            <span><strong>Email:</strong> ${vendor.email}</span>
            <span><strong>Website:</strong> ${vendor.website ? `<a href="${vendor.website}" target="_blank" rel="noreferrer">${vendor.website}</a>` : 'Not specified'}</span>
            <span><strong>Address:</strong> ${[vendor.address, vendor.city, vendor.state, vendor.zip].filter(Boolean).join(', ') || 'Not specified'}</span>
          </div>
        </div>
      </section>

      <section class="content-card">
        <div class="section-heading compact-heading">
          <p class="eyebrow">Services</p>
          <h2>Categories covered by this vendor</h2>
        </div>
        <div class="tag-cloud">${renderServices(vendor)}</div>
      </section>

      <section class="content-card">
        <div class="section-heading compact-heading">
          <p class="eyebrow">Coverage areas</p>
          <h2>Markets, counties, and cities</h2>
        </div>
        <div class="coverage-list">${renderCoverage(vendor)}</div>
      </section>
    `;

    renderReviews(vendor);
  }

  reviewForm.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(reviewForm);
    const rating = Number(formData.get('rating'));
    const title = formData.get('title').trim();
    const comment = formData.get('comment').trim();

    if (!rating || !comment) {
      reviewMessage.textContent = 'Please select a rating and write a review comment.';
      reviewMessage.className = 'form-message error';
      return;
    }

    window.TVH_STORAGE.addReview(vendor.id, { rating, title, comment });
    reviewForm.reset();
    reviewMessage.textContent = 'Your review was added successfully.';
    reviewMessage.className = 'form-message success';
    const refreshedVendor = window.TVH_STORAGE.getVendorById(vendor.id);
    renderReviews(refreshedVendor);
  });

  logoutButton.addEventListener('click', window.TVH_STORAGE.logout);
  renderProfile();
})();
