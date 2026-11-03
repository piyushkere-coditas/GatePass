import { Mailer, type OutgoingEmail } from '../../src/notifications/mailer';

/** Captures sent emails in order; can be told to fail. */
export class FakeMailer extends Mailer {
  readonly sent: OutgoingEmail[] = [];
  failWith: Error | null = null;

  async send(email: OutgoingEmail): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(email);
  }
}
