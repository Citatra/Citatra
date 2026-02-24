import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import {
  SectionLabel,
  Subtitle,
  Info,
  Tip,
  Note,
  Callout,
  DocsNav,
  LinkGrid,
  LinkGridItem,
  FAQ,
} from "@/components/docs/mdx-parts";

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/&/g, "-and-")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extractText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (children && typeof children === "object" && "props" in children) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return extractText((children as any).props.children);
  }
  return "";
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,

    /* ── Element overrides for Profound-style typography ── */
    h1: ({ children }) => (
      <h1 className="text-4xl font-bold tracking-tight mb-2">{children}</h1>
    ),
    h2: ({ children }) => {
      const id = slugify(extractText(children));
      return (
        <h2 id={id} className="scroll-mt-20 text-2xl font-semibold mt-10 mb-4 border-b pb-2">
          {children}
        </h2>
      );
    },
    h3: ({ children }) => {
      const id = slugify(extractText(children));
      return (
        <h3 id={id} className="scroll-mt-20 text-lg font-semibold mt-8 mb-3">
          {children}
        </h3>
      );
    },
    p: ({ children }) => (
      <p className="text-[15px] leading-7 text-muted-foreground mb-4">
        {children}
      </p>
    ),
    a: ({ href, children }) => (
      <Link
        href={href ?? "#"}
        className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
      >
        {children}
      </Link>
    ),
    ul: ({ children }) => (
      <ul className="my-4 ml-6 list-disc space-y-2 text-[15px] text-muted-foreground">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="my-4 ml-6 list-decimal space-y-2 text-[15px] text-muted-foreground">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-7">{children}</li>,
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    code: ({ children }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] font-mono text-foreground">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="my-4 overflow-x-auto rounded-lg bg-muted p-4 text-sm">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="my-6 w-full overflow-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="border-b">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="px-4 py-2 text-left font-semibold text-foreground">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-4 py-2 text-muted-foreground border-b">{children}</td>
    ),
    hr: () => <hr className="my-8 border-border" />,
    blockquote: ({ children }) => (
      <blockquote className="mt-6 border-l-2 pl-6 italic text-muted-foreground">
        {children}
      </blockquote>
    ),

    /* ── Custom MDX components (available without import) ── */
    SectionLabel,
    Subtitle,
    Info,
    Tip,
    Note,
    Callout,
    DocsNav,
    LinkGrid,
    LinkGridItem,
    FAQ,
  };
}
