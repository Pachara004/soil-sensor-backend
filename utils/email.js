const nodemailer = require('nodemailer');

let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
} else {
  console.warn('⚠️ Email credentials not configured. sendEmail will be a no-op.');
}

const sendEmail = async (to, subject, text) => {
  if (!transporter) {
    console.warn(`Skipping sendEmail to ${to} — transporter not configured`);
    return;
  }

  const mailOptions = { from: process.env.EMAIL_USER, to, subject, text };
  return transporter.sendMail(mailOptions);
};

module.exports = { sendEmail };