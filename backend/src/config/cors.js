function parseAllowedOrigins(value) {
  return (value || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeOrigin(origin) {
  if (origin === '*') {
    return origin;
  }

  try {
    return new URL(origin).origin;
  } catch (error) {
    return origin;
  }
}

function createCorsOptions() {
  const allowedOrigins = parseAllowedOrigins(process.env.CLIENT_ORIGIN).map(normalizeOrigin);

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(normalizeOrigin(origin))) {
        return callback(null, true);
      }

      const error = new Error('CORS origin is not allowed.');
      error.status = 403;
      return callback(error);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
  };
}

module.exports = createCorsOptions;
