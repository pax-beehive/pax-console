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

/** Complete standalone references reuse local-file links; code stays literal. */
export function remarkVisualizeFiles() {
  return (tree: MarkdownNode, file: { value: unknown }) => {
    const source = String(file.value);
    if (!source.includes("\uE200visualize\uE202")) return;

    function visit(node: MarkdownNode) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (
        node.type === "paragraph" &&
        start !== undefined &&
        end !== undefined
      ) {
        const match = visualizeBlock.exec(source.slice(start, end).trim());
        if (match) {
          const link = visualizeFileLink(match[1]);
          if (link) node.children = [link];
        }
      }
      node.children?.forEach(visit);
    }

    visit(tree);
  };
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
    const href = encodeURI(data.path)
      .replaceAll("#", "%23")
      .replaceAll("?", "%3F");
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
