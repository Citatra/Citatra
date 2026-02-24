import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* ─── Section label (small caps above h1) ─── */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="!mt-0 !mb-2 text-sm font-medium text-primary tracking-wide">
      {children}
    </p>
  );
}

/* ─── Subtitle (muted text below h1) ─── */
export function Subtitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="!-mt-0 text-lg text-muted-foreground leading-relaxed">
      {children}
    </p>
  );
}

/* ─── Callout boxes ─── */
const calloutStyles = {
  info: {
    border: "border-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/50",
    heading: "text-blue-800 dark:text-blue-200",
    body: "text-blue-700 dark:text-blue-300",
    icon: "ℹ️",
    label: "Info",
  },
  tip: {
    border: "border-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/50",
    heading: "text-emerald-800 dark:text-emerald-200",
    body: "text-emerald-700 dark:text-emerald-300",
    icon: "💡",
    label: "Tip",
  },
  note: {
    border: "border-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/50",
    heading: "text-amber-800 dark:text-amber-200",
    body: "text-amber-700 dark:text-amber-300",
    icon: "⚠️",
    label: "Note",
  },
} as const;

type CalloutType = keyof typeof calloutStyles;

export function Callout({
  type = "info",
  children,
}: {
  type?: CalloutType;
  children: React.ReactNode;
}) {
  const s = calloutStyles[type];
  return (
    <div
      className={`not-prose my-6 rounded-lg border-l-4 ${s.border} ${s.bg} p-4`}
    >
      <p className={`text-sm font-semibold ${s.heading}`}>
        {s.icon} {s.label}
      </p>
      <div className={`mt-1 text-sm ${s.body} [&_a]:underline [&_a]:font-medium`}>
        {children}
      </div>
    </div>
  );
}

export function Info({ children }: { children: React.ReactNode }) {
  return <Callout type="info">{children}</Callout>;
}
export function Tip({ children }: { children: React.ReactNode }) {
  return <Callout type="tip">{children}</Callout>;
}
export function Note({ children }: { children: React.ReactNode }) {
  return <Callout type="note">{children}</Callout>;
}

/* ─── Prev / Next navigation ─── */
interface NavLink {
  href: string;
  label: string;
}

export function DocsNav({
  prev,
  next,
}: {
  prev?: NavLink;
  next?: NavLink;
}) {
  return (
    <div className="not-prose mt-12 border-t pt-6 flex items-center justify-between text-sm">
      {prev ? (
        <Link
          href={prev.href}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {prev.label}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {next.label}
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

/* ─── Link grid (for index page) ─── */
export function LinkGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose grid grid-cols-1 sm:grid-cols-2 gap-3 my-4">
      {children}
    </div>
  );
}

export function LinkGridItem({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border p-4 hover:border-primary/50 transition-colors"
    >
      <p className="font-semibold text-sm group-hover:text-primary transition-colors">
        {title}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </Link>
  );
}

/* ─── FAQ accordion item ─── */
export function FAQ({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <details className="not-prose group rounded-lg border px-4 py-3 open:pb-4 my-2">
      <summary className="flex cursor-pointer items-center justify-between font-medium text-sm list-none [&::-webkit-details-marker]:hidden">
        {question}
        <svg
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </summary>
      <div className="mt-3 text-sm text-muted-foreground leading-relaxed">
        {children}
      </div>
    </details>
  );
}
