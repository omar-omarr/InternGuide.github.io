(function () {
  'use strict';

  var selectedVerification = null;

  function showSetupError(text) {
    var message = document.getElementById('admin-verifications-message');

    if (message) {
      message.textContent = text;
      message.style.display = 'block';
    }
  }

  function renderRows(items) {
    var api = window.InternGuideAdmin;

    if (!items.length) {
      return '<tr><td colspan="6">No recruiter verifications found.</td></tr>';
    }

    return items
      .map(function (item) {
        return [
          '<tr>',
          '  <td>' + api.escapeHtml(item.company_name) + '</td>',
          '  <td>' + api.escapeHtml(item.recruiter_name) + '</td>',
          '  <td>' + api.escapeHtml(item.email) + '</td>',
          '  <td><span class="admin-status admin-status-' + api.escapeHtml(item.status) + '">' + api.escapeHtml(item.status) + '</span></td>',
          '  <td>' + api.escapeHtml(api.formatDate(item.created_at)) + '</td>',
          '  <td><button class="admin-button admin-button-small" type="button" data-view-id="' + item.id + '">View</button></td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  function renderDetail(verification) {
    var api = window.InternGuideAdmin;

    return [
      '<p><strong>Company:</strong> ' + api.escapeHtml(verification.company_name) + '</p>',
      '<p><strong>Recruiter:</strong> ' + api.escapeHtml(verification.recruiter_name) + '</p>',
      '<p><strong>Email:</strong> ' + api.escapeHtml(verification.email) + '</p>',
      '<p><strong>Status:</strong> ' + api.escapeHtml(verification.status) + '</p>',
      '<p><strong>Document:</strong> ' + api.escapeHtml(verification.document_path) + '</p>',
      '<p><strong>Location:</strong> ' + api.escapeHtml([verification.city, verification.country].filter(Boolean).join(', ')) + '</p>',
      '<p><strong>About:</strong> ' + api.escapeHtml(verification.about_company || '') + '</p>',
      verification.rejection_reason
        ? '<p><strong>Rejection reason:</strong> ' + api.escapeHtml(verification.rejection_reason) + '</p>'
        : '',
    ].join('');
  }

  async function loadList() {
    var api = window.InternGuideAdmin;
    var form = api.getElement('admin-verification-filter-form');
    var table = api.getElement('admin-verifications-table');

    if (!table) {
      api.setMessage('admin-verifications-message', 'Verifications table is missing.', 'error');
      return;
    }

    var result = await api.listRecruiterVerifications(Object.assign({ limit: 100 }, api.formToObject(form)));
    table.innerHTML = renderRows(result.verifications || []);
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

    await loadList().catch(function (error) {
      api.setMessage('admin-verifications-message', error.message || 'Unable to load verifications.', 'error');
    });

    api.on('admin-verification-filter-form', 'submit', async function (event) {
      event.preventDefault();
      await loadList().catch(function (error) {
        api.setMessage('admin-verifications-message', error.message || 'Unable to load verifications.', 'error');
      });
    });

    api.on('admin-verifications-table', 'click', async function (event) {
      var button = event.target.closest('[data-view-id]');

      if (!button) {
        return;
      }

      try {
        var result = await api.getRecruiterVerification(button.dataset.viewId);
        var detail = api.getElement('admin-verification-detail');
        var form = api.getElement('admin-verification-review-form');

        selectedVerification = result.verification;

        if (detail) {
          detail.innerHTML = renderDetail(selectedVerification);
        }

        if (form) {
          form.elements.id.value = selectedVerification.id;
        }
      } catch (error) {
        api.setMessage('admin-verifications-message', error.message || 'Unable to load verification.', 'error');
      }
    });

    api.on('admin-verification-review-form', 'submit', async function (event) {
      event.preventDefault();
      api.setMessage('admin-verifications-message', '', 'success');

      var data = api.formToObject(event.target);

      if (!data.id) {
        api.setMessage('admin-verifications-message', 'Select a verification first.', 'error');
        return;
      }

      try {
        await api.reviewRecruiterVerification(data.id, {
          status: data.status,
          rejection_reason: data.rejection_reason,
        });
        api.setMessage('admin-verifications-message', 'Verification reviewed.', 'success');
        event.target.reset();
        selectedVerification = null;
        api.setText('admin-verification-detail', 'Select a verification.');
        await loadList();
      } catch (error) {
        api.setMessage('admin-verifications-message', error.message || 'Unable to review verification.', 'error');
      }
    });
  });
})();
