const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

module.exports = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: 'https://project-qr.eu.auth0.com/.well-known/jwks.json',
  }),

  // Validate the audience and the issuer.
  audience: 'https://api.menu-qr.tech',
  issuer: 'https://project-qr.eu.auth0.com/',
  algorithms: ['RS256'],
  credentialsRequired: false,
});
