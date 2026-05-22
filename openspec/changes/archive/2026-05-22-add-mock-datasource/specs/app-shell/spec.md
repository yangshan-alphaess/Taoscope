## MODIFIED Requirements

### Requirement: Application Shell Layout

The main window SHALL render five regions: a custom TitleBar at top, a left Sidebar, a central Schema area, a right Main area with a Tab container, and a StatusBar at bottom. Each region's content SHALL be sourced through the `DataSource` abstraction (mock or real) rather than being a hard-coded placeholder.

#### Scenario: All five regions are present

- **WHEN** the application is opened in either `pnpm dev` or `pnpm tauri dev`
- **THEN** the DOM contains identifiable elements for TitleBar, Sidebar, Schema area, Main area with at least one Tab, and StatusBar

#### Scenario: TitleBar is custom and draggable

- **WHEN** the application runs inside the Tauri shell
- **THEN** the native window decorations are hidden and the custom TitleBar exposes a drag region that allows moving the window

#### Scenario: macOS traffic lights remain visible

- **WHEN** the application runs on macOS inside the Tauri shell
- **THEN** the native close / minimize / maximize controls (traffic lights) remain visible and functional on top of the custom TitleBar

#### Scenario: Region content is data-driven

- **WHEN** any of Sidebar, Schema area, Main area, or StatusBar renders content
- **THEN** the content originates from calls to `useDataSource()` (or global state derived from it), and no component imports a concrete `DataSource` implementation class directly
