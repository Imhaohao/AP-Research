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
  type Stage = "consent" | "preSurvey" | "module" | "task" | "postSurvey" | "complete";

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

  function renderLikert(value: number, onChange: (v: number) => void) {
    return (
      <span>
        {[1, 2, 3, 4, 5].map((val) => (
          <label key={val} style={{ marginRight: 8 }}>
            <input
              type="radio"
              value={val}
              checked={value === val}
              onChange={() => onChange(val)}
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
        <div>
          <label>
            <strong>1. I understand how to write clear and specific prompts for AI tools.</strong>
            <br />
            {renderLikert(preResponses.q1, (v) => setPreResponses({ ...preResponses, q1: v }))}
          </label>
        </div>
        <div>
          <label>
            <strong>2. When I use AI, I usually ask for final answers instead of explanations.</strong>
            <br />
            {renderLikert(preResponses.q2, (v) => setPreResponses({ ...preResponses, q2: v }))}
          </label>
        </div>
        <div>
          <label>
            <strong>3. I use AI to help me think through problems step‑by‑step.</strong>
            <br />
            {renderLikert(preResponses.q3, (v) => setPreResponses({ ...preResponses, q3: v }))}
          </label>
        </div>
        <div>
          <label>
            <strong>4. I know how to tell if AI responses are accurate or biased.</strong>
            <br />
            {renderLikert(preResponses.q4, (v) => setPreResponses({ ...preResponses, q4: v }))}
          </label>
        </div>
        <div>
          <label>
            <strong>5. I think AI can help me learn more effectively if used responsibly.</strong>
            <br />
            {renderLikert(preResponses.q5, (v) => setPreResponses({ ...preResponses, q5: v }))}
          </label>
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
              useful answers.
            </p>
            <ul>
              <li>
                <strong>Be specific</strong>: Tell the AI exactly what you want to
                know.
              </li>
              <li>
                <strong>Add context</strong>: Explain who you are or who the
                response is for.
              </li>
              <li>
                <strong>Ask for reasoning</strong>: Request step‑by‑step
                explanations or analogies.
              </li>
            </ul>
            <p>
              Take a moment to think about how you might prompt an AI to teach
              you a math concept step‑by‑step.
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
          <button onClick={() => setStage("task")} style={{ marginTop: 24 }}>
            Start Writing Task
          </button>
        ) : (
          <button onClick={() => setStage("task")} style={{ marginTop: 24 }}>
            Start Writing Task
          </button>
        )}
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
        <div>
          <label>
            <strong>1. I feel more confident writing effective AI prompts.</strong>
            <br />
            {renderLikert(postResponses.q1, (v) => setPostResponses({ ...postResponses, q1: v }))}
          </label>
        </div>
        <div>
          <label>
            <strong>2. I now ask AI for explanations or reasoning rather than just answers.</strong>
            <br />
            {renderLikert(postResponses.q2, (v) => setPostResponses({ ...postResponses, q2: v }))}
          </label>
        </div>
        <div>
          <label>
            <strong>3. The activity helped me understand how to learn with AI more effectively.</strong>
            <br />
            {renderLikert(postResponses.q3, (v) => setPostResponses({ ...postResponses, q3: v }))}
          </label>
        </div>
        <div>
          <label>
            <strong>4. I now think more critically about AI responses.</strong>
            <br />
            {renderLikert(postResponses.q4, (v) => setPostResponses({ ...postResponses, q4: v }))}
          </label>
        </div>
        <div>
          <label>
            <strong>5. I understand how to use AI ethically for schoolwork.</strong>
            <br />
            {renderLikert(postResponses.q5, (v) => setPostResponses({ ...postResponses, q5: v }))}
          </label>
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
      {stage === "task" && renderTask()}
      {stage === "postSurvey" && renderPostSurvey()}
      {stage === "complete" && renderComplete()}
    </div>
  );
}