import { useMemo } from 'preact/hooks';
import type { Answer } from '../../db/db';
import { BAND_LABELS, scoreAudit } from '../../domain/scoring';
import type { Result } from '../../domain/types';
import { BottomNav } from '../components/BottomNav';
import { ScoreBar, pct } from '../components/ScoreBar';
import { TopBar } from '../components/TopBar';
import { useAudit } from '../hooks/useAudit';
import { paths } from '../paths';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function Score({ id }: { id: string }) {
  const view = useAudit(id);
  const score = useMemo(() => {
    const answers = view?.answers ?? new Map<string, Answer>();
    const results = new Map<string, Result | undefined>();
    for (const [itemId, a] of answers) results.set(itemId, a.result);
    return scoreAudit(results);
  }, [view?.answers]);

  if (view && !view.audit) {
    return (
      <>
        <TopBar title="Score" back={paths.home()} />
        <main class="screen">
          <p class="empty">
            This audit no longer exists. <a href={paths.home()}>Back to audits</a>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Score" back={paths.home()} subtitle={view?.audit?.header.auditNo || 'Untitled audit'} />
      <main class="screen has-nav">
        <section class="card overall-card">
          <span class="overall-pct">{pct(score.overall)}</span>
          <span class="overall-band">{score.band ? BAND_LABELS[score.band] : 'No scored answers yet'}</span>
          <span class="muted">{score.unanswered} unanswered — not counted yet</span>
          <span class="muted small">Overall = average of sections A, B and C. Full = weight, Partial = half, No = 0, N/A excluded.</span>
        </section>

        {score.sections.map((section) => (
          <section class="score-section" key={section.id}>
            <ScoreBar label={`${section.id} · ${section.title}`} ratio={section.ratio} detail={`${fmt(section.tally.points)} / ${section.tally.possible}`} />
            {section.subsections
              .filter((sub) => sub.id !== section.id)
              .map((sub) => (
                <ScoreBar key={sub.id} indent label={`${sub.id} · ${sub.title}`} ratio={sub.ratio} detail={`${fmt(sub.tally.points)} / ${sub.tally.possible}`} />
              ))}
          </section>
        ))}

      </main>
      <BottomNav auditId={id} />
    </>
  );
}
