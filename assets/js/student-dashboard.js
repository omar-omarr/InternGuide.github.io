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

  function formatDate(value) {
    return value
      ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : 'No deadline';
  }

  function statusLabel(status) {
    return {
      submitted: 'Applied',
      reviewed: 'Under Review',
      shortlisted: 'Shortlisted',
      accepted: 'Accepted',
      rejected: 'Rejected',
      pending: 'Pending',
      verified: 'Verified',
      complete: 'Resume Ready',
      missing: 'Resume Missing',
      'not-started': 'Not Started',
    }[status] || status || 'Not Started';
  }

  function badge(status) {
    return '<span class="ig-status-badge ig-status-' + escapeHtml(status || 'neutral') + '">' + escapeHtml(statusLabel(status)) + '</span>';
  }

  function setText(id, value) {
    var element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  function setMessage(text) {
    var message = document.getElementById('student-dashboard-message');
    message.textContent = text || '';
    message.style.display = text ? 'block' : 'none';
    message.style.color = '#cc2229';
  }

  function renderApplications(applications) {
    if (!applications.length) {
      return [
        '<div class="ig-empty-state">',
        '  <span class="ig-empty-state-icon"><i class="fa fa-paper-plane-o"></i></span>',
        '  <h3>No applications yet</h3>',
        '  <p>When you apply to an approved internship, its progress will appear here.</p>',
        '  <a class="ig-button" href="../internship-search.html">Find an Internship</a>',
        '</div>',
      ].join('');
    }

    return applications
      .map(function (application) {
        var detailsLink =
          application.internship_status === 'active' && application.approval_status === 'approved'
            ? '<a class="ig-button ig-button-secondary" href="../internship.html?id=' + encodeURIComponent(application.internship_id) + '">View Details</a>'
            : '<span class="ig-status-badge ig-status-neutral">Listing Closed</span>';

        return [
          '<article class="student-application-card">',
          '  <div class="student-application-main">',
          '    <div class="student-application-title-row"><h3>' + escapeHtml(application.title) + '</h3>' + badge(application.status) + '</div>',
          '    <p><i class="fa fa-building-o"></i> ' + escapeHtml(application.company_name) + '</p>',
          '    <div class="student-application-meta"><span><i class="fa fa-map-marker"></i> ' + escapeHtml(application.location) + '</span><span><i class="fa fa-briefcase"></i> ' + escapeHtml(application.type) + '</span><span><i class="fa fa-calendar-o"></i> Deadline: ' + escapeHtml(formatDate(application.deadline)) + '</span></div>',
          '  </div>',
          '  <div class="student-application-action"><span>Applied ' + escapeHtml(formatDate(application.applied_at)) + '</span>' + detailsLink + '</div>',
          '</article>',
        ].join('');
      })
      .join('');
  }

  function deadlineDate(value) {
    if (!value) {
      return null;
    }

    var rawValue = String(value);
    var date = /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? new Date(rawValue + 'T23:59:59') : new Date(rawValue);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setHours(23, 59, 59, 999);
    return date;
  }

  function renderUpcomingDeadlines(internships) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var upcoming = internships
      .map(function (internship) {
        return { internship: internship, date: deadlineDate(internship.deadline) };
      })
      .filter(function (item) {
        return item.date && item.date >= today;
      })
      .sort(function (left, right) {
        return left.date - right.date;
      })
      .slice(0, 5);

    if (!upcoming.length) {
      return [
        '<div class="ig-empty-state">',
        '  <span class="ig-empty-state-icon"><i class="fa fa-calendar-o"></i></span>',
        '  <h3>No upcoming internship deadlines</h3>',
        '  <p>No upcoming internship deadlines. Browse approved internships to find new opportunities.</p>',
        '  <a class="ig-button" href="../internship-search.html">Browse Approved Internships</a>',
        '</div>',
      ].join('');
    }

    return upcoming
      .map(function (item) {
        var internship = item.internship;
        var month = item.date.toLocaleDateString(undefined, { month: 'short' });
        var day = item.date.toLocaleDateString(undefined, { day: '2-digit' });

        return [
          '<article class="student-deadline-item">',
          '  <div class="student-deadline-date"><span>' + escapeHtml(month) + '</span><strong>' + escapeHtml(day) + '</strong></div>',
          '  <div class="student-deadline-main">',
          '    <span class="student-deadline-label"><i class="fa fa-clock-o"></i> Deadline ' + escapeHtml(formatDate(internship.deadline)) + '</span>',
          '    <h3>' + escapeHtml(internship.title) + '</h3>',
          '    <p><i class="fa fa-building-o"></i> ' + escapeHtml(internship.company_name) + '</p>',
          '    <span class="ig-status-badge ig-status-neutral">' + escapeHtml(internship.type) + '</span>',
          '  </div>',
          '  <a class="ig-button ig-button-secondary" href="../internship.html?id=' + encodeURIComponent(internship.id) + '">View Details</a>',
          '</article>',
        ].join('');
      })
      .join('');
  }

  function activityItem(icon, title, description, status) {
    return [
      '<article class="student-activity-item">',
      '  <span class="student-activity-icon"><i class="fa ' + icon + '"></i></span>',
      '  <div><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(description) + '</p>' + badge(status) + '</div>',
      '</article>',
    ].join('');
  }

  function renderRecentActivity(student, profile, applications) {
    var latestApplication = applications[0];
    var profileStatus = profile ? profile.verification_status : 'not-started';
    var applicationActivity = latestApplication
      ? activityItem('fa-paper-plane-o', 'Latest application', latestApplication.title + ' at ' + latestApplication.company_name, latestApplication.status)
      : activityItem('fa-paper-plane-o', 'Latest application', 'No application activity yet. Browse approved internships to get started.', 'not-started');

    return [
      applicationActivity,
      activityItem(
        'fa-university',
        'University profile',
        profile ? 'Your university profile is currently ' + statusLabel(profileStatus).toLowerCase() + '.' : 'Add your university details to begin verification.',
        profileStatus,
      ),
      activityItem(
        'fa-file-text-o',
        'Resume and profile',
        student.has_resume ? 'Your resume is ready for internship applications.' : 'Upload a resume to complete your application profile.',
        student.has_resume ? 'complete' : 'missing',
      ),
    ].join('');
  }

  async function loadUpcomingDeadlines(api) {
    var list = document.getElementById('student-upcoming-deadlines');

    try {
      var result = await api.listInternships();
      list.innerHTML = renderUpcomingDeadlines(result.internships || []);
    } catch (error) {
      list.innerHTML =
        '<div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-exclamation-circle"></i></span><h3>Upcoming deadlines unavailable</h3><p>Please refresh the page and try again shortly.</p></div>';
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var api = window.InternGuideAPI;
    var user = api.getCurrentUser();

    if (!api.getToken() || !user || user.role !== 'student') {
      window.location.href = '../userlogin.html';
      return;
    }

    loadUpcomingDeadlines(api);

    document.getElementById('student-logout-link').addEventListener('click', function (event) {
      event.preventDefault();
      api.clearSession();
      window.location.href = '../userlogin.html';
    });

    try {
      var result = await api.getStudentDashboard();
      var student = result.student;
      var profile = result.universityProfile;
      var summary = result.summary;

      setText('student-dashboard-name', student.full_name || user.fullName || 'Student');
      setText('student-total-applications', summary.totalApplications);
      setText('student-accepted-applications', summary.acceptedApplications);
      setText('student-shortlisted-applications', summary.shortlistedApplications);
      setText('student-available-internships', summary.availableInternships);
      setText('student-profile-percentage', student.profile_completion + '%');
      document.getElementById('student-profile-progress').style.width = student.profile_completion + '%';
      document.getElementById('student-resume-status').innerHTML = badge(student.has_resume ? 'complete' : 'missing');
      document.getElementById('student-university-status').innerHTML = badge(profile ? profile.verification_status : 'not-started');
      document.getElementById('student-application-list').innerHTML = renderApplications(result.applications || []);
      document.getElementById('student-recent-activity').innerHTML = renderRecentActivity(student, profile, result.applications || []);
    } catch (error) {
      setMessage(error.message || 'Unable to load your dashboard.');
      document.getElementById('student-application-list').innerHTML =
        '<div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-exclamation-circle"></i></span><h3>Dashboard unavailable</h3><p>Please refresh the page and try again.</p></div>';
      document.getElementById('student-recent-activity').innerHTML =
        '<div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-exclamation-circle"></i></span><h3>Activity unavailable</h3><p>Your latest activity could not be loaded. Please refresh and try again.</p></div>';
    }
  });
})();
