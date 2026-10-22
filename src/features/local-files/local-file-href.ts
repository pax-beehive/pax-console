export type LocalFileTarget = {
  path: string;
  line?: number;
  column?: number;
};

// Absolute paths agents commonly emit for files on their own machine. Console
// routes such as /sessions or /artifacts must never match.
const localPathPattern =
  /^(?:[a-zA-Z]:[\\/]|\/(?:Users|home|private|tmp|var|opt|workspace|workspaces|mnt|Volumes)(?:\/|$))/;

const fileSchemePattern = /^file:(\/*)(.*)$/i;
const hashLinePattern = /#L(\d+)(?:C(\d+))?(?:-L?\d+(?:C\d+)?)?$/i;
const colonLinePattern = /:(\d+)(?::(\d+))?$/;

/**
 * Parses an href that points at a file on the agent's machine. Returns the
 * clean absolute path (no `file://`, no line suffix) plus the optional start
 * line/column, or null when the href is not a local file reference.
 */
export function parseLocalFileHref(href: string): LocalFileTarget | null {
  const raw = href.trim();
  if (!raw) {
    return null;
  }

  let line: number | undefined;
  let column: number | undefined;
  let value = raw;

  const hashMatch = hashLinePattern.exec(value);
  if (hashMatch) {
    line = Number(hashMatch[1]);
    column = hashMatch[2] ? Number(hashMatch[2]) : undefined;
    value = value.slice(0, hashMatch.index);
  }

  const fileMatch = fileSchemePattern.exec(value);
  let path: string;
  if (fileMatch) {
    path = pathFromFileUrl(fileMatch[1], fileMatch[2]);
  } else {
    path = safeDecode(value);
    if (!localPathPattern.test(path)) {
      return null;
    }
  }

  if (line === undefined) {
    const colonMatch = colonLinePattern.exec(path);
    // Keep the drive colon of a bare "C:" intact.
    if (colonMatch && colonMatch.index > 2) {
      line = Number(colonMatch[1]);
      column = colonMatch[2] ? Number(colonMatch[2]) : undefined;
      path = path.slice(0, colonMatch.index);
    }
  }

  if (!path) {
    return null;
  }

  return {
    path,
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
  };
}

export function isLocalFileHref(href: string) {
  return parseLocalFileHref(href) !== null;
}

/** True when the value is an absolute local path the console can offer to copy or fetch. */
export function isAbsoluteLocalPath(value: string) {
  return /^(?:\/(?!\/)|[a-zA-Z]:[\\/])/.test(value.trim());
}

function pathFromFileUrl(slashes: string, rest: string) {
  let path: string;
  if (slashes.length === 2) {
    // file://host/path — only an empty host or localhost is local.
    const slashIndex = rest.indexOf("/");
    const host = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
    const remainder = slashIndex === -1 ? "" : rest.slice(slashIndex);
    path =
      host === "" || host.toLowerCase() === "localhost"
        ? remainder
        : `//${rest}`;
  } else {
    path = `/${rest}`;
  }

  path = safeDecode(path);
  // file:///C:/Users/... is a Windows drive path.
  if (/^\/[a-zA-Z]:[\\/]/.test(path)) {
    path = path.slice(1);
  }
  return path;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
