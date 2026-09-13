const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function microphoneReady(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

export function microphoneHint(): string | null {
  if (microphoneReady()) return null;

  const { hostname, origin } = window.location;
  if (hostname === "0.0.0.0" || hostname === "[::]" || hostname === "::") {
    return "Open http://localhost:3000. The microphone does not work on 0.0.0.0.";
  }
  if (!window.isSecureContext || !LOCAL_HOSTS.has(hostname)) {
    return `This page is not a secure context (${origin}). Use http://localhost:3000 in Chrome or Safari, or serve the app over HTTPS.`;
  }
  return "This window cannot use the microphone. Open http://localhost:3000 in Chrome, Edge, or Safari — not an in-app preview.";
}

export async function getMicrophoneStream(): Promise<MediaStream> {
  const hint = microphoneHint();
  if (hint || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(hint ?? "Could not access the microphone.");
  }

  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new Error("Microphone permission was blocked. Allow it in the browser address bar, then try again.");
    }
    if (error instanceof DOMException && error.name === "NotFoundError") {
      throw new Error("No microphone was found.");
    }
    throw error instanceof Error ? error : new Error("Could not access the microphone.");
  }
}

export function redirectInsecureLoopback(): boolean {
  const { hostname, protocol, port, pathname, search, hash } = window.location;
  if (hostname !== "0.0.0.0" && hostname !== "[::]" && hostname !== "::") {
    return false;
  }

  const next = new URL(window.location.href);
  next.hostname = "127.0.0.1";
  next.protocol = protocol;
  next.port = port;
  next.pathname = pathname;
  next.search = search;
  next.hash = hash;
  window.location.replace(next.toString());
  return true;
}
