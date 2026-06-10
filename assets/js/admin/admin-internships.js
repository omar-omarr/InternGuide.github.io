(function () {
  'use strict';

  function showSetupError(text) {
    var message = document.getElementById('admin-internships-message');

    if (message) {
      message.textContent = text;
      message.style.display = 'block';
    }
  }

  function renderRows(items) {
    var api = window.InternGuideAdmin;

    if (!items.length) {
      return '<tr><td colspan="6">No internships found.</td></tr>';
    }

    return items
      .map(function (item) {
        var action = item.status === 'active' ? 'close' : 'reopen';
        var label = item.status === 'active' ? 'Close' : 'Reopen';

        return [
          '<tr>',
          '  <td>' + api.escapeHtml(item.title) + '</td>',
          '  <td>' + api.escapeHtml(item.company_name) + '</td>',
          '  <td>' + api.escapeHtml(item.location) + '</td>',
          '  <td>' + api.escapeHtml(item.status) + '</td>',
          '  <td>' + api.escapeHtml(item.application_count || 0) + '</td>',
          '  <td><button class="admin-button admin-button-small" type="button" data-action="' + action + '" data-id="' + item.id + '">' + label + '</button></td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  async function loadInternships() {
    var api = window.InternGuideAdmin;
    var form = api.getElement('admin-internship-filter-form');
    var table = api.getElement('admin-internships-table');

    if (!table) {
      api.setMessage('admin-internships-message', 'Internships table is missing.', 'error');
      return;
    }

    var result = await api.listInternships(Object.assign({ limit: 100 }, api.formToObject(form)));
    table.innerHTML = renderRows(result.internships || []);
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var api = window.InternGuideAdmin;

    if (!api) {
      showSetupError('Admin scripts did not load. Refresh the page and try again.');
      return;
    }

    var user = await api.ensureSystemAdmin();

    if (!user) {
      return;
    }

    api.attachLogout();

    await loadInternships().catch(function (error) {
      api.setMessage('admin-internships-message', error.message || 'Unable to load internships.', 'error');
    });

    api.on('admin-internship-filter-form', 'submit', async function (event) {
      event.preventDefault();
      await loadInternships().catch(function (error) {
        api.setMessage('admin-internships-message', error.message || 'Unable to load internships.', 'error');
      });
    });

    api.on('admin-internships-table', 'click', async function (event) {
      var button = event.target.closest('[data-action][data-id]');

      if (!button) {
        return;
      }

      var id = button.dataset.id;
      var action = button.dataset.action;

      try {
        if (action === 'close') {
          await api.closeInternship(id);
          api.setMessage('admin-internships-message', 'Internship closed.', 'success');
        } else {
          await api.reopenInternship(id);
          api.setMessage('admin-internships-message', 'Internship reopened.', 'success');
        }

        await loadInternships();
      } catch (error) {
        api.setMessage('admin-internships-message', error.message || 'Unable to update internship.', 'error');
      }
    });
  });
})();
