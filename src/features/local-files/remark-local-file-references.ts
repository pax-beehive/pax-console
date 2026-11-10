import { parseLocalFileHref } from "./local-file-href";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
  position?: {
    start: { offset?: number };
    end: { offset?: number };
  };
};

const visualizeBlock = /^\uE200visualize\uE202([\s\S]*?)\uE201$/;
const citationPrefix = ":codex-file-citation{";
const citationBlock =
  /^:codex-file-citation\{((?:[^"{}]|"(?:\\.|[^"\\])*")*)\}/;

/** Complete references reuse local-file links; code and link labels stay literal. */
export function remarkLocalFileReferences(this: {
  parse: (source: string) => MarkdownNode;
}) {
  const parse = this.parse.bind(this);
  return (tree: MarkdownNode, file: { value: unknown }) => {
    const source = String(file.value);
    if (
      !source.includes("\uE200visualize\uE202") &&
      !source.includes(citationPrefix)
    )
      return;
    const references: { start: number; end: number; link: MarkdownNode }[] = [];

    function visit(node: MarkdownNode) {
      if (node.type === "link" || node.type === "linkReference") return;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        if (node.type === "paragraph") {
          const match = visualizeBlock.exec(source.slice(start, end).trim());
          const link = match && visualizeFileLink(match[1]);
          if (link) {
            references.push({ start, end, link });
            return;
          }
        }
        if (node.type === "text") {
          for (
            let at = source.indexOf(citationPrefix, start);
            at >= start && at < end;
            at = source.indexOf(citationPrefix, at + citationPrefix.length)
          ) {
            let escapes = 0;
            while (source[at - escapes - 1] === "\\") escapes++;
            if (escapes % 2) continue;
            const match = citationBlock.exec(source.slice(at));
            const path = match && citationPath(match[1]);
            const link = path && fileLink(path);
            if (link)
              references.push({ start: at, end: at + match![0].length, link });
          }
        }
      }
      node.children?.forEach(visit);
    }

    visit(tree);
    if (!references.length) return;

    // Reparse once with plain placeholders so Markdown punctuation inside paths
    // cannot split a directive, while surrounding emphasis/lists/tables survive.
    let prefix = "PAXLOCALFILEREFERENCE";
    while (source.includes(prefix)) prefix += "X";
    const links: MarkdownNode[] = [];
    const chunks: string[] = [];
    let cursor = 0;
    for (const reference of references.sort((a, b) => a.start - b.start)) {
      if (reference.start < cursor) continue;
      chunks.push(
        source.slice(cursor, reference.start),
        `${prefix}${links.length}END`,
      );
      links.push(reference.link);
      cursor = reference.end;
    }
    chunks.push(source.slice(cursor));
    const rewritten = parse(chunks.join(""));
    const placeholder = new RegExp(`${prefix}(\\d+)END`, "g");
    function restore(node: MarkdownNode) {
      node.children = node.children?.flatMap((child) => {
        if (child.type !== "text" || !child.value) {
          restore(child);
          return [child];
        }
        const children: MarkdownNode[] = [];
        let from = 0;
        for (const match of child.value.matchAll(placeholder)) {
          if (match.index > from)
            children.push({
              type: "text",
              value: child.value.slice(from, match.index),
            });
          children.push(links[Number(match[1])]);
          from = match.index + match[0].length;
        }
        if (from === 0) return [child];
        if (from < child.value.length)
          children.push({ type: "text", value: child.value.slice(from) });
        return children;
      });
    }
    restore(rewritten);
    tree.children = rewritten.children;
  };
}

function citationPath(attributes: string): string | undefined {
  const attribute = /\s*([a-z_][\w-]*)\s*=\s*"((?:\\.|[^"\\])*)"\s*/gy;
  const values = new Map<string, string>();
  while (attribute.lastIndex < attributes.length) {
    const match = attribute.exec(attributes);
    if (!match || values.has(match[1])) return;
    values.set(match[1], match[2].replace(/\\(["\\])/g, "$1"));
  }
  return values.get("path");
}

function visualizeFileLink(payload: string): MarkdownNode | undefined {
  try {
    const data: unknown = JSON.parse(payload);
    if (
      !data ||
      typeof data !== "object" ||
      !("path" in data) ||
      typeof data.path !== "string"
    ) {
      return;
    }
    return fileLink(data.path);
  } catch {
    // Incomplete or malformed references remain ordinary Markdown text.
    return;
  }
}

function fileLink(path: string): MarkdownNode | undefined {
  try {
    const href = encodeURI(path).replaceAll("#", "%23").replaceAll("?", "%3F");
    const target = parseLocalFileHref(href);
    if (!target) return;
    return {
      type: "link",
      url: href,
      children: [
        {
          type: "text",
          value: target.path.split(/[\\/]/).pop() || target.path,
        },
      ],
    };
  } catch {
    // Incomplete or malformed references remain ordinary Markdown text.
    return;
  }
}
