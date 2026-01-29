# ProAssist

**AI-powered standalone presentation software with optional ProPresenter integration**

ProAssist is a desktop application for creating and managing presentations with intelligent automation and AI-powered content processing. Use it as a standalone presentation tool, or integrate it with ProPresenter and other presentation software that supports file-based text linking. Transform raw text into beautifully formatted slides with custom templates, AI assistance, and real-time synchronization.

## 🎯 Features

### 🤖 AI-Powered Content Processing

- **Multiple AI Providers**: Support for OpenAI (GPT-4, GPT-3.5) and Google Gemini models
- **Intelligent Slide Generation**: Automatically split and format content based on custom prompts
- **Smart Layout Assignment**: AI determines optimal slide layouts (one-line through six-line)
- **Custom AI Prompts**: Define template-specific prompts for specialized content processing

### 📝 Flexible Template System

- **Four Processing Types**:
  - **Simple**: Line/paragraph-based splitting
  - **Regex**: Pattern-based text parsing
  - **JavaScript**: Custom code for complex logic
  - **AI-Powered**: LLM-driven content transformation
- **Customizable Output**: Configure output paths, file naming, and layout options
- **Visual Templates**: Color-coded templates with custom icons

### 🔄 ProPresenter Integration (Optional)

- **File-Based Linking**: Seamless integration via ProPresenter's Linked Text feature
- **ProPresenter API**: Direct integration with ProPresenter's API for advanced control
- **Live Slide Sync**: Instantly update ProPresenter slides with "Go Live" functionality
- **Multi-File Support**: Write to up to 6 text files per template for complex layouts
- **Auto-Scripture Support**: Automatic Bible verse lookup and formatting

### 🌐 Live Slides - Real-Time Collaboration

- **WebSocket-Based System**: Built-in WebSocket server for real-time slide updates
- **Browser-Based Notepad**: Open a notepad in any browser to edit slides live
- **Multi-Device Support**: Share notepad URLs with team members on the same network
- **Live Editing**: Type content in the notepad and see slides update instantly in ProAssist
- **Session Management**: Create multiple Live Slides sessions for different presentations
- **Smart Parsing**: Automatically converts text into slides (blank lines = new slides, tabs = sub-items)
- **Color-Coded Slides**: Visual indicators show slide boundaries and hierarchy

### 📚 Playlist Management

- **Organized Content**: Create and manage playlists of slides
- **Template-Based**: Each playlist item inherits template styling and behavior
- **Easy Editing**: Right-click to edit slides inline
- **Export Options**: Download playlists as formatted text files

### 🎨 Modern UI

- **Dark/Light Themes**: Comfortable viewing in any environment
- **Intuitive Interface**: Clean, organized layout for efficient workflow
- **Real-Time Preview**: See slides before exporting or sending to ProPresenter
- **Auto-Updates**: Automatic update notifications and installation

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **Rust** (latest stable)
- **ProPresenter** (optional, any version with Linked Text support - only needed for ProPresenter integration)
- **AI API Keys** (optional, for AI features):
  - OpenAI API key ([Get one here](https://platform.openai.com/api-keys))
  - Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/crownemmanuel/proassist.git
   cd proassist
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Run in development mode**:

   ```bash
   npm run tauri dev
   ```

4. **Build for production**:

   ```bash
   # macOS
   npm run build:mac

   # Windows
   npm run build:windows
   ```

## 📖 Using ProAssist

ProAssist can be used as a standalone presentation tool for creating, managing, and previewing slides. You can also optionally integrate it with ProPresenter for live presentation workflows.

### Standalone Usage

1. **Import Content**: Click **Import** and paste text or upload a file
2. **Select Template**: Choose a template to format your content
3. **Preview Slides**: Review the generated slides in real-time
4. **Save to Playlist**: Organize slides into playlists
5. **Export**: Download playlists as formatted text files or use the "Go Live" feature to send to ProPresenter (if integrated)

## 📖 ProPresenter Integration Setup (Optional)

### Step 1: Configure Template Output Path

1. Open ProAssist and go to **Settings** → **Templates**
2. Create or edit a template
3. Set the **Output Path** to a folder accessible by ProPresenter (e.g., `C:\ProPresenter\LinkedText\` on Windows or `/Users/YourName/Documents/ProPresenter/LinkedText/` on macOS)
4. Set the **Output File Name Prefix** (e.g., `slide` will create `slide1.txt`, `slide2.txt`, etc.)

### Step 2: Link Files in ProPresenter

1. Open ProPresenter and create a new slide
2. Add text boxes matching your template's layout (e.g., 3 boxes for a three-line layout)
3. For each text box:
   - Right-click → **Format** → **Linked Text**
   - Select **File**
   - Navigate to your template's Output Path
   - Link each box to the corresponding file:
     - Top line → `prefix1.txt`
     - Second line → `prefix2.txt`
     - Third line → `prefix3.txt`
     - (Continue for up to 6 lines)

### Step 3: Use ProAssist with ProPresenter

1. **Import Content**: Click **Import** and paste text or upload a file
2. **Select Template**: Choose a template with your configured output path
3. **Preview Slides**: Review the generated slides
4. **Save to Playlist**: Add slides to a playlist for organization
5. **Go Live**: Click **Go Live** on any slide to instantly update ProPresenter

### Step 4: Configure AI (Optional)

1. Go to **Settings** → **AI Settings**
2. Add your OpenAI or Gemini API key
3. Select your preferred default AI provider
4. Configure AI prompts in your templates for intelligent content processing

### Step 5: Using Live Slides (Optional)

Live Slides enables real-time collaboration for presentations. Perfect for live events where content needs to be edited on the fly.

1. **Start the WebSocket Server**:

   - Go to **Live Slides** page in ProAssist
   - Click **Start** to launch the WebSocket server
   - Note the server address (e.g., `192.168.1.100:9876`)

2. **Create a Session**:

   - Enter a session name and click the **+** button
   - A new Live Slides session will be created

3. **Open the Notepad**:

   - Click the **Copy URL** button to copy the notepad URL
   - Or click **Open in browser** to open it directly
   - Share the URL with team members on the same network

4. **Edit Content**:

   - Type content in the notepad (blank lines create new slides)
   - Use Tab to create sub-items (indented lines)
   - Changes appear instantly in ProAssist's Live Preview

5. **Send to ProPresenter** (if integrated):
   - Import Live Slides sessions into playlists
   - Use **Go Live** to send slides to ProPresenter
   - Slides update automatically as content changes in the notepad

**Live Slides Format**:

- Empty lines separate slides
- Lines starting with Tab (or 4 spaces) become sub-items
- Each slide gets a color indicator for easy identification

## 🛠️ Development

### Project Structure

```
proassist/
├── src/                    # Frontend React/TypeScript code
│   ├── components/         # React components
│   ├── pages/             # Page components
│   ├── services/          # API services (AI, Bible, Firebase)
│   ├── types/             # TypeScript type definitions
│   └── utils/             # Utility functions
├── src-tauri/             # Rust backend
│   ├── src/               # Rust source code
│   └── tauri.conf.json    # Tauri configuration
└── .github/
    └── workflows/         # GitHub Actions workflows
```

### Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Rust, Tauri 2
- **AI**: LangChain, OpenAI API, Google Gemini API
- **Storage**: Firebase (for cloud sync)
- **Bible Data**: KJV Bible JSON

### Available Scripts

- `npm run tauri dev` - Run Tauri app in development
- `npm run build` - Build frontend
- `npm run build:mac` - Build macOS app
- `npm run build:windows` - Build Windows app

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Reporting Issues

- Check existing [Issues](https://github.com/crownemmanuel/proassist/issues) first
- Use clear, descriptive titles
- Include steps to reproduce bugs
- Add screenshots for UI issues

### Submitting Changes

1. **Fork the repository**
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**:
   - Follow existing code style
   - Add comments for complex logic
   - Update documentation as needed
4. **Test your changes**:
   ```bash
   npm run tauri dev
   npm run build
   ```
5. **Commit your changes**:
   ```bash
   git commit -m "Add amazing feature"
   ```
6. **Push to your fork**:
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

### Code Style Guidelines

- Use TypeScript for all new code
- Follow React best practices (functional components, hooks)
- Use meaningful variable and function names
- Add JSDoc comments for public functions
- Keep components small and focused

### Testing

Before submitting:

- Test on both macOS and Windows if possible
- Verify standalone functionality works
- Verify ProPresenter integration works (if applicable)
- Check that AI features work with both providers
- Ensure no console errors or warnings

## 📝 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Tauri](https://tauri.app/) for cross-platform desktop apps
- AI capabilities powered by [LangChain](https://www.langchain.com/)
- Bible data from KJV JSON project

## 📞 Support

- **Documentation**:
  - [Auto-Update Integration Guide](./AUTO_UPDATE_INTEGRATION.md) - Setting up auto-updates
  - [Release Instructions](./RELEASE.md) - How to create new releases
- **Issues**: [GitHub Issues](https://github.com/crownemmanuel/proassist/issues)
- **Releases**: [GitHub Releases](https://github.com/crownemmanuel/proassist/releases)

---

**Made with ❤️ by Emmanuel Crown**
