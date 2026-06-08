/**
 * Shared configuration for the Experts@SU web frontend.
 *
 * NEXT_PUBLIC_API_URL is read at build-time by Next.js and baked into the
 * client bundle.  When running inside Docker it is set via docker-compose;
 * for local development it falls back to localhost.
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
