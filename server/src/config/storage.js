const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const isConfigured = () =>
  !!(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);

let client;
function s3() {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined, // e.g. https://<acct>.r2.cloudflarestorage.com
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

// Keys are namespaced org/project so a key can be checked against the tenant before use.
function buildKey(orgId, projectId, fileName) {
  const safe = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  return `${orgId}/${projectId}/${crypto.randomUUID()}-${safe}`;
}

async function presignUpload(key, contentType) {
  const cmd = new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(s3(), cmd, { expiresIn: 600 });
}

async function presignDownload(key) {
  const cmd = new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key });
  return getSignedUrl(s3(), cmd, { expiresIn: 300 });
}

module.exports = { isConfigured, buildKey, presignUpload, presignDownload, MAX_UPLOAD_BYTES };
