import nodemailer from 'nodemailer';
import { log } from './log';
import type { Env, Mailer } from './ports';

export type { MailMessage, Mailer } from './ports';

export function createMailer(env: Env): Mailer {
  if (!env.smtpUrl) {
    return {
      enabled: false,
      send: async (message) => {
        log.info('email not sent because SMTP_URL is empty', { to: message.to, subject: message.subject, text: message.text });
      },
    };
  }
  const transport = nodemailer.createTransport(env.smtpUrl);
  return {
    enabled: true,
    send: async (message) => {
      await transport.sendMail({ from: env.mailFrom, ...message });
    },
  };
}
