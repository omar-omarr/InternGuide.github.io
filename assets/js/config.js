(function () {
  'use strict';

  var localHosts = ['localhost', '127.0.0.1', '[::1]'];
  var isLocal = window.location.protocol === 'file:' || localHosts.indexOf(window.location.hostname) !== -1;

  if (!window.INTERNGUIDE_API_BASE && !isLocal) {
    window.INTERNGUIDE_API_BASE = 'https://internguide-api-production.up.railway.app/api';
  }
})();
