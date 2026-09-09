export type StudyNotesThemeRuntime = Readonly<{
  render(input: unknown): Readonly<{
    contract: "theme-render-output/v1";
    pages: readonly Readonly<{
      route: string;
      language: string;
      bodyHtml: string;
      stylesheetResources: readonly string[];
    }>[];
  }>;
}>;
