// uuid v13 is ESM-only, which Jest (CJS) cannot load; the app only uses v4.
const { randomUUID } = require('crypto');

module.exports = { v4: () => randomUUID() };
