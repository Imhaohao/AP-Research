'use client';

import { useMemo, useState } from 'react';

type AdminStats = {
  participants_total: number;
  results_total: number;
  submissions_last_7_days: number;
  grade_breakdown: Record<string, number>;
  availability_breakdown: Record<string, number>;
  study_group_breakdown: Record<string, number>;
  lottery_breakdown: Record<string, number>;
  likert_averages: Record<string, { total: number; count: number; average: number }>;
};

type Participant = {
  login_id: string;
  access_code: string;
  full_name: string;
  email: string;
  grade: string;
  availability_label: string;
  availability_slots: string[] | null;
  created_at: string;
};

const DEFAULT_ADMIN_CODE = 'Triangle123!.';

export default function AdminPage() {
  const [codeInput, setCodeInput] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [subject, setSubject] = useState('AP Research update');
  const [html, setHtml] = useState(
    `<p>Hi {{first_name}},</p>
<p>This is a reminder to update your availability for the AP Research experiment.</p>
<p>Your access code: <strong>{{access_code}}</strong></p>
<p>Update availability here: <a href="{{availability_url}}">{{availability_url}}</a></p>
<p>Current availability label on file: {{availability_label}}</p>
<p>Thanks!</p>`
  );
  const [sendTarget, setSendTarget] = useState<'all' | 'individual'>('all');
  const [selectedRecipientEmail, setSelectedRecipientEmail] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const isUnlocked = Boolean(adminCode);

  const sortedLikert = useMemo(() => {
    if (!stats?.likert_averages) return [];
    return Object.entries(stats.likert_averages).sort((a, b) => b[1].average - a[1].average);
  }, [stats]);

  const participantOptions = useMemo(() => {
    const unique = new Map<string, Participant>();
    for (const participant of participants) {
      const email = (participant.email || '').trim().toLowerCase();
      if (!email || unique.has(email)) continue;
      unique.set(email, participant);
    }
    return Array.from(unique.values()).sort((a, b) => {
      const aName = (a.full_name || '').trim().toLowerCase();
      const bName = (b.full_name || '').trim().toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [participants]);

  async function readApiResponse(response: Response): Promise<{ json: any | null; text: string | null }> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const json = await response.json();
        return { json, text: null };
      } catch {
        return { json: null, text: null };
      }
    }
    try {
      const text = await response.text();
      return { json: null, text };
    } catch {
      return { json: null, text: null };
    }
  }

  async function loadAdminData(code: string) {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const [statsRes, participantRes] = await Promise.all([
        fetch('/api/admin/stats', { headers: { 'x-admin-code': code } }),
        fetch('/api/admin/participants', { headers: { 'x-admin-code': code } }),
      ]);

      const statsPayload = await readApiResponse(statsRes);
      const participantsPayload = await readApiResponse(participantRes);
      const statsJson = statsPayload.json;
      const participantsJson = participantsPayload.json;

      if (!statsRes.ok) {
        const fallback =
          statsPayload.text && statsPayload.text.includes('<!DOCTYPE')
            ? 'Admin stats API returned HTML (likely not deployed / wrong route).'
            : statsPayload.text || 'Failed to load stats.';
        throw new Error(statsJson?.error || `Failed to load stats (${statsRes.status}). ${fallback}`);
      }
      if (!participantRes.ok) {
        const fallback =
          participantsPayload.text && participantsPayload.text.includes('<!DOCTYPE')
            ? 'Admin participants API returned HTML (likely not deployed / wrong route).'
            : participantsPayload.text || 'Failed to load participants.';
        throw new Error(
          participantsJson?.error || `Failed to load participants (${participantRes.status}). ${fallback}`
        );
      }

      setStats(statsJson as AdminStats);
      setParticipants((participantsJson.participants ?? []) as Participant[]);
      setAdminCode(code);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load admin data.');
      setAdminCode('');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUnlock() {
    const code = codeInput.trim() || DEFAULT_ADMIN_CODE;
    await loadAdminData(code);
  }

  async function handleBroadcastSend() {
    if (!adminCode) return;
    if (sendTarget === 'individual' && !selectedRecipientEmail) {
      setSendMessage('Choose a participant before sending an individual email.');
      return;
    }
    setIsSending(true);
    setSendMessage('');
    try {
      const response = await fetch('/api/admin/send-broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-code': adminCode,
        },
        body: JSON.stringify({
          subject,
          html,
          target: sendTarget,
          recipient_email: sendTarget === 'individual' ? selectedRecipientEmail : undefined,
        }),
      });
      const payload = await readApiResponse(response);
      const json = payload.json;
      if (!response.ok) {
        const fallback =
          payload.text && payload.text.includes('<!DOCTYPE')
            ? 'Broadcast API returned HTML (likely not deployed / wrong route).'
            : payload.text || 'Failed to send broadcast email.';
        throw new Error(json?.error || `Failed to send broadcast email (${response.status}). ${fallback}`);
      }
      setSendMessage(
        `Sent ${json.sent_count}/${json.total_recipients} emails.` +
          (json.failure_count ? ` Failures: ${json.failure_count}.` : '')
      );
    } catch (error) {
      setSendMessage(error instanceof Error ? error.message : 'Failed to send broadcast.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="signup-shell">
      <section className="signup-card">
        <p className="auth-eyebrow">Admin Console</p>
        <h1>Participant admin dashboard</h1>
        {!isUnlocked ? (
          <div className="signup-section">
            <h2>Enter admin access code</h2>
            <div className="auth-field">
              <label htmlFor="admin-code-input">Admin code</label>
              <input
                id="admin-code-input"
                type="password"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="input admin code"
              />
            </div>
            <button type="button" onClick={() => void handleUnlock()} disabled={isLoading}>
              {isLoading ? 'Loading...' : 'Unlock admin console'}
            </button>
            {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
          </div>
        ) : (
          <>
            <section className="signup-section">
              <h2>Trends so far</h2>
              {stats ? (
                <div className="admin-grid">
                  <div className="admin-card">
                    <h3>Totals</h3>
                    <p>Participants: {stats.participants_total}</p>
                    <p>Submissions: {stats.results_total}</p>
                    <p>Last 7 days: {stats.submissions_last_7_days}</p>
                  </div>
                  <div className="admin-card">
                    <h3>Availability</h3>
                    {Object.entries(stats.availability_breakdown).map(([k, v]) => (
                      <p key={k}>
                        {k}: {v}
                      </p>
                    ))}
                  </div>
                  <div className="admin-card">
                    <h3>Grades</h3>
                    {Object.entries(stats.grade_breakdown).map(([k, v]) => (
                      <p key={k}>
                        {k}: {v}
                      </p>
                    ))}
                  </div>
                  <div className="admin-card">
                    <h3>Lottery opt-in</h3>
                    {Object.entries(stats.lottery_breakdown).map(([k, v]) => (
                      <p key={k}>
                        {k}: {v}
                      </p>
                    ))}
                  </div>
                  <div className="admin-card">
                    <h3>Study groups</h3>
                    {Object.entries(stats.study_group_breakdown).map(([k, v]) => (
                      <p key={k}>
                        {k}: {v}
                      </p>
                    ))}
                  </div>
                  <div className="admin-card">
                    <h3>Likert averages</h3>
                    {sortedLikert.map(([k, v]) => (
                      <p key={k}>
                        {k}: {v.average}
                      </p>
                    ))}
                  </div>
                </div>
              ) : (
                <p>Loading trends...</p>
              )}
            </section>

            <section className="signup-section">
              <h2>Email participants</h2>
              <p style={{ marginBottom: '0.5rem' }}>
                You can personalize with: <code>{'{{first_name}}'}</code>, <code>{'{{full_name}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{access_code}}'}</code>, <code>{'{{login_id}}'}</code>, <code>{'{{availability_label}}'}</code>, <code>{'{{availability_slots}}'}</code>, <code>{'{{availability_url}}'}</code>, <code>{'{{app_url}}'}</code>.
              </p>
              <div className="auth-field">
                <label htmlFor="broadcast-target">Send to</label>
                <select
                  id="broadcast-target"
                  value={sendTarget}
                  onChange={(e) => {
                    const nextTarget = e.target.value === 'individual' ? 'individual' : 'all';
                    setSendTarget(nextTarget);
                    if (nextTarget === 'all') setSelectedRecipientEmail('');
                  }}
                >
                  <option value="all">All participants</option>
                  <option value="individual">One participant</option>
                </select>
              </div>
              {sendTarget === 'individual' ? (
                <div className="auth-field">
                  <label htmlFor="broadcast-recipient">Participant</label>
                  <select
                    id="broadcast-recipient"
                    value={selectedRecipientEmail}
                    onChange={(e) => setSelectedRecipientEmail(e.target.value)}
                  >
                    <option value="">Select a participant</option>
                    {participantOptions.map((participant) => (
                      <option key={`${participant.login_id}-${participant.email}`} value={participant.email}>
                        {participant.full_name || participant.email} ({participant.email})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="auth-field">
                <label htmlFor="broadcast-subject">Subject</label>
                <input
                  id="broadcast-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="broadcast-html">Email HTML</label>
                <textarea
                  id="broadcast-html"
                  rows={10}
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                />
              </div>
              <button type="button" onClick={() => void handleBroadcastSend()} disabled={isSending}>
                {isSending
                  ? 'Sending...'
                  : sendTarget === 'individual'
                    ? 'Send to selected participant'
                    : 'Send to all participants'}
              </button>
              {sendMessage ? <p>{sendMessage}</p> : null}
            </section>

            <section className="signup-section">
              <h2>Participants ({participants.length})</h2>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Grade</th>
                      <th>Access Code</th>
                      <th>Availability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={`${p.login_id}-${p.email}`}>
                        <td>{p.full_name}</td>
                        <td>{p.email}</td>
                        <td>{p.grade}</td>
                        <td>{p.access_code}</td>
                        <td>{p.availability_label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
