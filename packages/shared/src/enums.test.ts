import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PURPOSE_LABELS, Purpose, Role, VisitStatus, VisitType } from './enums';

const schema = readFileSync(new URL('../../../apps/api/prisma/schema.prisma', import.meta.url), 'utf8');

function prismaEnum(name: string): string[] {
  const body = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema)?.[1];
  if (!body) throw new Error(`enum ${name} not found in schema.prisma`);
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'));
}

describe('shared enums', () => {
  it.each([
    ['Role', Role],
    ['VisitType', VisitType],
    ['Purpose', Purpose],
    ['VisitStatus', VisitStatus],
  ])('[SM-U-29] %s matches the Prisma schema', (name, values) => {
    expect(Object.values(values)).toEqual(prismaEnum(name));
  });

  it('[SM-U-29] every purpose has the label agreed in REQUIREMENTS (Q3)', () => {
    expect(PURPOSE_LABELS).toEqual({
      INTERVIEW: 'Interview',
      CLIENT_MEETING: 'Client Meeting',
      VENDOR_DELIVERY: 'Vendor / Delivery',
      PERSONAL: 'Personal',
      OTHER: 'Other',
    });
  });
});
