const multer = require("multer");
const sharp = require("sharp");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const upload = multer({
  storage: multer.memoryStorage(),
});

async function saveImage(file, folder = "catalog") {

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

  await sharp(file.buffer)
    .resize({
      width: 1000,
      height: 1000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toFile(filepath);

  return `/uploads/${folder}/${filename}`;
}

module.exports = {
  upload,
  saveImage,
};