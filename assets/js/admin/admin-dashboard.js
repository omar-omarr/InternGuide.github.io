(function () {
  'use strict';

  var labels = [
    ['totalStudents', 'Students'],
    ['totalRecruiters', 'Recruiters'],
    ['totalUniversities', 'Universities'],
    ['totalInternships', 'Internships'],
    ['totalApplications', 'Applications'],
    ['pendingRecruiterVerifications', 'Pending recruiter verifications'],
    ['pendingStudentUniversityVerifications', 'Pending student verifications'],
    ['pendingInternshipUniversityApprovals', 'Pending internship approvals'],
  ];

  function showSetupError(text) {
    var message = document.getElementById('admin-dashboard-message');

    if (message) {
      message.textContent = text;
      message.style.display = 'block';
    }
  }

  function renderCards(summary) {
    var api = window.InternGuideAdmin;

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
    var api = window.InternGuideAdmin;

    if (!api) {
      showSetupError('Admin scripts did not load. Refresh the page and try again.');
      return;
    }

    var cards = api.getElement('admin-dashboard-cards');

    if (!cards) {
      api.setMessage('admin-dashboard-message', 'Dashboard content container is missing.', 'error');
      return;
    }

    var user = await api.ensureSystemAdmin();

    if (!user) {
      return;
    }

    api.attachLogout();

    try {
      var result = await api.dashboard();
      cards.innerHTML = renderCards(result.summary || {});
    } catch (error) {
      api.setMessage('admin-dashboard-message', error.message || 'Unable to load dashboard.', 'error');
      cards.innerHTML = '<div class="admin-stat-card"><span>Dashboard</span><strong>Unavailable</strong></div>';
    }
  });
})();
