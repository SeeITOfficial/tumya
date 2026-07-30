const multer = require("multer");
const sharp = require("sharp");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

/** MIME types accepted for upload. */
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Maximum allowed file size: 10 MB. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Multer instance configured with memory storage, a 10 MB size limit,
 * and MIME-type filtering for JPEG, PNG, and WebP only.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed types: jpeg, png, webp`));
    }
    cb(null, true);
  },
});

/**
 * Converts an uploaded file buffer to WebP, resizes it to fit within
 * 1000×1000 px, writes it to disk, and returns the public URL path.
 *
 * @param {Express.Multer.File} file   - Multer file object; must have a buffer.
 * @param {string}              folder - Subfolder inside public/uploads (default: "catalog").
 * @returns {Promise<string>} Public path e.g. /uploads/catalog/<uuid>.webp
 */
async function saveImage(file, folder = "catalog") {

  if (!file || !file.buffer) {
    throw new Error("Invalid file: buffer is missing");
  }

  const uploadDir = path.join(
    __dirname,
    "..",
    "public",
    "uploads",
    folder
  );

  fs.mkdirSync(uploadDir, { recursive: true });

  const filename = `${randomUUID()}.webp`;

  const filepath = path.join(uploadDir, filename);

  try {
    await sharp(file.buffer)
      .resize({
        width: 1000,
        height: 1000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(filepath);
  } catch (err) {
    throw new Error(`Image processing failed: ${err.message}`);
  }

  return `/uploads/${folder}/${filename}`;
}

module.exports = {
  upload,
  saveImage,
};