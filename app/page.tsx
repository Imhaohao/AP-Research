'use client'

import { useState } from 'react'
import PromptStudy from '@/components/PromptStudy'

const VALID_ACCESS_CODE = "PROMPTINGSUCCESS";

export default function Home() {
  const [accessCode, setAccessCode] = useState("");
  const [accessCodeError, setAccessCodeError] = useState("");
  const [hasAccess, setHasAccess] = useState(false);
  const [participantLoginId, setParticipantLoginId] = useState("");
  const [participantLoginIdError, setParticipantLoginIdError] = useState("");
  const [hasParticipantLoginId, setHasParticipantLoginId] = useState(false);

  function handleAccessCodeSubmit() {
    if (accessCode.trim().toUpperCase() === VALID_ACCESS_CODE.toUpperCase()) {
      setAccessCodeError("");
      setHasAccess(true);
    } else {
      setAccessCodeError("Invalid access code. Please try again.");
    }
  }

  function handleParticipantLoginSubmit() {
    const raw = participantLoginId.trim().toUpperCase();
    if (!raw) {
      setParticipantLoginIdError("Please enter your participant login ID.");
      return;
    }
    if (!/^APR\d{3}$/.test(raw)) {
      setParticipantLoginIdError("Use the format APR### (example: APR001).");
      return;
    }
    setParticipantLoginId(raw);
    setParticipantLoginIdError("");
    setHasParticipantLoginId(true);
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

  if (!hasParticipantLoginId) {
    return (
      <div style={{ fontFamily: "sans-serif", padding: 16, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 600, width: "100%" }}>
          <h2>Participant Info</h2>
          <p>Please enter your participant login ID to continue.</p>
          <div style={{ marginTop: 24 }}>
            <label>
              <strong>Participant Login ID:</strong>
              <br />
              <input
                type="text"
                value={participantLoginId}
                onChange={(e) => {
                  setParticipantLoginId(e.target.value.toUpperCase());
                  setParticipantLoginIdError("");
                }}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleParticipantLoginSubmit();
                  }
                }}
                placeholder="APR001"
                style={{
                  width: "100%",
                  padding: 12,
                  marginTop: 8,
                  fontSize: 16,
                  borderRadius: 4,
                  border: participantLoginIdError ? "2px solid #dc3545" : "1px solid #ccc",
                  textTransform: "uppercase",
                }}
                autoFocus
              />
            </label>
            {participantLoginIdError && (
              <p style={{ color: "#dc3545", marginTop: 8, fontSize: 14 }}>
                {participantLoginIdError}
              </p>
            )}
          </div>
          <button
            onClick={handleParticipantLoginSubmit}
            disabled={!participantLoginId.trim()}
            style={{
              marginTop: 16,
              padding: "12px 24px",
              backgroundColor: participantLoginId.trim() ? "#0070f3" : "#ccc",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: participantLoginId.trim() ? "pointer" : "not-allowed",
              fontSize: 16,
            }}
          >
            Continue
          </button>
          <button
            onClick={() => {
              setHasAccess(false);
              setHasParticipantLoginId(false);
              setParticipantLoginId("");
              setParticipantLoginIdError("");
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

  return <PromptStudy participantLoginId={participantLoginId.trim().toUpperCase()} />;
}


