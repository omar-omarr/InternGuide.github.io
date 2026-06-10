(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }

  function setMessage(text, type) {
    var target = document.getElementById('message-thread-alert');
    target.textContent = text || '';
    target.style.display = text ? 'block' : 'none';
    target.style.color = type === 'error' ? '#cc2229' : '#168a45';
  }

  function renderMessages(messages, role) {
    if (!messages.length) {
      return '<div class="ig-empty-state"><h3>No messages yet</h3><p>Use this thread for application and interview questions.</p></div>';
    }

    return messages
      .map(function (message) {
        return [
          '<article class="message-bubble ' + (message.sender_role === role ? 'is-mine' : '') + '">',
          '<strong>' + escapeHtml(message.sender_role === role ? 'You' : message.sender_role) + '</strong>',
          '<p>' + escapeHtml(message.message_body) + '</p>',
          '<span>' + escapeHtml(new Date(message.created_at).toLocaleString()) + (message.is_read ? ' | Read' : '') + '</span>',
          '</article>',
        ].join('');
      })
      .join('');
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var api = window.InternGuideAPI;
    var user = api.getCurrentUser();
    var id = new URLSearchParams(window.location.search).get('application_id');
    var list = document.getElementById('message-thread-list');
    var form = document.getElementById('message-thread-form');

    if (!api.getToken() || !user || ['student', 'recruiter'].indexOf(user.role) === -1) {
      window.location.href = 'userlogin.html';
      return;
    }

    if (!id) {
      setMessage('Application id is required.', 'error');
      form.style.display = 'none';
      return;
    }

    document.getElementById('message-dashboard-link').href =
      user.role === 'student' ? 'student/dashboard.html' : 'recruiter/dashboard.html';

    async function load() {
      var result = await api.listApplicationMessages(id);
      document.getElementById('message-thread-title').textContent = result.application.internship_title + ' messages';
      list.innerHTML = renderMessages(result.messages || [], user.role);
      await api.markApplicationMessagesRead(id);
    }

    await load().catch(function (error) {
      setMessage(error.message || 'Unable to load message thread.', 'error');
      form.style.display = 'none';
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      try {
        await api.sendApplicationMessage(id, form.elements.message_body.value);
        form.reset();
        setMessage('Message sent.', 'success');
        await load();
      } catch (error) {
        setMessage(error.message || 'Unable to send message.', 'error');
      }
    });

    document.getElementById('message-logout-link').addEventListener('click', function (event) {
      event.preventDefault();
      api.clearSession();
      window.location.href = user.role === 'student' ? 'userlogin.html' : 'recruiter_login.html';
    });
  });
})();
