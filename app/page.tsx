'use client'

import { useState } from 'react'
import PromptStudy from '@/components/PromptStudy'

const VALID_ACCESS_CODE = "PROMPTINGSUCCESS";

export default function Home() {
  const [accessCode, setAccessCode] = useState("");
  const [accessCodeError, setAccessCodeError] = useState("");
  const [hasAccess, setHasAccess] = useState(false);

  function handleAccessCodeSubmit() {
    if (accessCode.trim().toUpperCase() === VALID_ACCESS_CODE.toUpperCase()) {
      setAccessCodeError("");
      setHasAccess(true);
    } else {
      setAccessCodeError("Invalid access code. Please try again.");
    }
  }

  if (!hasAccess) {
    return (
      <div style={{ fontFamily: "sans-serif", padding: 16, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 600, width: "100%" }}>
          <h2>Access Required</h2>
          <p>
            Please enter the access code provided by your instructor to participate in this study.
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

  return <PromptStudy />;
}


