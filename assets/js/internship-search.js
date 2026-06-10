(function () {
  'use strict';

  var images = ['job1.png', 'job2.png', 'job3.png', 'job4.png', 'job5.png'];
  var searchFallbackHtml = '';

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

  function renderInternship(internship, index) {
    var image = images[index % images.length];
    var category = internship.category || 'General';

    return [
      '<div class="single-job mb-4 d-lg-flex justify-content-between">',
      '  <div class="job-text">',
      '    <span class="ig-approved-badge"><i class="fa fa-check-circle"></i> University Approved</span>',
      '    <h4><a href="internship.html?id=' + encodeURIComponent(internship.id) + '">' + escapeHtml(internship.title) + '</a></h4>',
      '    <ul class="mt-4">',
      '      <li class="mb-3"><h5><i class="fa fa-map-marker"></i> ' + escapeHtml(internship.location) + '</h5></li>',
      '      <li class="mb-3"><h5><i class="fa fa-pie-chart"></i> ' + escapeHtml(category) + ' at ' + escapeHtml(internship.company_name) + '</h5></li>',
      '      <li><h5><i class="fa fa-clock-o"></i> Deadline: ' + escapeHtml(formatDate(internship.deadline)) + '</h5></li>',
      '    </ul>',
      '  </div>',
      '  <div class="job-img align-self-center">',
      '    <img src="assets/images/' + image + '" alt="Internship">',
      '  </div>',
      '  <div class="job-btn align-self-center">',
      '    <a href="internship.html?id=' + encodeURIComponent(internship.id) + '" class="third-btn job-btn1">' + escapeHtml(internship.type) + '</a>',
      '    <a href="internship.html?id=' + encodeURIComponent(internship.id) + '" class="third-btn">details</a>',
      '  </div>',
      '</div>',
    ].join('');
  }

  function renderHomeInternship(internship) {
    return [
      '<article class="homepage-internship-card">',
      '  <div class="homepage-internship-card-top">',
      '    <span class="ig-approved-badge"><i class="fa fa-check-circle"></i> University Approved</span>',
      '    <span class="homepage-internship-location"><i class="fa fa-map-marker"></i> ' + escapeHtml(internship.location) + '</span>',
      '  </div>',
      '  <h3><a href="internship.html?id=' + encodeURIComponent(internship.id) + '">' + escapeHtml(internship.title) + '</a></h3>',
      '  <p class="homepage-internship-company"><i class="fa fa-building-o"></i> ' + escapeHtml(internship.company_name) + '</p>',
      '  <p><span class="homepage-internship-type">' + escapeHtml(internship.type) + '</span></p>',
      '  <div class="homepage-internship-card-bottom">',
      '    <span><i class="fa fa-calendar-o"></i> ' + escapeHtml(formatDate(internship.deadline)) + '</span>',
      '    <a href="internship.html?id=' + encodeURIComponent(internship.id) + '" class="homepage-card-details">Details <i class="fa fa-arrow-right"></i></a>',
      '  </div>',
      '</article>',
    ].join('');
  }

  function getFilters(form) {
    return {
      type: form.querySelector('[name="type"]').value,
      location: form.querySelector('[name="location"]').value,
      keyword: form.querySelector('[name="keyword"]').value.trim(),
    };
  }

  async function loadInternships(form) {
    var list = document.getElementById('internship-list');
    var count = document.getElementById('internship-result-count');
    if (!searchFallbackHtml) {
      searchFallbackHtml = list.innerHTML;
    }

    list.innerHTML = '<div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-spinner fa-spin"></i></span><h3>Loading approved internships</h3><p>The latest university-approved opportunities will appear here.</p></div>';

    try {
      var result = await window.InternGuideAPI.listInternships(getFilters(form));
      var internships = result.internships || [];

      count.textContent = internships.length + ' Results found';

      if (!internships.length) {
        list.innerHTML = '<div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-search"></i></span><h3>No approved internships found</h3><p>Try a different keyword, type, or location.</p></div>';
        return;
      }

      list.innerHTML = internships.map(renderInternship).join('');
    } catch (error) {
      count.textContent = 'Internships unavailable';
      list.innerHTML = '<div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-exclamation-circle"></i></span><h3>Unable to load internships</h3><p>Please refresh the page and try again shortly.</p></div>';
    }
  }

  async function loadHomeInternships() {
    var list = document.getElementById('home-internship-list');

    if (!list) {
      return;
    }

    list.innerHTML = '<div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-spinner fa-spin"></i></span><h3>Loading approved internships</h3><p>The latest opportunities will appear here.</p></div>';

    try {
      var result = await window.InternGuideAPI.listInternships();
      var internships = (result.internships || []).slice(0, 3);

      list.innerHTML = internships.length
        ? internships.map(renderHomeInternship).join('')
        : '<div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-briefcase"></i></span><h3>No approved internships yet</h3><p>New university-approved opportunities will appear here.</p></div>';
    } catch (error) {
      list.innerHTML = '<div class="ig-empty-state"><span class="ig-empty-state-icon"><i class="fa fa-exclamation-circle"></i></span><h3>Internships temporarily unavailable</h3><p>Please try again shortly.</p></div>';
    }
  }

  function applySearchParams(form) {
    var params = new URLSearchParams(window.location.search);

    ['type', 'location', 'keyword'].forEach(function (name) {
      var field = form.querySelector('[name="' + name + '"]');

      if (field && params.get(name)) {
        field.value = params.get(name);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('internship-search-form');

    if (form) {
      applySearchParams(form);

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        loadInternships(form);
      });

      loadInternships(form);
    }

    loadHomeInternships();
  });
})();
