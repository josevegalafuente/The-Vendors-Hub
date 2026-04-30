(function () {
  const roleButtons = document.querySelectorAll('[data-role-button]');
  const modeButtons = document.querySelectorAll('[data-mode-button]');
  const form = document.querySelector('#authForm');
  const formTitle = document.querySelector('#formTitle');
  const formSubtitle = document.querySelector('#formSubtitle');
  const submitButton = document.querySelector('#submitButton');
  const vendorFields = document.querySelector('#vendorFields');
  const message = document.querySelector('#authMessage');
  const passwordConfirmGroup = document.querySelector('#passwordConfirmGroup');
  const roleHelp = document.querySelector('#roleHelp');

  let selectedRole = 'vendor';
  let selectedMode = 'register';

  function setMessage(text, type = 'error') {
    message.textContent = text || '';
    message.className = text ? `form-message ${type}` : 'form-message';
  }

  function updateUI() {
    roleButtons.forEach(button => {
      button.classList.toggle('is-active', button.dataset.roleButton === selectedRole);
    });
    modeButtons.forEach(button => {
      button.classList.toggle('is-active', button.dataset.modeButton === selectedMode);
    });

    const isRegister = selectedMode === 'register';
    const isVendor = selectedRole === 'vendor';

    vendorFields.hidden = !(isRegister && isVendor);
    passwordConfirmGroup.hidden = !isRegister;

    formTitle.textContent = `${isRegister ? 'Create' : 'Log in to'} your ${isVendor ? 'Vendor' : 'Property Manager'} account`;
    formSubtitle.textContent = isVendor
      ? 'Build your service profile, define your coverage areas, and become searchable by market.'
      : 'Browse national markets, filter vendors by trade, and review vendor profiles.';
    submitButton.textContent = isRegister ? 'Create account' : 'Log in';
    roleHelp.textContent = isVendor
      ? 'Vendors can register their business, services, contact details, and coverage areas.'
      : 'Property Managers can browse markets and view registered vendor profiles.';
  }

  roleButtons.forEach(button => {
    button.addEventListener('click', () => {
      selectedRole = button.dataset.roleButton;
      setMessage('');
      updateUI();
    });
  });

  modeButtons.forEach(button => {
    button.addEventListener('click', () => {
      selectedMode = button.dataset.modeButton;
      setMessage('');
      updateUI();
    });
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    setMessage('');

    const formData = new FormData(form);
    const email = formData.get('email');
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');

    try {
      if (!email || !password) {
        throw new Error('Please enter an email and password.');
      }

      if (selectedMode === 'register') {
        if (String(password).length < 6) {
          throw new Error('Your password must be at least 6 characters long.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        window.TVH_STORAGE.registerUser({
          role: selectedRole,
          email,
          password,
          businessName: formData.get('businessName'),
          contactName: formData.get('contactName'),
          phone: formData.get('phone')
        });
      } else {
        window.TVH_STORAGE.loginUser({ role: selectedRole, email, password });
      }

      window.location.href = selectedRole === 'vendor' ? 'vendor-dashboard.html' : 'manager-dashboard.html';
    } catch (error) {
      setMessage(error.message, 'error');
    }
  });

  const session = window.TVH_STORAGE.getSession();
  if (session) {
    const continueLink = document.querySelector('#continueLink');
    continueLink.hidden = false;
    continueLink.href = session.role === 'vendor' ? 'vendor-dashboard.html' : 'manager-dashboard.html';
  }

  updateUI();
})();
