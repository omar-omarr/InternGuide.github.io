(function () {
  'use strict';

  var labels = [
    ['totalLinkedStudents', 'Linked students'],
    ['pendingStudentVerifications', 'Pending student verifications'],
    ['verifiedStudents', 'Verified students'],
    ['rejectedStudentVerifications', 'Rejected student verifications'],
    ['pendingInternshipApprovals', 'Pending internship approvals'],
    ['approvedInternshipApprovals', 'Approved internship approvals'],
    ['rejectedInternshipApprovals', 'Rejected internship approvals'],
    ['totalRelatedApplications', 'Related applications'],
    ['unreadNotifications', 'Unread notifications'],
  ];

  function showSetupError(text) {
    var message = document.getElementById('university-dashboard-message');

    if (message) {
      message.textContent = text;
      message.style.display = 'block';
    }
  }

  function renderCards(summary) {
    var api = window.InternGuideUniversity;

    return labels
      .map(function (item) {
        return [
          '<div class="admin-stat-card">',
          '  <span>' + api.escapeHtml(item[1]) + '</span>',
          '  <strong>' + api.escapeHtml(summary[item[0]] || 0) + '</strong>',
          '</div>',
        ].join('');
      })
      .join('');
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var api = window.InternGuideUniversity;

    if (!api) {
      showSetupError('University admin scripts did not load. Refresh the page and try again.');
      return;
    }

    var cards = api.getElement('university-dashboard-cards');

    if (!cards) {
      api.setMessage('university-dashboard-message', 'Dashboard content container is missing.', 'error');
      return;
    }

    var user = await api.ensureUniversityAdmin();

    if (!user) {
      return;
    }

    api.attachLogout();

    try {
      var result = await api.dashboard();
      var university = result.university || {};

      api.setText('university-dashboard-title', university.name || 'University summary');
      api.setText('university-dashboard-meta', [university.location, university.email_domain].filter(Boolean).join(' | '));
      cards.innerHTML = renderCards(result.summary || {});
    } catch (error) {
      api.setMessage('university-dashboard-message', error.message || 'Unable to load dashboard.', 'error');
      cards.innerHTML = '<div class="admin-stat-card"><span>Dashboard</span><strong>Unavailable</strong></div>';
    }
  });
})();
