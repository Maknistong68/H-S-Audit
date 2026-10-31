import { LocationProvider, Router, Route } from 'preact-iso';

function Home() {
  return (
    <main class="screen">
      <h1>HSE Audit</h1>
    </main>
  );
}

function NotFound() {
  return (
    <main class="screen">
      <h1>HSE Audit</h1>
      <p>Page not found.</p>
    </main>
  );
}

export function App() {
  return (
    <LocationProvider>
      <Router>
        <Route path="/" component={Home} />
        <Route default component={NotFound} />
      </Router>
    </LocationProvider>
  );
}
