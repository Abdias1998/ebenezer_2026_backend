import { HttpException, HttpStatus } from '@nestjs/common';

export class PaymentRequiredException extends HttpException {
  constructor(message = 'Le paiement est requis.') {
    super(message, HttpStatus.PAYMENT_REQUIRED);
  }
}