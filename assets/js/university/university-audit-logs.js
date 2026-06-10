(function () {
  'use strict';

  function showSetupError(text) {
    var message = document.getElementById('university-audit-message');

    if (message) {
      message.textContent = text;
      message.style.display = 'block';
    }
  }

  function renderRows(items) {
    var api = window.InternGuideUniversity;

    if (!items.length) {
      return '<tr><td colspan="5">No audit logs found.</td></tr>';
    }

    return items
      .map(function (item) {
        return [
          '<tr>',
          '  <td>' + api.escapeHtml(api.formatDate(item.created_at)) + '</td>',
          '  <td>' + api.escapeHtml((item.actor_role || 'system') + (item.actor_id ? ' #' + item.actor_id : '')) + '</td>',
          '  <td>' + api.escapeHtml(item.action) + '</td>',
          '  <td>' + api.escapeHtml(item.entity_type + (item.entity_id ? ' #' + item.entity_id : '')) + '</td>',
          '  <td><code>' + api.escapeHtml(JSON.stringify(item.metadata || {})) + '</code></td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  async function loadAuditLogs(params) {
    var api = window.InternGuideUniversity;
    var table = api.getElement('university-audit-table');

    if (!table) {
      api.setMessage('university-audit-message', 'Audit logs table is missing.', 'error');
      return;
    }

    var result = await api.listAuditLogs(Object.assign({ limit: 100 }, params || {}));
    table.innerHTML = renderRows(result.auditLogs || []);
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

    await loadAuditLogs().catch(function (error) {
      api.setMessage('university-audit-message', error.message || 'Unable to load audit logs.', 'error');
    });

    api.on('university-audit-filter-form', 'submit', async function (event) {
      event.preventDefault();
      await loadAuditLogs(api.formToObject(event.target)).catch(function (error) {
        api.setMessage('university-audit-message', error.message || 'Unable to filter audit logs.', 'error');
      });
    });
  });
})();
