import type { DataMediaFailureCode } from "./contracts.js";

/**
 * 單一 failure message 來源：v1 asset-version lifecycle 與 v2 current media library 共用同一個 owner
 * 與同一組 code，訊息若分成兩份必然漂移。
 */
export const mediaFailureMessages: Readonly<Record<DataMediaFailureCode, string>> = {
  INVALID_MEDIA_INPUT: "請提供有效的 media import 輸入。",
  MEDIA_ROOT_FAILURE: "Media storage root 無法安全使用。",
  MEDIA_IMPORT_CONFLICT: "Media import identity 與既有紀錄衝突。",
  MEDIA_STAGING_FAILURE: "Media bytes 尚未完成 staging。",
  MEDIA_PENDING_COMMIT_FAILURE: "Media import intent 尚未提交為 pending。",
  MEDIA_PROMOTION_FAILURE: "Media object 尚未完成 promotion。",
  MEDIA_FINAL_VERIFICATION_FAILURE: "Host 最終 media object 驗證失敗。",
  MEDIA_READY_COMMIT_FAILURE: "Media asset version 尚未提交為 ready。",
  MEDIA_VERSION_UNAVAILABLE: "指定的 media asset version 尚不可用。",
  MEDIA_ASSET_NOT_FOUND: "找不到指定的 media asset。",
  MEDIA_ARCHIVE_BLOCKED_PUBLISHED: "仍被已發布內容引用，無法封存此媒體版本。",
  MEDIA_ARCHIVE_FAILURE: "Media asset version 尚未完成封存。",
  MEDIA_READ_STATE_STALE: "Media 讀取期間狀態已變更，請重試。",
  MEDIA_READ_FAILED: "Media 讀取無法驗證，請修復儲存狀態後重試。",
  MEDIA_RESTORE_REQUIRED: "請提供符合既有 evidence 的本機 recovery bytes 與 metadata。",
  MEDIA_RESTORE_MISMATCH: "Recovery bytes 或 metadata 與既有 asset version 不一致。",
  MEDIA_RESTORE_FAILURE: "Media asset version 尚未完成復原。",
  MEDIA_RECONCILIATION_FAILURE: "DataMedia 啟動收斂失敗；請保留現有 evidence，修復列出的媒體或匯入狀態後重試。",
  INVALID_MEDIA_LIBRARY_INPUT: "請提供有效的 media metadata 或 command 輸入。",
  MEDIA_SIZE_LIMIT_EXCEEDED: "檔案超過 400 MiB 上限，或 metadata envelope 超過 64 KiB。",
  MEDIA_UNSUPPORTED_TYPE: "此檔案類型不在媒體庫允許的清單內。",
  MEDIA_TYPE_MISMATCH: "檔案內容與副檔名不一致。",
  MEDIA_THUMBNAIL_FAILURE: "無法為此影像產生安全的預覽縮圖。",
  MEDIA_LIBRARY_FAILURE: "Media library 操作未完成。",
  MEDIA_ASSET_STATE_CONFLICT: "Media asset 已被其他操作更新，請重新載入後再試。",
  MEDIA_ASSET_REFERENCED: "仍有 entry 引用此 media asset，無法取代或刪除。",
};
