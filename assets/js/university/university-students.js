(function () {
  'use strict';

  var students = [];

  function showSetupError(text) {
    var message = document.getElementById('university-students-message');

    if (message) {
      message.textContent = text;
      message.style.display = 'block';
    }
  }

  function renderRows(items) {
    var api = window.InternGuideUniversity;

    if (!items.length) {
      return '<tr><td colspan="6">No student profiles found.</td></tr>';
    }

    return items
      .map(function (item) {
        return [
          '<tr>',
          '  <td>' + api.escapeHtml(item.full_name) + '</td>',
          '  <td>' + api.escapeHtml(item.email) + '</td>',
          '  <td>' + api.escapeHtml(item.department_name || '') + '</td>',
          '  <td>' + api.escapeHtml(item.student_number || '') + '</td>',
          '  <td>' + api.escapeHtml(item.verification_status) + '</td>',
          '  <td><button class="admin-button admin-button-small" type="button" data-view-id="' + item.profile_id + '">View</button></td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  function renderDetail(student) {
    var api = window.InternGuideUniversity;

    return [
      '<p><strong>Name:</strong> ' + api.escapeHtml(student.full_name) + '</p>',
      '<p><strong>Email:</strong> ' + api.escapeHtml(student.email) + '</p>',
      '<p><strong>Major:</strong> ' + api.escapeHtml(student.major || '') + '</p>',
      '<p><strong>Study year:</strong> ' + api.escapeHtml(student.study_year || '') + '</p>',
      '<p><strong>Department:</strong> ' + api.escapeHtml(student.department_name || '') + '</p>',
      '<p><strong>Student number:</strong> ' + api.escapeHtml(student.student_number || '') + '</p>',
      '<p><strong>Status:</strong> ' + api.escapeHtml(student.verification_status) + '</p>',
      student.rejection_reason ? '<p><strong>Rejection reason:</strong> ' + api.escapeHtml(student.rejection_reason) + '</p>' : '',
    ].join('');
  }

  async function loadStudents() {
    var api = window.InternGuideUniversity;
    var form = api.getElement('university-student-filter-form');
    var table = api.getElement('university-students-table');

    if (!table) {
      api.setMessage('university-students-message', 'Students table is missing.', 'error');
      return;
    }

    var result = await api.listStudents(Object.assign({ limit: 100 }, api.formToObject(form)));
    students = result.students || [];
    table.innerHTML = renderRows(students);
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

    await loadStudents().catch(function (error) {
      api.setMessage('university-students-message', error.message || 'Unable to load students.', 'error');
    });

    api.on('university-student-filter-form', 'submit', async function (event) {
      event.preventDefault();
      await loadStudents().catch(function (error) {
        api.setMessage('university-students-message', error.message || 'Unable to load students.', 'error');
      });
    });

    api.on('university-students-table', 'click', async function (event) {
      var button = event.target.closest('[data-view-id]');

      if (!button) {
        return;
      }

      try {
        var result = await api.getStudent(button.dataset.viewId);
        var form = api.getElement('university-student-review-form');
        var student = result.student;

        api.setHtml('university-student-detail', renderDetail(student));

        if (form) {
          form.elements.id.value = student.profile_id;
        }
      } catch (error) {
        api.setMessage('university-students-message', error.message || 'Unable to load student.', 'error');
      }
    });

    api.on('university-student-review-form', 'submit', async function (event) {
      event.preventDefault();
      api.setMessage('university-students-message', '', 'success');

      var data = api.formToObject(event.target);

      if (!data.id) {
        api.setMessage('university-students-message', 'Select a student profile first.', 'error');
        return;
      }

      try {
        await api.verifyStudent(data.id, {
          status: data.status,
          rejection_reason: data.rejection_reason,
        });
        api.setMessage('university-students-message', 'Student review saved.', 'success');
        event.target.reset();
        api.setText('university-student-detail', 'Select a student profile.');
        await loadStudents();
      } catch (error) {
        api.setMessage('university-students-message', error.message || 'Unable to review student.', 'error');
      }
    });
  });
})();
