export type Chapter = {
  id: string;
  title: string;
  situation: string;
  brief: string;
  duration: string;
  unlocked?: boolean;
  lane?: "core" | "extra";
  best?: number | null;
};

export type MetricKey =
  | "fluency"
  | "responseSpeed"
  | "grammar"
  | "vocabulary"
  | "clarity"
  | "tone";

export type DifficultyMode = "gentle" | "standard" | "challenge";

export type SessionKind = "assessment" | "practice" | "drill";

export type User = {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  focusArea: "interview" | "workplace" | "client" | null;
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
  difficultyMode: DifficultyMode;
  kind: SessionKind;
  focus: string | null;
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

export type ProgramStep = {
  chapterId: string;
  kind: "session" | "drill";
  focus: string | null;
  title: string;
  chapterTitle: string;
  done: boolean;
};

export type ProgramState = {
  id: string;
  title: string;
  tagline: string;
  totalDays: number;
  day: number;
  completed: number;
  done: boolean;
  next: ProgramStep | null;
  steps: ProgramStep[];
};

export type ProgramSummary = {
  id: string;
  title: string;
  tagline: string;
  totalDays: number;
};

export type TodayRecommendation = {
  type: "assessment" | "program" | "coach";
  chapterId: string;
  kind: SessionKind | "session";
  focus: string | null;
  title: string;
  reason: string;
};

export type DrillRecommendation = {
  chapterId: string;
  focus: string;
  title: string;
  label: string;
};

export type WeeklyReport = {
  weekStart: string;
  sessions: number;
  average: number | null;
  previousAverage: number | null;
  delta: number | null;
  headline: string;
  wins: string[];
  focus: string;
  plan: string[];
};

export type MeResponse = {
  user: User;
  profile: Profile;
  level: {
    id: "starter" | "growing" | "confident";
    label: string;
    note: string;
    current: {
      average: number;
      scoredSessions: number;
    };
    next: {
      label: string;
      requirement: string;
      progress: number;
    } | null;
  };
  metricOptions: Record<string, string>;
  chapters: Chapter[];
  needsAssessment: boolean;
  progress: SituationProgress[];
  assessment: Chapter;
  today: TodayRecommendation;
  drill: DrillRecommendation | null;
  program: ProgramState | null;
  programs: ProgramSummary[];
  recent: PracticeSession[];
};

export type SessionTimings = {
  speakingMs: number;
  latenciesMs: number[];
};
