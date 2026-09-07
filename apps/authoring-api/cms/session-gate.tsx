import { useEffect, useRef, useState } from "react";

import { openAuthoringSession } from "./authoring-session.js";
import type { AuthoringSession } from "./authoring-session.js";

type GateState = "loading" | "unlocked" | "locked";

export function SessionGate({ ticket }: Readonly<{ ticket: string | undefined }>): React.JSX.Element {
  const [state, setState] = useState<GateState>(ticket === undefined ? "locked" : "loading");
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state !== "locked") return;
    heading.current?.focus();
  }, [state]);

  useEffect(() => {
    if (ticket === undefined) return;
    let active = true;
    let session: AuthoringSession | undefined;
    void openAuthoringSession(ticket, () => {
      if (active) setState("locked");
    }).then((opened) => {
      session = opened;
      if (active) setState("unlocked"); else opened.lock();
    }).catch(() => {
      if (active) setState("locked");
    });
    return () => {
      active = false;
      session?.lock();
    };
  }, [ticket]);

  if (state === "loading") return <main aria-busy="true"><h1>正在建立 CMS session</h1></main>;
  if (state === "locked") return <main><h1 ref={heading} tabIndex={-1}>CMS 工作台已鎖定</h1><p>請由 cms:open 建立新的瀏覽器 session。</p></main>;
  return <main><h1>CMS 工作台</h1><p>Browser session 已建立。</p></main>;
}
