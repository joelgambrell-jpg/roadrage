import { newId } from "./ids.js";

type Mode = "LOW_STRESS" | "TOW" | "FUEL_SAVER" | "FASTEST";

function isLargeTrailer(request: any): boolean {
  const threshold = request?.constraints?.largeTrailerThresholdFt ?? 16;
  const trailer = request?.vehicleProfile?.trailer;
  return !!(trailer?.enabled && typeof trailer.lengthFt === "number" && trailer.lengthFt >= threshold);
}

function destinationExceptionRadiusMiles(request: any): number {
  return request?.constraints?.destinationExceptionRadiusMiles ?? 1.0;
}

// Placeholder scoring: deterministic but simple.
// Next step: replace with real StressScore, TowConfidence, construction friction, collapse risk, tight-street exposure.
function scoreCandidate(route: any, mode: Mode, request: any) {
  const stressTolerance = request.userState.stressTolerance;

  const baseStress = mode === "LOW_STRESS" ? 20 : mode === "TOW" ? 25 : mode === "FUEL_SAVER" ? 40 : 55;
  const stressScore = Math.max(1, Math.min(100, baseStress + Math.floor((route.eta.secondsP50 % 300) / 10)));

  const towEnabled = request.vehicleProfile.trailer.enabled;
  const towConfidence = towEnabled ? Math.max(1, Math.min(10, 10 - Math.floor(stressScore / 12))) : undefined;

  const why: string[] = [];
  if (mode === "LOW_STRESS") why.push("Minimizes driving stress based on your tolerance");
  if (mode === "TOW") why.push("Prioritizes towing comfort and avoids tight streets when possible");
  if (mode === "FUEL_SAVER") why.push("Optimizes for lowest estimated fuel use");
  if (mode === "FASTEST") why.push("Optimizes for earliest arrival time");

  if (isLargeTrailer(request)) why.push("Large-trailer rules applied (16’+)");

  // Enforce the "max 3 bullets" rule
  const whyTrimmed = why.slice(0, 3);

  return {
    routeId: route.routeId,
    provider: route.provider ?? "OTHER",
    eta: {
      secondsP50: route.eta.secondsP50,
      secondsP90: route.eta.secondsP90,
      reliabilityLabel: "STABLE" as const
    },
    scores: {
      stressScore,
      ...(towConfidence ? { towConfidence } : {}),
      fuelIndex: mode === "FUEL_SAVER" ? 0.9 : 1.0,
      constructionFriction: 0.2,
      collapseRisk: 0.15,
      tightStreetExposure: isLargeTrailer(request) ? 0.1 : 0.3
    },
    why: whyTrimmed,
    advisories: buildAdvisories({ request, stressScore, towConfidence }),
    geometry: route.geometry,
    steps: route.steps,
    policyDebug: {
      blockedEdgesCount: 0,
      penaltyBreakdownTop: [
        { name: "turn_complexity", value: 0.1 },
        { name: "merge_complexity", value: 0.1 }
      ]
    }
  };
}

function buildAdvisories(params: { request: any; stressScore: number; towConfidence?: number }) {
  const advisories: Array<{ type: string; message: string }> = [];
  const tol = params.request.userState.stressTolerance;

  if (params.stressScore > tol) {
    advisories.push({ type: "HIGH_STRESS", message: `Route stress (${params.stressScore}) exceeds your tolerance (${tol}).` });
  }
  if (params.request.vehicleProfile.trailer.enabled && (params.towConfidence ?? 10) <= 4) {
    advisories.push({ type: "LOW_TOW_CONFIDENCE", message: "Tow confidence is low; expect demanding towing conditions." });
  }
  if (isLargeTrailer(params.request)) {
    advisories.push({
      type: "TOW_RULES_ACTIVE",
      message: `Large trailer rules active (>=16’). Destination exception radius: ${destinationExceptionRadiusMiles(params.request)} mile.`
    });
  }

  return advisories;
}

export function evaluateModes(params: { request: any; candidates: any[] }) {
  const { request, candidates } = params;

  const modes: Mode[] = [
    request.mode.primary,
    ...(request.mode.alsoReturn ?? [])
  ].filter((v, i, a) => a.indexOf(v) === i);

  const maxRoutes = request?.constraints?.maxRouteCountPerMode ?? 2;

  return modes.map((mode) => {
    // Score candidates
    const scored = candidates.map((c) => scoreCandidate(c, mode, request));

    // Select best (placeholder: LOW_STRESS chooses lowest stressScore, FASTEST lowest P50, FUEL_SAVER lowest fuelIndex, TOW highest towConfidence)
    const sorted = [...scored].sort((a, b) => {
      if (mode === "LOW_STRESS") return a.scores.stressScore - b.scores.stressScore;
      if (mode === "FASTEST") return a.eta.secondsP50 - b.eta.secondsP50;
      if (mode === "FUEL_SAVER") return (a.scores.fuelIndex ?? 1) - (b.scores.fuelIndex ?? 1);
      if (mode === "TOW") return (b.scores.towConfidence ?? 0) - (a.scores.towConfidence ?? 0);
      return 0;
    });

    return {
      mode,
      policySummary: {
        largeTrailerApplied: isLargeTrailer(request),
        destinationExceptionRadiusMiles: destinationExceptionRadiusMiles(request),
        avoidTightStreetsEffective: isLargeTrailer(request) ? true : !!request?.preferences?.avoidTightStreets,
        stressToleranceUsed: request.userState.stressTolerance
      },
      routes: sorted.slice(0, maxRoutes).map((r, idx) => ({ ...r, rank: idx + 1, selectionId: newId("sel_") }))
    };
  });
}

export function monitorDecision(_monitorRequest: any) {
  // Stub decision: always no change.
  return {
    action: "NO_CHANGE" as const,
    reason: "Monitoring stub: no change."
  };
}
