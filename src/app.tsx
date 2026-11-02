import { LocationProvider, Router, Route } from 'preact-iso';
import { AuthGate } from './auth/AuthGate';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { Toast } from './ui/components/Toast';
import { TopBar } from './ui/components/TopBar';
import { paths, routes } from './ui/paths';
import { AuditHeader } from './ui/screens/AuditHeader';
import { Export } from './ui/screens/Export';
import { Findings } from './ui/screens/Findings';
import { Home } from './ui/screens/Home';
import { Reset } from './ui/screens/Reset';
import { Score } from './ui/screens/Score';
import { Settings } from './ui/screens/Settings';
import { SignIn } from './ui/screens/SignIn';
import { Team } from './ui/screens/Team';
import { Walk } from './ui/screens/Walk';
import { Welcome } from './ui/screens/Welcome';

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
      <ErrorBoundary>
        <AuthGate>
          <Router>
            <Route path={routes.signIn} component={SignIn} />
            <Route path={routes.welcome} component={Welcome} />
            <Route path={routes.reset} component={Reset} />
            <Route path={routes.home} component={Home} />
            <Route path={routes.header} component={AuditHeader} />
            <Route path={routes.walk} component={Walk} />
            <Route path={routes.findings} component={Findings} />
            <Route path={routes.score} component={Score} />
            <Route path={routes.export} component={Export} />
            <Route path={routes.settings} component={Settings} />
            <Route path={routes.team} component={Team} />
            <Route default component={NotFound} />
          </Router>
        </AuthGate>
      </ErrorBoundary>
      <Toast />
    </LocationProvider>
  );
}
