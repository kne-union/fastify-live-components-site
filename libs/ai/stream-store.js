const crypto = require('node:crypto');

const TTL_MS = 2 * 60 * 1000;
const store = new Map();

const cleanup = () => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now - value.createdAt > TTL_MS) {
      store.delete(key);
    }
  }
};

const createStreamJob = payload => {
  cleanup();
  const token = crypto.randomBytes(16).toString('hex');
  store.set(token, { ...payload, createdAt: Date.now() });
  return token;
};

const takeStreamJob = token => {
  cleanup();
  const job = store.get(token);
  if (!job) {
    return null;
  }
  store.delete(token);
  return job;
};

const peekStreamJob = token => {
  cleanup();
  return store.get(token) || null;
};

module.exports = {
  createStreamJob,
  takeStreamJob,
  peekStreamJob,
  TTL_MS
};
