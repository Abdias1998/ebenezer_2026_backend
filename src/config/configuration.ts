export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4001', 10),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:4000,http://localhost:4001,http://localhost:4002')
    .split(',')
    .map((origin) => origin.trim()),
  mongodbUri: process.env.MONGODB_URI,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
  qrSecret: process.env.QR_SECRET,
  feexpay: {
    apiKey: process.env.FEEXPAY_API_KEY,
    shopId: process.env.FEEXPAY_SHOP_ID,
    baseUrl:
      process.env.FEEXPAY_BASE_URL ?? 'https://api-v2.feexpay.me',
    callbackUrl:
      process.env.FEEXPAY_CALLBACK_URL,
  },
  seed: {
    superAdminEmail: process.env.SEED_SUPER_ADMIN_EMAIL,
    superAdminPassword: process.env.SEED_SUPER_ADMIN_PASSWORD,
  },
});
