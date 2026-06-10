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
  var tokenKey = 'internguide_token';
  var userKey = 'internguide_user';

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

  function buildQuery(params) {
    var searchParams = new URLSearchParams();

    Object.keys(params || {}).forEach(function (key) {
      if (params[key]) {
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

  function filenameFromDisposition(header) {
    var match = header && header.match(/filename="?([^"]+)"?/i);
    return match ? match[1] : 'resume';
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

  async function download(path) {
    if (!API_BASE) {
      throw new Error('Backend API is not configured for this deployed site.');
    }

    var token = getToken();

    if (!token) {
      throw new Error('Authentication token is required.');
    }

    var response = await fetch(API_BASE + path, {
      headers: {
        Authorization: 'Bearer ' + token,
      },
    });

    if (!response.ok) {
      var text = await response.text();
      var data = parseResponseText(text);
      var error = new Error(formatErrorMessage(data));
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return {
      blob: await response.blob(),
      filename: filenameFromDisposition(response.headers.get('Content-Disposition')),
    };
  }

  function formToObject(form) {
    var values = {};
    var formData = new FormData(form);

    formData.forEach(function (value, key) {
      if (!(value instanceof File)) {
        values[key] = value;
      }
    });

    return values;
  }

  window.InternGuideAPI = {
    apiBase: API_BASE,
    getToken: getToken,
    getCurrentUser: getCurrentUser,
    saveSession: saveSession,
    clearSession: clearSession,
    formToObject: formToObject,
    studentSignup: function (formData) {
      return request('/auth/signup', { method: 'POST', body: formData });
    },
    studentLogin: function (data) {
      return request('/auth/login', { method: 'POST', body: data });
    },
    recruiterSignup: function (data) {
      return request('/auth/recruiter/signup', { method: 'POST', body: data });
    },
    recruiterLogin: function (data) {
      return request('/auth/recruiter/login', { method: 'POST', body: data });
    },
    listInternships: function (filters) {
      return request('/internships' + buildQuery(filters));
    },
    getInternship: function (id) {
      return request('/internships/' + encodeURIComponent(id));
    },
    createInternship: function (data) {
      return request('/internships', { method: 'POST', body: data, auth: true });
    },
    updateInternship: function (id, data) {
      return request('/internships/' + encodeURIComponent(id), { method: 'PUT', body: data, auth: true });
    },
    deleteInternship: function (id) {
      return request('/internships/' + encodeURIComponent(id), { method: 'DELETE', auth: true });
    },
    applyToInternship: function (id, formData) {
      return request('/internships/' + encodeURIComponent(id) + '/apply', { method: 'POST', body: formData, auth: true });
    },
    getRecruiterInternships: function () {
      return request('/recruiter/internships', { auth: true });
    },
    getApplicants: function (id) {
      return request('/recruiter/internships/' + encodeURIComponent(id) + '/applications', { auth: true });
    },
    updateApplicationStatus: function (id, status) {
      return request('/applications/' + encodeURIComponent(id) + '/status', {
        method: 'PATCH',
        body: { status: status },
        auth: true,
      });
    },
    downloadApplicationResume: function (id) {
      return download('/applications/' + encodeURIComponent(id) + '/resume');
    },
    listUniversities: function () {
      return request('/universities');
    },
    listUniversityDepartments: function (universityId) {
      return request('/universities/' + encodeURIComponent(universityId) + '/departments');
    },
    getStudentUniversityProfile: function () {
      return request('/student/university-profile', { auth: true });
    },
    getStudentDashboard: function () {
      return request('/student/dashboard', { auth: true });
    },
    createStudentUniversityProfile: function (data) {
      return request('/student/university-profile', { method: 'POST', body: data, auth: true });
    },
    updateStudentUniversityProfile: function (data) {
      return request('/student/university-profile', { method: 'PATCH', body: data, auth: true });
    },
  };
})();
