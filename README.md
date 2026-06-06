# TabletopForge

TabletopForge is an incident response tabletop exercise generator for small businesses, MSPs, IT teams, and cybersecurity students.

Tagline: Simple incident response tabletop exercises for real-world readiness.

## Overview

The app creates practical tabletop packages that help organizations test incident response planning without paid APIs or complex inject design. It focuses on discussion quality, IRP gap discovery, and executive-ready documentation.

## Features

- Scenario builder for phishing/BEC, ransomware, data exfiltration, compromised admin accounts, lost laptops, vendor breaches, insider threats, and cloud misconfiguration
- Organization profile fields for industry, size, maturity level, duration, and optional question sets
- Scenario summaries, objectives, participants, discussion questions, IRP gap-discovery questions, expected decisions, facilitator notes, and executive summaries
- Lessons-learned template with action item, owner, due date, and priority prompts
- Copyable and downloadable Markdown reports
- Browser-based saved exercises with LocalStorage
- Responsive dark GRC dashboard interface

## Tech Stack

- Next.js 15
- TypeScript
- Tailwind CSS
- shadcn/ui-style components
- App Router
- LocalStorage

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build And Lint

```bash
npm run lint
npm run build
```

## Portfolio Case Study

Read the case study on my portfolio: https://tatewilson1.github.io/case-tabletopforge.html

## Resume Bullet

Built TabletopForge, a full-stack incident response tabletop exercise generator that creates scenario-based discussion guides, IRP gap-discovery questions, executive summaries, and lessons-learned templates for cybersecurity readiness planning.

## Disclaimer

TabletopForge does not replace professional legal, compliance, cybersecurity, or incident response advice. Use it as a readiness planning aid and validate decisions with qualified advisors.
