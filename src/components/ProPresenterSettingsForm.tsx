import React, { useEffect, useState } from "react";
import { AppSettings, ProPresenterSettings } from "../types";
import { getAppSettings, saveAppSettings } from "../utils/aiConfig";

const ProPresenterSettingsForm: React.FC = () => {
  const [appSettings, setAppSettings] = useState<AppSettings>(getAppSettings());
  const [settings, setSettings] = useState<ProPresenterSettings>(
    appSettings.proPresenter || {
      timerOutputPath: "/tmp/proassist/output/timer/",
      timerFileName: "timer.txt",
      timerFormat: "mm:ss",
      warnThresholdSeconds: 60,
    }
  );

  useEffect(() => {
    setAppSettings(getAppSettings());
  }, []);

  const handleSave = () => {
    const newSettings: AppSettings = {
      ...appSettings,
      proPresenter: settings,
    };
    saveAppSettings(newSettings);
    setAppSettings(newSettings);
    alert("ProPresenter settings saved!");
  };

  return (
    <div className="settings-form-section">
      <h3>ProPresenter Integration</h3>
      <div className="form-group">
        <label htmlFor="pp-output-path">Timer Output Path</label>
        <input
          id="pp-output-path"
          type="text"
          value={settings.timerOutputPath}
          onChange={(e) =>
            setSettings((s) => ({ ...s, timerOutputPath: e.target.value }))
          }
          placeholder="e.g., /Users/you/ProPresenterOutput/Timer/"
        />
      </div>
      <div className="form-group">
        <label htmlFor="pp-file-name">Timer File Name</label>
        <input
          id="pp-file-name"
          type="text"
          value={settings.timerFileName}
          onChange={(e) =>
            setSettings((s) => ({ ...s, timerFileName: e.target.value }))
          }
          placeholder="timer.txt"
        />
      </div>
      <div className="form-group">
        <label htmlFor="pp-format">Timer Format</label>
        <select
          id="pp-format"
          value={settings.timerFormat || "mm:ss"}
          onChange={(e) =>
            setSettings((s) => ({ ...s, timerFormat: e.target.value as any }))
          }
        >
          <option value="mm:ss">mm:ss</option>
          <option value="h:mm:ss">h:mm:ss</option>
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="pp-warn">Warn Threshold (seconds)</label>
        <input
          id="pp-warn"
          type="number"
          min={0}
          value={settings.warnThresholdSeconds || 0}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              warnThresholdSeconds: Number(e.target.value) || 0,
            }))
          }
        />
      </div>
      <button onClick={handleSave} className="primary" style={{ marginTop: "10px" }}>
        Save ProPresenter Settings
      </button>
    </div>
  );
};

export default ProPresenterSettingsForm;