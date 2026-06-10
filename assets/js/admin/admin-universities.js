(function () {
  'use strict';

  var universities = [];
  var selectedUniversityId = null;
  var departments = [];

  function showSetupError(text) {
    var message = document.getElementById('admin-universities-message');

    if (message) {
      message.textContent = text;
      message.style.display = 'block';
    }
  }

  function renderUniversities(items) {
    var api = window.InternGuideAdmin;

    if (!items.length) {
      return '<tr><td colspan="5">No universities found.</td></tr>';
    }

    return items
      .map(function (university) {
        var nextStatus = university.status === 'active' ? 'inactive' : 'active';
        return [
          '<tr>',
          '  <td>' + api.escapeHtml(university.name) + '</td>',
          '  <td>' + api.escapeHtml(university.email_domain || '') + '</td>',
          '  <td>' + api.escapeHtml(university.location || '') + '</td>',
          '  <td>' + api.escapeHtml(university.status) + '</td>',
          '  <td><div class="admin-actions">',
          '    <button class="admin-button admin-button-small" type="button" data-action="edit" data-id="' + university.id + '">Edit</button>',
          '    <button class="admin-button admin-button-secondary admin-button-small" type="button" data-action="departments" data-id="' + university.id + '">Departments</button>',
          '    <button class="admin-button admin-button-small" type="button" data-action="status" data-status="' + nextStatus + '" data-id="' + university.id + '">' + api.escapeHtml(nextStatus) + '</button>',
          '  </div></td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  function renderDepartments(items) {
    var api = window.InternGuideAdmin;

    if (!selectedUniversityId) {
      return '<tr><td colspan="3">Select a university to manage departments.</td></tr>';
    }

    if (!items.length) {
      return '<tr><td colspan="3">No departments yet.</td></tr>';
    }

    return items
      .map(function (department) {
        return [
          '<tr>',
          '  <td>' + api.escapeHtml(department.name) + '</td>',
          '  <td>' + api.escapeHtml(api.formatDate(department.created_at)) + '</td>',
          '  <td><div class="admin-actions">',
          '    <button class="admin-button admin-button-small" type="button" data-department-action="edit" data-id="' + department.id + '">Edit</button>',
          '    <button class="admin-button admin-button-secondary admin-button-small" type="button" data-department-action="delete" data-id="' + department.id + '">Delete</button>',
          '  </div></td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  function fillUniversityForm(university) {
    var api = window.InternGuideAdmin;
    var form = api.getElement('admin-university-form');

    if (!form) {
      api.setMessage('admin-universities-message', 'University form is missing.', 'error');
      return;
    }

    form.elements.id.value = university.id || '';
    form.elements.name.value = university.name || '';
    form.elements.email_domain.value = university.email_domain || '';
    form.elements.location.value = university.location || '';
    form.elements.contact_email.value = university.contact_email || '';
    form.elements.status.value = university.status || 'active';
  }

  function resetUniversityForm() {
    var api = window.InternGuideAdmin;
    var form = api.getElement('admin-university-form');

    if (!form) {
      return;
    }

    form.reset();
    form.elements.id.value = '';
    form.elements.status.value = 'active';
  }

  function fillDepartmentForm(department) {
    var api = window.InternGuideAdmin;
    var form = api.getElement('admin-department-form');

    if (!form) {
      api.setMessage('admin-universities-message', 'Department form is missing.', 'error');
      return;
    }

    form.elements.university_id.value = selectedUniversityId || '';
    form.elements.id.value = department.id || '';
    form.elements.name.value = department.name || '';
  }

  function resetDepartmentForm() {
    var api = window.InternGuideAdmin;
    var form = api.getElement('admin-department-form');

    if (!form) {
      return;
    }

    form.reset();
    form.elements.university_id.value = selectedUniversityId || '';
    form.elements.id.value = '';
  }

  async function loadUniversities(params) {
    var api = window.InternGuideAdmin;
    var table = api.getElement('admin-universities-table');

    if (!table) {
      api.setMessage('admin-universities-message', 'Universities table is missing.', 'error');
      return;
    }

    var result = await api.listUniversities(Object.assign({ limit: 100 }, params || {}));

    universities = result.universities || [];
    table.innerHTML = renderUniversities(universities);
  }

  async function loadDepartments(universityId) {
    var api = window.InternGuideAdmin;
    var table = api.getElement('admin-departments-table');
    var university = universities.find(function (item) {
      return String(item.id) === String(universityId);
    });

    selectedUniversityId = universityId;
    api.setText('admin-departments-title', university ? 'Departments for ' + university.name : 'Departments');
    resetDepartmentForm();

    if (!table) {
      api.setMessage('admin-universities-message', 'Departments table is missing.', 'error');
      return;
    }

    var result = await api.listDepartments(universityId);
    departments = result.departments || [];
    table.innerHTML = renderDepartments(departments);
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

    try {
      await loadUniversities();
    } catch (error) {
      api.setMessage('admin-universities-message', error.message || 'Unable to load universities.', 'error');
    }

    api.on('admin-university-form', 'submit', async function (event) {
      event.preventDefault();
      api.setMessage('admin-universities-message', '', 'success');

      var data = api.formToObject(event.target);
      var id = data.id;
      delete data.id;

      try {
        if (id) {
          await api.updateUniversity(id, data);
          api.setMessage('admin-universities-message', 'University updated.', 'success');
        } else {
          await api.createUniversity(data);
          api.setMessage('admin-universities-message', 'University created.', 'success');
        }

        resetUniversityForm();
        await loadUniversities();
      } catch (error) {
        api.setMessage('admin-universities-message', error.message || 'Unable to save university.', 'error');
      }
    });

    api.on('admin-university-cancel', 'click', resetUniversityForm);

    api.on('admin-university-search-form', 'submit', async function (event) {
      event.preventDefault();
      var data = api.formToObject(event.target);
      await loadUniversities(data).catch(function (error) {
        api.setMessage('admin-universities-message', error.message || 'Unable to search universities.', 'error');
      });
    });

    api.on('admin-universities-table', 'click', async function (event) {
      var button = event.target.closest('[data-action][data-id]');

      if (!button) {
        return;
      }

      var action = button.dataset.action;
      var id = button.dataset.id;

      if (action === 'edit') {
        var university = universities.find(function (item) {
          return String(item.id) === String(id);
        });
        if (university) {
          fillUniversityForm(university);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }

      if (action === 'departments') {
        await loadDepartments(id).catch(function (error) {
          api.setMessage('admin-universities-message', error.message || 'Unable to load departments.', 'error');
        });
      }

      if (action === 'status') {
        await api
          .updateUniversityStatus(id, button.dataset.status)
          .then(loadUniversities)
          .catch(function (error) {
            api.setMessage('admin-universities-message', error.message || 'Unable to update status.', 'error');
          });
      }
    });

    api.on('admin-department-form', 'submit', async function (event) {
      event.preventDefault();
      api.setMessage('admin-universities-message', '', 'success');

      if (!selectedUniversityId) {
        api.setMessage('admin-universities-message', 'Select a university first.', 'error');
        return;
      }

      var data = api.formToObject(event.target);
      var id = data.id;

      try {
        if (id) {
          await api.updateDepartment(id, { name: data.name });
          api.setMessage('admin-universities-message', 'Department updated.', 'success');
        } else {
          await api.createDepartment(selectedUniversityId, { name: data.name });
          api.setMessage('admin-universities-message', 'Department created.', 'success');
        }

        resetDepartmentForm();
        await loadDepartments(selectedUniversityId);
      } catch (error) {
        api.setMessage('admin-universities-message', error.message || 'Unable to save department.', 'error');
      }
    });

    api.on('admin-departments-table', 'click', async function (event) {
      var button = event.target.closest('[data-department-action][data-id]');

      if (!button) {
        return;
      }

      var action = button.dataset.departmentAction;
      var id = button.dataset.id;

      if (action === 'edit') {
        var department = departments.find(function (item) {
          return String(item.id) === String(id);
        });
        if (department) {
          fillDepartmentForm(department);
        }
      }

      if (action === 'delete' && window.confirm('Delete this department?')) {
        await api
          .deleteDepartment(id)
          .then(function () {
            api.setMessage('admin-universities-message', 'Department deleted.', 'success');
            return loadDepartments(selectedUniversityId);
          })
          .catch(function (error) {
            api.setMessage('admin-universities-message', error.message || 'Unable to delete department.', 'error');
          });
      }
    });
  });
})();
