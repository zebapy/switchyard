import { useEffect, useState } from 'react';
import { codeToTokens } from 'shiki';
import type { BundledLanguage, ThemedToken } from 'shiki';

/** Dark theme tuned to the app's warm ember/ink palette. */
const THEME = 'vesper';

/** Skip highlighting past this size — shiki tokenization gets slow on huge files. */
const MAX_HIGHLIGHT_BYTES = 200_000;

/** Map a file extension to a shiki language id. Unknown extensions stay null
 *  so the file renders as plain text instead of erroring. */
const EXT_TO_LANG: Record<string, BundledLanguage> = {
  ts: 'typescript',
  tsx: 'tsx',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'jsonc',
  json5: 'json5',
  rs: 'rust',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  clj: 'clojure',
  scala: 'scala',
  hs: 'haskell',
  ml: 'ocaml',
  zig: 'zig',
  html: 'html',
  htm: 'html',
  vue: 'vue',
  svelte: 'svelte',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  md: 'markdown',
  mdx: 'mdx',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  xml: 'xml',
  svg: 'xml',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  fish: 'fish',
  ps1: 'powershell',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'proto',
  diff: 'diff',
  patch: 'diff',
};

/** Files identified by name rather than extension. */
const NAME_TO_LANG: Record<string, BundledLanguage> = {
  dockerfile: 'docker',
  makefile: 'make',
  '.env': 'dotenv',
};

export function languageForFile(file: string | null): BundledLanguage | null {
  if (!file) return null;
  const base = file.split('/').pop()?.toLowerCase() ?? '';
  if (NAME_TO_LANG[base]) return NAME_TO_LANG[base];
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1);
  return EXT_TO_LANG[ext] ?? null;
}

/** Tokenize file contents into per-line themed tokens for syntax highlighting.
 *  Returns null when the language is unknown, the file is too big, content is
 *  empty, or highlighting fails — callers fall back to plain text. */
export function useHighlightedLines(content: string, file: string | null): ThemedToken[][] | null {
  const lang = languageForFile(file);
  const [lines, setLines] = useState<ThemedToken[][] | null>(null);

  useEffect(() => {
    const skip = !lang || !content || content.length > MAX_HIGHLIGHT_BYTES;
    if (skip) {
      setLines(null);
      return;
    }
    let active = true;
    codeToTokens(content, { lang, theme: THEME })
      .then((result) => active && setLines(result.tokens))
      .catch(() => active && setLines(null));
    return () => {
      active = false;
    };
  }, [content, lang]);

  return lines;
}
