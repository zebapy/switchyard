/** A single runnable script extracted from a manifest. */
export interface ScriptEntry {
  name: string;
  command: string;
}

/**
 * A manifest (package.json or pyproject.toml) and the scripts it defines,
 * with the runner detected for executing them. Mirrors the Rust `ScriptSource`.
 */
export interface ScriptSource {
  /** Absolute path to the manifest file. */
  manifest_path: string;
  /** Directory the script runs in (the manifest's parent). */
  dir: string;
  /** Package name from the manifest, or directory basename as a fallback. */
  project_name: string;
  /** "package.json" or "pyproject.toml". */
  manifest: string;
  /** Detected runner: npm | pnpm | yarn | bun | pdm | uv. */
  runner: string;
  /** "js" or "py" — drives the badge colour. */
  lang: string;
  /** Where scripts came from, e.g. "scripts" or "[tool.pdm.scripts]". */
  source: string;
  scripts: ScriptEntry[];
}
