import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import "./App.css";
// import { invoke } from "@tauri-apps/api/tauri"; // We will use this later
// import { checkUpdate, installUpdate } from '@tauri-apps/api/updater'; // Removed as it was causing a lint error and not used yet
// import { relaunch } from '@tauri-apps/api/process'; // Removed as it was causing a lint error and not used yet

// Import actual page components
import MainApplicationPage from "./pages/MainApplicationPage";
import SettingsPage from "./pages/SettingsPage";
import TimerPage from "./pages/TimerPage";

function App() {
  const [theme, setTheme] = useState(
    localStorage.getItem("app-theme") || "dark"
  );

  useEffect(() => {
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(`theme-${theme}`);
    localStorage.setItem("app-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  // const [greetMsg, setGreetMsg] = useState("");
  // const [name, setName] = useState("");

  // async function greet() {
  //   // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
  //   setGreetMsg(await invoke("greet", { name }));
  // }

  // Example update check (can be re-added later if needed)
  // useEffect(() => {
  //   const doUpdateCheck = async () => {
  //     try {
  //       console.log('Checking for updates...');
  //       const { shouldUpdate, manifest } = await checkUpdate();
  //       if (shouldUpdate) {
  //         console.log(
  //           `Installing update ${manifest?.version}, current version is ${await getName()} ${await getVersion()}`
  //         );
  //         // Install the update. This will also restart the app on Windows!
  //         await installUpdate();
  //         // On macOS and Linux you will need to restart the app manually.
  //         // You could use this step to display confirmation dialog.
  //         await relaunch();
  //       }
  //     } catch (error) {
  //       console.error('Update check failed:', error);
  //     }
  //   };
  //   doUpdateCheck();
  // }, []);

  return (
    <Router>
      <div className="container">
        <nav className="app-nav">
          <Link to="/" className="nav-action-button">
            <span className="icon">🏠</span>
            <span className="text">Main</span>
          </Link>
          <Link to="/timer" className="nav-action-button">
            <span className="icon">⏱️</span>
            <span className="text">Timer</span>
          </Link>
          <Link to="/settings" className="nav-action-button">
            <span className="icon">⚙️</span>
            <span className="text">Settings</span>
          </Link>
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
            className="theme-toggle-button"
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </nav>
        <Routes>
          <Route path="/" element={<MainApplicationPage />} />
          <Route path="/timer" element={<TimerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
