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
    if (!value) {
      return 'Open deadline';
    }

    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function setMessage(text, type) {
    var message = document.getElementById('apply-message');

    if (!message) {
      return;
    }

    message.textContent = text || '';
    message.style.display = text ? 'block' : 'none';
    message.style.color = type === 'error' ? '#cc2229' : '#168a45';
  }

  function renderDetails(internship) {
    return [
      '<div class="single-job mb-4">',
      '  <div class="job-text">',
      '    <span class="ig-approved-badge"><i class="fa fa-check-circle"></i> University Approved</span>',
      '    <h3>' + escapeHtml(internship.title) + '</h3>',
      '    <ul class="mt-4">',
      '      <li class="mb-3"><h5><i class="fa fa-building"></i> ' + escapeHtml(internship.company_name) + '</h5></li>',
      '      <li class="mb-3"><h5><i class="fa fa-map-marker"></i> ' + escapeHtml(internship.location) + '</h5></li>',
      '      <li class="mb-3"><h5><i class="fa fa-pie-chart"></i> ' + escapeHtml(internship.category || 'General') + '</h5></li>',
      '      <li class="mb-3"><h5><i class="fa fa-briefcase"></i> ' + escapeHtml(internship.type) + '</h5></li>',
      '      <li><h5><i class="fa fa-clock-o"></i> Deadline: ' + escapeHtml(formatDate(internship.deadline)) + '</h5></li>',
      '    </ul>',
      '    <h4 class="mt-5 mb-3">Description</h4>',
      '    <p>' + escapeHtml(internship.description) + '</p>',
      '    <h4 class="mt-4 mb-3">Requirements</h4>',
      '    <p>' + escapeHtml(internship.requirements || 'No specific requirements provided.') + '</p>',
      '    <h4 class="mt-4 mb-3">Stipend</h4>',
      '    <p>' + escapeHtml(internship.stipend || 'Not specified') + '</p>',
      '  </div>',
      '</div>',
    ].join('');
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    var details = document.getElementById('internship-details');
    var form = document.getElementById('application-form');
    var currentUser = window.InternGuideAPI.getCurrentUser();

    if (!id) {
      details.innerHTML = '<div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-exclamation-circle"></i></span><h3>Internship not selected</h3><p>Return to internship search and choose an approved opportunity.</p></div>';
      form.style.display = 'none';
      return;
    }

    if (!currentUser || currentUser.role !== 'student') {
      setMessage('Log in as a student before applying.', 'error');
    }

    try {
      var result = await window.InternGuideAPI.getInternship(id);
      details.innerHTML = renderDetails(result.internship);
    } catch (error) {
      details.innerHTML = '<div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-exclamation-circle"></i></span><h3>Unable to load internship</h3><p>' + escapeHtml(error.message) + '</p></div>';
      form.style.display = 'none';
      return;
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      setMessage('', 'success');

      var button = form.querySelector('[type="submit"]');
      var originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Submitting...';

      try {
        await window.InternGuideAPI.applyToInternship(id, new FormData(form));
        form.reset();
        setMessage('Application submitted successfully.', 'success');
      } catch (error) {
        setMessage(error.message || 'Unable to submit application.', 'error');
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
})();
