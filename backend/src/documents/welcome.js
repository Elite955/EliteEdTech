import PDFDocument from 'pdfkit';

const IST_ZONE = 'Asia/Kolkata';

const STEPS = {
  student: [
    'Sign in and scan the authenticator QR code shown on first sign-in.',
    'Browse teachers and choose a day/time that suits you.',
    'Your teacher approves the request, then you pay securely with Razorpay.',
    'The join link and a PDF receipt are emailed to you right after payment.',
    'Open Sessions at class time and join the video room.',
  ],
  teacher: [
    'Sign in and scan the authenticator QR code shown on first sign-in.',
    'Open Availability and publish slots with the subject, time, and your hourly rate (₹0-₹4,999).',
    'Approve booking requests from the Booking Queue.',
    'Conduct the class from Sessions; the join link is already there.',
    'Track completed classes and payments in Payments and Reports.',
  ],
};

// Sent on successful signup: an acknowledgement, a zero-value registration
// bill, and the exact steps to get started. No file is written to disk.
export function buildWelcomeDocument({ user, role }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 52,
      info: { Title: 'ELITE welcome and account summary', Author: 'ELITE' },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#06564f').fontSize(24).text('ELITE');
    doc.moveDown(0.2).fontSize(10).fillColor('#64748b').text('One-to-one tutoring');
    doc.moveDown(1.3);
    doc.fontSize(20).fillColor('#0f172a').text('Welcome & account summary');
    doc.moveDown(0.7);

    doc.fontSize(10).fillColor('#475569');
    doc.text(`Account created: ${new Date().toLocaleString('en-IN', { timeZone: IST_ZONE })} IST`);
    doc.text(`Name: ${user.name ?? '—'}`);
    doc.text(`Email: ${user.email ?? '—'}`);
    doc.text(`Account type: ${role === 'teacher' ? 'Teacher' : 'Student'}`);
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#0f172a').text('Registration bill');
    doc.moveDown(0.4);
    const billY = doc.y;
    doc.fontSize(10).fillColor('#475569');
    doc.text('Account registration', 60, billY);
    doc.text('INR 0.00', 470, billY);
    doc.text('Amount due now', 60, billY + 22);
    doc.text('INR 0.00', 470, billY + 22);
    doc.moveTo(60, billY + 16).lineTo(535, billY + 16).strokeColor('#dbe4e2').stroke();
    doc.y = billY + 52;
    doc.fontSize(9).fillColor('#94a3b8').text(
      role === 'teacher'
        ? 'You earn per booked hour at the rate you publish on each availability slot.'
        : 'You pay only for booked classes: hours × the rate on the chosen slot.',
    );
    doc.moveDown(1.2);

    doc.fontSize(12).fillColor('#0f172a').text('Getting started');
    doc.moveDown(0.4);
    for (const [index, step] of (STEPS[role] ?? STEPS.student).entries()) {
      doc.fontSize(10).fillColor('#475569').text(`${index + 1}.  ${step}`, { indent: 4 });
      doc.moveDown(0.25);
    }

    doc.moveDown(0.8);
    doc.fontSize(9).fillColor('#94a3b8').text(
      'Keep this summary for your records. Need help? Reply to the email that delivered this document.',
    );
    doc.end();
  });
}
