import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, errors } = this.resolve(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      errors,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private resolve(exception: unknown): {
    status: number;
    message: string;
    errors: unknown;
  } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return { status: exception.getStatus(), message: response, errors: null };
      }
      const body = response as Record<string, unknown>;
      const message = Array.isArray(body.message)
        ? 'Validation failed'
        : ((body.message as string) ?? exception.message);
      const errors = Array.isArray(body.message) ? body.message : null;
      return { status: exception.getStatus(), message, errors };
    }

    // Mongo duplicate key error
    if (
      exception &&
      typeof exception === 'object' &&
      (exception as { code?: number }).code === 11000
    ) {
      return {
        status: HttpStatus.CONFLICT,
        message: 'Duplicate resource',
        errors: (exception as { keyValue?: unknown }).keyValue ?? null,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      errors: null,
    };
  }
}
