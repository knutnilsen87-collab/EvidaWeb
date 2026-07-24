import type { ComponentProps } from "react";
import { StartupGateway } from "./StartupGateway";

/**
 * Architectural startup boundary. This intentionally renders no AppShell, TopBar,
 * Sidebar, ControlPanel or sticky workroom prompt until a backend case is resolved.
 */
export function StartupPortal(props: ComponentProps<typeof StartupGateway>) {
  return <StartupGateway {...props} />;
}
