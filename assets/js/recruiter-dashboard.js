(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      }[character];
    });
  }

  function setMessage(text, type) {
    var message = document.getElementById('dashboard-message');

    message.textContent = text || '';
    message.style.display = text ? 'block' : 'none';
    message.style.color = type === 'error' ? '#cc2229' : '#168a45';
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleDateString() : '';
  }

  function statusBadge(status, label) {
    return '<span class="ig-status-badge ig-status-' + escapeHtml(status || 'neutral') + '">' + escapeHtml(label || status || 'Unknown') + '</span>';
  }

  function emptyTable(title, text) {
    return [
      '<tr class="portal-table-empty-row"><td colspan="8">',
      '  <div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-briefcase"></i></span>',
      '  <h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(text) + '</p></div>',
      '</td></tr>',
    ].join('');
  }

  function setStatistic(id, value) {
    var element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  function renderStatistics(internships) {
    setStatistic('recruiter-posted-count', internships.length);
    setStatistic(
      'recruiter-active-count',
      internships.filter(function (internship) {
        return internship.status === 'active';
      }).length,
    );
    setStatistic(
      'recruiter-applicant-count',
      internships.reduce(function (total, internship) {
        return total + Number(internship.application_count || 0);
      }, 0),
    );
    setStatistic(
      'recruiter-pending-count',
      internships.filter(function (internship) {
        return internship.approval_status === 'pending';
      }).length,
    );
    setStatistic(
      'recruiter-approved-count',
      internships.filter(function (internship) {
        return internship.approval_status === 'approved';
      }).length,
    );
  }

  function renderVerification(recruiter, form) {
    var status = recruiter && recruiter.verification_status ? recruiter.verification_status : 'pending';
    var badge = document.getElementById('recruiter-verification-status');
    var note = document.getElementById('recruiter-verification-note');
    var approved = status === 'approved';

    badge.className = 'ig-status-badge ig-status-' + status;
    badge.textContent = approved ? 'Verified Company' : status.charAt(0).toUpperCase() + status.slice(1);
    note.textContent = approved
      ? 'Your company is verified. New internships will enter university approval before publication.'
      : status === 'rejected'
        ? 'Verification was rejected. ' + (recruiter.verification_note || 'Contact the system administrator for next steps.')
        : 'Your company is awaiting system-admin verification. Internship publishing is disabled until approval.';

    Array.prototype.forEach.call(form.elements, function (element) {
      element.disabled = !approved;
    });
  }

  function renderNotifications(items) {
    if (!items.length) {
      return '<div class="ig-empty-state"><h3>No notifications</h3><p>Workflow updates will appear here.</p></div>';
    }

    return items
      .map(function (item) {
        return [
          '<article class="portal-notification-item' + (item.is_read ? '' : ' is-unread') + '">',
          '<div><strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.message) + '</p><span>' + escapeHtml(formatDate(item.created_at)) + '</span></div>',
          item.is_read ? '' : '<button class="ig-button ig-button-secondary" type="button" data-notification-id="' + item.id + '">Mark read</button>',
          '</article>',
        ].join('');
      })
      .join('');
  }

  function fillForm(form, internship) {
    Object.keys(internship).forEach(function (key) {
      var field = form.querySelector('[name="' + key + '"]');

      if (field) {
        field.value = key === 'deadline' && internship[key] ? String(internship[key]).slice(0, 10) : internship[key] || '';
      }
    });

    form.querySelector('[name="internship_id"]').value = internship.id || '';
    form.querySelector('[type="submit"]').textContent = internship.id ? 'Update Internship' : 'Post Internship';

    if (window.jQuery && window.jQuery.fn.niceSelect) {
      window.jQuery(form).find('select').niceSelect('update');
    }
  }

  function resetForm(form) {
    form.reset();
    form.querySelector('[name="internship_id"]').value = '';
    form.querySelector('[type="submit"]').textContent = 'Post Internship';

    if (window.jQuery && window.jQuery.fn.niceSelect) {
      window.jQuery(form).find('select').niceSelect('update');
    }
  }

  function renderRows(internships) {
    if (!internships.length) {
      return emptyTable('No internships posted yet', 'Post your first internship to begin the university approval workflow and receive applications.');
    }

    return internships
      .map(function (internship) {
        return [
          '<tr>',
          '  <td>' + escapeHtml(internship.title) + '</td>',
          '  <td>' + escapeHtml(internship.location) + '</td>',
          '  <td>' + escapeHtml(internship.type) + '</td>',
          '  <td>' + escapeHtml(formatDate(internship.deadline)) + '</td>',
          '  <td>' + statusBadge(internship.status, internship.status) + '</td>',
          '  <td>' + statusBadge(internship.approval_status, internship.approval_status === 'not_submitted' ? 'Not Submitted' : internship.approval_status) + '</td>',
          '  <td>' + escapeHtml(internship.application_count || 0) + '</td>',
          '  <td>',
          '    <button class="template-btn" type="button" data-action="edit" data-id="' + internship.id + '">Edit</button>',
          '    <button class="template-btn" type="button" data-action="delete" data-id="' + internship.id + '">Delete</button>',
          '    <a class="template-btn" href="applicants.html?id=' + encodeURIComponent(internship.id) + '">Applicants</a>',
          '  </td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var currentUser = window.InternGuideAPI.getCurrentUser();
    var form = document.getElementById('internship-form');
    var tableBody = document.getElementById('internship-table-body');
    var notifications = document.getElementById('recruiter-notifications');
    var internships = [];

    if (!currentUser || currentUser.role !== 'recruiter') {
      setMessage('Please log in as a recruiter to manage internships.', 'error');
      form.style.display = 'none';
      return;
    }

    async function loadInternships() {
      tableBody.innerHTML = '<tr><td colspan="8">Loading internships...</td></tr>';

      try {
        var result = await window.InternGuideAPI.getRecruiterInternships();
        internships = result.internships || [];
        renderVerification(result.recruiter || {}, form);
        renderStatistics(internships);
        tableBody.innerHTML = renderRows(internships);
      } catch (error) {
        tableBody.innerHTML = emptyTable('Unable to load internships', error.message || 'Refresh the page and try again.');
      }
    }

    async function loadNotifications() {
      try {
        var result = await window.InternGuideAPI.listNotifications({ limit: 8 });
        notifications.innerHTML = renderNotifications(result.notifications || []);
      } catch (error) {
        notifications.innerHTML = '<p>Notifications are unavailable.</p>';
      }
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      setMessage('', 'success');

      var values = window.InternGuideAPI.formToObject(form);
      var id = values.internship_id;
      delete values.internship_id;

      try {
        if (id) {
          await window.InternGuideAPI.updateInternship(id, values);
          setMessage('Internship updated.', 'success');
        } else {
          await window.InternGuideAPI.createInternship(values);
          setMessage('Internship submitted for university approval.', 'success');
        }

        resetForm(form);
        await loadInternships();
      } catch (error) {
        setMessage(error.message || 'Unable to save internship.', 'error');
      }
    });

    document.getElementById('cancel-edit').addEventListener('click', function () {
      resetForm(form);
      setMessage('', 'success');
    });

    tableBody.addEventListener('click', async function (event) {
      var action = event.target.dataset.action;
      var id = event.target.dataset.id;

      if (!action || !id) {
        return;
      }

      if (action === 'edit') {
        var internship = internships.find(function (item) {
          return String(item.id) === String(id);
        });

        if (internship) {
          fillForm(form, internship);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }

      if (action === 'delete' && window.confirm('Delete this internship?')) {
        try {
          await window.InternGuideAPI.deleteInternship(id);
          setMessage('Internship deleted.', 'success');
          await loadInternships();
        } catch (error) {
          setMessage(error.message || 'Unable to delete internship.', 'error');
        }
      }
    });

    document.getElementById('logout-link').addEventListener('click', function (event) {
      event.preventDefault();
      window.InternGuideAPI.clearSession();
      window.location.href = '../recruiter_login.html';
    });

    notifications.addEventListener('click', async function (event) {
      var id = event.target.dataset.notificationId;
      if (id) {
        await window.InternGuideAPI.markNotificationRead(id);
        await loadNotifications();
      }
    });

    document.getElementById('recruiter-read-notifications').addEventListener('click', async function () {
      await window.InternGuideAPI.markAllNotificationsRead();
      await loadNotifications();
    });

    loadInternships();
    loadNotifications();
  });
})();
