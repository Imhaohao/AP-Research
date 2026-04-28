'use client'

import React, { useState } from "react";

/**
 * A simple TypeScript React component that guides a student through a
 * quasi‑experimental prompt engineering study. It mirrors the high level
 * structure described in the research proposal: students are randomly
 * assigned to either a control or treatment group, complete a pre‑survey,
 * watch a mini‑module (prompt engineering vs digital literacy), write a
 * short explanation on an unfamiliar topic using AI if they choose, and
 * complete a post‑survey. All data is kept client‑side in this demo.
 */
export default function PromptStudy() {
  type Group = "control" | "treatment";
  type Stage = "consent" | "preSurvey" | "module" | "promptPractice" | "task" | "postSurvey" | "complete";

  // Randomly assign on first render
  const [group] = useState<Group>(() => {
    return Math.random() < 0.5 ? "control" : "treatment";
  });

  const [stage, setStage] = useState<Stage>("consent");
  const [preResponses, setPreResponses] = useState({
    q1: 3,
    q2: 3,
    q3: 3,
    q4: 3,
    q5: 3,
    open1: "",
    open2: "",
    open3: "",
  });
  const [postResponses, setPostResponses] = useState({
    q1: 3,
    q2: 3,
    q3: 3,
    q4: 3,
    q5: 3,
    open1: "",
    open2: "",
    open3: "",
  });
  const topics = [
    "Why do neutron stars ‘glitch’?",
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
  const [userPrompt, setUserPrompt] = useState("");
  const [llmResponses, setLlmResponses] = useState<{
    openai?: { response: string; error?: string };
    anthropic?: { response: string; error?: string };
    google?: { response: string; error?: string };
  }>({});
  const [isLoading, setIsLoading] = useState(false);

  function renderConsent() {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <h2>Prompt Engineering Study</h2>
        <p>
          This short activity explores how students can learn to communicate
          better with AI tools like ChatGPT. Your responses are anonymous. You
          may exit at any time. The entire study should take about 45–60
          minutes.
        </p>
        <label>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          &nbsp;I am at least 14 years old and consent to anonymous
          participation.
        </label>
        <br />
        <button
          disabled={!consent}
          onClick={() => setStage("preSurvey")}
          style={{ marginTop: 16 }}
        >
          Continue
        </button>
      </div>
    );
  }

  function renderLikert(value: number, onChange: (v: number) => void, name: string) {
    return (
      <span>
        {[1, 2, 3, 4, 5].map((val) => (
          <label 
            key={`${name}-${val}`} 
            htmlFor={`${name}-${val}`}
            style={{ marginRight: 8, cursor: "pointer" }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="radio"
              id={`${name}-${val}`}
              name={name}
              value={val}
              checked={value === val}
              onChange={(e) => {
                e.stopPropagation();
                onChange(val);
              }}
            />
            &nbsp;{val}
          </label>
        ))}
      </span>
    );
  }

  function renderPreSurvey() {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2>Pre‑Survey</h2>
        <p>Please rate your agreement with each statement (1=Strongly Disagree, 5=Strongly Agree).</p>
        <div style={{ marginBottom: 20 }}>
        <div>
            <strong>1. I understand how to write clear and specific prompts for AI tools.</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            {renderLikert(preResponses.q1, (v) => setPreResponses((prev) => ({ ...prev, q1: v })), "pre-q1")}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
        <div>
            <strong>2. When I use AI, I usually ask for final answers instead of explanations.</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            {renderLikert(preResponses.q2, (v) => setPreResponses((prev) => ({ ...prev, q2: v })), "pre-q2")}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
        <div>
            <strong>3. I use AI to help me think through problems step‑by‑step.</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            {renderLikert(preResponses.q3, (v) => setPreResponses((prev) => ({ ...prev, q3: v })), "pre-q3")}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
        <div>
            <strong>4. I know how to tell if AI responses are accurate or biased.</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            {renderLikert(preResponses.q4, (v) => setPreResponses((prev) => ({ ...prev, q4: v })), "pre-q4")}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
        <div>
            <strong>5. I think AI can help me learn more effectively if used responsibly.</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            {renderLikert(preResponses.q5, (v) => setPreResponses((prev) => ({ ...prev, q5: v })), "pre-q5")}
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label>
            <strong>6. How do you usually use AI tools in your schoolwork?</strong>
            <br />
            <textarea
              value={preResponses.open1}
              onChange={(e) => setPreResponses({ ...preResponses, open1: e.target.value })}
              rows={3}
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 16 }}>
          <label>
            <strong>7. What makes a “good” AI prompt?</strong>
            <br />
            <textarea
              value={preResponses.open2}
              onChange={(e) => setPreResponses({ ...preResponses, open2: e.target.value })}
              rows={3}
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 16 }}>
          <label>
            <strong>8. What concerns do you have about using AI in school?</strong>
            <br />
            <textarea
              value={preResponses.open3}
              onChange={(e) => setPreResponses({ ...preResponses, open3: e.target.value })}
              rows={3}
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <button
          style={{ marginTop: 24 }}
          onClick={() => setStage("module")}
        >
          Continue
        </button>
      </div>
    );
  }

  function renderModule() {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2>{group === "treatment" ? "Prompt Engineering Mini‑Course" : "Digital Literacy Module"}</h2>
        {group === "treatment" ? (
          <>
            <p>
              This brief lesson introduces prompt engineering: the process of
              framing clear and structured requests to AI so that you get more
              useful answers. We'll explore four key prompting techniques.
            </p>
            
            <h3 style={{ marginTop: 24 }}>1. Role-Context-Task Prompting</h3>
            <p>
              Structure your prompts with three key elements:
            </p>
            <ul>
              <li><strong>Role</strong>: Define who the AI should act as (e.g., "You are a high school science teacher")</li>
              <li><strong>Context</strong>: Provide background information (e.g., "Your student is in 9th grade and learning about photosynthesis")</li>
              <li><strong>Task</strong>: Clearly state what you want (e.g., "Explain photosynthesis in simple terms with one real-world example")</li>
            </ul>
            <p style={{ fontStyle: "italic", marginTop: 8 }}>
              Example: "You are a high school science teacher. Your student is in 9th grade and learning about photosynthesis. Explain photosynthesis in simple terms with one real-world example."
            </p>

            <h3 style={{ marginTop: 24 }}>2. Chain of Thought Prompting</h3>
            <p>
              Ask the AI to show its reasoning process step-by-step:
            </p>
            <ul>
              <li>Request intermediate steps or "thinking out loud"</li>
              <li>Use phrases like "think step by step" or "show your reasoning"</li>
              <li>This helps you understand how the AI arrived at its answer</li>
            </ul>
            <p style={{ fontStyle: "italic", marginTop: 8 }}>
              Example: "Solve this math problem: If 3 apples cost $6, how much do 5 apples cost? Show your reasoning step by step."
            </p>

            <h3 style={{ marginTop: 24 }}>3. Zero-Shot Prompting</h3>
            <p>
              Give the AI a task without providing examples:
            </p>
            <ul>
              <li>Directly state what you want without showing examples</li>
              <li>Works best for straightforward tasks</li>
              <li>Most common type of prompting</li>
            </ul>
            <p style={{ fontStyle: "italic", marginTop: 8 }}>
              Example: "Write a haiku about spring." (No example provided)
            </p>

            <h3 style={{ marginTop: 24 }}>4. One-Shot Prompting</h3>
            <p>
              Provide one example before asking the AI to do the task:
            </p>
            <ul>
              <li>Show the AI one example of what you want</li>
              <li>Then ask it to create something similar</li>
              <li>Helps the AI understand the format or style you prefer</li>
            </ul>
            <p style={{ fontStyle: "italic", marginTop: 8 }}>
              Example: "Translate to Spanish: 'Hello' → 'Hola'. Now translate: 'Good morning'"
            </p>
          </>
        ) : (
          <>
            <p>
              This brief lesson focuses on digital literacy: evaluating the
              credibility of online sources and avoiding plagiarism.
            </p>
            <ul>
              <li>
                <strong>Check sources</strong>: Always verify information with
                trusted references.
              </li>
              <li>
                <strong>Avoid copy/paste</strong>: Use your own words and cite
                when using external ideas.
              </li>
              <li>
                <strong>Be critical</strong>: Ask who authored the information and
                for what purpose.
              </li>
            </ul>
          </>
        )}
        {group === "treatment" ? (
          <button onClick={() => setStage("promptPractice")} style={{ marginTop: 24 }}>
            Try Prompt Practice
          </button>
        ) : (
          <button onClick={() => setStage("task")} style={{ marginTop: 24 }}>
            Start Writing Task
          </button>
        )}
      </div>
    );
  }

  async function handlePromptSubmit() {
    if (!userPrompt.trim()) {
      alert("Please enter a prompt");
      return;
    }

    setIsLoading(true);
    setLlmResponses({});

    try {
      // Call all three LLMs in parallel
      const [openaiResponse, anthropicResponse, googleResponse] = await Promise.allSettled([
        fetch("/api/llm/openai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userPrompt }),
        }),
        fetch("/api/llm/anthropic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userPrompt }),
        }),
        fetch("/api/llm/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userPrompt }),
        }),
      ]);

      const responses: typeof llmResponses = {};

      // Process OpenAI response
      if (openaiResponse.status === "fulfilled") {
        const data = await openaiResponse.value.json();
        if (openaiResponse.value.ok) {
          responses.openai = { response: data.response };
        } else {
          responses.openai = { response: "", error: data.error || "OpenAI API error" };
        }
      } else {
        responses.openai = { response: "", error: openaiResponse.reason?.message || "Failed to call OpenAI" };
      }

      // Process Anthropic response
      if (anthropicResponse.status === "fulfilled") {
        const data = await anthropicResponse.value.json();
        if (anthropicResponse.value.ok) {
          responses.anthropic = { response: data.response };
        } else {
          responses.anthropic = { response: "", error: data.error || "Anthropic API error" };
        }
      } else {
        responses.anthropic = { response: "", error: anthropicResponse.reason?.message || "Failed to call Anthropic" };
      }

      // Process Google response
      if (googleResponse.status === "fulfilled") {
        const data = await googleResponse.value.json();
        if (googleResponse.value.ok) {
          responses.google = { response: data.response };
        } else {
          responses.google = { response: "", error: data.error || "Google API error" };
        }
      } else {
        responses.google = { response: "", error: googleResponse.reason?.message || "Failed to call Google" };
      }

      setLlmResponses(responses);
    } catch (error) {
      console.error("Error calling LLMs:", error);
      alert("An error occurred while calling the LLMs. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function renderPromptPractice() {
    return (
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <h2>Prompt Practice</h2>
        <p>
          Try out the prompting techniques you just learned! Enter a prompt below and see how three different AI models respond.
          This will help you compare different AI responses and refine your prompting skills.
        </p>

        <div style={{ marginTop: 24 }}>
          <label>
            <strong>Your Prompt:</strong>
            <br />
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              rows={4}
              placeholder="Try one of the techniques you learned! For example: 'You are a high school science teacher. Your student is in 9th grade. Explain photosynthesis in simple terms with one real-world example.'"
              style={{ width: "100%", padding: 8, marginTop: 8, borderRadius: 4, border: "1px solid #ccc", fontFamily: "inherit" }}
            />
          </label>
        </div>

        <button
          onClick={handlePromptSubmit}
          disabled={isLoading || !userPrompt.trim()}
          style={{
            marginTop: 16,
            padding: "12px 24px",
            backgroundColor: isLoading ? "#ccc" : "#0070f3",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: isLoading ? "not-allowed" : "pointer",
            fontSize: 16,
          }}
        >
          {isLoading ? "Loading..." : "Submit to All LLMs"}
        </button>

        {(llmResponses.openai || llmResponses.anthropic || llmResponses.google) && (
          <div style={{ marginTop: 32 }}>
            <h3>Responses from Different LLMs:</h3>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 16 }}>
              {llmResponses.openai && (
                <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, backgroundColor: "#fff" }}>
                  <h4 style={{ marginTop: 0, color: "#0070f3" }}>OpenAI (GPT-4)</h4>
                  {llmResponses.openai.error ? (
                    <p style={{ color: "red" }}>Error: {llmResponses.openai.error}</p>
                  ) : (
                    <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{llmResponses.openai.response}</p>
                  )}
                </div>
              )}

              {llmResponses.anthropic && (
                <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, backgroundColor: "#fff" }}>
                  <h4 style={{ marginTop: 0, color: "#d4af37" }}>Anthropic (Claude)</h4>
                  {llmResponses.anthropic.error ? (
                    <p style={{ color: "red" }}>Error: {llmResponses.anthropic.error}</p>
                  ) : (
                    <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{llmResponses.anthropic.response}</p>
                  )}
                </div>
              )}

              {llmResponses.google && (
                <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, backgroundColor: "#fff" }}>
                  <h4 style={{ marginTop: 0, color: "#4285f4" }}>Google (Gemini)</h4>
                  {llmResponses.google.error ? (
                    <p style={{ color: "red" }}>Error: {llmResponses.google.error}</p>
                  ) : (
                    <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{llmResponses.google.response}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 32, padding: 16, backgroundColor: "#f0f8ff", borderRadius: 8 }}>
          <h4>Tips for Comparing Responses:</h4>
          <ul>
            <li>Notice which model provides more detailed explanations</li>
            <li>Compare how each model interprets your prompt</li>
            <li>Think about which response is most helpful for your learning goal</li>
            <li>Try refining your prompt and submitting again to see how responses change</li>
          </ul>
        </div>

        <button
          onClick={() => setStage("task")}
          style={{ marginTop: 24, padding: "12px 24px", backgroundColor: "#28a745", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
        >
          Continue to Writing Task
        </button>
      </div>
    );
  }

  function renderTask() {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2>Writing Task</h2>
        <p>
          Select a topic below. Your goal is to write a 200–250 word
          explanation for a 9th‑grade student. You may use AI, but you must
          disclose how you used it.
        </p>
        <label>
          <strong>Topic:</strong>
          <br />
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
        <div style={{ marginTop: 16 }}>
          <label>
            <strong>Prompt(s) used (if any):</strong>
            <br />
            <textarea
              value={taskData.prompts}
              onChange={(e) => setTaskData({ ...taskData, prompts: e.target.value })}
              rows={2}
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 16 }}>
          <label>
            <strong>Your explanation (200–250 words):</strong>
            <br />
            <textarea
              value={taskData.explanation}
              onChange={(e) => setTaskData({ ...taskData, explanation: e.target.value })}
              rows={5}
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 16 }}>
          <strong>AI Use Disclosure:</strong>
          <div>
            <label>
              <input
                type="checkbox"
                checked={taskData.usedAi}
                onChange={(e) => setTaskData({ ...taskData, usedAi: e.target.checked })}
              />
              &nbsp;I used AI tools for brainstorming or drafting
            </label>
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={taskData.editedAi}
                onChange={(e) => setTaskData({ ...taskData, editedAi: e.target.checked })}
              />
              &nbsp;I edited and rewrote AI text in my own words
            </label>
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={taskData.verified}
                onChange={(e) => setTaskData({ ...taskData, verified: e.target.checked })}
              />
              &nbsp;I verified AI information with another source
            </label>
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={taskData.cited}
                onChange={(e) => setTaskData({ ...taskData, cited: e.target.checked })}
              />
              &nbsp;I cited or acknowledged AI assistance
            </label>
          </div>
        </div>
        <button
          style={{ marginTop: 24 }}
          onClick={() => setStage("postSurvey")}
        >
          Continue to Post‑Survey
        </button>
      </div>
    );
  }

  function renderPostSurvey() {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <h2>Post‑Survey</h2>
        <p>
          Please rate your agreement with each statement about your AI use in
          this activity (1=Strongly Disagree, 5=Strongly Agree).
        </p>
        <div style={{ marginBottom: 20 }}>
        <div>
            <strong>1. I feel more confident writing effective AI prompts.</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            {renderLikert(postResponses.q1, (v) => setPostResponses((prev) => ({ ...prev, q1: v })), "post-q1")}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
        <div>
            <strong>2. I now ask AI for explanations or reasoning rather than just answers.</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            {renderLikert(postResponses.q2, (v) => setPostResponses((prev) => ({ ...prev, q2: v })), "post-q2")}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
        <div>
            <strong>3. The activity helped me understand how to learn with AI more effectively.</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            {renderLikert(postResponses.q3, (v) => setPostResponses((prev) => ({ ...prev, q3: v })), "post-q3")}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
        <div>
            <strong>4. I now think more critically about AI responses.</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            {renderLikert(postResponses.q4, (v) => setPostResponses((prev) => ({ ...prev, q4: v })), "post-q4")}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
        <div>
            <strong>5. I understand how to use AI ethically for schoolwork.</strong>
          </div>
          <div style={{ marginTop: 8 }}>
            {renderLikert(postResponses.q5, (v) => setPostResponses((prev) => ({ ...prev, q5: v })), "post-q5")}
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <label>
            <strong>Describe one example of how you changed your prompting after this activity.</strong>
            <br />
            <textarea
              value={postResponses.open1}
              onChange={(e) => setPostResponses({ ...postResponses, open1: e.target.value })}
              rows={3}
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 16 }}>
          <label>
            <strong>How did this lesson change the way you approach learning or writing?</strong>
            <br />
            <textarea
              value={postResponses.open2}
              onChange={(e) => setPostResponses({ ...postResponses, open2: e.target.value })}
              rows={3}
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 16 }}>
          <label>
            <strong>Do you think all students should learn prompt engineering? Why or why not?</strong>
            <br />
            <textarea
              value={postResponses.open3}
              onChange={(e) => setPostResponses({ ...postResponses, open3: e.target.value })}
              rows={3}
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <button style={{ marginTop: 24 }} onClick={() => setStage("complete")}>Finish</button>
      </div>
    );
  }

  function renderComplete() {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <h2>Thank you!</h2>
        <p>Your responses have been recorded anonymously.</p>
        <p>
          If you’d like a copy of your data for personal reference, open your
          browser’s developer console and inspect the state variables.
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "sans-serif", padding: 16 }}>
      {stage === "consent" && renderConsent()}
      {stage === "preSurvey" && renderPreSurvey()}
      {stage === "module" && renderModule()}
      {stage === "promptPractice" && renderPromptPractice()}
      {stage === "task" && renderTask()}
      {stage === "postSurvey" && renderPostSurvey()}
      {stage === "complete" && renderComplete()}
    </div>
  );
}