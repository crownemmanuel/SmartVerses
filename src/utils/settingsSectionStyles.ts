import type { CSSProperties } from "react";

/** Shared styles for settings page section containers (card-style blocks). */
export const sectionStyle: CSSProperties = {
  marginBottom: "var(--spacing-6)",
  padding: "var(--spacing-4)",
  backgroundColor: "var(--app-header-bg)",
  borderRadius: "12px",
  border: "1px solid var(--app-border-color)",
};

/** Shared styles for section headers (icon + title row with bottom border). */
export const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  marginBottom: "var(--spacing-4)",
  paddingBottom: "var(--spacing-3)",
  borderBottom: "1px solid var(--app-border-color)",
};
