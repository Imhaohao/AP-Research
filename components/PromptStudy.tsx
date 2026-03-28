'use client'

import React, { useCallback, useEffect, useRef, useState } from "react";

function formatOpenAiHelperError(message: string): string {
  const m = (message || '').trim();
  if (/quota|billing|insufficient_quota|payment method/i.test(m)) {
    return `${m} — Fix billing or add credits: https://platform.openai.com/account/billing`;
  }
  return m;
}

/**
 * A simple TypeScript React component that guides a student through a
 * quasi‑experimental prompt engineering study. It mirrors the high level
 * structure described in the research proposal: students are randomly
 * assigned to either a control or treatment group, complete a pre‑survey,
 * watch a mini‑module (prompt engineering vs digital literacy), write a
 * short explanation on an unfamiliar topic using AI if they choose, and
 * complete a post‑survey. Results are sent to Supabase when the participant reaches the thank‑you screen.
 */
export default function PromptStudy() {
  type Group = "control" | "treatment";
  type Stage = "consent" | "preSurvey" | "module" | "task" | "postSurvey" | "complete";

  // Randomly assign on first render
  const [group] = useState<Group>(() => {
    return Math.random() < 0.5 ? "control" : "treatment";
  });

  const [stage, setStage] = useState<Stage>("consent");
  const [preResponses, setPreResponses] = useState({
    q1: 0,
    q2: 0,
    q3: 0,
    q4: 0,
    q5: 0,
    open1: "",
    open2: "",
    open3: "",
  });
  const [postResponses, setPostResponses] = useState({
    q1: 0,
    q2: 0,
    q3: 0,
    q4: 0,
    q5: 0,
    open1: "",
    open2: "",
    open3: "",
  });
  const topics = [
    "Why do neutron stars 'glitch'?",
    "How do slime molds solve mazes?",
    "What is the Monty Hall paradox and why is it counterintuitive?",
  ];
  const [taskData, setTaskData] = useState({
    topic: topics[0],
    prompts: "",
    explanation: "",
    usedAi: false,
    editedAi: false,
    verified: false,
    cited: false,
  });
  const [consent, setConsent] = useState(false);
  
  // Practice prompt state (for treatment group)
  const [practicePrompt, setPracticePrompt] = useState({
    role: '',
    context: '',
    task: '',
  });
  const [practiceTries, setPracticeTries] = useState(3);
  const [showPractice, setShowPractice] = useState(false);
  
  // Lottery state
  const [lotteryOptIn, setLotteryOptIn] = useState(false);
  const [participantNumber, setParticipantNumber] = useState('');

  /** Stable id for upserts so lottery updates merge into the same row */
  const [clientSubmissionId] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `study-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  
  // ChatGPT (OpenAI API) writing assistant on the task step
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [openAiMessages, setOpenAiMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [openAiInput, setOpenAiInput] = useState('');
  const [openAiLoading, setOpenAiLoading] = useState(false);
  const [openAiError, setOpenAiError] = useState('');

  const [sessionStartedAt] = useState(() => new Date().toISOString());
  const chatTurnIndexRef = useRef(0);

  /** Optional: opens school Gemini in a new tab only (no iframe) */
  const schoolGeminiUrl = (process.env.NEXT_PUBLIC_SCHOOL_GEMINI_URL ?? '').trim();
  /** If true, hide built-in OpenAI chat (e.g. school uses only their own Gemini link) */
  const schoolGeminiOnly =
    process.env.NEXT_PUBLIC_GEMINI_SCHOOL_ONLY === 'true' ||
    process.env.NEXT_PUBLIC_GEMINI_SCHOOL_ONLY === '1';

  const buildSessionProfile = useCallback((): Record<string, unknown> => {
    return {
      client_submission_id: clientSubmissionId,
      study_group: group,
      session_started_at: sessionStartedAt,
      profile_captured_at: new Date().toISOString(),
      stage,
      task_topic: taskData.topic,
      consent_given: consent,
      school_gemini_link_configured: Boolean(schoolGeminiUrl),
      school_gemini_only_mode: schoolGeminiOnly,
      browser:
        typeof navigator !== 'undefined'
          ? {
              language: navigator.language,
              userAgent: navigator.userAgent,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }
          : null,
    };
  }, [
    clientSubmissionId,
    group,
    sessionStartedAt,
    stage,
    taskData.topic,
    consent,
    schoolGeminiUrl,
    schoolGeminiOnly,
  ]);

  const flushSubmission = useCallback(async () => {
    setSaveStatus('saving');
    setSaveMessage('');
    const data: Record<string, unknown> = {
      consent,
      pre_responses: preResponses,
      post_responses: postResponses,
      task_data: taskData,
      practice_prompt: practicePrompt,
      practice_tries: practiceTries,
      show_practice_panel: showPractice,
      lottery_opt_in: lotteryOptIn,
      participant_number: participantNumber.trim() || null,
      open_ai_messages: openAiMessages,
      session_profile: buildSessionProfile(),
      meta: {
        school_gemini_link_configured: Boolean(schoolGeminiUrl),
        school_gemini_only_mode: schoolGeminiOnly,
      },
    };
    try {
      const res = await fetch('/api/study/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_submission_id: clientSubmissionId,
          study_group: group,
          data,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || `Save failed (${res.status})`);
      }
      setSaveStatus('saved');
      setSaveMessage('Responses saved for the research team.');
    } catch (e) {
      setSaveStatus('error');
      setSaveMessage(e instanceof Error ? e.message : 'Could not save.');
    }
  }, [
    clientSubmissionId,
    group,
    consent,
    preResponses,
    postResponses,
    taskData,
    practicePrompt,
    practiceTries,
    showPractice,
    lotteryOptIn,
    participantNumber,
    openAiMessages,
    schoolGeminiUrl,
    schoolGeminiOnly,
    buildSessionProfile,
  ]);

  useEffect(() => {
    if (stage !== 'complete') return;
    const t = window.setTimeout(() => {
      void flushSubmission();
    }, 300);
    return () => clearTimeout(t);
  }, [stage, flushSubmission]);

  // Get current step index for progress bar
  const stages: Stage[] = ["consent", "preSurvey", "module", "task", "postSurvey", "complete"];
  const currentStep = stages.indexOf(stage);

  function renderProgressBar() {
    return (
      <div className="lms-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#666' }}>Progress</span>
          <span style={{ fontSize: '0.875rem', color: '#1a5490', fontWeight: '600' }}>
            Step {currentStep + 1} of {stages.length - 1}
          </span>
        </div>
        <div className="progress-bar">
          {stages.slice(0, -1).map((s, index) => (
            <div key={s} style={{ flex: 1 }}>
              <div className={`progress-step ${index <= currentStep ? 'active' : ''}`} />
              <div className="progress-step-label">
                {index === 0 && 'Consent'}
                {index === 1 && 'Pre-Survey'}
                {index === 2 && 'Module'}
                {index === 3 && 'Task'}
                {index === 4 && 'Post-Survey'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderConsent() {
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2>Welcome to the Prompt Engineering Study</h2>
          <p>
            This activity explores how students can learn to communicate better with AI tools like ChatGPT. 
            Your participation will help us understand effective teaching strategies for AI literacy.
          </p>
          
          <h3>What to Expect</h3>
          <ul>
            <li>Complete a brief pre-survey about your AI experience</li>
            <li>Review a short educational module (5 minutes)</li>
            <li>Write a brief explanation on an unfamiliar topic</li>
            <li>Complete a post-survey about your experience</li>
            <li>Total time: approximately 45-60 minutes</li>
          </ul>

          <h3>Your Privacy</h3>
          <p>Your responses are completely anonymous. You may exit the study at any time by closing this window.</p>

          <div className="form-group" style={{ background: '#fff3cd', borderLeftColor: '#ffc107' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginRight: '0.75rem', cursor: 'pointer' }}
              />
              <span>I am at least 14 years old and consent to anonymous participation in this research study.</span>
            </label>
          </div>

          <button
            disabled={!consent}
            onClick={() => setStage("preSurvey")}
            style={{ marginTop: '1rem' }}
          >
            Begin Study
          </button>
        </div>
      </div>
    );
  }

  function renderLikert(value: number, onChange: (v: number) => void, name: string) {
    return (
      <div className="likert-scale">
        {[1, 2, 3, 4, 5].map((val) => (
          <div key={val} className="likert-option">
            <label htmlFor={`${name}-${val}`}>
              <input
                id={`${name}-${val}`}
                name={name}
                type="radio"
                value={val}
                checked={value === val}
                onChange={() => onChange(val)}
              />
              <span>{val}</span>
            </label>
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.875rem', color: '#666' }}>
          {value === 0 && '(Please select)'}
        </span>
      </div>
    );
  }

  function renderPreSurvey() {
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2>Pre-Survey</h2>
          <p>Please rate your agreement with each statement using the scale below (1 = Strongly Disagree, 5 = Strongly Agree).</p>
          
          <div className="form-group">
            <label>
              <strong>I understand how to write clear and specific prompts for AI tools.</strong>
              {renderLikert(preResponses.q1, (v) => setPreResponses({ ...preResponses, q1: v }), "pre-q1")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>When I use AI, I usually ask for final answers instead of explanations.</strong>
              {renderLikert(preResponses.q2, (v) => setPreResponses({ ...preResponses, q2: v }), "pre-q2")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>I use AI to help me think through problems step‑by‑step.</strong>
              {renderLikert(preResponses.q3, (v) => setPreResponses({ ...preResponses, q3: v }), "pre-q3")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>I know how to tell if AI responses are accurate or biased.</strong>
              {renderLikert(preResponses.q4, (v) => setPreResponses({ ...preResponses, q4: v }), "pre-q4")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>I think AI can help me learn more effectively if used responsibly.</strong>
              {renderLikert(preResponses.q5, (v) => setPreResponses({ ...preResponses, q5: v }), "pre-q5")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>How do you usually use AI tools in your schoolwork?</strong>
              <textarea
                value={preResponses.open1}
                onChange={(e) => setPreResponses({ ...preResponses, open1: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>What makes a "good" AI prompt?</strong>
              <textarea
                value={preResponses.open2}
                onChange={(e) => setPreResponses({ ...preResponses, open2: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>What concerns do you have about using AI in school?</strong>
              <textarea
                value={preResponses.open3}
                onChange={(e) => setPreResponses({ ...preResponses, open3: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <button onClick={() => setStage("module")}>
            Continue to Module
          </button>
        </div>
      </div>
    );
  }

  function renderModule() {
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2>{group === "treatment" ? "Prompt Engineering Mini‑Course" : "Digital Literacy Module"}</h2>
          {group === "treatment" ? (
            <>
              <p style={{ fontSize: '1.1rem', fontWeight: '500', marginBottom: '1.5rem' }}>
                Welcome! This module introduces prompt engineering: the art and science of crafting effective prompts to get better results from AI tools.
              </p>

              <h3>📐 The Role-Context-Task Framework</h3>
              <p>Effective prompts are structured using three key components:</p>
              
              <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem', marginBottom: '2rem' }}>
                <div style={{ padding: '1.25rem', background: '#e3f2fd', borderRadius: '8px', borderLeft: '4px solid #1a5490' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong style={{ color: '#1a5490', fontSize: '1.1rem' }}>Role</strong>
                    <span className="info-badge">Who is the AI?</span>
                  </div>
                  <p style={{ margin: '0.5rem 0 0.75rem 0' }}>Define the persona or expertise the AI should adopt.</p>
                  <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '2px solid #1a5490' }}>
                    <code>You are a journalist.</code>
                  </div>
                </div>

                <div style={{ padding: '1.25rem', background: '#f3e5f5', borderRadius: '8px', borderLeft: '4px solid #7b1fa2' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong style={{ color: '#7b1fa2', fontSize: '1.1rem' }}>Context</strong>
                    <span className="info-badge" style={{ background: '#f0e8f5', color: '#7b1fa2' }}>What's the situation?</span>
                  </div>
                  <p style={{ margin: '0.5rem 0 0.75rem 0' }}>Provide background information or the setting.</p>
                  <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '2px solid #7b1fa2' }}>
                    <code>There is a mental health crisis in the country.</code>
                  </div>
                </div>

                <div style={{ padding: '1.25rem', background: '#e8f5e9', borderRadius: '8px', borderLeft: '4px solid #388e3c' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong style={{ color: '#388e3c', fontSize: '1.1rem' }}>Task</strong>
                    <span className="info-badge" style={{ background: '#e8f5e9', color: '#388e3c' }}>What to do?</span>
                  </div>
                  <p style={{ margin: '0.5rem 0 0.75rem 0' }}>Clearly state what you want the AI to produce.</p>
                  <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '2px solid #388e3c' }}>
                    <code>Write an article for awareness.</code>
                  </div>
                </div>
              </div>

              <h3>🔄 Contrasting Cases: Learning by Comparison</h3>
              <p>When you use AI, it can generate multiple different responses. Each version may emphasize different aspects, use different vocabulary, or approach the topic from a different angle.</p>
              
              <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: '#fff9e6', borderRadius: '8px', border: '2px solid #ffc107' }}>
                <strong style={{ color: '#f57c00' }}>💡 Why This Matters:</strong>
                <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                  Comparing multiple responses helps you understand what makes a response effective. 
                  You'll learn to evaluate tone, clarity, completeness, and appropriateness—skills that transfer to your own writing!
                </p>
              </div>

              <h3 style={{ marginTop: '2rem' }}>⚡ Mindful AI Usage: Environmental Impact</h3>
              <div style={{ marginTop: '1rem', padding: '1.5rem', background: '#fff3e0', borderRadius: '8px', borderLeft: '4px solid #f57c00' }}>
                <p style={{ fontWeight: '500', marginBottom: '1rem' }}>
                  <strong>Did you know?</strong> AI technologies require significant energy and computational resources.
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                  <li>Training large AI models consumes substantial electricity</li>
                  <li>Each AI generation has an environmental cost</li>
                  <li>Being intentional reduces waste and teaches responsibility</li>
                </ul>
              </div>
              <p style={{ marginTop: '1rem', fontStyle: 'italic' }}>
                That's why we encourage you to <strong>pause and reflect</strong> between generations, 
                carefully consider your prompts, and use AI as a learning tool rather than a quick-answer generator.
              </p>

              <h3 style={{ marginTop: '2rem' }}>🎯 Best Practices</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                <div style={{ padding: '1rem', background: '#ffffff', border: '2px solid #e0e0e0', borderRadius: '6px' }}>
                  <strong style={{ color: '#e53935' }}>❌ Avoid:</strong>
                  <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>"Tell me about photosynthesis"</p>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>Too vague, unclear purpose</p>
                </div>
                <div style={{ padding: '1rem', background: '#ffffff', border: '2px solid #4caf50', borderRadius: '6px' }}>
                  <strong style={{ color: '#388e3c' }}>✅ Good:</strong>
                  <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>"Explain photosynthesis to a 9th grader using analogies and step-by-step how plants convert sunlight into energy"</p>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>Clear role (teacher), context (9th grader), task (explain)</p>
                </div>
              </div>

              <h3 style={{ marginTop: '2rem' }}>🧠 Remember: You're in Control</h3>
              <p>
                AI is a tool—powerful but not perfect. Your role is to <strong>think critically</strong> about responses, 
                <strong> verify information</strong> when needed, and use AI to enhance your learning rather than replace it.
              </p>
              <p style={{ marginTop: '0.5rem' }}>
                The best prompts come from taking time to think about what you really want to learn, not just getting a quick answer.
              </p>

              {!showPractice ? (
                <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#e3f2fd', borderRadius: '8px', border: '2px solid #1a5490', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 1rem 0', fontWeight: '500' }}>
                    💡 Want to try it out?
                  </p>
                  <button onClick={() => setShowPractice(true)} className="button-secondary">
                    Open Interactive Practice
                  </button>
                  <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666' }}>
                    Or continue to the writing task to apply these principles.
                  </p>
                </div>
              ) : (
                <div style={{ marginTop: '2rem' }}>
                  <div style={{ padding: '1rem', background: '#e3f2fd', borderRadius: '8px', borderLeft: '4px solid #1a5490', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>Tries Available: </strong>
                        {[...Array(practiceTries)].map((_, i) => (
                          <span key={i} style={{ fontSize: '1.2rem', color: '#1a5490' }}>🅱</span>
                        ))}
                      </div>
                      <button onClick={() => setShowPractice(false)} style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                        Close Practice
                      </button>
                    </div>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
                      AI technologies require significant energy. Be mindful and intentional with each generation.
                    </p>
                  </div>

                  <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ padding: '1.25rem', background: '#e3f2fd', borderRadius: '8px' }}>
                      <label>
                        <strong style={{ color: '#1a5490' }}>Role:</strong>
                        <input
                          type="text"
                          value={practicePrompt.role}
                          onChange={(e) => setPracticePrompt({ ...practicePrompt, role: e.target.value })}
                          placeholder="e.g., You are a teacher..."
                          style={{ marginTop: '0.5rem' }}
                        />
                      </label>
                    </div>

                    <div style={{ padding: '1.25rem', background: '#f3e5f5', borderRadius: '8px' }}>
                      <label>
                        <strong style={{ color: '#7b1fa2' }}>Context:</strong>
                        <textarea
                          value={practicePrompt.context}
                          onChange={(e) => setPracticePrompt({ ...practicePrompt, context: e.target.value })}
                          placeholder="e.g., Students are learning about climate change..."
                          rows={3}
                          style={{ marginTop: '0.5rem' }}
                        />
                      </label>
                    </div>

                    <div style={{ padding: '1.25rem', background: '#e8f5e9', borderRadius: '8px' }}>
                      <label>
                        <strong style={{ color: '#388e3c' }}>Task:</strong>
                        <input
                          type="text"
                          value={practicePrompt.task}
                          onChange={(e) => setPracticePrompt({ ...practicePrompt, task: e.target.value })}
                          placeholder="e.g., Create an engaging lesson plan..."
                          style={{ marginTop: '0.5rem' }}
                        />
                      </label>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      if (practiceTries > 0) {
                        setPracticeTries(practiceTries - 1);
                        // In a real app, this would call OpenAI API
                        // For demo, we'll just show a success message
                        alert('Prompt submitted! In the real Prompty tool, this would generate 3 contrasting responses for you to compare.');
                      }
                    }}
                    disabled={practiceTries === 0 || !practicePrompt.role || !practicePrompt.context || !practicePrompt.task}
                    style={{ width: '100%' }}
                  >
                    {practiceTries === 0 ? 'No tries remaining' : 'Generate Responses (uses 1 try)'}
                  </button>

                  {practiceTries === 0 && (
                    <p style={{ marginTop: '1rem', textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
                      You've used all your tries. This limitation encourages intentional usage and reflection. 
                      Ready to apply what you've learned to the writing task?
                    </p>
                  )}
                </div>
              )}

              {!showPractice && (
                <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#e8f5e9', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontWeight: '500' }}>
                    🎓 Ready to continue! In the next section, you'll apply these principles to write your own explanation.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <p>This brief lesson focuses on digital literacy: evaluating the credibility of online sources and avoiding plagiarism.</p>
              
              <h3>Key Principles</h3>
              <ul>
                <li><strong>Check sources</strong>: Always verify information with trusted references.</li>
                <li><strong>Avoid copy/paste</strong>: Use your own words and cite when using external ideas.</li>
                <li><strong>Be critical</strong>: Ask who authored the information and for what purpose.</li>
              </ul>

              <h3>Example</h3>
              <p>When evaluating online information, check multiple sources, look for author credentials, and consider the publication date.</p>
            </>
          )}
          
          {!showPractice && (
            <button onClick={() => setStage("task")} style={{ marginTop: '1.5rem' }}>
              Start Writing Task →
            </button>
          )}
        </div>
      </div>
    );
  }

  async function handleOpenAiMessage() {
    if (!openAiInput.trim()) {
      return;
    }

    const userMessage = openAiInput.trim();
    setOpenAiInput('');
    setOpenAiLoading(true);
    setOpenAiError('');

    const newMessages = [...openAiMessages, { role: 'user' as const, content: userMessage }];
    setOpenAiMessages(newMessages);

    try {
      const systemPrompt = `You are a helpful writing assistant helping a student write a 200-250 word explanation for a 9th-grade student about: "${taskData.topic}".

Your role is to:
- Help them brainstorm ideas and structure their explanation
- Provide guidance on clarity and age-appropriateness
- Suggest ways to explain complex concepts simply
- Encourage critical thinking and learning

Do NOT write the explanation for them. Instead, guide them with questions, suggestions, and feedback.`;

      const transcript = newMessages
        .map((m) => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
      const fullPrompt = `${systemPrompt}\n\nConversation:\n${transcript}`;

      const response = await fetch('/api/llm/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          apiKey: openAiApiKey.trim() || undefined,
        }),
      });

      const data = (await response.json()) as {
        response?: string;
        model?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          formatOpenAiHelperError(String(data.error || 'Failed to get response from ChatGPT'))
        );
      }

      const assistantText = data.response ?? '';
      setOpenAiMessages([...newMessages, { role: 'assistant' as const, content: assistantText }]);

      chatTurnIndexRef.current += 1;
      void fetch('/api/study/log-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_submission_id: clientSubmissionId,
          study_group: group,
          turn_index: chatTurnIndexRef.current,
          session_profile: buildSessionProfile(),
          user_message: userMessage,
          full_prompt: fullPrompt,
          assistant_response: assistantText,
          model: data.model ?? null,
        }),
      }).catch(() => {});

      if (!taskData.usedAi) {
        setTaskData({ ...taskData, usedAi: true });
      }
    } catch (error) {
      setOpenAiError(
        formatOpenAiHelperError(
          error instanceof Error ? error.message : 'An error occurred'
        )
      );
      setOpenAiMessages(openAiMessages);
    } finally {
      setOpenAiLoading(false);
    }
  }

  function renderTask() {
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2>Writing Task</h2>
          <p>Select a topic below and write a 200–250 word explanation for a 9th‑grade student. You may use AI, but you must disclose how you used it.</p>

          {schoolGeminiUrl ? (
            <div
              style={{
                marginTop: '1.5rem',
                marginBottom: '1.5rem',
                padding: '1.25rem',
                background: '#f0f7ff',
                borderRadius: '8px',
                border: '2px solid #1a5490',
              }}
            >
              <h3 style={{ margin: '0 0 0.5rem', color: '#1a5490', fontSize: '1.05rem' }}>School Gemini (optional)</h3>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#333' }}>
                If your class uses Google&apos;s Gemini in the browser, open it in a new tab with your school account.
              </p>
              <a
                href={schoolGeminiUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '0.5rem 1rem',
                  background: '#1a5490',
                  color: '#fff',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                }}
              >
                Open school Gemini in a new tab
              </a>
            </div>
          ) : null}

          {schoolGeminiOnly && !schoolGeminiUrl ? (
            <div
              role="alert"
              style={{
                marginTop: '1rem',
                padding: '1rem',
                background: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '8px',
                marginBottom: '1rem',
                fontSize: '0.9rem',
              }}
            >
              <strong>School Gemini URL not configured.</strong> Ask your teacher to set{' '}
              <code>NEXT_PUBLIC_SCHOOL_GEMINI_URL</code> in the app environment, or set{' '}
              <code>NEXT_PUBLIC_GEMINI_SCHOOL_ONLY=false</code> to use the built-in ChatGPT assistant instead.
            </div>
          ) : null}

          {!schoolGeminiOnly && (
            <div
              style={{
                marginTop: '1.5rem',
                marginBottom: '1.5rem',
                padding: '1.5rem',
                background: '#f6faf8',
                borderRadius: '8px',
                border: '2px solid #10a37f',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1.5rem', marginRight: '0.5rem' }}>🤖</span>
                <h3 style={{ margin: 0, color: '#0d8f6e' }}>ChatGPT writing assistant</h3>
              </div>
              <p style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>
                Ask for brainstorming, structure, and feedback. The model is instructed not to write your explanation for you — only to
                guide you. Think critically about any suggestions.
              </p>

              <div className="form-group" style={{ background: '#ffffff', borderLeftColor: '#10a37f', marginBottom: '1rem' }}>
                <label>
                  <strong>OpenAI API key (optional):</strong>
                  <input
                    type="password"
                    value={openAiApiKey}
                    onChange={(e) => setOpenAiApiKey(e.target.value)}
                    placeholder="sk-... — leave blank if the server has OPENAI_API_KEY set"
                    style={{ marginTop: '0.5rem' }}
                  />
                  <small style={{ display: 'block', marginTop: '0.25rem', color: '#666', fontSize: '0.875rem' }}>
                    Used only in this browser session unless your teacher configured a server key.
                  </small>
                </label>
              </div>

              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0',
                  maxHeight: '400px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    padding: '1rem',
                    borderBottom: '1px solid #e0e0e0',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    flex: 1,
                  }}
                >
                  {openAiMessages.length === 0 ? (
                    <p style={{ color: '#666', fontStyle: 'italic', textAlign: 'center', margin: '2rem 0' }}>
                      Start a conversation. Your topic is used in the instructions sent with each message.
                    </p>
                  ) : (
                    openAiMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginBottom: '1rem',
                          padding: '0.75rem',
                          background: msg.role === 'user' ? '#e8f7f2' : '#f5f5f5',
                          borderRadius: '6px',
                          borderLeft: `3px solid ${msg.role === 'user' ? '#10a37f' : '#666'}`,
                        }}
                      >
                        <strong style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#666' }}>
                          {msg.role === 'user' ? 'You' : 'ChatGPT'}
                        </strong>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg.content}</div>
                      </div>
                    ))
                  )}
                  {openAiLoading && (
                    <div style={{ padding: '0.75rem', color: '#666', fontStyle: 'italic' }}>ChatGPT is thinking...</div>
                  )}
                </div>

                {openAiError && (
                  <div
                    style={{
                      padding: '0.75rem',
                      background: '#ffebee',
                      color: '#c62828',
                      borderTop: '1px solid #e0e0e0',
                      fontSize: '0.875rem',
                    }}
                  >
                    Error: {openAiError}
                  </div>
                )}

                <div
                  style={{
                    padding: '0.75rem',
                    borderTop: '1px solid #e0e0e0',
                    display: 'flex',
                    gap: '0.5rem',
                  }}
                >
                  <textarea
                    value={openAiInput}
                    onChange={(e) => setOpenAiInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleOpenAiMessage();
                      }
                    }}
                    placeholder="Ask for help with your explanation..."
                    rows={2}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      resize: 'none',
                      fontFamily: 'inherit',
                    }}
                    disabled={openAiLoading}
                  />
                  <button
                    onClick={handleOpenAiMessage}
                    disabled={openAiLoading || !openAiInput.trim()}
                    style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}
                  >
                    {openAiLoading ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="form-group">
            <label>
              <strong>Select Topic:</strong>
              <select
                value={taskData.topic}
                onChange={(e) => setTaskData({ ...taskData, topic: e.target.value })}
              >
                {topics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>Prompt(s) used (if any):</strong>
              <textarea
                value={taskData.prompts}
                onChange={(e) => setTaskData({ ...taskData, prompts: e.target.value })}
                rows={3}
                placeholder="Paste any prompts you used with AI tools here..."
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>Your explanation (200–250 words):</strong>
              <textarea
                value={taskData.explanation}
                onChange={(e) => setTaskData({ ...taskData, explanation: e.target.value })}
                rows={8}
                placeholder="Write your explanation here..."
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>AI Use Disclosure:</strong>
            </label>
            <div className="checkbox-group">
              <div className="checkbox-item">
                <label style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={taskData.usedAi}
                    onChange={(e) => setTaskData({ ...taskData, usedAi: e.target.checked })}
                  />
                  I used AI tools for brainstorming or drafting
                </label>
              </div>
              <div className="checkbox-item">
                <label style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={taskData.editedAi}
                    onChange={(e) => setTaskData({ ...taskData, editedAi: e.target.checked })}
                  />
                  I edited and rewrote AI text in my own words
                </label>
              </div>
              <div className="checkbox-item">
                <label style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={taskData.verified}
                    onChange={(e) => setTaskData({ ...taskData, verified: e.target.checked })}
                  />
                  I verified AI information with another source
                </label>
              </div>
              <div className="checkbox-item">
                <label style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={taskData.cited}
                    onChange={(e) => setTaskData({ ...taskData, cited: e.target.checked })}
                  />
                  I cited or acknowledged AI assistance
                </label>
              </div>
            </div>
          </div>

          <button onClick={() => setStage("postSurvey")}>
            Continue to Post‑Survey →
          </button>
        </div>
      </div>
    );
  }

  function renderPostSurvey() {
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2>Post‑Survey</h2>
          <p>Please rate your agreement with each statement about your AI use in this activity (1=Strongly Disagree, 5=Strongly Agree).</p>

          <div className="form-group">
            <label>
              <strong>I feel more confident writing effective AI prompts.</strong>
              {renderLikert(postResponses.q1, (v) => setPostResponses({ ...postResponses, q1: v }), "post-q1")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>I now ask AI for explanations or reasoning rather than just answers.</strong>
              {renderLikert(postResponses.q2, (v) => setPostResponses({ ...postResponses, q2: v }), "post-q2")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>The activity helped me understand how to learn with AI more effectively.</strong>
              {renderLikert(postResponses.q3, (v) => setPostResponses({ ...postResponses, q3: v }), "post-q3")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>I now think more critically about AI responses.</strong>
              {renderLikert(postResponses.q4, (v) => setPostResponses({ ...postResponses, q4: v }), "post-q4")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>I understand how to use AI ethically for schoolwork.</strong>
              {renderLikert(postResponses.q5, (v) => setPostResponses({ ...postResponses, q5: v }), "post-q5")}
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>Describe one example of how you changed your prompting after this activity.</strong>
              <textarea
                value={postResponses.open1}
                onChange={(e) => setPostResponses({ ...postResponses, open1: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>How did this lesson change the way you approach learning or writing?</strong>
              <textarea
                value={postResponses.open2}
                onChange={(e) => setPostResponses({ ...postResponses, open2: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              <strong>Do you think all students should learn prompt engineering? Why or why not?</strong>
              <textarea
                value={postResponses.open3}
                onChange={(e) => setPostResponses({ ...postResponses, open3: e.target.value })}
                rows={3}
              />
            </label>
          </div>

          <button onClick={() => setStage("complete")}>
            Complete Study →
          </button>
        </div>
      </div>
    );
  }

  function renderComplete() {
    return (
      <div className="lms-container">
        {renderProgressBar()}
        <div className="lms-card">
          <h2 style={{ color: '#27ae60', marginBottom: '1rem' }}>✓ Thank You!</h2>
          <p>Your responses have been recorded anonymously.</p>

          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.9rem',
              background:
                saveStatus === 'error' ? '#ffebee' : saveStatus === 'saved' ? '#e8f5e9' : '#f5f5f5',
              color: saveStatus === 'error' ? '#c62828' : '#333',
              border: `1px solid ${saveStatus === 'error' ? '#ef9a9a' : saveStatus === 'saved' ? '#a5d6a7' : '#e0e0e0'}`,
            }}
          >
            {saveStatus === 'saving' && <span>Saving responses…</span>}
            {saveStatus === 'saved' && <span>{saveMessage}</span>}
            {saveStatus === 'error' && (
              <span>
                {saveMessage}{' '}
                <button type="button" onClick={() => void flushSubmission()} style={{ marginLeft: '0.5rem' }}>
                  Retry
                </button>
              </span>
            )}
            {saveStatus === 'idle' && <span>Preparing save…</span>}
          </div>
          
          <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#fff9e6', borderRadius: '8px', border: '2px solid #ffc107' }}>
            <h3 style={{ color: '#f57c00', marginTop: 0, marginBottom: '1rem' }}>🎉 Optional: Enter our GPT-5 Lottery</h3>
            <p style={{ marginBottom: '1rem' }}>
              As a thank you for participating, we're offering a chance to win early access to GPT-5!
              This is completely optional, and your study participation is valid regardless of your choice.
            </p>
            
            <div className="form-group" style={{ background: '#ffffff', borderLeftColor: '#ffc107', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={lotteryOptIn}
                  onChange={(e) => setLotteryOptIn(e.target.checked)}
                  style={{ marginRight: '0.75rem', cursor: 'pointer' }}
                />
                <span>Yes, I would like to be entered into the GPT-5 lottery</span>
              </label>
            </div>

            {lotteryOptIn && (
              <div className="form-group" style={{ background: '#ffffff', borderLeftColor: '#ffc107' }}>
                <label>
                  <strong>Participant Number (from your 950 ID):</strong>
                  <input
                    type="text"
                    value={participantNumber}
                    onChange={(e) => setParticipantNumber(e.target.value)}
                    placeholder="e.g., 950-12345"
                    style={{ marginTop: '0.5rem' }}
                  />
                  <small style={{ display: 'block', marginTop: '0.25rem', color: '#666', fontSize: '0.875rem' }}>
                    This allows us to contact you if you win. This number will be kept separately from your study responses.
                  </small>
                </label>
              </div>
            )}
          </div>

          <p style={{ marginTop: '2rem', color: '#666', fontSize: '0.9rem' }}>
            If you'd like a copy of your data for personal reference, open your browser's developer console and inspect the state variables.
          </p>
          
          <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f0f7ff', borderRadius: '8px', borderLeft: '4px solid #1a5490', textAlign: 'center' }}>
            <p style={{ margin: 0, fontWeight: '500' }}>Your participation helps advance educational research on AI literacy. Thank you!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="lms-header">
        <h1>✨ Prompty+</h1>
      </div>
      {stage === "consent" && renderConsent()}
      {stage === "preSurvey" && renderPreSurvey()}
      {stage === "module" && renderModule()}
      {stage === "task" && renderTask()}
      {stage === "postSurvey" && renderPostSurvey()}
      {stage === "complete" && renderComplete()}
    </div>
  );
}
