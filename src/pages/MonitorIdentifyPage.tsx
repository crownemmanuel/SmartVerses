import React from "react";

/**
 * MonitorIdentifyPage - A fullscreen red page displayed when identifying a monitor.
 * Shows "SmartVerses Screen" text to help users identify which physical monitor
 * corresponds to the selected option in settings.
 */
const MonitorIdentifyPage: React.FC = () => {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "#dc2626",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        userSelect: "none",
        cursor: "default",
        overflow: "hidden",
      }}
    >
      <h1
        style={{
          color: "#ffffff",
          fontSize: "10vw",
          fontWeight: 700,
          textAlign: "center",
          margin: 0,
          textShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
          lineHeight: 1.2,
        }}
      >
        SmartVerses Screen
      </h1>
      <p
        style={{
          color: "rgba(255, 255, 255, 0.8)",
          fontSize: "3vw",
          marginTop: "2vh",
          textAlign: "center",
        }}
      >
        Release button to dismiss
      </p>
    </div>
  );
};

export default MonitorIdentifyPage;
