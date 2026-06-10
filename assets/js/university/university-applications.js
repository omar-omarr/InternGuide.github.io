(function () {
  'use strict';

  function showSetupError(text) {
    var message = document.getElementById('university-applications-message');

    if (message) {
      message.textContent = text;
      message.style.display = 'block';
    }
  }

  function renderRows(items) {
    var api = window.InternGuideUniversity;

    if (!items.length) {
      return '<tr><td colspan="7">No related applications found.</td></tr>';
    }

    return items
      .map(function (item) {
        return [
          '<tr>',
          '  <td>' + api.escapeHtml(item.student_name) + '</td>',
          '  <td>' + api.escapeHtml(item.student_email) + '</td>',
          '  <td>' + api.escapeHtml(item.internship_title) + '</td>',
          '  <td>' + api.escapeHtml(item.company_name) + '</td>',
          '  <td>' + api.escapeHtml(item.application_status) + '</td>',
          '  <td>' + api.escapeHtml(item.university_verification_status) + '</td>',
          '  <td>' + api.escapeHtml(api.formatDate(item.created_at)) + '</td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  async function loadApplications(params) {
    var api = window.InternGuideUniversity;
    var table = api.getElement('university-applications-table');

    if (!table) {
      api.setMessage('university-applications-message', 'Applications table is missing.', 'error');
      return;
    }

    var result = await api.listApplications(Object.assign({ limit: 100 }, params || {}));
    table.innerHTML = renderRows(result.applications || []);
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var api = window.InternGuideUniversity;

    if (!api) {
      showSetupError('University admin scripts did not load. Refresh the page and try again.');
      return;
    }

    var user = await api.ensureUniversityAdmin();

    if (!user) {
      return;
    }

    api.attachLogout();

    await loadApplications().catch(function (error) {
      api.setMessage('university-applications-message', error.message || 'Unable to load applications.', 'error');
    });

    api.on('university-application-filter-form', 'submit', async function (event) {
      event.preventDefault();
      await loadApplications(api.formToObject(event.target)).catch(function (error) {
        api.setMessage('university-applications-message', error.message || 'Unable to load applications.', 'error');
      });
    });
  });
})();
