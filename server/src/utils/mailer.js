// Email transport placeholder. Swap the body for Resend/Postmark/SES later.
// In development the magic link is logged to the console.
async function sendMagicLink(email, link) {
  if (process.env.NODE_ENV === 'production') {
    // TODO(phase 2): integrate a real email provider before launch.
    console.warn(`[mailer] No provider configured; magic link for ${email} not delivered.`);
    return;
  }
  console.log(`\n[mailer] Magic link for ${email}:\n  ${link}\n`);
}

module.exports = { sendMagicLink };
