import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MockAuthProvider } from "./MockAuthProvider";

export function renderWithEvidaProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, {
    wrapper: ({ children }) => <MockAuthProvider>{children}</MockAuthProvider>,
    ...options
  });
}
