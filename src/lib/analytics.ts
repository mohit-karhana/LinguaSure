export type MarketingEvent =
  | "landing_view"
  | "cta_click"
  | "login_view"
  | "signup_started";

type Attribution = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  fbclid: string | null;
};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

const VISITOR_KEY = "linguasure_visitor_id";
const ATTRIBUTION_KEY = "linguasure_first_touch";

export function analyticsVisitorId() {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

function captureAttribution(): Attribution {
  const existing = localStorage.getItem(ATTRIBUTION_KEY);
  if (existing) {
    try {
      return JSON.parse(existing) as Attribution;
    } catch {
      localStorage.removeItem(ATTRIBUTION_KEY);
    }
  }
  const params = new URLSearchParams(window.location.search);
  const attribution = {
    source: params.get("utm_source"),
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
    content: params.get("utm_content"),
    term: params.get("utm_term"),
    fbclid: params.get("fbclid"),
  };
  if (Object.values(attribution).some(Boolean)) {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
  }
  return attribution;
}

export function trackMarketingEvent(
  eventName: MarketingEvent,
  metadata: Record<string, string> = {},
) {
  const body = JSON.stringify({
    eventName,
    attribution: captureAttribution(),
    path: `${window.location.pathname}${window.location.search}`,
    metadata,
  });
  void fetch("/api/analytics/event", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Visitor-Id": analyticsVisitorId(),
    },
    body,
    keepalive: true,
  }).catch(() => {});

  if (eventName === "cta_click") window.fbq?.("trackCustom", "LinguaSureCTAClick", metadata);
  if (eventName === "signup_started") window.fbq?.("track", "Lead");
}

export function trackSignupCompleted() {
  window.fbq?.("track", "CompleteRegistration");
}

export function trackAssessmentCompleted() {
  window.fbq?.("trackCustom", "AssessmentCompleted");
}

export function initMetaPixel(pixelId: string) {
  if (!pixelId || window.fbq) return;
  type MetaQueue = ((...args: unknown[]) => void) & {
    callMethod?: (...args: unknown[]) => void;
    queue: unknown[][];
    push: (...args: unknown[]) => void;
    loaded: boolean;
    version: string;
  };
  const fbq: MetaQueue = (...args: unknown[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
}
