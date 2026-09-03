/**
 * Authoring API 的 fixed-origin identity 與 credential 字面格式。
 *
 * credential record 內嵌 `origin` 並由 `parseRecord` 嚴格比對，因此 listener 與
 * credential store 必須共用同一份常數；兩邊各自寫死會讓既有 record 在 origin
 * 漂移時全部變成 `CREDENTIAL_STORE_CORRUPT`。
 */
export const AUTHORING_HOST = "127.0.0.1";
export const AUTHORING_PORT = 43127;
export const AUTHORING_AUTHORITY = `${AUTHORING_HOST}:${AUTHORING_PORT}` as const;
export const AUTHORING_ORIGIN = `http://${AUTHORING_AUTHORITY}` as const;

/** 32-byte CSPRNG 以 unpadded base64url 表示的長度。 */
export const SECRET_TEXT_LENGTH = 43;
/** `asn_v1_<43-char-unpadded-base64url>`。 */
export const API_KEY_PATTERN = /^asn_v1_[A-Za-z0-9_-]{43}$/u;
/** 單獨的 43-char unpadded base64url（lock token、server-proof nonce）。 */
export const SECRET_TEXT_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
/**
 * `/v1/entries/:entryId/revisions` 與 `/v1/entries/:entryId/publish` 的 entryId
 * 字面格式：單一 unreserved path segment。client 與 CLI 共用同一份常數，否則兩邊
 * 各自寫死會讓 CLI 接受、client 拒絕（或反之）的 entryId 產生無法解釋的
 * `INVALID_CLIENT_REQUEST`。
 */
export const ENTRY_ID_PATTERN = /^[A-Za-z0-9._~-]+$/u;
/** diagnostic 輸出前用來遮蔽 credential 與 browser ticket 的 canary pattern。 */
export const REDACTION_PATTERN = /asn_(?:v1|bt_v1)_[A-Za-z0-9_-]+/gu;
export const REDACTION_PLACEHOLDER = "[REDACTED]";

/** 移除任何 `asn_v1_`／`asn_bt_v1_` 形狀的字串。 */
export function redactSecrets(value: string): string {
  return value.replace(REDACTION_PATTERN, REDACTION_PLACEHOLDER);
}
