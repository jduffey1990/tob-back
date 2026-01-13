// src/controllers/email.service.ts
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

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
      region: process.env.AWS_REGION || 'us-east-1' 
    });
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@foxdogdevelopment.com';
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


}

