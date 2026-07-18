PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE catalog_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  unit         TEXT NOT NULL,             -- "kg", "bunch", "piece"
  price        REAL NOT NULL,
  stock_status TEXT NOT NULL CHECK (stock_status IN ('in_stock','out_of_stock','coming_soon')) DEFAULT 'in_stock',
  photo_url    TEXT,
  photo_url_2  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO catalog_items VALUES(1,'Matooke','7',500.0,'out_of_stock','/uploads/catalog/59d592e3-f2de-4197-833f-d160b696f5e9.webp','/uploads/catalog/9a7bee48-7696-4e27-8c0a-0e62c6d31df2.webp','2026-07-16 12:22:32');
INSERT INTO catalog_items VALUES(2,'G.Nuts','250g',250.0,'in_stock','/uploads/catalog/9859e13e-b7b6-4b3b-8e6f-7d2457fe6190.webp','/uploads/catalog/64707f00-1a85-479b-936e-361de5407508.webp','2026-07-16 12:28:15');
INSERT INTO catalog_items VALUES(3,'Mukene','250g',250.0,'out_of_stock','/uploads/catalog/3cf4b02a-9cd7-42c3-96bb-425ab2626e15.webp','/uploads/catalog/1c7b6f89-8acc-4931-9f27-789409117be7.webp','2026-07-16 13:00:48');
INSERT INTO catalog_items VALUES(4,'Kipooli','500g',500.0,'out_of_stock','/uploads/catalog/3ce02cef-726a-4c64-8126-f8c44b7a0c9f.webp','/uploads/catalog/78cee8da-8655-4412-970b-5917d6faa481.webp','2026-07-16 13:34:34');
INSERT INTO catalog_items VALUES(5,'Royco Beef','200g',400.0,'in_stock','/uploads/catalog/e4d20efc-0136-433a-ae33-3bcaf9a7709d.webp','/uploads/catalog/eb9ab2d9-cd14-466a-baf0-8e12c2abbd2f.webp','2026-07-16 13:37:20');
INSERT INTO catalog_items VALUES(6,'Royco Beef','500g',700.0,'out_of_stock','/uploads/catalog/fa2fa87c-37d4-49ce-99be-e2bc029b662f.webp','/uploads/catalog/0945da46-c68c-4f32-aa24-0459c2ac2e62.webp','2026-07-16 13:38:13');
INSERT INTO catalog_items VALUES(7,'Royco  Chicken','200g',400.0,'in_stock','/uploads/catalog/b732f8df-5adc-4284-9e76-419126109d44.webp','/uploads/catalog/71058dc0-b6ba-45e5-acca-72a663559cfb.webp','2026-07-16 13:39:32');
INSERT INTO catalog_items VALUES(8,'Royco  Chicken','500g',700.0,'in_stock','/uploads/catalog/2942d84a-2315-42a4-92af-e38239b442f8.webp','/uploads/catalog/7ef3fbe8-7cc7-4941-bf11-6893c42267a8.webp','2026-07-16 13:39:54');
INSERT INTO catalog_items VALUES(9,'Ebumba','1',100.0,'out_of_stock','/uploads/catalog/7fb37373-13d5-4bdb-9f1e-66b745550e99.webp','/uploads/catalog/f55851c5-57d5-4094-88df-be32b05e749d.webp','2026-07-16 13:43:10');
INSERT INTO catalog_items VALUES(10,'Katunkuma','1',150.0,'out_of_stock','/uploads/catalog/dad504d7-6b48-423e-bd26-4cbd634bbf6d.webp','/uploads/catalog/6959c2c0-6afc-49ec-be0f-fac09fef56f4.webp','2026-07-16 13:46:57');
INSERT INTO catalog_items VALUES(11,'Avocado','1',700.0,'out_of_stock','/uploads/catalog/3f1a9916-4b55-4c7a-837e-d80cec6aaaed.webp','/uploads/catalog/2e7d58b7-2686-41d0-acd5-f342dab0d7f4.webp','2026-07-16 13:49:35');
INSERT INTO catalog_items VALUES(12,'Muwogo','1',200.0,'out_of_stock','/uploads/catalog/33f29481-6101-4391-a03b-377dd0a353aa.webp','/uploads/catalog/3c2ad426-3f5f-4ec3-85c9-55fab00cdd10.webp','2026-07-16 13:52:01');
INSERT INTO catalog_items VALUES(13,'Muzigo','1',150.0,'coming_soon','/uploads/catalog/730ef954-2873-4401-840f-03dd2f6476a4.webp','/uploads/catalog/5ad5f8ad-ef7a-4344-b7c4-9949e5a75e28.webp','2026-07-16 13:57:38');
INSERT INTO catalog_items VALUES(14,'Empuuta (Nile Perch)','1',1500.0,'out_of_stock','/uploads/catalog/c0df5ac3-f5f2-449d-bb5e-5846d0d00881.webp','/uploads/catalog/06bfbfe1-718a-44d7-a3e7-5b2dede2df51.webp','2026-07-16 14:02:28');
INSERT INTO catalog_items VALUES(15,'Engege (Tilapia)','1',1000.0,'out_of_stock','/uploads/catalog/9c7c788b-d994-4aa0-b412-cbfe1a2e181a.webp','/uploads/catalog/3a977d19-6184-4918-abda-00b1c5a27132.webp','2026-07-16 14:03:16');
INSERT INTO catalog_items VALUES(16,'Maize Flour','1kg',200.0,'coming_soon','/uploads/catalog/0ed92bde-cc5d-4d0f-8b06-8101f663da39.webp',NULL,'2026-07-16 14:08:30');
INSERT INTO catalog_items VALUES(17,'Empombo','1',50.0,'out_of_stock','/uploads/catalog/0b00c260-3504-458e-b4a3-342e04fd0bf7.webp','/uploads/catalog/aabb8e34-5a56-4c05-ad9e-1d0ff055b94b.webp','2026-07-16 14:10:50');
INSERT INTO catalog_items VALUES(18,'Blueband','250g',300.0,'in_stock','/uploads/catalog/a7282c81-f9c3-4e16-9a85-6eaf435deb39.webp',NULL,'2026-07-16 14:14:31');
COMMIT;
