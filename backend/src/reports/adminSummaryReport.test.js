import test from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { createPdfReport, createXlsxReport, getAdminSummaryRows } from './adminSummaryReport.js';

test('admin summary contains aggregate operational metrics without personal data', async () => {
  const database = {
    async query(sql) {
      if (sql.includes('FROM users')) return { rows: [{ status: 'active', count: 2 }, { status: 'suspended', count: 1 }] };
      if (sql.includes('FROM admin_roles')) return { rows: [{ count: 3 }] };
      if (sql.includes('FROM audit_logs')) return { rows: [{ count: 10 }] };
      if (sql.includes('FROM admin_sessions')) return { rows: [{ count: 1 }] };
      if (sql.includes('FROM notifications')) return { rows: [{ status: 'queued', count: 2 }, { status: 'unknown', count: 1 }] };
      assert.fail(`Unexpected query: ${sql}`);
    },
  };
  const rows = await getAdminSummaryRows(database);
  assert.deepEqual(rows.find((row) => row.metric === 'Active admin accounts'), { metric: 'Active admin accounts', value: 2 });
  assert.deepEqual(rows.find((row) => row.metric === 'Unconfirmed notifications'), { metric: 'Unconfirmed notifications', value: 1 });
  assert.equal(rows.some((row) => /email|phone|student|teacher/i.test(row.metric)), false);
});

test('admin report exports produce valid XLSX and PDF file signatures', async () => {
  const rows = [{ metric: 'Active admin accounts', value: 2 }];
  const xlsx = await createXlsxReport(rows, new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(xlsx.subarray(0, 2).toString(), 'PK');
  const contents = unzipSync(new Uint8Array(xlsx));
  const worksheet = strFromU8(contents['xl/worksheets/sheet1.xml']);
  assert.match(worksheet, /Active admin accounts/);
  assert.match(worksheet, /<v>2<\/v>/);

  const pdf = await createPdfReport(rows, new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});
