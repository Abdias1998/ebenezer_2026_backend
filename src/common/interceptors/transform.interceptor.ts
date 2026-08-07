import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Wraps every successful response in a standard envelope. If the handler
 * returns a paginated result (`{ items, meta }`), `data` becomes `items`
 * and `meta` is hoisted to the top level.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, StandardResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardResponse<T>> {
    return next.handle().pipe(
      map((result) => {
        if (
          result &&
          typeof result === 'object' &&
          'items' in result &&
          'meta' in result
        ) {
          return {
            success: true,
            data: (result as { items: T }).items,
            meta: (result as { meta: Record<string, unknown> }).meta,
          };
        }
        return { success: true, data: result };
      }),
    );
  }
}
