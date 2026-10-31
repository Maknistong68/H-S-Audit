import { useLocation } from 'preact-iso';
import { paths } from '../paths';

const icons = {
  walk: 'M4 6h16M4 12h16M4 18h10',
  findings: 'M5 21V4h11l-1 4 1 4H5',
  score: 'M5 20V10M12 20V4M19 20v-7',
  export: 'M12 16V4m0 0l-4 4m4-4l4 4M5 14v6h14v-6',
};

export function BottomNav({ auditId }: { auditId: string }) {
  const { path } = useLocation();
  const items = [
    { key: 'walk', label: 'Walk', href: paths.walk(auditId) },
    { key: 'findings', label: 'Findings', href: paths.findings(auditId) },
    { key: 'score', label: 'Score', href: paths.score(auditId) },
    { key: 'export', label: 'Export', href: paths.export(auditId) },
  ] as const;
  return (
    <nav class="bottom-nav" aria-label="Audit sections">
      {items.map((item) => {
        const active = path === item.href;
        return (
          <a key={item.key} href={item.href} class={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d={icons[item.key]} />
            </svg>
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
