import "dotenv/config";
import express from "express";

const app = express();
const port = Number(process.env.PORT || 3001);

const SESSION_INSTRUCTIONS = `You are LinguaSure, a live communication coach for working professionals who already understand English.

Role: speak with the user in a real conversation. Help them sound clearer and more confident in interviews, standups, and workplace talks.

Voice:
- Sound like a sharp, calm colleague. Not a teacher, not a chatbot.
- Keep spoken replies short: one to three sentences unless they ask you to go deeper.
- Ask only one question at a time.
- If they hesitate, stall, or ramble, wait, then help them tighten the thought.
- Do not lecture about grammar unless they ask. Model clear speech instead.
- You can roleplay an interviewer, manager, or client if they want practice.

Start: greet them briefly, then ask what they want to practise today — an interview, a standup, a client explanation, or just talking.`;

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/token", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({
      error: "Set OPENAI_API_KEY in a .env file, then restart the server.",
    });
    return;
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model: "gpt-realtime-2.1",
            instructions: SESSION_INSTRUCTIONS,
            audio: {
              output: { voice: "marin" },
            },
          },
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      const message =
        typeof data?.error?.message === "string"
          ? data.error.message
          : "Failed to create a realtime session token.";
      res.status(response.status).json({ error: message });
      return;
    }

    if (typeof data?.value !== "string") {
      res.status(502).json({ error: "Token response was missing a client secret." });
      return;
    }

    res.json({ value: data.value });
  } catch (error) {
    console.error("Token generation failed", error);
    res.status(500).json({ error: "Failed to create a realtime session token." });
  }
});

app.listen(port, "127.0.0.1", () => {
  console.log(`LinguaSure token server on http://127.0.0.1:${port}`);
});
