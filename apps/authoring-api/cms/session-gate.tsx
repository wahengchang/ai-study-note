import { useEffect, useRef, useState } from "react";

import { openAuthoringSession } from "./authoring-session.js";
import type { AuthoringSession } from "./authoring-session.js";

type GateState = "loading" | "unlocked" | "locked";

export function SessionGate({ ticket, children }: Readonly<{ ticket: string | undefined; children: (session: AuthoringSession) => React.JSX.Element }>): React.JSX.Element {
  const [state, setState] = useState<GateState>(ticket === undefined ? "locked" : "loading");
  const [session, setSession] = useState<AuthoringSession>();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state !== "locked") return;
    heading.current?.focus();
  }, [state]);

  useEffect(() => {
    if (ticket === undefined) return;
    let active = true;
    let openedSession: AuthoringSession | undefined;
    void openAuthoringSession(ticket, () => {
      if (active) {
        setSession(undefined);
        setState("locked");
      }
    }).then((opened) => {
      openedSession = opened;
      if (active) {
        setSession(opened);
        setState("unlocked");
      } else opened.lock();
    }).catch(() => {
      if (active) {
        setSession(undefined);
        setState("locked");
      }
    });
    return () => {
      active = false;
      openedSession?.lock();
    };
  }, [ticket]);

  if (state === "loading") return <main aria-busy="true"><h1>正在建立 CMS session</h1></main>;
  if (state === "locked" || session === undefined) return <main><h1 ref={heading} tabIndex={-1}>CMS 工作台已鎖定</h1><p>請由 cms:open 建立新的瀏覽器 session。</p></main>;
  return children(session);
}
