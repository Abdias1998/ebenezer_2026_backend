import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as not requiring a JWT. Combine with JwtAuthGuard, which
 * checks this metadata and skips the passport strategy when present.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
