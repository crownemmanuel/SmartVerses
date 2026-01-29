# Changelog

All notable changes to ProAssist will be documented in this file.

## [0.7.0] - 2026-01-27

### Added
- **Onboarding Screen Workflow**: Complete onboarding screen implementation to guide new users through app setup
- **Offline Model Preloading**: Added offline model preloading with progress UI for better user experience
- **Offline Transcription Support**: Added offline Whisper transcription support with proper segmentation and memory management
- **Audience Display Slides Support**: Added slides support for audience screen display with layout fallback logic
- **OS-Aware Audience Display**: Implemented OS-aware audience display with dedicated Windows implementation and improved multi-monitor support
- **Display Scripture Clearing**: Added automatic scripture clearing on app startup and window close

### Fixed
- **Offline Model WASM Loading**: Fixed offline model WASM loading in production builds with proper CSP configuration
- **Memory Leak in Offline Transcription**: Fixed memory leak by properly terminating web workers in offline transcription services
- **Duplicate Words in Whisper**: Fixed duplicate words issue in Whisper transcription
- **Windows Window Positioning**: Fixed Windows window positioning using f64 for Tauri WebviewWindowBuilder API
- **Timer Overlay Color**: Fixed timer overlay color in test window to show red on overrun
- **Audience Display Text Visibility**: Fixed text not showing up in audience display
- **TypeScript Build Errors**: Fixed TypeScript errors in transformersEnv configuration and missing RecordRTC import

### Changed
- **Light Mode Display**: Optimized light mode display for better visibility
- **Settings Menu**: Hide disabled feature menu items in Settings page for cleaner UI
- **Audience Display Font Size**: Updated audience display font size defaults and limits
- **Default Template Output Paths**: Updated default template output paths
- **Transformers.js Configuration**: Simplified transformersEnv configuration for production builds
- **CSP Updates**: Added cdn.jsdelivr.net to CSP for transformers.js WASM files

### Technical
- Unified audience display page implementation
- Removed unused Tauri commands: get_monitors and update_second_screen_number
- Improved web worker management for offline transcription
- Enhanced audience display with better OS detection and window management

## [0.6.9] - 2026-01-27

### Added
- **Word Highlighting in Bible Verse Search**: Implemented word highlighting in Bible verse search results for better visibility
- **HTTP Call Automation**: Added HTTP call automation feature for schedule automations
- **Transcription Time Limit**: Added transcription time limit with auto-stop protection to prevent overcharging
- **Blank Presentation Creation**: Added feature to create blank presentations in ProPresenter
- **Audio Level Meter**: Added audio level meter to Live Transcription panel for real-time audio monitoring
- **API Documentation**: Updated API docs styling and endpoints

### Fixed
- **Transcription Limit Prompt**: Fixed transcription limit prompt re-appearing after auto-stop
- **Remote Transcription De-duplication**: Fixed remote transcription de-duplication and useEffect dependency cycle
- **Icons Update**: Updated icons for Slides and Live Testimonies

### Changed
- **Release Process**: Updated release process rules to require descriptive tag messages

## [0.6.7] - 2026-01-21

### Changed
- Version bump to 0.6.7

## [0.6.6] - 2026-01-20

### Added
- **Groq Model Token Limits Display**: Added token limits (TPD and RPD) to all Groq model selector labels
  - Model dropdowns now show "Free tokens per day" and "Free requests per day" for each Groq model
  - Helps users understand rate limits when selecting models
  - Updated tip text to explain RPD (free request per day) and TPD (free token per day)

### Changed
- **Minimum App Width**: Increased minimum window width from 800px to 1000px for better UI layout
- **Responsive Button Labels**: "Live Slides" and "Live Transcription" buttons now hide text labels when window width is 1000px or less
  - Shows only icons on smaller widths to prevent UI from looking cramped
  - Full labels displayed when window is wider than 1000px

## [0.6.5] - 2026-01-19

### Fixed
- **Audio Recording Race Condition**: Fixed critical bug where audio files were not being saved to disk
  - Fixed race condition between chunk writes and file finalization in streaming audio recording
  - Added promise tracking to ensure all chunks are written before closing file
  - Audio recordings now properly save to disk in the correct location
- **MP3 Encoding Error**: Fixed "MPEGMode is not defined" error during MP3 conversion
  - Replaced `lamejs` with `@breezystack/lamejs` for ES module bundler compatibility
  - MP3 conversion now works correctly after recording stops
- **Recording UX**: Fixed two-click issue when starting new recording after previous recording
  - Record button now starts recording immediately (no second click needed)
  - Automatically cleans up previous recording state when starting new recording
  - Removed redundant "New Recording" button

### Changed
- **Audio Recording Logging**: Added comprehensive logging for debugging audio recording issues
- **Vite Configuration**: Updated build config for better CommonJS module handling

## [0.6.4] - 2026-01-19

### Added
- **Crash-Safe Streaming Recording**: Production-grade video and audio recording with real-time disk streaming
  - Video chunks streamed directly to disk (no memory accumulation)
  - MP3 audio streams to temp WebM file, converts after recording
  - WAV audio flushes to disk every second
  - Record for 10+ hours without memory issues
  - All recordings preserved even if app crashes or power is lost
  - Recovery documentation and FFmpeg commands in Help section

## [0.6.3] - 2026-01-18

### Fixed
- **Video Recording Automation**: Keep video feed always live for automation support
  - Video preview stays active after recording stops (no more blank screen)
  - Automation can now start new recordings without re-engaging camera
  - Removed 'New Recording' button - record button always starts new recording
  - Show brief 'Recording saved!' message below live feed after save
- **Remote Transcription AI Detection**: Fixed AI paraphrase detection for remote transcription source
  - When using remote transcription source, now also runs AI paraphrase detection
  - Detected paraphrased Bible references are displayed with confidence scores
  - Scripture references (both direct and paraphrased) are included in websocket rebroadcast
  - Key points from AI analysis are also preserved and broadcast

### Changed
- **Video Recording Controls**: Simplified video recording controls flow
  - Record button always starts new recording (whether idle or stopped)
  - Camera feed remains live throughout recording lifecycle

## [0.6.2] - 2026-01-18

### Fixed
- **TypeScript Build Errors**: Fixed TypeScript compilation errors in RecorderPage
  - Added explicit VideoRecorderConfig type import and annotation
  - Added BlobEvent type annotation for ondataavailable handler
  - Improved type safety for video recorder creation
- **Audio Device Selection**: Fixed audio device selection for browser getUserMedia API
  - Native audio device IDs (from Tauri) don't work with browser getUserMedia
  - Added fallback to default audio device when native ID fails
  - Fixes audio meter visualization and web audio recording (MP3 mode)
- **Audio Recording Mono Output**: Fixed audio recording to properly output mono audio
  - Use Web Audio API to force mono output for web audio recording (MP3)
  - Browser channelCount constraint is unreliable, explicit mixing ensures mono
  - Properly clean up audio context when recording stops
- **Video Recorder Preview**: Removed video playback preview after recording due to WebView compatibility issues
  - Video files are still saved correctly to disk and can be played in external players
  - Shows "Recording saved!" confirmation message instead of video player
  - Audio playback preview continues to work as before

### Changed
- **Recorder Page**: Simplified video recording UI to show success message instead of attempting video playback
  - Removed video blob URL and asset protocol URL handling for preview
  - Cleaned up unused video playback state variables and refs

## [0.6.1] - 2026-01-16

### Changed
- **Network Sync - Follow Master Timer**: Moved "Follow Master Timer" toggle from Network Settings to Timer page for better UX
  - Toggle now appears directly on the Timer page when in slave/peer mode
  - When enabled, timer controls (Start/Stop buttons) are disabled to indicate display-only mode
  - Timer page now listens to Network Settings changes in real-time
- **Schedule Sync**: Improved schedule synchronization to prevent automation conflicts
  - Automations are never synced over the network (stripped before broadcast)
  - Local automations are preserved and merged by matching session names
  - Prevents master automations from overwriting local automation configurations
- **Stage Assist Context**: Enhanced schedule merging logic to preserve local automations when syncing from master

### Technical
- Added `scheduleSync.ts` utility with `stripScheduleAutomations()` and `mergeScheduleWithLocalAutomations()` functions
- Improved network sync event handling with custom events for in-app updates
- Enhanced timer state management when following master timer

## [0.6.0] - 2026-01-16

### Changed
- **Network Sync**: Updated network synchronization service and components
- **Schedule Automation**: Enhanced schedule automation modal functionality
- **Stage Assist**: Improved stage assist context and page components
- **Recorder Page**: Updated recorder page with latest improvements
- **Type Definitions**: Updated network sync and ProPresenter type definitions

## [0.5.6] - 2026-01-16

### Added
- **Live Notepad Bullet List**: Added bullet list functionality to Live Slides notepad
  - Press Tab to convert lines to bulleted lists with visual bullet character (•)
  - Press Enter to continue bullet list on new line
  - Press Backspace to remove bullet prefix
  - Added "Bullet List" toolbar button that highlights when cursor is on bulleted line
  - Bullet characters are automatically stripped when importing/syncing slides to main app
- **Slide Dividers**: Added visual divider lines between slides in Live Notepad
  - Toggle "Slide Dividers" button in toolbar to show/hide horizontal lines
  - Enabled by default to help visualize slide boundaries
  - Lines appear at the bottom of each slide's last line

### Changed
- **Live Notepad Slide Boundaries**: Fixed slide boundary logic
  - Consecutive non-indented lines are now correctly grouped as one slide
  - Color indicators now show same color for lines on the same slide
  - Improved visual consistency with actual slide parsing behavior
- **Live Notepad Transcription Panel**: Enhanced UI layout
  - Search transcript box now full width
  - Checkboxes (Transcript, Scripture refs, Key points) positioned directly below search
  - Auto-scroll checkbox repositioned to top right of transcription display area
  - Scripture refs and Key points checkboxes checked by default
  - Auto-scroll checkbox styling improved (no border/background, reduced padding)
- **Favicon Updates**: Updated favicon to ProAssist icon across all pages
  - Live Notepad page now uses ProAssist icon
  - Remote timer page now uses ProAssist icon
  - Browser transcription page now uses ProAssist icon

## [0.5.5] - 2026-01-16

### Changed
- Version bump to 0.5.5

## [0.5.4] - 2026-01-16

### Fixed
- **Bible Parsing**: Improved scripture reference parsing and verse extraction accuracy
  - Enhanced bible service with better reference matching and verse lookup
  - Fixed parsing issues with various scripture reference formats

### Changed
- **Live Slides Notepad**: Enhanced parsing and display of live notes
  - Improved text processing and formatting for better readability
- **SmartVerses Page**: Updated transcription and verse detection interface
  - Better integration with bible parsing service
  - Improved verse reference detection and display

### Added
- **Documentation**: Updated installation and usage documentation
  - Added macOS installation instructions
  - Enhanced documentation with additional details and examples

## [0.5.3] - 2026-01-15

### Fixed
- **Firebase Connection Issues**: Fixed Live Testimonies timeout errors on production builds
  - Added Firebase Realtime Database script-src allowances for long-polling fallback (`.lp` endpoints)
  - Added Firebase connect-src allowances for WebSocket and HTTP connections
  - Fixed CSP blocking Firebase connections on some production machines
- **Tauri IPC Connection Issues**: Fixed "Refused to connect to ipc://localhost" errors
  - Added `ipc:` and `ipc://localhost` to connect-src directive
  - Fixed Live Slides server, Network Sync, and other Tauri command calls being blocked
- **Localhost Connection Issues**: Fixed localhost HTTP/WebSocket connections being blocked
  - Added `http://localhost:*`, `http://127.0.0.1:*`, `ws://localhost:*`, `ws://127.0.0.1:*` to connect-src
- **Stylesheet CSP Errors**: Fixed "Refused to apply a stylesheet" errors
  - Added `style-src 'self' 'unsafe-inline'` directive

### Added
- **DevTools in Production**: Enabled developer tools for production builds
  - Added `devtools` feature to Tauri backend
  - Added `toggle_devtools` Tauri command for opening/closing inspector
  - Added "Open Inspector" button in Settings → Version → Developer Tools
  - Added keyboard shortcuts: F12, Cmd+Opt+I (macOS), Ctrl+Shift+I (Windows/Linux)
- **Firebase Error Handling**: Improved error reporting for Firebase connection failures
  - Added timeout detection and error callbacks for Firebase subscriptions
  - Better error messages when Firebase connections fail

### Changed
- **Content Security Policy**: Updated CSP to support all required external connections
  - Firebase Realtime Database (any project, not just specific domains)
  - Tauri IPC protocol
  - Localhost HTTP/WebSocket connections
  - Inline styles for Tauri WebView compatibility

## [0.5.2] - 2026-01-15

### Added
- **Debounced Effect Hook**: New `useDebouncedEffect` hook for optimized form input handling and settings persistence
- **Public Live Slides HTML**: Added standalone `live-slides.html` file for external access to live slides interface

### Changed
- **Settings Components**: Enhanced all settings forms with debounced effect for improved performance and reduced unnecessary saves
  - AISettingsForm: Debounced API key and model selection updates
  - LiveSlidesSettings: Optimized settings persistence with debounced saves
  - LiveTestimoniesSettings: Improved form handling with debounced effects
  - NetworkSettings: Enhanced network configuration with debounced updates
  - ProPresenterAITemplatesSettings: Optimized template settings persistence
  - ProPresenterSettings: Improved connection settings handling
  - SmartVersesSettings: Enhanced transcription settings with debounced effects
- **Live Slides Service**: Improved WebSocket handling and message broadcasting
- **Main Application Page**: Enhanced UI and state management
- **SmartVerses Page**: Improved transcription interface and settings integration

### Technical
- Added `useDebouncedEffect.ts` hook utility for consistent debouncing across components
- Updated Tauri backend with improved WebSocket broadcasting capabilities
- Enhanced Live Slides types with additional message payload support
- Improved component state management and performance optimizations

## [0.5.1] - 2025-01-29

### Changed
- **Transcription Settings UI**: Reorganized Transcription Settings for better UX
  - Combined "Native Microphone" and "Microphone" fields into a single "Microphone" dropdown that automatically shows native devices when native audio capture is enabled
  - Moved "AssemblyAI API Key" section to appear right after "Transcription Engine"
  - Moved "Run transcription in browser" checkbox to appear directly below microphone selection

### Improved
- **Transcription Stop Button**: Added immediate visual feedback when stopping transcription
  - Button shows "Stopping..." with spinner icon and is disabled immediately when clicked
  - Prevents multiple stop requests and provides clear feedback during the stopping process

### Fixed
- **Browser Transcription Text Visibility**: Fixed black text visibility issues when browser transcription mode is enabled
  - Changed "Browser" badge text color from black to white for better visibility on warning-colored background
  - Changed "Waiting for browser..." button text color from black to white

## [0.5.0] - 2025-01-28

### Added
- **Live Transcription Streaming via WebSocket**: SmartVerses transcriptions can now be streamed in real-time to Live Slides Notepad and other WebSocket clients
- **Transcription Settings**: Added "Stream transcription output to WebSocket" checkbox in SmartVerses Settings (enabled by default)
- **Live Transcription Panel in Notepad**: New "Live Transcription" button in Live Slides Notepad that enables a 70/30 split view
- **Transcription Chunk Cards**: Final transcript chunks appear as bordered cards with click-to-add functionality
- **Client-Side Filters**: Filter transcription display by Transcript, Scripture References, and Key Points
- **Real-time Transcription Display**: See interim and final transcripts as they arrive, including detected scripture references and extracted key points
- **WebSocket Broadcast Service**: New Tauri command to broadcast transcription events to all connected Live Slides clients

### Changed
- Live Slides Notepad now supports split-view mode for viewing live transcriptions alongside slide editing
- Transcription chunks can be directly added to slides via click-to-insert functionality

### Technical
- Added `broadcast_live_slides_message` Tauri command for flexible WebSocket broadcasting
- Extended Live Slides WebSocket message types to include `transcription_stream` payload
- Transcription broadcast service integrates with existing Live Slides `/ws` server infrastructure
- Key points and scripture references are included in transcription stream when enabled in settings

## [0.4.1] - 2025-01-27

### Added
- ProPresenter connection selector for all "Get Slide" buttons
- Connection selector dropdown appears when 2+ ProPresenter connections are enabled
- Connection label display when only 1 connection is enabled (shows which connection is being used)

### Fixed
- Fixed tab switching bug in Timer Schedule Automation modal - no longer switches back to "Trigger Slide" tab when clicking "Get Slide" after switching to "Change Layout" tab
- Fixed issue where automation modal would re-initialize when currentAutomations prop changed, causing unwanted tab resets

### Changed
- All "Get Slide" functionality now uses the selected ProPresenter connection instead of trying all connections sequentially
- Improved UX: users can now explicitly choose which ProPresenter instance to get slides from when multiple instances are configured

### Technical
- Updated ActivatePresentationModal, ScheduleAutomationModal, LiveTestimoniesSettings, and AISettingsForm to include connection selection
- Added hasInitialized flag to ScheduleAutomationModal to prevent unwanted re-initialization

## [0.4.0] - 2025-01-XX

### Added
- Network import for live slides from master server - backup sync method when WebSocket auto-sync doesn't work well
- `/api/live-slides` JSON endpoint in backend to expose all live slide sessions
- Import dropdown with "From Text" and "From Network" options (matches Load Schedule pattern)
- ImportFromNetworkModal component that uses existing network sync settings (no manual IP/port input needed)
- Auto-fetch sessions when network import modal opens
- Session selection with checkboxes, marking already imported sessions
- "Select All New" and "Clear" buttons for bulk selection

### Changed
- Import button now shows as dropdown menu with multiple import options
- "From Network" option is disabled when not configured as slave/peer (shows "Not configured" badge)

### Technical
- Added `fetchSlidesFromMaster()` function in liveSlideService
- Network import uses same connection settings as schedule sync (Settings → Network)
- Follows same pattern as "Get Latest from Master" for schedules

## [0.3.4] - 2025-01-13

### Fixed
- Fixed ProPresenter connection failures on Windows by adding HTTP protocol support to Content Security Policy (CSP)
- Windows WebView2 was blocking HTTP fetch requests to ProPresenter API due to missing `http://localhost:*` and `http://*:*` in CSP `connect-src` directive

### Technical
- Updated CSP in `tauri.conf.json` to allow HTTP connections for ProPresenter API integration
- Added support for both `http://localhost:*` and `http://127.0.0.1:*` for better cross-platform compatibility

## [0.3.3] - 2025-01-12

### Added
- Vision model recommendations in Timer Assistant settings that dynamically suggest appropriate models based on selected provider
- Helpful tips for Groq (Llama 4 Scout/Maverick), Gemini (1.5 Flash/Pro, 2.0 Flash), and OpenAI (GPT-4o, GPT-4o mini, GPT-4 Turbo)

### Changed
- Enhanced Timer Assistant settings UI with contextual model recommendations for better user guidance

## [0.3.2] - 2025-01-XX

### Fixed
- Improved error handling for localStorage template parsing with try-catch blocks
- Enhanced error logging for Live Slides auto-start server failures
- Added error logging for WebSocket reconnection failures in Live Slides and Network Sync services
- Better error messages when template loading fails

### Changed
- Improved error handling and logging throughout the application for better debugging

## [0.3.1] - 2025-01-XX

### Added
- Firebase configuration import modal for easier setup
- Firebase config parser utility for validating and importing Firebase settings

### Changed
- Improved import modal functionality
- Enhanced Live Testimonies settings
- Updated ProPresenter service integration

### Fixed
- Various UI improvements and bug fixes

## [0.3.0] - 2025-01-XX

### Changed
- Upgraded version target to 0.3.0 for enhanced stability and performance

## [0.2.6] - 2025-01-XX

### Added
- ProPresenter presentation activation feature - automatically trigger presentations when slides go live
- Global activation button to set default presentation for all slides in a playlist item
- Per-slide activation override to customize presentation triggers for individual slides
- Timer dropdown for slides - select schedule sessions to trigger when going live
- Auto-start timer sessions when "Go Live" is clicked if a timer session is selected
- Ability to remove/clear activation triggers at both global and slide levels
- ActivatePresentationModal component for configuring presentation triggers

### Changed
- ProPresenter test connection now uses `/version` endpoint instead of `/v1/version`
- Improved ProPresenter connection test success message to show host description
- Slide activation buttons now show "None", "Default", or "Custom" based on configuration

### Fixed
- ProPresenter test connection endpoint (changed from `/v1/version` to `/version` to fix 404 errors)
- Live Slides production build issues with embedded HTTP server and WebSocket paths
- Slide parsing improvements for Live Slides

### Technical
- Added `getCurrentSlideIndex()` and `triggerPresentationSlide()` API functions
- Added `ProPresenterActivationConfig` type for presentation activation settings
- Enhanced slide and playlist item types with activation configuration properties
- Improved Live Slides WebSocket connection handling

## [0.2.5] - 2024-12-19

### Added
- Update notification component that checks for updates on app startup
- Developer mode with log viewer to debug issues and view console logs
- Enhanced WebSocket error logging with detailed connection information
- Session creation loading states and success messages in Live Slides modal
- Copy link button in Live Slides linked items when session is active
- macOS installation instructions in release notes for unsigned app

### Changed
- Improved Live Slides session creation UX with loading and success states
- Enhanced update check logging with `[Updater]` prefixes for easier filtering
- Updated release notes template to include macOS installation instructions
- Reordered Version Settings page (Updates at top, Developer Tools at bottom)
- Updated button styling (Check for Updates is purple, Developer Mode is dark gray)

### Fixed
- WebSocket connection issues in production builds (added CSP for WebSocket connections)
- Local IP detection fallback to 127.0.0.1 when detection fails
- Session creation status messages (shows "Creating session..." instead of "Session not running" during creation)

### Technical
- Added Content Security Policy to allow WebSocket connections
- Enhanced WebSocket error handling and logging
- Added session creation state tracking
- Improved local IP detection with fallback

## [0.2.4] - Previous Release
- Initial release with auto-update support
