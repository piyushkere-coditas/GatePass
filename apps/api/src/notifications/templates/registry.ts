import { html, layout } from './html';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  /** Payload fields removed from the outbox row once the email is sent (NT-7). */
  secretFields: string[];
}

interface TemplatePayloads {
  'login-code': { code: string };
}

export type TemplateName = keyof TemplatePayloads;
export type TemplatePayload<T extends TemplateName> = TemplatePayloads[T];

const TEMPLATES: { [T in TemplateName]: (p: TemplatePayloads[T]) => RenderedEmail } = {
  'login-code': ({ code }) => ({
    subject: `Your Gate Pass sign-in code: ${code}`,
    html: layout(
      'Your sign-in code',
      html`<p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:0 0 16px">${code}</p>
        <p>It expires in 10 minutes. If you didn't request it, you can ignore this email.</p>`,
    ),
    text: `Your Coditas Gate Pass sign-in code is ${code}.\nIt expires in 10 minutes. If you didn't request it, you can ignore this email.`,
    secretFields: ['code'],
  }),
};

export function renderEmail<T extends TemplateName>(template: T, payload: TemplatePayload<T>): RenderedEmail {
  return TEMPLATES[template](payload);
}

export function isTemplateName(name: string): name is TemplateName {
  return name in TEMPLATES;
}
