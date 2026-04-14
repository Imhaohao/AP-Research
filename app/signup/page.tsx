'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

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

export default function SignupPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState<SignupResponse | null>(null);
  const [form, setForm] = useState({
    agree: false,
    name: '',
    email: '',
    available_prime: false,
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
    const baseFields =
      form.agree &&
      form.name.trim() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
      form.grade;
    const allLikertAnswered = Object.values(form.likert).every((v) => Number(v) >= 1 && Number(v) <= 5);
    return Boolean(baseFields && allLikertAnswered && !isSubmitting);
  }, [form, isSubmitting]);

  useEffect(() => {
    if (!success?.ok) return;
    const timer = window.setTimeout(() => {
      router.push('/');
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [router, success]);

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
          available_prime: form.available_prime,
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
            <p>Redirecting you back to the access-code page...</p>
            <Link href="/">Return now</Link>
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
                <legend>Will you be available during PRIME?</legend>
                <label className="signup-inline-option">
                  <input
                    type="radio"
                    name="available-prime"
                    checked={form.available_prime === true}
                    onChange={() => setForm((s) => ({ ...s, available_prime: true }))}
                  />
                  Yes
                </label>
                <label className="signup-inline-option">
                  <input
                    type="radio"
                    name="available-prime"
                    checked={form.available_prime === false}
                    onChange={() => setForm((s) => ({ ...s, available_prime: false }))}
                  />
                  No
                </label>
              </fieldset>
            </div>

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
