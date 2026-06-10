(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }

  function formatDate(value) {
    return value ? new Date(value).toLocaleDateString() : 'Not set';
  }

  function badge(status) {
    return '<span class="ig-status-badge ig-status-' + escapeHtml(status || 'neutral') + '">' +
      escapeHtml(String(status || 'unknown').replace(/_/g, ' ')) + '</span>';
  }

  function setMessage(text, type) {
    var target = document.getElementById('training-message');
    target.textContent = text || '';
    target.style.display = text ? 'block' : 'none';
    target.style.color = type === 'error' ? '#cc2229' : '#168a45';
  }

  function scoreInputs(record) {
    var fields = [
      ['attendance_score', 'Attendance'],
      ['technical_skills_score', 'Technical skills'],
      ['communication_score', 'Communication'],
      ['teamwork_score', 'Teamwork'],
      ['punctuality_score', 'Punctuality'],
    ];

    return fields
      .map(function (field) {
        return '<label>' + field[1] + '<input name="' + field[0] + '" type="number" min="1" max="5" value="' +
          escapeHtml(record[field[0]] || 5) + '" required></label>';
      })
      .join('');
  }

  function evaluationSummary(record) {
    if (!record.evaluation_id && !record.evaluation_submitted_at) {
      return '<p class="portal-helper-text">Company evaluation is pending.</p>';
    }

    return [
      '<div class="training-evaluation-summary">',
      '<strong>Company evaluation: ' + escapeHtml(record.overall_score) + '/5</strong>',
      '<span>' + (record.recommended_for_hiring ? 'Recommended for hiring' : 'No hiring recommendation') + '</span>',
      record.evaluation_comments ? '<p>' + escapeHtml(record.evaluation_comments) + '</p>' : '',
      '</div>',
    ].join('');
  }

  function studentActions(record) {
    return [
      '<div class="training-action-grid">',
      '<form class="training-inline-form" data-weekly-form="' + record.id + '">',
      '<h4>Weekly report</h4>',
      '<label>Week<input name="week_number" type="number" min="1" max="60" required></label>',
      '<label>Summary<textarea name="summary" required placeholder="Work completed, learning, and progress"></textarea></label>',
      '<label>Challenges<textarea name="challenges"></textarea></label>',
      '<label>Next steps<textarea name="next_steps"></textarea></label>',
      '<button class="ig-button" type="submit">Save Weekly Report</button>',
      '</form>',
      '<form class="training-inline-form" data-report-form="' + record.id + '" enctype="multipart/form-data">',
      '<h4>Final internship report</h4>',
      '<p>Report status: ' + badge(record.final_report_status) + '</p>',
      record.final_report_notes ? '<p class="portal-helper-text">Review note: ' + escapeHtml(record.final_report_notes) + '</p>' : '',
      '<label>PDF report<input name="report" type="file" accept=".pdf,application/pdf" required></label>',
      '<button class="ig-button" type="submit">Submit Final Report</button>',
      record.final_report_path ? '<button class="ig-button ig-button-secondary" type="button" data-download-report="' + record.id + '">Download Submitted Report</button>' : '',
      '</form>',
      '</div>',
    ].join('');
  }

  function recruiterActions(record) {
    return [
      '<div class="training-action-grid">',
      '<form class="training-inline-form" data-status-form="' + record.id + '">',
      '<h4>Training supervision</h4>',
      '<label>Status<select name="status">',
      ['not_started', 'training_started', 'weekly_reports_pending', 'company_evaluated', 'cancelled']
        .map(function (status) {
          return '<option value="' + status + '"' + (record.status === status ? ' selected' : '') + '>' + status.replace(/_/g, ' ') + '</option>';
        })
        .join(''),
      '</select></label>',
      '<label>Start date<input name="start_date" type="date" value="' + escapeHtml(String(record.start_date || '').slice(0, 10)) + '"></label>',
      '<label>End date<input name="end_date" type="date" value="' + escapeHtml(String(record.end_date || '').slice(0, 10)) + '"></label>',
      '<label>Company supervisor<input name="company_supervisor_name" value="' + escapeHtml(record.company_supervisor_name || '') + '"></label>',
      '<button class="ig-button" type="submit">Update Training</button>',
      '</form>',
      '<form class="training-inline-form" data-evaluation-form="' + record.id + '">',
      '<h4>Company evaluation</h4>',
      '<div class="training-score-grid">' + scoreInputs(record) + '</div>',
      '<label><input name="recommended_for_hiring" type="checkbox"' + (record.recommended_for_hiring ? ' checked' : '') + '> Recommended for hiring</label>',
      '<label>Comments<textarea name="comments">' + escapeHtml(record.evaluation_comments || '') + '</textarea></label>',
      '<button class="ig-button" type="submit">Submit Evaluation</button>',
      '</form>',
      '</div>',
    ].join('');
  }

  function renderRecords(records, role) {
    if (!records.length) {
      return '<div class="ig-empty-state"><h3>No training records yet</h3><p>A training record is created automatically after an application is accepted.</p></div>';
    }

    return records
      .map(function (record) {
        return [
          '<article class="portal-card training-record-card">',
          '<div class="portal-card-header"><div><span class="ig-eyebrow">' + escapeHtml(record.company_name) + '</span><h2>' +
            escapeHtml(record.internship_title) + '</h2><p>' + escapeHtml(record.student_name) + ' | ' +
            escapeHtml(record.university_name || 'University not linked') + '</p></div>' + badge(record.status) + '</div>',
          '<div class="training-meta-grid">',
          '<span><strong>Start</strong>' + escapeHtml(formatDate(record.start_date)) + '</span>',
          '<span><strong>End</strong>' + escapeHtml(formatDate(record.end_date)) + '</span>',
          '<span><strong>Final report</strong>' + badge(record.final_report_status) + '</span>',
          '<span><strong>Evaluation</strong>' + escapeHtml(record.overall_score ? record.overall_score + '/5' : 'Pending') + '</span>',
          '</div>',
          evaluationSummary(record),
          '<div class="ig-form-actions"><a class="ig-button ig-button-secondary" href="../messages.html?application_id=' +
            encodeURIComponent(record.application_id) + '">Application Messages</a></div>',
          role === 'student' ? studentActions(record) : recruiterActions(record),
          '</article>',
        ].join('');
      })
      .join('');
  }

  function saveBlob(file) {
    var url = URL.createObjectURL(file.blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var api = window.InternGuideAPI;
    var user = api.getCurrentUser();
    var role = document.body.dataset.trainingRole;
    var list = document.getElementById('training-record-list');

    if (!api.getToken() || !user || user.role !== role) {
      window.location.href = role === 'student' ? '../userlogin.html' : '../recruiter_login.html';
      return;
    }

    async function load() {
      var result = await api.listTrainingRecords();
      list.innerHTML = renderRecords(result.trainingRecords || [], role);
    }

    await load().catch(function (error) {
      setMessage(error.message || 'Unable to load training records.', 'error');
    });

    list.addEventListener('submit', async function (event) {
      event.preventDefault();
      var form = event.target;
      var id = form.dataset.weeklyForm || form.dataset.reportForm || form.dataset.statusForm || form.dataset.evaluationForm;

      try {
        if (form.dataset.weeklyForm) {
          await api.submitWeeklyReport(id, api.formToObject(form));
        } else if (form.dataset.reportForm) {
          await api.uploadFinalReport(id, new FormData(form));
        } else if (form.dataset.statusForm) {
          await api.updateTrainingStatus(id, api.formToObject(form));
        } else if (form.dataset.evaluationForm) {
          var values = api.formToObject(form);
          values.recommended_for_hiring = form.elements.recommended_for_hiring.checked;
          await api.submitCompanyEvaluation(id, values);
        }

        setMessage('Training record updated.', 'success');
        await load();
      } catch (error) {
        setMessage(error.message || 'Unable to update training record.', 'error');
      }
    });

    list.addEventListener('click', async function (event) {
      var id = event.target.dataset.downloadReport;
      if (id) {
        try {
          saveBlob(await api.downloadFinalReport(id));
        } catch (error) {
          setMessage(error.message || 'Unable to download final report.', 'error');
        }
      }
    });

    document.getElementById('training-logout-link').addEventListener('click', function (event) {
      event.preventDefault();
      api.clearSession();
      window.location.href = role === 'student' ? '../userlogin.html' : '../recruiter_login.html';
    });
  });
})();
