import { randomUUID } from "crypto";
import path from "path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const ALLOWED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".zip",
  ".mp4",
  ".mov",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".docx",
  ".pptx",
  ".xlsx",
];

export const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

export const MAX_DIGITAL_FILE_SIZE_BYTES = Number(process.env.MAX_DIGITAL_FILE_SIZE_MB || 250) * 1024 * 1024;
export const MAX_THUMBNAIL_SIZE_BYTES = Number(process.env.MAX_THUMBNAIL_SIZE_MB || 12) * 1024 * 1024;

type UploadKind = "digital" | "thumbnail";

function storageConfig() {
  const bucket = process.env.UPLOAD_BUCKET || process.env.R2_BUCKET || process.env.S3_BUCKET;
  const endpoint = process.env.UPLOAD_ENDPOINT || process.env.R2_ENDPOINT || process.env.S3_ENDPOINT;
  const region = process.env.UPLOAD_REGION || process.env.R2_REGION || process.env.AWS_REGION || "auto";
  const accessKeyId = process.env.UPLOAD_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.UPLOAD_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const publicBaseUrl = process.env.UPLOAD_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL;

  return { bucket, endpoint, region, accessKeyId, secretAccessKey, publicBaseUrl };
}

export function isStorageConfigured() {
  const config = storageConfig();
  return !!(config.bucket && config.accessKeyId && config.secretAccessKey);
}

function createClient() {
  const config = storageConfig();
  if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) {
    throw new Error("Upload storage is not configured");
  }

  return {
    bucket: config.bucket,
    publicBaseUrl: config.publicBaseUrl,
    client: new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: !!config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
}

function normalizeName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function validateUploadFile(file: Express.Multer.File, kind: UploadKind) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = kind === "thumbnail" ? ALLOWED_IMAGE_EXTENSIONS : ALLOWED_UPLOAD_EXTENSIONS;
  const maxSize = kind === "thumbnail" ? MAX_THUMBNAIL_SIZE_BYTES : MAX_DIGITAL_FILE_SIZE_BYTES;

  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext || "unknown"}`);
  }

  if (file.size > maxSize) {
    throw new Error(`File is too large. Max size is ${Math.round(maxSize / 1024 / 1024)}MB.`);
  }
}

export async function uploadObject(file: Express.Multer.File, kind: UploadKind) {
  validateUploadFile(file, kind);

  const { client, bucket, publicBaseUrl } = createClient();
  const ext = path.extname(file.originalname).toLowerCase();
  const safeName = normalizeName(path.basename(file.originalname, ext)) || "upload";
  const key = `${kind}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || "application/octet-stream",
    Metadata: {
      originalName: file.originalname,
      kind,
    },
  }));

  return {
    key,
    url: publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, "")}/${key}` : "",
    fileName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
  };
}

export async function getProtectedDownloadUrl(key: string) {
  const { client, bucket, publicBaseUrl } = createClient();
  if (publicBaseUrl && process.env.UPLOAD_PUBLIC_DOWNLOADS === "true") {
    return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: Number(process.env.DOWNLOAD_URL_TTL_SECONDS || 900),
  });
}
