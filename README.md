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

Status: signed-in practice loop. Google login, situation chapters, live talk, saved scores, and a communication profile are in. Personalised drills over time are not.

## Positioning

> ChatGPT lets you practise English. LinguaSure tells you where you stand, what to fix, puts you in the situation that matters, and proves you got better.

## Run the live-talk MVP

The first implementation is a browser voice session on the [OpenAI Realtime API](https://developers.openai.com/api/docs/guides/realtime). Your API key stays on a local server. The browser receives a short-lived ephemeral token, then talks over WebRTC.

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`, `SESSION_SECRET`, and `GOOGLE_CLIENT_ID`.
2. In Google Cloud, create a Web OAuth client. Add `http://localhost:5173` and `http://localhost:3000` (and `http://127.0.0.1` on those ports) as authorised JavaScript origins.
3. Install and start both servers:

```bash
npm install
npm run dev
```

4. Open [http://localhost:5173](http://localhost:5173) in Chrome or Safari, sign in with Google, pick a situation, and talk. End the session to save the scorecard.

Users, transcripts, and scores are stored in local SQLite at `data/linguasure.sqlite`.

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

1. Set `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, and `SESSION_SECRET` as secrets, not in the image.
2. Add your public HTTPS origin to the Google OAuth client.
3. Set `PUBLIC_ORIGIN` and `COOKIE_SECURE=1`.
4. Let the platform inject `PORT`. The container already listens on `0.0.0.0`.

| Host | What to do |
| --- | --- |
| [Railway](https://railway.app) | New service → Deploy from Dockerfile. Add the API key and `PUBLIC_ORIGIN`. |
| [Render](https://render.com) | New Web Service → Docker. Same env vars. |
| [Fly.io](https://fly.io) | `fly launch` in this repo, then `fly secrets set OPENAI_API_KEY=... PUBLIC_ORIGIN=https://<app>.fly.dev`. |
| VPS / EC2 | Clone this repo and run Compose. Use Caddy (below) if you have a domain. |

### AWS EC2 (Linux)

On the instance security group, allow **22**, **80**, and **443**. Also allow **3000** only if you are testing without a domain.

SSH in, then install Docker.

**Ubuntu**

```bash
sudo apt-get update
sudo apt-get install -y git docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

**Amazon Linux 2023**

```bash
sudo dnf install -y git docker
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

Log out and back in so the `docker` group applies. Then fetch the repo and start it:

```bash
git clone https://github.com/mohit-karhana/LinguaSure.git
cd LinguaSure
cp .env.example .env
nano .env
```

Set at least `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, and a long random `SESSION_SECRET`. If the repo is private, clone with SSH or a personal access token.

**Without a domain (smoke test only)**

```bash
docker compose -f docker-compose.yml -f docker-compose.ec2.yml up -d --build
```

In the AWS console, open the instance → **Security** → security group → **Edit inbound rules**. Add:

| Type | Port | Source |
| --- | --- | --- |
| HTTP | 80 | `0.0.0.0/0` |
| Custom TCP | 3000 | `0.0.0.0/0` |

Use the instance **Public IPv4 address** from the console (not the words `YOUR_EC2_IP`). Open `http://13.x.x.x` — port 80, no `:3000` required.

On the instance, confirm the app is actually up:

```bash
docker compose ps
curl -sS http://127.0.0.1:3000/api/health
curl -sS ifconfig.me
```

The first curl should print `{"ok":true}`. The second prints the IP you should type in the browser. If health works on the box but the browser fails, the security group is still blocking you.

Add that exact origin (`http://13.x.x.x`) in the Google OAuth client. Sign-in can work. The microphone will not — browsers block it on plain HTTP.

**HTTPS (needed for the microphone)**

You cannot turn `http://13.x.x.x:3000` into trusted HTTPS by itself. Let’s Encrypt needs a hostname. Use a domain you own, or a free DNS name that already points at the instance, such as `13.200.235.116.sslip.io`.

Open ports **80** and **443** in the security group (`0.0.0.0/0`). Port 80 is required for the certificate challenge.

Then in `.env`:

```bash
DOMAIN=13.200.235.116.sslip.io
PUBLIC_ORIGIN=https://13.200.235.116.sslip.io
COOKIE_SECURE=1
```

Or use your own domain and point its A record at `13.200.235.116`. Add that `https://…` origin in the Google OAuth client. Do not start `docker-compose.ec2.yml` at the same time — it also binds port 80. Start with TLS in front:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy gets a Let’s Encrypt certificate and proxies to the app. Open `https://app.example.com`.

Later updates:

```bash
cd LinguaSure
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Without Docker, build once and serve the UI from the same Node process:

```bash
npm run build
HOST=0.0.0.0 PORT=3000 NODE_ENV=production npm start
```

## License

Proprietary. All rights reserved.
