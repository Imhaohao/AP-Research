'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type SignupResponse = {
  ok?: boolean;
  error?: string;
  warning?: string;
  access_code?: string;
  login_id?: string;
};

type LikertKey =
  | 'ai_use_frequency'
  | 'prompt_confidence'
  | 'clear_prompt_understanding'
  | 'ask_final_answers'
  | 'step_by_step_use'
  | 'accuracy_bias_eval'
  | 'responsible_learning_belief';

const likertPrompts: Array<{ key: LikertKey; label: string }> = [
  { key: 'ai_use_frequency', label: 'How often do you use AI tools for schoolwork?' },
  {
    key: 'prompt_confidence',
    label: 'How confident are you with your ability to prompt an engineer with LLMs like Gemini?',
  },
  {
    key: 'clear_prompt_understanding',
    label: 'I understand how to write clear and specific prompts for AI tools.',
  },
  {
    key: 'ask_final_answers',
    label: 'When I use AI, I usually ask for final answers instead of explanations.',
  },
  {
    key: 'step_by_step_use',
    label: 'I use AI to help me think through problems step-by-step.',
  },
  {
    key: 'accuracy_bias_eval',
    label: 'I know how to tell if AI responses are accurate or biased.',
  },
  {
    key: 'responsible_learning_belief',
    label: 'I think AI can help me learn more effectively if used responsibly.',
  },
];

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

function getInPersonSlots(days: Date[]): InPersonSlot[] {
  return days
    .filter((d) => d.getDay() === 3 || d.getDay() === 5)
    .map((d) => {
      const type: InPersonSlot['type'] = d.getDay() === 3 ? 'prime' : 'study_hall';
      return {
        date: toYmd(d),
        label: `${formatDateLabel(d)} (${type === 'prime' ? 'PRIME' : 'Study Hall'})`,
        type,
      };
    });
}

export default function SignupPage() {
  const nextTwoWeeks = useMemo(() => getNextTwoWeeks(), []);
  const inPersonSlots = useMemo(() => getInPersonSlots(nextTwoWeeks), [nextTwoWeeks]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState<SignupResponse | null>(null);
  const [form, setForm] = useState({
    agree: false,
    name: '',
    email: '',
    availability: {
      in_person_interest: '' as '' | 'yes' | 'no',
      in_person_dates: [] as string[],
      after_school_interest: '' as '' | 'yes' | 'no',
      after_school_dates: [] as string[],
    },
    grade: '',
    likert: {
      ai_use_frequency: 0,
      prompt_confidence: 0,
      clear_prompt_understanding: 0,
      ask_final_answers: 0,
      step_by_step_use: 0,
      accuracy_bias_eval: 0,
      responsible_learning_belief: 0,
    },
    free_response: {
      schoolwork_ai_use: '',
      good_prompt_definition: '',
      ai_school_concerns: '',
    },
  });

  const canSubmit = useMemo(() => {
    const selectedInPerson = inPersonSlots.filter((slot) =>
      form.availability.in_person_dates.includes(slot.date)
    );
    const baseFields =
      form.agree &&
      form.name.trim() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
      form.grade;
    const availabilityValid =
      (form.availability.in_person_interest === 'yes' &&
        selectedInPerson.length > 0) ||
      (form.availability.in_person_interest === 'no' &&
        form.availability.after_school_interest === 'yes' &&
        form.availability.after_school_dates.length > 0) ||
      (form.availability.in_person_interest === 'no' &&
        form.availability.after_school_interest === 'no');
    const allLikertAnswered = Object.values(form.likert).every((v) => Number(v) >= 1 && Number(v) <= 5);
    return Boolean(baseFields && availabilityValid && allLikertAnswered && !isSubmitting);
  }, [form, inPersonSlots, isSubmitting]);

  function toggleInPersonDate(date: string) {
    setForm((s) => {
      const exists = s.availability.in_person_dates.includes(date);
      return {
        ...s,
        availability: {
          ...s.availability,
          in_person_dates: exists
            ? s.availability.in_person_dates.filter((d) => d !== date)
            : [...s.availability.in_person_dates, date],
        },
      };
    });
  }

  function toggleAfterSchoolDate(date: string) {
    setForm((s) => {
      const exists = s.availability.after_school_dates.includes(date);
      return {
        ...s,
        availability: {
          ...s.availability,
          after_school_dates: exists
            ? s.availability.after_school_dates.filter((d) => d !== date)
            : [...s.availability.after_school_dates, date],
        },
      };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setSuccess(null);

    try {
      setIsSubmitting(true);
      const response = await fetch('/api/study/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agree: form.agree,
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          availability: {
            in_person_interest: form.availability.in_person_interest,
            in_person_dates: form.availability.in_person_dates,
            after_school_interest: form.availability.after_school_interest,
            after_school_dates: form.availability.after_school_dates,
          },
          grade: form.grade,
          likert: form.likert,
          free_response: {
            schoolwork_ai_use: form.free_response.schoolwork_ai_use.trim(),
            good_prompt_definition: form.free_response.good_prompt_definition.trim(),
            ai_school_concerns: form.free_response.ai_school_concerns.trim(),
          },
        }),
      });
      const json = (await response.json()) as SignupResponse;
      if (!response.ok || !json.ok) {
        throw new Error(json.error || 'Could not submit signup form.');
      }
      setSuccess(json);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not submit signup form.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="signup-shell">
      <section className="signup-card">
        <p className="auth-eyebrow">AP Research Experiment</p>
        <h1>Participant signup</h1>
        <p className="signup-intro">
          Fill out this form to join the experiment. You will receive an email with your unique access code.
        </p>
        <section className="signup-section signup-disclosure" aria-label="Pre-signup disclosure">
          <h2>READ THIS BEFORE CONTINUING:</h2>
          <p>This form will take less than 5 minutes to fill out.</p>

          <h3>What are we studying</h3>
          <p>
            To keep the data unbiased, I can not disclose too much about the study yet, but here&apos;s what I can tell you:
          </p>
          <ol>
            <li>This study may involve the use and education of AI</li>
            <li>
              The study will involve the collection of data and sentiments (but your name and personal identity will stay anonymous)
            </li>
            <li>Be prepared to write and answer some MCQ questions</li>
          </ol>
          <p>We&apos;ll disclose more about the experiment after the fact.</p>

          <h3>Who should participate</h3>
          <ol>
            <li>Palo Alto High School students (9th - 12th grade)</li>
            <li>No prior experience is required (in fact, it&apos;s better if you have zero exposure to AI)</li>
          </ol>

          <h3>Your Privacy</h3>
          <p>
            Your responses are completely anonymous. You may exit the study at any time by editing your response to this form.
          </p>

          <h3>What to Expect</h3>
          <ul>
            <li>Total time: approximately 45-60 minutes during PRIME</li>
            <li>Complete a brief pre-survey about your AI experience</li>
            <li>Review a short educational module (5 minutes)</li>
            <li>Write a brief explanation on an unfamiliar topic</li>
            <li>Complete a post-survey about your experience</li>
          </ul>

          <h3>Raffle Entry</h3>
          <p>
            By signing up and meeting the experiment&apos;s expectations, you may enter a raffle for two free ChatGPT Plus.
          </p>

          <h3>Maximum Entry</h3>
          <p>
            We have a 30 participant limit. We&apos;re doing a first-come-first-serve system, so sign up asap to secure your participation.
          </p>

          <p>
            More about the experiment could be read at the IRB proposal (
            <a
              href="https://docs.google.com/document/d/13ZavfLGUaZ_x46ycLQ3iGgqvjArPxnH2vO_1E77WxR8/edit?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
            >
              link
            </a>
            ).
          </p>

          <h3>PLEASE READ THE HEADING BEFORE CONTINUING</h3>
          <p>
            By selecting agree in the next question, you agree to our survey consent (
            <a
              href="https://docs.google.com/document/d/1J-KfmTafD5WaRwbucBlhxEuGGrNpAUqjPTSFNByQD7g/edit?tab=t.0"
              target="_blank"
              rel="noopener noreferrer"
            >
              form
            </a>
            ) and human consent form (
            <a
              href="https://docs.google.com/document/d/1EYDfO1x-9zf_7F_qSJtD01KaWJXbsYtyJlhrK0fKb9E/edit?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
            >
              form
            </a>
            ).
          </p>
          <p>Some key points to note:</p>
          <ol>
            <li>Remember, you always retain the right to exit the experiment.</li>
            <li>Your information is always confidential.</li>
          </ol>
          <p>
            If you cannot access any documents above, please email{' '}
            <a href="mailto:zy53492@pausd.us">zy53492@pausd.us</a>.
          </p>
        </section>

        {success?.ok ? (
          <div className="signup-success" role="status">
            <h2>Signup submitted</h2>
            <p>Your access code has been generated and emailed.</p>
            <p>
              <strong>Access code:</strong> {success.access_code}
            </p>
            <p>
              <strong>Participant login ID:</strong> {success.login_id}
            </p>
            {success.warning ? <p>{success.warning}</p> : null}
            <p>Use the button below when you are ready to return to the access-code page.</p>
            <Link href="/">Return to access-code page</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="signup-form">
            <div className="signup-grid">
              <div className="auth-field">
                <label htmlFor="signup-name">First and last name</label>
                <input
                  id="signup-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  required
                />
              </div>
              <div className="auth-field">
                <label htmlFor="signup-email">Email address</label>
                <input
                  id="signup-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                  required
                />
              </div>
              <div className="auth-field">
                <label htmlFor="signup-grade">Grade</label>
                <select
                  id="signup-grade"
                  value={form.grade}
                  onChange={(e) => setForm((s) => ({ ...s, grade: e.target.value }))}
                  required
                >
                  <option value="">Select grade</option>
                  <option value="Freshman">Freshman</option>
                  <option value="Sophomore">Sophomore</option>
                  <option value="Junior">Junior</option>
                  <option value="Senior">Senior</option>
                </select>
              </div>
              <fieldset className="signup-fieldset">
                <legend>
                  Will you be available during PRIME or Study Hall (in-person participants have a 2x chance of winning the prize)?
                </legend>
                <label className="signup-inline-option">
                  <input
                    type="radio"
                    name="available-in-person"
                    checked={form.availability.in_person_interest === 'yes'}
                    onChange={() =>
                      setForm((s) => ({
                        ...s,
                        availability: {
                          ...s.availability,
                          in_person_interest: 'yes',
                          after_school_interest: '',
                          after_school_dates: [],
                        },
                      }))
                    }
                  />
                  Yes
                </label>
                <label className="signup-inline-option">
                  <input
                    type="radio"
                    name="available-in-person"
                    checked={form.availability.in_person_interest === 'no'}
                    onChange={() =>
                      setForm((s) => ({
                        ...s,
                        availability: {
                          ...s.availability,
                          in_person_interest: 'no',
                          in_person_dates: [],
                        },
                      }))
                    }
                  />
                  No
                </label>
              </fieldset>
            </div>

            {form.availability.in_person_interest === 'yes' ? (
              <section className="signup-section">
                <h2>Select PRIME / Study Hall slots (next 2 weeks)</h2>
                <p>
                  Study Hall is Friday, PRIME is Wednesday. For PRIME, sign up for HB prime (Samuel
                  Howles-Banerji). Choose all that you can attend in-person.
                </p>
                <div className="availability-chip-grid">
                  {inPersonSlots.map((slot) => (
                    <button
                      type="button"
                      key={slot.date}
                      className={`availability-chip ${
                        form.availability.in_person_dates.includes(slot.date) ? 'active' : ''
                      }`}
                      onClick={() => toggleInPersonDate(slot.date)}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {form.availability.in_person_interest === 'no' ? (
              <section className="signup-section">
                <h2>Can you do the experiment right after school?</h2>
                <p>
                  It takes less than 1 hour. If yes, select all days in the next two weeks when you are free for about 1 hour after school.
                </p>
                <div style={{ marginBottom: '0.8rem' }}>
                  <label className="signup-inline-option">
                    <input
                      type="radio"
                      name="after-school-interest"
                      checked={form.availability.after_school_interest === 'yes'}
                      onChange={() =>
                        setForm((s) => ({
                          ...s,
                          availability: {
                            ...s.availability,
                            after_school_interest: 'yes',
                          },
                        }))
                      }
                    />
                    Yes
                  </label>
                  <label className="signup-inline-option">
                    <input
                      type="radio"
                      name="after-school-interest"
                      checked={form.availability.after_school_interest === 'no'}
                      onChange={() =>
                        setForm((s) => ({
                          ...s,
                          availability: {
                            ...s.availability,
                            after_school_interest: 'no',
                            after_school_dates: [],
                          },
                        }))
                      }
                    />
                    No
                  </label>
                </div>
                {form.availability.after_school_interest === 'yes' ? (
                  <div className="availability-calendar-grid">
                    {nextTwoWeeks.map((d) => {
                      const key = toYmd(d);
                      const active = form.availability.after_school_dates.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`availability-chip ${active ? 'active' : ''}`}
                          onClick={() => toggleAfterSchoolDate(key)}
                        >
                          {formatDateLabel(d)}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {form.availability.after_school_interest === 'no' ? (
                  <p className="signup-note">
                    You can still participate asynchronously. We will label your signup as async.
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="signup-section">
              <h2>Likert scale questions</h2>
              <p>Use 1-5, where 1 = strongly disagree / low and 5 = strongly agree / high.</p>
              {likertPrompts.map((item) => (
                <div key={item.key} className="signup-likert-row">
                  <p>{item.label}</p>
                  <div className="signup-likert-options">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name={item.key}
                          checked={form.likert[item.key] === value}
                          onChange={() =>
                            setForm((s) => ({
                              ...s,
                              likert: {
                                ...s.likert,
                                [item.key]: value,
                              },
                            }))
                          }
                        />
                        <span>{value}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="signup-section">
              <h2>Free response (optional)</h2>
              <div className="auth-field">
                <label htmlFor="free-use">How do you usually use AI in your schoolwork?</label>
                <textarea
                  id="free-use"
                  rows={3}
                  value={form.free_response.schoolwork_ai_use}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      free_response: { ...s.free_response, schoolwork_ai_use: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="auth-field">
                <label htmlFor="free-good-prompt">What makes a good AI prompt?</label>
                <textarea
                  id="free-good-prompt"
                  rows={3}
                  value={form.free_response.good_prompt_definition}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      free_response: { ...s.free_response, good_prompt_definition: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="auth-field">
                <label htmlFor="free-concerns">What concerns do you have about using AI in school?</label>
                <textarea
                  id="free-concerns"
                  rows={3}
                  value={form.free_response.ai_school_concerns}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      free_response: { ...s.free_response, ai_school_concerns: e.target.value },
                    }))
                  }
                />
              </div>
            </section>

            <div className="signup-section">
              <h2>PLEASE READ THE HEADING BEFORE CONTINUING</h2>
              <p>
                By selecting agree in the next question, you agree to our survey consent (
                <a
                  href="https://docs.google.com/document/d/1J-KfmTafD5WaRwbucBlhxEuGGrNpAUqjPTSFNByQD7g/edit?tab=t.0"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  form
                </a>
                ) and human consent form (
                <a
                  href="https://docs.google.com/document/d/1EYDfO1x-9zf_7F_qSJtD01KaWJXbsYtyJlhrK0fKb9E/edit?usp=sharing"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  form
                </a>
                ).
              </p>
              <p>Some key points to note:</p>
              <p>Remember, you always retain the right to exit the experiment.</p>
              <p>Your information is always confidential.</p>
              <p>
                If you cannot access any documents above, please email{' '}
                <a href="mailto:zy53492@pausd.us">zy53492@pausd.us</a>.
              </p>
            </div>

            <label className="signup-consent">
              <input
                type="checkbox"
                checked={form.agree}
                onChange={(e) => setForm((s) => ({ ...s, agree: e.target.checked }))}
              />
              I agree to participate and allow my anonymous responses to be used for this AP Research project.
            </label>

            {errorMessage ? (
              <p className="auth-error" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className="signup-actions">
              <button type="submit" disabled={!canSubmit}>
                {isSubmitting ? 'Submitting...' : 'Submit signup'}
              </button>
              <Link href="/">Back to access-code page</Link>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
