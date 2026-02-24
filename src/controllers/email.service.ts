// src/controllers/email.service.ts
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { formatBytes, formatDuration } from './statsService';

interface SendInviteEmailParams {
  to: string;
  subject: string;
  body: string;
  code: string;
  image?: string;
}

export class EmailService {
  private sesClient: SESClient;
  private fromEmail: string;

  constructor() {
    this.sesClient = new SESClient({ 
      region: process.env.AWS_REGION || 'us-east-2' 
    });
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@tobprayer.app';
  }

  /**
   * Send account activation email
   */
  async sendActivationEmail(email: string, activationToken: string): Promise<void> {
    const activationUrl = `${process.env.APP_URL}/activate.html?token=${activationToken}`;
    
    const subject = 'Activate Your Tower of Babble Account';
    
    const htmlBody = this.createActivationHtml({
      email,
      activationUrl,
      activationToken
    });

    const textBody = `
      Welcome to Tower of Babble!

      Please activate your account by visiting the following link:
      ${activationUrl}

      This activation link expires in 24 hours.

      If you didn't create this account, you can safely ignore this email.

      © ${new Date().getFullYear()} Tower of Babble. All rights reserved.
          `.trim();

    const command = new SendEmailCommand({
      Source: this.fromEmail,
      Destination: {
        ToAddresses: [email]
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8'
          },
          Text: {
            Data: textBody,
            Charset: 'UTF-8'
          }
        }
      }
    });

    try {
      const response = await this.sesClient.send(command);
      console.log('Activation email sent successfully:', response.MessageId);
    } catch (error) {
      console.error('Failed to send activation email:', error);
      throw new Error('Failed to send activation email');
    }
  }

  /**
   * Create HTML email template for account activation
   */
  private createActivationHtml(params: { email: string; activationUrl: string; activationToken: string }): string {
    const { email, activationUrl } = params;
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activate Your Tower of Babble Account</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 30px;
      text-align: center;
      color: white;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header p {
      margin: 10px 0 0;
      font-size: 16px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
    }
    .welcome-message {
      font-size: 18px;
      font-weight: 600;
      color: #667eea;
      margin-bottom: 20px;
    }
    .message {
      font-size: 16px;
      line-height: 1.8;
      color: #555;
      margin-bottom: 30px;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      padding: 16px 48px;
      border-radius: 30px;
      font-weight: 600;
      font-size: 16px;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }
    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
    }
    .security-notice {
      background: #e3f2fd;
      border-left: 4px solid #2196f3;
      padding: 12px 16px;
      margin: 20px 0;
      font-size: 14px;
      color: #0d47a1;
      border-radius: 4px;
    }
    .footer {
      background: #f9f9f9;
      padding: 20px 30px;
      text-align: center;
      font-size: 14px;
      color: #666;
      border-top: 1px solid #e0e0e0;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Tower of Babble! 🙏</h1>
      <p>Just one more step to get started</p>
    </div>
    
    <div class="content">
      <div class="welcome-message">
        Hi there! We're excited to have you join us.
      </div>
      
      <div class="message">
        Your Tower of Babble account has been created for <strong>${email}</strong>. 
        To start using your account, please activate it by clicking the button below.
      </div>

      <div class="button-container">
        <a href="${activationUrl}" class="cta-button">
          Activate My Account
        </a>
      </div>

      <div class="security-notice">
        🔒 If you didn't create this account, please disregard this email. Your security is important to us.
      </div>
    </div>
    
    <div class="footer">
      <p>
        Need help? Contact us at <a href="mailto:support@towerofbabble.com">support@towerofbabble.com</a>
      </p>
      <p style="margin-top: 15px;">
        This email was sent to ${email}
      </p>
      <p style="margin-top: 20px; color: #999;">
        © ${new Date().getFullYear()} Tower of Babble. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.APP_URL}/reset-password.html?token=${resetToken}`;
    
    const subject = 'Reset Your Tower of Babble Password';
    
    const htmlBody = this.createPasswordResetHtml({
      email,
      resetUrl,
      resetToken
    });

    const textBody = `
      Password Reset Request

      We received a request to reset the password for your Tower of Babble account.

      To reset your password, visit the following link:
      ${resetUrl}

      This password reset link expires in 1 hour.

      If you didn't request this password reset, you can safely ignore this email.

      © ${new Date().getFullYear()} Tower of Babble. All rights reserved.
          `.trim();

    const command = new SendEmailCommand({
      Source: this.fromEmail,
      Destination: {
        ToAddresses: [email]
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8'
          },
          Text: {
            Data: textBody,
            Charset: 'UTF-8'
          }
        }
      }
    });

    try {
      const response = await this.sesClient.send(command);
      console.log('Password reset email sent successfully:', response.MessageId);
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  /**
   * Create HTML email template for password reset
   */
  private createPasswordResetHtml(params: { email: string; resetUrl: string; resetToken: string }): string {
    const { email, resetUrl, resetToken } = params;
    
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0 0 10px 0;
            font-size: 28px;
            font-weight: 700;
          }
          .header p {
            margin: 0;
            font-size: 16px;
            opacity: 0.9;
          }
          .content {
            padding: 40px 30px;
          }
          .message {
            font-size: 16px;
            color: #555;
            margin-bottom: 30px;
            line-height: 1.8;
          }
          .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px 40px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            text-align: center;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
          }
          .button-container {
            text-align: center;
            margin: 30px 0;
          }
          .security-notice {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 16px;
            margin: 30px 0;
            font-size: 14px;
            color: #856404;
            border-radius: 4px;
          }
          .expiry-notice {
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 16px;
            margin: 30px 0;
            font-size: 14px;
            color: #0d47a1;
            border-radius: 4px;
          }
          .footer {
            background: #f9f9f9;
            padding: 30px;
            text-align: center;
            font-size: 14px;
            color: #666;
            border-top: 1px solid #e0e0e0;
          }
          .footer a {
            color: #667eea;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
            <p>Tower of Babble</p>
          </div>
          
          <div class="content">
            <div class="message">
              Hello,
            </div>
            
            <div class="message">
              We received a request to reset the password for your Tower of Babble account (<strong>${email}</strong>).
            </div>

            <div class="message">
              Click the button below to create a new password:
            </div>

            <div class="button-container">
              <a href="${resetUrl}" class="cta-button">
                Reset My Password
              </a>
            </div>

            <div class="expiry-notice">
              ⏰ This password reset link will expire in 1 hour for security reasons.
            </div>

            <div class="security-notice">
              🔒 If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
            </div>
          </div>
          
          <div class="footer">
            <p>
              Need help? Contact us at <a href="mailto:support@tobprayer.app">support@tobprayer.app</a>
            </p>
            <p style="margin-top: 15px;">
              This email was sent to ${email}
            </p>
            <p style="margin-top: 20px; color: #999;">
              © ${new Date().getFullYear()} Tower of Babble. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
          `.trim();
  }

  /**
   * Send daily stats digest email to admin
   */
  async sendDailyStatsEmail(toEmail: string, stats: any): Promise<void> {
    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'America/Denver'
    });
    
    const subject = `📊 Tower of Babble Daily Stats - ${today}`;
    
    const htmlBody = this.createDailyStatsHtml(stats, today);
    
    const textBody = this.createDailyStatsText(stats, today);

    const command = new SendEmailCommand({
      Source: this.fromEmail,
      Destination: {
        ToAddresses: [toEmail]
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8'
          },
          Text: {
            Data: textBody,
            Charset: 'UTF-8'
          }
        }
      }
    });

    try {
      const response = await this.sesClient.send(command);
      console.log('Daily stats email sent successfully:', response.MessageId);
    } catch (error) {
      console.error('Failed to send daily stats email:', error);
      throw new Error('Failed to send daily stats email');
    }
  }

  /**
   * Plain text fallback for daily stats email
   */
  private createDailyStatsText(stats: any, today: string): string {
    const { users, content, ai, audio, misc } = stats;

    return `
      Tower of Babble - Daily Stats
      ${today}
      ================================

      👥 USERS
      Total: ${users.totalUsers}
      By Tier: ${Object.entries(users.usersByTier).map(([k, v]) => `${k}: ${v}`).join(', ')}
      New (24h): ${users.newUsersLast24h} ${Object.entries(users.newUsersByTier).map(([k, v]) => `(${k}: ${v})`).join(' ')}
      Expired Pro: ${users.expiredProUsers}
      Unverified: ${users.unverifiedUsers}

      📖 CONTENT & ENGAGEMENT
      Total Prayers: ${content.totalPrayers}
      New Prayers (24h): ${content.newPrayersLast24h}
      Avg by Tier: ${Object.entries(content.avgPrayersByTier).map(([k, v]) => `${k}: ${v}`).join(', ')}
      Total Plays: ${content.totalPlayCount.toLocaleString()}
      Plays (24h): ${content.playsLast24h}
      Most Played: ${content.mostPlayedPrayer ? `"${content.mostPlayedPrayer.title}" (${content.mostPlayedPrayer.play_count}x) by ${content.mostPlayedPrayer.user_name}` : 'N/A'}

      🤖 AI GENERATIONS
      Total: ${ai.totalGenerations}
      Last 24h: ${ai.generationsLast24h}
      Avg Response Time: ${ai.avgResponseTimeMs ? `${ai.avgResponseTimeMs}ms` : 'N/A'}
      Avg per User: ${ai.avgGenerationsPerUser}

      🔊 AUDIO / TTS
      Total Files: ${audio.totalAudioFiles}
      New (24h): ${audio.newAudioLast24h}
      By Provider: ${Object.entries(audio.byProvider).map(([k, v]) => `${k}: ${v}`).join(', ')}
      Total Storage: ${formatBytes(audio.totalStorageBytes)}
      Total Duration: ${formatDuration(audio.totalDurationSeconds)}

      📋 MISC
      Denominations: ${Object.entries(misc.denominationBreakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}
      Password Resets (24h): ${misc.passwordResetsLast24h}
      Templates: ${misc.prayOnItTemplates.active} active, ${misc.prayOnItTemplates.inactive} inactive
      Top Users: ${misc.topUsers.map((u: any) => `${u.name} (${u.prayer_count} prayers, ${u.play_count} plays)`).join('; ')}

      Generated at: ${stats.generatedAt}
          `.trim();
  }

  /**
   * HTML email template for daily stats
   */
  private createDailyStatsHtml(stats: any, today: string): string {
    const { users, content, ai, audio, misc } = stats;

    // Helper for tier badge colors
    const tierColor = (tier: string): string => {
      const colors: Record<string, string> = {
        free: '#6b7280',
        pro: '#8b5cf6',
        lifetime: '#f59e0b',
        prayer_warrior: '#ef4444',
      };
      return colors[tier] || '#6b7280';
    };

    const tierBadges = Object.entries(users.usersByTier)
      .map(([tier, count]) => `
        <span style="display:inline-block;padding:4px 12px;border-radius:12px;background:${tierColor(tier)};color:#fff;font-size:13px;margin:2px 4px;">
          ${tier}: ${count}
        </span>
      `).join('');

    const newTierBadges = Object.entries(users.newUsersByTier)
      .map(([tier, count]) => `
        <span style="display:inline-block;padding:2px 8px;border-radius:8px;background:${tierColor(tier)}22;color:${tierColor(tier)};font-size:12px;margin:1px 2px;border:1px solid ${tierColor(tier)}44;">
          +${count} ${tier}
        </span>
      `).join('') || '<span style="color:#9ca3af;font-size:12px;">none</span>';

    const providerRows = Object.entries(audio.byProvider)
      .map(([provider, count]) => `
        <tr>
          <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${provider}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;">${count}</td>
        </tr>
      `).join('');

    const denomRows = Object.entries(misc.denominationBreakdown)
      .slice(0, 10) // Top 10
      .map(([denom, count]) => `
        <tr>
          <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${denom}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;">${count}</td>
        </tr>
      `).join('');

    const topUserRows = misc.topUsers
      .map((u: any, i: number) => `
        <tr>
          <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${i + 1}. ${u.name}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;">${u.prayer_count}</td>
          <td style="padding:4px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;">${u.play_count}</td>
        </tr>
      `).join('');

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Daily Stats - Tower of Babble</title>
        </head>
        <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
          <div style="max-width:640px;margin:0 auto;padding:20px;">
            
            <!-- Header -->
            <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:12px 12px 0 0;padding:24px 32px;color:#fff;">
              <h1 style="margin:0;font-size:22px;font-weight:600;">🗼 Tower of Babble</h1>
              <p style="margin:4px 0 0;font-size:14px;opacity:0.85;">Daily Stats Digest — ${today}</p>
            </div>

            <div style="background:#fff;border-radius:0 0 12px 12px;padding:0;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

              <!-- ========== USERS ========== -->
              <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
                <h2 style="margin:0 0 16px;font-size:16px;color:#1f2937;">👥 Users</h2>
                
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
                  <div style="flex:1;min-width:120px;background:#f0fdf4;border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:#16a34a;">${users.totalUsers}</div>
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Total Users</div>
                  </div>
                  <div style="flex:1;min-width:120px;background:#eff6ff;border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:#2563eb;">+${users.newUsersLast24h}</div>
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">New (24h)</div>
                  </div>
                  <div style="flex:1;min-width:120px;background:#fef2f2;border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:28px;font-weight:700;color:#dc2626;">${users.expiredProUsers}</div>
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Expired Pro</div>
                  </div>
                </div>

                <div style="margin-bottom:8px;">
                  <span style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">By Tier:</span><br/>
                  ${tierBadges}
                </div>
                <div>
                  <span style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">New by Tier (24h):</span><br/>
                  ${newTierBadges}
                </div>
                ${users.unverifiedUsers > 0 ? `
                <div style="margin-top:8px;padding:8px 12px;background:#fefce8;border-radius:6px;font-size:12px;color:#854d0e;">
                  ⚠️ ${users.unverifiedUsers} unverified user${users.unverifiedUsers !== 1 ? 's' : ''} (haven't activated email)
                </div>` : ''}
              </div>

              <!-- ========== CONTENT & ENGAGEMENT ========== -->
              <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
                <h2 style="margin:0 0 16px;font-size:16px;color:#1f2937;">📖 Content & Engagement</h2>
                
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;">Total Prayers</td>
                    <td style="padding:6px 0;text-align:right;font-weight:600;">${content.totalPrayers.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;">New Prayers (24h)</td>
                    <td style="padding:6px 0;text-align:right;font-weight:600;color:#16a34a;">+${content.newPrayersLast24h}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;">Total Plays (all time)</td>
                    <td style="padding:6px 0;text-align:right;font-weight:600;">${content.totalPlayCount.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;">Prayers Played (24h)</td>
                    <td style="padding:6px 0;text-align:right;font-weight:600;">${content.playsLast24h}</td>
                  </tr>
                  ${Object.entries(content.avgPrayersByTier).map(([tier, avg]) => `
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;">Avg Prayers (${tier})</td>
                    <td style="padding:6px 0;text-align:right;font-weight:600;">${avg}</td>
                  </tr>
                  `).join('')}
                </table>

                ${content.mostPlayedPrayer ? `
                <div style="margin-top:12px;padding:12px 16px;background:#faf5ff;border-radius:8px;border-left:3px solid #8b5cf6;">
                  <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">🏆 Most Played Prayer</div>
                  <div style="font-size:14px;font-weight:600;color:#1f2937;">"${content.mostPlayedPrayer.title}"</div>
                  <div style="font-size:12px;color:#6b7280;">${content.mostPlayedPrayer.play_count} plays · by ${content.mostPlayedPrayer.user_name}</div>
                </div>` : ''}
              </div>

              <!-- ========== AI GENERATIONS ========== -->
              <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
                <h2 style="margin:0 0 16px;font-size:16px;color:#1f2937;">🤖 AI Generations</h2>
                
                <div style="display:flex;gap:16px;flex-wrap:wrap;">
                  <div style="flex:1;min-width:100px;background:#f0f9ff;border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:#0284c7;">${ai.totalGenerations}</div>
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Total</div>
                  </div>
                  <div style="flex:1;min-width:100px;background:#f0fdf4;border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:#16a34a;">+${ai.generationsLast24h}</div>
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Last 24h</div>
                  </div>
                  <div style="flex:1;min-width:100px;background:#fefce8;border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:#ca8a04;">${ai.avgResponseTimeMs ? ai.avgResponseTimeMs + 'ms' : 'N/A'}</div>
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Avg Response</div>
                  </div>
                  <div style="flex:1;min-width:100px;background:#faf5ff;border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:#7c3aed;">${ai.avgGenerationsPerUser}</div>
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Avg/User</div>
                  </div>
                </div>
              </div>

              <!-- ========== AUDIO / TTS ========== -->
              <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
                <h2 style="margin:0 0 16px;font-size:16px;color:#1f2937;">🔊 Audio / TTS</h2>
                
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
                  <div style="flex:1;min-width:100px;background:#fff7ed;border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:#ea580c;">${audio.totalAudioFiles}</div>
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Total Files</div>
                  </div>
                  <div style="flex:1;min-width:100px;background:#f0fdf4;border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:#16a34a;">+${audio.newAudioLast24h}</div>
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">New (24h)</div>
                  </div>
                  <div style="flex:1;min-width:100px;background:#eff6ff;border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:#2563eb;">${formatBytes(audio.totalStorageBytes)}</div>
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">S3 Storage</div>
                  </div>
                  <div style="flex:1;min-width:100px;background:#faf5ff;border-radius:8px;padding:12px 16px;text-align:center;">
                    <div style="font-size:24px;font-weight:700;color:#7c3aed;">${formatDuration(audio.totalDurationSeconds)}</div>
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;">Total Audio</div>
                  </div>
                </div>

                <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">By Provider</div>
                <table style="width:100%;border-collapse:collapse;">
                  <thead>
                    <tr style="background:#f9fafb;">
                      <th style="padding:6px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Provider</th>
                      <th style="padding:6px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${providerRows}
                  </tbody>
                </table>
              </div>

              <!-- ========== MISC ========== -->
              <div style="padding:24px 32px;">
                <h2 style="margin:0 0 16px;font-size:16px;color:#1f2937;">📋 Miscellaneous</h2>
                
                <div style="display:flex;gap:24px;flex-wrap:wrap;">
                  <!-- Denominations -->
                  <div style="flex:1;min-width:200px;">
                    <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Denominations</div>
                    <table style="width:100%;border-collapse:collapse;">
                      ${denomRows}
                    </table>
                  </div>

                  <!-- Top Users -->
                  <div style="flex:1;min-width:200px;">
                    <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Top Users</div>
                    <table style="width:100%;border-collapse:collapse;">
                      <thead>
                        <tr style="background:#f9fafb;">
                          <th style="padding:4px 12px;text-align:left;font-size:11px;color:#6b7280;">User</th>
                          <th style="padding:4px 12px;text-align:center;font-size:11px;color:#6b7280;">Prayers</th>
                          <th style="padding:4px 12px;text-align:center;font-size:11px;color:#6b7280;">Plays</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${topUserRows}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style="margin-top:16px;display:flex;gap:16px;flex-wrap:wrap;">
                  <div style="padding:8px 16px;background:#f3f4f6;border-radius:6px;font-size:13px;">
                    🔑 Password Resets (24h): <strong>${misc.passwordResetsLast24h}</strong>
                  </div>
                  <div style="padding:8px 16px;background:#f3f4f6;border-radius:6px;font-size:13px;">
                    📝 Templates: <strong>${misc.prayOnItTemplates.active}</strong> active / <strong>${misc.prayOnItTemplates.inactive}</strong> inactive
                  </div>
                </div>
              </div>

            </div>

            <!-- Footer -->
            <div style="text-align:center;padding:16px;font-size:11px;color:#9ca3af;">
              Generated at ${stats.generatedAt} · Tower of Babble Admin
            </div>
          </div>
        </body>
        </html>`;
  }



}

