import type { ReactNode } from 'react'

type PageShellProps = {
  title: string
  description?: string
  meta?: ReactNode
  children?: ReactNode
}

export function PageShell({ title, description, meta, children }: PageShellProps) {
  return (
    <div className="page page-shell">
      <header className="page-shell__header">
        <h1>{title}</h1>
        {description ? <p className="page-shell__desc">{description}</p> : null}
        {meta ? <div className="page-shell__meta">{meta}</div> : null}
      </header>
      <div className="page-shell__body" aria-busy="true" aria-label="Loading placeholder">
        <div className="skeleton skeleton--hero" />
        <div className="skeleton skeleton--line" />
        <div className="skeleton skeleton--line skeleton--line-short" />
        <div className="skeleton skeleton--block" />
      </div>
      {children}
    </div>
  )
}
