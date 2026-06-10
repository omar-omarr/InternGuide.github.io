(function () {
  'use strict';

  function showSetupError(text) {
    var message = document.getElementById('university-approvals-message');

    if (message) {
      message.textContent = text;
      message.style.display = 'block';
    }
  }

  function renderRows(items) {
    var api = window.InternGuideUniversity;

    if (!items.length) {
      return '<tr><td colspan="6">No internship approvals found.</td></tr>';
    }

    return items
      .map(function (item) {
        return [
          '<tr>',
          '  <td>' + api.escapeHtml(item.title) + '</td>',
          '  <td>' + api.escapeHtml(item.company_name) + '</td>',
          '  <td>' + api.escapeHtml(item.department_name || '') + '</td>',
          '  <td>' + api.escapeHtml(item.status) + '</td>',
          '  <td>' + api.escapeHtml(api.formatDate(item.created_at)) + '</td>',
          '  <td><button class="admin-button admin-button-small" type="button" data-view-id="' + item.approval_id + '">View</button></td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  function renderDetail(approval) {
    var api = window.InternGuideUniversity;

    return [
      '<p><strong>Title:</strong> ' + api.escapeHtml(approval.title) + '</p>',
      '<p><strong>Company:</strong> ' + api.escapeHtml(approval.company_name) + '</p>',
      '<p><strong>Recruiter:</strong> ' + api.escapeHtml(approval.recruiter_name) + ' (' + api.escapeHtml(approval.recruiter_email) + ')</p>',
      '<p><strong>Department:</strong> ' + api.escapeHtml(approval.department_name || '') + '</p>',
      '<p><strong>Location:</strong> ' + api.escapeHtml(approval.location || '') + '</p>',
      '<p><strong>Type:</strong> ' + api.escapeHtml(approval.type || '') + '</p>',
      '<p><strong>Status:</strong> ' + api.escapeHtml(approval.status) + '</p>',
      '<p><strong>Description:</strong> ' + api.escapeHtml(approval.description || '') + '</p>',
      approval.notes ? '<p><strong>Notes:</strong> ' + api.escapeHtml(approval.notes) + '</p>' : '',
    ].join('');
  }

  async function loadApprovals() {
    var api = window.InternGuideUniversity;
    var form = api.getElement('university-approval-filter-form');
    var table = api.getElement('university-approvals-table');

    if (!table) {
      api.setMessage('university-approvals-message', 'Approvals table is missing.', 'error');
      return;
    }

    var result = await api.listApprovals(Object.assign({ limit: 100 }, api.formToObject(form)));
    table.innerHTML = renderRows(result.approvals || []);
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

    await loadApprovals().catch(function (error) {
      api.setMessage('university-approvals-message', error.message || 'Unable to load approvals.', 'error');
    });

    api.on('university-approval-filter-form', 'submit', async function (event) {
      event.preventDefault();
      await loadApprovals().catch(function (error) {
        api.setMessage('university-approvals-message', error.message || 'Unable to load approvals.', 'error');
      });
    });

    api.on('university-approvals-table', 'click', async function (event) {
      var button = event.target.closest('[data-view-id]');

      if (!button) {
        return;
      }

      try {
        var result = await api.getApproval(button.dataset.viewId);
        var form = api.getElement('university-approval-review-form');
        var approval = result.approval;

        api.setHtml('university-approval-detail', renderDetail(approval));

        if (form) {
          form.elements.id.value = approval.approval_id;
        }
      } catch (error) {
        api.setMessage('university-approvals-message', error.message || 'Unable to load approval.', 'error');
      }
    });

    api.on('university-approval-review-form', 'submit', async function (event) {
      event.preventDefault();
      api.setMessage('university-approvals-message', '', 'success');

      var data = api.formToObject(event.target);

      if (!data.id) {
        api.setMessage('university-approvals-message', 'Select an approval first.', 'error');
        return;
      }

      try {
        await api.reviewApproval(data.id, {
          status: data.status,
          notes: data.notes,
        });
        api.setMessage('university-approvals-message', 'Approval review saved.', 'success');
        event.target.reset();
        api.setText('university-approval-detail', 'Select an approval.');
        await loadApprovals();
      } catch (error) {
        api.setMessage('university-approvals-message', error.message || 'Unable to review approval.', 'error');
      }
    });
  });
})();
