(function () {
  'use strict';

  var currentProfile = null;

  function getElement(id) {
    return document.getElementById(id);
  }

  function setMessage(text, type) {
    var message = getElement('student-university-message');

    if (!message) {
      return;
    }

    message.textContent = text || '';
    message.style.display = text ? 'block' : 'none';
    message.style.color = type === 'error' ? '#cc2229' : '#168a45';
    message.style.background = type === 'error' ? '#fef3f2' : '#ecfdf3';
    message.style.borderColor = type === 'error' ? '#fecdca' : '#abefc6';
    message.style.borderLeftColor = type === 'error' ? '#cc2229' : '#168a45';
  }

  function setStatus(profile) {
    var status = getElement('student-university-status');

    if (!status) {
      return;
    }

    if (!profile) {
      status.textContent = 'No profile submitted';
      return;
    }

    status.textContent = 'Status: ' + profile.verification_status + (profile.rejection_reason ? ' - ' + profile.rejection_reason : '');
  }

  function setFormDisabled(disabled) {
    var form = getElement('student-university-form');

    if (!form) {
      return;
    }

    Array.prototype.forEach.call(form.elements, function (element) {
      element.disabled = disabled;
    });
  }

  async function loadDepartments(universityId, selectedDepartmentId) {
    var api = window.InternGuideAPI;
    var select = getElement('student-department-id');

    if (!select) {
      return;
    }

    select.innerHTML = '<option value="">Loading departments...</option>';

    if (!universityId) {
      select.innerHTML = '<option value="">Select a university first</option>';
      return;
    }

    try {
      var result = await api.listUniversityDepartments(universityId);
      var departments = result.departments || [];
      select.innerHTML =
        '<option value="">No department selected</option>' +
        departments
          .map(function (department) {
            var selected = String(department.id) === String(selectedDepartmentId) ? ' selected' : '';
            return '<option value="' + department.id + '"' + selected + '>' + department.name + '</option>';
          })
          .join('');
    } catch (error) {
      select.innerHTML = '<option value="">Unable to load departments</option>';
      setMessage(error.message || 'Unable to load departments.', 'error');
    }
  }

  async function loadUniversities(selectedUniversityId) {
    var api = window.InternGuideAPI;
    var select = getElement('student-university-id');

    if (!select) {
      return;
    }

    var result = await api.listUniversities();
    var universities = result.universities || [];
    select.innerHTML =
      '<option value="">Select a university</option>' +
      universities
        .map(function (university) {
          var selected = String(university.id) === String(selectedUniversityId) ? ' selected' : '';
          return '<option value="' + university.id + '"' + selected + '>' + university.name + '</option>';
        })
        .join('');
  }

  async function loadProfile() {
    var api = window.InternGuideAPI;
    var result = await api.getStudentUniversityProfile();
    var form = getElement('student-university-form');

    currentProfile = result.profile || null;
    setStatus(currentProfile);

    await loadUniversities(currentProfile && currentProfile.university_id);
    await loadDepartments(currentProfile && currentProfile.university_id, currentProfile && currentProfile.department_id);

    if (form && currentProfile) {
      form.elements.university_id.value = currentProfile.university_id || '';
      form.elements.department_id.value = currentProfile.department_id || '';
      form.elements.student_number.value = currentProfile.student_number || '';
    }

    if (currentProfile && currentProfile.verification_status === 'verified') {
      setFormDisabled(true);
      setMessage('Your university profile is verified and cannot be edited.', 'success');
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var api = window.InternGuideAPI;
    var user = api && api.getCurrentUser ? api.getCurrentUser() : null;
    var form = getElement('student-university-form');

    if (!api) {
      setMessage('Student scripts did not load. Refresh the page and try again.', 'error');
      return;
    }

    if (!api.getToken() || !user || user.role !== 'student') {
      window.location.href = 'userlogin.html';
      return;
    }

    if (!form) {
      setMessage('University profile form is missing.', 'error');
      return;
    }

    await loadProfile().catch(function (error) {
      setMessage(error.message || 'Unable to load your university profile.', 'error');
      loadUniversities();
    });

    var universitySelect = getElement('student-university-id');

    if (universitySelect) {
      universitySelect.addEventListener('change', function () {
        loadDepartments(universitySelect.value);
      });
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      setMessage('', 'success');

      var button = form.querySelector('[type="submit"]');
      var originalText = button ? button.textContent : '';

      if (button) {
        button.disabled = true;
        button.textContent = 'Please wait...';
      }

      try {
        var data = api.formToObject(form);
        var result = currentProfile
          ? await api.updateStudentUniversityProfile(data)
          : await api.createStudentUniversityProfile(data);

        setMessage(result.message || 'University profile saved.', 'success');
        await loadProfile();
      } catch (error) {
        setMessage(error.message || 'Unable to save university profile.', 'error');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = originalText;
        }
      }
    });
  });
})();
