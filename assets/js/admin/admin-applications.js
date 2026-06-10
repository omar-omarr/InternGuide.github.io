(function () {
  'use strict';

  function renderRows(items) {
    var api = window.InternGuideAdmin;

    if (!items.length) {
      return '<tr><td colspan="7">No applications found.</td></tr>';
    }

    return items
      .map(function (item) {
        return [
          '<tr>',
          '<td>' + api.escapeHtml(item.student_name) + '</td>',
          '<td>' + api.escapeHtml(item.student_email) + '</td>',
          '<td>' + api.escapeHtml(item.internship_title) + '</td>',
          '<td>' + api.escapeHtml(item.company_name) + '</td>',
          '<td><span class="admin-status admin-status-' + api.escapeHtml(item.status) + '">' + api.escapeHtml(item.status.replace(/_/g, ' ')) + '</span></td>',
          '<td>' + api.escapeHtml(api.formatDate(item.applied_at)) + '</td>',
          '<td>' + api.escapeHtml(api.formatDate(item.updated_at)) + '</td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  async function loadApplications() {
    var api = window.InternGuideAdmin;
    var form = api.getElement('admin-application-filter-form');
    var result = await api.listApplications(Object.assign({ limit: 100 }, api.formToObject(form)));
    api.setHtml('admin-applications-table', renderRows(result.applications || []));
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var api = window.InternGuideAdmin;
    if (!api || !(await api.ensureSystemAdmin())) {
      return;
    }

    api.attachLogout();
    await loadApplications().catch(function (error) {
      api.setMessage('admin-applications-message', error.message || 'Unable to load applications.', 'error');
    });
    api.on('admin-application-filter-form', 'submit', async function (event) {
      event.preventDefault();
      await loadApplications().catch(function (error) {
        api.setMessage('admin-applications-message', error.message || 'Unable to load applications.', 'error');
      });
    });
  });
})();
