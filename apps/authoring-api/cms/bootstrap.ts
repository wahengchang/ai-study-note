const rawFragment = location.hash;
history.replaceState(null, "", location.pathname);

const ticket = /^#(asn_bt_v1_[A-Za-z0-9_-]{43})$/u.exec(rawFragment)?.[1];
void import("./main.js").then(({ startCms }) => startCms(ticket)).catch(() => undefined);
