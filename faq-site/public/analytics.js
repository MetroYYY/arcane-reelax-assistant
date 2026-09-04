(() => {
  const IDENTITY_KEY = 'arcane_faq_identity_v1';
  const VISITOR_KEY = 'arcane_faq_visitor_v1';
  const SEEN_PREFIX = 'arcane_faq_seen_v1:';

  function decodeIdentity() {
    const match = location.hash.match(/^#arc=([A-Za-z0-9_-]+)$/);
    if (!match) return null;
    try {
      const encoded = match[1].replaceAll('-', '+').replaceAll('_', '/');
      const binary = atob(encoded + '='.repeat((4 - encoded.length % 4) % 4));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const value = JSON.parse(new TextDecoder().decode(bytes));
      return {
        uid: String(value?.uid || '').slice(0, 64),
        name: String(value?.name || '').slice(0, 64),
        version: String(value?.version || '').slice(0, 32),
        source: value?.source === 'assistant' ? 'assistant' : 'direct',
      };
    } catch (_) {
      return null;
    } finally {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function getOrCreate(key, factory) {
    try {
      const current = sessionStorage.getItem(key);
      if (current) return current;
      const value = factory();
      sessionStorage.setItem(key, value);
      return value;
    } catch (_) { return factory(); }
  }

  const incoming = decodeIdentity();
  if (incoming?.uid) {
    try { sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(incoming)); } catch (_) {}
  }
  let identity = {};
  try { identity = JSON.parse(sessionStorage.getItem(IDENTITY_KEY) || '{}'); } catch (_) {}
  const visitorId = getOrCreate(VISITOR_KEY, () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const path = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
  try {
    const seenKey = SEEN_PREFIX + path;
    if (sessionStorage.getItem(seenKey)) return;
    sessionStorage.setItem(seenKey, '1');
  } catch (_) {}

  fetch('/doc-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    keepalive: true,
    body: JSON.stringify({
      visitorId,
      uid: identity.uid || '',
      name: identity.name || '',
      version: identity.version || '',
      path,
      source: identity.uid ? (identity.source || 'assistant') : 'direct',
    }),
  }).catch(() => {});
})();
