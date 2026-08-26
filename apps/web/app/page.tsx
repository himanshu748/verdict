import { ArrowRight, ArrowUpRight, GithubLogo, LockKey, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { ExposurePreview } from "@/components/exposure-preview";
import { ThemeToggle } from "@/components/theme-toggle";

const investigationStages = [
  {
    mandate: "Find the trigger",
    title: "Hunter",
    copy: "Build a bounded matrix from approved knobs, run each condition and keep every valid, partial and unresolved record.",
    output: "Reproducer or honest partial",
  },
  {
    mandate: "Localize the change",
    title: "Surgeon",
    copy: "Start from a static suspect range, then replay the reproducer across buildable history when live execution is available.",
    output: "Suspect range or runtime boundary",
  },
  {
    mandate: "Keep it fixed",
    title: "Insurance",
    copy: "Turn the reproducer into a regression plan and prepare an exact publication manifest for maintainer approval.",
    output: "Regression plan and gated handoff",
  },
];

const proofLayers = [
  {
    label: "Input",
    title: "GitHub issue",
    copy: "Treat the report and repository as untrusted sources until the evidence agrees.",
  },
  {
    label: "Experiment",
    title: "Condition matrix",
    copy: "Search only the knobs, commands and run budget approved for the case.",
  },
  {
    label: "Evidence",
    title: "Run records",
    copy: "Keep the command, environment, outcome and unresolved runs in one record.",
  },
  {
    label: "Decision",
    title: "Reviewable verdict",
    copy: "Promote only the claims supported by the records, then hand control back to you.",
  },
];

function BrandMark() {
  return (
    <svg aria-hidden="true" className="brand-mark" viewBox="0 0 28 28">
      <rect height="22" width="22" x="3" y="3" />
      <path d="M8 14.5 12 19l8-10" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <nav aria-label="Primary" className="site-nav">
          <a className="brand" href="#top" aria-label="Verdict home">
            <BrandMark />
            <span>Verdict</span>
          </a>
          <div className="nav-links">
            <a href="#contract">Contract</a>
            <a href="#method">Method</a>
            <a href="#evidence">Evidence</a>
          </div>
          <div className="site-actions">
            <ThemeToggle />
            <a
              className="github-link"
              href="https://github.com/himanshu748/verdict"
              rel="noreferrer"
              target="_blank"
            >
              <GithubLogo aria-hidden="true" size={18} weight="regular" />
              <span>GitHub</span>
            </a>
          </div>
        </nav>
      </header>

      <main id="main-content">
        <section className="hero" id="top">
          <div className="hero-copy">
            <h1>
              <span>Bugs are innocent </span>
              <span>until reproduced.</span>
            </h1>
            <p>Give Verdict a flaky GitHub issue. Get reproducible conditions, a commit-level suspect range and a regression plan you can review.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="/case/demo">Inspect issue #417</a>
              <a className="button button-secondary" href="#evidence">See proof chain</a>
            </div>
            <dl className="hero-facts" aria-label="Verdict product facts">
              <div><dt>Input</dt><dd>GitHub issue</dd></div>
              <div><dt>Output</dt><dd>Evidence packet</dd></div>
              <div><dt>Default</dt><dd>Read-only</dd></div>
            </dl>
          </div>
          <div className="hero-product" id="product">
            <ExposurePreview />
          </div>
        </section>

        <section className="runtime-section" id="contract">
          <div className="runtime-copy">
            <h2>Every conclusion leaves a paper trail.</h2>
            <p>Verdict separates exploration from proof. See what was tried, what happened and what remains unknown.</p>
            <p className="runtime-note">
              <strong>Live demo contract</strong>
              The hosted issue workspace labels generated fixture data clearly. It never presents a simulated result as a real run.
            </p>
          </div>
          <ol className="runtime-flow" aria-label="Verdict evidence contract">
            {proofLayers.map((layer, index) => (
              <li key={layer.title}>
                <div>
                  <span>{layer.label}</span>
                  <strong>{layer.title}</strong>
                </div>
                <p>{layer.copy}</p>
                {index < proofLayers.length - 1 ? (
                  <ArrowRight aria-hidden="true" size={20} weight="regular" />
                ) : (
                  <ShieldCheck aria-hidden="true" size={20} weight="regular" />
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="evidence-section" id="evidence">
          <div className="evidence-intro">
            <h2>A bug report is not evidence.</h2>
            <p>Verdict records the command, environment and every valid run before it promotes a condition from possible to reproduced.</p>
          </div>
          <div className="evidence-paper" aria-label="Example verdict record">
            <div className="paper-heading">
              <span>Verdict record</span>
              <span>Simulated fixture</span>
            </div>
            <dl>
              <div><dt>Outcome</dt><dd>SIMULATED_REPRODUCTION_PINNED</dd></div>
              <div><dt>Observed</dt><dd>10 / 10 generated records</dd></div>
              <div><dt>Condition</dt><dd><code>750 ms budget / no response</code></dd></div>
              <div><dt>Evidence</dt><dd>Schema-valid conceptual fixture</dd></div>
            </dl>
          </div>
        </section>

        <section className="method-section" id="method">
          <div className="method-heading">
            <h2>One issue. Three agents. No leap of faith.</h2>
            <p>Each act earns a narrower claim. The maintainer controls the only public write.</p>
          </div>
          <ol className="method-list">
            {investigationStages.map((stage) => (
              <li key={stage.title}>
                <div className="method-title">
                  <span>{stage.mandate}</span>
                  <h3>{stage.title}</h3>
                </div>
                <div>
                  <p>{stage.copy}</p>
                  <span className="method-output">Output: {stage.output}</span>
                </div>
                <ArrowUpRight aria-hidden="true" size={20} weight="regular" />
              </li>
            ))}
          </ol>
        </section>

        <section className="approval-section">
          <div className="approval-copy">
            <ShieldCheck aria-hidden="true" size={32} weight="regular" />
            <h2>No patch crosses the trust boundary unseen.</h2>
            <p>Verdict stays read-only until you review the repository, workflow, ref and exact files. Denial preserves every finding.</p>
          </div>
          <div className="approval-manifest" aria-label="Publication manifest preview">
            <div className="manifest-title">
              <LockKey aria-hidden="true" size={18} weight="regular" />
              Review the public write
            </div>
            <dl>
              <div><dt>Repository</dt><dd>truefoundry/trueforge</dd></div>
              <div><dt>Proposed action</dt><dd>Exact workflow dispatch, disabled in demo</dd></div>
              <div><dt>Files</dt><dd>Proposed test, VERDICT.md, verdict.json</dd></div>
              <div><dt>Default</dt><dd>Stay read-only</dd></div>
            </dl>
          </div>
        </section>

        <section className="closing-section">
          <h2>Bring us the bug that only happens sometimes.</h2>
          <a className="button button-primary" href="/case/demo">
            Inspect issue #417
          </a>
        </section>
      </main>

      <footer className="site-footer">
        <span>Verdict</span>
        <span>Evidence first. Human approved.</span>
      </footer>
    </>
  );
}
