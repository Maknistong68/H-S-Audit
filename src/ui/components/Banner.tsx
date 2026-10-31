import type { ComponentChildren } from 'preact';
import { Icon } from './icons';

export function Banner(props: { tone: 'warn' | 'info'; children: ComponentChildren; action?: { label: string; onClick(): void } }) {
  return (
    <div class={`banner banner-${props.tone}`} role={props.tone === 'warn' ? 'alert' : 'status'}>
      <Icon name={props.tone === 'warn' ? 'warning' : 'check'} size={18} />
      <span class="banner-text">{props.children}</span>
      {props.action && (
        <button type="button" class="btn btn-sm" onClick={props.action.onClick}>
          {props.action.label}
        </button>
      )}
    </div>
  );
}
