// End-to-end check of the core product loop in real browsers:
// facilitator generates an exercise, opens a team room, two participants join on their own
// devices, the team votes and commits decisions, and everyone gets the after-action report.
//
// Needs the static site (APP_URL) and the backend (API_URL) running. See README "Testing".

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  try {
    return require("playwright");
  } catch {
    return require("playwright-core");
  }
})();

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const API_URL = process.env.API_URL || "http://localhost:4100";
const SHOTS = process.env.E2E_SCREENSHOT_DIR || "";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function shot(page, name) {
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const problems = [];
const watch = (page, label) => {
  page.on("pageerror", (error) => problems.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) {
      problems.push(`${label} console: ${message.text().slice(0, 200)}`);
    }
  });
};

try {
  // --- facilitator account (API) and exercise generation (UI) ---------------
  const email = `e2e-${Date.now()}@example.com`;
  const post = async (path, body) => (await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  const { loginCode } = await post("/api/auth/request-code", { email });
  assert(loginCode, "backend must run with screen login codes enabled for e2e");
  const { token } = await post("/api/auth/password-register", { email, code: loginCode, password: "e2e-password-123" });
  assert(token, "facilitator registration");

  const facilitatorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await facilitatorContext.addInitScript((value) => window.localStorage.setItem("tabletopforge.sessionToken", value), token);
  const facilitator = await facilitatorContext.newPage();
  watch(facilitator, "facilitator");

  await facilitator.goto(`${APP_URL}/generate/`, { waitUntil: "networkidle" });
  await facilitator.getByPlaceholder(/Acme Family Clinic/).fill("Harbor Family Clinic");
  await facilitator.getByRole("button", { name: /Generate And Start Session/ }).click();
  await facilitator.waitForURL(/session/, { timeout: 60_000 });
  await facilitator.getByRole("heading", { name: "Run this exercise live" }).waitFor();
  await shot(facilitator, "1-launcher");

  await facilitator.getByPlaceholder(/Your name/).fill("Dana");
  await facilitator.getByRole("button", { name: /Open a team room/ }).click();
  await facilitator.waitForURL(/room/);
  const codeElement = facilitator.locator("[aria-label^='Room code']");
  await codeElement.waitFor();
  const joinCode = (await codeElement.innerText()).trim();
  assert(/^[A-Z0-9]{6}$/.test(joinCode), `join code shown (${joinCode})`);

  // --- two participants join on their own devices ---------------------------
  async function join(name, roleTitle, viewport) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    watch(page, name);
    await page.goto(`${APP_URL}/join/?code=${joinCode}`, { waitUntil: "networkidle" });
    await page.getByLabel("Your name").fill(name);
    await page.getByText(roleTitle, { exact: true }).click();
    await page.getByRole("button", { name: "Take my seat" }).click();
    await page.waitForURL(/room/);
    await page.getByText(/Waiting for Dana/).waitFor();
    return page;
  }
  const ivy = await join("Ivy", "IT / Security Lead", { width: 1280, height: 800 });
  const cam = await join("Cam", "Communications Lead", { width: 390, height: 844 });

  await facilitator.getByText("Ivy").first().waitFor({ timeout: 10_000 });
  await facilitator.getByText("Cam").first().waitFor({ timeout: 10_000 });
  await shot(facilitator, "2-lobby-facilitator");

  // --- run the first decision ------------------------------------------------
  await facilitator.getByRole("button", { name: /Start the exercise/ }).click();
  await ivy.getByText("Decision required").waitFor({ timeout: 10_000 });
  await cam.getByText("Decision required").waitFor({ timeout: 10_000 });

  // Phishing scenario: the first inject goes only to IT.
  assert(await ivy.getByText(/Only your role received this/).count(), "IT sees the private inject");
  assert(await cam.getByText(/Ask them to brief the team/).count(), "Comms sees that the inject is restricted");
  assert(!(await cam.getByText(/another country/).count()), "restricted content is not shown to Comms");
  await shot(cam, "3-participant-mobile-restricted");

  await cam.getByRole("radio").nth(1).click();
  await cam.getByRole("button", { name: "Submit my vote" }).click();
  await cam.getByText(/Your vote is in/).waitFor();

  await ivy.getByRole("radio").nth(0).click();
  await ivy.getByPlaceholder(/Why\?/).fill("Finance mailbox, so treat it as an incident.");
  await shot(ivy, "4-decision-owner");
  await ivy.getByRole("button", { name: "Commit decision" }).click();
  await ivy.getByText("What happened next").waitFor();
  await cam.getByText("What happened next").waitFor({ timeout: 10_000 });
  await facilitator.getByText("What happened next").waitFor({ timeout: 10_000 });
  await facilitator.getByText(/Committed by Ivy/).waitFor();

  // --- facilitator drives the rest ------------------------------------------
  await facilitator.getByPlaceholder(/Nobody knows who can approve/).fill("No documented bank fraud-desk contact.");
  await facilitator.getByRole("button", { name: "Add note" }).click();
  await cam.getByText("No documented bank fraud-desk contact.").waitFor({ timeout: 10_000 });

  for (let step = 0; step < 40; step += 1) {
    const end = facilitator.getByRole("button", { name: /End exercise and build the report/ });
    if (await end.count()) {
      await end.click();
      break;
    }
    const next = facilitator.getByRole("button", { name: /Next development/ });
    if (await next.isEnabled()) {
      await next.click();
    } else {
      await facilitator.locator("article").first().getByRole("radio").nth(step % 3).click();
      await facilitator.getByRole("button", { name: "Override with selected" }).click();
    }
    await facilitator.waitForTimeout(250);
    if (step === 3) {
      await shot(facilitator, "5-facilitator-midgame");
    }
  }

  await facilitator.getByText(/Readiness:/).waitFor({ timeout: 10_000 });
  await cam.getByText(/Readiness:/).waitFor({ timeout: 15_000 });
  assert(await facilitator.getByText("No documented bank fraud-desk contact.").count(), "participant-raised gap appears in the report");
  assert(await facilitator.getByText("Ivy").count(), "participants are listed in the report");
  await shot(facilitator, "6-report");
  await shot(cam, "7-report-mobile");

  // The exercise and its report are in the facilitator's account history.
  await facilitator.goto(`${APP_URL}/account/`, { waitUntil: "networkidle" });
  await facilitator.getByText(/Readiness \d+\/100/).waitFor({ timeout: 10_000 });
  await shot(facilitator, "8-account");

  assert(problems.length === 0, `no browser errors:\n${problems.join("\n")}`);
  console.log("E2E passed: generate → team room → role-restricted injects → vote → commit → report");
} finally {
  await browser.close();
}
