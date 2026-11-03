import nodemailer, { type Transporter } from 'nodemailer';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export abstract class Mailer {
  abstract send(email: OutgoingEmail): Promise<void>;
}

export interface SmtpOptions {
  host: string;
  port: number;
  from: string;
  user?: string;
  pass?: string;
}

/** SMTP delivery: SES SMTP in AWS, MailHog (or any SMTP catcher) locally. */
export class SmtpMailer extends Mailer {
  private readonly transport: Transporter;

  constructor(private readonly options: SmtpOptions) {
    super();
    this.transport = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.port === 465,
      auth: options.user ? { user: options.user, pass: options.pass } : undefined,
    });
  }

  async send(email: OutgoingEmail): Promise<void> {
    await this.transport.sendMail({ from: this.options.from, ...email });
  }
}
