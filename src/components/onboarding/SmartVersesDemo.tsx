/**
 * Smart Verses Demo Animation
 * Shows simulated transcription with scripture detection
 */

import React, { useState, useEffect } from "react";
import { FaPlay } from "react-icons/fa";
import "./smartVersesDemo.css";

const SmartVersesDemo: React.FC = () => {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [transcript1, setTranscript1] = useState("");
  const [transcript2, setTranscript2] = useState("");
  const [showDetection1, setShowDetection1] = useState(false);
  const [showVerse1, setShowVerse1] = useState(false);
  const [showDetection2, setShowDetection2] = useState(false);
  const [showVerse2, setShowVerse2] = useState(false);

  const fullText1 = "The Bible says in the book of John chapter 3 verse 16";
  const fullText2 = "In the beginning was the Word and the Word was with God";

  useEffect(() => {
    let timeout: number | undefined;
    let interval: number | undefined;

    // Phase 0: Stream first transcript
    if (currentPhase === 0) {
      const words = fullText1.split(" ");
      let wordIndex = 0;

      interval = window.setInterval(() => {
        if (wordIndex < words.length) {
          const word = words[wordIndex];
          if (word !== undefined) {
            setTranscript1((prev) => (prev ? prev + " " + word : word));
          }
          wordIndex++;
        } else {
          if (interval !== undefined) {
            clearInterval(interval);
            interval = undefined;
          }
          // Move to detection phase after transcript complete
          timeout = window.setTimeout(() => setCurrentPhase(1), 800);
        }
      }, 180) as unknown as number;
    }

    // Phase 1: Show detection badge for John 3:16
    if (currentPhase === 1) {
      setShowDetection1(true);
      timeout = window.setTimeout(() => setCurrentPhase(2), 1000);
    }

    // Phase 2: Expand verse card
    if (currentPhase === 2) {
      setShowVerse1(true);
      timeout = window.setTimeout(() => setCurrentPhase(3), 2500);
    }

    // Phase 3: Stream second transcript
    if (currentPhase === 3) {
      const words = fullText2.split(" ");
      let wordIndex = 0;

      interval = window.setInterval(() => {
        if (wordIndex < words.length) {
          const word = words[wordIndex];
          if (word !== undefined) {
            setTranscript2((prev) => (prev ? prev + " " + word : word));
          }
          wordIndex++;
        } else {
          if (interval !== undefined) {
            clearInterval(interval);
            interval = undefined;
          }
          timeout = window.setTimeout(() => setCurrentPhase(4), 800);
        }
      }, 180) as unknown as number;
    }

    // Phase 4: Show paraphrase detection badge
    if (currentPhase === 4) {
      setShowDetection2(true);
      timeout = window.setTimeout(() => setCurrentPhase(5), 1000);
    }

    // Phase 5: Expand paraphrase verse card
    if (currentPhase === 5) {
      setShowVerse2(true);
      timeout = window.setTimeout(() => {
        // Reset animation
        setCurrentPhase(0);
        setTranscript1("");
        setTranscript2("");
        setShowDetection1(false);
        setShowVerse1(false);
        setShowDetection2(false);
        setShowVerse2(false);
      }, 3000);
    }

    return () => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      if (interval !== undefined) {
        clearInterval(interval);
      }
    };
  }, [currentPhase]);

  return (
    <div className="smartverses-demo">
      {/* First Transcript Segment - Direct Reference */}
      {transcript1 && (
        <div className="demo-transcript-segment">
          <p className="demo-transcript-text">
            {transcript1}
            {currentPhase === 0 && <span className="demo-cursor">|</span>}
          </p>

          {showDetection1 && (
            <div className="demo-detection-container">
              <button
                className="demo-verse-badge direct"
                onClick={(e) => e.preventDefault()}
              >
                <FaPlay size={10} />
                <span>John 3:16</span>
              </button>
            </div>
          )}

          {showVerse1 && (
            <div className="demo-verse-card direct">
              <div className="demo-verse-header">
                <div className="demo-verse-reference">John 3:16</div>
                <button className="demo-go-live-btn">
                  <FaPlay size={10} />
                  Go Live
                </button>
              </div>
              <p className="demo-verse-text">
                For God so loved the world, that he gave his only begotten Son,
                that whosoever believeth in him should not perish, but have
                everlasting life.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Second Transcript Segment - Paraphrase */}
      {transcript2 && (
        <div className="demo-transcript-segment">
          <p className="demo-transcript-text">
            {transcript2}
            {currentPhase === 3 && <span className="demo-cursor">|</span>}
          </p>

          {showDetection2 && (
            <div className="demo-detection-container">
              <button
                className="demo-verse-badge paraphrase"
                onClick={(e) => e.preventDefault()}
              >
                <FaPlay size={10} />
                <span>John 1:1</span>
                <span className="demo-confidence-badge">88%</span>
              </button>
            </div>
          )}

          {showVerse2 && (
            <div className="demo-verse-card paraphrase">
              <div className="demo-verse-header">
                <div className="demo-verse-reference">John 1:1</div>
                <button className="demo-go-live-btn">
                  <FaPlay size={10} />
                  Go Live
                </button>
              </div>
              <p className="demo-verse-text">
                In the beginning was the Word, and the Word was with God, and
                the Word was God.
              </p>
              <p className="demo-matched-phrase">
                Matched: "In the beginning was the Word and the Word was with God"
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SmartVersesDemo;
