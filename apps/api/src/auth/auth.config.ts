export interface AuthConfig {
  jwtSecret: string;
  otpSecret: string;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

const MIN_SECRET_LENGTH = 32;

/** Secrets come from the environment. Outside production a fixed dev secret is used when unset. */
export function authConfigFromEnv(nodeEnv: string, env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const read = (name: 'JWT_SECRET' | 'OTP_SECRET'): string => {
    const value = env[name];
    if (nodeEnv !== 'production') return value || `dev-only-${name.toLowerCase()}-not-for-production`;
    if (!value || value.length < MIN_SECRET_LENGTH) {
      throw new Error(`${name} must be set to at least ${MIN_SECRET_LENGTH} characters in production`);
    }
    return value;
  };
  return { jwtSecret: read('JWT_SECRET'), otpSecret: read('OTP_SECRET') };
}
