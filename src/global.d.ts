declare module "diff";

declare module "mermaid" {
  const mermaid: {
    initialize(config: Record<string, unknown>): void;
    render(
      id: string,
      text: string,
    ): Promise<{ svg: string }> | { svg: string };
  };

  export default mermaid;
}
