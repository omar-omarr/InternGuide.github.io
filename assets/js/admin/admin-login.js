(function () {
  'use strict';

  function hidePreloader() {
    var preloader = document.querySelector('.preloader');

    if (preloader) {
      preloader.style.display = 'none';
    }
  }

  function showPlainMessage(text, type) {
    var message = document.getElementById('admin-login-message');

    if (!message) {
      return;
    }

    message.textContent = text || '';
    message.style.display = text ? 'block' : 'none';
    message.style.color = type === 'error' ? '#cc2229' : '#168a45';
  }

  function showLoginForm() {
    var form = document.getElementById('admin-login-form');

    if (form) {
      form.style.display = 'block';
    }

    hidePreloader();
  }

  async function redirectIfValidSystemAdmin(api) {
    var token = api.getToken();

    if (!token) {
      showLoginForm();
      return;
    }

    try {
      var result = await api.me();

      if (result.user && result.user.role === 'system_admin') {
        api.saveSession(token, result.user);
        window.InternGuideApp.navigate('admin/dashboard.html');
        return;
      }

      api.clearSession();
      showLoginForm();
    } catch (error) {
      api.clearSession();
      showLoginForm();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var api = window.InternGuideAdmin;
    var form = document.getElementById('admin-login-form');

    hidePreloader();

    if (!api) {
      showPlainMessage('Admin scripts did not load. Refresh the page and try again.', 'error');
      showLoginForm();
      return;
    }

    if (!form) {
      showPlainMessage('Login form is missing from this page.', 'error');
      showLoginForm();
      return;
    }

    redirectIfValidSystemAdmin(api);

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      api.setMessage('admin-login-message', '', 'success');

      var button = form.querySelector('[type="submit"]');
      var originalText = button ? button.textContent : '';

      if (button) {
        button.disabled = true;
        button.textContent = 'Please wait...';
      }

      try {
        var result = await api.login(api.formToObject(form));

        if (!result.user || result.user.role !== 'system_admin') {
          api.clearSession();
          api.setMessage('admin-login-message', 'Use a system admin account for this dashboard.', 'error');
          return;
        }

        api.saveSession(result.token, result.user);
        window.InternGuideApp.navigate('admin/dashboard.html');
      } catch (error) {
        api.clearSession();
        api.setMessage('admin-login-message', error.message || 'Unable to log in.', 'error');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = originalText;
        }

        hidePreloader();
      }
    });
  });

  window.addEventListener('load', hidePreloader);
})();
