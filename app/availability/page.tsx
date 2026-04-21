'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type InPersonSlot = {
  date: string;
  label: string;
  type: 'prime' | 'study_hall';
};

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function getNextTwoWeeks(): Date[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i < 14; i += 1) {
    const next = new Date(base);
    next.setDate(base.getDate() + i);
    days.push(next);
  }
  return days;
}

function getCurrentWeekInPersonSlots(): InPersonSlot[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const dayOfWeek = base.getDay(); // Sun=0, Mon=1, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);

  const wednesday = new Date(monday);
  wednesday.setDate(monday.getDate() + 2);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  return [
    {
      date: toYmd(wednesday),
      label: `${formatDateLabel(wednesday)} (Study Hall)`,
      type: 'study_hall',
    },
    {
      date: toYmd(friday),
      label: `${formatDateLabel(friday)} (PRIME)`,
      type: 'prime',
    },
  ];
}

export default function AvailabilityPage() {
  const nextTwoWeeks = useMemo(() => getNextTwoWeeks(), []);
  const inPersonSlots = useMemo(() => getCurrentWeekInPersonSlots(), []);
  const [accessCode, setAccessCode] = useState('');
  const [inPersonInterest, setInPersonInterest] = useState<'' | 'yes' | 'no'>('');
  const [inPersonDates, setInPersonDates] = useState<string[]>([]);
  const [afterSchoolInterest, setAfterSchoolInterest] = useState<'' | 'yes' | 'no'>('');
  const [afterSchoolDates, setAfterSchoolDates] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = useMemo(() => {
    if (!accessCode.trim()) return false;
    if (inPersonInterest === 'yes') return inPersonDates.length > 0;
    if (inPersonInterest === 'no' && afterSchoolInterest === 'yes') return afterSchoolDates.length > 0;
    if (inPersonInterest === 'no' && afterSchoolInterest === 'no') return true;
    return false;
  }, [accessCode, inPersonInterest, inPersonDates, afterSchoolInterest, afterSchoolDates]);

  function toggleDate(list: string[], setList: (next: string[]) => void, date: string) {
    setList(list.includes(date) ? list.filter((d) => d !== date) : [...list, date]);
  }

  async function handleSubmit() {
    setStatusMessage('');
    setIsSaving(true);
    try {
      const response = await fetch('/api/study/update-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_code: accessCode.trim(),
          availability: {
            in_person_interest: inPersonInterest,
            in_person_dates: inPersonDates,
            after_school_interest: afterSchoolInterest,
            after_school_dates: afterSchoolDates,
          },
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Could not save availability.');
      }
      setStatusMessage(`Saved. Label: ${json.availability_label}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not save availability.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="signup-shell">
      <section className="signup-card">
        <p className="auth-eyebrow">AP Research Experiment</p>
        <h1>Availability update</h1>
        <p className="signup-intro">
          Use this page to tell us when you can do the experiment.
        </p>

        <section className="signup-section">
          <div className="auth-field">
            <label htmlFor="availability-access-code">Access code</label>
            <input
              id="availability-access-code"
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="Enter your access code"
            />
          </div>
          <fieldset className="signup-fieldset">
            <legend>
              Will you be available during PRIME or Study Hall (in-person participants have a 2x chance of winning the prize)?
            </legend>
            <label className="signup-inline-option">
              <input
                type="radio"
                name="availability-in-person"
                checked={inPersonInterest === 'yes'}
                onChange={() => {
                  setInPersonInterest('yes');
                  setAfterSchoolInterest('');
                  setAfterSchoolDates([]);
                }}
              />
              Yes
            </label>
            <label className="signup-inline-option">
              <input
                type="radio"
                name="availability-in-person"
                checked={inPersonInterest === 'no'}
                onChange={() => {
                  setInPersonInterest('no');
                  setInPersonDates([]);
                }}
              />
              No
            </label>
          </fieldset>
        </section>

        {inPersonInterest === 'yes' ? (
          <section className="signup-section">
            <h2>Select this week&apos;s PRIME / Study Hall slots</h2>
            <p>
              Study Hall is Wednesday, PRIME is Friday. For PRIME, sign up for HB prime (Samuel
              Howles-Banerji). Choose all that you can attend in-person.
            </p>
            <div className="availability-chip-grid">
              {inPersonSlots.map((slot) => (
                <button
                  type="button"
                  key={slot.date}
                  className={`availability-chip ${inPersonDates.includes(slot.date) ? 'active' : ''}`}
                  onClick={() => toggleDate(inPersonDates, setInPersonDates, slot.date)}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {inPersonInterest === 'no' ? (
          <section className="signup-section">
            <h2>Can you do the experiment right after school?</h2>
            <p>
              It takes less than 1 hour. If yes, select all days in the next two weeks when you are free for about 1 hour after school.
            </p>
            <div style={{ marginBottom: '0.8rem' }}>
              <label className="signup-inline-option">
                <input
                  type="radio"
                  name="availability-after-school"
                  checked={afterSchoolInterest === 'yes'}
                  onChange={() => setAfterSchoolInterest('yes')}
                />
                Yes
              </label>
              <label className="signup-inline-option">
                <input
                  type="radio"
                  name="availability-after-school"
                  checked={afterSchoolInterest === 'no'}
                  onChange={() => {
                    setAfterSchoolInterest('no');
                    setAfterSchoolDates([]);
                  }}
                />
                No
              </label>
            </div>

            {afterSchoolInterest === 'yes' ? (
              <div className="availability-calendar-grid">
                {nextTwoWeeks.map((d) => {
                  const key = toYmd(d);
                  return (
                    <button
                      type="button"
                      key={key}
                      className={`availability-chip ${afterSchoolDates.includes(key) ? 'active' : ''}`}
                      onClick={() => toggleDate(afterSchoolDates, setAfterSchoolDates, key)}
                    >
                      {formatDateLabel(d)}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {afterSchoolInterest === 'no' ? (
              <p className="signup-note">You can still participate asynchronously.</p>
            ) : null}
          </section>
        ) : null}

        <section className="signup-section">
          <button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || isSaving}>
            {isSaving ? 'Saving...' : 'Save availability'}
          </button>
          {statusMessage ? <p>{statusMessage}</p> : null}
          <p style={{ marginTop: '0.7rem' }}>
            <Link href="/">Back to access-code page</Link>
          </p>
        </section>
      </section>
    </main>
  );
}
