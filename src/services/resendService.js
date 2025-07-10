const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send an email using Resend
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient(s) email address
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body (optional)
 * @param {string} options.html - HTML body (optional)
 * @param {string|string[]} [options.cc] - CC recipient(s) (optional)
 * @param {Array} [options.attachments] - Attachments (optional, array of {filename, content})
 * @returns {Promise}
 */
async function sendEmail({ to, subject, text, html, cc, attachments }) {
  // Resend expects 'to' and 'cc' as arrays
  const toArr = Array.isArray(to) ? to : [to];
  const ccArr = cc ? (Array.isArray(cc) ? cc : [cc]) : undefined;

  // Resend attachments: [{ filename, content }], content as Buffer or base64
  const formattedAttachments = attachments
    ? attachments.map(att => ({
        filename: att.filename,
        content: att.content, // Buffer or base64 string
      }))
    : undefined;

  return resend.emails.send({
    from: process.env.RESEND_FROM || 'no-reply@yourdomain.com',
    to: toArr,
    cc: ccArr,
    subject,
    text,
    html,
    attachments: formattedAttachments,
  });
}

module.exports = { sendEmail }; 