import PDFDocument from 'pdfkit';

const IST_ZONE = 'Asia/Kolkata';

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('en-IN', { timeZone: IST_ZONE })} ${date.toLocaleTimeString('en-IN', {
    timeZone: IST_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  })} IST`;
}

function rupees(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `Rs. ${amount.toFixed(2)}` : 'Rs. 0.00';
}

// Builds the receipt entirely in memory: no files on disk, so it is safe on
// serverless/Render and can be attached to an email or streamed as a download.
export function buildPaymentReceipt({ payment, booking, student, teacher, meetingUrl }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 52,
      info: {
        Title: `ELITE receipt ${payment?.id ?? ''}`,
        Author: 'ELITE',
        Subject: 'Class payment receipt',
      },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#06564f').fontSize(24).text('ELITE');
    doc.moveDown(0.2).fontSize(10).fillColor('#64748b').text('One-to-one tutoring');
    doc.moveDown(1.4);

    doc.fontSize(20).fillColor('#0f172a').text('Payment receipt');
    doc.moveDown(0.7);
    doc.fontSize(10).fillColor('#475569');
    doc.text(`Receipt ID: ${payment?.id ?? '—'}`);
    doc.text(`Issued: ${formatDateTime(payment?.created_at)}`);
    doc.text(`Status: ${String(payment?.status ?? '—').toUpperCase()}`);
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#0f172a').text('Payment details');
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#475569');
    doc.text(`Student: ${student?.name ?? '—'} (${student?.email ?? '—'})`);
    doc.text(`Teacher: ${teacher?.name ?? '—'}`);
    doc.text(`Class date: ${formatDateTime(booking?.starts_at)}`);
    if (booking?.ends_at) doc.text(`Class ends: ${formatDateTime(booking.ends_at)}`);
    doc.text(`Transaction: ${payment?.provider_transaction_id ?? '—'}`);
    doc.text(`Provider: ${payment?.provider ?? '—'}`);
    doc.moveDown(0.8);

    const boxY = doc.y;
    doc.roundedRect(52, boxY, 491, 46, 6).fill('#eef7f5');
    doc.fillColor('#06564f').fontSize(15).text(`Amount paid  ${rupees(payment?.amount)}`, 66, boxY + 15);
    doc.y = boxY + 64;

    if (meetingUrl) {
      doc.fontSize(12).fillColor('#0f172a').text('Join your class');
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#4338ca').text(meetingUrl, { link: meetingUrl, underline: true });
      doc.moveDown(1);
    }

    doc.fontSize(9).fillColor('#94a3b8').text(
      'This is a computer-generated receipt. Keep it for your records.',
    );
    doc.end();
  });
}
