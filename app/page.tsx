'use client'

import Link from 'next/link';
import { useState } from 'react';
import PromptStudy from '@/components/PromptStudy';

type AccessResolveResponse = {
  login_id: string;
  email: string;
  full_name?: string;
  error?: string;
};

export default function Home() {
  const [accessCode, setAccessCode] = useState('');
  const [accessCodeError, setAccessCodeError] = useState('');
  const [isResolvingCode, setIsResolvingCode] = useState(false);
  const [participantLoginId, setParticipantLoginId] = useState('');
  const [participantEmail, setParticipantEmail] = useState('');

  async function handleAccessCodeSubmit() {
    const code = accessCode.trim();
    if (!code) {
      setAccessCodeError('Please enter your access code.');
      return;
    }

    try {
      setIsResolvingCode(true);
      setAccessCodeError('');
      const response = await fetch('/api/study/resolve-access-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_code: code }),
      });
      const json = (await response.json()) as AccessResolveResponse;
      if (!response.ok || !json.login_id) {
        throw new Error(json.error || 'Invalid access code.');
      }
      setParticipantLoginId(json.login_id);
      setParticipantEmail(json.email);
    } catch (error) {
      setAccessCodeError(error instanceof Error ? error.message : 'Could not validate access code.');
    } finally {
      setIsResolvingCode(false);
    }
  }

  if (!participantLoginId) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="access-code-heading">
          <p className="auth-eyebrow">AP Research Experiment</p>
          <h1 id="access-code-heading">Enter your access code</h1>
          <p className="auth-subtext">
            Use the code sent to your email to begin the experiment. Your responses are saved anonymously for research.
          </p>
          <div className="auth-field">
            <label htmlFor="access-code-input">Access code</label>
            <input
              id="access-code-input"
              type="text"
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value);
                setAccessCodeError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleAccessCodeSubmit();
                }
              }}
              placeholder="Example: 7Q4M9K2P"
              autoComplete="off"
              autoFocus
            />
            {accessCodeError ? (
              <p className="auth-error" role="alert">
                {accessCodeError}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void handleAccessCodeSubmit()}
            disabled={isResolvingCode || !accessCode.trim()}
            className="auth-submit"
          >
            {isResolvingCode ? 'Checking code...' : 'Continue to study'}
          </button>
          <p className="auth-footnote">
            Don&apos;t have an accesscode and want to participate?{' '}
            <Link href="/signup">Sign up here</Link>.
          </p>
          <p className="auth-footnote">
            Need to update your availability for PRIME/Study Hall?{' '}
            <Link href="/availability">Update availability here</Link>.
          </p>
        </section>
      </main>
    );
  }

  return (
    <PromptStudy
      participantLoginId={participantLoginId}
      participantEmail={participantEmail || undefined}
    />
  );
}


