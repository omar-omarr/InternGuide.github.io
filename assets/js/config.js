(function () {
  'use strict';

  var localHosts = ['localhost', '127.0.0.1', '[::1]'];
  var isLocal = window.location.protocol === 'file:' || localHosts.indexOf(window.location.hostname) !== -1;
  var appBase = typeof window.INTERNGUIDE_APP_BASE === 'string' ? window.INTERNGUIDE_APP_BASE.replace(/\/+$/, '') : '';

  if (!appBase && !isLocal && window.location.hostname === 'omar-omarr.github.io') {
    appBase = '/InternGuide.github.io';
  }

  function appPath(path) {
    var normalizedPath = '/' + String(path || '').replace(/^\/+/, '');
    return appBase + normalizedPath;
  }

  window.INTERNGUIDE_APP_BASE = appBase;
  window.InternGuideApp = {
    basePath: appBase,
    isLocal: isLocal,
    navigate: function (path) {
      window.location.href = appPath(path);
    },
    path: appPath,
  };

  if (!window.INTERNGUIDE_API_BASE && !isLocal) {
    window.INTERNGUIDE_API_BASE = 'https://internguide-api-production.up.railway.app/api';
  }
})();
