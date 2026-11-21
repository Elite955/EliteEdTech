import PDFDocument from 'pdfkit';
import { strToU8, zipSync } from 'fflate';

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnName(index) {
  return String.fromCharCode(65 + index);
}

export async function getAdminSummaryRows(database) {
  const [accounts, roles, audit, sessions, notifications] = await Promise.all([
    database.query(
      `SELECT status, count(*)::int AS count
       FROM users WHERE role = 'admin' GROUP BY status`,
    ),
    database.query('SELECT count(*)::int AS count FROM admin_roles'),
    database.query(
      `SELECT count(*)::int AS count FROM audit_logs
       WHERE created_at >= now() - interval '30 days'`,
    ),
    database.query(
      `SELECT count(*)::int AS count FROM admin_sessions
       WHERE revoked_at IS NULL AND expires_at > now()`,
    ),
    database.query(
      `SELECT status, count(*)::int AS count FROM notifications GROUP BY status`,
    ),
  ]);
  const countForStatus = (rows, status) => Number(rows.find((row) => row.status === status)?.count ?? 0);
  return [
    { metric: 'Active admin accounts', value: countForStatus(accounts.rows, 'active') },
    { metric: 'Suspended admin accounts', value: countForStatus(accounts.rows, 'suspended') },
    { metric: 'Administrator roles', value: Number(roles.rows[0]?.count ?? 0) },
    { metric: 'Active admin sessions', value: Number(sessions.rows[0]?.count ?? 0) },
    { metric: 'Audit events in the last 30 days', value: Number(audit.rows[0]?.count ?? 0) },
    { metric: 'Queued notifications', value: countForStatus(notifications.rows, 'queued') },
    { metric: 'Failed notifications', value: countForStatus(notifications.rows, 'failed') },
    { metric: 'Unconfirmed notifications', value: countForStatus(notifications.rows, 'unknown') },
  ];
}

export async function createXlsxReport(rows, generatedAt = new Date()) {
  const allRows = [
    ['Metric', 'Value'],
    ['Report generated at', generatedAt.toISOString()],
    ...rows.map((row) => [row.metric, row.value]),
  ];
  const sheetRows = allRows.map((row, rowIndex) => (
    `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
      const cell = `${columnName(columnIndex)}${rowIndex + 1}`;
      return typeof value === 'number' && Number.isFinite(value)
        ? `<c r="${cell}"><v>${value}</v></c>`
        : `<c r="${cell}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join('')}</row>`
  )).join('');
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Admin summary" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`),
  };
  return Buffer.from(zipSync(files));
}

export function createPdfReport(rows, generatedAt = new Date()) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.once('error', reject);
    document.once('end', () => resolve(Buffer.concat(chunks)));
    document.fontSize(20).text('Elite Admin Summary');
    document.moveDown(0.5).fontSize(10).fillColor('#555555').text(`Generated ${generatedAt.toISOString()}`);
    document.moveDown().fillColor('#111111').fontSize(12);
    for (const row of rows) {
      document.text(`${row.metric}: ${row.value}`);
    }
    document.end();
  });
}
