# Synodos Log

A Progressive Web Application (PWA) designed for tracking Hours of Service (HoS) records for commercial drivers, tailored to meet Ontario regulations. Synodos Log provides an intuitive, offline-capable interface for drivers to manage their daily logs, calculate totals, and export compliant PDF reports.

## Features

- **Offline-First Architecture**: Fully functional without an internet connection. Data is stored locally using IndexedDB and syncs seamlessly.
- **Interactive Log Grid**: Easily log statuses (Off-Duty, Sleeper, Driving, On-Duty) in 15-minute intervals across a 24-hour grid.
- **PDF Export**: Generate professional, regulation-compliant PDF reports for any given week.
- **Automated Calculations**: Automatically calculates daily totals and ensures accurate accounting of hours.
- **Presets and Automation**: Save frequent daily schedules as presets. Auto-populates starting odometers based on previous day entries.
- **Dashboard Management**: View, edit, and manage all your past weekly logs in a centralized dashboard.
- **Cross-Platform**: Installable as a standalone app on iOS, Android, and Desktop platforms.

## Technologies Used

- **Frontend**: React 18, TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS, Radix UI Primitives, Lucide React
- **Storage**: IndexedDB (idb wrapper)
- **PDF Generation**: jsPDF, html2canvas
- **PWA**: vite-plugin-pwa

## Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone the repository and navigate into the project directory:
  ```bash
   cd HoS
  ```
2. Install the project dependencies:
  ```bash
   npm install
  ```

### Development

To start the local development server with Hot Module Replacement (HMR):

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

### Building for Production

To build the application for production:

```bash
npm run build
```

This will run the TypeScript compiler and Vite build process, outputting the optimized static files to the `dist` directory.

### Preview Production Build

To preview the production build locally:

```bash
npm run preview
```

## Linting

To run ESLint and check for code quality issues:

```bash
npm run lint
```

## Copyright

Copyright (c) 2026 SynOdos. All rights reserved.