import {
  ArrowRight,
  ArrowUpRight,
  CheckSquare,
  ClipboardText,
  Crosshair,
  Article,
  FileMagnifyingGlass,
  GitCommit,
  Graph,
  GithubLogo,
  ListChecks,
  LockKey,
  ShieldCheck,
  Timer,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import { ExposurePreview } from "@/components/exposure-preview";
import { Reveal } from "@/components/reveal";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./page.module.css";

const proofChain = [
  {
    icon: GithubLogo,
    label: "You give it",
    value: "An issue and a test command",
  },
  {
    icon: Crosshair,
    label: "It varies",
    value: "Timeouts, delays, upstream behaviour",
  },
  {
    icon: ClipboardText,
    label: "It records",
    value: "Every run, pass or fail",
  },
  {
    icon: ShieldCheck,
    label: "You get",
    value: "The condition that reproduces it",
  },
];

const investigationActs = [
  {
    className: styles.actHunter,
    copy: "Runs your command across every condition you approved and counts how many attempts reproduced the bug. Conditions that half worked stay on the board as partial.",
    icon: Crosshair,
    mandate: "Make it fail on demand",
    output: "A condition that reproduces, or an honest miss",
    title: "Hunter",
  },
  {
    className: styles.actSurgeon,
    copy: "Takes the condition that reproduced and narrows it to the commits that could have caused it, replaying the same command across history where the code still builds.",
    icon: GitCommit,
    mandate: "Find what caused it",
    output: "A commit range, with its limits stated",
    title: "Surgeon",
  },
  {
    className: styles.actInsurance,
    copy: "Writes a regression test that fails on the condition you found, and prepares the pull request without opening it until you say so.",
    icon: ShieldCheck,
    mandate: "Stop it coming back",
    output: "A regression test, held for your approval",
    title: "Insurance",
  },
];

const workspaceStats = [
  ["12", "conditions in the approved search space"],
  ["10", "records generated per condition"],
  ["4", "read-only GitHub tools the agent may call"],
  ["1", "approval gate before any public write"],
];

const capabilities = [
  {
    icon: ListChecks,
    title: "A bounded search space",
    copy: "You define the knobs and the budget. The agent cannot widen its own experiment, so a run that finds nothing costs what you agreed to spend.",
  },
  {
    icon: Article,
    title: "Records, not summaries",
    copy: "Every accepted observation carries its command, environment, exit code and commit. The conclusion is derived from those records rather than asserted alongside them.",
  },
  {
    icon: Timer,
    title: "Honest partial results",
    copy: "Partial and unresolved conditions stay on the board. A search that half worked reports as a search that half worked.",
  },
  {
    icon: Graph,
    title: "Deterministic reducers",
    copy: "The same records always produce the same verdict. The reducers live in a shared package and are covered by the test suite.",
  },
  {
    icon: ShieldCheck,
    title: "An approval boundary",
    copy: "The trusted host validates the exact repository, workflow and ref before a dispatch is offered. The default is to stay read-only.",
  },
  {
    icon: FileMagnifyingGlass,
    title: "Portable evidence",
    copy: "Each case exports a readable report and a machine-readable bundle, so the trail survives outside the interface.",
  },
];

const faq = [
  [
    "Is this an autofix bot?",
    "No. Verdict stops at a reviewable claim. It proposes a regression test and a publication manifest, and a maintainer decides whether anything is written.",
  ],
  [
    "What if the bug will not reproduce?",
    "That is a result, and it is reported as one. The matrix keeps not-reproduced, partial and unresolved conditions visible instead of collapsing them into a single confident answer.",
  ],
  [
    "Why does the demo say conceptual fixture?",
    "Because the hosted case has not been executed against a live sandbox. Labelling generated data as generated is the same discipline the product applies to its own findings.",
  ],
  [
    "What does it need from my repository?",
    "A GitHub issue, a maintainer-approved command, the condition knobs worth trying and a run budget. Repository access stays on four read tools until you approve a dispatch.",
  ],
];

export default function HomePage() {
  return (
    <div className={styles.page}>
      <a className="skip-link" href="#main-content">Skip to content</a>

      <header className={styles.header}>
        <nav aria-label="Primary" className={styles.nav}>
          <a className={styles.brand} href="#top" aria-label="Verdict home">
            <CheckSquare aria-hidden="true" size={25} weight="regular" />
            <span>Verdict</span>
          </a>

          <div className={styles.navLinks}>
            <a href="#product">Product</a>
            <a href="#method">Method</a>
            <a href="#safety">Safety</a>
          </div>

          <div className={styles.navActions}>
            <ThemeToggle />
            <a
              className={styles.sourceLink}
              href="https://github.com/himanshu748/verdict"
              rel="noreferrer"
              target="_blank"
            >
              <GithubLogo aria-hidden="true" size={18} weight="regular" />
              <span>Source</span>
            </a>
          </div>
        </nav>
      </header>

      <Reveal />

      <main id="main-content">
        <section className={styles.hero} id="top">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Reproduction agent for flaky bugs</p>
            <h1>
              <span>Find the exact</span>
              <span>condition that</span>
              <span>makes it fail.</span>
            </h1>
            <p className={styles.heroLede}>
              Some bugs only show up sometimes, so nobody can prove they are
              fixed. Verdict runs your test command again and again under
              conditions you approve, a tighter timeout, a slower upstream, no
              response at all, until it finds the combination that breaks it.
            </p>
            <p className={styles.heroLede}>
              You get back the exact command, how often it failed, the commit
              range it points at and a regression test to stop it returning.
              Nothing is written to your repository without your approval.
            </p>
            <div className={styles.heroActions}>
              <a className={`${styles.button} ${styles.buttonPrimary}`} href="/case/demo">
                Open case #417
                <ArrowRight aria-hidden="true" size={18} weight="bold" />
              </a>
              <a className={`${styles.button} ${styles.buttonSecondary}`} href="#method">
                See the method
              </a>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <div className={styles.matrixPanel}>
              <ExposurePreview />
            </div>
          </div>
        </section>

        <section aria-label="Verdict proof chain" className={styles.proofRail}>
          {proofChain.map(({ icon: Icon, label, value }, index) => (
            <div className={styles.proofItem} key={label}>
              <Icon aria-hidden="true" size={19} weight="regular" />
              <div>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
              {index < proofChain.length - 1 ? (
                <ArrowRight aria-hidden="true" className={styles.proofArrow} size={17} />
              ) : null}
            </div>
          ))}
        </section>

        <section className={styles.productSection} id="workspace">
          <div className={styles.sectionHeading} data-reveal>
            <h2>Twelve conditions. One that reproduces.</h2>
            <p>
              Each cell is one setting of the knobs you approved, run ten times.
              The count in the corner is how many of those ten reproduced the
              bug. Select a cell and you see the command that produced it, the
              exit code and the commit it ran against.
            </p>
          </div>

          <figure className={styles.productFrame} data-reveal>
            <div className={styles.frameBar}>
              <span className={styles.frameDots} aria-hidden="true" />
              <span className={styles.frameUrl}>verdict / case / TF-417</span>
              <a className={styles.frameLink} href="/case/demo">
                Open it
                <ArrowUpRight aria-hidden="true" size={14} />
              </a>
            </div>
            <Image
              alt="The Verdict case workspace showing a twelve condition matrix and the evidence record for the pinned condition."
              className={`${styles.productShot} ${styles.productShotDark}`}
              height={900}
              sizes="(max-width: 1023px) 100vw, 1100px"
              src="/workspace-dark.jpg"
              width={1440}
            />
            <Image
              alt=""
              className={`${styles.productShot} ${styles.productShotLight}`}
              height={900}
              sizes="(max-width: 1023px) 100vw, 1100px"
              src="/workspace-light.jpg"
              width={1440}
            />
          </figure>

          <dl className={styles.statRow} data-reveal>
            {workspaceStats.map(([figure, note]) => (
              <div key={note}>
                <dt>{figure}</dt>
                <dd>{note}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.dossierSection} id="evidence">
          <div className={styles.dossierCopy}>
            <FileMagnifyingGlass aria-hidden="true" size={34} weight="regular" />
            <h2>Every claim shows its receipt.</h2>
            <p>
              A result you cannot check is a rumour. Verdict keeps the command,
              the environment and every run record attached to the claim they
              produced, and it marks what it could not establish rather than
              quietly leaving it out.
            </p>
            <a href="/case/demo">
              Inspect the full evidence trail
              <ArrowUpRight aria-hidden="true" size={18} />
            </a>
          </div>

          <article data-reveal className={styles.dossier} aria-label="Conceptual Verdict record">
            <header>
              <div>
                <span>Verdict record</span>
                <strong>TrueForge issue #417</strong>
              </div>
              <span className={styles.fixtureLabel}>Conceptual fixture, not run</span>
            </header>
            <dl>
              <div>
                <dt>Outcome</dt>
                <dd>SIMULATED_REPRODUCTION_PINNED</dd>
              </div>
              <div>
                <dt>Observed</dt>
                <dd>10 of 10 generated records</dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd><code>750 ms budget / no response</code></dd>
              </div>
              <div>
                <dt>Runtime proof</dt>
                <dd>Not established</dd>
              </div>
            </dl>
            <footer>
              <span>Schema-valid conceptual data</span>
              <span>Public write disabled</span>
            </footer>
          </article>
        </section>

        <section className={styles.methodSection} id="method">
          <div className={styles.sectionHeading} data-reveal>
            <h2>Find it, then narrow it, then keep it fixed.</h2>
            <p>Three stages, each one allowed to claim less than the evidence it collected.</p>
          </div>
          <div className={styles.actGrid} data-reveal>
            {investigationActs.map(({ className, copy, icon: Icon, mandate, output, title }) => (
              <article className={`${styles.act} ${className}`} key={title}>
                <div className={styles.actTopline}>
                  <Icon aria-hidden="true" size={23} weight="regular" />
                  <span>{mandate}</span>
                </div>
                <h3>{title}</h3>
                <p>{copy}</p>
                <span className={styles.actOutput}>{output}</span>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.capabilitySection} id="product">
          <div className={styles.sectionHeading} data-reveal>
            <h2>What you get, even when it does not reproduce.</h2>
            <p>A run that finds nothing still costs what you agreed and still tells you what it tried.</p>
          </div>
          <div className={styles.capabilityGrid} data-reveal>
            {capabilities.map(({ copy, icon: Icon, title }) => (
              <article className={styles.capability} key={title}>
                <Icon aria-hidden="true" size={24} weight="regular" />
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.safetySection} id="safety">
          <div className={styles.safetyCopy}>
            <LockKey aria-hidden="true" size={34} weight="regular" />
            <h2>It cannot touch your repo without you.</h2>
            <p>
              Until you approve a dispatch, Verdict holds four read-only GitHub
              tools and nothing else. When it does propose a write, you see the
              exact repository, workflow and files first. The default is to stay
              read-only.
            </p>
          </div>

          <div className={styles.approvalPanel} aria-label="Approval boundary preview">
            <div className={styles.approvalHeading}>
              <ShieldCheck aria-hidden="true" size={20} weight="regular" />
              <div>
                <span>Approval boundary</span>
                <strong>Exact workflow dispatch</strong>
              </div>
            </div>
            <dl>
              <div><dt>Repository</dt><dd>truefoundry/trueforge</dd></div>
              <div><dt>Workflow</dt><dd>Trusted host policy target</dd></div>
              <div><dt>Proposed files</dt><dd>Regression test, VERDICT.md, verdict.json</dd></div>
              <div><dt>Default</dt><dd>Stay read-only</dd></div>
            </dl>
            <span className={styles.disabledAction}>Publication disabled in demo</span>
          </div>
        </section>

        <section className={styles.faqSection}>
          <div className={styles.sectionHeading} data-reveal>
            <h2>Straight answers.</h2>
          </div>
          <div className={styles.faqGrid} data-reveal>
            {faq.map(([question, answer]) => (
              <div className={styles.faqItem} key={question}>
                <h3>{question}</h3>
                <p>{answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.closingSection}>
          <div>
            <span>One flaky issue is enough.</span>
            <h2>Bring the bug nobody can reproduce.</h2>
          </div>
          <a className={`${styles.button} ${styles.buttonPrimary}`} href="/case/demo">
            Open case #417
            <ArrowRight aria-hidden="true" size={18} weight="bold" />
          </a>
        </section>
      </main>

      <footer className={styles.footer}>
        <a className={styles.brand} href="#top" aria-label="Verdict home">
          <CheckSquare aria-hidden="true" size={22} weight="regular" />
          <span>Verdict</span>
        </a>
        <span>Evidence first. Human approved.</span>
        <a href="https://github.com/himanshu748/verdict" rel="noreferrer" target="_blank">
          GitHub
          <ArrowUpRight aria-hidden="true" size={15} />
        </a>
      </footer>
    </div>
  );
}
