---
name: Technical Assessment Logic
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#464555'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-padding-desktop: 32px
  container-padding-mobile: 16px
  table-cell-padding: 8px 12px
  gutter: 16px
---

## Brand & Style

The design system is engineered for a high-utility, white-label environment. It bridges the gap between a robust developer tool and a professional enterprise platform. The aesthetic is rooted in **Corporate Modernism** with a heavy influence from **Minimalism**, prioritizing information density, clarity, and performance.

### Design Principles
- **Functional Density:** Information is packed tightly to allow recruiters to scan large datasets without excessive scrolling, while maintaining a clear visual hierarchy.
- **Contextual Adaptation:** The UI shifts between a "Management Mode" (Recruiter) and a "Performance Mode" (Candidate). Management mode uses high-density grids; Performance mode uses generous whitespace and focused containers to reduce cognitive load.
- **Neutral Core, Dynamic Edge:** The system maintains a monochromatic core (Slate/Charcoal) to ensure third-party branding (via dynamic accent variables) feels integrated rather than overlaid.
- **Technical Authority:** Layouts mirror IDE structures (sidebars, tabbed panes, monospaced data) to resonate with a technical audience.

## Colors

This design system utilizes a "Dynamic Accent" strategy. While the core framework is built on a sophisticated Slate palette, all interactive and brand-identifying elements are mapped to CSS variables.

### Palette Roles
- **Primary (--accent):** Used for primary actions, progress indicators, and active states. Defaulting to Indigo #4F46E5, it is intended to be overridden by the client's brand color.
- **Neutrals:** A scale of Slates (900 for text, 500 for secondary text, 200 for borders, 50 for backgrounds).
- **Status Colors:** Standardized Semantic colors for Success (Emerald), Warning (Amber), and Error (Rose) to ensure universal understanding during assessments.
- **Code Syntax:** A specialized sub-palette for the code editor, optimized for high-contrast legibility.

## Typography

The system uses **Inter** for all UI elements to ensure maximum legibility at small sizes and high-density layouts. **JetBrains Mono** is utilized exclusively for code blocks, technical data, and terminal outputs.

### Hierarchy Rules
- **Recruiter View:** Relies heavily on `body-sm` and `label-caps` to maximize data visibility in tables and filters.
- **Candidate View:** Utilizes `headline-md` and `body-md` to provide a more breathable, readable experience for long-form problem statements.
- **Code Readability:** Code editors must maintain a 1.5x line-height ratio to prevent visual crowding during complex logic assessment.

## Layout & Spacing

The layout philosophy is based on a **Fixed-Fluid Hybrid** model. Navigation and sidebars are fixed-width to ensure tool accessibility, while content areas are fluid to accommodate wide data tables and side-by-side code editors.

### Spacing Scales
- **Management Layout (Recruiter):** Uses a 4px base unit. Component margins are minimized (8px - 12px) to keep related data points proximal.
- **Focused Layout (Candidate):** Uses an 8px base unit. Margins are increased (24px - 32px) to isolate the problem statement from the workspace.
- **Grid:** A 12-column system is used for dashboard views, while workspace views utilize a flexible "Pane" system with draggable dividers.

## Elevation & Depth

To maintain a "Professional/Technical" feel, the system avoids heavy shadows, instead using **Tonal Layering** and **Low-Contrast Outlines**.

### Depth Levels
- **Level 0 (Canvas):** The base background (Slate 50).
- **Level 1 (Surface):** The primary card and container background (White). Defined by a 1px border (Slate 200).
- **Level 2 (Overlay):** Dropdowns, tooltips, and modals. These use a very subtle, crisp shadow (0 4px 6px -1px rgba(0,0,0,0.1)) combined with a 1px border to ensure separation from Level 1.
- **Focus State:** Interactive elements use a 2px offset ring in the dynamic `--accent` color to meet accessibility standards.

## Shapes

The shape language is precise and understated. A "Soft" rounding (4px/0.25rem) is applied to standard components like buttons and inputs to feel modern but structured. 

### Implementation
- **Standard (4px):** Buttons, Input fields, Checkboxes.
- **Large (8px):** Cards, Modal containers, Code editor wrappers.
- **Pill:** Reserved exclusively for status badges (e.g., "Passed," "In Progress") to distinguish them from interactive buttons.

## Components

### Buttons & Inputs
- **Primary Button:** Uses the `--accent` variable. Solid fill with white text.
- **Secondary Button:** Ghost style with a Slate 200 border. Shifts to a light Slate 50 background on hover.
- **Input Fields:** 1px Slate 200 border. Transitions to 1px `--accent` on focus with a subtle glow.

### High-Density Tables
- Rows have a 32px height in recruiter view.
- Hover states use a subtle Slate 50 tint.
- Column headers use `label-caps` with sort icons that appear on hover.

### Workspaces (Candidate)
- **Split Pane:** A vertical divider separates the instructions (left) from the code editor (right).
- **Tabs:** Underline style for active states using the `--accent` color. 

### Branding Logic
- **White-label Logo:** The top-left navigation area contains a container of max-height 32px. Logos are rendered in monochrome or full color based on the client configuration, always centered within the designated safe area.