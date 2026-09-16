CREATE TABLE current_media_assets (
  asset_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  alt_text TEXT,
  caption TEXT NOT NULL,
  description TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  checksum TEXT NOT NULL,
  image_width INTEGER,
  image_height INTEGER,
  thumbnail_digest TEXT,
  thumbnail_byte_length INTEGER,
  thumbnail_width INTEGER,
  thumbnail_height INTEGER,
  uploaded_at TEXT NOT NULL,
  CHECK (length(asset_id) > 0),
  CHECK (length(slug) > 0),
  CHECK (length(original_filename) > 0),
  CHECK (length(mime_type) > 0),
  CHECK ((image_width IS NULL) = (image_height IS NULL)),
  CHECK (image_width IS NULL OR image_width > 0),
  CHECK (image_height IS NULL OR image_height > 0),
  CHECK ((thumbnail_digest IS NULL) = (thumbnail_byte_length IS NULL)),
  CHECK ((thumbnail_digest IS NULL) = (thumbnail_width IS NULL)),
  CHECK ((thumbnail_digest IS NULL) = (thumbnail_height IS NULL)),
  CHECK (thumbnail_byte_length IS NULL OR thumbnail_byte_length >= 0),
  CHECK (thumbnail_width IS NULL OR thumbnail_width > 0),
  CHECK (thumbnail_height IS NULL OR thumbnail_height > 0),
  -- 縮圖只可能來自已解析的 raster 尺寸，沒有 image 的 thumbnail 是自我矛盾的 record。
  CHECK (thumbnail_digest IS NULL OR image_width IS NOT NULL)
) STRICT;

CREATE TABLE current_media_references (
  asset_id TEXT NOT NULL,
  entry_id TEXT NOT NULL CHECK (length(entry_id) > 0),
  entry_status TEXT NOT NULL CHECK (entry_status IN ('draft', 'published')),
  PRIMARY KEY (asset_id, entry_id),
  FOREIGN KEY (asset_id) REFERENCES current_media_assets (asset_id)
) STRICT;

-- entry-side 整批覆寫以 entry_id 為主鍵路徑，asset-side usage 讀取則由 PRIMARY KEY 前綴涵蓋。
CREATE INDEX current_media_references_entry ON current_media_references (entry_id, asset_id);
