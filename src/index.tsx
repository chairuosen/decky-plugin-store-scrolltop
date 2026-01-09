import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses
} from "@decky/ui";
import {
  addEventListener,
  removeEventListener,
  callable,
  definePlugin,
  toaster,
  // routerHook
} from "@decky/api"
import { useState } from "react";
import { FaShip } from "react-icons/fa";

// import logo from "../assets/logo.png";

// This function calls the python function "add", which takes in two numbers and returns their sum (as a number)
// Note the type annotations:
//  the first one: [first: number, second: number] is for the arguments
//  the second one: number is for the return value
const add = callable<[first: number, second: number], number>("add");

// This function calls the python function "start_timer", which takes in no arguments and returns nothing.
// It starts a (python) timer which eventually emits the event 'timer_event'
const startTimer = callable<[], void>("start_timer");

function Content() {
  const [result, setResult] = useState<number | undefined>();

  const onClick = async () => {
    const result = await add(Math.random(), Math.random());
    setResult(result);
  };

  return (
    <PanelSection title="Panel Section">
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={onClick}
        >
          {result ?? "Add two numbers via Python"}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={() => startTimer()}
        >
          {"Start Python timer"}
        </ButtonItem>
      </PanelSectionRow>

      {/* <PanelSectionRow>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <img src={logo} />
        </div>
      </PanelSectionRow> */}

      {/*<PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={() => {
            Navigation.Navigate("/decky-plugin-test");
            Navigation.CloseSideMenus();
          }}
        >
          Router
        </ButtonItem>
      </PanelSectionRow>*/}
    </PanelSection>
  );
};

export default definePlugin(() => {
  console.log("Template plugin initializing, this is called once on frontend startup")

  // serverApi.routerHook.addRoute("/decky-plugin-test", DeckyPluginRouterTest, {
  //   exact: true,
  // });

  type ScrollRecord = { y: number; ts: number; anchorHref?: string };

  const storagePrefix = "store-scroll:";
  const now = () => Date.now();
  const ttlMs = 30 * 60 * 1000;
  const cap = 50;

  const locKey = (loc: Location) => `${loc.pathname}${loc.search}`;
  const storageKey = (key: string) => `${storagePrefix}${key}`;

  const readRecord = (key: string): ScrollRecord | undefined => {
    try {
      const raw = sessionStorage.getItem(storageKey(key));
      if (!raw) return undefined;
      const data = JSON.parse(raw) as ScrollRecord;
      if (typeof data.y !== "number" || typeof data.ts !== "number") return undefined;
      if (now() - data.ts > ttlMs) return undefined;
      return data;
    } catch {
      return undefined;
    }
  };

  const writeRecord = (key: string, rec: ScrollRecord) => {
    try {
      sessionStorage.setItem(storageKey(key), JSON.stringify(rec));
      const keys = Object.keys(sessionStorage).filter(k => k.startsWith(storagePrefix));
      if (keys.length > cap) {
        const items: { k: string; ts: number }[] = keys.map(k => {
          try { const v = JSON.parse(sessionStorage.getItem(k) || "{}"); return { k, ts: v.ts || 0 }; } catch { return { k, ts: 0 }; }
        });
        items.sort((a, b) => a.ts - b.ts);
        for (let i = 0; i < items.length - cap; i++) sessionStorage.removeItem(items[i].k);
      }
    } catch {}
  };

  const getScrollY = () => {
    const el = document.scrollingElement as HTMLElement | null;
    if (el) return el.scrollTop;
    return window.scrollY;
  };

  const scrollToY = (y: number) => {
    window.scrollTo(0, Math.max(0, y));
  };

  const findNearestAnchorHref = (): string | undefined => {
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]'));
    if (anchors.length === 0) return undefined;
    const center = window.scrollY + window.innerHeight / 2;
    let best: { href: string; d: number } | undefined;
    for (const a of anchors) {
      const rect = a.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const d = Math.abs(top - center);
      const href = a.getAttribute("href") || "";
      if (!href) continue;
      if (!best || d < best.d) best = { href, d };
    }
    return best?.href;
  };

  const storeCurrentScroll = () => {
    const key = locKey(window.location);
    const y = getScrollY();
    const anchorHref = findNearestAnchorHref();
    writeRecord(key, { y, ts: now(), anchorHref });
  };

  let restoreObserver: MutationObserver | null = null;
  let restoreScheduled = false;

  const tryRestoreOnce = (rec: ScrollRecord): boolean => {
    const docH = document.scrollingElement ? (document.scrollingElement as HTMLElement).scrollHeight : document.body.scrollHeight;
    if (docH > window.innerHeight && rec.y <= docH - window.innerHeight + 100) {
      scrollToY(rec.y);
      return true;
    }
    if (rec.anchorHref) {
      const target = document.querySelector<HTMLAnchorElement>(`a[href='${rec.anchorHref}']`) || document.querySelector<HTMLAnchorElement>(`a[href*='${rec.anchorHref}']`);
      if (target) {
        const rect = target.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        scrollToY(top);
        return true;
      }
    }
    return false;
  };

  const scheduleRestore = (rec: ScrollRecord) => {
    if (restoreScheduled) return;
    restoreScheduled = true;
    let attempts = 0;
    const maxAttempts = 50;
    const rafLoop = () => {
      attempts++;
      if (tryRestoreOnce(rec) || attempts >= maxAttempts) {
        restoreScheduled = false;
        if (restoreObserver) { restoreObserver.disconnect(); restoreObserver = null; }
        return;
      }
      requestAnimationFrame(rafLoop);
    };
    restoreObserver = new MutationObserver(() => { tryRestoreOnce(rec); });
    restoreObserver.observe(document.body, { childList: true, subtree: true });
    requestAnimationFrame(rafLoop);
  };

  const onPopState = () => {
    const key = locKey(window.location);
    const rec = readRecord(key);
    if (rec) scheduleRestore(rec);
  };

  const origPushState = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);

  const wrapNav = <K extends "pushState" | "replaceState">(orig: typeof history[K]) => {
    return function(this: History, state: any, title: string, url?: string | URL | null) {
      try { storeCurrentScroll(); } catch {}
      const r = (orig as any).apply(this, [state, title, url]);
      return r;
    } as typeof history[K];
  };

  history.pushState = wrapNav(origPushState);
  history.replaceState = wrapNav(origReplaceState);
  window.addEventListener("popstate", onPopState);

  // Add an event listener to the "timer_event" event from the backend
  const listener = addEventListener<[
    test1: string,
    test2: boolean,
    test3: number
  ]>("timer_event", (test1, test2, test3) => {
    console.log("Template got timer_event with:", test1, test2, test3)
    toaster.toast({
      title: "template got timer_event",
      body: `${test1}, ${test2}, ${test3}`
    });
  });

  return {
    // The name shown in various decky menus
    name: "Test Plugin",
    // The element displayed at the top of your plugin's menu
    titleView: <div className={staticClasses.Title}>Decky Example Plugin</div>,
    // The content of your plugin's menu
    content: <Content />,
    // The icon displayed in the plugin list
    icon: <FaShip />,
    // The function triggered when your plugin unloads
    onDismount() {
      console.log("Unloading")
      try { history.pushState = origPushState; } catch {}
      try { history.replaceState = origReplaceState; } catch {}
      try { window.removeEventListener("popstate", onPopState); } catch {}
      try { if (restoreObserver) { restoreObserver.disconnect(); restoreObserver = null; } } catch {}
      removeEventListener("timer_event", listener);
      // serverApi.routerHook.removeRoute("/decky-plugin-test");
    },
  };
});
