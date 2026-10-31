import type { ComponentChildren } from 'preact';
import { Icon } from './icons';

export function TopBar(props: { title: string; back?: string; subtitle?: string; right?: ComponentChildren }) {
  return (
    <header class="topbar">
      {props.back && (
        <a href={props.back} class="topbar-back" aria-label="Back">
          <Icon name="chevron-left" size={24} />
        </a>
      )}
      <div class={`topbar-titles${props.back ? '' : ' no-back'}`}>
        <h1>{props.title}</h1>
        {props.subtitle && <span class="topbar-subtitle">{props.subtitle}</span>}
      </div>
      <div class="topbar-right">{props.right}</div>
    </header>
  );
}
