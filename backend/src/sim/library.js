// Curated simulation library.
//
// Builds a complete, playable, branching simulation for every supported scenario type without
// any AI call. It is the default experience when AI is disabled, the safety net when an AI call
// fails, and the quality bar AI-generated simulations are asked to match.

import { SIM_SCHEMA_VERSION, hashString, normalizeSimulation } from "./engine.js";

const PHASES = [
  { id: "detect", name: "Detection & triage", objective: "Recognize the incident, declare it, and get the right people in the room." },
  { id: "contain", name: "Containment", objective: "Stop the damage from growing while keeping critical operations alive." },
  { id: "coordinate", name: "Communications & obligations", objective: "Manage leadership, legal, regulatory, customer, and media pressure." },
  { id: "recover", name: "Recovery & lessons", objective: "Restore safely, verify, and capture what must change." },
];

const CLOCK_LADDER = ["T+0:00", "T+0:20", "T+0:45", "T+1:30", "T+2:30", "T+4:00", "T+8:00", "T+24h", "T+36h", "T+48h", "T+72h", "T+5d", "T+7d"];

const INDUSTRY = {
  Healthcare: { data: "patient records (PHI)", crown: "the EHR system", people: "patients", regulator: "the HHS Office for Civil Rights", rule: "the HIPAA Breach Notification Rule", ops: "Clinical Operations Lead" },
  Education: { data: "student records", crown: "the student information system", people: "students and families", regulator: "the state education agency", rule: "FERPA and state student-privacy law", ops: "Academic Operations Lead" },
  "Financial Services": { data: "customer account and financial data", crown: "the core banking platform", people: "customers", regulator: "your primary financial regulator", rule: "the GLBA Safeguards Rule and regulator incident-notification deadlines", ops: "Customer Operations Lead" },
  Manufacturing: { data: "product designs and customer order data", crown: "the production scheduling (ERP/MES) system", people: "customers and suppliers", regulator: "the state attorney general", rule: "state breach-notification laws and customer contract clauses", ops: "Plant Operations Manager" },
  "Local Government": { data: "resident records", crown: "the utility billing and permitting system", people: "residents", regulator: "the state CISO office and attorney general", rule: "state breach-notification and public-records law", ops: "Public Services Director" },
  Nonprofit: { data: "donor and beneficiary records", crown: "the donor CRM", people: "donors and program participants", regulator: "the state attorney general", rule: "state breach-notification laws and grant agreements", ops: "Program Director" },
  "Small Business": { data: "customer and payment data", crown: "the point-of-sale and accounting system", people: "customers", regulator: "the state attorney general", rule: "state breach-notification laws and PCI DSS obligations", ops: "Operations Manager" },
  "MSP / IT Provider": { data: "client credentials and network documentation", crown: "the RMM platform", people: "client companies", regulator: "the state attorney general", rule: "client contract notification clauses and state breach-notification laws", ops: "Service Delivery Manager" },
  Other: { data: "sensitive customer and employee data", crown: "the primary line-of-business system", people: "customers", regulator: "the state attorney general", rule: "state breach-notification laws and contractual obligations", ops: "Operations Lead" },
};

// --- tiny authoring DSL ------------------------------------------------------

const opt = (quality, label, consequence, [containment = 0, operations = 0, trust = 0, compliance = 0] = [], setsFlags = []) => ({
  quality,
  label,
  consequence,
  effects: { containment, operations, trust, compliance },
  setsFlags,
});

const decide = (ownerRoleId, capability, csf, prompt, recommendation, options) => ({
  ownerRoleId,
  capability,
  csf,
  prompt,
  recommendation,
  options,
});

// --- shared building blocks --------------------------------------------------

const SHARED = {
  media: (s) => ({
    id: "media",
    phaseId: "coordinate",
    tier: 2,
    channel: "email",
    audience: ["comms"],
    sender: s.media.sender,
    title: s.media.title,
    body: s.media.body,
    facilitatorNotes: [
      "Who is the single approved spokesperson, and is that written down anywhere?",
      "Would staff know not to answer a reporter or post about this on their own?",
    ],
    decision: decide("comms", "communications", "RC.CO-04", "A response is due within the hour. What goes out?", "Pre-approve a holding statement template, name one spokesperson and a backup, and route every external statement through the incident commander and legal.", [
      opt("strong", "Send a short holding statement approved by the incident commander and legal: we are investigating, here is what {people} should do, next update at a set time.", "The coverage quotes your statement accurately. It reads as a team in control, and the next-update commitment buys you breathing room.", [0, 0, 9, 4]),
      opt("acceptable", "Decline to comment for now and draft a statement for when facts are confirmed.", "The story runs with \"did not respond to requests for comment\" and quotes an anonymous employee instead. Not damaging, but you are no longer shaping the narrative.", [0, 0, -4, 0]),
      opt("risky", "Have the nearest available manager reassure them that no sensitive data was affected.", "The reassurance is published within minutes. Nobody has verified it, and it is now your organization's official position.", [0, 0, -6, -8], ["overpromised"]),
    ]),
  }),

  mediaBacklash: () => ({
    id: "media-backlash",
    phaseId: "coordinate",
    tier: 1,
    requires: "overpromised",
    channel: "news",
    sender: "Regional Business Journal",
    title: "\"No data affected,\" {org} said. Evidence suggests otherwise.",
    body: "A follow-up story contrasts {org}'s earlier assurance with a sample of {data} now circulating online. Two {people} are quoted saying they learned about it from social media. Your insurer's breach coach calls: the public statement may complicate both coverage and regulatory posture.",
    effects: { trust: -10, compliance: -5 },
    facilitatorNotes: ["Who approved the original statement? What approval step would have caught it?"],
  }),

  legal: (s) => ({
    id: "legal",
    phaseId: "coordinate",
    tier: 1,
    channel: "ticket",
    audience: [],
    sender: "Incident log",
    title: s.legal.title,
    body: s.legal.body,
    facilitatorNotes: [
      "Does the plan say who decides whether this is a reportable breach, and by when?",
      "Where are the insurer hotline and policy number kept if email is unavailable?",
      "Which contracts require you to notify a customer or partner, and how fast?",
    ],
    decision: decide("legal", "compliance", "RS.CO-02", "The notification clock may already be running under {rule}. What is the call?", "Document a notification decision tree: who decides, which facts trigger which deadline, and the insurer, counsel, and regulator contacts — stored somewhere reachable during an outage.", [
      opt("strong", "Engage breach counsel and the cyber insurer now, record what is known and when it was known, and start the notification assessment in parallel with forensics.", "Counsel takes over privileged communications and the insurer approves an incident response firm from its panel. Every deadline is now being tracked by someone accountable.", [3, 0, 4, 12]),
      opt("acceptable", "Wait for forensics to confirm what was exposed, log that decision, and set a firm 24-hour checkpoint.", "Reasonable, and documented — but the insurer later notes that late notice gave them less room to help, and one contractual deadline is now very tight.", [0, 0, 0, -3]),
      opt("risky", "Hold off on counsel, the insurer, and any notifications until we are certain there is a breach.", "Days pass before anyone outside the team is told. The delay itself becomes a finding.", [0, 0, -5, -14], ["latenotice"]),
    ]),
  }),

  regulatorInquiry: () => ({
    id: "regulator-inquiry",
    phaseId: "coordinate",
    tier: 1,
    requires: "latenotice",
    channel: "regulator",
    sender: "{regulator}",
    title: "Request for information regarding a reported security incident",
    body: "We have received a complaint indicating that {data} held by {org} may have been compromised. Please provide, within 10 business days: the date you became aware of the incident, the date notifications were issued, and the basis for the timing of those notifications. Your insurer has separately reserved its rights, citing late notice.",
    effects: { compliance: -10, trust: -4 },
    facilitatorNotes: ["Could the team reconstruct a defensible timeline from its own records today?"],
  }),

  evidence: (s) => ({
    id: "evidence",
    phaseId: "contain",
    tier: 3,
    advanced: true,
    channel: "chat",
    audience: ["it"],
    sender: "IT on-call channel",
    title: s.evidence.title,
    body: s.evidence.body,
    facilitatorNotes: [
      "Who is allowed to touch affected systems, and is that written down?",
      "Would insurance or law enforcement need evidence you are about to destroy?",
    ],
    decision: decide("it", "evidence", "RS.AN-07", "Remediation will overwrite evidence. How do we proceed?", "Add an evidence-preservation checklist to the plan: what to capture (logs, images, memory), in what order, who may do it, and how chain of custody is recorded.", [
      opt("strong", "Capture first: export the relevant logs, take forensic images of key systems, record who handled what, then remediate.", "It costs about an hour. The forensic firm later says this is the reason they could confirm exactly what the attacker touched — which narrows who must be notified.", [2, -3, 3, 10]),
      opt("acceptable", "Export the most important logs, then proceed with remediation right away.", "You keep the headline facts but lose the detail. Some questions about scope will only ever be answered with \"we assume so.\"", [3, 0, 0, 2]),
      opt("risky", "Wipe and rebuild immediately — getting clean matters more than investigating.", "Systems come back fast. So does the question nobody can answer anymore: what exactly did they take? You must now assume the worst case for notification.", [5, 4, -4, -12], ["noevidence"]),
    ]),
  }),

  recovery: (s) => ({
    id: "recovery",
    phaseId: "recover",
    tier: 1,
    channel: "chat",
    audience: [],
    sender: "Incident bridge",
    title: s.recovery.title,
    body: s.recovery.body,
    facilitatorNotes: [
      "Who decides the order systems come back, and who signs off that each one is clean?",
      "When was a restore last actually tested end to end?",
    ],
    decision: decide("ic", "recovery", "RC.RP-05", "Leadership wants a return to normal. What is the recovery standard?", "Define recovery priorities and a verification checklist in advance: restore order, who validates each system, and how long heightened monitoring runs afterward.", [
      opt("strong", "Restore in priority order, verify each system is clean with its business owner before reconnecting, reset credentials, and keep heightened monitoring for 30 days.", "Recovery takes longer than leadership wanted, and it sticks. Monitoring catches one leftover foothold that would otherwise have restarted the incident.", [10, 8, 5, 3]),
      opt("acceptable", "Bring everything back as fast as possible and monitor closely afterward.", "Operations resume quickly. Two days later a cleanup weekend is needed for things that were missed — annoying, not catastrophic.", [-4, 8, 0, 0]),
      opt("risky", "Return to normal now and skip verification — the business cannot wait.", "The business is back within hours.", [-12, 4, 0, 0], ["reinfect"]),
    ]),
  }),

  reinfection: () => ({
    id: "reinfection",
    phaseId: "recover",
    tier: 1,
    requires: "reinfect",
    channel: "siem",
    sender: "Security monitoring",
    title: "Recurring malicious activity on restored systems",
    body: "Seventy-two hours after the all-clear, the same indicators are back. A credential that was never reset was used to log in overnight, and the attacker's access survived the restore. The incident is reopened, and staff who were told it was over are asking what happened.",
    effects: { containment: -12, operations: -10, trust: -6 },
    facilitatorNotes: ["What would a written 'safe to reconnect' checklist have required?"],
  }),

  board: () => ({
    id: "board",
    phaseId: "recover",
    tier: 3,
    channel: "email",
    audience: ["exec"],
    sender: "Board chair",
    title: "I need a straight answer before tomorrow's call",
    body: "I'm hearing about this from three different people and none of the stories match. Before tomorrow I need to know: what happened, what it cost us, whether it can happen again next month, and what you need from the board. One page.",
    facilitatorNotes: ["Could leadership produce this one-pager today? Who would write it?"],
    decision: decide("exec", "communications", "RC.CO-03", "How does leadership brief the board?", "Create an executive incident brief template (what happened, impact, current status, decisions needed, next update) and agree a reporting cadence for major incidents.", [
      opt("strong", "A one-page factual brief: timeline, confirmed impact, what is still unknown, cost so far, and three specific asks — with a commitment to a written after-action report.", "The board approves emergency spend in ten minutes and asks to see the after-action report. Confidence in the team goes up, not down.", [0, 3, 8, 3]),
      opt("acceptable", "A verbal update on the call, with details to follow once the investigation is complete.", "The call runs long and ends with more questions than it started with. A follow-up session is scheduled.", [0, 0, -2, 0]),
      opt("risky", "Keep it reassuring and high level; avoid specifics until we know there is no liability.", "A board member later learns details from a news article that were not in the briefing. The conversation that follows is about trust, not security.", [0, 0, -10, -3]),
    ]),
  }),

  wrap: () => ({
    id: "wrap",
    phaseId: "recover",
    tier: 1,
    channel: "briefing",
    audience: [],
    sender: "Exercise control",
    title: "Stand down — hotwash",
    body: "The simulated incident is over. Before anyone leaves the table: what is the one thing each role would change before a real incident? Capture gaps and action items in the notes panel — they flow straight into the after-action report. End the exercise when the discussion is done.",
    facilitatorNotes: [
      "Go role by role. Ask: what did you not know that you needed to know?",
      "Push every gap toward an owner and a date.",
    ],
  }),
};

// --- scenario scripts --------------------------------------------------------

const SCENARIOS = {
  Ransomware: {
    title: "Ransomware outbreak",
    briefing: "It is a normal working morning at {org}. Over the next few minutes the IT team will start seeing something that does not look right. You will receive information the way you would in real life — alerts, emails, calls — and not everyone will see the same thing. Talk to each other.",
    script: [
      {
        id: "edr-alert", phaseId: "detect", tier: 1, channel: "siem", audience: ["it"], sender: "Endpoint detection", mitre: ["T1486", "T1490"],
        title: "CRITICAL: mass file modification on FILESRV01 and 3 workstations",
        body: "4,200 files renamed with a .lockd extension in six minutes. Volume shadow copies were deleted on FILESRV01. Activity is running under the service account svc-backup. The help desk has five open calls from staff whose shared files will not open.",
        facilitatorNotes: ["Only IT can see this alert. Do they tell anyone? How, and how fast?", "What makes this an 'incident' rather than an IT problem — who is allowed to say so?"],
        decision: decide("it", "detection", "DE.AE-08", "IT has minutes, not hours. What is the first move?", "Define incident declaration criteria and give on-call IT pre-approved authority to isolate systems and page the incident commander without waiting for permission.", [
          opt("strong", "Declare an incident, page the incident commander, and isolate the affected machines from the network immediately.", "The affected machines are cut off within minutes and the right people are awake. Encryption stops at the systems already hit.", [10, -3, 3, 2]),
          opt("acceptable", "Isolate the affected machines and keep investigating before escalating to anyone.", "The spread slows, but leadership first hears about it forty minutes later from a frustrated department head rather than from IT.", [6, -2, -3, 0]),
          opt("risky", "Reboot the file server and see whether the problem clears.", "The server comes back still encrypting, and the reboot wiped the memory evidence that would have shown how the attacker got in.", [-10, -4, 0, -4], ["spread"]),
        ]),
      },
      {
        id: "ransom-note", phaseId: "contain", tier: 1, channel: "ransom_note", sender: "README_RESTORE.txt", mitre: ["T1657", "T1567"],
        title: "Your network has been encrypted",
        body: "All your files are encrypted. We also copied 38 GB from your servers, including {data}. You have 72 hours to contact us before we publish it. Do not call the police. Do not try to restore — you will damage the files. Price doubles after 72 hours.",
        facilitatorNotes: ["The note claims data theft. Does that change who needs to be in the room?", "Who has the authority to take systems offline when it stops the business?"],
        decision: decide("ic", "containment", "RS.MI-01", "The note is now on screens across the office. How far do you go to contain this?", "Document containment authority and pre-agreed 'break glass' actions: which network segments and privileged accounts can be cut, by whom, and what downtime is acceptable.", [
          opt("strong", "Segment hard: disconnect affected sites and server segments, disable svc-backup and other privileged accounts, and accept partial downtime.", "Painful but precise. The backup infrastructure and {crown} are isolated before the attacker reaches them.", [12, -6, 2, 2]),
          opt("acceptable", "Shut everything down — every server and workstation — until IT is certain it is safe.", "Nothing else gets encrypted. Nothing else works either: the whole organization is dark, including systems that were never at risk.", [10, -14, -2, 0]),
          opt("risky", "Keep systems running so staff can keep working while IT investigates quietly.", "Staff keep working for another half hour.", [-12, 2, -2, -2], ["spread"]),
        ]),
      },
      {
        id: "spread", phaseId: "contain", tier: 1, requires: "spread", channel: "siem", sender: "Endpoint detection", mitre: ["T1021"],
        title: "Encryption has reached the backup server and {crown}",
        body: "The attacker used the still-active svc-backup account to move laterally. The on-site backup repository is now encrypted, and {crown} stopped responding four minutes ago. What was a contained file-server problem is now an organization-wide outage.",
        effects: { containment: -12, operations: -14, trust: -4 },
        facilitatorNotes: ["Trace this back: which earlier decision allowed it? What would have prevented it?"],
      },
      {
        id: "ops-down", phaseId: "contain", tier: 2, channel: "phone", audience: ["ops"], sender: "Front-line supervisor",
        title: "Call: \"Do I send people home?\"",
        body: "\"Nothing works down here. We can't get into {crown}, the phones are fine but the shared drive is gone, and I've got {people} waiting right now. Do we keep going on paper, or do I send everyone home? I need an answer in five minutes.\"",
        facilitatorNotes: ["Do downtime procedures exist on paper, somewhere reachable when systems are down?", "Which services must continue no matter what — and who decided that?"],
        decision: decide("ops", "command", "RC.RP-04", "Operations needs direction now. What do you tell them?", "Write and print downtime procedures for the top critical services, including manual workarounds, who activates them, and how work is reconciled afterward.", [
          opt("strong", "Activate documented downtime procedures: continue the defined critical services manually, pause everything else, and log the work for later re-entry.", "It is slower and staff grumble, but the essential services keep running and nothing has to be reconstructed from memory later.", [0, 10, 5, 3]),
          opt("acceptable", "Let each department improvise whatever workaround it can.", "Some teams cope well. Others make it up as they go, and a week later nobody can fully reconcile what was done by hand.", [0, 3, -2, -3]),
          opt("risky", "Tell staff to use personal devices and personal email to keep things moving.", "Work continues — and {data} is now sitting in personal inboxes and phones that nobody controls.", [-6, 5, -4, -10]),
        ]),
      },
      {
        id: "pay", phaseId: "coordinate", tier: 2, channel: "chat", sender: "Leadership channel",
        title: "\"Should we just pay?\"",
        body: "A senior leader posts: \"I'm being told the last clean offline backup is nine days old. The business is losing money every hour. They want payment in crypto. Can someone tell me why we shouldn't just pay and make this go away?\" The countdown shows 61 hours.",
        facilitatorNotes: ["Who has the authority to decide on payment? Is the insurer involved in that decision?", "Does anyone know whether paying could be illegal (sanctioned groups)?"],
        decision: decide("exec", "command", "RS.MA-04", "Leadership has to take a position on the ransom. What is it?", "Agree a ransom decision framework in advance: who decides, the role of counsel and the insurer, sanctions screening, and the principle that no one contacts the attacker directly.", [
          opt("strong", "Nobody contacts the attacker. Bring in the insurer's breach coach and incident response firm, confirm backup viability and sanctions exposure, then decide.", "The response firm confirms most data can be restored from the nine-day-old backup. The decision is now made with facts instead of a countdown timer.", [4, 2, 4, 8]),
          opt("acceptable", "Refuse to pay under any circumstances and announce that position to staff.", "A principled stance, but taken before anyone knew whether recovery was possible. It also leaks, and the attacker's next message is noticeably more aggressive.", [0, -3, 0, 2]),
          opt("risky", "Open negotiations ourselves, quietly, to buy time.", "A manager emails the attacker from a personal account. The insurer later points out this may have breached policy conditions, and nobody checked whether the group is sanctioned.", [-4, 0, -6, -12]),
        ]),
      },
    ],
    media: { sender: "Reporter, local news", title: "Comment request: ransomware attack at {org}?", body: "Hi — I'm hearing from two sources that {org} has been hit by ransomware and that systems are down. One says {people} have been turned away. I'm publishing at 4pm. Can you confirm, and was any personal data taken?" },
    legal: { title: "Open question: is this a reportable breach?", body: "The ransom note claims 38 GB was taken, including {data}. Forensics cannot yet confirm or rule that out. The cyber insurance policy requires \"prompt\" notice, and nobody on the bridge is sure whether {regulator} or affected {people} must be notified, or how soon." },
    evidence: { title: "\"Okay to start wiping machines?\"", body: "A technician asks: \"I've got 14 encrypted workstations and the file server. Fastest thing is to wipe and reimage them all right now. Nobody's taken images or pulled logs yet. Good to go?\"" },
    recovery: { title: "Restore plan: nine-day-old backup is ready", body: "The offline backup has been verified readable. IT estimates three days to restore in a controlled order with checks, or about one day if everything is brought back at once without verification. Department heads are pushing hard for the one-day option." },
  },

  "Phishing / Business Email Compromise": {
    title: "Business email compromise",
    briefing: "An ordinary week at {org}. Finance is closing out the month. Over the next few minutes, a routine request will turn out not to be routine at all. Information will arrive the way it really does — to different people at different times.",
    script: [
      {
        id: "phish-report", phaseId: "detect", tier: 1, channel: "ticket", audience: ["it"], sender: "Help desk ticket #4471", mitre: ["T1566.002", "T1078"],
        title: "User reports: \"I think I entered my password on a fake page\"",
        body: "An accounts-payable specialist clicked a \"shared invoice\" link yesterday afternoon and signed in on what looked like the Microsoft 365 page. She approved an MFA prompt she assumed was hers. Sign-in logs show a successful login from another country eleven minutes later.",
        facilitatorNotes: ["It has been ~18 hours since the click. What has the attacker had time to do?", "Is a single compromised mailbox an 'incident'? Who decides?"],
        decision: decide("it", "detection", "RS.MA-02", "One confirmed foreign sign-in to a finance mailbox. What happens first?", "Create a compromised-account playbook: revoke sessions, reset credentials and MFA, check mailbox rules and OAuth grants, and escalate automatically when the user has payment authority.", [
          opt("strong", "Revoke all sessions, reset the password and MFA, check for mailbox rules and app consents, and escalate as a security incident because finance is involved.", "A hidden rule forwarding anything mentioning \"invoice\" or \"payment\" to an external address is found and removed. The right people now know.", [10, 0, 2, 3]),
          opt("acceptable", "Reset the user's password and ask her to watch for anything strange.", "The password changes. The attacker's existing session token and the hidden forwarding rule both survive it.", [2, 0, 0, 0], ["foothold"]),
          opt("risky", "Close the ticket — MFA is enabled, so the account is protected.", "The ticket is closed as resolved. The attacker keeps reading the mailbox.", [-10, 0, 0, -3], ["foothold"]),
        ]),
      },
      {
        id: "wire", phaseId: "contain", tier: 1, channel: "email", audience: ["exec", "legal"], sender: "Accounts Payable", mitre: ["T1534"],
        title: "FW: Updated bank details — payment went out this morning",
        body: "\"Following up — I processed the $186,400 payment to our supplier this morning using the new account details they emailed last week. The supplier just called asking where their money is. They say they never changed banks. The email thread looks completely normal to me.\"",
        facilitatorNotes: ["The first 24–72 hours decide whether wired funds can be recovered. Does anyone know the process?", "Who calls the bank? Who calls law enforcement? Is that written down?"],
        decision: decide("exec", "command", "RS.MA-04", "$186,400 left the account about five hours ago. What do you do right now?", "Add a payment-fraud runbook: bank fraud-desk contact, wire recall steps, law-enforcement reporting (e.g. IC3), and insurer notice — plus out-of-band verification for any change to payee bank details.", [
          opt("strong", "Call the bank's fraud desk immediately to request a recall, file a law-enforcement fraud report, notify the insurer, and freeze outgoing payments pending review.", "The bank flags the transfer before it clears the receiving account. Recovery is not guaranteed, but you moved inside the window where it is possible.", [4, -2, 4, 10]),
          opt("acceptable", "Ask finance to email the bank and investigate internally before involving anyone outside.", "The email sits in a general inbox until the next business day. The recall request goes in almost a full day late.", [0, 0, -2, -4]),
          opt("risky", "Keep it quiet until we understand whose mistake this was.", "By the time anyone contacts the bank, the money has been moved onward twice.", [-4, 0, -8, -12], ["latenotice"]),
        ]),
      },
      {
        id: "foothold", phaseId: "contain", tier: 1, requires: "foothold", channel: "email", sender: "A key customer", mitre: ["T1114.003"],
        title: "Is this invoice really from you?",
        body: "\"We just received three invoices from your AP address asking us to pay into a new bank account. The tone seemed off. Is this legitimate?\" The attacker still has access to the mailbox and is now using {org}'s identity to defraud your {people}.",
        effects: { containment: -10, trust: -10, compliance: -4 },
        facilitatorNotes: ["Which earlier step would have removed the attacker's access?"],
      },
      {
        id: "scope", phaseId: "contain", tier: 2, channel: "siem", audience: ["it"], sender: "Identity protection",
        title: "Same phishing page: 6 more staff clicked",
        body: "Mail logs show the same message reached 140 staff. Six more clicked. Two of those have risky sign-ins — one is an executive assistant with delegate access to a leadership mailbox containing {data}.",
        facilitatorNotes: ["How do you tell all staff without causing panic — or tipping off the attacker?", "Who can approve forcing a reset on an executive's account mid-day?"],
        decision: decide("ic", "containment", "RS.MI-01", "The campaign is wider than one user. How do you contain it?", "Pre-authorize bulk containment actions (purging malicious mail, forced resets, blocking sender domains) and maintain a ready-to-send staff alert template.", [
          opt("strong", "Purge the message from all mailboxes, force resets and session revocation for everyone who clicked, block the domain, and send a plain-language staff alert.", "Three more staff reply to the alert to say they clicked too. All are cleaned up within the hour.", [12, -2, 3, 2]),
          opt("acceptable", "Reset only the two accounts with risky sign-ins and monitor the rest.", "The two known accounts are secured. One of the four you only monitored turns out to have been accessed as well — you find out two days later.", [3, 0, 0, -2]),
          opt("risky", "Do not alert staff yet; it will only create noise and embarrassment.", "With no warning sent, two more people click the same link that afternoon.", [-10, 0, -4, -2]),
        ]),
      },
    ],
    media: { sender: "A key customer's CFO", title: "We need a written explanation today", body: "Our accounts team received fraudulent invoices from your domain. Before we pay anything further to {org}, we need written confirmation of what happened, whether our data was in the compromised mailbox, and what you are doing about it. Our board is asking." },
    legal: { title: "Open question: what was in that mailbox?", body: "The compromised mailboxes held eighteen months of email, including {data} and vendor banking details. The attacker had access for at least 18 hours. Nobody is sure whether mailbox access alone triggers notification under {rule}, or whether the insurer needs to hear about the wire today." },
    evidence: { title: "\"Can I just delete the phishing emails and rules?\"", body: "An administrator asks: \"I'm about to delete the forwarding rules and purge everything. Should I export the audit logs, the rules, and the original message headers first, or is that overkill? The log retention is only 90 days and some of it is default 7.\"" },
    recovery: { title: "All known accounts reset — are we done?", body: "Every known-compromised account has been reset. Finance wants to resume vendor payments today; a payroll run is due tomorrow. IT has not yet reviewed app consents, delegate access, or sign-ins for the wider staff." },
  },

  "Data Exfiltration": {
    title: "Data exfiltration",
    briefing: "Nothing is visibly broken at {org} today. No outage, no ransom note. But a quiet alert is about to raise a much harder question: has data already left, and how would you know?",
    script: [
      {
        id: "egress", phaseId: "detect", tier: 1, channel: "siem", audience: ["it"], sender: "Network monitoring", mitre: ["T1567.002", "T1048"],
        title: "Unusual outbound transfer: 61 GB to a cloud storage provider",
        body: "A database server uploaded 61 GB to a consumer cloud storage service between 01:10 and 03:40, three nights in a row. The destination is not an approved service. The server hosts {data}.",
        facilitatorNotes: ["Nothing is 'down'. Would this alert actually get looked at on a busy morning?", "At what point does IT have to tell someone outside IT?"],
        decision: decide("it", "detection", "DE.AE-02", "A possible data theft with no visible damage. First move?", "Define data-exfiltration indicators as declared-incident triggers and document who must be informed when regulated data may be involved.", [
          opt("strong", "Treat it as an incident: block the destination, preserve the logs, escalate to the incident commander, and start scoping what data was on that server.", "The transfers stop tonight, the evidence is preserved, and leadership hears it from IT first.", [10, 0, 3, 4]),
          opt("acceptable", "Block the destination at the firewall and open a ticket to investigate this week.", "The uploads stop. The investigation waits behind other work for four days, during which nobody outside IT knows.", [5, 0, -2, -3]),
          opt("risky", "Assume it is a misconfigured backup job and check with the database team when they are back.", "Nobody is back until Monday. The uploads continue for two more nights.", [-12, 0, 0, -5], ["spread"]),
        ]),
      },
      {
        id: "extortion", phaseId: "contain", tier: 1, channel: "email", audience: ["exec"], sender: "Unknown sender", mitre: ["T1657"],
        title: "We have your data. Sample attached.",
        body: "We have 61 GB of your data including {data}. A sample of 200 records is attached so you know we are serious. You have five days to respond before we contact your {people} and publish everything. Do not involve law enforcement.",
        facilitatorNotes: ["Only the executive received this. Do they forward it? To whom?", "How do you verify the sample is real without spreading it further?"],
        decision: decide("exec", "command", "RS.MA-04", "An extortion email with what looks like real records. What does leadership do?", "Document an extortion response procedure: no direct contact, immediate handoff to the incident commander, counsel and insurer engagement, and controlled verification of any data sample.", [
          opt("strong", "Do not reply. Hand it to the incident commander, engage counsel and the insurer, and have IT verify the sample under controlled access.", "The sample is confirmed genuine by two people under privilege. The team now knows this is real — and the attacker has learned nothing.", [3, 0, 3, 10]),
          opt("acceptable", "Forward it to the leadership team to get opinions before deciding.", "Opinions arrive. So does a problem: an email containing 200 real records has now been forwarded to nine inboxes.", [-2, 0, -2, -5]),
          opt("risky", "Reply to ask what they want — it costs nothing to find out.", "They reply within minutes, and now they know the address is monitored by someone senior and anxious.", [-4, 0, -5, -10]),
        ]),
      },
      {
        id: "still-leaking", phaseId: "contain", tier: 1, requires: "spread", channel: "siem", sender: "Network monitoring",
        title: "Two more nights of transfers — total now 140 GB",
        body: "Because the destination was never blocked, the uploads continued. The total is now 140 GB and includes a second database containing additional {data}. The scope of any notification has more than doubled.",
        effects: { containment: -12, compliance: -8, trust: -4 },
        facilitatorNotes: ["What would it have taken to get this alert acted on the first morning?"],
      },
      {
        id: "access", phaseId: "contain", tier: 2, channel: "chat", audience: ["it", "ic"], sender: "IT on-call channel", mitre: ["T1078"],
        title: "Source identified: a contractor's VPN account",
        body: "The transfers ran under a VPN account belonging to a contractor whose engagement ended four months ago. The account was never disabled. It has database read access and is still active right now. The contractor's firm still supports {crown}.",
        facilitatorNotes: ["Who owns offboarding for third parties?", "Cutting the vendor's access may break support for a critical system. Who makes that trade-off?"],
        decision: decide("ic", "containment", "RS.MI-01", "The attacker's way in is still open. How do you close it?", "Add third-party account reviews to the plan and pre-approve emergency revocation of vendor access, including a fallback support arrangement for critical systems.", [
          opt("strong", "Disable the account and rotate every credential it could reach, review all other third-party accounts today, and tell the vendor through a verified contact.", "Two more dormant vendor accounts are found and removed. The vendor confirms the credential appeared in a breach on their side.", [12, -3, 2, 3]),
          opt("acceptable", "Disable that one account and move on.", "That door is closed. Nobody checks whether the same stale-account problem exists elsewhere — it does.", [5, 0, 0, 0]),
          opt("risky", "Leave it active for now so we can watch what the attacker does.", "Without the tooling or staff to monitor it safely, 'watching' means the attacker gets another night of access.", [-12, 0, -3, -6]),
        ]),
      },
    ],
    media: { sender: "Security researcher", title: "Your data is listed on a leak site", body: "Hello — I track extortion groups. A listing for {org} appeared an hour ago with a countdown and screenshots that appear to show {data}. I plan to post about it. Do you have a statement, and are affected individuals being told?" },
    legal: { title: "Open question: who do we have to tell, and when?", body: "Forensics confirms records containing {data} left the network. The exact count is unknown — somewhere between 4,000 and 60,000 individuals. Under {rule}, the clock may have started when the alert first fired, not when leadership found out." },
    evidence: { title: "\"The database server is slow — can I rebuild it?\"", body: "A database administrator asks: \"That server's been acting up for a week. I'd like to rebuild it from the gold image tonight. That will clear whatever's on it. Nobody has imaged it yet. Okay?\"" },
    recovery: { title: "Access is closed — what does 'done' look like?", body: "The known account is disabled and uploads have stopped. Leadership asks whether the incident can be closed. Credentials have not been rotated broadly, and nobody has confirmed whether the attacker created any other access." },
  },

  "Compromised Admin Account": {
    title: "Compromised administrator account",
    briefing: "Late in the day at {org}, something small looks wrong in the admin console. The account involved has the keys to everything. How quickly the team recognizes that will decide how this goes.",
    script: [
      {
        id: "new-admin", phaseId: "detect", tier: 1, channel: "siem", audience: ["it"], sender: "Identity audit log", mitre: ["T1078.004", "T1136"],
        title: "New Global Administrator created outside change window",
        body: "At 18:42 a new account, \"svc-sync-02\", was created and granted Global Administrator by the IT manager's own admin account. The IT manager is on a flight and unreachable. MFA for the admin account was re-registered to a new phone at 18:37.",
        facilitatorNotes: ["The account owner is unreachable. Who acts in their place?", "Is there a break-glass account, and does anyone know where its credentials are?"],
        decision: decide("it", "detection", "DE.AE-08", "A privileged account is doing things its owner cannot be doing. What now?", "Document break-glass procedures and pre-authorize the on-call engineer to disable any privileged account showing compromise indicators, regardless of who owns it.", [
          opt("strong", "Treat it as compromised: disable both accounts using the break-glass admin, revoke sessions, declare an incident, and page the incident commander.", "Both accounts are locked within minutes. The attacker's window as a global admin was under ten minutes.", [12, -2, 2, 3]),
          opt("acceptable", "Disable the new account and wait for the IT manager to land to ask about the rest.", "The new account is gone. The compromised admin account that created it stays live for three more hours.", [2, 0, 0, 0], ["spread"]),
          opt("risky", "Message the IT manager and wait — you cannot lock out your own boss.", "The message is read by the attacker, who is in the manager's mailbox.", [-12, 0, -2, -3], ["spread"]),
        ]),
      },
      {
        id: "persistence", phaseId: "contain", tier: 1, requires: "spread", channel: "siem", sender: "Identity audit log", mitre: ["T1098", "T1556"],
        title: "Attacker established persistence: 3 app registrations, audit logging disabled",
        body: "During the hours the admin account stayed active, the attacker registered three applications with mail-read permissions across the tenant, added a federated sign-in domain, and turned off audit logging. Resetting passwords will no longer remove them.",
        effects: { containment: -14, compliance: -6, operations: -4 },
        facilitatorNotes: ["What authority would the on-call engineer have needed to act sooner?"],
      },
      {
        id: "lockout", phaseId: "contain", tier: 1, channel: "chat", sender: "Incident bridge", mitre: ["T1531"],
        title: "How deep do we cut?",
        body: "The compromised account had admin rights over email, file storage, device management, and {crown}. IT can rotate every privileged credential and force sign-out for all staff — which will interrupt everyone and break several integrations — or target only what logs show was touched.",
        facilitatorNotes: ["Who can authorize an organization-wide forced sign-out at 7pm? At 10am?", "Which integrations break, and who needs warning?"],
        decision: decide("ic", "containment", "RS.MI-01", "Broad disruption now, or targeted action based on incomplete logs?", "Maintain an inventory of privileged accounts and integrations and a tested tenant-wide credential rotation procedure with a known business impact.", [
          opt("strong", "Rotate all privileged credentials and secrets, force sign-out for everyone, review admin roles and app consents, and warn staff through a channel that does not depend on email.", "A rough evening. By morning every credential the attacker could have copied is worthless.", [14, -8, 2, 3]),
          opt("acceptable", "Rotate only the accounts and systems the logs show were touched.", "Efficient — and dependent on logs the attacker had the rights to edit. One service credential was missed.", [5, -2, 0, 0]),
          opt("risky", "Change the one admin password and monitor; a full rotation is too disruptive.", "The password changes. The tokens, app secrets, and service credentials copied earlier all still work.", [-10, 0, -2, -4], ["reinfect"]),
        ]),
      },
      {
        id: "exec-mail", phaseId: "coordinate", tier: 2, channel: "email", audience: ["exec"], sender: "Executive assistant", mitre: ["T1114"],
        title: "Did you send this to the bank?",
        body: "\"The bank just called to verify an email from you asking to add a new signatory to the operating account. It came from your real address at 19:05. I told them to hold. Did you send it?\" The attacker used admin rights to send mail as leadership.",
        facilitatorNotes: ["Can leadership still trust email at all right now? What do you use instead?", "Who tells staff, and how, if email itself is suspect?"],
        decision: decide("exec", "communications", "RS.CO-03", "Email cannot be trusted tonight. How does leadership communicate?", "Establish an out-of-band communication channel for incidents (phone tree, separate messaging tenant) and a verification phrase or callback rule for financial requests.", [
          opt("strong", "Move incident communications out of band (phone bridge / separate messaging), tell the bank and key partners by phone to verify any request, and tell staff why.", "The bank places a verification hold on all changes. Two more fraudulent requests are stopped over the next day.", [5, -2, 8, 4]),
          opt("acceptable", "Email all staff from the executive account warning them to be careful.", "The warning goes out — from the same system the attacker controls. Several staff are unsure whether the warning itself is real.", [0, 0, -3, 0]),
          opt("risky", "Carry on as normal and deal with the bank request privately.", "Partners keep receiving convincing requests from leadership addresses with nobody warning them.", [-5, 0, -10, -5]),
        ]),
      },
    ],
    media: { sender: "A partner organization's security team", title: "Malicious email received from your executive's account", body: "We received a credential-phishing email from a senior {org} address at 19:20. We have blocked your domain as a precaution. Please confirm whether you have a compromise, what was accessed, and when it is safe to unblock you." },
    legal: { title: "Open question: admin access means access to everything", body: "The compromised account could read every mailbox and file share, including {data}. Audit logs for part of the window are missing. Counsel will ask: can you show what was not accessed? If not, {rule} may require you to assume it all was." },
    evidence: { title: "\"Logs roll off in 7 days\"", body: "An engineer notes: \"Default sign-in log retention is seven days and it's been four. I can export everything now, but it'll take a couple of hours I'd rather spend on resets. Also we're about to delete the rogue apps — that removes their config.\"" },
    recovery: { title: "Credentials rotated — re-enable integrations?", body: "Rotation broke payroll sync, the backup connector, and single sign-on to {crown}. Each vendor wants a new admin-level credential issued tonight to fix it. Nobody has yet reviewed whether those integrations need that much privilege." },
  },

  "Lost or Stolen Laptop": {
    title: "Lost or stolen laptop",
    briefing: "It is Monday morning at {org}. Someone is about to admit something they would rather not. This scenario has no hacker in a hoodie — just a missing device and a lot of questions about what was on it.",
    script: [
      {
        id: "report", phaseId: "detect", tier: 1, channel: "phone", audience: ["it"], sender: "A senior employee", mitre: ["T1052"],
        title: "Call: \"My laptop was stolen from my car on Friday\"",
        body: "\"I didn't want to bother anyone over the weekend. It was in a bag on the back seat — they took the whole bag. My badge was in there too, and a notebook. I think my password might be written in the notebook. I had client files on the desktop because the VPN was slow.\"",
        facilitatorNotes: ["It has been three days. Would staff know they must report immediately — and feel safe doing so?", "Can IT prove the disk was encrypted, or just assume it?"],
        decision: decide("it", "detection", "RS.MA-02", "A device has been gone for three days with credentials possibly beside it. First actions?", "Publish a lost-device procedure with a 24/7 reporting path and a no-blame message, and make sure IT can prove encryption status and remotely lock or wipe any device.", [
          opt("strong", "Open an incident: remote lock and wipe, disable the user's account and badge, revoke sessions, confirm encryption status from the management console, and file a police report.", "The management console shows the disk was encrypted and the device last checked in Friday at 6pm. The wipe command is queued and the badge is dead.", [10, -2, 2, 6]),
          opt("acceptable", "Reset the user's password and order a replacement laptop.", "The user is working again by lunch. The badge still opens the office, and nobody has checked whether the disk was actually encrypted.", [2, 2, 0, -4]),
          opt("risky", "Log it as lost equipment for the insurance claim; the laptop needs a password anyway.", "The asset register is updated. The password is in the notebook that was stolen with it.", [-10, 0, 0, -8], ["spread"]),
        ]),
      },
      {
        id: "login", phaseId: "contain", tier: 1, requires: "spread", channel: "siem", sender: "Identity protection", mitre: ["T1078"],
        title: "Successful VPN login from the stolen device",
        body: "The stolen laptop connected to the VPN at 02:14 using the employee's valid credentials and stayed connected for 47 minutes. File-share logs show bulk access to folders containing {data}. The badge was used at a side entrance on Sunday evening.",
        effects: { containment: -14, compliance: -8, trust: -4 },
        facilitatorNotes: ["Which single action on Monday morning would have prevented this?"],
      },
      {
        id: "contents", phaseId: "contain", tier: 1, channel: "ticket", sender: "Incident log",
        title: "What was actually on the laptop?",
        body: "The employee recalls \"a few spreadsheets\" saved locally. Sync logs suggest roughly 2,300 records of {data} in an export on the desktop. Encryption is enabled by policy, but this device was set up by a contractor and never appeared in the compliance report.",
        facilitatorNotes: ["If you cannot prove encryption, most breach laws make you assume the data was exposed.", "Who interviews the employee — IT, HR, or their manager?"],
        decision: decide("ic", "command", "RS.AN-08", "Encryption cannot be proven. How do you treat this?", "Require device compliance reporting that proves encryption per device, and define how incident scope is established when evidence is incomplete.", [
          opt("strong", "Assume exposure until proven otherwise: reconstruct exactly which files were local, interview the employee with HR present, and brief legal on the worst case.", "A careful reconstruction pins the exposure to 2,312 records in one file. The scope is bad but known, and defensible.", [3, 0, 2, 10]),
          opt("acceptable", "Take the employee's word that it was only a few files and note it in the ticket.", "The ticket says 'a few files'. If that is ever questioned, there is nothing behind it.", [0, 0, 0, -6]),
          opt("risky", "Policy says laptops are encrypted, so record this as no data exposure.", "The file is closed on the strength of a policy document. The device itself was never checked.", [0, 0, -2, -12], ["latenotice"]),
        ]),
      },
      {
        id: "staff", phaseId: "coordinate", tier: 2, channel: "chat", audience: ["ops", "comms"], sender: "Staff channel",
        title: "\"I heard someone got fired over a laptop?\"",
        body: "Word is spreading. Staff are asking whether the employee is in trouble. Two people privately admit they also keep files locally \"because the VPN is slow\" and one says they lost a phone last year and never reported it.",
        facilitatorNotes: ["What you do with this employee decides whether the next loss gets reported in ten minutes or three days.", "The VPN being slow is a root cause. Who owns that?"],
        decision: decide("ops", "communications", "RS.CO-03", "How do you handle the human side of this?", "Adopt a no-blame reporting policy, communicate it, and fix the workflow friction (slow VPN, awkward file access) that pushes staff toward risky workarounds.", [
          opt("strong", "Thank the employee for reporting, tell staff plainly what happened and what to do if it happens to them, and fix the VPN problem that caused local copies.", "Within a week, three old unreported device losses come to light and get handled. Reporting time for the next one is eleven minutes.", [3, 3, 8, 3]),
          opt("acceptable", "Send a firm policy reminder to all staff about device security.", "The reminder is read as a warning. Nobody else comes forward.", [0, 0, -3, 0]),
          opt("risky", "Make an example: formal discipline, announced to the team.", "The message lands exactly as intended. The next lost device is reported five weeks late.", [-4, 0, -8, -2]),
        ]),
      },
    ],
    media: { sender: "A client contact", title: "Was our information on that laptop?", body: "One of your staff mentioned at a meeting that a company laptop was stolen last week. We share sensitive files with your team. Were ours on it? Our contract requires notification within 72 hours of any suspected loss, so I need an answer in writing today." },
    legal: { title: "Open question: is a lost encrypted laptop a breach?", body: "If the disk was verifiably encrypted and the key was not compromised, most laws treat this as no breach. Here, encryption cannot be proven and the password may have been in the bag. Around 2,300 records of {data} were stored locally. {rule} and at least one client contract may apply." },
    evidence: { title: "\"Should I just delete the device record?\"", body: "A technician asks: \"The laptop's never coming back. Can I delete it from device management and reuse the license? I haven't exported its compliance history, check-in logs, or the user's file-sync history yet.\"" },
    recovery: { title: "Closing out: one laptop, or a pattern?", body: "The replacement laptop is deployed. An audit triggered by this incident finds 11 more devices missing from compliance reporting and widespread local storage of {data}. Leadership would prefer to close the incident today." },
  },

  "Vendor / Third-Party Breach": {
    title: "Vendor / third-party breach",
    briefing: "Nothing has happened inside {org}'s own network. But a company you depend on is about to send an email that makes their problem your problem. Much of what you need to know, you will not be able to find out yourself.",
    script: [
      {
        id: "notice", phaseId: "detect", tier: 1, channel: "email", audience: ["ops"], sender: "A key software vendor", mitre: ["T1199"],
        title: "Important security notice regarding your account",
        body: "We recently identified unauthorized access to a portion of our environment. Out of an abundance of caution we are notifying customers whose data may have been involved. Our investigation is ongoing. We have no further details at this time. This vendor hosts {crown} and holds {data}.",
        facilitatorNotes: ["This went to a general operations contact. Would it reach security, or sit in an inbox?", "The notice says almost nothing. What do you need to know, and do you have the right to ask?"],
        decision: decide("ops", "detection", "RS.MA-01", "A vague notice from a critical vendor lands in an operations inbox. What happens to it?", "Route vendor security notices to a monitored security contact, list critical vendors with their security contacts, and treat any breach notice from one as a declared incident.", [
          opt("strong", "Escalate to the incident commander as an incident, pull the contract, and send the vendor a written list of questions with a deadline.", "The contract gives you audit rights and a 48-hour notification clause. The vendor's answers arrive faster once they are asked in writing by name.", [6, 0, 3, 6]),
          opt("acceptable", "Forward it to IT and ask them to keep an eye on things.", "IT sees it the next morning between other tickets. A day is lost before anyone asks the vendor a single question.", [0, 0, -2, -3]),
          opt("risky", "File it — vendors send these all the time and it says 'abundance of caution'.", "It is filed. The next thing anyone hears about it comes from a customer.", [-8, 0, -3, -8], ["latenotice"]),
        ]),
      },
      {
        id: "integration", phaseId: "contain", tier: 1, channel: "chat", audience: ["it", "ic"], sender: "IT on-call channel", mitre: ["T1199", "T1078"],
        title: "The vendor has a live connection into our network",
        body: "The vendor's platform holds an API key with write access to your directory and a persistent support tunnel into the network. If their environment is compromised, those credentials may be too. Cutting them will take {crown} offline for staff until it is re-established.",
        facilitatorNotes: ["Who can authorize taking a critical system offline because of someone else's breach?", "Is there a manual fallback for this system?"],
        decision: decide("ic", "containment", "GV.SC-08", "The vendor's access into your environment may be in attacker hands. What do you do?", "Inventory third-party connections and credentials, define emergency disconnect steps for each critical vendor, and document the business workaround while disconnected.", [
          opt("strong", "Disable the tunnel and rotate the API keys now, switch to the manual fallback, and restore access only after the vendor provides written assurance.", "Staff grumble through a day of manual work. Two days later the vendor confirms customer integration credentials were among the data taken.", [12, -8, 2, 4]),
          opt("acceptable", "Rotate the API key but leave the support tunnel up so the vendor can keep helping.", "The key is safe. The tunnel — the more powerful of the two — remains open on trust.", [4, -2, 0, 0]),
          opt("risky", "Leave everything connected until the vendor confirms there is actually a problem.", "The vendor's confirmation arrives three days later. So does a login through the support tunnel at 03:00.", [-12, 0, -2, -4], ["spread"]),
        ]),
      },
      {
        id: "tunnel", phaseId: "contain", tier: 1, requires: "spread", channel: "siem", sender: "Security monitoring", mitre: ["T1021"],
        title: "Vendor support tunnel used to access internal systems at 03:00",
        body: "The vendor's support account connected through the tunnel overnight and enumerated internal file shares. The vendor says none of its staff were working. The breach is no longer only on their side.",
        effects: { containment: -14, compliance: -6, operations: -4 },
        facilitatorNotes: ["You are now running your own incident as well as waiting on theirs. Who leads which?"],
      },
      {
        id: "silence", phaseId: "coordinate", tier: 2, channel: "phone", audience: ["exec"], sender: "Vendor account manager",
        title: "Call: \"I really can't say more than the notice\"",
        body: "\"I understand the frustration. Legal has told us not to share anything beyond the notice. I can't confirm whether your data was involved or how many records. We expect an update in seven to ten days.\" Your own obligations to {people} do not pause while they investigate.",
        facilitatorNotes: ["Whose duty is it to notify affected individuals — yours or the vendor's? Check the contract.", "What leverage do you actually have?"],
        decision: decide("exec", "command", "RS.MA-04", "The vendor is stonewalling. How does leadership respond?", "Negotiate breach-notification, cooperation, and audit clauses into critical vendor contracts, and document an escalation path for when a vendor is unresponsive.", [
          opt("strong", "Escalate executive-to-executive, invoke the contract's notification and cooperation clauses in writing, and proceed with your own assessment assuming your data was involved.", "A formal notice citing the contract gets a call from the vendor's security lead the same afternoon — and real answers.", [3, 0, 4, 10]),
          opt("acceptable", "Wait the seven to ten days; there is nothing to act on until they tell us more.", "Ten days later the update confirms your data was involved. Your own notification deadline is now nearly gone.", [0, 0, -2, -8]),
          opt("risky", "Post publicly that the vendor is responsible and refusing to cooperate.", "It feels good for an hour. The vendor's lawyers respond, cooperation stops entirely, and {people} still have no information.", [0, -3, -8, -6]),
        ]),
      },
    ],
    media: { sender: "A customer", title: "I got a breach letter from a company I've never heard of", body: "I received a letter from some software company saying my information was exposed and that they got it from {org}. I never gave them anything. Why does a company I've never heard of have my data, and why am I hearing it from them and not you?" },
    legal: { title: "Open question: their breach, whose obligation?", body: "As the organization that collected the {data}, {org} is likely the party responsible for notifying individuals — not the vendor. The vendor will not confirm scope. Under {rule}, waiting for certainty may not be a defense." },
    evidence: { title: "\"Do we need our own logs if it's the vendor's breach?\"", body: "An engineer asks: \"The firewall and directory logs covering the vendor's connection roll over in a few days. Is it worth pulling them? It's their incident, not ours.\"" },
    recovery: { title: "The vendor says it is safe to reconnect", body: "The vendor emails: \"Our investigation is complete and our environment is secure. You may resume normal integration.\" No report is attached. Operations wants {crown} fully reconnected today after a week of manual workarounds." },
  },

  "Insider Threat": {
    title: "Insider threat",
    briefing: "Today's incident at {org} does not start with an alarm. It starts with a resignation letter and a manager with an uneasy feeling. This one tests HR, legal, and IT working together — carefully.",
    script: [
      {
        id: "resignation", phaseId: "detect", tier: 1, channel: "email", audience: ["ops"], sender: "A department manager", mitre: ["T1052", "T1567"],
        title: "Heads up — resignation, and something feels off",
        body: "\"One of my senior people resigned this morning, two weeks' notice, going to a competitor. Probably nothing, but she's been in very late the past week and I saw her plugging in a personal drive yesterday. She has access to {data}. Should I be worried? I don't want to accuse anyone.\"",
        facilitatorNotes: ["Is there a defined process for departing staff with sensitive access?", "Who is allowed to look at an employee's activity, and who must approve it?"],
        decision: decide("ops", "detection", "DE.AE-02", "A manager has a hunch about a departing employee. What should happen?", "Create a departing-employee procedure for sensitive roles: HR notifies IT on resignation, access is reviewed, and activity review requires HR and legal approval.", [
          opt("strong", "Bring in HR and IT confidentially, get approval to review the employee's recent access and transfers, and keep the circle small.", "With HR and legal sign-off, IT finds 4,100 files copied to a personal cloud account over five nights. The facts are established before anyone is confronted.", [8, 0, 2, 8]),
          opt("acceptable", "Ask IT informally to take a quick look at what she has been doing.", "IT finds the same transfers — but with no HR or legal approval for the review, how that evidence was gathered may itself become an issue.", [5, 0, 0, -6]),
          opt("risky", "Confront her directly and ask what she has been copying.", "She denies everything, goes home early, and by evening her personal cloud account and the drive have been wiped.", [-10, 0, -3, -6], ["tippedoff"]),
        ]),
      },
      {
        id: "access", phaseId: "contain", tier: 1, channel: "chat", audience: ["it", "legal"], sender: "Confidential incident channel",
        title: "She still has full access for two more weeks",
        body: "The employee remains on notice with full access to {data} and {crown}. Cutting access now ends her ability to work her notice and tells her she is under suspicion. Leaving it lets her keep working — and keep copying.",
        facilitatorNotes: ["Who decides: her manager, HR, IT, or legal? Is that clear to all of them?", "What does employment law or a union agreement require here?"],
        decision: decide("legal", "containment", "RS.MI-01", "How do you limit further exposure without mishandling the employee?", "Define how access is restricted for employees under investigation, who authorizes it, and how HR, legal, and IT coordinate so that evidence and employee rights are both protected.", [
          opt("strong", "With HR and legal aligned: place her on paid garden leave today, suspend access, preserve her devices and accounts untouched, and plan a structured exit interview.", "Access ends cleanly. Her company laptop and mailbox are preserved exactly as she left them, and the conversation with her is handled by people trained to have it.", [12, -2, 2, 8]),
          opt("acceptable", "Quietly reduce her access to the minimum and let her work out her notice.", "Most of her access is trimmed. She notices within the hour — and still has two weeks at a desk.", [5, 0, 0, 0]),
          opt("risky", "Have IT disable everything immediately and have security walk her out.", "It is done in front of the whole department. Nobody preserved her laptop first, HR was not in the room, and her lawyer sends a letter the next morning.", [6, -2, -8, -10]),
        ]),
      },
      {
        id: "wiped", phaseId: "contain", tier: 1, requires: "tippedoff", channel: "ticket", sender: "Incident log",
        title: "Evidence gone: cloud account emptied, laptop reset",
        body: "After being confronted, the employee returned her laptop factory-reset \"as a courtesy\". The personal cloud account referenced in the transfer logs is now empty. Counsel advises that without that evidence, recovering or even proving what was taken will be far harder.",
        effects: { containment: -8, compliance: -10 },
        facilitatorNotes: ["What should the manager have been told to do — and not do — on day one?"],
      },
      {
        id: "competitor", phaseId: "coordinate", tier: 2, channel: "email", audience: ["exec"], sender: "A long-standing customer",
        title: "Strange call from your former employee",
        body: "\"Thought you should know — I got a call from someone who said she's just left {org} and joined a competitor. She knew our contract renewal date and exactly what we pay. She offered to beat it. How does she have that?\"",
        facilitatorNotes: ["Is this a security incident, a legal dispute, or both? Who leads?", "Do you tell other customers? Which ones?"],
        decision: decide("exec", "command", "RS.MA-04", "The data is now being used against you. What is leadership's move?", "Pre-arrange outside employment counsel and document the handoff between security incident response and legal action for insider cases.", [
          opt("strong", "Have counsel send a preservation and cease-and-desist letter to her and the new employer, assess notification duties for the {data}, and brief account managers for affected customers.", "The competitor's own lawyers, alarmed, quarantine her laptop and put her on leave. Your key accounts hear it from you first.", [6, 0, 6, 8]),
          opt("acceptable", "Call the competitor's CEO informally to sort it out.", "The call is cordial and non-committal. Nothing is in writing, and the files are still out there.", [0, 0, -2, -3]),
          opt("risky", "Let it go — pursuing it will cost more than it is worth and looks bad.", "Three more customers get the same call over the next month.", [-6, -4, -8, -5]),
        ]),
      },
    ],
    media: { sender: "Staff rumor mill", title: "\"Did she steal the customer list?\"", body: "The story is all over the office and has reached a trade-press reporter, who emails: \"I understand a senior employee left {org} under a cloud and that customer data may be involved. Can you comment? Are customers being notified?\" Meanwhile her former team is asking what they are allowed to say." },
    legal: { title: "Open question: trade secret problem or data breach?", body: "The copied files include pricing and contracts — and also {data}. The first is a commercial dispute. The second may be a notifiable breach under {rule}, even though the person who took it was an authorized user at the time." },
    evidence: { title: "\"Her laptop is back — can we reissue it?\"", body: "IT asks: \"We're short on laptops and hers is a good one. Okay to wipe and hand it to the new starter on Monday? Also her mailbox auto-deletes 30 days after the account is disabled.\"" },
    recovery: { title: "Closing out: one person, or a control gap?", body: "The individual matter is with counsel. A review shows 40 staff have the same broad access to {data} she did, personal cloud storage is not blocked, and there is no alert on bulk downloads. Leadership asks if the incident can be closed." },
  },

  "Cloud Misconfiguration": {
    title: "Cloud storage exposure",
    briefing: "No attacker has broken into {org}. Someone made a setting change, weeks ago, that seemed harmless. Today an outsider is going to tell you about it. The question is how long it has been that way — and who else noticed first.",
    script: [
      {
        id: "researcher", phaseId: "detect", tier: 1, channel: "email", audience: ["comms"], sender: "Independent security researcher", mitre: ["T1530"],
        title: "Responsible disclosure: publicly accessible storage bucket",
        body: "Hello, I am a security researcher. I found a cloud storage bucket belonging to {org} that is readable by anyone on the internet without a password. It appears to contain {data} — I viewed only enough to identify the owner. Please secure it. I intend to publish a short write-up in 7 days.",
        facilitatorNotes: ["This arrived at a general or communications inbox. Would it be read? Believed? Or marked as spam?", "Is there a published way for outsiders to report security problems?"],
        decision: decide("comms", "detection", "RS.MA-02", "An unsolicited email from a stranger claims you are leaking data. What do you do with it?", "Publish a security contact (e.g. security.txt), define how external reports are triaged, and treat credible disclosure reports as declared incidents.", [
          opt("strong", "Escalate immediately to IT and the incident commander, reply to thank the researcher and confirm receipt, and have IT verify the claim.", "IT confirms the bucket is public within ten minutes. The researcher, treated professionally, agrees to hold publication until you have finished.", [8, 0, 5, 4]),
          opt("acceptable", "Forward it to IT without replying to the sender.", "IT confirms and fixes it. The researcher, hearing nothing, publishes on day seven with the line \"the company did not respond\".", [6, 0, -5, 0]),
          opt("risky", "Ignore it — it looks like a scam or a sales pitch.", "It is not a scam.", [-10, 0, -4, -6], ["spread"]),
        ]),
      },
      {
        id: "published", phaseId: "detect", tier: 1, requires: "spread", channel: "social", sender: "Security researcher (public post)",
        title: "\"{org} is leaking data and isn't answering email\"",
        body: "After seven days with no reply, the researcher has posted the finding publicly with redacted screenshots. The post is being shared widely. The bucket is still open, and automated scanners are now downloading from it. This is how leadership learns about the issue.",
        effects: { containment: -12, trust: -12, compliance: -6 },
        facilitatorNotes: ["How should an external report have been routed? Who owns that inbox?"],
      },
      {
        id: "lockdown", phaseId: "contain", tier: 1, channel: "chat", audience: ["it"], sender: "IT on-call channel", mitre: ["T1530"],
        title: "Bucket confirmed public — and a customer-facing app depends on it",
        body: "The bucket was made public six weeks ago by a developer troubleshooting an upload problem. It holds 212,000 files including {data}. A customer-facing portal loads documents directly from it; making it private will break the portal until the app is changed. Access logging was never turned on.",
        facilitatorNotes: ["Who can decide to break a customer-facing service to stop an exposure?", "No access logs: how will you ever know who downloaded what?"],
        decision: decide("it", "containment", "RS.MI-01", "Closing the exposure breaks the portal. What do you do?", "Pre-authorize immediate lockdown of exposed data even when it breaks a service, enable access logging by default, and enforce guardrails that block public storage.", [
          opt("strong", "Make it private now, accept the portal outage, turn on logging, snapshot the current configuration as evidence, and scan every other bucket for the same mistake.", "The portal is down for a day. The scan finds two more public buckets — one containing database backups — before anyone else does.", [14, -8, 2, 4]),
          opt("acceptable", "Move the sensitive files out and leave the bucket public so the portal keeps working.", "The files you identified are moved. With 212,000 objects and no inventory, some sensitive ones are missed.", [4, 0, 0, -3]),
          opt("risky", "Schedule the fix for the next maintenance window so the portal stays up.", "The window is in five days. The bucket stays readable by the whole internet until then.", [-14, 2, -4, -8]),
        ]),
      },
      {
        id: "howlong", phaseId: "coordinate", tier: 2, channel: "ticket", audience: ["ic", "legal"], sender: "Incident log",
        title: "Six weeks public, no logs: assume what?",
        body: "With no access logs, there is no way to show who downloaded the files during the six weeks — or that nobody did. The cloud provider's limited metrics show a spike in data transfer ten days ago. The developer who made the change is worried about losing their job.",
        facilitatorNotes: ["Absence of evidence is not evidence of absence. How does that change the notification decision?", "How is the developer treated? What does that teach the rest of engineering?"],
        decision: decide("ic", "command", "RS.AN-08", "You cannot prove what was accessed. How do you scope the incident?", "Define how scope is determined when logs are missing (assume exposure), require logging on all data stores, and adopt blameless post-incident reviews for engineering mistakes.", [
          opt("strong", "Treat all 212,000 files as exposed, inventory what personal data they contain, request whatever logs the provider can supply, and run a blameless review with the developer.", "The inventory narrows the regulated data to 9,400 individuals. The developer's detailed account of what happened turns out to be the best evidence you have.", [3, 0, 3, 10]),
          opt("acceptable", "Assume only the files viewed by the researcher were accessed.", "It is the most convenient reading of the facts. The transfer spike ten days ago goes unexplained.", [0, 0, 0, -8]),
          opt("risky", "Record it as a near miss — there is no proof anyone malicious found it.", "The incident is closed as a near miss. Three weeks later a sample of the files appears on a forum.", [-4, 0, -6, -12], ["latenotice"]),
        ]),
      },
    ],
    media: { sender: "Technology reporter", title: "Story on your exposed customer files — comment by 3pm?", body: "I've been shown evidence that a storage bucket belonging to {org} exposed {data} to the open internet for several weeks. How many people are affected, how long was it exposed, and have they been told? I'm filing this afternoon." },
    legal: { title: "Open question: exposed is not the same as stolen — or is it?", body: "The files were publicly readable for six weeks and there are no logs. Counsel notes that under {rule}, data that was accessible without authorization and cannot be shown to be un-accessed is generally treated as breached. About 9,400 individuals' {data} is in scope." },
    evidence: { title: "\"I'll just fix the setting and delete the old bucket\"", body: "The developer offers: \"I can fix this in two minutes — I'll copy the files to a new private bucket and delete the old one. That gets rid of the problem.\" It would also delete the bucket's configuration history and the provider-side metrics tied to it." },
    recovery: { title: "The bucket is private — bring the portal back?", body: "Engineering has a patch so the portal works with the private bucket. It has had one hour of testing. Product wants it live today. No one has yet reviewed how a single developer was able to make production storage public without review." },
  },
};

// --- builder -----------------------------------------------------------------

const DEFAULT_ROLES = {
  ic: { title: "Incident Commander", focus: "Runs the response. Declares the incident, sets priorities, and makes the call when the team disagrees." },
  it: { title: "IT / Security Lead", focus: "Investigates and contains. Sees the technical alerts first and must translate them for everyone else." },
  exec: { title: "Executive Sponsor", focus: "Owns business risk. Approves major trade-offs, spending, and what leadership and the board are told." },
  comms: { title: "Communications Lead", focus: "Owns every message to staff, customers, and media. Protects trust and keeps statements accurate." },
  legal: { title: "Legal & Compliance", focus: "Owns notification duties, the insurer, contracts, and evidence. Keeps the response defensible." },
  ops: { title: "Operations Lead", focus: "Keeps critical services running. Speaks for front-line staff and the people the organization serves." },
};

const ROLE_KEYWORDS = {
  ic: /incident (commander|lead|manager|coordinator)|response lead/i,
  it: /\b(it|i\.t\.|security|ciso|cio|technology|infosec|soc|network|systems?|help ?desk|msp)\b/i,
  exec: /\b(ceo|coo|president|owner|executive|director|principal|superintendent|administrator|managing|general manager|city manager|founder)\b/i,
  comms: /communicat|public (relations|information)|\bpr\b|marketing|spokes/i,
  legal: /legal|counsel|compliance|privacy|risk|attorney|\bhr\b|human resources/i,
  ops: /operations|clinical|plant|program|service|office manager|finance|cfo|production|supply/i,
};

export function listLibraryScenarios() {
  return Object.keys(SCENARIOS);
}

export function buildLibrarySimulation(input = {}) {
  const scenarioType = SCENARIOS[input.scenarioType] ? input.scenarioType : "Ransomware";
  const scenario = SCENARIOS[scenarioType];
  const organization = clean(input.organizationName || input.organization) || "Your organization";
  const industryKey = INDUSTRY[input.industry] ? input.industry : "Other";
  const industry = INDUSTRY[industryKey];
  const maturityLevel = ["Basic", "Intermediate", "Advanced"].includes(input.maturityLevel) ? input.maturityLevel : "Intermediate";
  const durationMinutes = parseDuration(input.exerciseDuration ?? input.durationMinutes);
  const maxTier = durationMinutes <= 30 ? 1 : durationMinutes <= 60 ? 2 : 3;
  const small = input.organizationSize === "1-25";
  const seed = `${organization}|${scenarioType}|${industryKey}|${input.seed ?? ""}`;

  const { roles, alias } = buildRoles({ small, industry, knownRoles: input.knownRoles });
  const tokens = { org: organization, ...industry };
  const fill = (value) => (typeof value === "string" ? value.replace(/\{(\w+)\}/g, (match, key) => tokens[key] ?? match) : value);

  const drafts = [
    ...scenario.script,
    SHARED.evidence(scenario),
    SHARED.legal(scenario),
    SHARED.regulatorInquiry(),
    SHARED.media(scenario),
    SHARED.mediaBacklash(),
    SHARED.recovery(scenario),
    SHARED.reinfection(),
    SHARED.board(),
    SHARED.wrap(),
  ].filter((inject) => inject.tier <= maxTier || (inject.advanced && maturityLevel === "Advanced" && maxTier >= 2));

  const phaseRank = Object.fromEntries(PHASES.map((phase, index) => [phase.id, index]));
  drafts.sort((a, b) => phaseRank[a.phaseId] - phaseRank[b.phaseId]);

  const timeLimitSeconds = maturityLevel === "Basic" ? 480 : maturityLevel === "Advanced" ? 210 : 330;
  let rung = -1;

  const injects = drafts.map((draft) => {
    // Branch injects share the clock of the step they interrupt.
    if (!draft.requires) {
      rung += 1;
    }
    const decision = draft.decision
      ? {
          ...draft.decision,
          ownerRoleId: alias(draft.decision.ownerRoleId),
          prompt: fill(draft.decision.prompt),
          recommendation: fill(draft.decision.recommendation),
          timeLimitSeconds,
          options: seededShuffle(draft.decision.options, `${seed}|${draft.id}`).map((option, index) => ({
            ...option,
            id: "abcde"[index],
            label: fill(option.label),
            consequence: fill(option.consequence),
          })),
        }
      : null;

    return {
      id: draft.id,
      phaseId: draft.phaseId,
      clock: CLOCK_LADDER[Math.min(Math.max(rung, 0), CLOCK_LADDER.length - 1)],
      channel: draft.channel,
      sender: fill(draft.sender),
      title: fill(draft.title),
      body: fill(draft.body),
      audience: [...new Set((draft.audience ?? []).map(alias))],
      requires: draft.requires ?? "",
      unless: draft.unless ?? "",
      effects: draft.effects,
      facilitatorNotes: (draft.facilitatorNotes ?? []).map(fill),
      mitre: draft.mitre ?? [],
      decision,
    };
  });

  return normalizeSimulation({
    schemaVersion: SIM_SCHEMA_VERSION,
    id: `lib-${hashString(seed)}`,
    source: "library",
    title: `${scenario.title} at ${organization}`,
    organization,
    industry: industryKey,
    organizationSize: clean(input.organizationSize),
    scenarioType,
    maturityLevel,
    durationMinutes,
    briefing: fill(scenario.briefing),
    groundRules: [
      "This is a no-fault exercise. We are testing the plan, not the people.",
      "Respond as you would on a real day, with the tools and authority you actually have.",
      "Some information reaches only certain roles. If you receive something, decide who needs to know.",
      "If the answer is \"I don't know who owns that\" — say so. That is exactly what we are here to find.",
    ],
    roles,
    phases: PHASES,
    injects,
  });
}

function buildRoles({ small, industry, knownRoles }) {
  const ids = small ? ["ic", "it", "ops", "comms"] : ["ic", "it", "exec", "comms", "legal", "ops"];
  const aliasMap = small ? { exec: "ic", legal: "comms" } : {};
  const known = Array.isArray(knownRoles) ? knownRoles.map(clean).filter(Boolean).slice(0, 20) : [];
  const used = new Set();

  const roles = ids.map((id) => {
    let title = id === "ops" ? industry.ops : DEFAULT_ROLES[id].title;
    if (small && id === "ic") {
      title = "Owner / Incident Lead";
    }
    if (small && id === "comms") {
      title = "Communications & Compliance Lead";
    }
    // Prefer the organization's own role names when an IRP or org structure supplied them.
    const match = known.find((role) => !used.has(role) && ROLE_KEYWORDS[id].test(role));
    if (match) {
      used.add(match);
      title = match.slice(0, 80);
    }
    return { id, title, focus: DEFAULT_ROLES[id].focus };
  });

  return { roles, alias: (id) => aliasMap[id] ?? id };
}

function parseDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const textValue = String(value ?? "");
  if (/2\s*hour/i.test(textValue)) {
    return 120;
  }
  const minutes = Number.parseInt(textValue, 10);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
}

function seededShuffle(items, seedText) {
  const result = [...items];
  let seed = Number.parseInt(hashString(seedText), 36) || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swap = seed % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function clean(value) {
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}
