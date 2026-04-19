export function requireEnv(scope, env, keys) {
  for (const key of keys) {
    if (!env[key]) {
      throw new Error(`[${scope}] Missing required env var: ${key}`);
    }
  }
}

export function firebasePrivateKey(rawKey) {
  return rawKey?.replace(/\\n/g, "\n");
}

export function getAdminApp(admin, env, scope, { storageBucketEnvVar } = {}) {
  try {
    return admin.app();
  } catch {
    const options = {
      credential: admin.credential.cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: firebasePrivateKey(env.FIREBASE_ADMIN_PRIVATE_KEY),
      }),
    };

    if (storageBucketEnvVar) {
      options.storageBucket = env[storageBucketEnvVar];
    }

    try {
      return admin.initializeApp(options);
    } catch (err) {
      throw new Error(`[${scope}] Failed to initialize Firebase Admin: ${err.message}`);
    }
  }
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function respondWithError(res, err, fallbackStatus = 500) {
  return res.status(err.status || fallbackStatus).json({ error: err.message });
}

export function respondWithInternalError(res, scope, err, extra = {}) {
  console.error(`[${scope}] Error:`, err);
  return res.status(500).json({ error: "Internal server error", ...extra });
}

export function escapeDriveQueryValue(value) {
  return String(value).replace(/'/g, "\\'");
}

export function isValidStorageUrl(url, allowedBucket) {
  if (!allowedBucket) return false;
  try {
    const { hostname, pathname } = new URL(url);
    return hostname === "firebasestorage.googleapis.com" && pathname.includes(allowedBucket);
  } catch {
    return false;
  }
}
