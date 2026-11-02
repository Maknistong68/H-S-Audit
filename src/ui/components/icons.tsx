const PATHS = {
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
  dictate: 'M4 12h2M8 7v10M12 4v16M16 8v8M20 11v2',
  flag: 'M6 21V4h11l-1 4 1 4H6',
  repeat: 'M4 9V7a2 2 0 0 1 2-2h13M17 2l3 3-3 3M20 15v2a2 2 0 0 1-2 2H5M7 22l-3-3 3-3',
  tag: 'M3 12V4h8l9 9-8 8zM7.5 8h.01',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  list: 'M4 6h16M4 12h16M4 18h10',
  jump: 'M4 6h12M4 12h12M4 18h8M19 9v8M16 14l3 3 3-3',
  share: 'M12 16V4m0 0l-4 4m4-4l4 4M5 14v6h14v-6',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l4 4L19 7',
  sync: 'M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4',
  plus: 'M12 5v14M5 12h14',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  import: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  restore: 'M3 12a9 9 0 1 0 3-6.7M3 3v5h5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  warning: 'M12 3l10 18H2zM12 10v4M12 17.5h.01',
  photo: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  next: 'M5 12h14M13 6l6 6-6 6',
  text: 'M4 6h16M4 10h16M4 14h10M4 18h7M17 15l2 3 2-3',
  back: 'M19 12H5M11 18l-6-6 6-6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, class: cls }: { name: IconName; size?: number; class?: string }) {
  return (
    <svg
      class={cls}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
