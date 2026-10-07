import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const PILLARS = [
  {
    title: "Measure your real speaking ability",
    detail:
      "Get an honest baseline from one short voice assessment. If evidence is weak, LinguaSure says so.",
  },
  {
    title: "Practice real career situations",
    detail:
      "Train for interviews, standups, manager updates, and client calls with dynamic follow-up questions.",
  },
  {
    title: "Improve with clear next actions",
    detail:
      "After every session, see your weakest metric, what to say better, and the exact drill to run next.",
  },
];

const PROOF = [
  "8-minute voice assessment",
  "Situation-based score with evidence",
  "Targeted drill + retry loop",
];

type ScreenshotKind = "dashboard" | "live" | "debrief";
type IconKind = "mic" | "trend" | "target";

const SCREENSHOTS: Array<{
  title: string;
  label: string;
  points: string[];
  kind: ScreenshotKind;
  score: string;
  helper: string;
}> = [
  {
    title: "Home dashboard",
    label: "After login",
    kind: "dashboard",
    score: "72 / 100",
    helper: "+8 this week",
    points: ["Do this now CTA", "Weakest metric callout", "One-click next step"],
  },
  {
    title: "Live practice call",
    label: "During session",
    kind: "live",
    score: "01:54",
    helper: "AI speaking",
    points: ["Real-time transcript", "Turn-by-turn coach sheet", "Countdown + clear controls"],
  },
  {
    title: "Debrief report",
    label: "After session",
    kind: "debrief",
    score: "81 / 100",
    helper: "Best score this month",
    points: ["Communication score", "What to keep vs fix", "Instant drill + retry buttons"],
  },
];

const ICON_FEATURES: Array<{
  title: string;
  detail: string;
  badge: string;
  kind: IconKind;
}> = [
  {
    title: "Realtime Voice Coach",
    detail: "Adaptive prompts while you speak so practice feels like a real conversation.",
    badge: "Live guidance",
    kind: "mic",
  },
  {
    title: "Progress Intelligence",
    detail: "Track trend movement by scenario and instantly see what skill is rising or dropping.",
    badge: "Score analytics",
    kind: "trend",
  },
  {
    title: "Targeted Drills",
    detail: "Pinpoint one weak skill, run a 2-minute drill, then retry the same scenario.",
    badge: "Fast improvement",
    kind: "target",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I always froze after unexpected interview questions. The retry flow helped me answer faster in one week.",
    name: "Rahul S.",
    role: "Software Engineer",
    result: "Interview confidence up",
  },
  {
    quote:
      "The score finally showed me what was wrong: I was too slow to start answers. The 2-minute drill fixed that.",
    name: "Priya K.",
    role: "Product Analyst",
    result: "Response speed improved",
  },
  {
    quote:
      "This feels like a speaking coach, not just AI chat. I now lead standups with less hesitation.",
    name: "Neha M.",
    role: "QA Lead",
    result: "Meeting confidence up",
  },
];

const SOCIAL_PROOF = [
  { value: "4.8 / 5", label: "Average rating from early beta users" },
  { value: "82%", label: "Reported better confidence after 3 sessions" },
  { value: "2.7x", label: "More structured practice retries per week" },
];

const STEPS = [
  {
    title: "Take the assessment",
    detail: "Speak for a few minutes in one guided conversation.",
  },
  {
    title: "See your communication score",
    detail: "Get metric-by-metric feedback with evidence from your own transcript.",
  },
  {
    title: "Train one weak skill",
    detail: "Run a short targeted drill and retry the same scenario.",
  },
  {
    title: "Track score movement",
    detail: "Watch your score improve on repeated situations over time.",
  },
];

const SITUATIONS = [
  "Unexpected interview",
  "Standup under pressure",
  "Client explanation",
  "Manager 1:1",
  "Executive update",
  "Salary conversation",
  "Handle disagreement",
  "Presentation Q&A",
];

const FAQS = [
  {
    q: "Is this just another AI chat app?",
    a: "No. LinguaSure focuses on measurable communication improvement: score, weakness, drill, retry, and trend.",
  },
  {
    q: "Do I need perfect English before starting?",
    a: "No. The first assessment is gentle. You start from your current level and improve one skill at a time.",
  },
  {
    q: "How fast can I see improvement?",
    a: "Most users see movement after 2-3 retries on the same scenario when they follow the drill guidance.",
  },
];

function LandingIcon({ kind }: { kind: IconKind }) {
  if (kind === "mic") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <rect x="9" y="3.8" width="6" height="10" rx="3" />
        <path d="M7 11a5 5 0 0 0 10 0" />
        <path d="M12 16v4" />
        <path d="M9 20h6" />
      </svg>
    );
  }

  if (kind === "trend") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 18h16" />
        <path d="M6.2 14.8 10 11l3 2.8 5.2-6" />
        <circle cx="6.2" cy="14.8" r="1.1" />
        <circle cx="10" cy="11" r="1.1" />
        <circle cx="13" cy="13.8" r="1.1" />
        <circle cx="18.2" cy="7.8" r="1.1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 5v2M12 17v2M5 12h2M17 12h2" />
    </svg>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const primaryHref = user ? "/app" : "/login";
  const primaryLabel = user ? "Continue my practice plan" : "Check my speaking score (free)";
  const secondaryLabel = user ? "View my progress history" : "See how a session works";
  const secondaryHref = user ? "/history" : "#how";

  return (
    <main className="landing">
      <header className="landing-topbar">
        <Link to="/" className="brand-link">
          LinguaSure
        </Link>
        <nav>
          <a href="#how">How it works</a>
          <a href="#screenshots">Screenshots</a>
          <a href="#scenes">Situations</a>
          <a href="#testimonials">Testimonials</a>
          <a href="#faq">FAQ</a>
          <Link className="button-link landing-nav-cta landing-primary" to={primaryHref}>
            {user ? "Open app" : "Check score"}
          </Link>
        </nav>
      </header>

      <section className="stage wide landing-hero landing-hero-grid">
        <div>
          <p className="eyebrow">AI Communication Coach</p>
          <h1>Turn English knowledge into real speaking confidence.</h1>
          <p className="lede">
            LinguaSure is built for interviews, meetings, and client calls. It tells you where you
            stand, what is weak, and exactly what to practice next.
          </p>
          <div className="landing-proof-row">
            {PROOF.map((item) => (
              <span key={item} className="landing-proof-pill">
                {item}
              </span>
            ))}
          </div>
          <div className="landing-cta-row">
            <Link className="button-link landing-primary" to={primaryHref}>
              {primaryLabel}
            </Link>
            <Link className="button-link landing-secondary" to={secondaryHref}>
              {secondaryLabel}
            </Link>
          </div>
          <p className="micro-note">
            No card required. First score in one session.
          </p>
        </div>
        <div className="landing-visual-wrap" aria-hidden>
          <div className="landing-visual">
            <div className="landing-visual-glow" />
            <article className="landing-float-card landing-float-main">
              <p className="micro-note">Communication score</p>
              <h3>72 / 100</h3>
              <p>After 3 retries in "Unexpected interview"</p>
            </article>
            <article className="landing-float-card landing-float-weak">
              <p className="micro-note">Weakest skill</p>
              <h3>Response speed</h3>
              <p>Start answer in under 5 seconds</p>
            </article>
            <article className="landing-float-card landing-float-next">
              <p className="micro-note">Next action</p>
              <h3>2-minute drill</h3>
              <p>Then retry same scenario to move score</p>
            </article>
          </div>
        </div>
      </section>

      <section className="stage wide landing-section">
        <div className="landing-card-grid">
          {PILLARS.map((item) => (
            <article key={item.title} className="landing-card">
              <h2>{item.title}</h2>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="stage wide landing-section">
        <h2 className="landing-title">3D Coach Tools</h2>
        <p className="lede">
          Built to feel alive, so your practice experience stays engaging session after session.
        </p>
        <div className="landing-icon-grid">
          {ICON_FEATURES.map((item) => (
            <article key={item.title} className="landing-icon-card">
              <div className={`landing-icon-orb icon-${item.kind}`}>
                <LandingIcon kind={item.kind} />
              </div>
              <p className="landing-icon-badge">{item.badge}</p>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="screenshots" className="stage wide landing-section">
        <h2 className="landing-title">App screenshots</h2>
        <p className="lede">
          What you actually see inside LinguaSure while learning.
        </p>
        <div className="landing-screen-grid">
          {SCREENSHOTS.map((item) => (
            <article key={item.title} className="landing-screen">
              <div className={`shot-frame shot-${item.kind}`}>
                <div className="shot-top">
                  <span className="shot-dot" />
                  <span className="shot-dot" />
                  <span className="shot-dot" />
                  <span className="shot-chip">{item.label}</span>
                </div>
                <div className="shot-body">
                  {item.kind === "dashboard" ? (
                    <>
                      <div className="shot-pill-row">
                        <span className="shot-pill is-accent">Today</span>
                        <span className="shot-pill">Response speed</span>
                      </div>
                      <div className="shot-score-row">
                        <div className="shot-score">{item.score}</div>
                        <span className="shot-up">{item.helper}</span>
                      </div>
                      <div className="shot-track">
                        <span className="shot-track-fill is-72" />
                      </div>
                      <div className="shot-line" />
                      <div className="shot-line short" />
                    </>
                  ) : null}

                  {item.kind === "live" ? (
                    <>
                      <div className="shot-live-row">
                        <span className="shot-live-dot" />
                        <span>{item.helper}</span>
                        <span className="shot-live-time">{item.score}</span>
                      </div>
                      <div className="shot-wave">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="shot-line" />
                      <div className="shot-line short" />
                    </>
                  ) : null}

                  {item.kind === "debrief" ? (
                    <>
                      <div className="shot-score-row">
                        <div className="shot-score">{item.score}</div>
                        <span className="shot-up">{item.helper}</span>
                      </div>
                      <div className="shot-metric-row">
                        <span>Clarity</span>
                        <span>86</span>
                      </div>
                      <div className="shot-metric-row">
                        <span>Response speed</span>
                        <span>79</span>
                      </div>
                      <div className="shot-action-row">
                        <span className="shot-action">Run drill</span>
                        <span className="shot-action is-ghost">Retry</span>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
              <h3>{item.title}</h3>
              <ul>
                {item.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="stage wide landing-section">
        <h2 className="landing-title">How LinguaSure works</h2>
        <div className="landing-step-grid">
          {STEPS.map((step, index) => (
            <article key={step.title} className="landing-step">
              <span className="landing-step-index">{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="testimonials" className="stage wide landing-section">
        <h2 className="landing-title">What users say</h2>
        <div className="landing-social-proof">
          {SOCIAL_PROOF.map((item) => (
            <article key={item.label} className="social-proof-card">
              <p className="social-proof-value">{item.value}</p>
              <p className="social-proof-label">{item.label}</p>
            </article>
          ))}
        </div>
        <div className="landing-testimonials">
          {TESTIMONIALS.map((item) => (
            <article key={item.name} className="testimonial-card">
              <p className="testimonial-quote">“{item.quote}”</p>
              <p className="testimonial-name">
                {item.name} · {item.role}
              </p>
              <p className="testimonial-result">{item.result}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="scenes" className="stage wide landing-section">
        <h2 className="landing-title">Practice the situations that matter</h2>
        <p className="lede">
          Train where communication affects your career, not random chat topics.
        </p>
        <div className="landing-chip-row">
          {SITUATIONS.map((name) => (
            <span key={name} className="landing-chip">
              {name}
            </span>
          ))}
        </div>
      </section>

      <section className="stage wide landing-section">
        <h2 className="landing-title">Why people choose this over generic chat</h2>
        <div className="landing-compare">
          <article>
            <h3>Generic AI chat</h3>
            <ul>
              <li>Conversation practice only</li>
              <li>No consistent scoring system</li>
              <li>No retry-based progress loop</li>
            </ul>
          </article>
          <article>
            <h3>LinguaSure</h3>
            <ul>
              <li>Communication score with evidence</li>
              <li>Weakness-focused drills and retries</li>
              <li>Progress tracking by scenario over time</li>
            </ul>
          </article>
        </div>
      </section>

      <section id="faq" className="stage wide landing-section">
        <h2 className="landing-title">FAQ</h2>
        <div className="landing-faq">
          {FAQS.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="stage wide landing-final">
        <h2>Know where you stand. Know what to improve next.</h2>
        <p className="lede">
          Start your first assessment now and get your personal communication profile.
        </p>
        <div className="landing-cta-row">
          <Link className="button-link landing-primary" to={primaryHref}>
            {primaryLabel}
          </Link>
          <Link className="button-link landing-secondary" to={secondaryHref}>
            {secondaryLabel}
          </Link>
        </div>
      </section>

      <Link className="landing-sticky-cta" to={primaryHref}>
        {primaryLabel}
      </Link>
    </main>
  );
}
