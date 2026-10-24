import { useImages } from "../store/images";
import { useLibrary } from "../store/library";
import { useSettings } from "../store/settings";
import { type ProjectFile, makeProject, parseProject, projectFilename, unembedImage } from "./project";

function currentProject(includeImages: boolean): ProjectFile {
  const s = useSettings.getState(), im = useImages.getState();
  return makeProject(s, { photo: im.photo, depth: im.depth }, includeImages);
}

function download(name: string, text: string): void {
  const href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

function remember(p: ProjectFile): void {
  const { images: _images, ...light } = p;
  useLibrary.getState().addRecent({ name: p.name, savedAt: p.savedAt, algorithmId: p.algorithmId, json: JSON.stringify(light) });
}

/** Download the project as JSON (with embedded images) and add it to Recent. Returns the file name. */
export function saveProject(): string {
  const p = currentProject(true), name = projectFilename(p);
  download(name, JSON.stringify(p, null, 1));
  remember(p);
  return name;
}

export function applyProject(p: ProjectFile): void {
  const s = useSettings.getState();
  useSettings.setState({
    projectName: p.name, algorithmId: p.algorithmId, params: { ...s.params, [p.algorithmId]: p.params }, seed: p.seed,
    seedHistory: [], paper: p.paper, profile: p.profile, penWidth: p.penWidth, strokeColor: p.strokeColor, paperColor: p.paperColor,
    optimize: p.optimize, clip: p.clip, ...(p.plotLayers ? { plotLayers: p.plotLayers } : {}),
  });
  useImages.setState({
    photo: p.images?.photo ? unembedImage(p.images.photo) : undefined,
    depth: p.images?.depth ? unembedImage(p.images.depth) : undefined,
    error: undefined,
  });
}

/** Open a project file. Returns an error message, or null on success. */
export async function openProjectFile(file: Blob): Promise<string | null> {
  const r = parseProject(await file.text());
  if ("error" in r) return r.error;
  try { applyProject(r.project); } catch (e) { return `The project's image couldn't be read: ${e instanceof Error ? e.message : String(e)}`; }
  remember(r.project);
  return null;
}

export function openRecent(json: string): string | null {
  const r = parseProject(json);
  if ("error" in r) return r.error;
  applyProject(r.project);
  return null;
}

export function newProject(): void {
  useSettings.getState().newProject();
  useImages.setState({ photo: undefined, depth: undefined, error: undefined });
}

export function duplicateProject(): void {
  const s = useSettings.getState();
  s.setProjectName(`${s.projectName} copy`);
}
