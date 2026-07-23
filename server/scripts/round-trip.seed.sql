-- Seed two users + non-expired sessions for the authenticated round-trip.
-- Tokens must match TOKEN_A / TOKEN_B in round-trip.mjs. Idempotent.
INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
  ('rt-user-alice', 'Alice Example', 'alice@roundtrip.test', true, now(), now()),
  ('rt-user-bob',   'Bob Example',   'bob@roundtrip.test',   true, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES
  ('rt-sess-alice', now() + interval '1 day', 'roundtrip-token-alice-0001', now(), now(), 'rt-user-alice'),
  ('rt-sess-bob',   now() + interval '1 day', 'roundtrip-token-bob-0001',   now(), now(), 'rt-user-bob')
ON CONFLICT (id) DO UPDATE SET expires_at = EXCLUDED.expires_at, token = EXCLUDED.token;
