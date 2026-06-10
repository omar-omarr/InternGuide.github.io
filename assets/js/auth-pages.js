(function () {
  'use strict';

  function submitButton(form) {
    return form.querySelector('[type="submit"]') || document.querySelector('[form="' + form.id + '"][type="submit"]');
  }

  function setMessage(form, text, type) {
    var message = document.querySelector('[data-form-message="' + form.id + '"]');

    if (!message) {
      return;
    }

    message.textContent = text || '';
    message.style.display = text ? 'block' : 'none';
    message.style.color = type === 'error' ? '#cc2229' : '#168a45';
  }

  function setLoading(form, isLoading) {
    var button = submitButton(form);

    if (button) {
      button.disabled = isLoading;
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = isLoading ? 'Please wait...' : button.dataset.originalText;
    }
  }

  function requireMatchingPasswords(form) {
    var password = form.querySelector('[name="pass"]');
    var confirm = form.querySelector('[name="repass"]');

    if (password && confirm && confirm.value && password.value !== confirm.value) {
      throw new Error('Passwords do not match.');
    }
  }

  async function handleAuthForm(form, action, redirectTo, useFormData) {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      setMessage(form, '', 'success');
      setLoading(form, true);

      try {
        requireMatchingPasswords(form);

        var payload = useFormData ? new FormData(form) : window.InternGuideAPI.formToObject(form);

        if (useFormData) {
          form.querySelectorAll('input[type="file"]').forEach(function (input) {
            if (!input.files.length) {
              payload.delete(input.name);
            }
          });
        }
        var result = await action(payload);

        window.InternGuideAPI.saveSession(result.token, result.user);
        setMessage(form, result.message || 'Success.', 'success');

        window.setTimeout(function () {
          window.location.href = redirectTo;
        }, 500);
      } catch (error) {
        setMessage(form, error.message || 'Something went wrong.', 'error');
      } finally {
        setLoading(form, false);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var studentSignup = document.getElementById('student-signup-form');
    var studentLogin = document.getElementById('student-login-form');
    var recruiterSignup = document.getElementById('recruiter-signup-form');
    var recruiterLogin = document.getElementById('recruiter-login-form');

    if (studentSignup) {
      handleAuthForm(studentSignup, window.InternGuideAPI.studentSignup, 'student/dashboard.html', true);
    }

    if (studentLogin) {
      handleAuthForm(studentLogin, window.InternGuideAPI.studentLogin, 'student/dashboard.html', false);
    }

    if (recruiterSignup) {
      handleAuthForm(recruiterSignup, window.InternGuideAPI.recruiterSignup, 'recruiter/dashboard.html', false);
    }

    if (recruiterLogin) {
      handleAuthForm(recruiterLogin, window.InternGuideAPI.recruiterLogin, 'recruiter/dashboard.html', false);
    }
  });
})();
