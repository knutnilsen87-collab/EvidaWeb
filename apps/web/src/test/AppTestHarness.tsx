import AppRouter, { type AppRouterInitialState } from "../App";
import { MockAuthProvider, mockAuthenticatedUser } from "./MockAuthProvider";

export type AppTestState =
  | "authenticated_no_active_case"
  | "authenticated_active_case"
  | "authenticated_case_resolving"
  | "authenticated_case_resolution_failed"
  | "unauthenticated";

const ACTIVE_CASE_ID = "dddddddd-1111-4222-8333-444444444444";

function routerState(state: AppTestState): AppRouterInitialState | undefined {
  switch (state) {
    case "authenticated_active_case":
      return { activeCaseId: ACTIVE_CASE_ID, activeCaseName: "Harness-sak", caseResolutionState: "resolved", activeView: "import" };
    case "authenticated_case_resolving":
      return { activeCaseName: "Harness-sak", caseResolutionState: "resolving", activeView: "import" };
    case "authenticated_case_resolution_failed":
      return { activeCaseName: "Harness-sak", caseResolutionState: "failed", caseResolutionError: "Kontrollert harness-feil", activeView: "import" };
    default:
      return undefined;
  }
}

export function AppTestHarness({ state }: { state: AppTestState }) {
  return (
    <MockAuthProvider user={state === "unauthenticated" ? null : mockAuthenticatedUser}>
      <AppRouter initialState={routerState(state)} />
    </MockAuthProvider>
  );
}
