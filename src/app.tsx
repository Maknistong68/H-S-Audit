import { LocationProvider, Router, Route } from 'preact-iso';
import { BottomNav } from './ui/components/BottomNav';
import { Toast } from './ui/components/Toast';
import { TopBar } from './ui/components/TopBar';
import { paths, routes } from './ui/paths';
import { AuditHeader } from './ui/screens/AuditHeader';
import { Export } from './ui/screens/Export';
import { Findings } from './ui/screens/Findings';
import { Home } from './ui/screens/Home';
import { Score } from './ui/screens/Score';
import { Walk } from './ui/screens/Walk';

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
        <Route path={routes.walk} component={Walk} />
        <Route path={routes.findings} component={Findings} />
        <Route path={routes.score} component={Score} />
        <Route path={routes.export} component={Export} />
        <Route path={routes.settings} component={SettingsPlaceholder} />
        <Route default component={NotFound} />
      </Router>
      <Toast />
    </LocationProvider>
  );
}
