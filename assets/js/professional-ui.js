(function () {
  'use strict';

  var tokenKey = 'internguide_token';
  var userKey = 'internguide_user';

  function getSession() {
    var token = localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey);
    var user = null;

    try {
      user = JSON.parse(localStorage.getItem(userKey) || sessionStorage.getItem(userKey) || 'null');
    } catch (error) {
      user = null;
    }

    return token && user && (user.role === 'student' || user.role === 'recruiter') ? user : null;
  }

  function clearSession() {
    if (window.InternGuideAPI && window.InternGuideAPI.clearSession) {
      window.InternGuideAPI.clearSession();
    }

    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(userKey);
  }

  function link(prefix, href, label, className) {
    return '<li><a' + (className ? ' class="' + className + '"' : '') + ' href="' + prefix + href + '">' + label + '</a></li>';
  }

  function publicNavigation(prefix) {
    return [
      link(prefix, 'index.html', 'Home'),
      link(prefix, 'about.html', 'About Us'),
      link(prefix, 'internship-search.html', 'Find Internship'),
      link(prefix, 'contact-us.html', 'Contact'),
      link(prefix, 'resume-search.html', 'Find Candidates'),
      '<li><a href="#" aria-haspopup="true" aria-expanded="false">Sign In <i class="fa fa-angle-down"></i></a><ul class="ig-subnav">',
      link(prefix, 'userlogin.html', 'Student Login'),
      link(prefix, 'recruiter_login.html', 'Recruiter Login'),
      link(prefix, 'university/login.html', 'University Admin Login'),
      link(prefix, 'admin/login.html', 'System Admin Login'),
      '</ul></li>',
      '<li><a class="ig-nav-cta" href="#" aria-haspopup="true" aria-expanded="false">Sign Up <i class="fa fa-angle-down"></i></a><ul class="ig-subnav ig-subnav-end">',
      link(prefix, 'user_signup.html', 'Student Sign Up'),
      link(prefix, 'recruiter_signup.html', 'Recruiter Sign Up'),
      '</ul></li>',
    ].join('');
  }

  function studentNavigation(prefix) {
    return [
      link(prefix, 'index.html', 'Home'),
      link(prefix, 'internship-search.html', 'Browse Internships'),
      link(prefix, 'student-university.html', 'University Profile'),
      link(prefix, 'student/dashboard.html', 'Dashboard'),
      '<li><a class="ig-nav-cta" href="#" id="student-logout-link" data-ig-logout>Logout</a></li>',
    ].join('');
  }

  function recruiterNavigation(prefix) {
    return [
      link(prefix, 'index.html', 'Home'),
      link(prefix, 'recruiter/dashboard.html', 'Dashboard'),
      link(prefix, 'recruiter/dashboard.html#internship-form', 'Post Internship'),
      link(prefix, 'recruiter/dashboard.html#my-internships', 'Applicants'),
      link(prefix, 'resume-search.html', 'Find Candidates'),
      '<li><a class="ig-nav-cta" href="#" id="logout-link" data-ig-logout>Logout</a></li>',
    ].join('');
  }

  function renderNavigation() {
    var session = getSession();
    var nestedPage = /\/(?:student|recruiter)\//.test(window.location.pathname);
    var prefix = nestedPage ? '../' : '';

    Array.prototype.forEach.call(document.querySelectorAll('.ig-nav'), function (nav) {
      if (session && session.role === 'student') {
        nav.innerHTML = studentNavigation(prefix);
      } else if (session && session.role === 'recruiter') {
        nav.innerHTML = recruiterNavigation(prefix);
      } else {
        nav.innerHTML = publicNavigation(prefix);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var toggles = document.querySelectorAll('[data-ig-menu-toggle]');
    renderNavigation();

    var submenuParents = Array.prototype.filter.call(document.querySelectorAll('.ig-nav > li'), function (item) {
      return item.querySelector(':scope > .ig-subnav');
    });

    function closeSubmenus(except) {
      Array.prototype.forEach.call(submenuParents, function (parent) {
        if (parent !== except) {
          parent.classList.remove('is-subnav-open');
          var trigger = parent.querySelector(':scope > a[aria-haspopup="true"]');
          if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
          }
        }
      });
    }

    Array.prototype.forEach.call(toggles, function (toggle) {
      var nav = document.getElementById(toggle.getAttribute('aria-controls'));

      if (!nav) {
        return;
      }

      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
        if (!open) {
          closeSubmenus();
        }
      });

      nav.addEventListener('click', function (event) {
        var link = event.target.closest('a');
        var submenuParent = link && link.parentElement && link.parentElement.querySelector(':scope > .ig-subnav');

        if (link && submenuParent) {
          event.preventDefault();
          var parent = link.parentElement;
          var open = !parent.classList.contains('is-subnav-open');
          closeSubmenus(parent);
          parent.classList.toggle('is-subnav-open', open);
          link.setAttribute('aria-expanded', String(open));
          return;
        }

        if (link && window.innerWidth <= 980) {
          nav.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          closeSubmenus();
        }
      });
    });

    document.addEventListener('click', function (event) {
      var logout = event.target.closest('[data-ig-logout]');

      if (logout) {
        event.preventDefault();
        clearSession();
        window.location.href = /\/(?:student|recruiter)\//.test(window.location.pathname) ? '../index.html' : 'index.html';
        return;
      }

      Array.prototype.forEach.call(submenuParents, function (parent) {
        if (!parent.contains(event.target)) {
          parent.classList.remove('is-subnav-open');
          var trigger = parent.querySelector(':scope > a[aria-haspopup="true"]');
          if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
          }
        }
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeSubmenus();
        Array.prototype.forEach.call(toggles, function (toggle) {
          var nav = document.getElementById(toggle.getAttribute('aria-controls'));
          if (nav) {
            nav.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
          }
        });
      }
    });
  });
})();
