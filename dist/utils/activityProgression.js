"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ACTIVITY_BADGES = exports.DEFAULT_ACTIVITY_STATS = exports.DEFAULT_ACTIVITY_LEVEL_THRESHOLDS = exports.DEFAULT_ACTIVITY_SCORE_CONFIG = void 0;
exports.sanitizeActivityScoreConfig = sanitizeActivityScoreConfig;
exports.sanitizeActivityLevelThresholds = sanitizeActivityLevelThresholds;
exports.getActivityStats = getActivityStats;
exports.getActivityBadges = getActivityBadges;
exports.calculateActivityProgress = calculateActivityProgress;
exports.applyActivityEvent = applyActivityEvent;
exports.applyDailyLoginIfEligible = applyDailyLoginIfEligible;
exports.evaluateAndMergeBadges = evaluateAndMergeBadges;
exports.getActivityBadgeViews = getActivityBadgeViews;
const dayjs_1 = __importDefault(require("dayjs"));
exports.DEFAULT_ACTIVITY_SCORE_CONFIG = {
    offerCompletion: 5,
    surveyCompletion: 3,
    dailyLogin: 1,
    successfulReferral: 10,
};
exports.DEFAULT_ACTIVITY_LEVEL_THRESHOLDS = {
    beginnerMax: 30,
    amateurMax: 80,
    advancedMax: 180,
    proMax: 350,
};
exports.DEFAULT_ACTIVITY_STATS = {
    offersCompleted: 0,
    surveysCompleted: 0,
    successfulReferrals: 0,
    dailyLogins: 0,
};
exports.DEFAULT_ACTIVITY_BADGES = {
    firstOfferCompleted: false,
    tenOffersCompleted: false,
    fiftyOffersCompleted: false,
    firstReferral: false,
    fiveReferrals: false,
    accountAge30DaysActive: false,
};
function sanitizeActivityScoreConfig(raw) {
    return {
        offerCompletion: Number.isFinite(raw?.offerCompletion) && raw?.offerCompletion >= 0
            ? Math.round(raw.offerCompletion)
            : exports.DEFAULT_ACTIVITY_SCORE_CONFIG.offerCompletion,
        surveyCompletion: Number.isFinite(raw?.surveyCompletion) &&
            raw?.surveyCompletion >= 0
            ? Math.round(raw.surveyCompletion)
            : exports.DEFAULT_ACTIVITY_SCORE_CONFIG.surveyCompletion,
        dailyLogin: Number.isFinite(raw?.dailyLogin) && raw?.dailyLogin >= 0
            ? Math.round(raw.dailyLogin)
            : exports.DEFAULT_ACTIVITY_SCORE_CONFIG.dailyLogin,
        successfulReferral: Number.isFinite(raw?.successfulReferral) &&
            raw?.successfulReferral >= 0
            ? Math.round(raw.successfulReferral)
            : exports.DEFAULT_ACTIVITY_SCORE_CONFIG.successfulReferral,
    };
}
function sanitizeActivityLevelThresholds(raw) {
    const beginnerMax = Number.isFinite(raw?.beginnerMax) && raw?.beginnerMax >= 0
        ? Math.round(raw.beginnerMax)
        : exports.DEFAULT_ACTIVITY_LEVEL_THRESHOLDS.beginnerMax;
    const amateurMax = Number.isFinite(raw?.amateurMax) && raw?.amateurMax > beginnerMax
        ? Math.round(raw.amateurMax)
        : Math.max(exports.DEFAULT_ACTIVITY_LEVEL_THRESHOLDS.amateurMax, beginnerMax + 1);
    const advancedMax = Number.isFinite(raw?.advancedMax) &&
        raw?.advancedMax > amateurMax
        ? Math.round(raw.advancedMax)
        : Math.max(exports.DEFAULT_ACTIVITY_LEVEL_THRESHOLDS.advancedMax, amateurMax + 1);
    const proMax = Number.isFinite(raw?.proMax) && raw?.proMax > advancedMax
        ? Math.round(raw.proMax)
        : Math.max(exports.DEFAULT_ACTIVITY_LEVEL_THRESHOLDS.proMax, advancedMax + 1);
    return {
        beginnerMax,
        amateurMax,
        advancedMax,
        proMax,
    };
}
function getActivityStats(raw) {
    return {
        offersCompleted: Math.max(0, Math.round(Number(raw?.offersCompleted || 0))),
        surveysCompleted: Math.max(0, Math.round(Number(raw?.surveysCompleted || 0))),
        successfulReferrals: Math.max(0, Math.round(Number(raw?.successfulReferrals || 0))),
        dailyLogins: Math.max(0, Math.round(Number(raw?.dailyLogins || 0))),
    };
}
function getActivityBadges(raw) {
    return {
        firstOfferCompleted: Boolean(raw?.firstOfferCompleted),
        tenOffersCompleted: Boolean(raw?.tenOffersCompleted),
        fiftyOffersCompleted: Boolean(raw?.fiftyOffersCompleted),
        firstReferral: Boolean(raw?.firstReferral),
        fiveReferrals: Boolean(raw?.fiveReferrals),
        accountAge30DaysActive: Boolean(raw?.accountAge30DaysActive),
    };
}
function getNextLevelFor(current) {
    if (current === "Beginner")
        return "Amateur";
    if (current === "Amateur")
        return "Advanced";
    if (current === "Advanced")
        return "Pro";
    if (current === "Pro")
        return "Expert";
    return null;
}
function calculateActivityProgress(score, thresholdsInput) {
    const thresholds = sanitizeActivityLevelThresholds(thresholdsInput);
    const safeScore = Math.max(0, Math.round(Number(score || 0)));
    let currentLevel = "Expert";
    let nextLevelThreshold = null;
    if (safeScore <= thresholds.beginnerMax) {
        currentLevel = "Beginner";
        nextLevelThreshold = thresholds.beginnerMax + 1;
    }
    else if (safeScore <= thresholds.amateurMax) {
        currentLevel = "Amateur";
        nextLevelThreshold = thresholds.amateurMax + 1;
    }
    else if (safeScore <= thresholds.advancedMax) {
        currentLevel = "Advanced";
        nextLevelThreshold = thresholds.advancedMax + 1;
    }
    else if (safeScore <= thresholds.proMax) {
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
function applyActivityEvent(user, eventType, options) {
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
    const updatedBadges = evaluateAndMergeBadges(stats, badges, user?.createdAt, options?.now);
    user.activityBadges = updatedBadges;
    return { scoreDelta, stats, badges: updatedBadges };
}
function applyDailyLoginIfEligible(user, scoreConfig, nowInput) {
    const now = nowInput || new Date();
    const lastLogin = user?.lastActivityLoginAt
        ? (0, dayjs_1.default)(user.lastActivityLoginAt)
        : null;
    const todayStart = (0, dayjs_1.default)(now).startOf("day");
    if (lastLogin && !lastLogin.isBefore(todayStart)) {
        return false;
    }
    applyActivityEvent(user, "daily_login", { scoreConfig, now });
    user.lastActivityLoginAt = now;
    return true;
}
function evaluateAndMergeBadges(statsInput, existingInput, createdAt, nowInput) {
    const stats = getActivityStats(statsInput);
    const existing = getActivityBadges(existingInput);
    const now = nowInput || new Date();
    const accountAgeDays = createdAt
        ? (0, dayjs_1.default)(now).diff((0, dayjs_1.default)(createdAt), "day")
        : 0;
    return {
        firstOfferCompleted: existing.firstOfferCompleted || stats.offersCompleted >= 1,
        tenOffersCompleted: existing.tenOffersCompleted || stats.offersCompleted >= 10,
        fiftyOffersCompleted: existing.fiftyOffersCompleted || stats.offersCompleted >= 50,
        firstReferral: existing.firstReferral || stats.successfulReferrals >= 1,
        fiveReferrals: existing.fiveReferrals || stats.successfulReferrals >= 5,
        accountAge30DaysActive: existing.accountAge30DaysActive || accountAgeDays >= 30,
    };
}
function getActivityBadgeViews(rawBadges) {
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
//# sourceMappingURL=activityProgression.js.map