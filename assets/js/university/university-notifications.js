(function () {
  'use strict';

  function showSetupError(text) {
    var message = document.getElementById('university-notifications-message');

    if (message) {
      message.textContent = text;
      message.style.display = 'block';
    }
  }

  function renderRows(items) {
    var api = window.InternGuideUniversity;

    if (!items.length) {
      return '<tr><td colspan="6">No notifications found.</td></tr>';
    }

    return items
      .map(function (item) {
        return [
          '<tr>',
          '  <td>' + api.escapeHtml(item.title) + '</td>',
          '  <td>' + api.escapeHtml(item.message) + '</td>',
          '  <td>' + api.escapeHtml(item.type) + '</td>',
          '  <td>' + api.escapeHtml(item.is_read ? 'yes' : 'no') + '</td>',
          '  <td>' + api.escapeHtml(api.formatDate(item.created_at)) + '</td>',
          '  <td>' + (item.is_read ? '<span class="admin-muted">Read</span>' : '<button class="admin-button admin-button-small" type="button" data-read-id="' + item.id + '">Mark read</button>') + '</td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  async function loadNotifications() {
    var api = window.InternGuideUniversity;
    var table = api.getElement('university-notifications-table');

    if (!table) {
      api.setMessage('university-notifications-message', 'Notifications table is missing.', 'error');
      return;
    }

    var result = await api.listNotifications({ limit: 100 });
    table.innerHTML = renderRows(result.notifications || []);
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var api = window.InternGuideUniversity;

    if (!api) {
      showSetupError('University admin scripts did not load. Refresh the page and try again.');
      return;
    }

    var user = await api.ensureUniversityAdmin();

    if (!user) {
      return;
    }

    api.attachLogout();

    await loadNotifications().catch(function (error) {
      api.setMessage('university-notifications-message', error.message || 'Unable to load notifications.', 'error');
    });

    api.on('university-notifications-table', 'click', async function (event) {
      var button = event.target.closest('[data-read-id]');

      if (!button) {
        return;
      }

      try {
        await api.markNotificationRead(button.dataset.readId);
        api.setMessage('university-notifications-message', 'Notification marked as read.', 'success');
        await loadNotifications();
      } catch (error) {
        api.setMessage('university-notifications-message', error.message || 'Unable to mark notification as read.', 'error');
      }
    });

    api.on('university-read-all-notifications', 'click', async function () {
      try {
        await api.markAllNotificationsRead();
        api.setMessage('university-notifications-message', 'Notifications marked as read.', 'success');
        await loadNotifications();
      } catch (error) {
        api.setMessage('university-notifications-message', error.message || 'Unable to mark notifications as read.', 'error');
      }
    });
  });
})();
