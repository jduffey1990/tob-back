"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
// src/services/email.service.ts
const client_ses_1 = require("@aws-sdk/client-ses");
class EmailService {
    constructor() {
        this.sesClient = new client_ses_1.SESClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });
        this.fromEmail = process.env.FROM_EMAIL || 'noreply@foxdogdevelopment.com';
    }
    /**
     * Send account activation email
     */
    sendActivationEmail(email, activationToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const activationUrl = `${process.env.APP_URL}/#/activate/${activationToken}`;
            const subject = 'Activate Your Mozaiq Account';
            const htmlBody = this.createActivationHtml({
                email,
                activationUrl,
                activationToken
            });
            const textBody = `
      Welcome to Mozaiq!

      Please activate your account by visiting the following link:
      ${activationUrl}

      This activation link expires in 24 hours.

      If you didn't create this account, you can safely ignore this email.

      © ${new Date().getFullYear()} Mozaiq. All rights reserved.
          `.trim();
            const command = new client_ses_1.SendEmailCommand({
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
                const response = yield this.sesClient.send(command);
                console.log('Activation email sent successfully:', response.MessageId);
            }
            catch (error) {
                console.error('Failed to send activation email:', error);
                throw new Error('Failed to send activation email');
            }
        });
    }
    /**
     * Create HTML email template for account activation
     */
    createActivationHtml(params) {
        const { email, activationUrl, activationToken } = params;
        return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activate Your Mozaiq Account</title>
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
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #5b9279 0%, #2b5345 100%);
      padding: 40px 20px;
      text-align: center;
    }
    .header h1 {
      color: white;
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header p {
      color: rgba(255, 255, 255, 0.9);
      margin: 10px 0 0 0;
      font-size: 16px;
    }
    .content {
      padding: 40px 30px;
    }
    .welcome-message {
      font-size: 18px;
      color: #333;
      margin-bottom: 20px;
      text-align: center;
    }
    .message {
      font-size: 16px;
      color: #444;
      margin: 20px 0;
      line-height: 1.8;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #5b9279 0%, #2b5345 100%);
      color: white !important;
      padding: 16px 40px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      margin: 30px 0;
      font-size: 16px;
      transition: transform 0.2s;
    }
    .cta-button:hover {
      transform: translateY(-2px);
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .divider {
      text-align: center;
      margin: 30px 0;
      color: #999;
      font-size: 14px;
    }
    .divider::before,
    .divider::after {
      content: '';
      display: inline-block;
      width: 100px;
      height: 1px;
      background: #ddd;
      vertical-align: middle;
      margin: 0 10px;
    }
    .code-box {
      background: #f9f9f9;
      border: 2px dashed #5b9279;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
    }
    .code-label {
      font-size: 14px;
      color: #666;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .code {
      font-size: 24px;
      font-weight: 700;
      color: #2b5345;
      letter-spacing: 2px;
      font-family: 'Courier New', monospace;
      word-break: break-all;
    }
    .expiry-notice {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 12px 16px;
      margin: 20px 0;
      font-size: 14px;
      color: #856404;
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
      color: #5b9279;
      text-decoration: none;
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Mozaiq! 🎉</h1>
      <p>Just one more step to get started</p>
    </div>
    
    <div class="content">
      <div class="welcome-message">
        Hi there! We're excited to have you join us.
      </div>
      
      <div class="message">
        Your Mozaiq account has been created for <strong>${email}</strong>. 
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
        Need help? Contact us at <a href="mailto:support@Mozaiq.com">support@Mozaiq.com</a>
      </p>
      <p style="margin-top: 15px;">
        This email was sent to ${email}
      </p>
      <p style="margin-top: 20px; color: #999;">
        © ${new Date().getFullYear()} Mozaiq. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();
    }
}
exports.EmailService = EmailService;
