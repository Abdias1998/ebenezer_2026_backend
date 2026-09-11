import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(4001),
  MONGODB_URI: Joi.string().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),
  QR_SECRET: Joi.string().min(16).required(),
  FEEXPAY_API_KEY: Joi.string().optional(),
  FEEXPAY_SHOP_ID: Joi.string().optional(),
  FEEXPAY_BASE_URL: Joi.string().uri().optional(),
  SEED_SUPER_ADMIN_EMAIL: Joi.string()
    .email({ tlds: { allow: false } })
    .optional(),
  SEED_SUPER_ADMIN_PASSWORD: Joi.string().min(8).optional(),
});
