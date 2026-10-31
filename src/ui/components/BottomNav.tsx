import { useLocation } from 'preact-iso';
import { paths } from '../paths';
import { Icon, type IconName } from './icons';

export function BottomNav({ auditId }: { auditId: string }) {
  const { path } = useLocation();
  const items: { key: string; label: string; href: string; icon: IconName }[] = [
    { key: 'walk', label: 'Walk', href: paths.walk(auditId), icon: 'list' },
    { key: 'findings', label: 'Findings', href: paths.findings(auditId), icon: 'flag' },
    { key: 'score', label: 'Score', href: paths.score(auditId), icon: 'dictate' },
    { key: 'export', label: 'Export', href: paths.export(auditId), icon: 'share' },
  ];
  return (
    <nav class="bottom-nav" aria-label="Audit sections">
      {items.map((item) => {
        const active = path === item.href;
        return (
          <a key={item.key} href={item.href} class={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
