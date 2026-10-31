import { LocationProvider, Router, Route } from 'preact-iso';
import { Toast } from './ui/components/Toast';
import { TopBar } from './ui/components/TopBar';
import { paths, routes } from './ui/paths';
import { AuditHeader } from './ui/screens/AuditHeader';
import { Export } from './ui/screens/Export';
import { Findings } from './ui/screens/Findings';
import { Home } from './ui/screens/Home';
import { Score } from './ui/screens/Score';
import { Settings } from './ui/screens/Settings';
import { Walk } from './ui/screens/Walk';

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
        <Route path={routes.settings} component={Settings} />
        <Route default component={NotFound} />
      </Router>
      <Toast />
    </LocationProvider>
  );
}
