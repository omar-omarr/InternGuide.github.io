const jwt = require('jsonwebtoken');

function signAuthToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

module.exports = {
  signAuthToken,
};
