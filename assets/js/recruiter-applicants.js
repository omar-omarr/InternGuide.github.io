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
    var message = document.getElementById('applicants-message');

    message.textContent = text || '';
    message.style.display = text ? 'block' : 'none';
    message.style.color = type === 'error' ? '#cc2229' : '#168a45';
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleString() : '';
  }

  function statusLabel(status) {
    return {
      submitted: 'Applied',
      viewed: 'Viewed',
      shortlisted: 'Shortlisted',
      interview_scheduled: 'Interview Scheduled',
      rejected: 'Rejected',
      accepted: 'Accepted',
      withdrawn: 'Withdrawn',
    }[status] || status;
  }

  function statusBadge(status) {
    return '<span class="ig-status-badge ig-status-' + escapeHtml(status) + '" data-status-badge="' + escapeHtml(status) + '">' + escapeHtml(statusLabel(status)) + '</span>';
  }

  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');

    link.href = url;
    link.download = filename || 'resume';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function renderRows(applications) {
    if (!applications.length) {
      return [
        '<tr class="portal-table-empty-row"><td colspan="7">',
        '  <div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-users"></i></span>',
        '  <h3>No applicants yet</h3><p>Student applications, resumes, and review controls will appear here after someone applies.</p></div>',
        '</td></tr>',
      ].join('');
    }

    return applications
      .map(function (application) {
        return [
          '<tr>',
          '  <td>' + escapeHtml(application.full_name) + '</td>',
          '  <td>' + escapeHtml(application.email) + '</td>',
          '  <td>' + escapeHtml(application.major || '') + '</td>',
          '  <td>' + escapeHtml(application.study_year || '') + '</td>',
          '  <td>' + escapeHtml(formatDate(application.applied_at)) + '</td>',
          '  <td><button class="template-btn" type="button" data-download-resume="' + application.id + '">Download</button></td>',
          '  <td><div class="application-status-control">',
          '    ' + statusBadge(application.status),
          '    <select data-application-id="' + application.id + '"' + (application.status === 'withdrawn' ? ' disabled' : '') + '>',
          '      <option value="submitted"' + (application.status === 'submitted' ? ' selected' : '') + '>Applied</option>',
          '      <option value="viewed"' + (application.status === 'viewed' ? ' selected' : '') + '>Viewed</option>',
          '      <option value="shortlisted"' + (application.status === 'shortlisted' ? ' selected' : '') + '>Shortlisted</option>',
          '      <option value="interview_scheduled"' + (application.status === 'interview_scheduled' ? ' selected' : '') + '>Interview Scheduled</option>',
          '      <option value="rejected"' + (application.status === 'rejected' ? ' selected' : '') + '>Rejected</option>',
          '      <option value="accepted"' + (application.status === 'accepted' ? ' selected' : '') + '>Accepted</option>',
          application.status === 'withdrawn' ? '      <option value="withdrawn" selected>Withdrawn</option>' : '',
          '    </select>',
          '  </div></td>',
          '</tr>',
          '<tr>',
          '  <td colspan="7"><strong>Cover letter:</strong> ' + escapeHtml(application.cover_letter || 'No cover letter provided.') +
          '  <div class="ig-form-actions"><a class="ig-button ig-button-secondary" href="../messages.html?application_id=' + encodeURIComponent(application.id) + '">Messages</a></div>' +
          '  <form class="training-inline-form" data-interview-form="' + application.id + '">' +
          '    <h4>Schedule interview</h4><div class="ig-form-grid">' +
          '    <label class="ig-field">Date<input name="interview_date" type="date" value="' + escapeHtml(String(application.interview_date || '').slice(0, 10)) + '" required></label>' +
          '    <label class="ig-field">Time<input name="interview_time" type="time" value="' + escapeHtml(String(application.interview_time || '').slice(0, 5)) + '" required></label>' +
          '    <label class="ig-field">Location<input name="interview_location" value="' + escapeHtml(application.interview_location || '') + '" required></label>' +
          '    <label class="ig-field">Meeting link<input name="meeting_link" type="url" value="' + escapeHtml(application.meeting_link || '') + '"></label>' +
          '    <label class="ig-field ig-field-full">Notes<textarea name="interview_notes">' + escapeHtml(application.interview_notes || '') + '</textarea></label></div>' +
          '    <button class="ig-button" type="submit">Schedule Interview</button>' +
          '  </form></td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var currentUser = window.InternGuideAPI.getCurrentUser();
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    var tableBody = document.getElementById('applicants-table-body');
    var title = document.getElementById('applicants-title');

    if (!currentUser || currentUser.role !== 'recruiter') {
      setMessage('Please log in as a recruiter to view applicants.', 'error');
      return;
    }

    if (!id) {
      setMessage('Missing internship id.', 'error');
      return;
    }

    try {
      var result = await window.InternGuideAPI.getApplicants(id);
      title.textContent = 'Applicants for ' + result.internship.title;
      tableBody.innerHTML = renderRows(result.applications || []);
    } catch (error) {
      setMessage(error.message || 'Unable to load applicants.', 'error');
    }

    tableBody.addEventListener('change', async function (event) {
      var applicationId = event.target.dataset.applicationId;

      if (!applicationId) {
        return;
      }

      try {
        await window.InternGuideAPI.updateApplicationStatus(applicationId, event.target.value);
        var badge = event.target.parentElement.querySelector('[data-status-badge]');
        if (badge) {
          badge.className = 'ig-status-badge ig-status-' + event.target.value;
          badge.dataset.statusBadge = event.target.value;
          badge.textContent = statusLabel(event.target.value);
        }
        setMessage('Application status updated.', 'success');
      } catch (error) {
        setMessage(error.message || 'Unable to update status.', 'error');
      }
    });

    tableBody.addEventListener('click', async function (event) {
      var applicationId = event.target.dataset.downloadResume;

      if (!applicationId) {
        return;
      }

      try {
        var file = await window.InternGuideAPI.downloadApplicationResume(applicationId);
        saveBlob(file.blob, file.filename);
        setMessage('Resume download started.', 'success');
      } catch (error) {
        setMessage(error.message || 'Unable to download resume.', 'error');
      }
    });

    tableBody.addEventListener('submit', async function (event) {
      var applicationId = event.target.dataset.interviewForm;

      if (!applicationId) {
        return;
      }

      event.preventDefault();

      try {
        await window.InternGuideAPI.scheduleInterview(applicationId, window.InternGuideAPI.formToObject(event.target));
        setMessage('Interview scheduled and student notified.', 'success');
        var result = await window.InternGuideAPI.getApplicants(id);
        tableBody.innerHTML = renderRows(result.applications || []);
      } catch (error) {
        setMessage(error.message || 'Unable to schedule interview.', 'error');
      }
    });

    document.getElementById('logout-link').addEventListener('click', function (event) {
      event.preventDefault();
      window.InternGuideAPI.clearSession();
      window.location.href = '../recruiter_login.html';
    });
  });
})();
