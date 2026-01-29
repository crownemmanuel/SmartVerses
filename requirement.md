**SmartVerses App - Functional Requirements Document**

**Overview:**
SmartVerses is a tool designed to simplify and standardize the creation of slides for ProPresenter. The app allows users to import text, apply templated logic (regex, JS, or AI), preview the resulting slides, and manage playlists. It includes a live slide sync feature with ProPresenter and supports flexible slide layouts.

---

### 1. **Main Application Layout**

#### 1.1 Interface Structure:

- Two-column layout:

  - **Left Column (Playlist Pane)**

    - List of playlists with titles.
    - Each playlist shows list items/slides at the bottom.

  - **Right Column (Slide Display Area)**

    - Displays slides as single-line table rows.
    - Header section with buttons: **Show**, **Settings**, **Import**.

#### 1.2 Slide Interaction:

- Clicking on a list item displays its content as rows.
- Right-click on a row allows **editing** text and **saving** changes.
- Button: **Make Live** – sets the selected slide as live.

  - Live slide is highlighted in green.
  - Content of the slide is saved to a file ProPresenter reads in real-time.

---

### 2. **Settings Page**

#### 2.1 Layout:

- Two-column view:

  - **Left:** List of settings.
  - **Right:** Parameters for each setting.

#### 2.2 Template Management:

- Each template includes:

  - **Name**
  - **Color Picker** for template color
  - **Template Type (4 types):**

    - **Simple** (Line/Paragraph break)
    - **Regex** – Split logic using regular expressions
    - **JavaScript Formula** – Code to split text into slides
    - **AI Powered** – Prompt-based LLM response for slide splitting

- Templates may include **slide layout definitions**:

  - Layout types: one-line, two-line, three-line, four-line

---

### 3. **Import Flow**

#### 3.1 Import Options:

- Open import window from header
- Input options:

  - Paste text
  - Upload file (txt)

#### 3.2 Template Selection:

- User selects one of the 4 template types
- Based on selection:

  - Regex: apply expression
  - JavaScript: execute formula
  - AI: send text + layout info + prompt to backend
  - Simple: break by line/paragraph

#### 3.3 Output:

- Scrollable preview of parsed slides
- User options:

  - **Save to Playlist**
  - **Download as TXT** (slides separated by blank lines)

---

### 4. **Playlist Management**

- Each playlist item displays: DONE (Mock data for title)

  - Title and color (from template)
  - Label showing template name

- Each slide includes:

  - Display of layout type (e.g. one-line, two-line)
  - Text arranged per layout definition

---

### 5. **Live Slide Output**

- Only one slide can be live at a time
- Live slide is saved to file used by ProPresenter
- System updates the file each time a new slide is made live

---

### 6. **AI Slide Layout Assignment**

- AI template includes prompt input
- Prompt includes list of possible layouts
- LLM decides how to group content and assign layouts:

  - Example: heading + subheading => two-line layout

---

**Summary:**
SmartVerses is a slide-authoring tool for ProPresenter that enables structured imports, custom templates, AI-enhanced text parsing, live slide sync, and layout-aware formatting. It simplifies the workflow for creating consistent presentation content across playlists and templates.
