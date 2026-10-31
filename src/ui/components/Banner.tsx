import type { ComponentChildren } from 'preact';

export function Banner(props: { tone: 'warn' | 'info'; children: ComponentChildren; action?: { label: string; onClick(): void } }) {
  return (
    <div class={`banner banner-${props.tone}`} role={props.tone === 'warn' ? 'alert' : 'status'}>
      <span class="banner-text">{props.children}</span>
      {props.action && (
        <button type="button" class="btn btn-sm" onClick={props.action.onClick}>
          {props.action.label}
        </button>
      )}
    </div>
  );
}
