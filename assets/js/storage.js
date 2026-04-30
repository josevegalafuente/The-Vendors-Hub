(function () {
  const KEYS = {
    users: 'tvh_users',
    session: 'tvh_session',
    vendors: 'tvh_vendors'
  };

  function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.error('Could not read localStorage key:', key, error);
      return fallback;
    }
  }

  function set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function getUsers() {
    return get(KEYS.users, []);
  }

  function saveUsers(users) {
    set(KEYS.users, users);
  }

  function getVendors() {
    return get(KEYS.vendors, []);
  }

  function saveVendors(vendors) {
    set(KEYS.vendors, vendors);
  }

  function getSession() {
    return get(KEYS.session, null);
  }

  function setSession(session) {
    set(KEYS.session, session);
  }

  function logout() {
    localStorage.removeItem(KEYS.session);
    window.location.href = 'index.html';
  }

  function registerUser({ role, email, password, businessName, contactName, phone }) {
    const cleanEmail = normalizeEmail(email);
    const users = getUsers();
    const existing = users.find(user => user.email === cleanEmail);

    if (existing) {
      throw new Error('An account with this email already exists. Please log in instead.');
    }

    const user = {
      id: uid('user'),
      role,
      email: cleanEmail,
      password,
      createdAt: new Date().toISOString()
    };

    users.push(user);
    saveUsers(users);

    if (role === 'vendor') {
      const vendors = getVendors();
      const vendor = {
        id: uid('vendor'),
        userId: user.id,
        businessName: businessName || '',
        contactName: contactName || '',
        email: cleanEmail,
        phone: phone || '',
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
      vendors.push(vendor);
      saveVendors(vendors);
    }

    setSession({ userId: user.id, role: user.role, email: user.email });
    return user;
  }

  function loginUser({ role, email, password }) {
    const cleanEmail = normalizeEmail(email);
    const users = getUsers();
    const user = users.find(item => item.email === cleanEmail && item.password === password && item.role === role);

    if (!user) {
      throw new Error('We could not find an account with that role, email, and password.');
    }

    setSession({ userId: user.id, role: user.role, email: user.email });
    return user;
  }

  function requireSession(role) {
    const session = getSession();
    if (!session || (role && session.role !== role)) {
      window.location.href = 'index.html';
      return null;
    }
    return session;
  }

  function getVendorByUserId(userId) {
    return getVendors().find(vendor => vendor.userId === userId) || null;
  }

  function getVendorById(vendorId) {
    return getVendors().find(vendor => vendor.id === vendorId) || null;
  }

  function upsertVendor(updatedVendor) {
    const vendors = getVendors();
    const index = vendors.findIndex(vendor => vendor.id === updatedVendor.id);
    const vendorToSave = {
      ...updatedVendor,
      updatedAt: new Date().toISOString()
    };

    if (index >= 0) {
      vendors[index] = vendorToSave;
    } else {
      vendors.push(vendorToSave);
    }

    saveVendors(vendors);
    return vendorToSave;
  }

  function isVendorComplete(vendor) {
    return Boolean(
      vendor &&
      vendor.businessName &&
      vendor.email &&
      vendor.phone &&
      Array.isArray(vendor.services) && vendor.services.length > 0 &&
      Array.isArray(vendor.coverage) && vendor.coverage.length > 0
    );
  }

  function getPublicVendors() {
    return getVendors().filter(isVendorComplete);
  }

  function vendorCoversState(vendor, stateCode) {
    return Array.isArray(vendor.coverage) && vendor.coverage.some(area => area.state === stateCode);
  }

  function vendorOffersService(vendor, serviceId) {
    return Array.isArray(vendor.services) && vendor.services.includes(serviceId);
  }

  function getVendorsByState(stateCode) {
    return getPublicVendors().filter(vendor => vendorCoversState(vendor, stateCode));
  }

  function getVendorsByStateAndService(stateCode, serviceId) {
    return getPublicVendors().filter(vendor => vendorCoversState(vendor, stateCode) && vendorOffersService(vendor, serviceId));
  }

  function getServiceCountByState(stateCode, serviceId) {
    return getVendorsByStateAndService(stateCode, serviceId).length;
  }

  function addReview(vendorId, review) {
    const vendor = getVendorById(vendorId);
    if (!vendor) return null;

    const session = getSession();
    const nextReview = {
      id: uid('review'),
      rating: Number(review.rating),
      title: review.title || '',
      comment: review.comment || '',
      reviewerEmail: session ? session.email : '',
      createdAt: new Date().toISOString()
    };

    vendor.reviews = Array.isArray(vendor.reviews) ? vendor.reviews : [];
    vendor.reviews.unshift(nextReview);
    upsertVendor(vendor);
    return nextReview;
  }

  window.TVH_STORAGE = {
    uid,
    normalizeEmail,
    getUsers,
    getVendors,
    saveVendors,
    getSession,
    setSession,
    logout,
    registerUser,
    loginUser,
    requireSession,
    getVendorByUserId,
    getVendorById,
    upsertVendor,
    isVendorComplete,
    getPublicVendors,
    vendorCoversState,
    vendorOffersService,
    getVendorsByState,
    getVendorsByStateAndService,
    getServiceCountByState,
    addReview
  };
})();
