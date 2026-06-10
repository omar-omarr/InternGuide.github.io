(function () {
  'use strict';

  function showPlainMessage(text, type) {
    var message = document.getElementById('university-login-message');

    if (!message) {
      return;
    }

    message.textContent = text || '';
    message.style.display = text ? 'block' : 'none';
    message.style.color = type === 'error' ? '#cc2229' : '#168a45';
  }

  function showLoginForm() {
    var form = document.getElementById('university-login-form');

    if (form) {
      form.style.display = 'block';
    }
  }

  async function redirectIfValidUniversityAdmin(api) {
    var token = api.getToken();

    if (!token) {
      showLoginForm();
      return;
    }

    try {
      var result = await api.me();

      if (result.user && result.user.role === 'university_admin' && result.user.universityId) {
        api.saveSession(token, result.user);
        window.InternGuideApp.navigate('university/dashboard.html');
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
    var api = window.InternGuideUniversity;
    var form = document.getElementById('university-login-form');

    if (!api) {
      showPlainMessage('University admin scripts did not load. Refresh the page and try again.', 'error');
      showLoginForm();
      return;
    }

    if (!form) {
      showPlainMessage('Login form is missing from this page.', 'error');
      showLoginForm();
      return;
    }

    redirectIfValidUniversityAdmin(api);

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      api.setMessage('university-login-message', '', 'success');

      var button = form.querySelector('[type="submit"]');
      var originalText = button ? button.textContent : '';

      if (button) {
        button.disabled = true;
        button.textContent = 'Please wait...';
      }

      try {
        var result = await api.login(api.formToObject(form));

        if (!result.user || result.user.role !== 'university_admin' || !result.user.universityId) {
          api.clearSession();
          api.setMessage('university-login-message', 'Use a university admin account for this dashboard.', 'error');
          return;
        }

        api.saveSession(result.token, result.user);
        window.InternGuideApp.navigate('university/dashboard.html');
      } catch (error) {
        api.clearSession();
        api.setMessage('university-login-message', error.message || 'Unable to log in.', 'error');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = originalText;
        }
      }
    });
  });
})();
