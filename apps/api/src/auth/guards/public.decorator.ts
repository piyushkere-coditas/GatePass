import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opts a route (or controller) out of the global sign-in check: sign-in routes, /health, /__test. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
