import { useMemo } from 'preact/hooks';
import type { Answer } from '../../db/db';
import { BAND_LABELS, scoreAudit } from '../../domain/scoring';
import { sentenceCase } from '../../domain/text';
import type { Result } from '../../domain/types';
import { BottomNav } from '../components/BottomNav';
import { ScoreBar, pct } from '../components/ScoreBar';
import { TopBar } from '../components/TopBar';
import { useAudit } from '../hooks/useAudit';
import { useAuditChannel } from '../hooks/useAuditChannel';
import { paths } from '../paths';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function Score({ id }: { id: string }) {
  const view = useAudit(id);
  const { deletedBy } = useAuditChannel(id);
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

  if (view?.audit?.deletedAt !== undefined || deletedBy) {
    return (
      <>
        <TopBar title="Score" back={paths.home()} />
        <main class="screen">
          <p class="empty" role="alert">
            This audit was deleted by {deletedBy ?? 'a teammate'}. Nothing you entered is lost; an admin can restore it. <a href={paths.home()}>Back to audits</a>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Score" back={paths.home()} subtitle={view?.audit?.header.auditNo || 'Untitled audit'} />
      <main class="screen has-nav">
        <section class="panel overall">
          <span class="overall-pct">{pct(score.overall)}</span>
          <span class="overall-band">{score.band ? BAND_LABELS[score.band] : 'No scored answers yet'}</span>
          <span class="muted small">{score.unanswered} unanswered, not counted yet</span>
        </section>

        <section class="panel">
          <div class="score-rows">
            {score.sections.map((section) => (
              <div class="score-section" key={section.id}>
                <ScoreBar id={section.id} label={sentenceCase(section.title)} ratio={section.ratio} detail={`${fmt(section.tally.points)} / ${section.tally.possible}`} />
                {section.subsections
                  .filter((sub) => sub.id !== section.id)
                  .map((sub) => (
                    <ScoreBar key={sub.id} indent id={sub.id} label={sub.title} ratio={sub.ratio} detail={`${fmt(sub.tally.points)} / ${sub.tally.possible}`} />
                  ))}
              </div>
            ))}
          </div>
          <p class="panel-note">Overall is the average of sections A, B and C. Full scores the weight, Partial half of it, No nothing; N/A is left out.</p>
        </section>
      </main>
      <BottomNav auditId={id} />
    </>
  );
}
