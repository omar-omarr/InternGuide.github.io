const productionOrigin = 'https://omar-omarr.github.io';

function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const errors = [];

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required in production.');
  }

  if (process.env.PGSSL !== 'true') {
    errors.push('PGSSL must be true in production.');
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters in production.');
  }

  if (!process.env.CLIENT_ORIGIN || process.env.CLIENT_ORIGIN === '*') {
    errors.push(`CLIENT_ORIGIN must be set to ${productionOrigin} in production.`);
  }

  if (errors.length) {
    throw new Error(`Invalid production environment:\n- ${errors.join('\n- ')}`);
  }
}

module.exports = {
  productionOrigin,
  validateProductionEnvironment,
};
