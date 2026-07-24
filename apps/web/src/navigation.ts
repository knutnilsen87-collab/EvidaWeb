export type WorkspaceView =
  | "dashboard"
  | "import"
  | "quarantine"
  | "saksrom"
  | "chronology"
  | "evidence"
  | "arguments"
  | "risk"
  | "draft"
  | "export";

export type NavigationItem = {
  view: WorkspaceView;
  label: string;
  description: string;
};

export type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};

export const navigationGroups: NavigationGroup[] = [
  {
    title: "Kilder",
    items: [
      { view: "import", label: "Dokumenter", description: "Dokumentinntak" },
      { view: "quarantine", label: "Kontroll", description: "Kildekontroll" }
    ]
  },
  {
    title: "Analyse",
    items: [
      { view: "saksrom", label: "Saksrom", description: "Kildebundet AI" },
      { view: "chronology", label: "Kronologi", description: "Tidslinje" },
      { view: "evidence", label: "Bevismatrise", description: "Påstand mot kilde" },
      { view: "risk", label: "Risiko", description: "Hull og motstrid" }
    ]
  },
  {
    title: "Leveranse",
    items: [
      { view: "arguments", label: "Anførselstavle", description: "Prosedyre" },
      { view: "draft", label: "Utkast", description: "Dokumentproduksjon" },
      { view: "export", label: "Eksport", description: "Sluttleveranse" }
    ]
  }
];

export const viewTitles: Record<WorkspaceView, string> = {
  dashboard: "Oversikt",
  ...Object.fromEntries(
    navigationGroups.flatMap((group) => group.items.map((item) => [item.view, item.label]))
  )
} as Record<WorkspaceView, string>;
