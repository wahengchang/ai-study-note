
export { openAuthoringSession } from "./session.js";

void import("./workspace.js").then(({ startCms }) => startCms()).catch(() => undefined);
