import dayjs from "dayjs";

export type ActivityEventType =
  | "offer_completion"
  | "survey_completion"
  | "daily_login"
  | "successful_referral";

export type ActivityLevelName =
  | "Beginner"
  | "Amateur"
  | "Advanced"
  | "Pro"
  | "Expert";

export interface ActivityScoreConfig {
  offerCompletion: number;
  surveyCompletion: number;
  dailyLogin: number;
  successfulReferral: number;
}

export interface ActivityLevelThresholds {
  beginnerMax: number;
  amateurMax: number;
  advancedMax: number;
  proMax: number;
}

export interface ActivityStats {
  offersCompleted: number;
  surveysCompleted: number;
  successfulReferrals: number;
  dailyLogins: number;
}

export interface ActivityBadges {
  firstOfferCompleted: boolean;
  tenOffersCompleted: boolean;
  fiftyOffersCompleted: boolean;
  firstReferral: boolean;
  fiveReferrals: boolean;
  accountAge30DaysActive: boolean;
}

export interface ActivityProgress {
  activityScore: number;
  currentLevel: ActivityLevelName;
  nextLevel: ActivityLevelName | null;
  nextLevelThreshold: number | null;
  progressPercent: number;
  progressCurrent: number;
  progressTarget: number | null;
}

export interface ActivityBadgeView {
  key: keyof ActivityBadges;
  label: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

export const DEFAULT_ACTIVITY_SCORE_CONFIG: ActivityScoreConfig = {
  offerCompletion: 5,
  surveyCompletion: 3,
  dailyLogin: 1,
  successfulReferral: 10,
};

export const DEFAULT_ACTIVITY_LEVEL_THRESHOLDS: ActivityLevelThresholds = {
  beginnerMax: 30,
  amateurMax: 80,
  advancedMax: 180,
  proMax: 350,
};

export const DEFAULT_ACTIVITY_STATS: ActivityStats = {
  offersCompleted: 0,
  surveysCompleted: 0,
  successfulReferrals: 0,
  dailyLogins: 0,
};

export const DEFAULT_ACTIVITY_BADGES: ActivityBadges = {
  firstOfferCompleted: false,
  tenOffersCompleted: false,
  fiftyOffersCompleted: false,
  firstReferral: false,
  fiveReferrals: false,
  accountAge30DaysActive: false,
};

export function sanitizeActivityScoreConfig(
  raw: Partial<ActivityScoreConfig> | null | undefined,
): ActivityScoreConfig {
  return {
    offerCompletion:
      Number.isFinite(raw?.offerCompletion) && (raw?.offerCompletion as number) >= 0
        ? Math.round(raw!.offerCompletion as number)
        : DEFAULT_ACTIVITY_SCORE_CONFIG.offerCompletion,
    surveyCompletion:
      Number.isFinite(raw?.surveyCompletion) &&
      (raw?.surveyCompletion as number) >= 0
        ? Math.round(raw!.surveyCompletion as number)
        : DEFAULT_ACTIVITY_SCORE_CONFIG.surveyCompletion,
    dailyLogin:
      Number.isFinite(raw?.dailyLogin) && (raw?.dailyLogin as number) >= 0
        ? Math.round(raw!.dailyLogin as number)
        : DEFAULT_ACTIVITY_SCORE_CONFIG.dailyLogin,
    successfulReferral:
      Number.isFinite(raw?.successfulReferral) &&
      (raw?.successfulReferral as number) >= 0
        ? Math.round(raw!.successfulReferral as number)
        : DEFAULT_ACTIVITY_SCORE_CONFIG.successfulReferral,
  };
}

export function sanitizeActivityLevelThresholds(
  raw: Partial<ActivityLevelThresholds> | null | undefined,
): ActivityLevelThresholds {
  const beginnerMax =
    Number.isFinite(raw?.beginnerMax) && (raw?.beginnerMax as number) >= 0
      ? Math.round(raw!.beginnerMax as number)
      : DEFAULT_ACTIVITY_LEVEL_THRESHOLDS.beginnerMax;
  const amateurMax =
    Number.isFinite(raw?.amateurMax) && (raw?.amateurMax as number) > beginnerMax
      ? Math.round(raw!.amateurMax as number)
      : Math.max(DEFAULT_ACTIVITY_LEVEL_THRESHOLDS.amateurMax, beginnerMax + 1);
  const advancedMax =
    Number.isFinite(raw?.advancedMax) &&
    (raw?.advancedMax as number) > amateurMax
      ? Math.round(raw!.advancedMax as number)
      : Math.max(DEFAULT_ACTIVITY_LEVEL_THRESHOLDS.advancedMax, amateurMax + 1);
  const proMax =
    Number.isFinite(raw?.proMax) && (raw?.proMax as number) > advancedMax
      ? Math.round(raw!.proMax as number)
      : Math.max(DEFAULT_ACTIVITY_LEVEL_THRESHOLDS.proMax, advancedMax + 1);

  return {
    beginnerMax,
    amateurMax,
    advancedMax,
    proMax,
  };
}

export function getActivityStats(raw: Partial<ActivityStats> | null | undefined): ActivityStats {
  return {
    offersCompleted: Math.max(0, Math.round(Number(raw?.offersCompleted || 0))),
    surveysCompleted: Math.max(0, Math.round(Number(raw?.surveysCompleted || 0))),
    successfulReferrals: Math.max(
      0,
      Math.round(Number(raw?.successfulReferrals || 0)),
    ),
    dailyLogins: Math.max(0, Math.round(Number(raw?.dailyLogins || 0))),
  };
}

export function getActivityBadges(raw: Partial<ActivityBadges> | null | undefined): ActivityBadges {
  return {
    firstOfferCompleted: Boolean(raw?.firstOfferCompleted),
    tenOffersCompleted: Boolean(raw?.tenOffersCompleted),
    fiftyOffersCompleted: Boolean(raw?.fiftyOffersCompleted),
    firstReferral: Boolean(raw?.firstReferral),
    fiveReferrals: Boolean(raw?.fiveReferrals),
    accountAge30DaysActive: Boolean(raw?.accountAge30DaysActive),
  };
}

function getNextLevelFor(current: ActivityLevelName): ActivityLevelName | null {
  if (current === "Beginner") return "Amateur";
  if (current === "Amateur") return "Advanced";
  if (current === "Advanced") return "Pro";
  if (current === "Pro") return "Expert";
  return null;
}

export function calculateActivityProgress(
  score: number,
  thresholdsInput?: Partial<ActivityLevelThresholds> | null,
): ActivityProgress {
  const thresholds = sanitizeActivityLevelThresholds(thresholdsInput);
  const safeScore = Math.max(0, Math.round(Number(score || 0)));

  let currentLevel: ActivityLevelName = "Expert";
  let nextLevelThreshold: number | null = null;

  if (safeScore <= thresholds.beginnerMax) {
    currentLevel = "Beginner";
    nextLevelThreshold = thresholds.beginnerMax + 1;
  } else if (safeScore <= thresholds.amateurMax) {
    currentLevel = "Amateur";
    nextLevelThreshold = thresholds.amateurMax + 1;
  } else if (safeScore <= thresholds.advancedMax) {
    currentLevel = "Advanced";
    nextLevelThreshold = thresholds.advancedMax + 1;
  } else if (safeScore <= thresholds.proMax) {
    currentLevel = "Pro";
    nextLevelThreshold = thresholds.proMax + 1;
  }

  const nextLevel = getNextLevelFor(currentLevel);
  const progressPercent = nextLevelThreshold
    ? Math.min(100, Number(((safeScore / nextLevelThreshold) * 100).toFixed(2)))
    : 100;

  return {
    activityScore: safeScore,
    currentLevel,
    nextLevel,
    nextLevelThreshold,
    progressPercent,
    progressCurrent: safeScore,
    progressTarget: nextLevelThreshold,
  };
}

export function applyActivityEvent(
  user: any,
  eventType: ActivityEventType,
  options?: {
    scoreConfig?: Partial<ActivityScoreConfig> | null;
    now?: Date;
  },
): { scoreDelta: number; stats: ActivityStats; badges: ActivityBadges } {
  const scoreConfig = sanitizeActivityScoreConfig(options?.scoreConfig);
  const stats = getActivityStats(user?.activityStats);
  const badges = getActivityBadges(user?.activityBadges);

  let scoreDelta = 0;

  if (eventType === "offer_completion") {
    scoreDelta = scoreConfig.offerCompletion;
    stats.offersCompleted += 1;
  }
  if (eventType === "survey_completion") {
    scoreDelta = scoreConfig.surveyCompletion;
    stats.surveysCompleted += 1;
  }
  if (eventType === "daily_login") {
    scoreDelta = scoreConfig.dailyLogin;
    stats.dailyLogins += 1;
  }
  if (eventType === "successful_referral") {
    scoreDelta = scoreConfig.successfulReferral;
    stats.successfulReferrals += 1;
  }

  const currentScore = Math.max(0, Math.round(Number(user?.activityScore || 0)));
  user.activityScore = currentScore + scoreDelta;
  user.activityStats = stats;

  const updatedBadges = evaluateAndMergeBadges(
    stats,
    badges,
    user?.createdAt,
    options?.now,
  );
  user.activityBadges = updatedBadges;

  return { scoreDelta, stats, badges: updatedBadges };
}

export function applyDailyLoginIfEligible(
  user: any,
  scoreConfig?: Partial<ActivityScoreConfig> | null,
  nowInput?: Date,
): boolean {
  const now = nowInput || new Date();
  const lastLogin = user?.lastActivityLoginAt
    ? dayjs(user.lastActivityLoginAt)
    : null;
  const todayStart = dayjs(now).startOf("day");

  if (lastLogin && !lastLogin.isBefore(todayStart)) {
    return false;
  }

  applyActivityEvent(user, "daily_login", { scoreConfig, now });
  user.lastActivityLoginAt = now;
  return true;
}

export function evaluateAndMergeBadges(
  statsInput: Partial<ActivityStats> | null | undefined,
  existingInput: Partial<ActivityBadges> | null | undefined,
  createdAt?: Date | string | null,
  nowInput?: Date,
): ActivityBadges {
  const stats = getActivityStats(statsInput);
  const existing = getActivityBadges(existingInput);
  const now = nowInput || new Date();

  const accountAgeDays = createdAt
    ? dayjs(now).diff(dayjs(createdAt), "day")
    : 0;

  return {
    firstOfferCompleted: existing.firstOfferCompleted || stats.offersCompleted >= 1,
    tenOffersCompleted: existing.tenOffersCompleted || stats.offersCompleted >= 10,
    fiftyOffersCompleted: existing.fiftyOffersCompleted || stats.offersCompleted >= 50,
    firstReferral: existing.firstReferral || stats.successfulReferrals >= 1,
    fiveReferrals: existing.fiveReferrals || stats.successfulReferrals >= 5,
    accountAge30DaysActive:
      existing.accountAge30DaysActive || accountAgeDays >= 30,
  };
}

export function getActivityBadgeViews(
  rawBadges: Partial<ActivityBadges> | null | undefined,
): ActivityBadgeView[] {
  const badges = getActivityBadges(rawBadges);
  return [
    {
      key: "firstOfferCompleted",
      label: "First Offer",
      title: "First Offer Completed",
      description: "Complete your first offer.",
      icon: "💎",
      unlocked: badges.firstOfferCompleted,
    },
    {
      key: "tenOffersCompleted",
      label: "10 Offers",
      title: "10 Offers Completed",
      description: "Complete 10 offers.",
      icon: "🏅",
      unlocked: badges.tenOffersCompleted,
    },
    {
      key: "fiftyOffersCompleted",
      label: "50 Offers",
      title: "50 Offers Completed",
      description: "Complete 50 offers.",
      icon: "👑",
      unlocked: badges.fiftyOffersCompleted,
    },
    {
      key: "firstReferral",
      label: "First Referral",
      title: "First Referral",
      description: "Refer your first user.",
      icon: "🤝",
      unlocked: badges.firstReferral,
    },
    {
      key: "fiveReferrals",
      label: "5 Referrals",
      title: "5 Referrals",
      description: "Refer 5 users.",
      icon: "🚀",
      unlocked: badges.fiveReferrals,
    },
    {
      key: "accountAge30DaysActive",
      label: "30 Days Active",
      title: "30 Days Active",
      description: "Keep your account active for 30 days.",
      icon: "📅",
      unlocked: badges.accountAge30DaysActive,
    },
  ];
}