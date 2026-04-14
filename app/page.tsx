'use client'

import { useState } from 'react'
import PromptStudy from '@/components/PromptStudy'

const VALID_ACCESS_CODE = "PROMPTINGSUCCESS";

export default function Home() {
  const [accessCode, setAccessCode] = useState("");
  const [accessCodeError, setAccessCodeError] = useState("");
  const [hasAccess, setHasAccess] = useState(false);
  const [participantEmail, setParticipantEmail] = useState("");
  const [participantEmailError, setParticipantEmailError] = useState("");
  const [hasParticipantEmail, setHasParticipantEmail] = useState(false);

  function handleAccessCodeSubmit() {
    if (accessCode.trim().toUpperCase() === VALID_ACCESS_CODE.toUpperCase()) {
      setAccessCodeError("");
      setHasAccess(true);
    } else {
      setAccessCodeError("Invalid access code. Please try again.");
    }
  }

  function handleParticipantEmailSubmit() {
    const raw = participantEmail.trim();
    if (!raw) {
      setParticipantEmailError("Please enter your email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      setParticipantEmailError("Please enter a valid email address.");
      return;
    }
    setParticipantEmailError("");
    setHasParticipantEmail(true);
  }

  if (!hasAccess) {
    return (
      <div style={{ fontFamily: "sans-serif", padding: 16, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 600, width: "100%" }}>
          <h2>Access Code Required</h2>
          <p>
            Thank you for your interest for participating in this AP Research study. Please enter the access code provided by zy53492@pausd.us to participate in this study.
          </p>
          <div style={{ marginTop: 24 }}>
            <label>
              <strong>Access Code:</strong>
              <br />
              <input
                type="text"
                value={accessCode}
                onChange={(e) => {
                  setAccessCode(e.target.value);
                  setAccessCodeError("");
                }}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleAccessCodeSubmit();
                  }
                }}
                placeholder="Enter access code"
                style={{
                  width: "100%",
                  padding: 12,
                  marginTop: 8,
                  fontSize: 16,
                  borderRadius: 4,
                  border: accessCodeError ? "2px solid #dc3545" : "1px solid #ccc",
                  textTransform: "uppercase",
                }}
                autoFocus
              />
            </label>
            {accessCodeError && (
              <p style={{ color: "#dc3545", marginTop: 8, fontSize: 14 }}>
                {accessCodeError}
              </p>
            )}
          </div>
          <button
            onClick={handleAccessCodeSubmit}
            disabled={!accessCode.trim()}
            style={{
              marginTop: 16,
              padding: "12px 24px",
              backgroundColor: accessCode.trim() ? "#0070f3" : "#ccc",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: accessCode.trim() ? "pointer" : "not-allowed",
              fontSize: 16,
            }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (!hasParticipantEmail) {
    return (
      <div style={{ fontFamily: "sans-serif", padding: 16, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 600, width: "100%" }}>
          <h2>Participant Info</h2>
          <p>Please enter your participant email to continue.</p>
          <div style={{ marginTop: 24 }}>
            <label>
              <strong>Email:</strong>
              <br />
              <input
                type="email"
                value={participantEmail}
                onChange={(e) => {
                  setParticipantEmail(e.target.value);
                  setParticipantEmailError("");
                }}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleParticipantEmailSubmit();
                  }
                }}
                placeholder="name@example.com"
                style={{
                  width: "100%",
                  padding: 12,
                  marginTop: 8,
                  fontSize: 16,
                  borderRadius: 4,
                  border: participantEmailError ? "2px solid #dc3545" : "1px solid #ccc",
                }}
                autoFocus
              />
            </label>
            {participantEmailError && (
              <p style={{ color: "#dc3545", marginTop: 8, fontSize: 14 }}>
                {participantEmailError}
              </p>
            )}
          </div>
          <button
            onClick={handleParticipantEmailSubmit}
            disabled={!participantEmail.trim()}
            style={{
              marginTop: 16,
              padding: "12px 24px",
              backgroundColor: participantEmail.trim() ? "#0070f3" : "#ccc",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: participantEmail.trim() ? "pointer" : "not-allowed",
              fontSize: 16,
            }}
          >
            Continue
          </button>
          <button
            onClick={() => {
              setHasAccess(false);
              setHasParticipantEmail(false);
              setParticipantEmail("");
              setParticipantEmailError("");
              setAccessCode("");
              setAccessCodeError("");
            }}
            style={{
              marginTop: 12,
              padding: "10px 16px",
              backgroundColor: "transparent",
              color: "#0070f3",
              border: "1px solid #0070f3",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 14,
              width: "100%",
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return <PromptStudy participantEmail={participantEmail.trim()} />;
}


