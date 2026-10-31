import type { ComponentChildren } from 'preact';

export function TopBar(props: { title: string; back?: string; subtitle?: string; right?: ComponentChildren }) {
  return (
    <header class="topbar">
      {props.back && (
        <a href={props.back} class="topbar-back" aria-label="Back">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </a>
      )}
      <div class="topbar-titles">
        <h1>{props.title}</h1>
        {props.subtitle && <span class="topbar-subtitle">{props.subtitle}</span>}
      </div>
      <div class="topbar-right">{props.right}</div>
    </header>
  );
}
