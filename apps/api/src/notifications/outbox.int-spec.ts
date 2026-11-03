import { type AddressInfo } from 'node:net';
import { EmailStatus, PrismaClient } from '@prisma/client';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import { AdjustableClock } from '../common/clock';
import type { PrismaService } from '../prisma/prisma.service';
import { NOW } from '../../test/fixtures';
import { resetDb } from '../../test/int/db';
import { FakeMailer } from '../../test/int/fake-mailer';
import { SmtpMailer } from './mailer';
import { OUTBOX_PRIORITY_HIGH, OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox.worker';

describe('Email outbox (Postgres)', () => {
  const prisma = new PrismaClient();
  const db = prisma as unknown as PrismaService;
  const clock = new AdjustableClock();
  const outbox = new OutboxService(clock);
  let mailer: FakeMailer;
  const worker = (batchSize = 20, m: FakeMailer | SmtpMailer = mailer) =>
    new OutboxWorker(db, clock, m, { intervalMs: 0, batchSize, autoStart: false });

  const loginCode = (n: number, priority = 0) => ({
    dedupeKey: `login-code:${n}`,
    to: `user${n}@coditas.com`,
    template: 'login-code' as const,
    payload: { code: String(100000 + n) },
    priority,
  });

  beforeEach(async () => {
    clock.set(NOW);
    mailer = new FakeMailer();
    await resetDb(prisma);
  });
  afterAll(() => prisma.$disconnect());

  it('[NT-I-03] the same dedupe key is enqueued only once', async () => {
    await outbox.enqueue(prisma, loginCode(1));
    await outbox.enqueue(prisma, loginCode(1));
    expect(await prisma.emailOutbox.count()).toBe(1);
  });

  it('[NT-I-03] enqueue joins the caller transaction (rolled back with it)', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await outbox.enqueue(tx, loginCode(1));
        throw new Error('state change failed');
      }),
    ).rejects.toThrow('state change failed');
    expect(await prisma.emailOutbox.count()).toBe(0);
  });

  it('[NT-I-04] the worker delivers over SMTP with subject, HTML and text', async () => {
    const received: Array<{ to: string; subject: string; html: string; text: string }> = [];
    const server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      onData(stream, _session, callback) {
        simpleParser(stream)
          .then((mail) => {
            received.push({
              to: (Array.isArray(mail.to) ? mail.to[0] : mail.to)?.text ?? '',
              subject: mail.subject ?? '',
              html: typeof mail.html === 'string' ? mail.html : '',
              text: mail.text ?? '',
            });
            callback();
          })
          .catch(callback);
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.server.address() as AddressInfo).port;
    try {
      const smtp = new SmtpMailer({ host: '127.0.0.1', port, from: 'Gate Pass <gatepass@coditas.com>' });
      await outbox.enqueue(prisma, loginCode(7));

      expect(await worker(20, smtp).runOnce()).toBe(1);

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        to: 'user7@coditas.com',
        subject: 'Your Gate Pass sign-in code: 100007',
      });
      expect(received[0]!.html).toContain('100007');
      expect(received[0]!.text).toContain('100007');
      const row = await prisma.emailOutbox.findFirstOrThrow();
      expect(row.status).toBe(EmailStatus.SENT);
      expect(row.sentAt).toEqual(NOW);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('[NT-I-05] rows scheduled for later are not sent yet', async () => {
    await outbox.enqueue(prisma, loginCode(1));
    await prisma.emailOutbox.updateMany({ data: { sendAfter: new Date(NOW.getTime() + 60_000) } });

    expect(await worker().runOnce()).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it('[NT-I-06] a send failure is recorded and retried after 1 minute', async () => {
    await outbox.enqueue(prisma, loginCode(1));
    mailer.failWith = new Error('421 Service not available');

    await worker().runOnce();

    expect(await prisma.emailOutbox.findFirstOrThrow()).toMatchObject({
      status: EmailStatus.PENDING,
      attempts: 1,
      lastError: '421 Service not available',
      sendAfter: new Date(NOW.getTime() + 60_000),
      lockedAt: null,
    });
  });

  it('[NT-I-07] the 5th failure marks the email FAILED', async () => {
    await outbox.enqueue(prisma, loginCode(1));
    await prisma.emailOutbox.updateMany({ data: { attempts: 4 } });
    mailer.failWith = new Error('SMTP down');

    await worker().runOnce();

    expect(await prisma.emailOutbox.findFirstOrThrow()).toMatchObject({
      status: EmailStatus.FAILED,
      attempts: 5,
    });
  });

  it('[NT-I-08] two workers running at once send each email exactly once', async () => {
    for (let n = 1; n <= 50; n += 1) await outbox.enqueue(prisma, loginCode(n));
    const drain = async (w: OutboxWorker) => {
      while ((await w.runOnce()) > 0);
    };

    await Promise.all([drain(worker(10)), drain(worker(10))]);

    expect(mailer.sent).toHaveLength(50);
    expect(new Set(mailer.sent.map((e) => e.to)).size).toBe(50);
    expect(await prisma.emailOutbox.count({ where: { status: EmailStatus.SENT } })).toBe(50);
  });

  it('[NT-I-11] a priority item is delivered on kick, and its secret is scrubbed once sent', async () => {
    const w = worker();
    await outbox.enqueue(prisma, loginCode(9, OUTBOX_PRIORITY_HIGH));

    const started = Date.now();
    await w.kick();

    expect(Date.now() - started).toBeLessThan(2000);
    expect(mailer.sent.map((e) => e.subject)).toEqual(['Your Gate Pass sign-in code: 100009']);
    const row = await prisma.emailOutbox.findFirstOrThrow();
    expect(row.status).toBe(EmailStatus.SENT);
    expect(row.payload).toEqual({});
  });

  it('[NT-I-12] priority items are sent before older normal items', async () => {
    for (let n = 1; n <= 10; n += 1) await outbox.enqueue(prisma, loginCode(n));
    await outbox.enqueue(prisma, loginCode(99, OUTBOX_PRIORITY_HIGH));

    await worker().runOnce();

    expect(mailer.sent[0]!.to).toBe('user99@coditas.com');
    expect(mailer.sent).toHaveLength(11);
  });

  it('[NT-I-13] an email stuck in SENDING for 5+ minutes (crashed worker) is picked up again', async () => {
    await outbox.enqueue(prisma, loginCode(1));
    await prisma.emailOutbox.updateMany({
      data: { status: EmailStatus.SENDING, lockedAt: new Date(NOW.getTime() - 5 * 60_000 - 1) },
    });
    await outbox.enqueue(prisma, loginCode(2));
    await prisma.emailOutbox.updateMany({
      where: { dedupeKey: 'login-code:2' },
      data: { status: EmailStatus.SENDING, lockedAt: new Date(NOW.getTime() - 60_000) },
    });

    expect(await worker().runOnce()).toBe(1);
    expect(mailer.sent.map((e) => e.to)).toEqual(['user1@coditas.com']);
  });
});
