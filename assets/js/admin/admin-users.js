(function () {
  'use strict';

  function showSetupError(text) {
    var message = document.getElementById('admin-users-message');

    if (message) {
      message.textContent = text;
      message.style.display = 'block';
    }
  }

  function renderStudents(items) {
    var api = window.InternGuideAdmin;

    if (!items.length) {
      return '<tr><td colspan="5">No students found.</td></tr>';
    }

    return items
      .map(function (student) {
        return [
          '<tr>',
          '  <td>' + api.escapeHtml(student.full_name) + '</td>',
          '  <td>' + api.escapeHtml(student.email) + '</td>',
          '  <td>' + api.escapeHtml(student.major || '') + '</td>',
          '  <td>' + api.escapeHtml(student.study_year || '') + '</td>',
          '  <td>' + api.escapeHtml(api.formatDate(student.created_at)) + '</td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  function renderRecruiters(items) {
    var api = window.InternGuideAdmin;

    if (!items.length) {
      return '<tr><td colspan="6">No recruiters found.</td></tr>';
    }

    return items
      .map(function (recruiter) {
        return [
          '<tr>',
          '  <td>' + api.escapeHtml(recruiter.company_name) + '</td>',
          '  <td>' + api.escapeHtml(recruiter.recruiter_name) + '</td>',
          '  <td>' + api.escapeHtml(recruiter.email) + '</td>',
          '  <td>' + api.escapeHtml([recruiter.city, recruiter.country].filter(Boolean).join(', ')) + '</td>',
          '  <td><span class="admin-status admin-status-' + api.escapeHtml(recruiter.verification_status) + '">' + api.escapeHtml(recruiter.verification_status) + '</span></td>',
          '  <td>' + api.escapeHtml(api.formatDate(recruiter.created_at)) + '</td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  async function loadUsers(params) {
    var api = window.InternGuideAdmin;
    var studentsTable = api.getElement('admin-students-table');
    var recruitersTable = api.getElement('admin-recruiters-table');

    if (!studentsTable || !recruitersTable) {
      api.setMessage('admin-users-message', 'Users table container is missing.', 'error');
      return;
    }

    var query = Object.assign({ limit: 100 }, params || {});
    var students = await api.listStudents(query);
    var recruiters = await api.listRecruiters(query);

    studentsTable.innerHTML = renderStudents(students.students || []);
    recruitersTable.innerHTML = renderRecruiters(recruiters.recruiters || []);
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

    await loadUsers().catch(function (error) {
      api.setMessage('admin-users-message', error.message || 'Unable to load users.', 'error');
    });

    api.on('admin-users-search-form', 'submit', async function (event) {
      event.preventDefault();
      await loadUsers(api.formToObject(event.target)).catch(function (error) {
        api.setMessage('admin-users-message', error.message || 'Unable to search users.', 'error');
      });
    });
  });
})();
