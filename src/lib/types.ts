export type Chapter = {
  id: string;
  title: string;
  situation: string;
  brief: string;
  duration: string;
  unlocked?: boolean;
  hidden?: boolean;
  best?: number | null;
};

export type UnlockMetric =
  | "fluency"
  | "responseSpeed"
  | "grammar"
  | "vocabulary"
  | "clarity"
  | "tone"
  | "overall";

export type Goal = {
  metric: UnlockMetric;
  threshold: number;
  label: string;
  thresholds: Record<UnlockMetric, number>;
};

export type User = {
  id: string;
  email: string;
  name: string;
  picture: string | null;
};

export type TranscriptLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type ScoreNote = {
  score: number;
  note?: string;
  examples?: string[];
  wpm?: number;
  avgLatencyMs?: number;
  count?: number;
  per100Words?: number;
};

export type Scorecard = {
  overall: number;
  metrics: {
    fluency: number;
    responseSpeed: number;
    grammar: number;
    vocabulary: number;
    clarity: number;
    tone: number;
  };
  acoustic: {
    speakingSpeed: ScoreNote;
    pauses: ScoreNote;
    fillers: ScoreNote;
  };
  linguistic: {
    grammar: ScoreNote;
    vocabulary: ScoreNote;
  };
  communicative: {
    clarity: ScoreNote;
    unexpected: ScoreNote;
    tone: ScoreNote;
  };
  weakness: string;
  nextFocus: string;
  chapterId: string;
};

export type PracticeSession = {
  id: string;
  status: "live" | "scored" | "abandoned";
  startedAt: string;
  endedAt: string | null;
  overall: number | null;
  weakness: string | null;
  nextFocus: string | null;
  chapter: Chapter;
  transcript: TranscriptLine[];
  scores: Scorecard | null;
  instructions?: string;
};

export type Profile = {
  sessionCount: number;
  lastOverall: number | null;
  bestOverall: number | null;
  latestWeakness: string | null;
  metrics: Scorecard["metrics"] | null;
};

export type MeResponse = {
  user: User;
  profile: Profile;
  goal: Goal;
  metricOptions: Record<string, string>;
  chapters: Chapter[];
  recent: PracticeSession[];
};

export type SessionTimings = {
  speakingMs: number;
  latenciesMs: number[];
};
