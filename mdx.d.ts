/// <reference types="@next/mdx" />

declare module "*.mdx" {
  import type { Metadata } from "next";

  export const metadata: Metadata;
  export default function MDXContent(props: Record<string, unknown>): JSX.Element;
}
