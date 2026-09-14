export type Chapter = {
  id: string;
  title: string;
  situation: string;
  brief: string;
  duration: string;
  unlocked?: boolean;
  hidden?: boolean;
  lane?: "core" | "extra";
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
  score: number | null;
  note?: string;
  examples?: string[];
  wpm?: number;
  avgLatencyMs?: number;
  count?: number;
  per100Words?: number;
};

export type MetricSet = {
  fluency: number | null;
  responseSpeed: number | null;
  grammar: number | null;
  vocabulary: number | null;
  clarity: number | null;
  tone: number | null;
};

export type Scorecard = {
  overall: number | null;
  metrics: MetricSet;
  evidence?: {
    acoustic: boolean;
    linguistic: boolean;
    words: number;
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
  talkStartedAt?: string | null;
  remainingMs?: number | null;
  maxMs?: number;
  overall: number | null;
  weakness: string | null;
  nextFocus: string | null;
  chapter: Chapter;
  transcript: TranscriptLine[];
  scores: Scorecard | null;
  instructions?: string;
};

export type ProgressPoint = {
  sessionId: string;
  at: string;
  overall: number | null;
  metric: number | null;
};

export type SituationProgress = {
  chapterId: string;
  title: string;
  points: ProgressPoint[];
};

export type Profile = {
  sessionCount: number;
  lastOverall: number | null;
  bestOverall: number | null;
  latestWeakness: string | null;
  metrics: MetricSet | null;
};

export type MeResponse = {
  user: User;
  profile: Profile;
  goal: Goal;
  metricOptions: Record<string, string>;
  chapters: Chapter[];
  needsAssessment: boolean;
  hasRetried: boolean;
  progress: SituationProgress[];
  assessment: Chapter;
  recent: PracticeSession[];
};

export type SessionTimings = {
  speakingMs: number;
  latenciesMs: number[];
};
