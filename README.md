# LinguaSure

**Know where you stand. Know what to improve. Practise real situations. Become a better communicator.**

LinguaSure is an AI-powered communication coach for people who already understand English but struggle when they have to speak — in interviews, meetings, and other situations that actually matter.

It is not another English-learning app. It does not compete by being a better chatbot than ChatGPT. The product is a system that **measures** how you communicate, **identifies** specific weaknesses, puts you in **realistic situations**, and **tracks whether you improve**.

## The problem

Many people know grammar and vocabulary, then freeze in real conversations. They hesitate, translate in their head, stall on unexpected questions, and have no way to tell if they are getting better.

Existing products focus on lessons, flashcards, or generic “practise English with AI.” That is not the gap.

The gap is between *I know English* and *I can confidently communicate in English*.

## Who it is for

Working professionals who already understand English and need to perform in:

- Job interviews
- Standups, project updates, and manager conversations
- Client calls and explanations under pressure

It is not built for beginners learning English from zero, school curricula, or IELTS test prep.

## How it works

1. **Assess** — Speak in a real situation. The system scores fluency, grammar, vocabulary, response speed, clarity, and professional communication.
2. **Diagnose** — You get a communication profile and a plain-language weakness: *you explain well, but you stall when the question is unexpected.*
3. **Practise** — Roleplay interviews and workplace scenes. The AI plays the other person and asks follow-ups you did not rehearse.
4. **Debrief** — After every session: scores, evidence, and one thing to work on next.
5. **Repeat** — Retry the same scenario and see whether the score actually moved.

Over time the coach remembers your patterns — filler words, recurring grammar mistakes, where you hesitate, which scenes you fail — instead of starting every conversation from zero.

## What makes this different

| ChatGPT and chat-practice apps | LinguaSure |
| --- | --- |
| “Practise English with me.” | Measure how you communicate. |
| Open-ended conversation | Situations with unexpected follow-ups |
| Subjective “that was good” | Repeatable scores you can retry against |
| No memory of your weaknesses | A persistent communication profile |

The AI model is the technology. The personalised improvement system is the product.

## Scoring

Scores are built in layers, so they stay explainable:

1. **Acoustic / temporal** — speaking speed, pauses, filler words, response latency
2. **Linguistic** — grammar and vocabulary from the transcript, always with examples
3. **Communicative** — clarity, handling of unexpected questions, professional tone

The live profile stays small (about six metrics). Pronunciation is treated carefully and is not mixed into the overall score until it is reliable.

## Product direction

The first wedge is **interview and workplace communication**, not a catalog of daily-life scenes.

| Phase | Focus |
| --- | --- |
| Validate | Prove people will pay for measurement, not another chat partner |
| The Loop | Scenario → speak → score → retry → see a delta |
| The Coach | Persistent profile, progress over time, memory of mistakes |
| The Journey | Personalised drills and calibrated communicative scores |
| The Platform | Broader tracks (presentations, negotiation) and teams |

Status: live-talk MVP. You can start a realtime voice session with a coach. Scoring, profiles, and retry deltas are not built yet.

## Positioning

> ChatGPT lets you practise English. LinguaSure tells you where you stand, what to fix, puts you in the situation that matters, and proves you got better.

## Run the live-talk MVP

The first implementation is a browser voice session on the [OpenAI Realtime API](https://developers.openai.com/api/docs/guides/realtime). Your API key stays on a local server. The browser receives a short-lived ephemeral token, then talks over WebRTC.

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. Install and start both servers:

```bash
npm install
npm run dev
```

3. Open [http://localhost:5173](http://localhost:5173), allow the microphone, and select **Start talking**.

The coach greets you and stays in a live conversation. You can interrupt, mute, or end the session. A rolling transcript appears under the controls.

## Go live

Browsers only allow the microphone on **localhost** or **HTTPS**. Putting the container on a raw `http://` IP will load the page, but **Start talking** will fail.

### Docker

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) in Chrome or Safari. Do not use `http://0.0.0.0:3000` or an in-app preview — those pages cannot access the microphone. Compose reads `OPENAI_API_KEY` from `.env` and overrides `PORT` to `3000` inside the container.

Without Compose:

```bash
docker build -t linguasure .
docker run --rm -p 3000:3000 --env-file .env -e HOST=0.0.0.0 -e PORT=3000 linguasure
```

### Production host

Ship the same image to a host that terminates TLS for you:

1. Set `OPENAI_API_KEY` as a secret, not in the image.
2. Set `PUBLIC_ORIGIN` to your public URL, for example `https://app.example.com`.
3. Let the platform inject `PORT`. The container already listens on `0.0.0.0`.

| Host | What to do |
| --- | --- |
| [Railway](https://railway.app) | New service → Deploy from Dockerfile. Add the API key and `PUBLIC_ORIGIN`. |
| [Render](https://render.com) | New Web Service → Docker. Same env vars. |
| [Fly.io](https://fly.io) | `fly launch` in this repo, then `fly secrets set OPENAI_API_KEY=... PUBLIC_ORIGIN=https://<app>.fly.dev`. |
| VPS | Run Compose behind [Caddy](https://caddyserver.com) or nginx and point a domain at it. |

Without Docker, build once and serve the UI from the same Node process:

```bash
npm run build
HOST=0.0.0.0 PORT=3000 NODE_ENV=production npm start
```

## License

Proprietary. All rights reserved.
