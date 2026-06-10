(function () {
  'use strict';

  function resolveApiBase() {
    var configuredBase = window.INTERNGUIDE_API_BASE || localStorage.getItem('internguide_api_base');
    var localHosts = ['localhost', '127.0.0.1', '[::1]'];

    if (configuredBase) {
      return configuredBase.replace(/\/$/, '');
    }

    if (window.location.protocol === 'file:' || localHosts.indexOf(window.location.hostname) !== -1) {
      return 'http://localhost:5000/api';
    }

    return '';
  }

  var API_BASE = resolveApiBase();
  var tokenKey = 'internguide_admin_token';
  var userKey = 'internguide_admin_user';

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
    return value ? new Date(value).toLocaleString() : '';
  }

  function getElement(id) {
    return document.getElementById(id);
  }

  function getToken() {
    return localStorage.getItem(tokenKey);
  }

  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem(userKey) || 'null');
    } catch (error) {
      return null;
    }
  }

  function saveSession(token, user) {
    localStorage.setItem(tokenKey, token);
    localStorage.setItem(userKey, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
  }

  function redirectToLogin() {
    if (window.location.pathname !== '/admin/login.html') {
      window.location.href = '/admin/login.html';
    }
  }

  function buildQuery(params) {
    var searchParams = new URLSearchParams();

    Object.keys(params || {}).forEach(function (key) {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        searchParams.set(key, params[key]);
      }
    });

    var query = searchParams.toString();
    return query ? '?' + query : '';
  }

  function parseResponseText(text) {
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return { message: 'Server returned an unreadable response.' };
    }
  }

  function formatErrorMessage(data) {
    if (data && data.errors && data.errors.length) {
      return (
        (data.message || 'Validation failed.') +
        ' ' +
        data.errors
          .map(function (error) {
            return (error.field ? error.field + ': ' : '') + error.message;
          })
          .join(' ')
      );
    }

    return (data && data.message) || 'Request failed.';
  }

  async function request(path, options) {
    if (!API_BASE) {
      throw new Error('Backend API is not configured for this deployed site.');
    }

    var requestOptions = options || {};
    var headers = requestOptions.headers ? Object.assign({}, requestOptions.headers) : {};
    var body = requestOptions.body;

    if (requestOptions.auth) {
      var token = getToken();

      if (token) {
        headers.Authorization = 'Bearer ' + token;
      }
    }

    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    var response = await fetch(API_BASE + path, {
      method: requestOptions.method || 'GET',
      headers: headers,
      body: body,
    });
    var text = await response.text();
    var data = parseResponseText(text);

    if (!response.ok) {
      var error = new Error(formatErrorMessage(data));
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  function formToObject(form) {
    var values = {};

    if (!form) {
      return values;
    }

    var formData = new FormData(form);

    formData.forEach(function (value, key) {
      if (!(value instanceof File)) {
        values[key] = value;
      }
    });

    return values;
  }

  function setMessage(id, text, type) {
    var message = getElement(id);

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

  function setHtml(id, html) {
    var element = getElement(id);

    if (!element) {
      return false;
    }

    element.innerHTML = html;
    return true;
  }

  function setText(id, text) {
    var element = getElement(id);

    if (!element) {
      return false;
    }

    element.textContent = text || '';
    return true;
  }

  function on(id, eventName, handler) {
    var element = getElement(id);

    if (!element) {
      return null;
    }

    element.addEventListener(eventName, handler);
    return element;
  }

  async function ensureSystemAdmin() {
    var token = getToken();

    if (!token) {
      redirectToLogin();
      return null;
    }

    try {
      var result = await request('/admin-auth/me', { auth: true });

      if (!result.user || result.user.role !== 'system_admin') {
        clearSession();
        redirectToLogin();
        return null;
      }

      saveSession(token, result.user);
      return result.user;
    } catch (error) {
      clearSession();
      redirectToLogin();
      return null;
    }
  }

  function attachLogout() {
    var logout = getElement('admin-logout-link');

    if (!logout) {
      return;
    }

    logout.addEventListener('click', function (event) {
      event.preventDefault();
      clearSession();
      window.location.href = '/admin/login.html';
    });
  }

  window.InternGuideAdmin = {
    apiBase: API_BASE,
    attachLogout: attachLogout,
    buildQuery: buildQuery,
    clearSession: clearSession,
    ensureSystemAdmin: ensureSystemAdmin,
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    formToObject: formToObject,
    getCurrentUser: getCurrentUser,
    getElement: getElement,
    getToken: getToken,
    on: on,
    redirectToLogin: redirectToLogin,
    request: request,
    saveSession: saveSession,
    setMessage: setMessage,
    setHtml: setHtml,
    setText: setText,
    me: function () {
      return request('/admin-auth/me', { auth: true });
    },
    login: function (data) {
      return request('/admin-auth/login', { method: 'POST', body: data });
    },
    dashboard: function () {
      return request('/system-admin/dashboard', { auth: true });
    },
    listUniversities: function (params) {
      return request('/system-admin/universities' + buildQuery(params), { auth: true });
    },
    createUniversity: function (data) {
      return request('/system-admin/universities', { method: 'POST', body: data, auth: true });
    },
    getUniversity: function (id) {
      return request('/system-admin/universities/' + encodeURIComponent(id), { auth: true });
    },
    updateUniversity: function (id, data) {
      return request('/system-admin/universities/' + encodeURIComponent(id), { method: 'PATCH', body: data, auth: true });
    },
    updateUniversityStatus: function (id, status) {
      return request('/system-admin/universities/' + encodeURIComponent(id) + '/status', {
        method: 'PATCH',
        body: { status: status },
        auth: true,
      });
    },
    listDepartments: function (universityId) {
      return request('/system-admin/universities/' + encodeURIComponent(universityId) + '/departments', { auth: true });
    },
    createDepartment: function (universityId, data) {
      return request('/system-admin/universities/' + encodeURIComponent(universityId) + '/departments', {
        method: 'POST',
        body: data,
        auth: true,
      });
    },
    updateDepartment: function (id, data) {
      return request('/system-admin/departments/' + encodeURIComponent(id), { method: 'PATCH', body: data, auth: true });
    },
    deleteDepartment: function (id) {
      return request('/system-admin/departments/' + encodeURIComponent(id), { method: 'DELETE', auth: true });
    },
    listRecruiterVerifications: function (params) {
      return request('/system-admin/recruiter-verifications' + buildQuery(params), { auth: true });
    },
    getRecruiterVerification: function (id) {
      return request('/system-admin/recruiter-verifications/' + encodeURIComponent(id), { auth: true });
    },
    reviewRecruiterVerification: function (id, data) {
      return request('/system-admin/recruiter-verifications/' + encodeURIComponent(id) + '/review', {
        method: 'PATCH',
        body: data,
        auth: true,
      });
    },
    listInternships: function (params) {
      return request('/system-admin/internships' + buildQuery(params), { auth: true });
    },
    getInternship: function (id) {
      return request('/system-admin/internships/' + encodeURIComponent(id), { auth: true });
    },
    reviewInternshipApproval: function (id, data) {
      return request('/system-admin/internship-approvals/' + encodeURIComponent(id) + '/review', {
        method: 'PATCH',
        body: data,
        auth: true,
      });
    },
    closeInternship: function (id) {
      return request('/system-admin/internships/' + encodeURIComponent(id) + '/close', { method: 'PATCH', auth: true });
    },
    reopenInternship: function (id) {
      return request('/system-admin/internships/' + encodeURIComponent(id) + '/reopen', { method: 'PATCH', auth: true });
    },
    listStudents: function (params) {
      return request('/system-admin/students' + buildQuery(params), { auth: true });
    },
    listRecruiters: function (params) {
      return request('/system-admin/recruiters' + buildQuery(params), { auth: true });
    },
    listApplications: function (params) {
      return request('/system-admin/applications' + buildQuery(params), { auth: true });
    },
    listNotifications: function (params) {
      return request('/notifications' + buildQuery(params), { auth: true });
    },
    markNotificationRead: function (id) {
      return request('/notifications/' + encodeURIComponent(id) + '/read', { method: 'PATCH', auth: true });
    },
    markAllNotificationsRead: function () {
      return request('/notifications/read-all', { method: 'PATCH', auth: true });
    },
    listAuditLogs: function (params) {
      return request('/system-admin/audit-logs' + buildQuery(params), { auth: true });
    },
  };
})();
