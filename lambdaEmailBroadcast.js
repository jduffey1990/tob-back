'use strict';

// lambdaEmailBroadcast.js
// -----------------------
// HOW TO RUN:
//   1. Deploy this file as part of your Lambda package (or paste into inline editor)
//   2. In Lambda → Configuration → General → set Handler to: lambdaEmailBroadcast.handler
//   3. Go to Test tab → create event with body: {}
//   4. Click Test. Done.
//
// REQUIRED ENV VARS (already set in your Lambda environment):
//   DATABASE_URL  or  PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
//   AWS_REGION    (Lambda sets this automatically)
//   FROM_EMAIL    e.g. noreply@tobprayer.app

const { Pool } = require('pg');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@tobprayer.app';

function buildEmailBody(name) {
  const text = [
    `Hey ${name}, just wanted to say thank you for your feedback this week.`,
    `Thanks to all of the information you sent back to me, I think I am at the point of leaving the coding be and working a bit on marketing.`,
    `If you update your app on TestFlight, you should have access to the sandbox for 90 days to use all of the premium features as a thank you for all of your feedback.`,
    `Your info will still be available in the App Store application once this period runs out.`,
    `That being said, feel free to update me on any problems you have in the meantime. Cheers!`,
  ].join(' ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You from Tower of Babble</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:40px 30px;text-align:center;color:#fff;">
      <h1 style="margin:0;font-size:28px;font-weight:600;">Tower of Babble</h1>
    </div>
    <div style="padding:40px 30px;">
      <p style="font-size:16px;line-height:1.8;color:#555;">Hey ${name},</p>
      <p style="font-size:16px;line-height:1.8;color:#555;">
        Just wanted to say thank you for your feedback this week. Thanks to all of the information you sent back to me,
        I think I am at the point of leaving the coding be and working a bit on marketing.
      </p>
      <p style="font-size:16px;line-height:1.8;color:#555;">
        If you update your app on TestFlight, you should have access to the sandbox for 90 days to use all of the
        premium features as a thank you for all of your feedback. Your info will still be available in the App Store
        application once this period runs out.
      </p>
      <p style="font-size:16px;line-height:1.8;color:#555;">
        That being said, feel free to update me on any problems you have in the meantime. Cheers!
      </p>
    </div>
    <div style="background:#f9f9f9;padding:20px 30px;text-align:center;font-size:14px;color:#666;border-top:1px solid #e0e0e0;">
      <p style="margin:0;">&copy; ${new Date().getFullYear()} Tower of Babble. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

  return { html, text };
}

exports.handler = async (event, context) => {
  const start = Date.now();

  console.log(JSON.stringify({
    level: 'info',
    type: 'email_broadcast_start',
    message: 'Starting thank-you email broadcast',
    timestamp: new Date().toISOString(),
  }));

  // Use DATABASE_URL if set, otherwise fall back to individual PG env vars
  const pool = new Pool(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 }
      : { max: 1, connectionTimeoutMillis: 5000 } // pg reads PGHOST etc. automatically
  );

  const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-2' });

  let totalUsers = 0;
  let sent = 0;
  let failed = 0;

  try {
    const result = await pool.query(
      `SELECT id, email, name
         FROM users
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC`
    );

    totalUsers = result.rowCount ?? 0;

    console.log(JSON.stringify({
      level: 'info',
      type: 'email_broadcast_users_fetched',
      totalUsers,
      timestamp: new Date().toISOString(),
    }));

    for (const user of result.rows) {
      const { id, email, name } = user;
      const { html, text } = buildEmailBody(name);

      const command = new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: 'Thank you for your feedback!', Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: { Data: text, Charset: 'UTF-8' },
          },
        },
      });

      try {
        const response = await ses.send(command);
        sent++;
        console.log(JSON.stringify({
          level: 'info',
          type: 'email_broadcast_sent',
          userId: id,
          messageId: response.MessageId,
          timestamp: new Date().toISOString(),
        }));
      } catch (err) {
        failed++;
        console.error(JSON.stringify({
          level: 'error',
          type: 'email_broadcast_send_failed',
          userId: id,
          message: err.message,
          timestamp: new Date().toISOString(),
        }));
        // One failure does not stop the loop
      }
    }
  } catch (err) {
    await pool.end();
    const duration_ms = Date.now() - start;
    console.error(JSON.stringify({
      level: 'error',
      type: 'email_broadcast_db_error',
      message: err.message,
      duration_ms,
      timestamp: new Date().toISOString(),
    }));
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }

  await pool.end();
  const duration_ms = Date.now() - start;

  console.log(JSON.stringify({
    level: failed > 0 ? 'warn' : 'info',
    type: 'email_broadcast_complete',
    totalUsers,
    sent,
    failed,
    duration_ms,
    timestamp: new Date().toISOString(),
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, totalUsers, sent, failed, duration_ms }),
  };
};