import { useEffect, useRef, useState } from "react";

type WakeLockHandle = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockHandle>;
  };
};

export function useScreenWakeLock(enabled: boolean) {
  const lockRef = useRef<WakeLockHandle | null>(null);
  const [active, setActive] = useState(false);
  const supported = Boolean((navigator as WakeLockNavigator).wakeLock?.request);

  useEffect(() => {
    let cancelled = false;
    const wakeLockApi = (navigator as WakeLockNavigator).wakeLock;

    async function releaseLock() {
      const current = lockRef.current;
      if (!current) return;
      lockRef.current = null;
      setActive(false);
      try {
        await current.release();
      } catch {
        // Already released by the browser.
      }
    }

    if (!enabled || !wakeLockApi?.request) {
      void releaseLock();
      return;
    }

    async function requestLock() {
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await wakeLockApi.request("screen");
        if (cancelled) {
          await lock.release().catch(() => {});
          return;
        }
        lockRef.current = lock;
        setActive(true);
        lock.addEventListener?.("release", () => {
          lockRef.current = null;
          setActive(false);
        });
      } catch {
        setActive(false);
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (!lockRef.current) {
        void requestLock();
      }
    };

    void requestLock();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void releaseLock();
    };
  }, [enabled]);

  return { supported, active };
}
