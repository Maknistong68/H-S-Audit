import { LocationProvider, Router, Route } from 'preact-iso';
import { BottomNav } from './ui/components/BottomNav';
import { Toast } from './ui/components/Toast';
import { TopBar } from './ui/components/TopBar';
import { paths, routes } from './ui/paths';
import { AuditHeader } from './ui/screens/AuditHeader';
import { Home } from './ui/screens/Home';

function Placeholder({ id, title }: { id: string; title: string }) {
  return (
    <>
      <TopBar title={title} back={paths.home()} />
      <main class="screen has-nav">
        <p class="empty">{title} is coming in a later step.</p>
      </main>
      <BottomNav auditId={id} />
    </>
  );
}

function SettingsPlaceholder() {
  return (
    <>
      <TopBar title="Settings" back={paths.home()} />
      <main class="screen">
        <p class="empty">Settings are coming in a later step.</p>
      </main>
    </>
  );
}

function NotFound() {
  return (
    <>
      <TopBar title="HSE Audit" />
      <main class="screen">
        <p class="empty">
          Page not found. <a href={paths.home()}>Back to audits</a>
        </p>
      </main>
    </>
  );
}

export function App() {
  return (
    <LocationProvider>
      <Router>
        <Route path={routes.home} component={Home} />
        <Route path={routes.header} component={AuditHeader} />
        <Route path={routes.walk} component={(p: { id: string }) => <Placeholder id={p.id} title="Walk" />} />
        <Route path={routes.findings} component={(p: { id: string }) => <Placeholder id={p.id} title="Findings" />} />
        <Route path={routes.score} component={(p: { id: string }) => <Placeholder id={p.id} title="Score" />} />
        <Route path={routes.export} component={(p: { id: string }) => <Placeholder id={p.id} title="Export" />} />
        <Route path={routes.settings} component={SettingsPlaceholder} />
        <Route default component={NotFound} />
      </Router>
      <Toast />
    </LocationProvider>
  );
}
