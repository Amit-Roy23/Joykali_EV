/**
 * JWT secrets. The development fallbacks are public (they are in the repo),
 * so in production a missing or default secret is a hard error — otherwise
 * anyone could mint an Admin token. Edge-runtime safe (no Node APIs).
 */
const DEV_ACCESS = "joykali_jwt_access_secret_super_secure_key_12345";
const DEV_REFRESH = "joykali_jwt_refresh_secret_super_secure_key_67890";

function resolve(name: string, value: string | undefined, fallback: string): Uint8Array {
  const isProd = process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
  if (isProd && (!value || value === fallback || value.length < 32)) {
    throw new Error(`${name} must be set to a unique value of at least 32 characters in production`);
  }
  return new TextEncoder().encode(value || fallback);
}

let access: Uint8Array | null = null;
let refresh: Uint8Array | null = null;

export function accessSecret(): Uint8Array {
  return (access ??= resolve("JWT_ACCESS_SECRET", process.env.JWT_ACCESS_SECRET, DEV_ACCESS));
}

export function refreshSecret(): Uint8Array {
  return (refresh ??= resolve("JWT_REFRESH_SECRET", process.env.JWT_REFRESH_SECRET, DEV_REFRESH));
}
