import { newId } from "./ids.js";

type LatLng = { lat: number; lng: number };

type CandidateRoute = {
  routeId: string;
  provider: "OTHER";
  geometry: { encoding: "polyline6"; polyline: string };
  steps: Array<{ stepIndex: number; instruction: string; distanceMeters: number; durationSeconds: number }>;
  eta: { secondsP50: number; secondsP90: number };
  // Later: include per-edge metadata; for now keep it simple.
};

export async function getCandidateRoutes(_request: any): Promise<CandidateRoute[]> {
  // Stub: returns 2 fake candidates with placeholder polyline.
  // Replace with HERE/TomTom route call and real polyline/steps.
  const fakePolyline = "}_ilFjk~uO??"; // placeholder, not a real route

  return [
    {
      routeId: newId("rt_"),
      provider: "OTHER",
      geometry: { encoding: "polyline6", polyline: fakePolyline },
      steps: [
        { stepIndex: 0, instruction: "Head north", distanceMeters: 1200, durationSeconds: 120 },
        { stepIndex: 1, instruction: "Continue straight", distanceMeters: 5200, durationSeconds: 360 }
      ],
      eta: { secondsP50: 900, secondsP90: 1200 }
    },
    {
      routeId: newId("rt_"),
      provider: "OTHER",
      geometry: { encoding: "polyline6", polyline: fakePolyline },
      steps: [
        { stepIndex: 0, instruction: "Head east", distanceMeters: 900, durationSeconds: 110 },
        { stepIndex: 1, instruction: "Merge and continue", distanceMeters: 6000, durationSeconds: 420 }
      ],
      eta: { secondsP50: 950, secondsP90: 1300 }
    }
  ];
}
