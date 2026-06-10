(function () {
  'use strict';

  function saveBlob(file) {
    var url = URL.createObjectURL(file.blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function status(value) {
    var api = window.CareerCenterAPI;
    return '<span class="admin-status admin-status-' + api.escapeHtml(value || 'pending') + '">' +
      api.escapeHtml(String(value || 'pending').replace(/_/g, ' ')) + '</span>';
  }

  function renderAnalytics(result) {
    var api = window.CareerCenterAPI;
    var labels = {
      total_students: 'Students',
      total_recruiters: 'Recruiters',
      approved_recruiters: 'Approved recruiters',
      pending_recruiters: 'Pending recruiters',
      active_internships: 'Active internships',
      pending_internship_approvals: 'Pending approvals',
      total_applications: 'Applications',
      accepted_applications: 'Accepted applications',
      active_training_records: 'Active training',
      completed_trainings: 'Completed training',
      submitted_final_reports: 'Submitted reports',
      pending_evaluations: 'Pending evaluations',
      training_completion_rate: 'Completion rate %',
    };

    api.setHtml(
      'career-analytics-cards',
      Object.keys(labels)
        .map(function (key) {
          return '<div class="admin-stat-card"><span>' + labels[key] + '</span><strong>' + api.escapeHtml(result.summary[key] || 0) + '</strong></div>';
        })
        .join(''),
    );
    api.setHtml(
      'career-analytics-tables',
      '<div class="admin-detail-box"><strong>Applications by department</strong><p>' +
        (result.applicationsByDepartment || []).map(function (row) { return api.escapeHtml(row.department) + ': ' + row.count; }).join(' | ') +
        '</p></div><div class="admin-detail-box"><strong>Accepted students by major</strong><p>' +
        (result.acceptedStudentsByMajor || []).map(function (row) { return api.escapeHtml(row.major) + ': ' + row.count; }).join(' | ') +
        '</p></div><div class="admin-detail-box"><strong>Internships by department</strong><p>' +
        (result.internshipsByDepartment || []).map(function (row) { return api.escapeHtml(row.department) + ': ' + row.count; }).join(' | ') +
        '</p></div><div class="admin-detail-box"><strong>Top companies</strong><p>' +
        (result.topCompanies || []).map(function (row) { return api.escapeHtml(row.company_name) + ': ' + row.internships; }).join(' | ') +
        '</p></div>',
    );
  }

  function renderTraining(records) {
    var api = window.CareerCenterAPI;

    if (!records.length) {
      return '<tr><td colspan="8">No training records found.</td></tr>';
    }

    return records
      .map(function (record) {
        var reportActions = record.final_report_path
          ? '<button class="admin-button admin-button-small admin-button-secondary" data-download-report="' + record.id + '">Download</button>' +
            '<button class="admin-button admin-button-small" data-review-report="' + record.id + '" data-review-status="approved">Approve</button>' +
            '<button class="admin-button admin-button-small admin-button-secondary" data-review-report="' + record.id + '" data-review-status="rejected">Reject</button>'
          : 'Not submitted';

        return [
          '<tr>',
          '<td>' + api.escapeHtml(record.student_name) + '</td>',
          '<td>' + api.escapeHtml(record.internship_title) + '</td>',
          '<td>' + api.escapeHtml(record.company_name) + '</td>',
          '<td>' + status(record.status) + '</td>',
          '<td>' + status(record.final_report_status) + '</td>',
          '<td>' + api.escapeHtml(record.overall_score ? record.overall_score + '/5' : 'Pending') + '</td>',
          '<td><select class="admin-input" data-training-status="' + record.id + '">' +
            ['not_started', 'training_started', 'weekly_reports_pending', 'company_evaluated', 'student_report_submitted', 'university_reviewed', 'completed', 'cancelled']
              .map(function (item) { return '<option value="' + item + '"' + (item === record.status ? ' selected' : '') + '>' + item.replace(/_/g, ' ') + '</option>'; })
              .join('') + '</select></td>',
          '<td><div class="admin-actions">' + reportActions + '</div></td>',
          '</tr>',
        ].join('');
      })
      .join('');
  }

  document.addEventListener('DOMContentLoaded', async function () {
    var mode = document.body.dataset.careerCenterMode;
    var api = mode === 'university' ? window.InternGuideUniversity : window.InternGuideAdmin;
    window.CareerCenterAPI = api;

    if (!api || !(await (mode === 'university' ? api.ensureUniversityAdmin() : api.ensureSystemAdmin()))) {
      return;
    }
    api.attachLogout();

    async function load() {
      var results = await Promise.all([api.careerAnalytics(), api.listTrainingRecords()]);
      renderAnalytics(results[0]);
      api.setHtml('career-training-table', renderTraining(results[1].trainingRecords || []));
    }

    await load().catch(function (error) {
      api.setMessage('career-center-message', error.message || 'Unable to load career-center data.', 'error');
    });

    api.on('career-training-table', 'change', async function (event) {
      var id = event.target.dataset.trainingStatus;
      if (!id) {
        return;
      }
      try {
        await api.updateTrainingStatus(id, { status: event.target.value });
        await load();
      } catch (error) {
        api.setMessage('career-center-message', error.message || 'Unable to update training status.', 'error');
      }
    });

    api.on('career-training-table', 'click', async function (event) {
      var downloadId = event.target.dataset.downloadReport;
      var reviewId = event.target.dataset.reviewReport;
      try {
        if (downloadId) {
          saveBlob(await api.downloadFinalReport(downloadId));
        }
        if (reviewId) {
          var notes = window.prompt('Optional review notes:') || '';
          await api.reviewFinalReport(reviewId, { status: event.target.dataset.reviewStatus, notes: notes });
          await load();
        }
      } catch (error) {
        api.setMessage('career-center-message', error.message || 'Unable to complete report action.', 'error');
      }
    });

    api.on('career-export-actions', 'click', async function (event) {
      var dataset = event.target.dataset.exportDataset;
      if (dataset) {
        try {
          saveBlob(await api.exportCareerData(dataset));
        } catch (error) {
          api.setMessage('career-center-message', error.message || 'Unable to export data.', 'error');
        }
      }
    });
  });
})();
