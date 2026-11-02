// Must stay in sync with the enums in apps/api/prisma/schema.prisma.

export const Role = { EMPLOYEE: 'EMPLOYEE', SECURITY: 'SECURITY', ADMIN: 'ADMIN' } as const;
export type Role = (typeof Role)[keyof typeof Role];

export const VisitType = { PLANNED: 'PLANNED', UNPLANNED: 'UNPLANNED' } as const;
export type VisitType = (typeof VisitType)[keyof typeof VisitType];

export const Purpose = {
  INTERVIEW: 'INTERVIEW',
  CLIENT_MEETING: 'CLIENT_MEETING',
  VENDOR_DELIVERY: 'VENDOR_DELIVERY',
  PERSONAL: 'PERSONAL',
  OTHER: 'OTHER',
} as const;
export type Purpose = (typeof Purpose)[keyof typeof Purpose];

export const PURPOSE_LABELS: Record<Purpose, string> = {
  INTERVIEW: 'Interview',
  CLIENT_MEETING: 'Client Meeting',
  VENDOR_DELIVERY: 'Vendor / Delivery',
  PERSONAL: 'Personal',
  OTHER: 'Other',
};

export const VisitStatus = {
  SCHEDULED: 'SCHEDULED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CHECKED_IN: 'CHECKED_IN',
  MEETING_OVER: 'MEETING_OVER',
  CHECKED_OUT: 'CHECKED_OUT',
  CANCELLED: 'CANCELLED',
} as const;
export type VisitStatus = (typeof VisitStatus)[keyof typeof VisitStatus];
