/** Route patterns and link builders; preact-iso matches the full pathname, so the base path is part of every route. */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export const routes = {
  home: BASE || '/',
  header: `${BASE}/audit/:id/header`,
  walk: `${BASE}/audit/:id/walk`,
  findings: `${BASE}/audit/:id/findings`,
  score: `${BASE}/audit/:id/score`,
  export: `${BASE}/audit/:id/export`,
  settings: `${BASE}/settings`,
};

export const paths = {
  home: () => `${BASE}/`,
  header: (id: string) => `${BASE}/audit/${id}/header`,
  walk: (id: string) => `${BASE}/audit/${id}/walk`,
  findings: (id: string) => `${BASE}/audit/${id}/findings`,
  score: (id: string) => `${BASE}/audit/${id}/score`,
  export: (id: string) => `${BASE}/audit/${id}/export`,
  settings: () => `${BASE}/settings`,
};
