const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const crypto = require("crypto");

const db = new DatabaseSync(
    path.join(__dirname, "..", "data", "tumya.db")
);

const uploadDir = path.join(
    __dirname,
    "..",
    "public",
    "uploads",
    "catalog"
);

fs.mkdirSync(uploadDir, { recursive: true });

const items = db.prepare(`
    SELECT id, photo_url, photo_url_2
    FROM catalog_items
`).all();

const update = db.prepare(`
    UPDATE catalog_items
    SET photo_url = ?, photo_url_2 = ?
    WHERE id = ?
`);

async function migrateField(value) {
    if (
        !value ||
        !value.startsWith("data:image/")
    ) {
        return value;
    }

    const base64 = value.split(",")[1];

    const filename = `${crypto.randomUUID()}.webp`;

    const output = path.join(uploadDir, filename);

    await sharp(Buffer.from(base64, "base64"))
        .webp({ quality: 85 })
        .toFile(output);

    return `/uploads/catalog/${filename}`;
}

(async () => {

    for (const item of items) {

        const photo1 = await migrateField(item.photo_url);
        const photo2 = await migrateField(item.photo_url_2);

        update.run(
            photo1,
            photo2,
            item.id
        );

        console.log(`✓ ${item.id}`);
    }

    console.log("Migration complete.");

})();
