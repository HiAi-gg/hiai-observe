export function liveLogUnsupportedReason(args: {
  hasApiKey: boolean;
  selectedProject: string;
}): string | null {
  if (!args.hasApiKey) {
    return "Live log streaming is unavailable for cookie-backed sessions until a project-scoped transport is available.";
  }
  if (args.selectedProject) {
    return "Live log streaming is unavailable in selected-project views until a project-scoped transport is available.";
  }
  return null;
}
